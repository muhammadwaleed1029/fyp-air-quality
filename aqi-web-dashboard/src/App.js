import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import {
  Wind,
  Droplets,
  Thermometer,
  Gauge,
  Power,
  Activity,
  Radio,
  Flame,
  LineChart,
  Volume2,
  VolumeX,
  ShieldAlert,
} from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const API_BASE = process.env.REACT_APP_API_URL || 'http://127.0.0.1:8000';
const POLL_INTERVAL_MS = 3000;
const MAX_HISTORY_POINTS = 15;

const palette = {
  bgDeep: '#0f172a',
  bgCard: '#1e293b',
  border: '#334155',
  borderHover: '#475569',
  cyan: '#22d3ee',
  cyanSoft: 'rgba(34, 211, 238, 0.12)',
  green: '#34d399',
  greenSoft: 'rgba(52, 211, 153, 0.15)',
  red: '#f87171',
  redSoft: 'rgba(248, 113, 113, 0.15)',
  redStrong: '#dc2626',
  yellow: '#fbbf24',
  yellowSoft: 'rgba(251, 191, 36, 0.15)',
  orange: '#fb923c',
  orangeSoft: 'rgba(251, 146, 60, 0.15)',
  purple: '#a78bfa',
  purpleSoft: 'rgba(167, 139, 250, 0.15)',
  pink: '#f472b6',
  textPrimary: '#f1f5f9',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
  gridLine: 'rgba(148, 163, 184, 0.12)',
};

function getAqiStatus(aqi) {
  if (aqi <= 50) {
    return { label: 'Good', color: palette.green, soft: palette.greenSoft };
  }
  if (aqi <= 100) {
    return { label: 'Moderate', color: palette.yellow, soft: palette.yellowSoft };
  }
  if (aqi <= 150) {
    return { label: 'Unhealthy (Sensitive)', color: palette.orange, soft: palette.orangeSoft };
  }
  return { label: 'Unhealthy', color: palette.red, soft: palette.redSoft };
}

function buildChartOptions(titleText) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        position: 'top',
        align: 'end',
        labels: {
          color: palette.textSecondary,
          usePointStyle: true,
          pointStyle: 'circle',
          boxWidth: 8,
          font: { size: 11, family: 'Inter, sans-serif' },
        },
      },
      title: {
        display: true,
        text: titleText,
        color: palette.textPrimary,
        font: { size: 14, weight: '600', family: 'Inter, sans-serif' },
        align: 'start',
        padding: { bottom: 16 },
      },
      tooltip: {
        backgroundColor: '#0f172a',
        titleColor: palette.textPrimary,
        bodyColor: palette.textSecondary,
        borderColor: palette.border,
        borderWidth: 1,
        padding: 10,
        cornerRadius: 10,
      },
    },
    scales: {
      x: {
        grid: { color: palette.gridLine, drawTicks: false },
        ticks: { color: palette.textMuted, font: { size: 10 } },
        border: { color: palette.border },
      },
      y: {
        grid: { color: palette.gridLine, drawTicks: false },
        ticks: { color: palette.textMuted, font: { size: 10 } },
        border: { color: palette.border },
      },
    },
    elements: {
      line: { tension: 0.4, borderWidth: 2.5 },
      point: { radius: 0, hoverRadius: 5, hitRadius: 10 },
    },
  };
}

const styles = {
  page: {
    minHeight: '100vh',
    backgroundColor: palette.bgDeep,
    color: palette.textPrimary,
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    position: 'relative',
  },
  strobeOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'none',
    zIndex: 9999,
    animation: 'strobeFlash 0.6s steps(2, start) infinite',
  },
  header: {
    borderBottom: `1px solid ${palette.border}`,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    backdropFilter: 'blur(8px)',
    position: 'sticky',
    top: 0,
    zIndex: 10,
  },
  headerInner: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '20px 24px',
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '16px',
  },
  title: {
    fontSize: '22px',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    margin: 0,
    color: palette.textPrimary,
  },
  subtitle: {
    fontSize: '13px',
    color: palette.textSecondary,
    marginTop: '4px',
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
  },
  statusBadge: (connected) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '7px 14px',
    borderRadius: '9999px',
    fontSize: '12px',
    fontWeight: 600,
    border: `1px solid ${connected ? 'rgba(52,211,153,0.35)' : 'rgba(248,113,113,0.35)'}`,
    backgroundColor: connected ? palette.greenSoft : palette.redSoft,
    color: connected ? palette.green : palette.red,
  }),
  dot: (connected) => ({
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: connected ? palette.green : palette.red,
    boxShadow: connected ? `0 0 8px 2px ${palette.green}` : 'none',
    animation: connected ? 'glowPulse 1.6s ease-in-out infinite' : 'none',
  }),
  gasButton: (loading) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: '#dc2626',
    color: '#ffffff',
    fontSize: '13px',
    fontWeight: 600,
    padding: '10px 18px',
    borderRadius: '12px',
    border: 'none',
    cursor: loading ? 'default' : 'pointer',
    opacity: loading ? 0.6 : 1,
    boxShadow: '0 8px 20px rgba(220, 38, 38, 0.25)',
    transition: 'all 0.2s ease',
  }),
  main: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '32px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '28px',
    position: 'relative',
    zIndex: 1,
  },
  emergencyBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '16px',
    flexWrap: 'wrap',
    backgroundColor: palette.redStrong,
    border: '2px solid #fca5a5',
    borderRadius: '18px',
    padding: '20px 24px',
    boxShadow: '0 0 40px rgba(220, 38, 38, 0.6)',
    animation: 'bannerPulse 0.9s ease-in-out infinite',
    position: 'relative',
    zIndex: 2,
  },
  emergencyLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  emergencyIconWrap: {
    display: 'flex',
    animation: 'iconPulse 0.7s ease-in-out infinite',
  },
  emergencyTextTitle: {
    fontWeight: 800,
    fontSize: '16px',
    color: '#ffffff',
    margin: 0,
    letterSpacing: '0.01em',
  },
  emergencyTextSub: {
    fontSize: '13px',
    color: '#fee2e2',
    margin: '4px 0 0 0',
    fontWeight: 500,
  },
  silenceButton: (muted) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: muted ? 'rgba(255,255,255,0.15)' : '#ffffff',
    color: muted ? '#ffffff' : palette.redStrong,
    fontSize: '13px',
    fontWeight: 800,
    padding: '12px 20px',
    borderRadius: '12px',
    border: '2px solid #ffffff',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    whiteSpace: 'nowrap',
  }),
  statusBadgeSmall: (connected) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '7px 14px',
    borderRadius: '9999px',
    fontSize: '12px',
    fontWeight: 600,
    border: `1px solid ${connected ? 'rgba(52,211,153,0.35)' : 'rgba(248,113,113,0.35)'}`,
    backgroundColor: connected ? palette.greenSoft : palette.redSoft,
    color: connected ? palette.green : palette.red,
  }),
  aqiCard: (ring) => ({
    backgroundColor: palette.bgCard,
    border: `1px solid ${palette.border}`,
    borderRadius: '24px',
    padding: '32px',
    boxShadow: `0 10px 40px rgba(0,0,0,0.35), 0 0 0 1px ${ring}33`,
    position: 'relative',
    zIndex: 2,
  }),
  aqiInner: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '24px',
  },
  aqiLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
  },
  aqiIconWrap: (soft) => ({
    padding: '18px',
    borderRadius: '20px',
    backgroundColor: soft,
    display: 'flex',
  }),
  aqiValue: {
    fontSize: '48px',
    fontWeight: 800,
    margin: '4px 0 0 0',
    lineHeight: 1,
  },
  aqiLabel: {
    fontSize: '13px',
    color: palette.textSecondary,
    fontWeight: 500,
    margin: 0,
  },
  aqiRight: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '8px',
  },
  statusChip: (color) => ({
    padding: '8px 18px',
    borderRadius: '9999px',
    fontSize: '13px',
    fontWeight: 700,
    color: '#0f172a',
    backgroundColor: color,
  }),
  timestamp: {
    fontSize: '11px',
    color: palette.textMuted,
  },
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '20px',
    position: 'relative',
    zIndex: 2,
  },
  metricCard: {
    backgroundColor: palette.bgCard,
    border: `1px solid ${palette.border}`,
    borderRadius: '18px',
    padding: '20px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
    transition: 'border-color 0.25s ease, transform 0.25s ease',
  },
  metricTop: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '14px',
  },
  metricIconWrap: (soft) => ({
    padding: '10px',
    borderRadius: '14px',
    backgroundColor: soft,
    display: 'flex',
  }),
  metricTarget: {
    fontSize: '11px',
    color: palette.textMuted,
    fontWeight: 500,
  },
  metricLabel: {
    fontSize: '13px',
    color: palette.textSecondary,
    fontWeight: 500,
    margin: 0,
  },
  metricValueRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '4px',
    marginTop: '4px',
  },
  metricValue: {
    fontSize: '26px',
    fontWeight: 700,
    color: palette.textPrimary,
  },
  metricUnit: {
    fontSize: '13px',
    color: palette.textSecondary,
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '16px',
  },
  sectionTitle: {
    fontSize: '16px',
    fontWeight: 700,
    margin: 0,
    color: palette.textPrimary,
  },
  chartsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
    gap: '20px',
    position: 'relative',
    zIndex: 2,
  },
  chartCard: {
    backgroundColor: palette.bgCard,
    border: `1px solid ${palette.border}`,
    borderRadius: '20px',
    padding: '20px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
  },
  chartCanvasWrap: {
    height: '280px',
    position: 'relative',
  },
  relayGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '20px',
    position: 'relative',
    zIndex: 2,
  },
  relayCard: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: palette.bgCard,
    border: `1px solid ${palette.border}`,
    borderRadius: '18px',
    padding: '20px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
  },
  relayLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
  },
  relayIconWrap: (isOn) => ({
    padding: '10px',
    borderRadius: '14px',
    backgroundColor: isOn ? palette.cyanSoft : 'rgba(100,116,139,0.15)',
    display: 'flex',
  }),
  relayName: {
    fontWeight: 600,
    fontSize: '15px',
    color: palette.textPrimary,
    margin: 0,
  },
  relayBadge: (isOn) => ({
    display: 'inline-block',
    marginTop: '6px',
    padding: '3px 10px',
    borderRadius: '9999px',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.03em',
    backgroundColor: isOn ? palette.greenSoft : palette.redSoft,
    color: isOn ? palette.green : palette.red,
  }),
  switchTrack: (isOn, pending) => ({
    position: 'relative',
    width: '54px',
    height: '28px',
    borderRadius: '9999px',
    border: 'none',
    cursor: pending ? 'default' : 'pointer',
    backgroundColor: isOn ? palette.cyan : '#475569',
    transition: 'background-color 0.3s ease',
    opacity: pending ? 0.6 : 1,
  }),
  switchKnob: (isOn) => ({
    position: 'absolute',
    top: '3px',
    left: isOn ? '29px' : '3px',
    width: '22px',
    height: '22px',
    borderRadius: '50%',
    backgroundColor: '#ffffff',
    boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
    transition: 'left 0.3s ease',
  }),
  footer: {
    borderTop: `1px solid ${palette.border}`,
    padding: '24px',
    textAlign: 'center',
    color: palette.textMuted,
    fontSize: '12px',
    position: 'relative',
    zIndex: 2,
  },
};

const MetricCard = React.memo(function MetricCard(props) {
  const Icon = props.icon;
  const { label, value, unit, target, soft, iconColor } = props;

  return (
    <div style={styles.metricCard}>
      <div style={styles.metricTop}>
        <div style={styles.metricIconWrap(soft)}>
          {Icon ? <Icon size={18} color={iconColor} /> : null}
        </div>
        <span style={styles.metricTarget}>{target}</span>
      </div>
      <p style={styles.metricLabel}>{label}</p>
      <div style={styles.metricValueRow}>
        <span style={styles.metricValue}>{value}</span>
        <span style={styles.metricUnit}>{unit}</span>
      </div>
    </div>
  );
});

const RelayControl = React.memo(function RelayControl(props) {
  const { label, isOn, onToggle, pending } = props;

  return (
    <div style={styles.relayCard}>
      <div style={styles.relayLeft}>
        <div style={styles.relayIconWrap(isOn)}>
          <Power size={18} color={isOn ? palette.cyan : palette.textMuted} />
        </div>
        <div>
          <p style={styles.relayName}>{label}</p>
          <span style={styles.relayBadge(isOn)}>{isOn ? 'RUNNING' : 'STOPPED'}</span>
        </div>
      </div>

      <button
        type="button"
        onClick={onToggle}
        disabled={pending}
        style={styles.switchTrack(isOn, pending)}
      >
        <span style={styles.switchKnob(isOn)} />
      </button>
    </div>
  );
});

function App() {
  const [liveData, setLiveData] = useState(null);
  const [connected, setConnected] = useState(false);
  const [relayPending, setRelayPending] = useState({ purifier: false, dehumidifier: false });
  const [gasLoading, setGasLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [sirenMuted, setSirenMuted] = useState(false);
  const [history, setHistory] = useState([]);

  const tickRef = useRef(0);

  // Refs mirroring state that async callbacks need to read WITHOUT becoming
  // a dependency (this is what keeps fetchLiveData's identity stable).
  const sirenMutedRef = useRef(false);
  const methaneActiveRef = useRef(false);
  const liveDataRef = useRef(null);

  // ----------------------------------------------------------------
  // Web Audio siren node registry
  // ----------------------------------------------------------------
  const audioCtxRef = useRef(null);
  const oscillatorRef = useRef(null);
  const gainNodeRef = useRef(null);
  const sweepIntervalRef = useRef(null);
  const sirenActiveRef = useRef(false);
  // Nodes currently fading out, plus the timer that will finally stop them.
  const fadingNodesRef = useRef(null);
  const fadeTimeoutRef = useRef(null);

  const ensureAudioContext = useCallback(() => {
    if (!audioCtxRef.current) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtxRef.current = new AudioContextClass();
      }
    }
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => {});
    }
    return audioCtxRef.current;
  }, []);

  /**
   * Immediately destroys any nodes that are mid-fade. Called before every
   * new oscillator is created, so two oscillators can never be audible
   * at the same time no matter how fast the user toggles.
   */
  const purgeFadingNodes = useCallback(() => {
    if (fadeTimeoutRef.current) {
      clearTimeout(fadeTimeoutRef.current);
      fadeTimeoutRef.current = null;
    }

    const pending = fadingNodesRef.current;
    fadingNodesRef.current = null;

    if (!pending) {
      return;
    }

    try {
      pending.oscillator.stop();
    } catch (err) {
      // Already stopped — safe to ignore.
    }
    try {
      pending.oscillator.disconnect();
    } catch (err) {
      // Already disconnected — safe to ignore.
    }
    try {
      pending.gainNode.disconnect();
    } catch (err) {
      // Already disconnected — safe to ignore.
    }
  }, []);

  const stopSiren = useCallback(() => {
    sirenActiveRef.current = false;

    if (sweepIntervalRef.current) {
      clearInterval(sweepIntervalRef.current);
      sweepIntervalRef.current = null;
    }

    // Kill anything already fading before queueing another fade.
    purgeFadingNodes();

    const ctx = audioCtxRef.current;
    const oscillator = oscillatorRef.current;
    const gainNode = gainNodeRef.current;

    oscillatorRef.current = null;
    gainNodeRef.current = null;

    if (!ctx || !oscillator || !gainNode) {
      return;
    }

    try {
      gainNode.gain.cancelScheduledValues(ctx.currentTime);
      gainNode.gain.setValueAtTime(Math.max(gainNode.gain.value, 0.0001), ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.1);
    } catch (err) {
      // Context may be closed; fall through to the hard stop below.
    }

    fadingNodesRef.current = { oscillator, gainNode };
    fadeTimeoutRef.current = setTimeout(() => {
      fadeTimeoutRef.current = null;
      purgeFadingNodes();
    }, 150);
  }, [purgeFadingNodes]);

  const startSiren = useCallback(() => {
    if (sirenActiveRef.current || sirenMutedRef.current) {
      return;
    }

    const ctx = ensureAudioContext();
    if (!ctx) {
      return;
    }

    // Guarantee a clean slate: no fading node, no live node.
    purgeFadingNodes();
    if (oscillatorRef.current) {
      try {
        oscillatorRef.current.stop();
        oscillatorRef.current.disconnect();
      } catch (err) {
        // Already stopped — safe to ignore.
      }
      oscillatorRef.current = null;
    }
    if (gainNodeRef.current) {
      try {
        gainNodeRef.current.disconnect();
      } catch (err) {
        // Already disconnected — safe to ignore.
      }
      gainNodeRef.current = null;
    }
    if (sweepIntervalRef.current) {
      clearInterval(sweepIntervalRef.current);
      sweepIntervalRef.current = null;
    }

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(880, ctx.currentTime);

    gainNode.gain.setValueAtTime(0.0001, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.15);

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.start();

    oscillatorRef.current = oscillator;
    gainNodeRef.current = gainNode;
    sirenActiveRef.current = true;

    // Rapid sweep between 880Hz and 1200Hz: industrial/police siren warble.
    let sweepUp = true;
    sweepIntervalRef.current = setInterval(() => {
      const activeOscillator = oscillatorRef.current;
      const activeCtx = audioCtxRef.current;
      if (!activeOscillator || !activeCtx) {
        return;
      }
      try {
        activeOscillator.frequency.linearRampToValueAtTime(
          sweepUp ? 1200 : 880,
          activeCtx.currentTime + 0.18
        );
      } catch (err) {
        // Node torn down between ticks — safe to ignore.
      }
      sweepUp = !sweepUp;
    }, 180);
  }, [ensureAudioContext, purgeFadingNodes]);

  // Single unmount cleanup: stop siren, purge nodes, close context.
  useEffect(() => {
    return () => {
      stopSiren();
      purgeFadingNodes();
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
    };
  }, [stopSiren, purgeFadingNodes]);

  // ----------------------------------------------------------------
  // Live data polling — stable identity, created once
  // ----------------------------------------------------------------
  const fetchLiveData = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/live-data`);
      const data = response.data || {};

      liveDataRef.current = data;
      methaneActiveRef.current = Boolean(data.methane_gas);

      setLiveData(data);
      setConnected(true);
      setLastUpdated(new Date());

      tickRef.current += 1;
      setHistory((prev) => {
        const nextPoint = {
          label: `T-${tickRef.current}`,
          aqi: data.aqi,
          pm25: data.pm25,
          pm10: data.pm10,
          temperature: data.temperature,
          humidity: data.humidity,
        };
        const updated = [...prev, nextPoint];
        if (updated.length > MAX_HISTORY_POINTS) {
          updated.shift();
        }
        return updated;
      });

      if (data.methane_gas && !sirenMutedRef.current) {
        startSiren();
      } else {
        stopSiren();
      }
    } catch (err) {
      setConnected(false);
    }
  }, [startSiren, stopSiren]);

  useEffect(() => {
    fetchLiveData();
    const interval = setInterval(fetchLiveData, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchLiveData]);

  // Mute toggle reacts instantly without touching the polling cadence.
  useEffect(() => {
    sirenMutedRef.current = sirenMuted;

    if (sirenMuted) {
      stopSiren();
    } else if (methaneActiveRef.current) {
      startSiren();
    }
  }, [sirenMuted, startSiren, stopSiren]);

  // ----------------------------------------------------------------
  // Stable event handlers
  // ----------------------------------------------------------------
  const handleToggleRelay = useCallback(
    async (device) => {
      const current = liveDataRef.current;
      if (!current) {
        return;
      }

      const currentStatus =
        device === 'purifier' ? current.purifier_status : current.dehumidifier_status;

      setRelayPending((prev) => ({ ...prev, [device]: true }));

      try {
        await axios.post(`${API_BASE}/api/control`, {
          device,
          status: !currentStatus,
        });
        await fetchLiveData();
      } catch (err) {
        setConnected(false);
      } finally {
        setRelayPending((prev) => ({ ...prev, [device]: false }));
      }
    },
    [fetchLiveData]
  );

  const handleTogglePurifier = useCallback(() => {
    handleToggleRelay('purifier');
  }, [handleToggleRelay]);

  const handleToggleDehumidifier = useCallback(() => {
    handleToggleRelay('dehumidifier');
  }, [handleToggleRelay]);

  const handleTriggerGas = useCallback(async () => {
    setGasLoading(true);

    try {
      // Runs inside a user gesture, so this also unlocks the AudioContext
      // under browser autoplay policies.
      ensureAudioContext();
      await axios.post(`${API_BASE}/api/trigger-gas`);
      await fetchLiveData();
    } catch (err) {
      setConnected(false);
    } finally {
      setGasLoading(false);
    }
  }, [ensureAudioContext, fetchLiveData]);

  const handleSilence = useCallback(() => {
    setSirenMuted((prev) => !prev);
  }, []);

  // ----------------------------------------------------------------
  // Derived render values
  // ----------------------------------------------------------------
  const aqi = liveData && typeof liveData.aqi === 'number' ? liveData.aqi : 0;
  const aqiStatus = getAqiStatus(aqi);
  const methaneActive = Boolean(liveData && liveData.methane_gas);

  const labels = history.map((point) => point.label);

  const aqiPmChartData = {
    labels,
    datasets: [
      {
        label: 'AQI',
        data: history.map((point) => point.aqi),
        borderColor: palette.cyan,
        backgroundColor: palette.cyan,
        pointBackgroundColor: palette.cyan,
        fill: false,
      },
      {
        label: 'PM2.5',
        data: history.map((point) => point.pm25),
        borderColor: palette.purple,
        backgroundColor: palette.purple,
        pointBackgroundColor: palette.purple,
        fill: false,
      },
      {
        label: 'PM10',
        data: history.map((point) => point.pm10),
        borderColor: palette.pink,
        backgroundColor: palette.pink,
        pointBackgroundColor: palette.pink,
        fill: false,
      },
    ],
  };

  const tempHumidityChartData = {
    labels,
    datasets: [
      {
        label: 'Temperature (°C)',
        data: history.map((point) => point.temperature),
        borderColor: palette.orange,
        backgroundColor: palette.orange,
        pointBackgroundColor: palette.orange,
        fill: false,
      },
      {
        label: 'Humidity (%)',
        data: history.map((point) => point.humidity),
        borderColor: palette.cyan,
        backgroundColor: palette.cyan,
        pointBackgroundColor: palette.cyan,
        fill: false,
      },
    ],
  };

  const aqiPmChartOptions = buildChartOptions('AQI & Dust Trends');
  const tempHumidityChartOptions = buildChartOptions('Climate Trends');

  return (
    <div style={styles.page}>
      <style>
        {`
          @keyframes glowPulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
          }
          @keyframes strobeFlash {
            0%, 100% { background-color: rgba(220, 38, 38, 0); }
            50% { background-color: rgba(220, 38, 38, 0.35); }
          }
          @keyframes bannerPulse {
            0%, 100% { box-shadow: 0 0 40px rgba(220, 38, 38, 0.6); transform: scale(1); }
            50% { box-shadow: 0 0 70px rgba(220, 38, 38, 0.95); transform: scale(1.01); }
          }
          @keyframes iconPulse {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.25); opacity: 0.7; }
          }
        `}
      </style>

      {/* ====================== FULL-SCREEN STROBE OVERLAY ====================== */}
      {methaneActive ? <div style={styles.strobeOverlay} /> : null}

      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div>
            <h1 style={styles.title}>
              <Wind size={22} color={palette.cyan} />
              Automated Air Quality &amp; Hazardous Gas Monitoring System
            </h1>
            <p style={styles.subtitle}>
              Real-time purification control &amp; methane leak detection dashboard
            </p>
          </div>

          <div style={styles.headerActions}>
            <div style={styles.statusBadgeSmall(connected)}>
              <Radio size={14} />
              {connected ? 'Live REST Active' : 'Disconnected'}
              <span style={styles.dot(connected)} />
            </div>

            <button
              type="button"
              onClick={handleTriggerGas}
              disabled={gasLoading}
              style={styles.gasButton(gasLoading)}
            >
              <Flame size={16} />
              {gasLoading ? 'Triggering...' : 'Simulate Gas Leak'}
            </button>
          </div>
        </div>
      </header>

      <main style={styles.main}>
        {/* ====================== CRITICAL EMERGENCY BANNER ====================== */}
        {methaneActive ? (
          <div style={styles.emergencyBanner}>
            <div style={styles.emergencyLeft}>
              <div style={styles.emergencyIconWrap}>
                <ShieldAlert size={34} color="#ffffff" />
              </div>
              <div>
                <p style={styles.emergencyTextTitle}>
                  CRITICAL ALERT: HAZARDOUS METHANE GAS LEAK DETECTED! PURIFIER ACTIVATED
                </p>
                <p style={styles.emergencyTextSub}>
                  Evacuate non-essential personnel. Ventilation and emergency relays engaged
                  automatically.
                </p>
              </div>
            </div>

            <button type="button" onClick={handleSilence} style={styles.silenceButton(sirenMuted)}>
              {sirenMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              {sirenMuted ? 'SIREN SILENCED' : 'SILENCE SIREN'}
            </button>
          </div>
        ) : null}

        {/* ====================== AQI PROMINENT CARD ====================== */}
        <div style={styles.aqiCard(aqiStatus.color)}>
          <div style={styles.aqiInner}>
            <div style={styles.aqiLeft}>
              <div style={styles.aqiIconWrap(aqiStatus.soft)}>
                <Gauge size={36} color={aqiStatus.color} />
              </div>
              <div>
                <p style={styles.aqiLabel}>Air Quality Index (AQI)</p>
                <p style={styles.aqiValue}>{aqi}</p>
              </div>
            </div>

            <div style={styles.aqiRight}>
              <span style={styles.statusChip(aqiStatus.color)}>{aqiStatus.label}</span>
              <span style={styles.timestamp}>
                {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : 'Awaiting data...'}
              </span>
            </div>
          </div>
        </div>

        {/* ====================== METRIC CARDS GRID ====================== */}
        <div style={styles.metricsGrid}>
          <MetricCard
            icon={Wind}
            label="PM2.5"
            value={liveData && liveData.pm25 !== undefined ? liveData.pm25 : '--'}
            unit="µg/m³"
            target="Target: < 35"
            soft={palette.purpleSoft}
            iconColor={palette.purple}
          />
          <MetricCard
            icon={Wind}
            label="PM10"
            value={liveData && liveData.pm10 !== undefined ? liveData.pm10 : '--'}
            unit="µg/m³"
            target="Target: < 50"
            soft={palette.cyanSoft}
            iconColor={palette.cyan}
          />
          <MetricCard
            icon={Thermometer}
            label="Temperature"
            value={liveData && liveData.temperature !== undefined ? liveData.temperature : '--'}
            unit="°C"
            target="Max: 30°C"
            soft={palette.orangeSoft}
            iconColor={palette.orange}
          />
          <MetricCard
            icon={Droplets}
            label="Humidity"
            value={liveData && liveData.humidity !== undefined ? liveData.humidity : '--'}
            unit="%"
            target="Max: 60%"
            soft={palette.cyanSoft}
            iconColor={palette.cyan}
          />
        </div>

        {/* ====================== HARDWARE RELAY CONTROL ====================== */}
        <section>
          <div style={styles.sectionHeader}>
            <Activity size={18} color={palette.cyan} />
            <h2 style={styles.sectionTitle}>Hardware Relay Control</h2>
          </div>

          <div style={styles.relayGrid}>
            <RelayControl
              label="Air Purifier"
              isOn={Boolean(liveData && liveData.purifier_status)}
              onToggle={handleTogglePurifier}
              pending={relayPending.purifier}
            />
            <RelayControl
              label="Dehumidifier"
              isOn={Boolean(liveData && liveData.dehumidifier_status)}
              onToggle={handleToggleDehumidifier}
              pending={relayPending.dehumidifier}
            />
          </div>
        </section>

        {/* ====================== TREND CHARTS ====================== */}
        <section>
          <div style={styles.sectionHeader}>
            <LineChart size={18} color={palette.cyan} />
            <h2 style={styles.sectionTitle}>Live Trend Analytics</h2>
          </div>

          <div style={styles.chartsGrid}>
            <div style={styles.chartCard}>
              <div style={styles.chartCanvasWrap}>
                <Line data={aqiPmChartData} options={aqiPmChartOptions} />
              </div>
            </div>

            <div style={styles.chartCard}>
              <div style={styles.chartCanvasWrap}>
                <Line data={tempHumidityChartData} options={tempHumidityChartOptions} />
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer style={styles.footer}>
        Final Year Project — Automated Air Quality Purification &amp; Hazardous Gas Monitoring System
      </footer>
    </div>
  );
}

export default App;