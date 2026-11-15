"""
Automated Air Quality Purification & Hazardous Gas Monitoring System
Backend: main.py
Principal Architecture: Modular FastAPI service with REST + WebSocket real-time streaming.
"""

import asyncio
import random
from datetime import datetime
from enum import Enum
from typing import List, Literal, Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# ------------------------------------------------------------------------------------
# APP INITIALIZATION
# ------------------------------------------------------------------------------------

app = FastAPI(
    title="Automated Air Quality Purification & Hazardous Gas Monitoring System",
    description="Enterprise backend for real-time air quality sensing, hazard detection, and relay control.",
    version="1.0.0",
)

# CORS: allow local React web dashboard and React Native / mobile clients.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:19006",   # Expo / React Native web dev server
        "http://localhost:8081",   # React Native Metro bundler
        "*",                        # Fallback for LAN-hosted mobile builds during FYP demo
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ------------------------------------------------------------------------------------
# ENUMS & CONSTANTS
# ------------------------------------------------------------------------------------

class DeviceName(str, Enum):
    PURIFIER = "purifier"
    DEHUMIDIFIER = "dehumidifier"
    BUZZER = "buzzer"


# Sensor safety thresholds. Centralized so the auto-control engine and the
# frontend (via /api/live-data) reference a single source of truth.
THRESHOLDS = {
    "aqi_safe_limit": 50,
    "temp_max_celsius": 30.0,
    "humidity_max_percent": 60.0,
}

HISTORY_LIMIT = 10          # Number of historical readings retained for graphing.
BROADCAST_INTERVAL_SEC = 2  # WebSocket push frequency.


# ------------------------------------------------------------------------------------
# STATE MANAGER
# ------------------------------------------------------------------------------------

class SystemStateManager:
    """
    Single source of truth for relay states, hazard flags, and manual-override
    tracking. Kept as an in-memory singleton; swap with a persistent store
    (Redis / DB) for a multi-process deployment.
    """

    def __init__(self):
        self.purifier_status: bool = True
        self.dehumidifier_status: bool = False
        self.buzzer_status: bool = False
        self.methane_gas: bool = False

        # When a device is manually overridden by a user, the auto-control
        # engine will not silently flip it back until the override is cleared.
        self.manual_override = {
            DeviceName.PURIFIER: False,
            DeviceName.DEHUMIDIFIER: False,
            DeviceName.BUZZER: False,
        }

        self.history: List[dict] = []

    def set_device(self, device: DeviceName, status: bool, override: bool = True):
        if device == DeviceName.PURIFIER:
            self.purifier_status = status
        elif device == DeviceName.DEHUMIDIFIER:
            self.dehumidifier_status = status
        elif device == DeviceName.BUZZER:
            self.buzzer_status = status

        if override:
            self.manual_override[device] = True

    def clear_override(self, device: DeviceName):
        self.manual_override[device] = False

    def toggle_methane(self) -> bool:
        self.methane_gas = not self.methane_gas
        return self.methane_gas

    def apply_auto_control(self, aqi: int, temperature: float, humidity: float):
        """
        Auto-control engine: adjusts relays based on sensor thresholds unless
        a device has an active manual override. Also auto-engages the buzzer
        on a confirmed methane hazard regardless of override (safety-critical).
        """
        if not self.manual_override[DeviceName.PURIFIER]:
            self.purifier_status = aqi > THRESHOLDS["aqi_safe_limit"]

        if not self.manual_override[DeviceName.DEHUMIDIFIER]:
            self.dehumidifier_status = humidity > THRESHOLDS["humidity_max_percent"]

        # Safety-critical override: methane leak always triggers buzzer.
        if self.methane_gas:
            self.buzzer_status = True
        elif not self.manual_override[DeviceName.BUZZER]:
            self.buzzer_status = False

    def record_history(self, reading: dict):
        self.history.append(reading)
        if len(self.history) > HISTORY_LIMIT:
            self.history.pop(0)

    def snapshot(self) -> dict:
        return {
            "purifier_status": self.purifier_status,
            "dehumidifier_status": self.dehumidifier_status,
            "buzzer_status": self.buzzer_status,
            "methane_gas": self.methane_gas,
        }


state = SystemStateManager()


# ------------------------------------------------------------------------------------
# PYDANTIC SCHEMAS
# ------------------------------------------------------------------------------------

class ControlRequest(BaseModel):
    device: Literal["purifier", "dehumidifier", "buzzer"]
    status: bool
    # If True (default), this call sets a manual override that the auto-control
    # engine will respect until cleared via override=False.
    override: bool = True


class ControlResponse(BaseModel):
    success: bool
    device: str
    status: bool
    manual_override: bool
    state: dict


class LiveDataResponse(BaseModel):
    timestamp: str
    aqi: int
    pm25: float
    pm10: float
    temperature: float
    humidity: float
    methane_gas: bool
    purifier_status: bool
    dehumidifier_status: bool
    buzzer_status: bool
    thresholds: dict


class GasTriggerResponse(BaseModel):
    success: bool
    methane_gas: bool
    buzzer_status: bool


# ------------------------------------------------------------------------------------
# SENSOR SIMULATION ENGINE
# ------------------------------------------------------------------------------------

def generate_sensor_reading() -> dict:
    """
    Simulates live hardware sensor output with realistic, bounded fluctuation.
    Replace this function's body with real GPIO/I2C/UART sensor reads when
    hardware is integrated (e.g., MQ-4 for methane, DHT22 for temp/humidity,
    PMS5003 for particulates).
    """
    aqi = random.randint(140, 160)
    pm25 = round(random.uniform(50.0, 60.0), 1)
    pm10 = round(random.uniform(85.0, 95.0), 1)
    temperature = round(random.uniform(23.0, 26.0), 1)
    humidity = round(random.uniform(60.0, 68.0), 1)

    # Auto-control engine reacts to the freshly generated readings.
    state.apply_auto_control(aqi=aqi, temperature=temperature, humidity=humidity)

    reading = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "aqi": aqi,
        "pm25": pm25,
        "pm10": pm10,
        "temperature": temperature,
        "humidity": humidity,
        **state.snapshot(),
        "thresholds": THRESHOLDS,
    }

    state.record_history(reading)
    return reading


# ------------------------------------------------------------------------------------
# REST ENDPOINTS
# ------------------------------------------------------------------------------------

@app.get("/", tags=["Health"])
def root():
    return {"status": "online", "system": "Air Quality & Gas Monitoring API", "version": "1.0.0"}


@app.get("/api/live-data", response_model=LiveDataResponse, tags=["Telemetry"])
def get_live_data():
    """Returns a single structured sensor reading, applying auto-control logic."""
    return generate_sensor_reading()


@app.get("/api/history", tags=["Telemetry"])
def get_history():
    """
    Returns the last HISTORY_LIMIT readings as a time-series array, suitable
    for feeding directly into frontend charting libraries (Recharts, Chart.js).
    """
    if not state.history:
        # Seed history on first call so graphs aren't empty on initial load.
        for _ in range(HISTORY_LIMIT):
            generate_sensor_reading()

    return {
        "count": len(state.history),
        "readings": state.history,
    }


@app.post("/api/control", response_model=ControlResponse, tags=["Control"])
def control_device(request: ControlRequest):
    """
    Sets a relay's state manually. By default this registers a manual
    override so the auto-control engine will not immediately revert it.
    Pass override=False to perform a transient/auto-aligned change.
    """
    device = DeviceName(request.device)
    state.set_device(device, request.status, override=request.override)

    return ControlResponse(
        success=True,
        device=device.value,
        status=request.status,
        manual_override=state.manual_override[device],
        state=state.snapshot(),
    )


@app.post("/api/control/{device}/clear-override", tags=["Control"])
def clear_device_override(device: Literal["purifier", "dehumidifier", "buzzer"]):
    """Releases manual override, returning the device to auto-control logic."""
    dev = DeviceName(device)
    state.clear_override(dev)
    return {"success": True, "device": dev.value, "manual_override": False}


@app.post("/api/trigger-gas", response_model=GasTriggerResponse, tags=["Emergency"])
def trigger_gas():
    """
    Testing endpoint: toggles the methane hazard flag to validate emergency
    alert pipelines (buzzer activation, frontend alarm banners, push alerts).
    """
    methane_status = state.toggle_methane()

    # Re-run auto-control immediately so buzzer state reflects the new hazard flag.
    state.apply_auto_control(
        aqi=random.randint(140, 160),
        temperature=round(random.uniform(23.0, 26.0), 1),
        humidity=round(random.uniform(60.0, 68.0), 1),
    )

    return GasTriggerResponse(
        success=True,
        methane_gas=methane_status,
        buzzer_status=state.buzzer_status,
    )


# ------------------------------------------------------------------------------------
# WEBSOCKET: REAL-TIME LIVE DATA STREAM
# ------------------------------------------------------------------------------------

class ConnectionManager:
    """Tracks active WebSocket clients for broadcast-style real-time updates."""

    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, payload: dict):
        stale_connections = []
        for connection in self.active_connections:
            try:
                await connection.send_json(payload)
            except Exception:
                stale_connections.append(connection)

        for connection in stale_connections:
            self.disconnect(connection)


manager = ConnectionManager()


@app.websocket("/ws/live-data")
async def websocket_live_data(websocket: WebSocket):
    """
    Low-latency push channel. On connect, immediately sends one reading, then
    continues to receive the periodic broadcasts pushed by the background
    sensor-polling task below. Client disconnects are handled gracefully.
    """
    await manager.connect(websocket)
    try:
        await websocket.send_json(generate_sensor_reading())
        while True:
            # Keep the connection alive; this task is receive-only from the
            # client's side (e.g., ping/pong or no-op keepalive messages).
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)


# ------------------------------------------------------------------------------------
# BACKGROUND TASK: PERIODIC SENSOR BROADCAST
# ------------------------------------------------------------------------------------

async def sensor_broadcast_loop():
    """
    Background coroutine that generates a new sensor reading every
    BROADCAST_INTERVAL_SEC and pushes it to all connected WebSocket clients.
    This decouples hardware polling from individual client connections.
    """
    while True:
        await asyncio.sleep(BROADCAST_INTERVAL_SEC)
        if manager.active_connections:
            reading = generate_sensor_reading()
            await manager.broadcast(reading)


@app.on_event("startup")
async def start_background_tasks():
    asyncio.create_task(sensor_broadcast_loop())


# ------------------------------------------------------------------------------------
# ENTRYPOINT (for local dev: python main.py)
# ------------------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)