import React, { useEffect, useState } from 'react';
import { CalendarClock, CheckCircle2, Database, Download, Mail, Save, Send, ShieldCheck } from 'lucide-react';
import { apiRequest } from '../lib/api';
import type { BackupScheduleConfig, BackupStatusResponse, TransactionalEmailProvider } from '../types';
import { CloudMigrationReadinessCard } from './CloudMigrationReadinessCard';
import { CriticalAlertsSettingsCard } from './CriticalAlertsSettingsCard';
import { ServerHealthMonitor } from './ServerHealthMonitor';
import { ServerUsageHistory24hChart } from './ServerUsageHistory24hChart';
import { SmsGatewaySettingsCard } from './SmsGatewaySettingsCard';

interface SecurityBackupsPanelProps {
  backupStatus: BackupStatusResponse;
  downloadingBackup: boolean;
  onDownloadLatestAuto: () => void;
  onDownloadManual: () => void;
  onDownloadStoredDump: (id: number, filename: string) => void;
  onScheduleUpdated: (updated: BackupStatusResponse) => void;
}

const WEEKDAYS = [
  { value: 1, label: 'Segunda-feira' },
  { value: 2, label: 'Terça-feira' },
  { value: 3, label: 'Quarta-feira' },
  { value: 4, label: 'Quinta-feira' },
  { value: 5, label: 'Sexta-feira' },
  { value: 6, label: 'Sábado' },
  { value: 0, label: 'Domingo' },
];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function previewCron(cfg: BackupScheduleConfig): string {
  if (cfg.frequency === 'daily') return `${cfg.minute} ${cfg.hour} * * *`;
  if (cfg.frequency === 'monthly') return `${cfg.minute} ${cfg.hour} ${cfg.dayOfMonth} * *`;
  return `${cfg.minute} ${cfg.hour} * * ${cfg.dayOfWeek}`;
}

export const SecurityBackupsPanel: React.FC<SecurityBackupsPanelProps> = ({
  backupStatus,
  downloadingBackup,
  onDownloadLatestAuto,
  onDownloadManual,
  onDownloadStoredDump,
  onScheduleUpdated,
}) => {
  const [form, setForm] = useState<BackupScheduleConfig>(backupStatus.schedule);
  const [alertThresholds, setAlertThresholds] = useState<{ cpu: number; memory: number }>({
    cpu: 85,
    memory: 85,
  });
  const [emailApiKeyInput, setEmailApiKeyInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    setForm(backupStatus.schedule);
  }, [backupStatus.schedule]);

  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setSaving(true);
    try {
      const updated = await apiRequest<BackupStatusResponse>('/api/admin/principal/backups/schedule', {
        method: 'PUT',
        body: JSON.stringify({
          ...form,
          emailApiKey: emailApiKeyInput.trim() || undefined,
        }),
      });
      onScheduleUpdated(updated);
      setEmailApiKeyInput('');
      setFeedback({
        type: 'ok',
        text: `Agendamento e relatório por email atualizados (${updated.cronExpression} — ${updated.cronDescription}).`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao guardar agendamento de backups.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTestBackupEmail = async () => {
    setFeedback(null);
    setTestingEmail(true);
    try {
      const res = await apiRequest<{
        result: { sent: boolean; provider: string; recipientEmail: string; summary: string };
        status: BackupStatusResponse;
      }>('/api/admin/principal/backups/email-test', {
        method: 'POST',
      });
      onScheduleUpdated(res.status);
      setFeedback({
        type: res.result.sent ? 'ok' : 'err',
        text: res.result.sent
          ? `Relatório de backup de teste enviado para ${res.result.recipientEmail} (${res.result.summary}).`
          : res.result.summary,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao enviar teste de relatório por email.',
      });
    } finally {
      setTestingEmail(false);
    }
  };

  const totalSizeKb = backupStatus.backups.reduce((acc, b) => acc + b.sizeBytes, 0) / 1024;
  const autoCount = backupStatus.backups.filter((b) => b.triggerType === 'automatico').length;

  return (
    <div className="space-y-6">
      {/* Header + Quick Actions */}
      <div className="rounded-xl border border-[#DCE5DE] bg-white p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-1.5">
          <h2 className="font-display text-lg font-bold text-[#111814] flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#15803D]" />
            Segurança e Backups da Base de Dados
          </h2>
          <p className="text-xs text-[#546459] max-w-2xl">
            Configure o agendamento automático de dumps JSON da base de dados no servidor, defina a política de retenção e consulte ou descarregue o histórico completo de backups realizados.
          </p>
          <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-[#445449]">
            <span>
              Estado:{' '}
              <strong className={backupStatus.schedule.enabled ? 'text-[#15803D]' : 'text-[#B45309]'}>
                {backupStatus.schedule.enabled ? 'Ativo' : 'Pausado'}
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Cron atual:{' '}
              <strong className="font-mono-tabular text-[#14532D]">{backupStatus.cronExpression}</strong>{' '}
              ({backupStatus.cronDescription})
            </span>
            {backupStatus.nextScheduledBackupAt && (
              <>
                <span aria-hidden="true">·</span>
                <span>
                  Próxima execução:{' '}
                  <strong className="font-mono-tabular text-[#111814]">
                    {new Date(backupStatus.nextScheduledBackupAt).toLocaleString('pt-AO')}
                  </strong>
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            disabled={downloadingBackup}
            onClick={onDownloadLatestAuto}
            className="inline-flex items-center gap-2 rounded-lg bg-[#14532D] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#15803D] disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            <Download className="w-4 h-4 text-[#FACC15]" />
            {downloadingBackup ? 'A transferir...' : 'Download Direto do Último Dump (JSON)'}
          </button>

          <button
            type="button"
            disabled={downloadingBackup}
            onClick={onDownloadManual}
            className="inline-flex items-center gap-2 rounded-lg border border-[#14532D]/30 bg-white px-4 py-2.5 text-xs font-bold text-[#14532D] hover:bg-[#EEF7F0] disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            <Database className="w-4 h-4 text-[#15803D]" />
            {downloadingBackup ? 'A gerar...' : 'Gerar Dump Manual Agora'}
          </button>
        </div>
      </div>

      {/* Real-Time Server Health Monitor (CPU, Memory, Network Latency) */}
      <ServerHealthMonitor
        cpuThresholdPct={alertThresholds.cpu}
        memoryThresholdPct={alertThresholds.memory}
      />

      {/* 24-Hour Historical CPU & Memory Line Chart (Recharts) */}
      <ServerUsageHistory24hChart
        cpuThresholdPct={alertThresholds.cpu}
        memoryThresholdPct={alertThresholds.memory}
      />

      {/* Critical Resource Alerts Configuration (Manual CPU / Memory Thresholds) */}
      <CriticalAlertsSettingsCard onThresholdsChanged={setAlertThresholds} />

      {/* SMS Gateway Integration for Critical Overload Alerts */}
      <SmsGatewaySettingsCard />

      {/* PostgreSQL / Google Cloud SQL Migration Readiness & SQL Exporter */}
      <CloudMigrationReadinessCard />

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-[#DCE5DE] bg-white p-4">
          <div className="text-xs font-medium text-[#546459]">Backups Armazenados</div>
          <div className="mt-1 font-display text-2xl font-extrabold text-[#111814] font-mono-tabular">
            {backupStatus.backups.length}
          </div>
        </div>
        <div className="rounded-xl border border-[#DCE5DE] bg-white p-4">
          <div className="text-xs font-medium text-[#546459]">Automáticos (Cron Job)</div>
          <div className="mt-1 font-display text-2xl font-extrabold text-[#15803D] font-mono-tabular">
            {autoCount}
          </div>
        </div>
        <div className="rounded-xl border border-[#DCE5DE] bg-white p-4">
          <div className="text-xs font-medium text-[#546459]">Retenção Configurada</div>
          <div className="mt-1 font-display text-2xl font-extrabold text-[#14532D] font-mono-tabular">
            {backupStatus.schedule.retentionLimit} dumps
          </div>
        </div>
        <div className="rounded-xl border border-[#DCE5DE] bg-white p-4">
          <div className="text-xs font-medium text-[#546459]">Espaço Ocupado</div>
          <div className="mt-1 font-display text-2xl font-extrabold text-[#111814] font-mono-tabular">
            {totalSizeKb.toFixed(1)} KB
          </div>
        </div>
      </div>

      {/* Schedule Configuration Form */}
      <form
        onSubmit={handleSaveSchedule}
        className="rounded-xl border border-[#DCE5DE] bg-white p-6 space-y-5"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#EDF2EE] pb-4">
          <div>
            <h3 className="font-display text-base font-bold text-[#111814] flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-[#15803D]" />
              Configuração do Agendamento Automático de Dumps
            </h3>
            <p className="text-xs text-[#546459] mt-0.5">
              O servidor aplica imediatamente a nova regra de agendamento sem necessidade de reiniciar.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-xs font-bold text-[#14532D] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
              className="h-4 w-4 rounded border-[#D4DDD6] accent-[#14532D]"
            />
            Agendamento Automático Ativo
          </label>
        </div>

        {feedback && (
          <div
            className={`rounded-lg border px-3.5 py-2.5 text-xs font-medium flex items-center gap-2 ${
              feedback.type === 'ok'
                ? 'border-[#15803D]/30 bg-[#EEF7F0] text-[#14532D]'
                : 'border-red-200 bg-red-50 text-red-700'
            }`}
          >
            {feedback.type === 'ok' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
            <span>{feedback.text}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-[#1C2720] mb-1">Frequência</label>
            <select
              value={form.frequency}
              onChange={(e) =>
                setForm({
                  ...form,
                  frequency: e.target.value as BackupScheduleConfig['frequency'],
                })
              }
              className="w-full rounded-lg border border-[#D4DDD6] bg-white px-3 py-2 text-xs focus:border-[#15803D] focus:outline-none"
            >
              <option value="daily">Diário</option>
              <option value="weekly">Semanal</option>
              <option value="monthly">Mensal</option>
            </select>
          </div>

          {form.frequency === 'weekly' && (
            <div>
              <label className="block text-xs font-medium text-[#1C2720] mb-1">Dia da Semana</label>
              <select
                value={form.dayOfWeek}
                onChange={(e) => setForm({ ...form, dayOfWeek: Number(e.target.value) })}
                className="w-full rounded-lg border border-[#D4DDD6] bg-white px-3 py-2 text-xs focus:border-[#15803D] focus:outline-none"
              >
                {WEEKDAYS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {form.frequency === 'monthly' && (
            <div>
              <label className="block text-xs font-medium text-[#1C2720] mb-1">Dia do Mês (1–28)</label>
              <input
                type="number"
                min={1}
                max={28}
                value={form.dayOfMonth}
                onChange={(e) => setForm({ ...form, dayOfMonth: Math.min(28, Math.max(1, Number(e.target.value))) })}
                className="w-full rounded-lg border border-[#D4DDD6] bg-white px-3 py-2 text-xs font-mono-tabular focus:border-[#15803D] focus:outline-none"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[#1C2720] mb-1">Hora de Execução (UTC)</label>
            <div className="flex items-center gap-2">
              <select
                value={form.hour}
                onChange={(e) => setForm({ ...form, hour: Number(e.target.value) })}
                className="w-full rounded-lg border border-[#D4DDD6] bg-white px-2.5 py-2 text-xs font-mono-tabular focus:border-[#15803D] focus:outline-none"
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {pad2(h)}h
                  </option>
                ))}
              </select>
              <span className="text-xs font-bold text-[#546459]">:</span>
              <select
                value={form.minute}
                onChange={(e) => setForm({ ...form, minute: Number(e.target.value) })}
                className="w-full rounded-lg border border-[#D4DDD6] bg-white px-2.5 py-2 text-xs font-mono-tabular focus:border-[#15803D] focus:outline-none"
              >
                {[0, 15, 30, 45].map((m) => (
                  <option key={m} value={m}>
                    {pad2(m)}m
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#1C2720] mb-1">
              Retenção Máxima (ficheiros)
            </label>
            <input
              type="number"
              min={5}
              max={50}
              value={form.retentionLimit}
              onChange={(e) =>
                setForm({ ...form, retentionLimit: Math.min(50, Math.max(5, Number(e.target.value))) })
              }
              className="w-full rounded-lg border border-[#D4DDD6] bg-white px-3 py-2 text-xs font-mono-tabular focus:border-[#15803D] focus:outline-none"
            />
          </div>
        </div>

        {/* Automatic Transactional Email Report Configuration */}
        <div className="rounded-xl border border-[#E5ECE6] bg-[#F8FBF9] p-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <div className="text-xs font-bold text-[#14532D] flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-[#15803D]" />
                Envio Automático de Relatório de Backup por Email (Serviço Transacional)
              </div>
              <p className="text-[11px] text-[#546459] mt-0.5">
                Após cada backup agendado, envia automaticamente o resumo do dump (e opcionalmente o ficheiro JSON em anexo) para o Administrador Principal.
              </p>
            </div>
            <label className="inline-flex items-center gap-2 text-xs font-bold text-[#14532D] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.emailReportEnabled}
                onChange={(e) => setForm({ ...form, emailReportEnabled: e.target.checked })}
                className="h-4 w-4 rounded border-[#D4DDD6] accent-[#14532D]"
              />
              Enviar Relatório por Email
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#1C2720] mb-1">
                Serviço de Transação de Email
              </label>
              <select
                value={form.emailProvider}
                onChange={(e) =>
                  setForm({ ...form, emailProvider: e.target.value as TransactionalEmailProvider })
                }
                className="w-full rounded-lg border border-[#D4DDD6] bg-white px-3 py-2 text-xs focus:border-[#15803D] focus:outline-none"
              >
                <option value="smtp">SMTP Configurado na Plataforma</option>
                <option value="resend">Resend (API Transacional)</option>
                <option value="sendgrid">SendGrid (API Transacional)</option>
                <option value="brevo">Brevo / Sendinblue (API)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#1C2720] mb-1">
                Email de Destino (Admin)
              </label>
              <input
                type="email"
                value={form.emailRecipient}
                onChange={(e) => setForm({ ...form, emailRecipient: e.target.value })}
                placeholder={form.defaultAdminEmail ? `Padrão: ${form.defaultAdminEmail}` : 'admin@nzilaagro.ao'}
                className="w-full rounded-lg border border-[#D4DDD6] bg-white px-3 py-2 text-xs focus:border-[#15803D] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#1C2720] mb-1">
                Email Remetente (From)
              </label>
              <input
                type="email"
                value={form.emailFrom}
                onChange={(e) => setForm({ ...form, emailFrom: e.target.value })}
                placeholder="backups@nzilaagro.ao"
                className="w-full rounded-lg border border-[#D4DDD6] bg-white px-3 py-2 text-xs focus:border-[#15803D] focus:outline-none"
              />
            </div>

            {form.emailProvider !== 'smtp' && (
              <div>
                <label className="block text-xs font-medium text-[#1C2720] mb-1">
                  API Key ({form.emailProvider.toUpperCase()}){' '}
                  {form.hasEmailApiKey && (
                    <span className="text-[11px] font-semibold text-[#15803D]">(Guardada)</span>
                  )}
                </label>
                <input
                  type="password"
                  value={emailApiKeyInput}
                  onChange={(e) => setEmailApiKeyInput(e.target.value)}
                  placeholder={form.hasEmailApiKey ? '•••••••• (manter atual)' : 'Cole a API Key'}
                  className="w-full rounded-lg border border-[#D4DDD6] bg-white px-3 py-2 text-xs font-mono-tabular focus:border-[#15803D] focus:outline-none"
                />
              </div>
            )}
          </div>

          <label className="inline-flex items-center gap-2 text-xs text-[#1C2720] cursor-pointer">
            <input
              type="checkbox"
              checked={form.attachJsonDump}
              onChange={(e) => setForm({ ...form, attachJsonDump: e.target.checked })}
              className="h-4 w-4 rounded border-[#D4DDD6] accent-[#14532D]"
            />
            Anexar ficheiro JSON do dump ao email (quando suportado pelo serviço e até 5 MB)
          </label>

          {backupStatus.emailLogs && backupStatus.emailLogs.length > 0 && (
            <div className="border-t border-[#E5ECE6] pt-3 space-y-1.5">
              <div className="text-[11px] font-bold text-[#14532D]">Últimos Envios de Relatório por Email</div>
              <div className="space-y-1">
                {backupStatus.emailLogs.slice(0, 3).map((log) => (
                  <div
                    key={log.id}
                    className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#546459] font-mono-tabular"
                  >
                    <span>
                      {new Date(log.createdAt).toLocaleString('pt-AO')} ·{' '}
                      <strong className="uppercase text-[#111814]">{log.provider}</strong> → {log.recipientEmail}
                    </span>
                    <span className={log.success ? 'font-bold text-[#15803D]' : 'font-bold text-red-700'}>
                      {log.success ? 'Enviado' : 'Falhou'} — {log.summary}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-[#EDF2EE]">
          <div className="text-xs text-[#546459]">
            Expressão Cron prevista:{' '}
            <code className="rounded bg-[#F2F7F3] px-2 py-0.5 font-mono-tabular font-bold text-[#14532D]">
              {previewCron(form)}
            </code>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={testingEmail}
              onClick={handleTestBackupEmail}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#CA8A04]/40 bg-[#FEFCE8] px-3.5 py-2.5 text-xs font-bold text-[#854D0E] hover:bg-[#FEF9C3] disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              <Send className="w-3.5 h-3.5 text-[#CA8A04]" />
              {testingEmail ? 'A enviar teste...' : 'Testar Email de Relatório'}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-[#14532D] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#15803D] disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              <Save className="w-4 h-4" />
              {saving ? 'A guardar...' : 'Guardar Agendamento'}
            </button>
          </div>
        </div>
      </form>

      {/* Backup History Table */}
      <div className="overflow-x-auto rounded-xl border border-[#DCE5DE] bg-white">
        <div className="border-b border-[#E5ECE6] px-5 py-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-base font-bold text-[#111814]">
              Histórico de Backups Realizados
            </h3>
            <p className="text-xs text-[#546459] mt-0.5">
              Registo cronológico de todos os dumps JSON gerados automaticamente pelo cron job ou manualmente.
            </p>
          </div>
          <span className="text-xs font-mono-tabular font-semibold text-[#546459]">
            {backupStatus.backups.length} registos
          </span>
        </div>

        <table className="w-full text-left text-sm">
          <thead className="border-b border-[#E5ECE6] bg-[#F7F9F7] text-xs font-semibold text-[#546459]">
            <tr>
              <th className="px-4 py-3">Ficheiro JSON</th>
              <th className="px-4 py-3">Origem</th>
              <th className="px-4 py-3">Gerado em</th>
              <th className="px-4 py-3">Tamanho</th>
              <th className="px-4 py-3">Resumo de Registos</th>
              <th className="px-4 py-3">Último Download</th>
              <th className="px-4 py-3 text-right">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EDF2EE]">
            {backupStatus.backups.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-xs text-[#546459]">
                  Nenhum backup registado até ao momento.
                </td>
              </tr>
            ) : (
              backupStatus.backups.map((bkp) => (
                <tr key={bkp.id} className="hover:bg-[#F7F9F7]">
                  <td className="px-4 py-3 font-mono-tabular text-xs font-semibold text-[#111814]">
                    {bkp.filename}
                  </td>
                  <td className="px-4 py-3 text-xs font-semibold whitespace-nowrap">
                    <span className={bkp.triggerType === 'manual' ? 'text-[#14532D]' : 'text-[#546459]'}>
                      {bkp.triggerType === 'manual' ? 'Manual' : 'Cron Job (Automático)'}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono-tabular text-xs text-[#445449] whitespace-nowrap">
                    {new Date(bkp.createdAt).toLocaleString('pt-AO')}
                  </td>
                  <td className="px-4 py-3 font-mono-tabular text-xs text-[#445449] whitespace-nowrap">
                    {(bkp.sizeBytes / 1024).toFixed(1)} KB
                  </td>
                  <td className="px-4 py-3 text-xs text-[#546459]">
                    {bkp.recordsSummary.utilizadores ?? 0} utilizadores · {bkp.recordsSummary.publicacoes ?? 0} anúncios ·{' '}
                    {bkp.recordsSummary.doacoes ?? 0} doações · {bkp.recordsSummary.vendas ?? 0} vendas
                  </td>
                  <td className="px-4 py-3 font-mono-tabular text-xs text-[#546459] whitespace-nowrap">
                    {bkp.lastDownloadedAt
                      ? new Date(bkp.lastDownloadedAt).toLocaleString('pt-AO')
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      disabled={downloadingBackup}
                      onClick={() => onDownloadStoredDump(bkp.id, bkp.filename)}
                      className="inline-flex items-center gap-1 rounded-lg border border-[#D4DDD6] bg-white px-3 py-1.5 text-xs font-semibold text-[#14532D] hover:bg-[#F2F7F3] disabled:opacity-40 whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Descarregar
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
