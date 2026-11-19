import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock, Cpu, HardDrive, RefreshCw, TrendingUp } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiRequest } from '../lib/api';

interface ServerMetricHistoryPoint {
  timestamp: string;
  cpuPercent: number;
  memoryPercent: number;
  cpuPeakPercent: number;
  memoryPeakPercent: number;
  memoryUsedMb: number;
  memoryTotalMb: number;
  samples: number;
}

interface ServerMetricHistoryResponse {
  hours: number;
  sampleIntervalSeconds: number;
  windowStart: string;
  windowEnd: string;
  totalSamples: number;
  summary: {
    avgCpu: number;
    maxCpu: number;
    avgMemory: number;
    maxMemory: number;
  };
  points: ServerMetricHistoryPoint[];
}

interface ChartPoint extends ServerMetricHistoryPoint {
  timeLabel: string;
  fullDateLabel: string;
}

interface ServerUsageHistory24hChartProps {
  cpuThresholdPct?: number;
  memoryThresholdPct?: number;
}

const WINDOW_OPTIONS: Array<{ hours: number; label: string }> = [
  { hours: 24, label: 'Últimas 24h' },
  { hours: 6, label: 'Últimas 6h' },
  { hours: 1, label: 'Última 1h' },
];

export const ServerUsageHistory24hChart: React.FC<ServerUsageHistory24hChartProps> = ({
  cpuThresholdPct = 85,
  memoryThresholdPct = 85,
}) => {
  const [hours, setHours] = useState<number>(24);
  const [showPeaks, setShowPeaks] = useState<boolean>(false);
  const [data, setData] = useState<ServerMetricHistoryResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async (windowHours: number) => {
    setLoading(true);
    try {
      const res = await apiRequest<ServerMetricHistoryResponse>(
        `/api/admin/principal/system-health/history-24h?hours=${windowHours}`
      );
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar histórico de CPU e memória.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory(hours);
  }, [hours, loadHistory]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      loadHistory(hours);
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [hours, loadHistory]);

  const chartData = useMemo<ChartPoint[]>(() => {
    if (!data?.points) return [];
    return data.points.map((pt) => {
      const date = new Date(pt.timestamp);
      return {
        ...pt,
        timeLabel: date.toLocaleTimeString('pt-AO', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        fullDateLabel: date.toLocaleString('pt-AO', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        }),
      };
    });
  }, [data]);

  const hasMultiSampleBuckets = useMemo(
    () => chartData.some((pt) => pt.samples > 1),
    [chartData]
  );

  return (
    <div className="rounded-xl border border-[#DCE5DE] bg-white p-6 space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-bold text-[#111814] flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[#15803D]" />
            Histórico de Uso de CPU e Memória (Últimas 24 Horas)
          </h3>
          <p className="text-xs text-[#546459] mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span>
              Evolução contínua da carga do servidor registada automaticamente a cada minuto na base de dados.
            </span>
            {data && (
              <span className="inline-flex items-center gap-1 font-mono-tabular text-[#14532D] font-semibold">
                <Clock className="w-3 h-3" />
                {data.totalSamples} {data.totalSamples === 1 ? 'amostra' : 'amostras'}
              </span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0 print-hide">
          <div className="inline-flex rounded-lg border border-[#D4DDD6] bg-[#F7F9F7] p-0.5">
            {WINDOW_OPTIONS.map((opt) => (
              <button
                key={opt.hours}
                type="button"
                onClick={() => setHours(opt.hours)}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
                  hours === opt.hours
                    ? 'bg-[#14532D] text-white'
                    : 'text-[#546459] hover:text-[#111814]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {hasMultiSampleBuckets && (
            <label className="inline-flex items-center gap-1.5 rounded-lg border border-[#D4DDD6] bg-white px-2.5 py-1.5 text-xs font-medium text-[#1C2720] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showPeaks}
                onChange={(e) => setShowPeaks(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-[#D4DDD6] accent-[#14532D]"
              />
              Mostrar picos
            </label>
          )}

          <button
            type="button"
            onClick={() => loadHistory(hours)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#D4DDD6] bg-white px-3 py-1.5 text-xs font-semibold text-[#14532D] hover:bg-[#F2F7F3] disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700">
          {error}
        </div>
      )}

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border border-[#E5ECE6] bg-[#FCFEFD] p-3.5">
          <div className="text-[11px] font-medium text-[#546459] flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-[#15803D]" />
            Média CPU ({hours}h)
          </div>
          <div className="mt-1 font-mono-tabular text-xl font-extrabold text-[#111814]">
            {data ? `${data.summary.avgCpu.toFixed(1)}%` : '—'}
          </div>
        </div>

        <div className="rounded-xl border border-[#E5ECE6] bg-[#FCFEFD] p-3.5">
          <div className="text-[11px] font-medium text-[#546459] flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-[#CA8A04]" />
            Pico CPU ({hours}h)
          </div>
          <div
            className={`mt-1 font-mono-tabular text-xl font-extrabold ${
              (data?.summary.maxCpu ?? 0) >= cpuThresholdPct ? 'text-red-700' : 'text-[#111814]'
            }`}
          >
            {data ? `${data.summary.maxCpu.toFixed(1)}%` : '—'}
          </div>
        </div>

        <div className="rounded-xl border border-[#E5ECE6] bg-[#FCFEFD] p-3.5">
          <div className="text-[11px] font-medium text-[#546459] flex items-center gap-1.5">
            <HardDrive className="w-3.5 h-3.5 text-[#0F766E]" />
            Média Memória ({hours}h)
          </div>
          <div className="mt-1 font-mono-tabular text-xl font-extrabold text-[#111814]">
            {data ? `${data.summary.avgMemory.toFixed(1)}%` : '—'}
          </div>
        </div>

        <div className="rounded-xl border border-[#E5ECE6] bg-[#FCFEFD] p-3.5">
          <div className="text-[11px] font-medium text-[#546459] flex items-center gap-1.5">
            <HardDrive className="w-3.5 h-3.5 text-[#CA8A04]" />
            Pico Memória ({hours}h)
          </div>
          <div
            className={`mt-1 font-mono-tabular text-xl font-extrabold ${
              (data?.summary.maxMemory ?? 0) >= memoryThresholdPct ? 'text-red-700' : 'text-[#111814]'
            }`}
          >
            {data ? `${data.summary.maxMemory.toFixed(1)}%` : '—'}
          </div>
        </div>
      </div>

      {/* Recharts 24h Line Chart */}
      <div className="rounded-xl border border-[#E5ECE6] bg-[#FCFEFD] p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-4 text-[11px] font-medium text-[#546459]">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#15803D]" />
              CPU (%)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#0F766E]" />
              Memória RAM (%)
            </span>
            {showPeaks && hasMultiSampleBuckets && (
              <>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 border-t-2 border-dashed border-[#15803D]/60" />
                  Pico CPU (%)
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 border-t-2 border-dashed border-[#0F766E]/60" />
                  Pico RAM (%)
                </span>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono-tabular text-[#546459]">
            <span className="inline-flex items-center gap-1 text-red-700 font-semibold">
              <span className="w-3 border-t border-dashed border-red-600" />
              Limiar CPU: {cpuThresholdPct}%
            </span>
            <span className="inline-flex items-center gap-1 text-[#B45309] font-semibold">
              <span className="w-3 border-t border-dashed border-[#B45309]" />
              Limiar RAM: {memoryThresholdPct}%
            </span>
          </div>
        </div>

        <div className="h-64 w-full">
          {loading && chartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-[#546459]">
              A carregar histórico de métricas do servidor...
            </div>
          ) : chartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-[#546459]">
              Sem amostras registadas nesta janela temporal.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 16, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5ECE6" />
                <XAxis
                  dataKey="timeLabel"
                  tick={{ fontSize: 10, fill: '#546459' }}
                  minTickGap={24}
                />
                <YAxis
                  domain={[0, 100]}
                  ticks={[0, 25, 50, 75, 100]}
                  tick={{ fontSize: 10, fill: '#546459' }}
                  unit="%"
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    const pt = payload[0]?.payload as ChartPoint | undefined;
                    if (!pt) return null;
                    return (
                      <div className="rounded-lg border border-[#DCE5DE] bg-white px-3 py-2.5 shadow-sm text-xs space-y-1">
                        <div className="font-mono-tabular font-bold text-[#111814]">
                          {pt.fullDateLabel}
                        </div>
                        <div className="flex items-center justify-between gap-4 font-mono-tabular">
                          <span className="text-[#15803D] font-semibold">CPU:</span>
                          <span className="font-bold text-[#111814]">
                            {pt.cpuPercent.toFixed(1)}%
                            {pt.samples > 1 ? ` (pico ${pt.cpuPeakPercent.toFixed(1)}%)` : ''}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4 font-mono-tabular">
                          <span className="text-[#0F766E] font-semibold">Memória RAM:</span>
                          <span className="font-bold text-[#111814]">
                            {pt.memoryPercent.toFixed(1)}%
                            {pt.samples > 1 ? ` (pico ${pt.memoryPeakPercent.toFixed(1)}%)` : ''}
                          </span>
                        </div>
                        {pt.memoryTotalMb > 0 && (
                          <div className="text-[11px] text-[#546459] font-mono-tabular pt-0.5 border-t border-[#EDF2EE]">
                            RAM: {pt.memoryUsedMb} / {pt.memoryTotalMb} MB
                            {pt.samples > 1 ? ` · ${pt.samples} amostras` : ''}
                          </div>
                        )}
                      </div>
                    );
                  }}
                />
                <ReferenceLine
                  y={cpuThresholdPct}
                  stroke="#DC2626"
                  strokeDasharray="4 4"
                  strokeWidth={1.25}
                />
                {memoryThresholdPct !== cpuThresholdPct && (
                  <ReferenceLine
                    y={memoryThresholdPct}
                    stroke="#B45309"
                    strokeDasharray="4 4"
                    strokeWidth={1.25}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="cpuPercent"
                  name="CPU (%)"
                  stroke="#15803D"
                  strokeWidth={2.25}
                  dot={chartData.length <= 12 ? { r: 3, fill: '#15803D' } : false}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="memoryPercent"
                  name="Memória RAM (%)"
                  stroke="#0F766E"
                  strokeWidth={2.25}
                  dot={chartData.length <= 12 ? { r: 3, fill: '#0F766E' } : false}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                />
                {showPeaks && hasMultiSampleBuckets && (
                  <>
                    <Line
                      type="monotone"
                      dataKey="cpuPeakPercent"
                      name="Pico CPU (%)"
                      stroke="#15803D"
                      strokeOpacity={0.45}
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="memoryPeakPercent"
                      name="Pico RAM (%)"
                      stroke="#0F766E"
                      strokeOpacity={0.45}
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                      dot={false}
                      isAnimationActive={false}
                    />
                  </>
                )}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
};
