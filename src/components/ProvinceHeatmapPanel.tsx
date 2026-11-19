import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Flame, MapPin, RefreshCw } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Treemap,
  XAxis,
  YAxis,
} from 'recharts';
import { apiRequest, formatCurrency } from '../lib/api';

interface ProvinceHeatmapDatum {
  province: string;
  totalProducts: number;
  agriculturalProducts: number;
  consultingServices: number;
  activeProducers: number;
  avgPriceKz: number;
  sharePct: number;
  intensity: number;
}

interface ProvinceHeatmapResponse {
  category: string;
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

const getHeatColor = (intensity: number, count: number): { fill: string; text: string; border: string; label: string } => {
  if (count === 0) {
    return { fill: '#F3F7F4', text: '#546459', border: '#DCE5DE', label: 'Sem registos' };
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
}) => {
  if (width <= 4 || height <= 4) return null;
  const style = getHeatColor(intensity, totalProducts);
  const showName = width >= 54 && height >= 28;
  const showCount = width >= 66 && height >= 46;
  const showShare = width >= 88 && height >= 64;

  return (
    <g>
      <rect
        x={x + 1.5}
        y={y + 1.5}
        width={Math.max(0, width - 3)}
        height={Math.max(0, height - 3)}
        rx={8}
        ry={8}
        fill={style.fill}
        stroke="#FFFFFF"
        strokeWidth={2}
      />
      {showName && (
        <text
          x={x + width / 2}
          y={y + height / 2 - (showCount ? 8 : 0)}
          textAnchor="middle"
          dominantBaseline="central"
          fill={style.text}
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
          fontSize={11}
          opacity={0.92}
        >
          {totalProducts} {totalProducts === 1 ? 'produto' : 'produtos'}
        </text>
      )}
      {showShare && (
        <text
          x={x + width / 2}
          y={y + height / 2 + 25}
          textAnchor="middle"
          dominantBaseline="central"
          fill={style.text}
          fontSize={10}
          opacity={0.8}
        >
          {sharePct}% do total
        </text>
      )}
    </g>
  );
};

export const ProvinceHeatmapPanel: React.FC = () => {
  const [category, setCategory] = useState<'Todas' | 'Produto Agrícola' | 'Consultoria/Formação'>('Todas');
  const [viewMode, setViewMode] = useState<'treemap' | 'bars'>('treemap');
  const [data, setData] = useState<ProvinceHeatmapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadHeatmap = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = category !== 'Todas' ? `?category=${encodeURIComponent(category)}` : '';
      const res = await apiRequest<ProvinceHeatmapResponse>(`/api/admin/principal/province-heatmap${qs}`);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar mapa de calor provincial.');
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => {
    loadHeatmap();
  }, [loadHeatmap]);

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

  const renderTooltip = ({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: Array<{ payload?: ProvinceHeatmapDatum & { name?: string } }>;
  }) => {
    if (!active || !payload || !payload[0]?.payload) return null;
    const item = payload[0].payload;
    const provName = item.province || item.name || '';
    const heat = getHeatColor(item.intensity, item.totalProducts);

    return (
      <div className="rounded-lg border border-[#DCE5DE] bg-white px-3.5 py-2.5 shadow-md text-xs space-y-1.5 min-w-[200px]">
        <div className="flex items-center justify-between gap-3 border-b border-[#EDF2EE] pb-1">
          <span className="font-bold text-[#111814]">{provName}</span>
          <span className="font-semibold text-[#14532D]">{heat.label}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-[#546459]">Produtos registados:</span>
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

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-[#DCE5DE] bg-white p-5">
          <div className="text-xs font-medium text-[#546459]">Total de Produtos Registados</div>
          <div className="mt-1 font-display text-2xl font-extrabold text-[#14532D] font-mono-tabular">
            {data ? data.summary.totalListings : '—'}
          </div>
          <div className="mt-0.5 text-[11px] text-[#546459]">
            Filtro: {category === 'Todas' ? 'Todas as categorias' : category}
          </div>
        </div>

        <div className="rounded-xl border border-[#DCE5DE] bg-white p-5">
          <div className="text-xs font-medium text-[#546459]">Províncias Ativas</div>
          <div className="mt-1 font-display text-2xl font-extrabold text-[#111814] font-mono-tabular">
            {data ? `${data.summary.activeProvincesCount} / ${data.summary.totalProvincesTracked}` : '—'}
          </div>
          <div className="mt-0.5 text-[11px] text-[#546459]">Com pelo menos 1 produto ativo</div>
        </div>

        <div className="rounded-xl border border-[#DCE5DE] bg-white p-5">
          <div className="text-xs font-medium text-[#546459]">Província Mais Ativa</div>
          <div className="mt-1 font-display text-xl font-extrabold text-[#15803D] truncate">
            {data?.summary.mostActiveProvince || '—'}
          </div>
          <div className="mt-0.5 text-[11px] text-[#546459] font-mono-tabular">
            {data?.summary.mostActiveProvince
              ? `${data.summary.mostActiveCount} ${data.summary.mostActiveCount === 1 ? 'produto' : 'produtos'}`
              : 'Sem registos'}
          </div>
        </div>

        <div className="rounded-xl border border-[#DCE5DE] bg-white p-5">
          <div className="text-xs font-medium text-[#546459]">Média por Província Ativa</div>
          <div className="mt-1 font-display text-2xl font-extrabold text-[#CA8A04] font-mono-tabular">
            {data ? data.summary.averagePerActiveProvince : '—'}
          </div>
          <div className="mt-0.5 text-[11px] text-[#546459]">Produtos por província com oferta</div>
        </div>
      </div>

      {/* Recharts Heatmap Card */}
      <div className="rounded-xl border border-[#DCE5DE] bg-white p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#EDF2EE] pb-4">
          <div>
            <h2 className="font-display text-lg font-bold text-[#111814] flex items-center gap-2">
              <Flame className="w-5 h-5 text-[#CA8A04]" />
              Mapa de Calor das Províncias Mais Ativas
            </h2>
            <p className="text-xs text-[#546459] mt-0.5">
              Intensidade geográfica da atividade comercial em Angola baseada no número de produtos registados na plataforma.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
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
              onClick={loadHeatmap}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#D4DDD6] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#1C2720] hover:bg-[#F2F7F3] disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
          </div>
        </div>

        {/* Heat Intensity Legend */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] text-[#546459]">
          <span className="font-semibold text-[#1C2720]">Escala de Intensidade (Produtos Registados):</span>
          <div className="flex flex-wrap items-center gap-3">
            {[
              { color: '#F3F7F4', border: '#DCE5DE', label: '0 (Sem registo)' },
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

        {/* Recharts Main Visualization */}
        <div className="h-80 w-full">
          {loading || !data ? (
            <div className="h-full flex items-center justify-center text-xs text-[#546459]">
              A calcular intensidade provincial de produtos...
            </div>
          ) : treemapData.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center rounded-lg border border-dashed border-[#C7D3CA] bg-[#F7F9F7] p-6 text-center">
              <MapPin className="w-8 h-8 text-[#15803D] mb-2" />
              <p className="text-sm font-semibold text-[#111814]">
                Sem produtos registados para gerar o mapa de calor
              </p>
              <p className="mt-1 text-xs text-[#546459] max-w-md">
                Assim que os utilizadores publicarem produtos na plataforma, as províncias mais ativas destacar-se-ão automaticamente neste mapa de calor Recharts.
              </p>
            </div>
          ) : viewMode === 'treemap' ? (
            <ResponsiveContainer width="100%" height="100%">
              <Treemap
                data={treemapData}
                dataKey="size"
                nameKey="name"
                stroke="#FFFFFF"
                isAnimationActive={false}
                content={<CustomHeatTile />}
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
                  width={110}
                  tick={{ fontSize: 11, fill: '#1C2720', fontWeight: 600 }}
                  stroke="#DCE5DE"
                />
                <Tooltip content={renderTooltip as never} />
                <Bar dataKey="totalProducts" name="Produtos Registados" radius={[0, 6, 6, 0]} maxBarSize={24}>
                  {barData.map((entry) => (
                    <Cell key={entry.province} fill={getHeatColor(entry.intensity, entry.totalProducts).fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Complete 18-Province Heat Matrix Grid */}
      {data && (
        <div className="rounded-xl border border-[#DCE5DE] bg-white p-6 space-y-4">
          <div>
            <h3 className="font-display text-base font-bold text-[#111814]">
              Matriz de Cobertura das 18 Províncias de Angola
            </h3>
            <p className="text-xs text-[#546459] mt-0.5">
              Visão completa da distribuição nacional para identificar polos ativos e províncias com oportunidade de expansão.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            {data.provinces.map((prov) => {
              const heat = getHeatColor(prov.intensity, prov.totalProducts);
              return (
                <div
                  key={prov.province}
                  style={{ backgroundColor: heat.fill, borderColor: heat.border, color: heat.text }}
                  className="rounded-lg border p-3 transition-transform hover:-translate-y-0.5"
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
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
