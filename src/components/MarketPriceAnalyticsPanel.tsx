import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, Download, RefreshCw, TrendingUp } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ANGOLA_PROVINCES, apiRequest, convertFromKz, formatCurrency } from '../lib/api';
import type { CurrencyCode, FinancialSettings, MarketPriceAnalyticsResponse } from '../types';

interface MarketPriceAnalyticsPanelProps {
  settings: FinancialSettings;
  compact?: boolean;
  onOpenFullAnalysis?: () => void;
}

interface ChartDatum {
  monthLabel: string;
  produtoAgricolaAvg: number;
  consultoriaAvg: number;
  overallAvg: number;
  produtoAgricolaCount: number;
  consultoriaCount: number;
  totalCount: number;
}

export const MarketPriceAnalyticsPanel: React.FC<MarketPriceAnalyticsPanelProps> = ({
  settings,
  compact = false,
  onOpenFullAnalysis,
}) => {
  const [province, setProvince] = useState<string>('Todas');
  const [currency, setCurrency] = useState<CurrencyCode>('AOA');
  const [chartType, setChartType] = useState<'line' | 'bar'>('line');
  const [visibleSeries, setVisibleSeries] = useState({
    produtoAgricola: true,
    consultoria: true,
    overall: true,
  });
  const [data, setData] = useState<MarketPriceAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMarketPrices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = province !== 'Todas' ? `?province=${encodeURIComponent(province)}` : '';
      const res = await apiRequest<MarketPriceAnalyticsResponse>(`/api/admin/principal/market-prices${qs}`);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar análise de preços médios.');
    } finally {
      setLoading(false);
    }
  }, [province]);

  useEffect(() => {
    loadMarketPrices();
  }, [loadMarketPrices]);

  const chartData = useMemo<ChartDatum[]>(() => {
    if (!data) return [];
    return data.months.map((m) => ({
      monthLabel: m.monthLabel,
      produtoAgricolaAvg: Number(convertFromKz(m.produtoAgricolaAvgKz, currency, settings).toFixed(currency === 'AOA' ? 0 : 2)),
      consultoriaAvg: Number(convertFromKz(m.consultoriaAvgKz, currency, settings).toFixed(currency === 'AOA' ? 0 : 2)),
      overallAvg: Number(convertFromKz(m.overallAvgKz, currency, settings).toFixed(currency === 'AOA' ? 0 : 2)),
      produtoAgricolaCount: m.produtoAgricolaCount,
      consultoriaCount: m.consultoriaCount,
      totalCount: m.totalCount,
    }));
  }, [data, currency, settings]);

  const formatConverted = (amountKz: number) =>
    formatCurrency(convertFromKz(amountKz, currency, settings), currency);

  const renderTrendLabel = (trendPct: number | null) => {
    if (trendPct === null) return 'Sem histórico suficiente para tendência';
    const sign = trendPct > 0 ? '+' : '';
    return `Variação no período: ${sign}${trendPct}%`;
  };

  const toggleSeries = (key: keyof typeof visibleSeries) => {
    setVisibleSeries((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      if (!next.produtoAgricola && !next.consultoria && !next.overall) {
        return prev;
      }
      return next;
    });
  };

  const handleExportMarketCsv = () => {
    if (!data) return;
    const escapeCsv = (val: unknown) => `"${String(val ?? '').replace(/"/g, '""')}"`;
    const headers = [
      'Mês',
      `Produto Agrícola (${currency === 'AOA' ? 'Kz' : currency})`,
      'Anúncios Produto Agrícola',
      `Consultoria/Formação (${currency === 'AOA' ? 'Kz' : currency})`,
      'Anúncios Consultoria/Formação',
      `Média Geral (${currency === 'AOA' ? 'Kz' : currency})`,
      'Total de Anúncios',
    ];
    const lines = [
      headers.map(escapeCsv).join(','),
      ...chartData.map((row) =>
        [
          row.monthLabel,
          row.produtoAgricolaAvg,
          row.produtoAgricolaCount,
          row.consultoriaAvg,
          row.consultoriaCount,
          row.overallAvg,
          row.totalCount,
        ]
          .map(escapeCsv)
          .join(',')
      ),
    ];
    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nzila-agro-precos-medios-6meses-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const renderTooltipContent = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: Array<{ dataKey?: string; name?: string; value?: number; color?: string; payload?: ChartDatum }>;
    label?: string;
  }) => {
    if (!active || !payload || payload.length === 0) return null;
    const datum = payload[0]?.payload;
    return (
      <div className="rounded-lg border border-[#DCE5DE] bg-white px-3.5 py-2.5 shadow-md text-xs space-y-1.5">
        <div className="font-bold text-[#111814] border-b border-[#EDF2EE] pb-1">
          {label} {datum ? `· ${datum.totalCount} anúncios` : ''}
        </div>
        {payload.map((entry) => {
          const count =
            entry.dataKey === 'produtoAgricolaAvg'
              ? datum?.produtoAgricolaCount
              : entry.dataKey === 'consultoriaAvg'
              ? datum?.consultoriaCount
              : datum?.totalCount;
          return (
            <div key={String(entry.dataKey)} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-[#445449]">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                  style={{ backgroundColor: entry.color || '#15803D' }}
                />
                {entry.name}
              </span>
              <span className="font-mono-tabular font-bold text-[#111814]">
                {formatCurrency(Number(entry.value || 0), currency)}
                {typeof count === 'number' && (
                  <span className="ml-1 font-normal text-[#546459]">({count})</span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Strategic KPI Summary Strip (full mode) */}
      {!compact && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-[#DCE5DE] bg-white p-5">
          <div className="text-xs font-medium text-[#546459]">Preço Médio · Produto Agrícola</div>
          <div className="mt-1 font-display text-2xl font-extrabold text-[#14532D] font-mono-tabular">
            {data ? formatConverted(data.summary.produtoAgricolaAvgKz) : '—'}
          </div>
          <div className="mt-1 text-[11px] text-[#546459] font-mono-tabular">
            {data ? `${data.summary.produtoAgricolaCount} anúncios · ${renderTrendLabel(data.summary.produtoAgricolaTrendPct)}` : 'A carregar...'}
          </div>
        </div>

        <div className="rounded-xl border border-[#DCE5DE] bg-white p-5">
          <div className="text-xs font-medium text-[#546459]">Preço Médio · Consultoria/Formação</div>
          <div className="mt-1 font-display text-2xl font-extrabold text-[#CA8A04] font-mono-tabular">
            {data ? formatConverted(data.summary.consultoriaAvgKz) : '—'}
          </div>
          <div className="mt-1 text-[11px] text-[#546459] font-mono-tabular">
            {data ? `${data.summary.consultoriaCount} anúncios · ${renderTrendLabel(data.summary.consultoriaTrendPct)}` : 'A carregar...'}
          </div>
        </div>

        <div className="rounded-xl border border-[#DCE5DE] bg-white p-5">
          <div className="text-xs font-medium text-[#546459]">Média Geral do Mercado (6 meses)</div>
          <div className="mt-1 font-display text-2xl font-extrabold text-[#111814] font-mono-tabular">
            {data ? formatConverted(data.summary.overallAvgKz) : '—'}
          </div>
          <div className="mt-1 text-[11px] text-[#546459] font-mono-tabular">
            {data ? `${data.summary.totalListings} publicações analisadas (${province === 'Todas' ? 'Nacional' : province})` : 'A carregar...'}
          </div>
        </div>
      </div>
      )}

      {/* Main Comparative Chart Card */}
      <div className="rounded-xl border border-[#DCE5DE] bg-white p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#EDF2EE] pb-4">
          <div>
            <h2 className="font-display text-lg font-bold text-[#111814] flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-[#15803D]" />
              Comparativo de Preços Médios por Categoria (Últimos 6 Meses)
            </h2>
            <p className="text-xs text-[#546459] mt-0.5">
              Evolução mensal dos preços médios praticados na plataforma para apoio a decisões estratégicas de mercado em Angola.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Province Filter */}
            <select
              value={province}
              onChange={(e) => setProvince(e.target.value)}
              aria-label="Filtrar preços médios por província"
              className="rounded-lg border border-[#D4DDD6] bg-white px-3 py-1.5 text-xs font-medium text-[#1C2720] focus:border-[#15803D] focus:outline-none"
            >
              <option value="Todas">Todas as Províncias</option>
              {ANGOLA_PROVINCES.map((prov) => (
                <option key={prov} value={prov}>
                  {prov}
                </option>
              ))}
            </select>

            {/* Currency Switcher */}
            <div className="flex items-center gap-1 rounded-lg bg-[#F2F7F3] p-1 border border-[#DCE5DE]">
              {(['AOA', 'USD', 'EUR', 'GBP'] as CurrencyCode[]).map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setCurrency(code)}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
                    currency === code
                      ? 'bg-[#14532D] text-white'
                      : 'text-[#445449] hover:text-[#111814]'
                  }`}
                >
                  {code === 'AOA' ? 'Kz' : code}
                </button>
              ))}
            </div>

            {/* Chart Mode Switcher */}
            <div className="flex items-center gap-1 rounded-lg bg-[#F2F7F3] p-1 border border-[#DCE5DE]">
              <button
                type="button"
                onClick={() => setChartType('line')}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
                  chartType === 'line'
                    ? 'bg-white text-[#14532D] shadow-sm'
                    : 'text-[#445449] hover:text-[#111814]'
                }`}
              >
                Linhas
              </button>
              <button
                type="button"
                onClick={() => setChartType('bar')}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
                  chartType === 'bar'
                    ? 'bg-white text-[#14532D] shadow-sm'
                    : 'text-[#445449] hover:text-[#111814]'
                }`}
              >
                Barras
              </button>
            </div>

            <button
              type="button"
              onClick={loadMarketPrices}
              disabled={loading}
              aria-label="Atualizar dados de preços"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#D4DDD6] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#1C2720] hover:bg-[#F2F7F3] disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </button>

            {!compact && data && data.summary.totalListings > 0 && (
              <button
                type="button"
                onClick={handleExportMarketCsv}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#14532D]/30 bg-white px-3 py-1.5 text-xs font-semibold text-[#14532D] hover:bg-[#EEF7F0] transition-colors whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                Exportar CSV
              </button>
            )}

            {compact && onOpenFullAnalysis && (
              <button
                type="button"
                onClick={onOpenFullAnalysis}
                className="rounded-lg bg-[#14532D] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#15803D] transition-colors whitespace-nowrap"
              >
                Análise Completa
              </button>
            )}
          </div>
        </div>

        {/* Category Series Toggle Controls */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="font-semibold text-[#546459]">Séries visíveis:</span>
          <label className="inline-flex items-center gap-1.5 cursor-pointer select-none text-[#1C2720]">
            <input
              type="checkbox"
              checked={visibleSeries.produtoAgricola}
              onChange={() => toggleSeries('produtoAgricola')}
              className="rounded border-[#C7D3CA] accent-[#15803D]"
            />
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#15803D]" />
            Produto Agrícola
          </label>
          <label className="inline-flex items-center gap-1.5 cursor-pointer select-none text-[#1C2720]">
            <input
              type="checkbox"
              checked={visibleSeries.consultoria}
              onChange={() => toggleSeries('consultoria')}
              className="rounded border-[#C7D3CA] accent-[#CA8A04]"
            />
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#CA8A04]" />
            Consultoria/Formação
          </label>
          {chartType === 'line' && (
            <label className="inline-flex items-center gap-1.5 cursor-pointer select-none text-[#1C2720]">
              <input
                type="checkbox"
                checked={visibleSeries.overall}
                onChange={() => toggleSeries('overall')}
                className="rounded border-[#C7D3CA] accent-[#111814]"
              />
              <span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#111814]" />
              Média Geral
            </label>
          )}
        </div>

        <div className={`${compact ? 'h-64' : 'h-80'} w-full`}>
          {loading || !data ? (
            <div className="h-full flex items-center justify-center text-xs text-[#546459]">
              A calcular médias mensais por categoria...
            </div>
          ) : data.summary.totalListings === 0 ? (
            <div className="h-full flex flex-col items-center justify-center rounded-lg border border-dashed border-[#C7D3CA] bg-[#F7F9F7] p-6 text-center">
              <BarChart3 className="w-8 h-8 text-[#15803D] mb-2" />
              <p className="text-sm font-semibold text-[#111814]">
                Sem publicações registadas nos últimos 6 meses{province !== 'Todas' ? ` em ${province}` : ''}
              </p>
              <p className="mt-1 text-xs text-[#546459] max-w-md">
                Assim que produtores e consultores publicarem ofertas agrícolas na plataforma, este gráfico exibirá automaticamente a evolução comparativa dos preços médios por categoria.
              </p>
            </div>
          ) : chartType === 'line' ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 12, right: 20, left: 10, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5ECE6" />
                <XAxis dataKey="monthLabel" tick={{ fontSize: 12, fill: '#546459' }} stroke="#DCE5DE" />
                <YAxis
                  tick={{ fontSize: 11, fill: '#546459' }}
                  stroke="#DCE5DE"
                  tickFormatter={(v: number) =>
                    v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)
                  }
                />
                <Tooltip content={renderTooltipContent as never} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {visibleSeries.produtoAgricola && (
                  <Line
                    type="monotone"
                    dataKey="produtoAgricolaAvg"
                    name="Produto Agrícola (Preço Médio)"
                    stroke="#15803D"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: '#15803D' }}
                    activeDot={{ r: 6 }}
                  />
                )}
                {visibleSeries.consultoria && (
                  <Line
                    type="monotone"
                    dataKey="consultoriaAvg"
                    name="Consultoria/Formação (Preço Médio)"
                    stroke="#CA8A04"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: '#CA8A04' }}
                    activeDot={{ r: 6 }}
                  />
                )}
                {visibleSeries.overall && (
                  <Line
                    type="monotone"
                    dataKey="overallAvg"
                    name="Média Geral"
                    stroke="#111814"
                    strokeWidth={1.75}
                    strokeDasharray="4 4"
                    dot={{ r: 3, fill: '#111814' }}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 12, right: 20, left: 10, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5ECE6" />
                <XAxis dataKey="monthLabel" tick={{ fontSize: 12, fill: '#546459' }} stroke="#DCE5DE" />
                <YAxis
                  tick={{ fontSize: 11, fill: '#546459' }}
                  stroke="#DCE5DE"
                  tickFormatter={(v: number) =>
                    v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)
                  }
                />
                <Tooltip content={renderTooltipContent as never} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {visibleSeries.produtoAgricola && (
                  <Bar
                    dataKey="produtoAgricolaAvg"
                    name="Produto Agrícola (Preço Médio)"
                    fill="#15803D"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={36}
                  />
                )}
                {visibleSeries.consultoria && (
                  <Bar
                    dataKey="consultoriaAvg"
                    name="Consultoria/Formação (Preço Médio)"
                    fill="#EAB308"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={36}
                  />
                )}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Regional Price Distribution Table (full mode) */}
      {!compact && data && data.byProvince.length > 0 && (
        <div className="rounded-xl border border-[#DCE5DE] bg-white p-6 space-y-4">
          <div>
            <h3 className="font-display text-base font-bold text-[#111814]">
              Distribuição de Preços Médios por Província (Últimos 6 Meses)
            </h3>
            <p className="text-xs text-[#546459] mt-0.5">
              Referência regional de preços mínimos, médios e máximos para apoiar o equilíbrio de oferta entre províncias.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#E5ECE6] text-[#546459]">
                <tr>
                  <th className="py-2.5 pr-4 font-semibold">Província</th>
                  <th className="py-2.5 pr-4 font-semibold text-right">Anúncios</th>
                  <th className="py-2.5 pr-4 font-semibold text-right">Preço Mínimo</th>
                  <th className="py-2.5 pr-4 font-semibold text-right">Preço Médio</th>
                  <th className="py-2.5 font-semibold text-right">Preço Máximo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EDF2EE]">
                {data.byProvince.map((row) => (
                  <tr key={row.province} className="hover:bg-[#F7F9F7]">
                    <td className="py-2.5 pr-4 font-semibold text-[#111814]">{row.province}</td>
                    <td className="py-2.5 pr-4 text-right font-mono-tabular text-[#546459]">{row.listingsCount}</td>
                    <td className="py-2.5 pr-4 text-right font-mono-tabular text-[#546459]">
                      {formatConverted(row.minPriceKz)}
                    </td>
                    <td className="py-2.5 pr-4 text-right font-mono-tabular font-bold text-[#14532D]">
                      {formatConverted(row.avgPriceKz)}
                    </td>
                    <td className="py-2.5 text-right font-mono-tabular text-[#1C2720]">
                      {formatConverted(row.maxPriceKz)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
