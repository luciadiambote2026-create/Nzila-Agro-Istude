import React, { useCallback, useEffect, useState } from 'react';
import { jsPDF } from 'jspdf';
import { Calendar, Check, Download, FileSpreadsheet, Loader2, RefreshCw } from 'lucide-react';
import { apiRequest, formatCurrency } from '../lib/api';

interface MonthlyReportSale {
  id: number;
  listingId: number;
  listingTitle: string;
  category: string;
  unit: string;
  quantity: number;
  totalKz: number;
  saleDate: string;
  note: string;
}

interface MonthlyReportInquiry {
  listingId: number;
  listingTitle: string;
  category: string;
  count: number;
  lastInquiryAt: string;
}

interface MonthlyReportResponse {
  monthKey: string;
  producer: {
    name: string;
    email: string;
    phone: string;
    whatsapp: string;
    province: string;
    profession: string;
  };
  summary: {
    totalSalesCount: number;
    totalUnitsSold: number;
    totalRevenueKz: number;
    averageTicketKz: number;
    totalInquiries: number;
    conversionRatePct: number | null;
  };
  sales: MonthlyReportSale[];
  inquiriesByProduct: MonthlyReportInquiry[];
}

const NIF_STORAGE_KEY = 'nzila_producer_accounting_nif';

const MONTH_NAMES_PT = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

const getMonthKeyOffset = (offsetMonths: number): string => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offsetMonths);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const formatMonthLabel = (monthKey: string): string => {
  const [y, m] = monthKey.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) return monthKey;
  return `${MONTH_NAMES_PT[m - 1]} de ${y}`;
};

export const MonthlyAccountingReportPanel: React.FC = () => {
  const [monthKey, setMonthKey] = useState<string>(() => getMonthKeyOffset(0));
  const [nif, setNif] = useState<string>(() => {
    try {
      return localStorage.getItem(NIF_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });
  const [accountingNote, setAccountingNote] = useState<string>('');
  const [report, setReport] = useState<MonthlyReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportedOk, setExportedOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMonthlyReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<MonthlyReportResponse>(
        `/api/users/monthly-report?month=${encodeURIComponent(monthKey)}`
      );
      setReport(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados contabilísticos do mês.');
    } finally {
      setLoading(false);
    }
  }, [monthKey]);

  useEffect(() => {
    void loadMonthlyReport();
  }, [loadMonthlyReport]);

  const handleNifChange = (value: string) => {
    setNif(value);
    try {
      localStorage.setItem(NIF_STORAGE_KEY, value);
    } catch {
      // ignore storage errors
    }
  };

  const handleDownloadPdf = () => {
    if (!report) return;
    setExporting(true);
    setExportedOk(false);

    try {
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const margin = 15;
      const contentW = pageW - margin * 2;
      let y = 16;

      const ensureSpace = (needed: number) => {
        if (y + needed > 276) {
          doc.addPage();
          y = 18;
        }
      };

      // Top institutional banner
      doc.setFillColor(20, 83, 45);
      doc.rect(0, 0, pageW, 28, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13.5);
      doc.text('NZILA AGRO — RELATÓRIO MENSAL DE CONTABILIDADE', margin, 12);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(254, 240, 138);
      doc.text(
        `Período: ${formatMonthLabel(report.monthKey)} (${report.monthKey})  ·  Emitido em ${new Date().toLocaleDateString('pt-AO')}`,
        margin,
        20
      );

      // Producer identification block
      y = 36;
      doc.setFillColor(247, 249, 247);
      doc.setDrawColor(220, 229, 222);
      doc.roundedRect(margin, y, contentW, 24, 2, 2, 'FD');

      doc.setTextColor(17, 24, 20);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text(`Produtor / Titular: ${report.producer.name}`, margin + 4, y + 7);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.8);
      doc.setTextColor(68, 84, 73);
      doc.text(
        `Província: ${report.producer.province}  ·  Atividade: ${report.producer.profession}`,
        margin + 4,
        y + 13
      );
      doc.text(
        `Contacto: ${report.producer.phone}  ·  Email: ${report.producer.email}${nif.trim() ? `  ·  NIF: ${nif.trim()}` : ''}`,
        margin + 4,
        y + 19
      );

      // Summary KPI row
      y += 30;
      const kpiW = (contentW - 9) / 4;
      const kpis = [
        { label: 'Receita Total (AOA)', value: formatCurrency(report.summary.totalRevenueKz, 'AOA') },
        { label: 'Vendas Registadas', value: `${report.summary.totalSalesCount} (${report.summary.totalUnitsSold} un.)` },
        { label: 'Consultas Recebidas', value: String(report.summary.totalInquiries) },
        {
          label: 'Ticket Médio / Conv.',
          value:
            report.summary.conversionRatePct !== null
              ? `${formatCurrency(report.summary.averageTicketKz, 'AOA')} (${report.summary.conversionRatePct}%)`
              : formatCurrency(report.summary.averageTicketKz, 'AOA'),
        },
      ];

      kpis.forEach((kpi, idx) => {
        const x = margin + idx * (kpiW + 3);
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(220, 229, 222);
        doc.roundedRect(x, y, kpiW, 18, 2, 2, 'FD');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(84, 100, 89);
        doc.text(kpi.label, x + 3, y + 6);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.2);
        doc.setTextColor(20, 83, 45);
        const valText = doc.splitTextToSize(kpi.value, kpiW - 6)[0] || kpi.value;
        doc.text(valText, x + 3, y + 13.5);
      });

      // Section 1: Detailed Sales Ledger
      y += 26;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(20, 83, 45);
      doc.text('1. Histórico Detalhado de Vendas', margin, y);
      y += 5;

      if (report.sales.length === 0) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(9);
        doc.setTextColor(84, 100, 89);
        doc.text('Nenhuma venda registada neste mês.', margin, y + 4);
        y += 12;
      } else {
        // Table header
        doc.setFillColor(238, 247, 240);
        doc.rect(margin, y, contentW, 7.5, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.2);
        doc.setTextColor(20, 83, 45);
        doc.text('Data', margin + 2, y + 5);
        doc.text('Produto / Serviço', margin + 24, y + 5);
        doc.text('Qtd.', margin + 96, y + 5);
        doc.text('Valor (AOA)', margin + 114, y + 5);
        doc.text('Observação', margin + 144, y + 5);
        y += 9;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.2);
        doc.setTextColor(28, 39, 32);

        for (const sale of report.sales) {
          ensureSpace(8);
          const titleShort =
            sale.listingTitle.length > 36 ? `${sale.listingTitle.slice(0, 34)}…` : sale.listingTitle;
          const noteShort =
            sale.note.length > 22 ? `${sale.note.slice(0, 20)}…` : sale.note || '—';

          doc.text(sale.saleDate, margin + 2, y + 3.5);
          doc.text(titleShort, margin + 24, y + 3.5);
          doc.text(`${sale.quantity}`, margin + 96, y + 3.5);
          doc.text(formatCurrency(sale.totalKz, 'AOA'), margin + 114, y + 3.5);
          doc.text(noteShort, margin + 144, y + 3.5);

          doc.setDrawColor(237, 242, 238);
          doc.line(margin, y + 5.5, margin + contentW, y + 5.5);
          y += 7;
        }

        // Total row
        ensureSpace(10);
        doc.setFillColor(242, 247, 243);
        doc.rect(margin, y, contentW, 8, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.8);
        doc.setTextColor(20, 83, 45);
        doc.text(`TOTAL DE VENDAS (${report.summary.totalSalesCount} operações)`, margin + 2, y + 5.4);
        doc.text(`${report.summary.totalUnitsSold}`, margin + 96, y + 5.4);
        doc.text(formatCurrency(report.summary.totalRevenueKz, 'AOA'), margin + 114, y + 5.4);
        y += 14;
      }

      // Section 2: Inquiries Summary by Product
      ensureSpace(22);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(20, 83, 45);
      doc.text('2. Histórico de Consultas de Compradores por Produto', margin, y);
      y += 5;

      if (report.inquiriesByProduct.length === 0) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(9);
        doc.setTextColor(84, 100, 89);
        doc.text('Nenhuma consulta de comprador registada neste mês.', margin, y + 4);
        y += 12;
      } else {
        doc.setFillColor(238, 247, 240);
        doc.rect(margin, y, contentW, 7.5, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.2);
        doc.setTextColor(20, 83, 45);
        doc.text('Produto / Serviço', margin + 2, y + 5);
        doc.text('Categoria', margin + 90, y + 5);
        doc.text('Consultas', margin + 132, y + 5);
        doc.text('Última Consulta', margin + 154, y + 5);
        y += 9;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.2);
        doc.setTextColor(28, 39, 32);

        for (const inq of report.inquiriesByProduct) {
          ensureSpace(8);
          const titleShort =
            inq.listingTitle.length > 42 ? `${inq.listingTitle.slice(0, 40)}…` : inq.listingTitle;
          doc.text(titleShort, margin + 2, y + 3.5);
          doc.text(inq.category, margin + 90, y + 3.5);
          doc.text(String(inq.count), margin + 132, y + 3.5);
          doc.text(inq.lastInquiryAt.slice(0, 10) || '—', margin + 154, y + 3.5);

          doc.setDrawColor(237, 242, 238);
          doc.line(margin, y + 5.5, margin + contentW, y + 5.5);
          y += 7;
        }
        y += 6;
      }

      // Optional accounting note
      if (accountingNote.trim()) {
        ensureSpace(20);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(20, 83, 45);
        doc.text('Observações Contabilísticas:', margin, y);
        y += 5;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.8);
        doc.setTextColor(28, 39, 32);
        const noteLines = doc.splitTextToSize(accountingNote.trim(), contentW);
        doc.text(noteLines, margin, y);
        y += noteLines.length * 4.5 + 6;
      }

      // Signature footer
      ensureSpace(22);
      y += 6;
      doc.setDrawColor(199, 211, 202);
      doc.line(margin, y + 8, margin + 72, y + 8);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(84, 100, 89);
      doc.text('Assinatura do Produtor / Responsável Contabilístico', margin, y + 13);
      doc.text(
        `Documento gerado pela plataforma Nzila Agro · ${new Date().toLocaleString('pt-AO')}`,
        margin + 90,
        y + 13
      );

      doc.save(`nzila-agro-contabilidade-${report.monthKey}.pdf`);
      setExportedOk(true);
      window.setTimeout(() => setExportedOk(false), 3000);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="rounded-xl border border-[#DCE5DE] bg-white p-6 space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#EDF2EE] pb-4">
        <div>
          <h2 className="font-display text-lg font-bold text-[#111814] flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-[#15803D]" />
            Relatório Mensal de Contabilidade (PDF)
          </h2>
          <p className="text-xs text-[#546459] mt-0.5">
            Exporte o extrato mensal completo das suas vendas e consultas em formato PDF pronto para contabilidade local.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg bg-[#F2F7F3] p-1 border border-[#DCE5DE]">
            <button
              type="button"
              onClick={() => setMonthKey(getMonthKeyOffset(0))}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
                monthKey === getMonthKeyOffset(0)
                  ? 'bg-white text-[#14532D] shadow-sm'
                  : 'text-[#445449] hover:text-[#111814]'
              }`}
            >
              Mês Atual
            </button>
            <button
              type="button"
              onClick={() => setMonthKey(getMonthKeyOffset(-1))}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
                monthKey === getMonthKeyOffset(-1)
                  ? 'bg-white text-[#14532D] shadow-sm'
                  : 'text-[#445449] hover:text-[#111814]'
              }`}
            >
              Mês Anterior
            </button>
          </div>

          <div className="relative">
            <Calendar className="w-3.5 h-3.5 text-[#546459] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="month"
              value={monthKey}
              onChange={(e) => e.target.value && setMonthKey(e.target.value)}
              aria-label="Selecionar mês do relatório"
              className="rounded-lg border border-[#D4DDD6] bg-white pl-8 pr-2.5 py-1.5 text-xs font-medium text-[#1C2720] focus:border-[#15803D] focus:outline-none font-mono-tabular"
            />
          </div>

          <button
            type="button"
            onClick={loadMonthlyReport}
            disabled={loading}
            aria-label="Atualizar relatório mensal"
            className="inline-flex items-center justify-center rounded-lg border border-[#D4DDD6] bg-white p-1.5 text-[#445449] hover:bg-[#F2F7F3] disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={loading || exporting || !report}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#14532D] px-4 py-2 text-xs font-bold text-white hover:bg-[#15803D] disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            {exporting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                A gerar PDF...
              </>
            ) : exportedOk ? (
              <>
                <Check className="w-3.5 h-3.5 text-[#FACC15]" />
                PDF Exportado
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5 text-[#FACC15]" />
                Exportar PDF ({formatMonthLabel(monthKey)})
              </>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-xs text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Optional Local Accounting Metadata */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
        <div className="md:col-span-4">
          <label className="block text-[11px] font-semibold text-[#546459] mb-1">
            NIF / Referência Fiscal (opcional no PDF)
          </label>
          <input
            type="text"
            value={nif}
            onChange={(e) => handleNifChange(e.target.value)}
            placeholder="Ex.: 5000123456"
            className="w-full rounded-lg border border-[#D4DDD6] bg-white px-3 py-1.5 text-xs text-[#1C2720] focus:border-[#15803D] focus:outline-none font-mono-tabular"
          />
        </div>
        <div className="md:col-span-8">
          <label className="block text-[11px] font-semibold text-[#546459] mb-1">
            Observações Contabilísticas (opcional no rodapé do PDF)
          </label>
          <input
            type="text"
            value={accountingNote}
            onChange={(e) => setAccountingNote(e.target.value)}
            placeholder="Ex.: Receitas referentes à colheita de milho e mandioca — arquivo contabilístico local."
            className="w-full rounded-lg border border-[#D4DDD6] bg-white px-3 py-1.5 text-xs text-[#1C2720] focus:border-[#15803D] focus:outline-none"
          />
        </div>
      </div>

      {/* Live Monthly Accounting Summary */}
      {report && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
            <div className="rounded-lg border border-[#EDF2EE] bg-[#FAFDFB] p-3.5">
              <div className="text-[11px] text-[#546459]">Receita em {formatMonthLabel(report.monthKey)}</div>
              <div className="mt-1 font-display text-lg font-extrabold text-[#14532D] font-mono-tabular">
                {formatCurrency(report.summary.totalRevenueKz, 'AOA')}
              </div>
            </div>
            <div className="rounded-lg border border-[#EDF2EE] bg-[#FAFDFB] p-3.5">
              <div className="text-[11px] text-[#546459]">Vendas no Mês</div>
              <div className="mt-1 font-display text-lg font-extrabold text-[#111814] font-mono-tabular">
                {report.summary.totalSalesCount}
                <span className="ml-1.5 text-xs font-normal text-[#546459]">
                  ({report.summary.totalUnitsSold} un.)
                </span>
              </div>
            </div>
            <div className="rounded-lg border border-[#EDF2EE] bg-[#FAFDFB] p-3.5">
              <div className="text-[11px] text-[#546459]">Consultas Recebidas</div>
              <div className="mt-1 font-display text-lg font-extrabold text-[#15803D] font-mono-tabular">
                {report.summary.totalInquiries}
              </div>
            </div>
            <div className="rounded-lg border border-[#EDF2EE] bg-[#FAFDFB] p-3.5">
              <div className="text-[11px] text-[#546459]">Ticket Médio / Conversão</div>
              <div className="mt-1 font-display text-base font-extrabold text-[#CA8A04] font-mono-tabular">
                {formatCurrency(report.summary.averageTicketKz, 'AOA')}
                {report.summary.conversionRatePct !== null && (
                  <span className="ml-1.5 text-xs font-normal text-[#546459]">
                    · {report.summary.conversionRatePct}%
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#546459] border-t border-[#EDF2EE] pt-3">
            <span>
              O documento PDF inclui identificação do produtor, tabela cronológica de{' '}
              <strong className="text-[#111814] font-mono-tabular">{report.sales.length}</strong> vendas e resumo de{' '}
              <strong className="text-[#111814] font-mono-tabular">{report.inquiriesByProduct.length}</strong> produtos consultados.
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
