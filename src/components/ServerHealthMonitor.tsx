import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Cpu,
  HardDrive,
  Pause,
  Play,
  RefreshCw,
  Volume2,
  VolumeX,
  Wifi,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { playCriticalAlertSound, unlockAlertAudio } from '../lib/alertSound';
import { apiRequest } from '../lib/api';

interface SystemHealthPayload {
  timestamp: string;
  uptimeSeconds: number;
  nodeVersion: string;
  platform: string;
  cpu: {
    usagePercent: number;
    cores: number;
    model: string;
    loadAvg1m: number;
  };
  memory: {
    usagePercent: number;
    usedMb: number;
    totalMb: number;
    processRssMb: number;
    processHeapUsedMb: number;
    processHeapTotalMb: number;
  };
  database: {
    latencyMs: number;
  };
}

interface TelemetryPoint {
  time: string;
  cpu: number;
  memory: number;
  latencyMs: number;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m ${secs}s`;
  return `${mins}m ${secs}s`;
}

function getLevelColor(percent: number, threshold: number): string {
  if (percent >= threshold) return 'bg-red-600';
  if (percent >= Math.max(50, threshold - 15)) return 'bg-[#CA8A04]';
  return 'bg-[#15803D]';
}

function getLatencyTone(ms: number): string {
  if (ms >= 400) return 'text-red-700';
  if (ms >= 150) return 'text-[#B45309]';
  return 'text-[#15803D]';
}

const SOUND_ALERTS_STORAGE_KEY = 'nzila_admin_sound_alerts_enabled';
const SOUND_ALERT_REPEAT_MS = 15_000;

export const ServerHealthMonitor: React.FC<{
  cpuThresholdPct?: number;
  memoryThresholdPct?: number;
}> = ({ cpuThresholdPct = 85, memoryThresholdPct = 85 }) => {
  const [health, setHealth] = useState<SystemHealthPayload | null>(null);
  const [networkLatencyMs, setNetworkLatencyMs] = useState<number>(0);
  const [history, setHistory] = useState<TelemetryPoint[]>([]);
  const [live, setLive] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(SOUND_ALERTS_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [lastSoundTriggeredAt, setLastSoundTriggeredAt] = useState<string | null>(null);
  const [soundStatusMsg, setSoundStatusMsg] = useState<string | null>(null);
  const lastBeepEpochRef = useRef<number>(0);

  const handleToggleSound = async () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    setSoundStatusMsg(null);
    try {
      window.localStorage.setItem(SOUND_ALERTS_STORAGE_KEY, next ? '1' : '0');
    } catch {
      // ignore storage restrictions
    }
    if (next) {
      const unlocked = await unlockAlertAudio();
      if (unlocked) {
        await playCriticalAlertSound();
        setSoundStatusMsg('Alertas sonoros ativados no navegador.');
      } else {
        setSoundStatusMsg('O navegador bloqueou o áudio automático. Clique em "Testar Som".');
      }
    }
  };

  const handleTestSound = async () => {
    await unlockAlertAudio();
    const played = await playCriticalAlertSound();
    setSoundStatusMsg(
      played
        ? 'Som de alerta crítico reproduzido com sucesso.'
        : 'Não foi possível reproduzir som neste navegador.'
    );
  };

  const pollHealth = useCallback(async () => {
    const startedAt = performance.now();
    try {
      const res = await apiRequest<SystemHealthPayload>('/api/admin/principal/system-health');
      const rtt = Math.max(1, Math.round(performance.now() - startedAt));
      setHealth(res);
      setNetworkLatencyMs(rtt);
      setError(null);

      const label = new Date(res.timestamp).toLocaleTimeString('pt-AO', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

      setHistory((prev) => {
        const next = [
          ...prev,
          {
            time: label,
            cpu: res.cpu.usagePercent,
            memory: res.memory.usagePercent,
            latencyMs: rtt,
          },
        ];
        return next.slice(-20);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao consultar métricas do servidor.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    pollHealth();
  }, [pollHealth]);

  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => {
      pollHealth();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [live, pollHealth]);

  const cpuExceeded = health !== null && health.cpu.usagePercent >= cpuThresholdPct;
  const memoryExceeded = health !== null && health.memory.usagePercent >= memoryThresholdPct;
  const isAnyThresholdExceeded = cpuExceeded || memoryExceeded;

  useEffect(() => {
    if (!soundEnabled || !isAnyThresholdExceeded || !health) return;
    const now = Date.now();
    if (now - lastBeepEpochRef.current < SOUND_ALERT_REPEAT_MS) return;
    lastBeepEpochRef.current = now;
    void playCriticalAlertSound().then((played) => {
      if (played) {
        setLastSoundTriggeredAt(
          new Date().toLocaleTimeString('pt-AO', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })
        );
      }
    });
  }, [soundEnabled, isAnyThresholdExceeded, health]);

  return (
    <div className="rounded-xl border border-[#DCE5DE] bg-white p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-bold text-[#111814] flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#15803D]" />
            Monitorização em Tempo Real do Servidor
          </h3>
          <p className="text-xs text-[#546459] mt-0.5">
            Telemetria direta de CPU, memória RAM e latência de rede atualizada a cada 3 segundos.
            {health && (
              <>
                {' '}· Uptime:{' '}
                <strong className="font-mono-tabular text-[#111814]">
                  {formatUptime(health.uptimeSeconds)}
                </strong>{' '}
                · {health.nodeVersion}
              </>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 print-hide">
          <button
            type="button"
            onClick={() => setLive((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
              live
                ? 'border-[#15803D]/30 bg-[#EEF7F0] text-[#14532D] hover:bg-[#DFF1E4]'
                : 'border-[#D4DDD6] bg-white text-[#546459] hover:bg-[#F2F7F3]'
            }`}
          >
            {live ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {live ? 'Pausar Tempo Real' : 'Retomar Tempo Real'}
          </button>
          <button
            type="button"
            onClick={pollHealth}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#D4DDD6] bg-white px-3 py-1.5 text-xs font-semibold text-[#14532D] hover:bg-[#F2F7F3] transition-colors whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </div>

      {/* Audible Browser Alert Toggle Bar */}
      <div className="rounded-xl border border-[#E5ECE6] bg-[#F8FBF9] px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 print-hide">
        <div className="flex items-start gap-2.5">
          {soundEnabled ? (
            <Volume2 className="w-4 h-4 text-[#15803D] shrink-0 mt-0.5" />
          ) : (
            <VolumeX className="w-4 h-4 text-[#546459] shrink-0 mt-0.5" />
          )}
          <div className="space-y-0.5">
            <div className="text-xs font-bold text-[#111814]">
              Alertas Sonoros no Navegador
            </div>
            <p className="text-[11px] text-[#546459]">
              Emite um aviso sonoro automático sempre que a CPU (≥ {cpuThresholdPct}%) ou Memória RAM (≥ {memoryThresholdPct}%) ultrapassar os limiares críticos, mesmo sem estar a olhar para o painel.
            </p>
            {soundStatusMsg && (
              <p className="text-[11px] font-medium text-[#14532D] pt-0.5">{soundStatusMsg}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleTestSound}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#D4DDD6] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#14532D] hover:bg-[#F2F7F3] transition-colors whitespace-nowrap"
          >
            <Volume2 className="w-3.5 h-3.5 text-[#15803D]" />
            Testar Som
          </button>

          <button
            type="button"
            role="switch"
            aria-checked={soundEnabled}
            onClick={handleToggleSound}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#15803D]/40 ${
              soundEnabled ? 'bg-[#15803D]' : 'bg-[#CBD5CE]'
            }`}
            title={soundEnabled ? 'Desativar alertas sonoros' : 'Ativar alertas sonoros'}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                soundEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
          <span
            className={`text-xs font-bold min-w-[54px] ${
              soundEnabled ? 'text-[#15803D]' : 'text-[#546459]'
            }`}
          >
            {soundEnabled ? 'Ativo' : 'Inativo'}
          </span>
        </div>
      </div>

      {isAnyThresholdExceeded && health && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-red-800">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span>
              Limiar crítico ultrapassado:{' '}
              {[
                cpuExceeded ? `CPU em ${health.cpu.usagePercent.toFixed(1)}% (limite ${cpuThresholdPct}%)` : null,
                memoryExceeded
                  ? `Memória RAM em ${health.memory.usagePercent.toFixed(1)}% (limite ${memoryThresholdPct}%)`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </div>
          <span className="font-mono-tabular text-[11px] text-red-700">
            {soundEnabled
              ? lastSoundTriggeredAt
                ? `Alarme sonoro emitido às ${lastSoundTriggeredAt}`
                : 'Alarme sonoro ativo'
              : 'Alertas sonoros silenciados'}
          </span>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700">
          {error}
        </div>
      )}

      {/* 3 Core Resource Cards: CPU, Memory, Network Latency */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* CPU */}
        <div className="rounded-xl border border-[#E5ECE6] bg-[#FCFEFD] p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#14532D]">
              <Cpu className="w-4 h-4 text-[#15803D]" />
              CPU do Servidor
            </span>
            <span className="font-mono-tabular text-lg font-extrabold text-[#111814]">
              {health ? `${health.cpu.usagePercent.toFixed(1)}%` : '—'}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-[#E5ECE6] overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${getLevelColor(health?.cpu.usagePercent ?? 0, cpuThresholdPct)}`}
              style={{ width: `${Math.min(100, health?.cpu.usagePercent ?? 0)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-[#546459] font-mono-tabular">
            <span>{health ? `${health.cpu.cores} núcleos · Limiar ${cpuThresholdPct}%` : '—'}</span>
            <span>Load 1m: {health ? health.cpu.loadAvg1m.toFixed(2) : '—'}</span>
          </div>
        </div>

        {/* Memory */}
        <div className="rounded-xl border border-[#E5ECE6] bg-[#FCFEFD] p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#14532D]">
              <HardDrive className="w-4 h-4 text-[#15803D]" />
              Memória RAM
            </span>
            <span className="font-mono-tabular text-lg font-extrabold text-[#111814]">
              {health ? `${health.memory.usagePercent.toFixed(1)}%` : '—'}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-[#E5ECE6] overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${getLevelColor(health?.memory.usagePercent ?? 0, memoryThresholdPct)}`}
              style={{ width: `${Math.min(100, health?.memory.usagePercent ?? 0)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-[#546459] font-mono-tabular">
            <span>
              {health ? `${health.memory.usedMb} / ${health.memory.totalMb} MB` : '—'}
            </span>
            <span>
              Limiar {memoryThresholdPct}% · RSS {health ? `${health.memory.processRssMb} MB` : '—'}
            </span>
          </div>
        </div>

        {/* Network & DB Latency */}
        <div className="rounded-xl border border-[#E5ECE6] bg-[#FCFEFD] p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#14532D]">
              <Wifi className="w-4 h-4 text-[#15803D]" />
              Latência de Rede (RTT)
            </span>
            <span className={`font-mono-tabular text-lg font-extrabold ${getLatencyTone(networkLatencyMs)}`}>
              {health ? `${networkLatencyMs} ms` : '—'}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-[#E5ECE6] overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                networkLatencyMs >= 400
                  ? 'bg-red-600'
                  : networkLatencyMs >= 150
                    ? 'bg-[#CA8A04]'
                    : 'bg-[#15803D]'
              }`}
              style={{ width: `${Math.min(100, Math.round((networkLatencyMs / 500) * 100))}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-[#546459] font-mono-tabular">
            <span>SQLite: {health ? `${health.database.latencyMs} ms` : '—'}</span>
            <span>Heap: {health ? `${health.memory.processHeapUsedMb} MB` : '—'}</span>
          </div>
        </div>
      </div>

      {/* Live Trend Chart */}
      {history.length > 1 && (
        <div className="rounded-xl border border-[#E5ECE6] bg-[#FCFEFD] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <span className="text-xs font-bold text-[#14532D]">
              Histórico em Tempo Real (últimas {history.length} amostras)
            </span>
            <div className="flex items-center gap-4 text-[11px] font-medium text-[#546459]">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#15803D]" />
                CPU (%)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#0F766E]" />
                Memória (%)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#CA8A04]" />
                Latência (ms)
              </span>
            </div>
          </div>

          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history} margin={{ top: 5, right: 12, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5ECE6" />
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#546459' }} />
                <YAxis yAxisId="pct" domain={[0, 100]} tick={{ fontSize: 10, fill: '#546459' }} unit="%" />
                <YAxis yAxisId="ms" orientation="right" tick={{ fontSize: 10, fill: '#546459' }} unit="ms" />
                <Tooltip
                  contentStyle={{
                    fontSize: '11px',
                    borderRadius: '8px',
                    border: '1px solid #DCE5DE',
                  }}
                />
                <Line
                  yAxisId="pct"
                  type="monotone"
                  dataKey="cpu"
                  name="CPU (%)"
                  stroke="#15803D"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  yAxisId="pct"
                  type="monotone"
                  dataKey="memory"
                  name="Memória (%)"
                  stroke="#0F766E"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  yAxisId="ms"
                  type="monotone"
                  dataKey="latencyMs"
                  name="Latência (ms)"
                  stroke="#CA8A04"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
};
