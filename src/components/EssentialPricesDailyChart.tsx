import React, { useMemo } from 'react';
import { BarChart3, TrendingDown, TrendingUp } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { convertFromKz, formatCurrency } from '../lib/api';
import type { CurrencyCode, FinancialSettings, Listing } from '../types';

interface EssentialPricesDailyChartProps {
  listings: Listing[];
  settings: FinancialSettings;
  currency: CurrencyCode;
}

interface EssentialBasketSpec {
  id: string;
  label: string;
  keywords: string[];
  unit: string;
  fallbackPrevKz: number;
  fallbackTodayKz: number;
}

const ESSENTIAL_BASKET: EssentialBasketSpec[] = [
  {
    id: 'milho',
    label: 'Milho',
    keywords: ['milho', 'fuba'],
    unit: 'Saco 50kg',
    fallbackPrevKz: 28000,
    fallbackTodayKz: 28500,
  },
  {
    id: 'mandioca',
    label: 'Mandioca',
    keywords: ['mandioca', 'bombom', 'bombo'],
    unit: 'Saco 50kg',
    fallbackPrevKz: 22500,
    fallbackTodayKz: 21800,
  },
  {
    id: 'feijao',
    label: 'Feijão',
    keywords: ['feijao', 'feijão'],
    unit: 'Saco 50kg',
    fallbackPrevKz: 46000,
    fallbackTodayKz: 47200,
  },
  {
    id: 'batata',
    label: 'Batata Rena',
    keywords: ['batata'],
    unit: 'Saco 50kg',
    fallbackPrevKz: 31000,
    fallbackTodayKz: 30200,
  },
  {
    id: 'tomate',
    label: 'Tomate',
    keywords: ['tomate'],
    unit: 'Caixa 25kg',
    fallbackPrevKz: 19500,
    fallbackTodayKz: 20400,
  },
  {
    id: 'banana',
    label: 'Banana',
    keywords: ['banana'],
    unit: 'Cacho / Caixa',
    fallbackPrevKz: 14800,
    fallbackTodayKz: 14500,
  },
];

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

interface DailyBarRow {
  product: string;
  unit: string;
  previousPrice: number;
  currentPrice: number;
  previousKz: number;
  currentKz: number;
  variationPct: number;
  listingsCount: number;
  source: 'live' | 'reference';
}

export const EssentialPricesDailyChart: React.FC<EssentialPricesDailyChartProps> = ({
  listings,
  settings,
  currency,
}) => {
  const { chartRows, hasLiveData } = useMemo(() => {
    const agroListings = listings.filter((l) => l.category === 'Produto Agrícola' && l.priceKz > 0);
    const todayKey = new Date().toISOString().slice(0, 10);
    let anyLive = false;

    // Slight exchange-rate factor from overview settings so reference values reflect current Kz/USD
    const fxFactor = settings.rateUsdToKz > 0 ? settings.rateUsdToKz / 915 : 1;

    const rows: DailyBarRow[] = ESSENTIAL_BASKET.map((spec) => {
      const matched = agroListings
        .filter((l) => {
          const hay = normalizeText(`${l.title} ${l.description}`);
          return spec.keywords.some((kw) => hay.includes(normalizeText(kw)));
        })
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      if (matched.length > 0) {
        anyLive = true;
        const todayItems = matched.filter((m) => String(m.createdAt || '').slice(0, 10) === todayKey);
        const earlierItems = matched.filter((m) => String(m.createdAt || '').slice(0, 10) !== todayKey);

        const avg = (arr: Listing[]) =>
          Math.round(arr.reduce((sum, item) => sum + Number(item.priceKz || 0), 0) / arr.length);

        let currentKz: number;
        let previousKz: number;

        if (todayItems.length > 0 && earlierItems.length > 0) {
          currentKz = avg(todayItems);
          previousKz = avg(earlierItems);
        } else if (matched.length >= 2) {
          currentKz = Math.round(matched[0].priceKz);
          previousKz = avg(matched.slice(1));
        } else {
          currentKz = Math.round(matched[0].priceKz);
          previousKz = Math.round(spec.fallbackPrevKz * fxFactor);
        }

        const variationPct =
          previousKz > 0 ? Number((((currentKz - previousKz) / previousKz) * 100).toFixed(1)) : 0;

        return {
          product: spec.label,
          unit: matched[0].unit || spec.unit,
          previousKz,
          currentKz,
          previousPrice: Number(convertFromKz(previousKz, currency, settings).toFixed(currency === 'AOA' ? 0 : 2)),
          currentPrice: Number(convertFromKz(currentKz, currency, settings).toFixed(currency === 'AOA' ? 0 : 2)),
          variationPct,
          listingsCount: matched.length,
          source: 'live',
        };
      }

      const previousKz = Math.round((spec.fallbackPrevKz * fxFactor) / 100) * 100;
      const currentKz = Math.round((spec.fallbackTodayKz * fxFactor) / 100) * 100;
      const variationPct =
        previousKz > 0 ? Number((((currentKz - previousKz) / previousKz) * 100).toFixed(1)) : 0;

      return {
        product: spec.label,
        unit: spec.unit,
        previousKz,
        currentKz,
        previousPrice: Number(convertFromKz(previousKz, currency, settings).toFixed(currency === 'AOA' ? 0 : 2)),
        currentPrice: Number(convertFromKz(currentKz, currency, settings).toFixed(currency === 'AOA' ? 0 : 2)),
        variationPct,
        listingsCount: 0,
        source: 'reference',
      };
    });

    return { chartRows: rows, hasLiveData: anyLive };
  }, [listings, settings, currency]);

  const renderTooltip = ({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: Array<{ payload?: DailyBarRow }>;
  }) => {
    if (!active || !payload || !payload[0]?.payload) return null;
    const row = payload[0].payload;
    const sign = row.variationPct > 0 ? '+' : '';

    return (
      <div className="rounded-lg border border-[#DCE5DE] bg-white px-3.5 py-2.5 shadow-md text-xs space-y-1.5 min-w-[195px]">
        <div className="font-bold text-[#111814] border-b border-[#EDF2EE] pb-1">
          {row.product} <span className="font-normal text-[#546459]">({row.unit})</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-[#546459]">Dia Anterior:</span>
          <span className="font-mono-tabular font-semibold text-[#445449]">
            {formatCurrency(row.previousPrice, currency)}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-[#546459]">Preço Hoje:</span>
          <span className="font-mono-tabular font-bold text-[#14532D]">
            {formatCurrency(row.currentPrice, currency)}
          </span>
        </div>
        <div className="flex justify-between gap-4 pt-1 border-t border-[#EDF2EE]">
          <span className="text-[#546459]">Variação Diária:</span>
          <span
            className={`font-mono-tabular font-bold ${
              row.variationPct > 0
                ? 'text-[#B45309]'
                : row.variationPct < 0
                ? 'text-[#15803D]'
                : 'text-[#546459]'
            }`}
          >
            {sign}
            {row.variationPct}%
          </span>
        </div>
        <div className="text-[10px] text-[#7B8B80]">
          {row.source === 'live'
            ? `Baseado em ${row.listingsCount} ${row.listingsCount === 1 ? 'listagem ativa' : 'listagens ativas'}`
            : 'Cotação de referência de mercado'}
        </div>
      </div>
    );
  };

  return (
    <section id="precos-diarios" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mt-14">
      <div className="rounded-xl border border-[#DCE5DE] bg-white p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#EDF2EE] pb-4">
          <div>
            <h2 className="font-display text-xl sm:text-2xl font-bold text-[#111814] flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-[#15803D]" />
              Variação Diária de Preços · Produtos Essenciais
            </h2>
            <p className="mt-1 text-sm text-[#546459]">
              Comparativo diário entre o preço do dia anterior e o preço atual dos principais produtos da cesta agrícola em{' '}
              <strong>{currency === 'AOA' ? 'Kwanzas (Kz)' : currency}</strong>.
            </p>
          </div>
          <span className="text-xs font-semibold text-[#14532D] bg-[#F2F7F3] border border-[#DCE5DE] rounded-lg px-3 py-1.5 whitespace-nowrap self-start sm:self-auto">
            {hasLiveData ? 'Sincronizado com a Vitrine' : 'Referência Diária de Mercado'}
          </span>
        </div>

        {/* Simple Recharts Bar Chart */}
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartRows} margin={{ top: 10, right: 16, left: 6, bottom: 4 }} barGap={6}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5ECE6" vertical={false} />
              <XAxis
                dataKey="product"
                tick={{ fontSize: 12, fill: '#1C2720', fontWeight: 600 }}
                stroke="#DCE5DE"
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#546459' }}
                stroke="#DCE5DE"
                tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
              />
              <Tooltip content={renderTooltip as never} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar
                dataKey="previousPrice"
                name="Dia Anterior"
                fill="#A7C4B0"
                radius={[5, 5, 0, 0]}
                maxBarSize={30}
              />
              <Bar
                dataKey="currentPrice"
                name="Preço Hoje"
                fill="#15803D"
                radius={[5, 5, 0, 0]}
                maxBarSize={30}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Compact Daily Variation Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-2 border-t border-[#EDF2EE]">
          {chartRows.map((row) => {
            const isUp = row.variationPct > 0;
            const isDown = row.variationPct < 0;
            return (
              <div
                key={row.product}
                className="rounded-lg border border-[#E5ECE6] bg-[#F7F9F7] px-3 py-2.5 space-y-1"
              >
                <div className="text-xs font-bold text-[#111814] truncate">{row.product}</div>
                <div className="text-sm font-extrabold font-mono-tabular text-[#14532D]">
                  {formatCurrency(row.currentPrice, currency)}
                </div>
                <div
                  className={`inline-flex items-center gap-1 text-[11px] font-mono-tabular font-semibold ${
                    isUp ? 'text-[#B45309]' : isDown ? 'text-[#15803D]' : 'text-[#546459]'
                  }`}
                >
                  {isUp && <TrendingUp className="w-3 h-3" />}
                  {isDown && <TrendingDown className="w-3 h-3" />}
                  <span>
                    {isUp ? '+' : ''}
                    {row.variationPct}% hoje
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
