import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Calendar, FileSpreadsheet, Filter, Printer, RefreshCw, RotateCcw, Search, Users } from 'lucide-react';
import { apiRequest, formatCurrency } from '../lib/api';

interface UnifiedTransaction {
  id: string;
  txCode: string;
  date: string;
  type: 'Venda' | 'Doação' | 'Bónus';
  description: string;
  userName: string;
  userEmail: string;
  userRole: string;
  userCategory: string;
  province: string;
  amountKz: number;
  originalAmount: number;
  currency: string;
  status: string;
  reference: string;
}

interface UserCategoryOption {
  value: string;
  label: string;
}

interface TransactionsResponse {
  transactions: UnifiedTransaction[];
  summary: {
    count: number;
    totalKz: number;
    salesCount: number;
    salesKz: number;
    donationsCount: number;
    donationsKz: number;
    bonusCount: number;
    bonusKz: number;
  };
  availableUserCategories: UserCategoryOption[];
}

interface FinancialTransactionsExportCardProps {
  onExported?: () => void;
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export const FinancialTransactionsExportCard: React.FC<FinancialTransactionsExportCardProps> = ({
  onExported,
}) => {
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [userCategory, setUserCategory] = useState<string>('Todas');
  const [txType, setTxType] = useState<'Todas' | 'Venda' | 'Doação' | 'Bónus'>('Todas');
  const [producerQuery, setProducerQuery] = useState<string>('');
  const [data, setData] = useState<TransactionsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [exporting, setExporting] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const loadTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      if (userCategory && userCategory !== 'Todas') params.set('userCategory', userCategory);
      if (txType !== 'Todas') params.set('txType', txType);

      const query = params.toString() ? `?${params.toString()}` : '';
      const res = await apiRequest<TransactionsResponse>(`/api/admin/principal/finance/transactions${query}`);
      setData(res);
    } catch (err) {
      setStatusMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao carregar transações filtradas.',
      });
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, userCategory, txType]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  const visibleTransactions = useMemo(() => {
    if (!data) return [];
    const q = producerQuery.trim().toLowerCase();
    if (!q) return data.transactions;
    return data.transactions.filter(
      (tx) =>
        tx.userName.toLowerCase().includes(q) ||
        tx.userEmail.toLowerCase().includes(q) ||
        tx.province.toLowerCase().includes(q) ||
        tx.description.toLowerCase().includes(q)
    );
  }, [data, producerQuery]);

  const computedSummary = useMemo(() => {
    const sales = visibleTransactions.filter((t) => t.type === 'Venda');
    const donations = visibleTransactions.filter((t) => t.type === 'Doação');
    const bonuses = visibleTransactions.filter((t) => t.type === 'Bónus');
    return {
      count: visibleTransactions.length,
      totalKz: visibleTransactions.reduce((acc, t) => acc + t.amountKz, 0),
      salesCount: sales.length,
      salesKz: sales.reduce((acc, t) => acc + t.amountKz, 0),
      donationsCount: donations.length,
      donationsKz: donations.reduce((acc, t) => acc + t.amountKz, 0),
      bonusCount: bonuses.length,
      bonusKz: bonuses.reduce((acc, t) => acc + t.amountKz, 0),
    };
  }, [visibleTransactions]);

  const producerAccountingRows = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string;
        email: string;
        category: string;
        province: string;
        salesCount: number;
        salesKz: number;
        bonusCount: number;
        bonusKz: number;
        donationsKz: number;
        totalKz: number;
      }
    >();

    for (const tx of visibleTransactions) {
      const key = `${tx.userName}|${tx.userEmail}`;
      const existing = map.get(key) || {
        name: tx.userName,
        email: tx.userEmail || '—',
        category: tx.userCategory,
        province: tx.province || '—',
        salesCount: 0,
        salesKz: 0,
        bonusCount: 0,
        bonusKz: 0,
        donationsKz: 0,
        totalKz: 0,
      };
      if (tx.type === 'Venda') {
        existing.salesCount += 1;
        existing.salesKz += tx.amountKz;
      } else if (tx.type === 'Bónus') {
        existing.bonusCount += 1;
        existing.bonusKz += tx.amountKz;
      } else if (tx.type === 'Doação') {
        existing.donationsKz += tx.amountKz;
      }
      existing.totalKz += tx.amountKz;
      map.set(key, existing);
    }

    return Array.from(map.values()).sort((a, b) => b.totalKz - a.totalKz);
  }, [visibleTransactions]);

  const applyDatePreset = (preset: '30d' | 'month' | 'year' | 'all') => {
    setStatusMsg(null);
    const now = new Date();
    if (preset === 'all') {
      setStartDate('');
      setEndDate('');
      return;
    }
    if (preset === '30d') {
      const past = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      setStartDate(toIsoDate(past));
      setEndDate(toIsoDate(now));
      return;
    }
    if (preset === 'month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      setStartDate(toIsoDate(firstDay));
      setEndDate(toIsoDate(now));
      return;
    }
    if (preset === 'year') {
      const jan1 = new Date(now.getFullYear(), 0, 1);
      setStartDate(toIsoDate(jan1));
      setEndDate(toIsoDate(now));
    }
  };

  const handleResetFilters = () => {
    setStartDate('');
    setEndDate('');
    setUserCategory('Todas');
    setTxType('Todas');
    setProducerQuery('');
    setStatusMsg(null);
  };

  const handleExportXlsx = async () => {
    if (!data) return;
    setStatusMsg(null);
    setExporting(true);

    try {
      const wb = XLSX.utils.book_new();
      const selectedCategoryLabel =
        data.availableUserCategories.find((opt) => opt.value === userCategory)?.label || 'Todas as Categorias';

      // Sheet 1: Transações Filtradas
      const txHeaders = [
        'Código',
        'Data',
        'Tipo de Transação',
        'Descrição / Produto',
        'Utilizador / Produtor',
        'Email',
        'Categoria de Utilizador',
        'Província',
        'Valor Original',
        'Moeda',
        'Valor (AOA)',
        'Estado',
        'Referência / Nota',
      ];

      const txRows = visibleTransactions.map((tx) => [
        tx.txCode,
        tx.date,
        tx.type,
        tx.description,
        tx.userName,
        tx.userEmail || '—',
        tx.userCategory,
        tx.province || '—',
        tx.originalAmount,
        tx.currency,
        tx.amountKz,
        tx.status,
        tx.reference || '—',
      ]);

      const txSheetData: Array<Array<string | number>> = [
        ['NZILA AGRO — RELATÓRIO DE TRANSAÇÕES FINANCEIRAS'],
        [
          `Período: ${startDate || 'Início'} a ${endDate || 'Hoje'} | Categoria: ${selectedCategoryLabel} | Tipo: ${txType}${producerQuery.trim() ? ` | Pesquisa: ${producerQuery.trim()}` : ''} | Gerado em: ${new Date().toLocaleString('pt-AO')}`,
        ],
        [],
        txHeaders,
        ...(txRows.length > 0
          ? txRows
          : [['—', 'Sem registos', '—', 'Nenhuma transação encontrada para os filtros selecionados', '—', '—', '—', '—', 0, 'AOA', 0, '—', '—']]),
        [
          '',
          'TOTAL',
          `${computedSummary.count} transações`,
          '',
          '',
          '',
          '',
          '',
          '',
          'AOA',
          computedSummary.totalKz,
          '',
          '',
        ],
      ];

      const wsTransactions = XLSX.utils.aoa_to_sheet(txSheetData);
      wsTransactions['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 12 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 12 } },
      ];
      wsTransactions['!cols'] = [
        { wch: 13 },
        { wch: 13 },
        { wch: 16 },
        { wch: 32 },
        { wch: 24 },
        { wch: 26 },
        { wch: 24 },
        { wch: 16 },
        { wch: 15 },
        { wch: 8 },
        { wch: 18 },
        { wch: 14 },
        { wch: 28 },
      ];

      const headerRowIndex = 3;
      const lastDataRowIndex = headerRowIndex + Math.max(txRows.length, 1);
      wsTransactions['!autofilter'] = {
        ref: XLSX.utils.encode_range({
          s: { r: headerRowIndex, c: 0 },
          e: { r: lastDataRowIndex, c: 12 },
        }),
      };

      for (let r = headerRowIndex + 1; r <= lastDataRowIndex + 1; r++) {
        const origCell = wsTransactions[XLSX.utils.encode_cell({ r, c: 8 })];
        if (origCell && typeof origCell.v === 'number') {
          origCell.z = '#,##0.00';
        }
        const kzCell = wsTransactions[XLSX.utils.encode_cell({ r, c: 10 })];
        if (kzCell && typeof kzCell.v === 'number') {
          kzCell.z = '#,##0.00" AOA"';
        }
      }

      XLSX.utils.book_append_sheet(wb, wsTransactions, 'Transações');

      // Sheet 2: Contabilidade por Produtor / Utilizador
      const prodHeaders = [
        'Produtor / Utilizador',
        'Email',
        'Categoria de Utilizador',
        'Província',
        'Nº Vendas',
        'Receita Vendas (AOA)',
        'Nº Bónus',
        'Total Bónus (AOA)',
        'Doações (AOA)',
        'Total Movimentado (AOA)',
      ];
      const prodDataRows = producerAccountingRows.map((p) => [
        p.name,
        p.email,
        p.category,
        p.province,
        p.salesCount,
        p.salesKz,
        p.bonusCount,
        p.bonusKz,
        p.donationsKz,
        p.totalKz,
      ]);
      const prodSheetData: Array<Array<string | number>> = [
        ['CONTABILIDADE CONSOLIDADA POR PRODUTOR / UTILIZADOR'],
        [`Período: ${startDate || 'Início'} a ${endDate || 'Hoje'} | Categoria: ${selectedCategoryLabel}`],
        [],
        prodHeaders,
        ...(prodDataRows.length > 0
          ? prodDataRows
          : [['Sem movimentações', '—', '—', '—', 0, 0, 0, 0, 0, 0]]),
        [
          'TOTAL GERAL',
          `${producerAccountingRows.length} contas`,
          '',
          '',
          computedSummary.salesCount,
          computedSummary.salesKz,
          computedSummary.bonusCount,
          computedSummary.bonusKz,
          computedSummary.donationsKz,
          computedSummary.totalKz,
        ],
      ];
      const wsProducers = XLSX.utils.aoa_to_sheet(prodSheetData);
      wsProducers['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 9 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 9 } },
      ];
      wsProducers['!cols'] = [
        { wch: 24 },
        { wch: 26 },
        { wch: 24 },
        { wch: 16 },
        { wch: 11 },
        { wch: 20 },
        { wch: 11 },
        { wch: 18 },
        { wch: 18 },
        { wch: 22 },
      ];
      const prodLastRow = 3 + Math.max(prodDataRows.length, 1);
      wsProducers['!autofilter'] = {
        ref: XLSX.utils.encode_range({ s: { r: 3, c: 0 }, e: { r: prodLastRow, c: 9 } }),
      };
      for (let r = 4; r <= prodLastRow + 1; r++) {
        [4, 6].forEach((col) => {
          const c = wsProducers[XLSX.utils.encode_cell({ r, c: col })];
          if (c && typeof c.v === 'number') c.z = '#,##0';
        });
        [5, 7, 8, 9].forEach((col) => {
          const c = wsProducers[XLSX.utils.encode_cell({ r, c: col })];
          if (c && typeof c.v === 'number') c.z = '#,##0.00" AOA"';
        });
      }
      XLSX.utils.book_append_sheet(wb, wsProducers, 'Contabilidade Produtores');

      // Sheet 3: Resumo por Tipo
      const summarySheetData: Array<Array<string | number>> = [
        ['RESUMO CONSOLIDADO POR TIPO DE TRANSAÇÃO'],
        [],
        ['Tipo de Transação', 'Quantidade de Registos', 'Volume Total (AOA)'],
        ['Vendas de Produtores', computedSummary.salesCount, computedSummary.salesKz],
        ['Doações Privadas', computedSummary.donationsCount, computedSummary.donationsKz],
        ['Bónus Atribuídos', computedSummary.bonusCount, computedSummary.bonusKz],
        ['TOTAL FILTRADO', computedSummary.count, computedSummary.totalKz],
      ];
      const wsSummary = XLSX.utils.aoa_to_sheet(summarySheetData);
      wsSummary['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }];
      wsSummary['!cols'] = [{ wch: 28 }, { wch: 22 }, { wch: 22 }];
      for (let r = 3; r <= 6; r++) {
        const countCell = wsSummary[XLSX.utils.encode_cell({ r, c: 1 })];
        if (countCell && typeof countCell.v === 'number') countCell.z = '#,##0';
        const valCell = wsSummary[XLSX.utils.encode_cell({ r, c: 2 })];
        if (valCell && typeof valCell.v === 'number') valCell.z = '#,##0.00" AOA"';
      }
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumo por Tipo');

      // Sheet 4: Critérios de Filtragem
      const metaSheetData: Array<Array<string | number>> = [
        ['METADADOS DA EXPORTAÇÃO DE TRANSAÇÕES'],
        [],
        ['Parâmetro', 'Valor Aplicado'],
        ['Plataforma', 'Nzila Agro — Painel do Administrador Principal'],
        ['Data / Hora da Exportação', new Date().toLocaleString('pt-AO')],
        ['Data Inicial', startDate || 'Sem limite inicial'],
        ['Data Final', endDate || 'Sem limite final'],
        ['Categoria de Utilizador', selectedCategoryLabel],
        ['Tipo de Transação', txType],
        ['Pesquisa de Produtor', producerQuery.trim() || 'Todos os produtores'],
        ['Total de Registos Exportados', computedSummary.count],
        ['Volume Total Consolidado (AOA)', computedSummary.totalKz],
      ];
      const wsMeta = XLSX.utils.aoa_to_sheet(metaSheetData);
      wsMeta['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
      wsMeta['!cols'] = [{ wch: 30 }, { wch: 46 }];
      const metaValCell = wsMeta[XLSX.utils.encode_cell({ r: 11, c: 1 })];
      if (metaValCell && typeof metaValCell.v === 'number') metaValCell.z = '#,##0.00" AOA"';
      XLSX.utils.book_append_sheet(wb, wsMeta, 'Filtros Aplicados');

      const dateStamp = new Date().toISOString().slice(0, 10);
      const filename = `nzila-agro-transacoes-contabilidade-${dateStamp}.xlsx`;
      XLSX.writeFile(wb, filename);

      await apiRequest('/api/admin/principal/finance/transactions/export-audit', {
        method: 'POST',
        body: JSON.stringify({
          startDate: startDate || null,
          endDate: endDate || null,
          userCategory: selectedCategoryLabel,
          txType,
          exportedCount: computedSummary.count,
          totalKz: computedSummary.totalKz,
          filename,
        }),
      }).catch(() => {});

      setStatusMsg({
        type: 'ok',
        text: `Ficheiro "${filename}" gerado com sucesso (${computedSummary.count} transações em 4 folhas contabilísticas).`,
      });
      onExported?.();
    } catch (err) {
      setStatusMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao gerar ficheiro Excel (.xlsx).',
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="rounded-xl border border-[#DCE5DE] bg-white p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-[#111814] flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-[#15803D]" />
            Exportação de Relatório de Transações (.xlsx)
          </h2>
          <p className="text-xs text-[#546459] mt-0.5">
            Filtre vendas, doações e bónus por intervalo de datas e categoria de utilizador para facilitar a contabilidade dos produtores em formato Excel (.xlsx).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0 print-hide">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#D4DDD6] bg-white px-3 py-2 text-xs font-semibold text-[#14532D] hover:bg-[#F2F7F3] transition-colors whitespace-nowrap"
          >
            <Printer className="w-3.5 h-3.5 text-[#15803D]" />
            Imprimir
          </button>
          <button
            type="button"
            onClick={handleResetFilters}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#D4DDD6] bg-white px-3 py-2 text-xs font-semibold text-[#546459] hover:bg-[#F2F7F3] transition-colors whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Limpar Filtros
          </button>
          <button
            type="button"
            disabled={exporting || loading || !data}
            onClick={handleExportXlsx}
            className="inline-flex items-center gap-2 rounded-lg bg-[#14532D] px-4 py-2 text-xs font-bold text-white hover:bg-[#15803D] disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            <FileSpreadsheet className="w-4 h-4 text-[#FACC15]" />
            {exporting ? 'A gerar .xlsx...' : 'Exportar Transações (.xlsx)'}
          </button>
        </div>
      </div>

      <div className="print-only text-xs">
        Critérios do Relatório — Período: <strong>{startDate || 'Início'}</strong> a{' '}
        <strong>{endDate || 'Hoje'}</strong> | Categoria:{' '}
        <strong>
          {data?.availableUserCategories.find((opt) => opt.value === userCategory)?.label || 'Todas'}
        </strong>{' '}
        | Tipo: <strong>{txType}</strong>
        {producerQuery.trim() ? ` | Pesquisa: "${producerQuery.trim()}"` : ''}
      </div>

      {statusMsg && (
        <div
          className={`rounded-lg border px-3.5 py-2.5 text-xs font-medium ${
            statusMsg.type === 'ok'
              ? 'border-[#15803D]/30 bg-[#EEF7F0] text-[#14532D]'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {statusMsg.text}
        </div>
      )}

      {/* Filter Controls */}
      <div className="rounded-xl border border-[#E5ECE6] bg-[#F8FBF9] p-4 space-y-3 print-hide">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#14532D]">
            <Filter className="w-3.5 h-3.5" />
            Filtros do Relatório Contabilístico
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => applyDatePreset('30d')}
              className="rounded-md border border-[#D4DDD6] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#1C2720] hover:border-[#15803D] hover:text-[#14532D] transition-colors"
            >
              Últimos 30 dias
            </button>
            <button
              type="button"
              onClick={() => applyDatePreset('month')}
              className="rounded-md border border-[#D4DDD6] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#1C2720] hover:border-[#15803D] hover:text-[#14532D] transition-colors"
            >
              Mês Atual
            </button>
            <button
              type="button"
              onClick={() => applyDatePreset('year')}
              className="rounded-md border border-[#D4DDD6] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#1C2720] hover:border-[#15803D] hover:text-[#14532D] transition-colors"
            >
              Este Ano
            </button>
            <button
              type="button"
              onClick={() => applyDatePreset('all')}
              className="rounded-md border border-[#D4DDD6] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#1C2720] hover:border-[#15803D] hover:text-[#14532D] transition-colors"
            >
              Todo o Histórico
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs font-medium text-[#1C2720] mb-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-[#15803D]" />
              Data Inicial
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg border border-[#D4DDD6] bg-white px-3 py-2 text-xs font-mono-tabular focus:border-[#15803D] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#1C2720] mb-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-[#15803D]" />
              Data Final
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-lg border border-[#D4DDD6] bg-white px-3 py-2 text-xs font-mono-tabular focus:border-[#15803D] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#1C2720] mb-1 flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-[#15803D]" />
              Categoria de Utilizador
            </label>
            <select
              value={userCategory}
              onChange={(e) => setUserCategory(e.target.value)}
              className="w-full rounded-lg border border-[#D4DDD6] bg-white px-3 py-2 text-xs focus:border-[#15803D] focus:outline-none"
            >
              {(data?.availableUserCategories || [{ value: 'Todas', label: 'Todas as Categorias' }]).map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#1C2720] mb-1">
              Tipo de Transação
            </label>
            <select
              value={txType}
              onChange={(e) => setTxType(e.target.value as 'Todas' | 'Venda' | 'Doação' | 'Bónus')}
              className="w-full rounded-lg border border-[#D4DDD6] bg-white px-3 py-2 text-xs focus:border-[#15803D] focus:outline-none"
            >
              <option value="Todas">Todas (Vendas, Doações e Bónus)</option>
              <option value="Venda">Apenas Vendas</option>
              <option value="Doação">Apenas Doações</option>
              <option value="Bónus">Apenas Bónus</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#1C2720] mb-1 flex items-center gap-1">
              <Search className="w-3.5 h-3.5 text-[#15803D]" />
              Produtor / Província
            </label>
            <input
              type="text"
              value={producerQuery}
              onChange={(e) => setProducerQuery(e.target.value)}
              placeholder="Filtrar produtor..."
              className="w-full rounded-lg border border-[#D4DDD6] bg-white px-3 py-2 text-xs focus:border-[#15803D] focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Live Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-lg border border-[#E5ECE6] bg-[#FCFEFD] p-3.5">
          <div className="text-[11px] font-medium text-[#546459]">Transações / Produtores</div>
          <div className="mt-1 font-display text-xl font-extrabold text-[#111814] font-mono-tabular">
            {loading ? '...' : `${computedSummary.count} (${producerAccountingRows.length} contas)`}
          </div>
        </div>
        <div className="rounded-lg border border-[#E5ECE6] bg-[#FCFEFD] p-3.5">
          <div className="text-[11px] font-medium text-[#546459]">Volume Total (AOA)</div>
          <div className="mt-1 font-display text-xl font-extrabold text-[#14532D] font-mono-tabular">
            {loading ? '...' : formatCurrency(computedSummary.totalKz, 'AOA')}
          </div>
        </div>
        <div className="rounded-lg border border-[#E5ECE6] bg-[#FCFEFD] p-3.5">
          <div className="text-[11px] font-medium text-[#546459]">
            Vendas ({loading ? '—' : computedSummary.salesCount})
          </div>
          <div className="mt-1 font-display text-lg font-bold text-[#15803D] font-mono-tabular">
            {loading ? '...' : formatCurrency(computedSummary.salesKz, 'AOA')}
          </div>
        </div>
        <div className="rounded-lg border border-[#E5ECE6] bg-[#FCFEFD] p-3.5">
          <div className="text-[11px] font-medium text-[#546459]">
            Doações ({loading ? '—' : computedSummary.donationsCount}) / Bónus ({loading ? '—' : computedSummary.bonusCount})
          </div>
          <div className="mt-1 font-display text-lg font-bold text-[#B45309] font-mono-tabular">
            {loading ? '...' : formatCurrency(computedSummary.donationsKz + computedSummary.bonusKz, 'AOA')}
          </div>
        </div>
      </div>

      {/* Preview Table */}
      <div className="overflow-x-auto rounded-lg border border-[#E5ECE6]">
        <div className="flex items-center justify-between border-b border-[#E5ECE6] bg-[#F8FBF9] px-4 py-2.5">
          <span className="text-xs font-bold text-[#14532D]">
            Pré-visualização das Transações Filtradas
          </span>
          <button
            type="button"
            onClick={loadTransactions}
            disabled={loading}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#15803D] hover:underline disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>

        <table className="w-full text-left text-xs">
          <thead className="bg-[#F2F7F3] text-[#14532D] border-b border-[#E5ECE6]">
            <tr>
              <th className="px-3 py-2 font-bold">Data</th>
              <th className="px-3 py-2 font-bold">Tipo</th>
              <th className="px-3 py-2 font-bold">Utilizador / Produtor</th>
              <th className="px-3 py-2 font-bold">Categoria</th>
              <th className="px-3 py-2 font-bold">Descrição</th>
              <th className="px-3 py-2 font-bold text-right">Valor (AOA)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EDF2EE]">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-[#546459]">
                  A carregar transações financeiras...
                </td>
              </tr>
            ) : visibleTransactions.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-[#546459]">
                  Nenhuma transação encontrada para os filtros selecionados.
                </td>
              </tr>
            ) : (
              visibleTransactions.map((tx, idx) => (
                <tr key={tx.id} className={`hover:bg-[#F9FCFA] ${idx >= 6 ? 'hidden print:table-row' : ''}`}>
                  <td className="px-3 py-2 font-mono-tabular text-[#546459] whitespace-nowrap">{tx.date}</td>
                  <td className="px-3 py-2 font-semibold text-[#111814] whitespace-nowrap">{tx.type}</td>
                  <td className="px-3 py-2 text-[#111814]">{tx.userName}</td>
                  <td className="px-3 py-2 text-[#546459]">{tx.userCategory}</td>
                  <td className="px-3 py-2 text-[#546459] max-w-[220px] truncate">{tx.description}</td>
                  <td className="px-3 py-2 text-right font-mono-tabular font-bold text-[#14532D] whitespace-nowrap">
                    {formatCurrency(tx.amountKz, 'AOA')}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {visibleTransactions.length > 6 && (
          <div className="border-t border-[#E5ECE6] bg-[#F8FBF9] px-4 py-2 text-[11px] text-[#546459] print-hide">
            A mostrar 6 de {visibleTransactions.length} transações. Todas as {visibleTransactions.length} linhas e o resumo contabilístico de {producerAccountingRows.length} contas serão incluídos na impressão e no ficheiro Excel (.xlsx).
          </div>
        )}
      </div>
    </div>
  );
};
