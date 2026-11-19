import React, { useCallback, useEffect, useRef, useState } from 'react';
import { jsPDF } from 'jspdf';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  FileText,
  Lightbulb,
  Loader2,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { apiRequest, formatCurrency } from '../lib/api';

interface ExecutiveSummaryResponse {
  id?: number;
  generatedAt: string;
  generatedBy?: string;
  metrics: {
    periodLabel: string;
    periodMode?: 'current_month' | 'last_30d';
    focus: string;
    totalUsers: number;
    newUsersLast30d: number;
    activeUsers: number;
    pendingUsers: number;
    activeQuotas: number;
    estimatedQuotaRevenueKz?: number;
    bonusesGrantedKz?: number;
    totalListings: number;
    newListingsLast30d: number;
    agriculturalListingsInPeriod?: number;
    consultingListingsInPeriod?: number;
    avgListingPriceKz: number;
    topProvinces: Array<{ province: string; count: number }>;
    salesCountLast30d: number;
    salesVolumeKzLast30d: number;
    avgSaleTicketKzLast30d?: number;
    prevSalesVolumeKz?: number;
    salesGrowthPct?: number | null;
    conversionRatePct?: number | null;
    topSellingProducts?: Array<{ title: string; salesCount: number; volumeKz: number }>;
    inquiriesLast30d: number;
    donationsCountLast30d: number;
    donationsTotalKzLast30d: number;
    openSupportTickets: number;
    pendingRecoveries: number;
    auditEventsLast30d: number;
  };
  report: {
    headline: string;
    executiveNarrative: string;
    keyHighlights: string[];
    attentionPoints: string[];
    strategicRecommendations: string[];
  };
}

const FOCUS_OPTIONS = [
  'Desempenho Financeiro e Listagens',
  'Visão Geral Executiva',
  'Vendas e Mercado Agrícola',
  'Crescimento e Utilizadores',
  'Operações, Moderação e Governança',
] as const;

export const ExecutiveSummaryPanel: React.FC = () => {
  const [focus, setFocus] = useState<string>(FOCUS_OPTIONS[0]);
  const [periodMode, setPeriodMode] = useState<'current_month' | 'last_30d'>('current_month');
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [data, setData] = useState<ExecutiveSummaryResponse | null>(null);
  const [history, setHistory] = useState<ExecutiveSummaryResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const autoTriggeredRef = useRef(false);

  const handleGenerate = useCallback(
    async (selectedFocus?: string, selectedPeriodMode?: 'current_month' | 'last_30d') => {
      const targetFocus = selectedFocus || focus;
      const targetPeriod = selectedPeriodMode || periodMode;
      setLoading(true);
      setError(null);
      try {
        const res = await apiRequest<ExecutiveSummaryResponse>(
          '/api/admin/principal/executive-summary',
          {
            method: 'POST',
            body: JSON.stringify({ focus: targetFocus, periodMode: targetPeriod }),
          }
        );
        setData(res);
        setHistory((prev) => [res, ...prev.filter((item) => item.id !== res.id)].slice(0, 10));
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Erro ao gerar relatório executivo do mês corrente.'
        );
      } finally {
        setLoading(false);
      }
    },
    [focus, periodMode]
  );

  // Automatically load saved executive reports; if none exists yet, auto-generate the first monthly report
  useEffect(() => {
    let active = true;
    const init = async () => {
      setLoadingHistory(true);
      try {
        const res = await apiRequest<{ reports: ExecutiveSummaryResponse[] }>(
          '/api/admin/principal/executive-summary/history'
        );
        if (!active) return;
        const saved = res.reports || [];
        setHistory(saved);
        if (saved.length > 0) {
          setData(saved[0]);
        } else if (!autoTriggeredRef.current) {
          autoTriggeredRef.current = true;
          void handleGenerate(FOCUS_OPTIONS[0]);
        }
      } catch {
        // If history fetch fails, let the admin trigger manually
      } finally {
        if (active) setLoadingHistory(false);
      }
    };
    void init();
    return () => {
      active = false;
    };
  }, [handleGenerate]);

  const handleCopyText = async () => {
    if (!data) return;
    const text = [
      `NZILA AGRO — ${data.report.headline}`,
      `Período: ${data.metrics.periodLabel} | Foco: ${data.metrics.focus}`,
      '',
      data.report.executiveNarrative,
      '',
      'PRINCIPAIS DESTAQUES:',
      ...data.report.keyHighlights.map((h) => `• ${h}`),
      '',
      'PONTOS DE ATENÇÃO:',
      ...data.report.attentionPoints.map((a) => `• ${a}`),
      '',
      'RECOMENDAÇÕES ESTRATÉGICAS:',
      ...data.report.strategicRecommendations.map((r, i) => `${i + 1}. ${r}`),
    ].join('\n');

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard failures
    }
  };

  const handleExportPdf = () => {
    if (!data) return;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const margin = 16;
    const maxW = doc.internal.pageSize.getWidth() - margin * 2;
    let y = 18;

    const ensureSpace = (needed: number) => {
      if (y + needed > 280) {
        doc.addPage();
        y = 18;
      }
    };

    doc.setFillColor(20, 83, 45);
    doc.rect(0, 0, 210, 26, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('NZILA AGRO — RELATÓRIO EXECUTIVO MENSAL', margin, 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(254, 240, 138);
    doc.text(`${data.metrics.periodLabel} · Foco: ${data.metrics.focus}`, margin, 19);

    y = 36;
    doc.setTextColor(17, 24, 20);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    const headlineLines = doc.splitTextToSize(data.report.headline, maxW);
    doc.text(headlineLines, margin, y);
    y += headlineLines.length * 6 + 4;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const narrativeLines = doc.splitTextToSize(data.report.executiveNarrative, maxW);
    for (const line of narrativeLines) {
      ensureSpace(6);
      doc.text(line, margin, y);
      y += 5.2;
    }
    y += 5;

    const writeSection = (title: string, items: string[], numbered = false) => {
      ensureSpace(14);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(20, 83, 45);
      doc.text(title, margin, y);
      y += 6;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(28, 39, 32);
      items.forEach((item, idx) => {
        const prefix = numbered ? `${idx + 1}. ` : '• ';
        const wrapped = doc.splitTextToSize(`${prefix}${item}`, maxW);
        ensureSpace(wrapped.length * 5 + 2);
        doc.text(wrapped, margin, y);
        y += wrapped.length * 4.8 + 1.5;
      });
      y += 4;
    };

    writeSection('Principais Destaques', data.report.keyHighlights);
    writeSection('Pontos de Atenção', data.report.attentionPoints);
    writeSection('Recomendações Estratégicas', data.report.strategicRecommendations, true);

    const dateStamp = new Date().toISOString().slice(0, 10);
    doc.save(`nzila-agro-resumo-executivo-${dateStamp}.pdf`);
  };

  return (
    <div className="space-y-6">
      {/* Control Header */}
      <div className="rounded-xl border border-[#DCE5DE] bg-white p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-bold text-[#111814] flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#CA8A04]" />
              Resumo Executivo Financeiro & Listagens (Mês Corrente)
            </h2>
            <p className="text-xs text-[#546459] mt-0.5">
              Analisa automaticamente o desempenho financeiro (vendas, cotas, bónus, doações) e listagens de produtos da plataforma com a API do Gemini.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <select
              value={periodMode}
              disabled={loading}
              onChange={(e) => setPeriodMode(e.target.value as 'current_month' | 'last_30d')}
              aria-label="Período do relatório executivo"
              className="rounded-lg border border-[#D4DDD6] bg-white px-3 py-2 text-xs font-medium text-[#1C2720] focus:border-[#15803D] focus:outline-none"
            >
              <option value="current_month">Mês Corrente</option>
              <option value="last_30d">Últimos 30 Dias</option>
            </select>

            <select
              value={focus}
              disabled={loading}
              onChange={(e) => setFocus(e.target.value)}
              aria-label="Foco do relatório executivo"
              className="rounded-lg border border-[#D4DDD6] bg-white px-3 py-2 text-xs font-medium text-[#1C2720] focus:border-[#15803D] focus:outline-none"
            >
              {FOCUS_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>

            <button
              type="button"
              disabled={loading}
              onClick={() => handleGenerate()}
              className="inline-flex items-center gap-2 rounded-lg bg-[#14532D] px-4 py-2 text-xs font-bold text-white hover:bg-[#15803D] disabled:opacity-60 transition-colors whitespace-nowrap"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  A gerar relatório...
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4 text-[#FACC15]" />
                  {data ? 'Gerar Novo Relatório' : 'Gerar Relatório Executivo'}
                </>
              )}
            </button>
          </div>
        </div>

        {/* Saved Reports History Selector */}
        {history.length > 1 && (
          <div className="flex flex-wrap items-center gap-2 border-t border-[#EDF2EE] pt-3 text-xs">
            <span className="inline-flex items-center gap-1 font-semibold text-[#546459]">
              <Clock className="w-3.5 h-3.5" />
              Histórico recente:
            </span>
            {history.slice(0, 5).map((item) => {
              const isSelected = data?.id ? data.id === item.id : data?.generatedAt === item.generatedAt;
              return (
                <button
                  key={item.id ?? item.generatedAt}
                  type="button"
                  onClick={() => setData(item)}
                  className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
                    isSelected
                      ? 'border-[#14532D] bg-[#EEF7F0] text-[#14532D] font-semibold'
                      : 'border-[#DCE5DE] bg-white text-[#445449] hover:text-[#111814]'
                  }`}
                >
                  {new Date(item.generatedAt).toLocaleDateString('pt-AO')} · {item.metrics.focus}
                </button>
              );
            })}
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-xs text-red-700 dark:text-red-300">
            {error}
          </div>
        )}
      </div>

      {/* Loading State */}
      {(loading || loadingHistory) && !data && (
        <div className="rounded-xl border border-[#DCE5DE] bg-white p-10 text-center space-y-3">
          <Loader2 className="w-7 h-7 text-[#15803D] animate-spin mx-auto" />
          <p className="text-sm font-semibold text-[#111814]">
            A consolidar vendas e atividade dos últimos 30 dias...
          </p>
          <p className="text-xs text-[#546459]">
            O relatório executivo está a ser redigido automaticamente pela API do Gemini.
          </p>
        </div>
      )}

      {/* Empty Fallback if auto-gen failed */}
      {!data && !loading && !loadingHistory && (
        <div className="rounded-xl border border-dashed border-[#C7D3CA] bg-white p-10 text-center space-y-2">
          <Sparkles className="w-8 h-8 text-[#15803D] mx-auto" />
          <h3 className="font-display text-base font-bold text-[#111814]">
            Pronto para gerar o resumo executivo mensal
          </h3>
          <p className="text-xs text-[#546459] max-w-lg mx-auto">
            Escolha o foco estratégico acima e clique em <strong>Gerar Relatório Executivo</strong> para consolidar vendas e atividade dos últimos 30 dias.
          </p>
        </div>
      )}

      {/* Generated Executive Report */}
      {data && (
        <div className="space-y-6">
          {/* Snapshot KPI Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-[#DCE5DE] bg-white p-4">
              <div className="text-xs text-[#546459]">Volume de Vendas</div>
              <div className="mt-1 font-display text-xl font-extrabold text-[#15803D] font-mono-tabular">
                {formatCurrency(data.metrics.salesVolumeKzLast30d, 'AOA')}
              </div>
              <div className="text-[11px] text-[#546459] font-mono-tabular">
                {data.metrics.salesCountLast30d} vendas
                {data.metrics.salesGrowthPct !== undefined && data.metrics.salesGrowthPct !== null
                  ? ` · ${data.metrics.salesGrowthPct >= 0 ? '+' : ''}${data.metrics.salesGrowthPct}% vs ant.`
                  : ''}
              </div>
            </div>

            <div className="rounded-xl border border-[#DCE5DE] bg-white p-4">
              <div className="text-xs text-[#546459]">Cotas Ativas & Doações</div>
              <div className="mt-1 font-display text-xl font-extrabold text-[#14532D] font-mono-tabular">
                {formatCurrency(
                  (data.metrics.estimatedQuotaRevenueKz ?? 0) + data.metrics.donationsTotalKzLast30d,
                  'AOA'
                )}
              </div>
              <div className="text-[11px] text-[#546459] font-mono-tabular">
                {data.metrics.activeQuotas} cotas · {data.metrics.donationsCountLast30d} doações
              </div>
            </div>

            <div className="rounded-xl border border-[#DCE5DE] bg-white p-4">
              <div className="text-xs text-[#546459]">Listagens de Produtos</div>
              <div className="mt-1 font-display text-2xl font-extrabold text-[#111814] font-mono-tabular">
                +{data.metrics.newListingsLast30d}
                <span className="ml-1.5 text-xs font-normal text-[#546459]">
                  / {data.metrics.totalListings}
                </span>
              </div>
              <div className="text-[11px] text-[#546459] font-mono-tabular">
                Preço médio: {formatCurrency(data.metrics.avgListingPriceKz, 'AOA')}
              </div>
            </div>

            <div className="rounded-xl border border-[#DCE5DE] bg-white p-4">
              <div className="text-xs text-[#546459]">Consultas & Ticket Médio</div>
              <div className="mt-1 font-display text-xl font-extrabold text-[#CA8A04] font-mono-tabular">
                {formatCurrency(data.metrics.avgSaleTicketKzLast30d ?? 0, 'AOA')}
              </div>
              <div className="text-[11px] text-[#546459] font-mono-tabular">
                {data.metrics.inquiriesLast30d} consultas
                {data.metrics.conversionRatePct !== undefined && data.metrics.conversionRatePct !== null
                  ? ` · ${data.metrics.conversionRatePct}% conv.`
                  : ''}
              </div>
            </div>
          </div>

          {/* Narrative Card */}
          <div className="rounded-xl border border-[#DCE5DE] bg-white p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-[#EDF2EE] pb-4">
              <div>
                <div className="text-[11px] font-semibold text-[#15803D]">
                  {data.metrics.periodLabel} · {data.metrics.focus}
                </div>
                <h3 className="mt-1 font-display text-xl font-extrabold text-[#111814]">
                  {data.report.headline}
                </h3>
                <div className="mt-0.5 text-[11px] text-[#546459] font-mono-tabular">
                  Gerado em {new Date(data.generatedAt).toLocaleString('pt-AO')}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleCopyText}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#D4DDD6] bg-white px-3 py-1.5 text-xs font-semibold text-[#1C2720] hover:bg-[#F2F7F3]"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-[#15803D]" />
                      Copiado
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Copiar Texto
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleExportPdf}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#14532D] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#15803D]"
                >
                  <Download className="w-3.5 h-3.5" />
                  Exportar PDF
                </button>
              </div>
            </div>

            <div className="text-sm text-[#1C2720] leading-relaxed whitespace-pre-line">
              {data.report.executiveNarrative}
            </div>

            {/* Top Selling Products Strip (when sales exist) */}
            {data.metrics.topSellingProducts && data.metrics.topSellingProducts.length > 0 && (
              <div className="border-t border-[#EDF2EE] pt-4">
                <div className="text-xs font-bold text-[#111814] flex items-center gap-1.5 mb-2">
                  <TrendingUp className="w-4 h-4 text-[#15803D]" />
                  Produtos com Maior Volume de Vendas (Últimos 30 Dias)
                </div>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-[#445449]">
                  {data.metrics.topSellingProducts.map((prod) => (
                    <span key={prod.title} className="font-mono-tabular">
                      <strong className="text-[#111814] font-sans">{prod.title}</strong> · {prod.salesCount}x ·{' '}
                      <strong className="text-[#15803D]">{formatCurrency(prod.volumeKz, 'AOA')}</strong>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 pt-2">
              <div className="rounded-xl border border-[#15803D]/25 bg-[#EEF7F0] p-4 space-y-2.5">
                <h4 className="font-display text-xs font-bold text-[#14532D] flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-[#15803D]" />
                  Principais Destaques
                </h4>
                <ul className="space-y-2 text-xs text-[#1C2720]">
                  {data.report.keyHighlights.map((item, idx) => (
                    <li key={idx} className="leading-relaxed">
                      • {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-xl border border-[#EAB308]/45 bg-[#FEFCE8] p-4 space-y-2.5">
                <h4 className="font-display text-xs font-bold text-[#713F12] flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-[#CA8A04]" />
                  Pontos de Atenção
                </h4>
                <ul className="space-y-2 text-xs text-[#713F12]">
                  {data.report.attentionPoints.map((item, idx) => (
                    <li key={idx} className="leading-relaxed">
                      • {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-xl border border-[#DCE5DE] bg-[#F7F9F7] p-4 space-y-2.5">
                <h4 className="font-display text-xs font-bold text-[#111814] flex items-center gap-1.5">
                  <Lightbulb className="w-4 h-4 text-[#15803D]" />
                  Recomendações Estratégicas
                </h4>
                <ol className="space-y-2 text-xs text-[#1C2720] list-decimal list-inside">
                  {data.report.strategicRecommendations.map((item, idx) => (
                    <li key={idx} className="leading-relaxed">
                      {item}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
