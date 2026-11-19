import React, { useEffect, useState } from 'react';
import { CheckCircle2, Cloud, Database, Download, RefreshCw, AlertCircle } from 'lucide-react';
import { apiRequest, getStoredToken } from '../lib/api';
import type { CloudMigrationStatus } from '../types';

export const CloudMigrationReadinessCard: React.FC = () => {
  const [status, setStatus] = useState<CloudMigrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<CloudMigrationStatus>(
        '/api/admin/principal/backups/cloud-migration-status'
      );
      setStatus(res);
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao consultar estado de migração para a nuvem.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleExportPostgresSql = async () => {
    setFeedback(null);
    setExporting(true);
    try {
      const token = getStoredToken();
      const res = await fetch('/api/admin/principal/backups/export-postgres-sql', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        throw new Error('Falha ao gerar script de migração PostgreSQL.');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nzila-agro-postgres-migration-${new Date().toISOString().slice(0, 10)}.sql`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setFeedback({
        type: 'ok',
        text: 'Script SQL transacional para PostgreSQL / Google Cloud SQL transferido com sucesso.',
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao exportar script SQL.',
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="rounded-xl border border-[#DCE5DE] bg-white p-6 space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <h3 className="font-display text-base font-bold text-[#111814] flex items-center gap-2">
            <Cloud className="w-4 h-4 text-[#15803D]" />
            Preparação para Migração da Base de Dados para a Nuvem (PostgreSQL / Cloud SQL)
          </h3>
          <p className="text-xs text-[#546459] max-w-2xl">
            Gere a qualquer momento um script SQL transacional completo (esquema DDL + todos os registos + sequências) pronto a importar no Google Cloud SQL, Supabase ou PostgreSQL gerido.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={loadStatus}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#D4DDD6] bg-white px-3 py-2 text-xs font-semibold text-[#14532D] hover:bg-[#F2F7F3] disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
          <button
            type="button"
            onClick={handleExportPostgresSql}
            disabled={exporting}
            className="inline-flex items-center gap-2 rounded-lg bg-[#14532D] px-4 py-2 text-xs font-bold text-white hover:bg-[#15803D] disabled:opacity-50 whitespace-nowrap"
          >
            <Download className="w-4 h-4 text-[#FACC15]" />
            {exporting ? 'A gerar .sql...' : 'Exportar Script PostgreSQL / Cloud SQL (.sql)'}
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`rounded-lg border px-3.5 py-2.5 text-xs font-medium ${
            feedback.type === 'ok'
              ? 'border-[#15803D]/30 bg-[#EEF7F0] text-[#14532D]'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {status && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-xl border border-[#E5ECE6] bg-[#FCFEFD] p-3.5">
              <div className="text-[11px] font-medium text-[#546459]">Motor Atual</div>
              <div className="mt-1 text-sm font-bold text-[#111814]">{status.currentEngine}</div>
            </div>
            <div className="rounded-xl border border-[#E5ECE6] bg-[#FCFEFD] p-3.5">
              <div className="text-[11px] font-medium text-[#546459]">Destino Nuvem</div>
              <div className="mt-1 text-sm font-bold text-[#14532D]">{status.targetEngine}</div>
            </div>
            <div className="rounded-xl border border-[#E5ECE6] bg-[#FCFEFD] p-3.5">
              <div className="text-[11px] font-medium text-[#546459]">Tabelas / Registos</div>
              <div className="mt-1 font-mono-tabular text-sm font-extrabold text-[#111814]">
                {status.totalTables} tabelas · {status.totalRows} registos
              </div>
            </div>
            <div className="rounded-xl border border-[#E5ECE6] bg-[#FCFEFD] p-3.5">
              <div className="text-[11px] font-medium text-[#546459]">Tamanho Atual (SQLite)</div>
              <div className="mt-1 font-mono-tabular text-sm font-extrabold text-[#111814]">
                {(status.sqliteFileSizeBytes / 1024).toFixed(1)} KB
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[#E5ECE6] bg-[#F8FBF9] p-4 space-y-2.5">
            <div className="text-xs font-bold text-[#14532D] flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-[#15803D]" />
              Checklist de Prontidão para Produção na Nuvem
            </div>
            <div className="space-y-2">
              {status.checklist.map((item) => (
                <div
                  key={item.key}
                  className="flex items-start gap-2.5 text-xs bg-white rounded-lg border border-[#E5ECE6] px-3 py-2.5"
                >
                  {item.ready ? (
                    <CheckCircle2 className="w-4 h-4 text-[#15803D] shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-[#CA8A04] shrink-0 mt-0.5" />
                  )}
                  <div>
                    <div className="font-semibold text-[#111814]">{item.label}</div>
                    <div className="text-[11px] text-[#546459] mt-0.5">{item.detail}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="pt-1 text-[11px] text-[#546459]">
              Quando decidir migrar para a nuvem, poderá importar o ficheiro <code className="font-mono-tabular text-[#14532D]">.sql</code> diretamente no seu servidor PostgreSQL / Cloud SQL sem precisar de configurar variáveis de ambiente agora.
            </div>
          </div>
        </>
      )}
    </div>
  );
};
