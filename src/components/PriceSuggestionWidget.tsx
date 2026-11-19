import React, { useEffect, useState } from 'react';
import { Loader2, Sparkles, TrendingUp } from 'lucide-react';
import { apiRequest, formatCurrency } from '../lib/api';
import type { ListingCategory } from '../types';

interface PriceSuggestionWidgetProps {
  category: ListingCategory;
  province: string;
  title: string;
  unit: string;
  onApplyPrice: (priceKz: number) => void;
}

interface PriceSuggestionResponse {
  suggestion: {
    minPriceKz: number;
    recommendedPriceKz: number;
    maxPriceKz: number;
    marketInsight: string;
    tip: string;
  };
  localStats: {
    count: number;
    avgPriceKz: number | null;
    minPriceKz: number | null;
    maxPriceKz: number | null;
  };
}

export const PriceSuggestionWidget: React.FC<PriceSuggestionWidgetProps> = ({
  category,
  province,
  title,
  unit,
  onApplyPrice,
}) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PriceSuggestionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset stale suggestion when category or province changes
  useEffect(() => {
    setResult(null);
    setError(null);
  }, [category, province]);

  const handleSuggestPrice = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<PriceSuggestionResponse>('/api/users/listings/suggest-price', {
        method: 'POST',
        body: JSON.stringify({
          category,
          province,
          title,
          unit,
        }),
      });
      setResult(res);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Não foi possível obter a sugestão de preço neste momento.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="sm:col-span-2 rounded-xl border border-[#15803D]/30 bg-[#F2F7F3] p-4 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="space-y-0.5">
          <div className="text-xs font-bold text-[#14532D] flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-[#CA8A04]" />
            Sugestão Inteligente de Faixa de Preço ({province})
          </div>
          <p className="text-[11px] text-[#546459]">
            Consulte uma faixa competitiva em Kwanzas para <strong>{category}</strong> em{' '}
            <strong>{province}</strong>
            {title.trim() ? ` (${title.trim()})` : ''}.
          </p>
        </div>

        <button
          type="button"
          disabled={loading}
          onClick={handleSuggestPrice}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#14532D] px-3.5 py-2 text-xs font-bold text-white hover:bg-[#15803D] disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto"
        >
          {loading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              A analisar mercado...
            </>
          ) : (
            <>
              <TrendingUp className="w-3.5 h-3.5 text-[#FACC15]" />
              {result ? 'Atualizar Sugestão' : 'Sugerir Preço de Mercado'}
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-3 pt-2 border-t border-[#DCE5DE]">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <button
              type="button"
              onClick={() => onApplyPrice(result.suggestion.minPriceKz)}
              className="text-left rounded-lg border border-[#DCE5DE] bg-white px-3 py-2.5 hover:border-[#15803D] transition-colors"
            >
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[#546459]">
                Mínimo Competitivo
              </div>
              <div className="mt-0.5 font-display text-sm font-extrabold text-[#111814] font-mono-tabular">
                {formatCurrency(result.suggestion.minPriceKz, 'AOA')}
              </div>
              <div className="mt-0.5 text-[10px] font-semibold text-[#15803D]">
                Clique para aplicar
              </div>
            </button>

            <button
              type="button"
              onClick={() => onApplyPrice(result.suggestion.recommendedPriceKz)}
              className="text-left rounded-lg border-2 border-[#15803D] bg-white px-3 py-2.5 hover:bg-[#EEF7F0] transition-colors"
            >
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[#14532D]">
                Preço Recomendado
              </div>
              <div className="mt-0.5 font-display text-base font-extrabold text-[#14532D] font-mono-tabular">
                {formatCurrency(result.suggestion.recommendedPriceKz, 'AOA')}
              </div>
              <div className="mt-0.5 text-[10px] font-semibold text-[#CA8A04]">
                Aplicar preço ideal
              </div>
            </button>

            <button
              type="button"
              onClick={() => onApplyPrice(result.suggestion.maxPriceKz)}
              className="text-left rounded-lg border border-[#DCE5DE] bg-white px-3 py-2.5 hover:border-[#15803D] transition-colors"
            >
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[#546459]">
                Máximo de Mercado
              </div>
              <div className="mt-0.5 font-display text-sm font-extrabold text-[#111814] font-mono-tabular">
                {formatCurrency(result.suggestion.maxPriceKz, 'AOA')}
              </div>
              <div className="mt-0.5 text-[10px] font-semibold text-[#15803D]">
                Clique para aplicar
              </div>
            </button>
          </div>

          <div className="rounded-lg border border-[#DCE5DE] bg-white px-3.5 py-2.5 text-xs space-y-1">
            <p className="text-[#1C2720]">{result.suggestion.marketInsight}</p>
            <p className="text-[#14532D] font-medium">Dica: {result.suggestion.tip}</p>
            {result.localStats.count > 0 && result.localStats.avgPriceKz && (
              <p className="text-[11px] text-[#546459] font-mono-tabular pt-1 border-t border-[#EDF2EE]">
                Referência interna em {province}: {result.localStats.count}{' '}
                {result.localStats.count === 1 ? 'anúncio' : 'anúncios'} · Média{' '}
                {formatCurrency(result.localStats.avgPriceKz, 'AOA')}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
