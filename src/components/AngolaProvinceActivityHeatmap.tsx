import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Flame, MapPin, RefreshCw, Search, X } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  Treemap,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { apiRequest, formatCurrency } from '../lib/api';

interface ProvinceHeatmapDatum {
  province: string;
  totalProducts: number;
  agriculturalProducts: number;
  consultingServices: number;
  recentListings30d?: number;
  activeProducers: number;
  avgPriceKz: number;
  sharePct: number;
  intensity: number;
}

interface ProvinceHeatmapResponse {
  category: string;
  period?: string;
  summary: {
    totalListings: number;
    activeProvincesCount: number;
    totalProvincesTracked: number;
    mostActiveProvince: string | null;
    mostActiveCount: number;
    averagePerActiveProvince: number;
  };
  provinces: ProvinceHeatmapDatum[];
}

// Approximate geographic coordinates (Longitude E, Latitude S) for all 18 Angolan provinces
const ANGOLA_PROVINCE_COORDS: Record<string, { lon: number; lat: number; region: string }> = {
  Cabinda: { lon: 12.2, lat: -5.55, region: 'Norte' },
  Zaire: { lon: 13.7, lat: -6.27, region: 'Norte' },
  Uíge: { lon: 15.05, lat: -7.61, region: 'Norte' },
  Bengo: { lon: 13.66, lat: -8.58, region: 'Litoral Norte' },
  Luanda: { lon: 13.23, lat: -8.84, region: 'Litoral' },
  'Cuanza Norte': { lon: 14.91, lat: -9.3, region: 'Centro-Norte' },
  Malanje: { lon: 16.34, lat: -9.54, region: 'Centro-Norte' },
  'Lunda Norte': { lon: 19.8, lat: -8.4, region: 'Leste' },
  'Lunda Sul': { lon: 20.4, lat: -9.66, region: 'Leste' },
  'Cuanza Sul': { lon: 14.3, lat: -11.2, region: 'Litoral Centro' },
  Benguela: { lon: 13.4, lat: -12.58, region: 'Litoral Sul' },
  Huambo: { lon: 15.74, lat: -12.78, region: 'Planalto Central' },
  Bié: { lon: 16.95, lat: -12.38, region: 'Planalto Central' },
  Moxico: { lon: 19.9, lat: -11.78, region: 'Leste' },
  Namibe: { lon: 12.15, lat: -15.2, region: 'Litoral Sul' },
  Huíla: { lon: 13.85, lat: -14.92, region: 'Sul' },
  Cunene: { lon: 15.73, lat: -17.07, region: 'Sul' },
  'Cuando Cubango': { lon: 18.7, lat: -15.9, region: 'Sudeste' },
};

const getHeatColor = (
  intensity: number,
  count: number
): { fill: string; text: string; border: string; label: string } => {
  if (count === 0) {
    return { fill: '#E8EFEA', text: '#3F5246', border: '#C9D6CD', label: 'Sem listagens' };
  }
  if (intensity >= 80) {
    return { fill: '#14532D', text: '#FFFFFF', border: '#0E3B20', label: 'Muito Alta' };
  }
  if (intensity >= 55) {
    return { fill: '#15803D', text: '#FFFFFF', border: '#14532D', label: 'Alta' };
  }
  if (intensity >= 30) {
    return { fill: '#22C55E', text: '#0B2E18', border: '#16A34A', label: 'Moderada' };
  }
  return { fill: '#BBF7D0', text: '#14532D', border: '#86EFAC', label: 'Baixa' };
};

interface CustomTreemapNodeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  totalProducts?: number;
  sharePct?: number;
  intensity?: number;
  selectedProvince?: string | null;
  onSelectProvince?: (province: string) => void;
}

const CustomHeatTile: React.FC<CustomTreemapNodeProps> = ({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  name = '',
  totalProducts = 0,
  sharePct = 0,
  intensity = 0,
  selectedProvince = null,
  onSelectProvince,
}) => {
  if (width <= 4 || height <= 4) return null;
  const style = getHeatColor(intensity, totalProducts);
  const isSelected = selectedProvince === name;
  const showName = width >= 54 && height >= 28;
  const showCount = width >= 66 && height >= 46;
  const showShare = width >= 88 && height >= 64;

  return (
    <g
      onClick={() => name && onSelectProvince?.(name)}
      style={{ cursor: name ? 'pointer' : 'default' }}
    >
      <rect
        x={x + 1.5}
        y={y + 1.5}
        width={Math.max(0, width - 3)}
        height={Math.max(0, height - 3)}
        rx={8}
        ry={8}
        fill={style.fill}
        stroke={isSelected ? '#EAB308' : '#121C16'}
        strokeOpacity={isSelected ? 1 : 0.14}
        strokeWidth={isSelected ? 3 : 1.5}
      />
      {showName && (
        <text
          x={x + width / 2}
          y={y + height / 2 - (showCount ? 9 : 0)}
          textAnchor="middle"
          dominantBaseline="central"
          fill={style.text}
          style={{ fill: style.text }}
          fontSize={width > 120 ? 13 : 11}
          fontWeight={700}
        >
          {name.length > 16 && width < 110 ? `${name.slice(0, 14)}…` : name}
        </text>
      )}
      {showCount && (
        <text
          x={x + width / 2}
          y={y + height / 2 + 10}
          textAnchor="middle"
          dominantBaseline="central"
          fill={style.text}
          style={{ fill: style.text }}
          fontSize={11}
          opacity={0.94}
        >
          {totalProducts} {totalProducts === 1 ? 'listagem' : 'listagens'}
        </text>
      )}
      {showShare && (
        <text
          x={x + width / 2}
          y={y + height / 2 + 25}
          textAnchor="middle"
          dominantBaseline="central"
          fill={style.text}
          style={{ fill: style.text }}
          fontSize={10}
          opacity={0.82}
        >
          {sharePct}% do total
        </text>
      )}
    </g>
  );
};

interface GeoScatterDatum extends ProvinceHeatmapDatum {
  lon: number;
  lat: number;
  region: string;
  bubbleWeight: number;
}

export const AngolaProvinceActivityHeatmap: React.FC = () => {
  const [category, setCategory] = useState<'Todas' | 'Produto Agrícola' | 'Consultoria/Formação'>('Todas');
  const [period, setPeriod] = useState<'all' | '90d' | '30d' | '7d'>('all');
  const [viewMode, setViewMode] = useState<'geo' | 'treemap' | 'bars'>('geo');
  const [provinceSearch, setProvinceSearch] = useState('');
  const [selectedProvince, setSelectedProvince] = useState<string | null>(null);
  const [data, setData] = useState<ProvinceHeatmapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadHeatmap = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (category !== 'Todas') params.set('category', category);
      if (period !== 'all') params.set('period', period);
      const qs = params.toString() ? `?${params.toString()}` : '';
      const res = await apiRequest<ProvinceHeatmapResponse>(`/api/admin/principal/province-heatmap${qs}`);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar mapa de calor das províncias.');
    } finally {
      setLoading(false);
    }
  }, [category, period]);

  useEffect(() => {
    loadHeatmap();
  }, [loadHeatmap]);

  const geoScatterData = useMemo<GeoScatterDatum[]>(() => {
    if (!data) return [];
    return data.provinces
      .filter((p) => Boolean(ANGOLA_PROVINCE_COORDS[p.province]))
      .map((p) => {
        const coords = ANGOLA_PROVINCE_COORDS[p.province];
        return {
          ...p,
          lon: coords.lon,
          lat: coords.lat,
          region: coords.region,
          bubbleWeight: p.totalProducts > 0 ? Math.max(20, p.intensity * 10 + 140) : 55,
        };
      });
  }, [data]);

  const treemapData = useMemo(() => {
    if (!data) return [];
    return data.provinces
      .filter((p) => p.totalProducts > 0)
      .map((p) => ({
        name: p.province,
        size: p.totalProducts,
        totalProducts: p.totalProducts,
        agriculturalProducts: p.agriculturalProducts,
        consultingServices: p.consultingServices,
        recentListings30d: p.recentListings30d ?? 0,
        activeProducers: p.activeProducers,
        avgPriceKz: p.avgPriceKz,
        sharePct: p.sharePct,
        intensity: p.intensity,
      }));
  }, [data]);

  const barData = useMemo(() => {
    if (!data) return [];
    return data.provinces.filter((p) => p.totalProducts > 0).slice(0, 12);
  }, [data]);

  const filteredProvinces = useMemo(() => {
    if (!data) return [];
    const q = provinceSearch.trim().toLowerCase();
    if (!q) return data.provinces;
    return data.provinces.filter((p) => p.province.toLowerCase().includes(q));
  }, [data, provinceSearch]);

  const selectedProvinceData = useMemo(() => {
    if (!data || !selectedProvince) return null;
    return data.provinces.find((p) => p.province === selectedProvince) || null;
  }, [data, selectedProvince]);

  const handleExportCsv = () => {
    if (!data) return;
    const headers = [
      'Província',
      'Região',
      'Total Listagens',
      'Produto Agrícola',
      'Consultoria/Formação',
      'Últimos 30 Dias',
      'Produtores Ativos',
      'Quota Nacional (%)',
      'Intensidade (0-100)',
      'Preço Médio (AOA)',
    ];
    const rows = data.provinces.map((p) => [
      p.province,
      ANGOLA_PROVINCE_COORDS[p.province]?.region || 'Angola',
      p.totalProducts,
      p.agriculturalProducts,
      p.consultingServices,
      p.recentListings30d ?? 0,
      p.activeProducers,
      p.sharePct,
      p.intensity,
      p.avgPriceKz,
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nzila-agro-mapa-calor-provincias-${period}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const renderTooltip = ({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: Array<{ payload?: ProvinceHeatmapDatum & { name?: string; region?: string } }>;
  }) => {
    if (!active || !payload || !payload[0]?.payload) return null;
    const item = payload[0].payload;
    const provName = item.province || item.name || '';
    const heat = getHeatColor(item.intensity, item.totalProducts);
    const region = item.region || ANGOLA_PROVINCE_COORDS[provName]?.region;

    return (
      <div className="rounded-lg border border-[#DCE5DE] bg-white px-3.5 py-2.5 shadow-md text-xs space-y-1.5 min-w-[215px]">
        <div className="flex items-center justify-between gap-3 border-b border-[#EDF2EE] pb-1.5">
          <div>
            <span className="font-bold text-[#111814]">{provName}</span>
            {region && <span className="ml-1.5 text-[11px] text-[#546459]">· {region}</span>}
          </div>
          <span className="font-semibold text-[#14532D]">{heat.label}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-[#546459]">Listagens no período:</span>
          <span className="font-mono-tabular font-bold text-[#111814]">{item.totalProducts}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-[#546459]">Produto Agrícola:</span>
          <span className="font-mono-tabular font-semibold text-[#15803D]">{item.agriculturalProducts}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-[#546459]">Consultoria/Formação:</span>
          <span className="font-mono-tabular font-semibold text-[#CA8A04]">{item.consultingServices}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-[#546459]">Últimos 30 dias:</span>
          <span className="font-mono-tabular text-[#111814]">{item.recentListings30d ?? 0}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-[#546459]">Produtores ativos:</span>
          <span className="font-mono-tabular text-[#111814]">{item.activeProducers}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-[#546459]">Quota nacional:</span>
          <span className="font-mono-tabular font-bold text-[#14532D]">{item.sharePct}%</span>
        </div>
        {item.avgPriceKz > 0 && (
          <div className="flex justify-between gap-4 pt-1 border-t border-[#EDF2EE]">
            <span className="text-[#546459]">Preço médio:</span>
            <span className="font-mono-tabular font-bold text-[#111814]">
              {formatCurrency(item.avgPriceKz, 'AOA')}
            </span>
          </div>
        )}
      </div>
    );
  };

  const periodLabel =
    period === '7d'
      ? 'Últimos 7 dias'
      : period === '30d'
        ? 'Últimos 30 dias'
        : period === '90d'
          ? 'Últimos 90 dias'
          : 'Todo o período';

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-[#DCE5DE] bg-white p-5">
          <div className="text-xs font-medium text-[#546459]">Total de Listagens</div>
          <div className="mt-1 font-display text-2xl font-extrabold text-[#14532D] font-mono-tabular">
            {loading && !data ? '—' : data?.summary.totalListings ?? 0}
          </div>
          <div className="mt-0.5 text-[11px] text-[#546459]">
            {periodLabel} · {category === 'Todas' ? 'Todas as categorias' : category}
          </div>
        </div>

        <div className="rounded-xl border border-[#DCE5DE] bg-white p-5">
          <div className="text-xs font-medium text-[#546459]">Províncias com Atividade</div>
          <div className="mt-1 font-display text-2xl font-extrabold text-[#111814] font-mono-tabular">
            {data ? `${data.summary.activeProvincesCount} / ${data.summary.totalProvincesTracked}` : '—'}
          </div>
          <div className="mt-0.5 text-[11px] text-[#546459]">Cobertura territorial em Angola</div>
        </div>

        <div className="rounded-xl border border-[#DCE5DE] bg-white p-5">
          <div className="text-xs font-medium text-[#546459]">Polo Mais Ativo</div>
          <div className="mt-1 font-display text-xl font-extrabold text-[#15803D] truncate">
            {data?.summary.mostActiveProvince || '—'}
          </div>
          <div className="mt-0.5 text-[11px] text-[#546459] font-mono-tabular">
            {data?.summary.mostActiveProvince
              ? `${data.summary.mostActiveCount} ${data.summary.mostActiveCount === 1 ? 'listagem' : 'listagens'}`
              : 'Sem listagens no período'}
          </div>
        </div>

        <div className="rounded-xl border border-[#DCE5DE] bg-white p-5">
          <div className="text-xs font-medium text-[#546459]">Média por Província Ativa</div>
          <div className="mt-1 font-display text-2xl font-extrabold text-[#CA8A04] font-mono-tabular">
            {data ? data.summary.averagePerActiveProvince : '—'}
          </div>
          <div className="mt-0.5 text-[11px] text-[#546459]">Listagens por província com oferta</div>
        </div>
      </div>

      {/* Recharts Main Heatmap Panel */}
      <div className="rounded-xl border border-[#DCE5DE] bg-white p-6 space-y-5">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-[#EDF2EE] pb-4">
          <div>
            <h2 className="font-display text-lg font-bold text-[#111814] flex items-center gap-2">
              <Flame className="w-5 h-5 text-[#CA8A04]" />
              Mapa de Calor das Províncias Angolanas
            </h2>
            <p className="text-xs text-[#546459] mt-0.5">
              Concentração geográfica e intensidade de listagem de produtos por província. Clique numa província para ver detalhes.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as typeof period)}
              aria-label="Filtrar período de atividade"
              className="rounded-lg border border-[#D4DDD6] bg-white px-3 py-1.5 text-xs font-medium text-[#1C2720] focus:border-[#15803D] focus:outline-none"
            >
              <option value="all">Todo o Período</option>
              <option value="90d">Últimos 90 dias</option>
              <option value="30d">Últimos 30 dias</option>
              <option value="7d">Últimos 7 dias</option>
            </select>

            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as typeof category)}
              aria-label="Filtrar mapa de calor por categoria"
              className="rounded-lg border border-[#D4DDD6] bg-white px-3 py-1.5 text-xs font-medium text-[#1C2720] focus:border-[#15803D] focus:outline-none"
            >
              <option value="Todas">Todas as Categorias</option>
              <option value="Produto Agrícola">Produto Agrícola</option>
              <option value="Consultoria/Formação">Consultoria/Formação</option>
            </select>

            <div className="flex items-center gap-1 rounded-lg bg-[#F2F7F3] p-1 border border-[#DCE5DE]">
              <button
                type="button"
                onClick={() => setViewMode('geo')}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
                  viewMode === 'geo'
                    ? 'bg-white text-[#14532D] shadow-sm'
                    : 'text-[#445449] hover:text-[#111814]'
                }`}
              >
                Mapa Geográfico
              </button>
              <button
                type="button"
                onClick={() => setViewMode('treemap')}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
                  viewMode === 'treemap'
                    ? 'bg-white text-[#14532D] shadow-sm'
                    : 'text-[#445449] hover:text-[#111814]'
                }`}
              >
                Mapa de Calor
              </button>
              <button
                type="button"
                onClick={() => setViewMode('bars')}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
                  viewMode === 'bars'
                    ? 'bg-white text-[#14532D] shadow-sm'
                    : 'text-[#445449] hover:text-[#111814]'
                }`}
              >
                Ranking (Barras)
              </button>
            </div>

            <button
              type="button"
              onClick={handleExportCsv}
              disabled={!data}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#D4DDD6] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#1C2720] hover:bg-[#F2F7F3] disabled:opacity-50 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              CSV
            </button>

            <button
              type="button"
              onClick={loadHeatmap}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#D4DDD6] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#1C2720] hover:bg-[#F2F7F3] disabled:opacity-50 whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
          </div>
        </div>

        {/* Heat Intensity Legend */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] text-[#546459]">
          <span className="font-semibold text-[#1C2720]">Escala de Intensidade (Listagens de Produtos):</span>
          <div className="flex flex-wrap items-center gap-3">
            {[
              { color: '#E8EFEA', border: '#C9D6CD', label: '0 (Sem listagem)' },
              { color: '#BBF7D0', border: '#86EFAC', label: 'Baixa' },
              { color: '#22C55E', border: '#16A34A', label: 'Moderada' },
              { color: '#15803D', border: '#14532D', label: 'Alta' },
              { color: '#14532D', border: '#0E3B20', label: 'Muito Alta (Líder)' },
            ].map((step) => (
              <span key={step.label} className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block w-3.5 h-3.5 rounded-sm border"
                  style={{ backgroundColor: step.color, borderColor: step.border }}
                />
                {step.label}
              </span>
            ))}
          </div>
        </div>

        {/* Recharts Main Canvas */}
        <div className="h-[360px] w-full">
          {loading && !data ? (
            <div className="h-full flex flex-col justify-center gap-3 px-4">
              <div className="h-8 w-1/3 rounded bg-[#EEF3EF] animate-pulse" />
              <div className="h-60 w-full rounded-lg bg-[#F2F7F3] animate-pulse" />
            </div>
          ) : viewMode === 'geo' ? (
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 28, bottom: 20, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5ECE6" />
                <XAxis
                  type="number"
                  dataKey="lon"
                  name="Longitude"
                  domain={[11.2, 22.5]}
                  tickFormatter={(v) => `${v}°E`}
                  tick={{ fontSize: 11, fill: '#546459' }}
                  stroke="#DCE5DE"
                  label={{ value: 'Oeste ← Longitude (Angola) → Leste', position: 'insideBottom', offset: -10, fontSize: 11, fill: '#546459' }}
                />
                <YAxis
                  type="number"
                  dataKey="lat"
                  name="Latitude"
                  domain={[-18.2, -4.6]}
                  tickFormatter={(v) => `${Math.abs(v)}°S`}
                  tick={{ fontSize: 11, fill: '#546459' }}
                  stroke="#DCE5DE"
                />
                <ZAxis type="number" dataKey="bubbleWeight" range={[110, 1200]} />
                <Tooltip cursor={{ strokeDasharray: '3 3', stroke: '#15803D' }} content={renderTooltip as never} />
                <Scatter
                  name="Províncias de Angola"
                  data={geoScatterData}
                  onClick={(entry) => {
                    const prov = (entry as unknown as GeoScatterDatum)?.province;
                    if (prov) setSelectedProvince((prev) => (prev === prov ? null : prov));
                  }}
                >
                  {geoScatterData.map((entry) => {
                    const heat = getHeatColor(entry.intensity, entry.totalProducts);
                    const isSelected = selectedProvince === entry.province;
                    return (
                      <Cell
                        key={entry.province}
                        fill={heat.fill}
                        stroke={isSelected ? '#EAB308' : heat.border}
                        strokeWidth={isSelected ? 3 : 1.5}
                        style={{ cursor: 'pointer' }}
                      />
                    );
                  })}
                  <LabelList
                    dataKey="province"
                    position="top"
                    offset={8}
                    style={{ fontSize: 10, fontWeight: 600, fill: '#445449', pointerEvents: 'none' }}
                  />
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          ) : treemapData.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center rounded-lg border border-dashed border-[#C7D3CA] bg-[#F7F9F7] p-6 text-center">
              <MapPin className="w-8 h-8 text-[#15803D] mb-2" />
              <p className="text-sm font-semibold text-[#111814]">
                Sem listagens de produtos para os filtros selecionados
              </p>
              <p className="mt-1 text-xs text-[#546459] max-w-md">
                Ajuste o período ou categoria, ou aguarde novas publicações de produtores para visualizar a distribuição proporcional no mapa de calor.
              </p>
              {(period !== 'all' || category !== 'Todas') && (
                <button
                  type="button"
                  onClick={() => {
                    setPeriod('all');
                    setCategory('Todas');
                  }}
                  className="mt-3 rounded-lg bg-[#14532D] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#15803D]"
                >
                  Limpar filtros
                </button>
              )}
            </div>
          ) : viewMode === 'treemap' ? (
            <ResponsiveContainer width="100%" height="100%">
              <Treemap
                data={treemapData}
                dataKey="size"
                nameKey="name"
                stroke="#FFFFFF"
                isAnimationActive={false}
                content={
                  <CustomHeatTile
                    selectedProvince={selectedProvince}
                    onSelectProvince={(prov) =>
                      setSelectedProvince((prev) => (prev === prov ? null : prov))
                    }
                  />
                }
              >
                <Tooltip content={renderTooltip as never} />
              </Treemap>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={barData}
                layout="vertical"
                margin={{ top: 8, right: 24, left: 20, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E5ECE6" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#546459' }} stroke="#DCE5DE" />
                <YAxis
                  type="category"
                  dataKey="province"
                  width={116}
                  tick={{ fontSize: 11, fill: '#1C2720', fontWeight: 600 }}
                  stroke="#DCE5DE"
                />
                <Tooltip content={renderTooltip as never} />
                <Bar
                  dataKey="totalProducts"
                  name="Listagens de Produtos"
                  radius={[0, 6, 6, 0]}
                  maxBarSize={24}
                  onClick={(entry) => {
                    const prov = (entry as unknown as ProvinceHeatmapDatum)?.province;
                    if (prov) setSelectedProvince((prev) => (prev === prov ? null : prov));
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  {barData.map((entry) => {
                    const heat = getHeatColor(entry.intensity, entry.totalProducts);
                    const isSelected = selectedProvince === entry.province;
                    return (
                      <Cell
                        key={entry.province}
                        fill={heat.fill}
                        stroke={isSelected ? '#EAB308' : 'none'}
                        strokeWidth={isSelected ? 2 : 0}
                      />
                    );
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Selected Province Detail Bar */}
        {selectedProvinceData && (
          <div className="border-t border-[#EDF2EE] pt-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-bold text-[#111814]">
                <span>{selectedProvinceData.province}</span>
                <span className="text-[#546459] font-normal">·</span>
                <span className="text-xs font-medium text-[#546459]">
                  {ANGOLA_PROVINCE_COORDS[selectedProvinceData.province]?.region || 'Angola'}
                </span>
                <span className="text-[#546459] font-normal">·</span>
                <span className="text-xs font-semibold text-[#15803D]">
                  Intensidade {getHeatColor(selectedProvinceData.intensity, selectedProvinceData.totalProducts).label}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#445449]">
                <span className="font-mono-tabular">
                  <strong className="text-[#111814]">{selectedProvinceData.totalProducts}</strong> listagens
                </span>
                <span className="font-mono-tabular">
                  <strong className="text-[#15803D]">{selectedProvinceData.agriculturalProducts}</strong> agrícolas
                </span>
                <span className="font-mono-tabular">
                  <strong className="text-[#CA8A04]">{selectedProvinceData.consultingServices}</strong> consultoria
                </span>
                <span className="font-mono-tabular">
                  <strong className="text-[#111814]">{selectedProvinceData.recentListings30d ?? 0}</strong> nos últimos 30d
                </span>
                <span className="font-mono-tabular">
                  <strong className="text-[#111814]">{selectedProvinceData.activeProducers}</strong> produtores
                </span>
                <span className="font-mono-tabular">
                  Quota: <strong className="text-[#14532D]">{selectedProvinceData.sharePct}%</strong>
                </span>
                {selectedProvinceData.avgPriceKz > 0 && (
                  <span className="font-mono-tabular">
                    Preço médio: <strong className="text-[#111814]">{formatCurrency(selectedProvinceData.avgPriceKz, 'AOA')}</strong>
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedProvince(null)}
              className="self-start lg:self-center inline-flex items-center gap-1 rounded-lg border border-[#D4DDD6] px-2.5 py-1 text-xs font-medium text-[#445449] hover:text-[#111814] hover:bg-[#F2F7F3] whitespace-nowrap"
            >
              <X className="w-3.5 h-3.5" />
              Limpar seleção
            </button>
          </div>
        )}
      </div>

      {/* Complete 18-Province Heat Matrix Grid */}
      {data && (
        <div className="rounded-xl border border-[#DCE5DE] bg-white p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-base font-bold text-[#111814]">
                Matriz de Cobertura das 18 Províncias de Angola
              </h3>
              <p className="text-xs text-[#546459] mt-0.5">
                Visão completa da distribuição nacional para identificar polos ativos e províncias com oportunidade de expansão.
              </p>
            </div>

            <div className="relative w-full sm:w-56">
              <Search className="w-3.5 h-3.5 text-[#546459] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={provinceSearch}
                onChange={(e) => setProvinceSearch(e.target.value)}
                placeholder="Filtrar província..."
                className="w-full rounded-lg border border-[#D4DDD6] bg-white pl-8 pr-3 py-1.5 text-xs text-[#1C2720] focus:border-[#15803D] focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            {filteredProvinces.map((prov) => {
              const heat = getHeatColor(prov.intensity, prov.totalProducts);
              const isSelected = selectedProvince === prov.province;
              return (
                <button
                  key={prov.province}
                  type="button"
                  onClick={() => setSelectedProvince((prev) => (prev === prov.province ? null : prov.province))}
                  style={{
                    backgroundColor: heat.fill,
                    borderColor: isSelected ? '#EAB308' : heat.border,
                    color: heat.text,
                  }}
                  className={`rounded-lg border p-3 text-left transition-transform hover:-translate-y-0.5 focus:outline-none ${
                    isSelected ? 'ring-2 ring-[#EAB308]' : ''
                  }`}
                >
                  <div className="text-xs font-bold truncate" title={prov.province}>
                    {prov.province}
                  </div>
                  <div className="mt-1 flex items-baseline justify-between gap-1">
                    <span className="font-display text-lg font-extrabold font-mono-tabular">
                      {prov.totalProducts}
                    </span>
                    <span className="text-[10px] font-mono-tabular opacity-85">
                      {prov.sharePct}%
                    </span>
                  </div>
                  <div className="mt-0.5 text-[10px] opacity-85 truncate">
                    {prov.activeProducers} {prov.activeProducers === 1 ? 'produtor' : 'produtores'}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
