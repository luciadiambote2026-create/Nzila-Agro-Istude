import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bug,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import type { ClientErrorReport, ClientErrorReportsResponse } from '../types';

export const ErrorReportsPanel: React.FC = () => {
  const [data, setData] = useState<ClientErrorReportsResponse | null>(null);
  const [statusFilter, setStatusFilter] = useState<'Todos' | 'Aberto' | 'Resolvido'>('Todos');
  const [boundaryFilter, setBoundaryFilter] = useState<string>('Todas');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | 'clear' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'Todos') params.set('status', statusFilter);
      if (boundaryFilter !== 'Todas') params.set('boundary', boundaryFilter);
      const qs = params.toString() ? `?${params.toString()}` : '';
      const res = await apiRequest<ClientErrorReportsResponse>(`/api/admin/principal/error-reports${qs}`);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar relatório de erros.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, boundaryFilter]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const boundaryOptions = useMemo(() => {
    const base = ['Painel do Utilizador', 'Aplicação Global'];
    const dynamic = (data?.reports || []).map((r) => r.boundaryName);
    return Array.from(new Set([...base, ...dynamic]));
  }, [data]);

  const filteredReports = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.reports;
    return data.reports.filter(
      (r) =>
        r.errorMessage.toLowerCase().includes(q) ||
        r.errorName.toLowerCase().includes(q) ||
        r.boundaryName.toLowerCase().includes(q) ||
        r.userName.toLowerCase().includes(q) ||
        r.userEmail.toLowerCase().includes(q) ||
        r.componentStack.toLowerCase().includes(q)
    );
  }, [data, search]);

  const handleToggleStatus = async (report: ClientErrorReport) => {
    const nextStatus = report.status === 'Aberto' ? 'Resolvido' : 'Aberto';
    setBusyId(report.id);
    setError(null);
    try {
      await apiRequest(`/api/admin/principal/error-reports/${report.id}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: nextStatus }),
      });
      await loadReports();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar estado do registo.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteOne = async (reportId: number) => {
    setBusyId(reportId);
    setError(null);
    try {
      await apiRequest(`/api/admin/principal/error-reports/${reportId}`, { method: 'DELETE' });
      await loadReports();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao eliminar registo.');
    } finally {
      setBusyId(null);
    }
  };

  const handleClearResolved = async () => {
    setBusyId('clear');
    setError(null);
    try {
      await apiRequest('/api/admin/principal/error-reports?scope=resolved', { method: 'DELETE' });
      await loadReports();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao limpar registos resolvidos.');
    } finally {
      setBusyId(null);
    }
  };

  const handleCopyDiagnostic = async (report: ClientErrorReport) => {
    const text = [
      `Erro #${report.id} [${report.status}]`,
      `Origem: ${report.boundaryName}`,
      `Tipo: ${report.errorName}`,
      `Mensagem: ${report.errorMessage}`,
      `Utilizador: ${report.userName} (${report.userEmail || 'Anónimo'}) [${report.userRole}]`,
      `Data (UTC): ${report.createdAt}`,
      `URL: ${report.pageUrl}`,
      `User-Agent: ${report.userAgent}`,
      report.componentStack ? `\nComponent Stack:\n${report.componentStack}` : '',
      report.errorStack ? `\nStack Trace:\n${report.errorStack}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(report.id);
      window.setTimeout(() => setCopiedId((curr) => (curr === report.id ? null : curr)), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleExportJson = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data.reports, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nzila-agro-relatorio-erros-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-[#DCE5DE] bg-white p-5">
          <div className="text-xs font-medium text-[#546459]">Total de Erros Capturados</div>
          <div className="mt-1 font-display text-2xl font-extrabold text-[#111814] font-mono-tabular">
            {data ? data.summary.total : '—'}
          </div>
          <div className="mt-0.5 text-[11px] text-[#546459]">Intercetados pelo ErrorBoundary</div>
        </div>

        <div className="rounded-xl border border-[#DCE5DE] bg-white p-5">
          <div className="text-xs font-medium text-[#546459]">Em Aberto</div>
          <div className="mt-1 font-display text-2xl font-extrabold text-red-700 dark:text-red-400 font-mono-tabular">
            {data ? data.summary.openCount : '—'}
          </div>
          <div className="mt-0.5 text-[11px] text-[#546459]">Pendentes de análise técnica</div>
        </div>

        <div className="rounded-xl border border-[#DCE5DE] bg-white p-5">
          <div className="text-xs font-medium text-[#546459]">Resolvidos</div>
          <div className="mt-1 font-display text-2xl font-extrabold text-[#15803D] font-mono-tabular">
            {data ? data.summary.resolvedCount : '—'}
          </div>
          <div className="mt-0.5 text-[11px] text-[#546459]">Validados pela administração</div>
        </div>

        <div className="rounded-xl border border-[#DCE5DE] bg-white p-5">
          <div className="text-xs font-medium text-[#546459]">Últimas 24 Horas</div>
          <div className="mt-1 font-display text-2xl font-extrabold text-[#CA8A04] font-mono-tabular">
            {data ? data.summary.last24hCount : '—'}
          </div>
          <div className="mt-0.5 text-[11px] text-[#546459]">Incidentes recentes na interface</div>
        </div>
      </div>

      {/* Main Reports Table / List */}
      <div className="rounded-xl border border-[#DCE5DE] bg-white p-6 space-y-5">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-[#EDF2EE] pb-4">
          <div>
            <h2 className="font-display text-lg font-bold text-[#111814] flex items-center gap-2">
              <Bug className="w-5 h-5 text-red-600 dark:text-red-400" />
              Relatório de Erros de Renderização
            </h2>
            <p className="text-xs text-[#546459] mt-0.5">
              Falhas capturadas automaticamente no Painel do Utilizador e na aplicação global com stack trace para debug.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-52">
              <Search className="w-3.5 h-3.5 text-[#546459] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pesquisar erro ou utilizador..."
                className="w-full rounded-lg border border-[#D4DDD6] bg-white pl-8 pr-3 py-1.5 text-xs text-[#1C2720] focus:border-[#15803D] focus:outline-none"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              aria-label="Filtrar por estado"
              className="rounded-lg border border-[#D4DDD6] bg-white px-2.5 py-1.5 text-xs font-medium text-[#1C2720] focus:border-[#15803D] focus:outline-none"
            >
              <option value="Todos">Todos os Estados</option>
              <option value="Aberto">Apenas Abertos</option>
              <option value="Resolvido">Apenas Resolvidos</option>
            </select>

            <select
              value={boundaryFilter}
              onChange={(e) => setBoundaryFilter(e.target.value)}
              aria-label="Filtrar por origem"
              className="rounded-lg border border-[#D4DDD6] bg-white px-2.5 py-1.5 text-xs font-medium text-[#1C2720] focus:border-[#15803D] focus:outline-none"
            >
              <option value="Todas">Todas as Origens</option>
              {boundaryOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleExportJson}
              disabled={!data || data.reports.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#D4DDD6] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#1C2720] hover:bg-[#F2F7F3] disabled:opacity-45 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              JSON
            </button>

            {data && data.summary.resolvedCount > 0 && (
              <button
                type="button"
                onClick={handleClearResolved}
                disabled={busyId === 'clear'}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#D4DDD6] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#445449] hover:text-red-700 hover:bg-red-50 disabled:opacity-45 whitespace-nowrap"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Limpar Resolvidos
              </button>
            )}

            <button
              type="button"
              onClick={loadReports}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#D4DDD6] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#1C2720] hover:bg-[#F2F7F3] disabled:opacity-50 whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
          </div>
        </div>

        {loading && !data ? (
          <div className="space-y-2.5 py-4">
            <div className="h-14 rounded-lg bg-[#F2F7F3] animate-pulse" />
            <div className="h-14 rounded-lg bg-[#F2F7F3] animate-pulse" />
          </div>
        ) : filteredReports.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#C7D3CA] bg-[#F7F9F7] px-6 py-12 text-center">
            <CheckCircle2 className="w-8 h-8 text-[#15803D] mx-auto mb-2" />
            <p className="text-sm font-semibold text-[#111814]">
              Sem falhas de renderização registadas
            </p>
            <p className="mt-1 text-xs text-[#546459] max-w-md mx-auto">
              O intercetor global (ErrorBoundary) está ativo no Painel do Utilizador e na aplicação. Qualquer erro inesperado aparecerá aqui automaticamente com o respetivo stack trace.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#EDF2EE]">
            {filteredReports.map((report) => {
              const isExpanded = expandedId === report.id;
              const isBusy = busyId === report.id;
              return (
                <div key={report.id} className="py-4 first:pt-0 last:pb-0 space-y-3">
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                        <span className="font-mono-tabular font-bold text-[#546459]">#{report.id}</span>
                        <span
                          className={`font-bold ${
                            report.status === 'Aberto'
                              ? 'text-red-700 dark:text-red-400'
                              : 'text-[#15803D]'
                          }`}
                        >
                          {report.status}
                        </span>
                        <span className="text-[#546459]">·</span>
                        <span className="font-semibold text-[#14532D]">{report.boundaryName}</span>
                        <span className="text-[#546459]">·</span>
                        <span className="font-mono-tabular text-[#546459]">{report.createdAt} UTC</span>
                      </div>

                      <div className="text-sm font-semibold text-[#111814] break-words">
                        <span className="font-mono text-xs text-red-700 dark:text-red-400 mr-1.5">
                          {report.errorName}:
                        </span>
                        {report.errorMessage}
                      </div>

                      <div className="text-xs text-[#546459]">
                        Utilizador: <strong className="text-[#1C2720]">{report.userName}</strong>
                        {report.userEmail ? ` (${report.userEmail})` : ''} · {report.userRole}
                        {report.resolvedBy && (
                          <>
                            {' '}
                            · Resolvido por <strong className="text-[#15803D]">{report.resolvedBy}</strong>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : report.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-[#D4DDD6] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#1C2720] hover:bg-[#F2F7F3] whitespace-nowrap"
                      >
                        {isExpanded ? (
                          <>
                            <ChevronUp className="w-3.5 h-3.5" />
                            Ocultar Stack
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-3.5 h-3.5" />
                            Ver Stack Trace
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleToggleStatus(report)}
                        disabled={isBusy}
                        className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap disabled:opacity-45 ${
                          report.status === 'Aberto'
                            ? 'bg-[#14532D] text-white hover:bg-[#15803D]'
                            : 'border border-[#D4DDD6] bg-white text-[#1C2720] hover:bg-[#F2F7F3]'
                        }`}
                      >
                        {report.status === 'Aberto' ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Resolver
                          </>
                        ) : (
                          <>
                            <RotateCcw className="w-3.5 h-3.5" />
                            Reabrir
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteOne(report.id)}
                        disabled={isBusy}
                        aria-label={`Eliminar erro ${report.id}`}
                        className="inline-flex items-center justify-center rounded-lg border border-red-200 dark:border-red-900/50 bg-white p-1.5 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-45"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="rounded-lg border border-[#DCE5DE] bg-[#F7F9F7] p-4 space-y-3 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-[11px] text-[#546459] break-all">
                          <strong className="text-[#1C2720]">URL:</strong> {report.pageUrl || 'N/D'}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopyDiagnostic(report)}
                          className="inline-flex items-center gap-1 rounded-md border border-[#D4DDD6] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#1C2720] hover:bg-[#F2F7F3]"
                        >
                          <Copy className="w-3 h-3" />
                          {copiedId === report.id ? 'Copiado!' : 'Copiar Diagnóstico'}
                        </button>
                      </div>

                      {report.userAgent && (
                        <div className="text-[11px] text-[#546459] break-all">
                          <strong className="text-[#1C2720]">Navegador:</strong> {report.userAgent}
                        </div>
                      )}

                      {report.componentStack && (
                        <div>
                          <div className="font-semibold text-[#1C2720] mb-1">React Component Stack</div>
                          <pre className="overflow-x-auto rounded-md border border-[#DCE5DE] bg-white p-3 font-mono text-[11px] text-[#1C2720] whitespace-pre-wrap">
                            {report.componentStack.trim()}
                          </pre>
                        </div>
                      )}

                      {report.errorStack && (
                        <div>
                          <div className="font-semibold text-[#1C2720] mb-1">JavaScript Stack Trace</div>
                          <pre className="overflow-x-auto rounded-md border border-[#DCE5DE] bg-white p-3 font-mono text-[11px] text-[#1C2720] whitespace-pre-wrap">
                            {report.errorStack.trim()}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
