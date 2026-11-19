import fs from 'node:fs';
import path from 'node:path';
import cron, { ScheduledTask } from 'node-cron';
import { db } from './db.ts';
import { sendPlatformEmail } from './mailer.ts';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
export const BACKUP_CRON_EXPRESSION = '0 0 * * 1';
export const BACKUP_CRON_DESCRIPTION = 'Todas as segundas-feiras às 00:00 (UTC)';

export type TransactionalEmailProvider = 'smtp' | 'resend' | 'sendgrid' | 'brevo';

export interface BackupScheduleConfig {
  enabled: boolean;
  frequency: 'daily' | 'weekly' | 'monthly';
  dayOfWeek: number; // 0 (Dom) - 6 (Sáb)
  dayOfMonth: number; // 1 - 28
  hour: number; // 0 - 23
  minute: number; // 0 - 59
  retentionLimit: number; // 5 - 50
  emailReportEnabled: boolean;
  emailProvider: TransactionalEmailProvider;
  hasEmailApiKey: boolean;
  emailFrom: string;
  emailRecipient: string;
  defaultAdminEmail: string;
  attachJsonDump: boolean;
  updatedAt?: string;
}

const WEEKDAY_NAMES = [
  'domingos',
  'segundas-feiras',
  'terças-feiras',
  'quartas-feiras',
  'quintas-feiras',
  'sextas-feiras',
  'sábados',
];

const backupsDir = path.resolve(process.cwd(), 'data', 'backups');
let cronTask: ScheduledTask | null = null;

if (!fs.existsSync(backupsDir)) {
  fs.mkdirSync(backupsDir, { recursive: true });
}

function parseSqliteUtcDate(value: string): Date {
  const iso = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
  return new Date(iso);
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function getDefaultPrincipalEmail(): string {
  const admin = db
    .prepare("SELECT email FROM users WHERE role = 'ADMIN_PRINCIPAL' ORDER BY id ASC LIMIT 1")
    .get() as { email?: string } | undefined;
  return String(admin?.email || '').trim();
}

function normalizeEmailProvider(value: unknown): TransactionalEmailProvider {
  const str = String(value || 'smtp');
  if (str === 'resend' || str === 'sendgrid' || str === 'brevo') return str;
  return 'smtp';
}

function getRawBackupSettingsRow(): Record<string, unknown> {
  let row = db.prepare('SELECT * FROM backup_settings WHERE id = 1').get() as Record<string, unknown> | undefined;
  if (!row) {
    db.prepare(
      `INSERT OR IGNORE INTO backup_settings
       (id, enabled, frequency, day_of_week, day_of_month, hour, minute, retention_limit, email_report_enabled, email_provider, email_api_key, email_from, email_recipient, attach_json_dump)
       VALUES (1, 1, 'weekly', 1, 1, 0, 0, 20, 0, 'smtp', '', '', '', 1)`
    ).run();
    row = db.prepare('SELECT * FROM backup_settings WHERE id = 1').get() as Record<string, unknown>;
  }
  return row;
}

export function getBackupScheduleConfig(): BackupScheduleConfig {
  const row = getRawBackupSettingsRow();
  const freq = String(row.frequency || 'weekly');
  return {
    enabled: Number(row.enabled) === 1,
    frequency: freq === 'daily' || freq === 'monthly' ? freq : 'weekly',
    dayOfWeek: Math.min(6, Math.max(0, Number(row.day_of_week ?? 1))),
    dayOfMonth: Math.min(28, Math.max(1, Number(row.day_of_month ?? 1))),
    hour: Math.min(23, Math.max(0, Number(row.hour ?? 0))),
    minute: Math.min(59, Math.max(0, Number(row.minute ?? 0))),
    retentionLimit: Math.min(50, Math.max(5, Number(row.retention_limit ?? 20))),
    emailReportEnabled: Number(row.email_report_enabled) === 1,
    emailProvider: normalizeEmailProvider(row.email_provider),
    hasEmailApiKey: Boolean(String(row.email_api_key || '').trim()),
    emailFrom: String(row.email_from || ''),
    emailRecipient: String(row.email_recipient || ''),
    defaultAdminEmail: getDefaultPrincipalEmail(),
    attachJsonDump: Number(row.attach_json_dump ?? 1) === 1,
    updatedAt: row.updated_at ? parseSqliteUtcDate(String(row.updated_at)).toISOString() : undefined,
  };
}

export function buildCronFromConfig(cfg: BackupScheduleConfig): { expression: string; description: string } {
  const timeStr = `${pad2(cfg.hour)}:${pad2(cfg.minute)} (UTC)`;
  if (cfg.frequency === 'daily') {
    return {
      expression: `${cfg.minute} ${cfg.hour} * * *`,
      description: `Todos os dias às ${timeStr}`,
    };
  }
  if (cfg.frequency === 'monthly') {
    return {
      expression: `${cfg.minute} ${cfg.hour} ${cfg.dayOfMonth} * *`,
      description: `Todo dia ${cfg.dayOfMonth} de cada mês às ${timeStr}`,
    };
  }
  const dayLabel = WEEKDAY_NAMES[cfg.dayOfWeek] || 'segundas-feiras';
  const prefix = cfg.dayOfWeek === 0 || cfg.dayOfWeek === 6 ? 'Todos os' : 'Todas as';
  return {
    expression: `${cfg.minute} ${cfg.hour} * * ${cfg.dayOfWeek}`,
    description: `${prefix} ${dayLabel} às ${timeStr}`,
  };
}

function getNextScheduledRunUtc(cfg: BackupScheduleConfig, fromDate: Date = new Date()): Date | null {
  if (!cfg.enabled) return null;

  if (cfg.frequency === 'daily') {
    const candidate = new Date(Date.UTC(
      fromDate.getUTCFullYear(),
      fromDate.getUTCMonth(),
      fromDate.getUTCDate(),
      cfg.hour,
      cfg.minute,
      0,
      0
    ));
    if (candidate.getTime() <= fromDate.getTime()) {
      candidate.setUTCDate(candidate.getUTCDate() + 1);
    }
    return candidate;
  }

  if (cfg.frequency === 'monthly') {
    const candidate = new Date(Date.UTC(
      fromDate.getUTCFullYear(),
      fromDate.getUTCMonth(),
      cfg.dayOfMonth,
      cfg.hour,
      cfg.minute,
      0,
      0
    ));
    if (candidate.getTime() <= fromDate.getTime()) {
      candidate.setUTCMonth(candidate.getUTCMonth() + 1);
    }
    return candidate;
  }

  // weekly
  const candidate = new Date(Date.UTC(
    fromDate.getUTCFullYear(),
    fromDate.getUTCMonth(),
    fromDate.getUTCDate(),
    cfg.hour,
    cfg.minute,
    0,
    0
  ));
  const currentDay = candidate.getUTCDay();
  let delta = (cfg.dayOfWeek - currentDay + 7) % 7;
  if (delta === 0 && candidate.getTime() <= fromDate.getTime()) {
    delta = 7;
  }
  candidate.setUTCDate(candidate.getUTCDate() + delta);
  return candidate;
}

export function createJsonBackup(triggerType: 'automatico' | 'manual' = 'automatico') {
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }

  const cfg = getBackupScheduleConfig();
  const { expression, description } = buildCronFromConfig(cfg);

  const users = db
    .prepare(`
      SELECT id, email, name, age, province, profession, phone, whatsapp,
             role, access_profile, permissions_json, status, quota_active, quota_expires_at, bonus_kz,
             active_seconds, last_active_at, created_at
      FROM users ORDER BY id ASC
    `)
    .all();

  const listings = db
    .prepare(`
      SELECT id, user_id, category, title, description, price_kz, unit, province, is_masked, created_at
      FROM listings ORDER BY id ASC
    `)
    .all();

  const financialSettings = db.prepare('SELECT * FROM financial_settings WHERE id = 1').get() || null;
  const campaigns = db.prepare('SELECT * FROM campaigns ORDER BY id ASC').all();
  const passwordRecoveryRequests = db
    .prepare(`
      SELECT id, user_id, status, admin_notes, created_at, reviewed_at
      FROM password_recovery_requests ORDER BY id ASC
    `)
    .all();
  const supportMessages = db.prepare('SELECT * FROM support_messages ORDER BY id ASC').all();
  const donations = db.prepare('SELECT * FROM donations ORDER BY id ASC').all();
  const bonusLogs = db.prepare('SELECT * FROM bonus_logs ORDER BY id ASC').all();
  const notifications = db.prepare('SELECT * FROM notifications ORDER BY id ASC').all();
  const listingInquiries = db.prepare('SELECT * FROM listing_inquiries ORDER BY id ASC').all();
  const listingSales = db.prepare('SELECT * FROM listing_sales ORDER BY id ASC').all();
  const auditLogs = db.prepare('SELECT * FROM audit_logs ORDER BY id ASC').all();
  const webhooks = db
    .prepare('SELECT id, name, url, events, is_active, last_status_code, last_triggered_at, created_at FROM webhooks ORDER BY id ASC')
    .all();
  const clientErrorReports = db.prepare('SELECT * FROM client_error_reports ORDER BY id ASC').all();
  const executiveReports = db.prepare('SELECT * FROM executive_reports ORDER BY id ASC').all();

  const recordsSummary = {
    utilizadores: users.length,
    publicacoes: listings.length,
    campanhas: campaigns.length,
    doacoes: donations.length,
    vendas: listingSales.length,
    consultas: listingInquiries.length,
    suporte: supportMessages.length,
    auditoria: auditLogs.length,
    errosCliente: clientErrorReports.length,
    relatoriosExecutivos: executiveReports.length,
  };

  const exportedAt = new Date().toISOString();
  const payload = {
    platform: 'Nzila Agro',
    version: '1.1',
    exportedAt,
    triggerType,
    cronExpression: expression,
    cronDescription: description,
    recordsSummary,
    data: {
      users,
      listings,
      financialSettings,
      campaigns,
      passwordRecoveryRequests,
      supportMessages,
      donations,
      bonusLogs,
      notifications,
      listingInquiries,
      listingSales,
      auditLogs,
      webhooks,
      clientErrorReports,
      executiveReports,
    },
  };

  const stamp = exportedAt.replace(/[:.]/g, '-').slice(0, 19);
  const prefix = triggerType === 'manual' ? 'nzila-agro-dump-manual' : 'nzila-agro-dump-cron';
  const filename = `${prefix}-${stamp}.json`;
  const filePath = path.join(backupsDir, filename);
  const jsonContent = JSON.stringify(payload, null, 2);

  fs.writeFileSync(filePath, jsonContent, 'utf-8');
  const sizeBytes = Buffer.byteLength(jsonContent, 'utf-8');

  const res = db
    .prepare(`
      INSERT INTO backups (filename, file_path, size_bytes, trigger_type, records_summary, last_downloaded_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .run(
      filename,
      filePath,
      sizeBytes,
      triggerType,
      JSON.stringify(recordsSummary),
      triggerType === 'manual' ? new Date().toISOString().replace('T', ' ').slice(0, 19) : null
    );

  // Enforce configured retention limit
  const oldRows = db
    .prepare('SELECT id, file_path FROM backups ORDER BY id DESC LIMIT -1 OFFSET ?')
    .all(cfg.retentionLimit);
  for (const old of oldRows) {
    try {
      const oldPath = String(old.file_path);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    } catch {
      // Ignore cleanup errors
    }
    db.prepare('DELETE FROM backups WHERE id = ?').run(Number(old.id));
  }

  return {
    id: Number(res.lastInsertRowid),
    filename,
    content: jsonContent,
    sizeBytes,
    recordsSummary,
  };
}

export function ensureWeeklyBackup(): void {
  const latest = db
    .prepare("SELECT id, file_path, created_at FROM backups WHERE trigger_type = 'automatico' ORDER BY id DESC LIMIT 1")
    .get();
  if (!latest) {
    createJsonBackup('automatico');
    return;
  }

  const createdMs = parseSqliteUtcDate(String(latest.created_at)).getTime();
  const fileMissing = !fs.existsSync(String(latest.file_path));

  if (fileMissing || Date.now() - createdMs >= SEVEN_DAYS_MS) {
    createJsonBackup('automatico');
  }
}

function recordBackupEmailLog(params: {
  provider: string;
  recipientEmail: string;
  backupFilename: string;
  success: boolean;
  summary: string;
}) {
  db.prepare(
    `INSERT INTO backup_email_logs (provider, recipient_email, backup_filename, success, summary)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    params.provider,
    params.recipientEmail,
    params.backupFilename,
    params.success ? 1 : 0,
    params.summary.slice(0, 300)
  );
}

export async function sendBackupEmailReport(params: {
  filename: string;
  content: string;
  sizeBytes: number;
  recordsSummary: Record<string, number>;
  isTest?: boolean;
  forceAttempt?: boolean;
}): Promise<{ sent: boolean; provider: TransactionalEmailProvider; recipientEmail: string; summary: string }> {
  const raw = getRawBackupSettingsRow();
  const cfg = getBackupScheduleConfig();
  const apiKey = String(raw.email_api_key || '').trim();
  const recipientEmail = cfg.emailRecipient || cfg.defaultAdminEmail;
  const fromEmail = cfg.emailFrom || 'backups@nzilaagro.ao';

  if (!cfg.emailReportEnabled && !params.forceAttempt) {
    return {
      sent: false,
      provider: cfg.emailProvider,
      recipientEmail,
      summary: 'Envio automático de relatório de backup por email desativado.',
    };
  }

  if (!recipientEmail) {
    const summary = 'Nenhum endereço de email configurado para o Administrador Principal.';
    recordBackupEmailLog({
      provider: cfg.emailProvider,
      recipientEmail: 'N/D',
      backupFilename: params.filename,
      success: false,
      summary,
    });
    return { sent: false, provider: cfg.emailProvider, recipientEmail: '', summary };
  }

  const { expression, description } = buildCronFromConfig(cfg);
  const subject = params.isTest
    ? `[TESTE] Relatório de Backup Agendado — Nzila Agro (${params.filename})`
    : `Relatório de Backup Agendado — Nzila Agro (${params.filename})`;

  const summaryItems = [
    `Ficheiro: ${params.filename}`,
    `Tamanho: ${(params.sizeBytes / 1024).toFixed(1)} KB`,
    `Agendamento ativo: ${expression} (${description})`,
    `Registos incluídos: ${params.recordsSummary.utilizadores ?? 0} utilizadores, ${params.recordsSummary.publicacoes ?? 0} anúncios, ${params.recordsSummary.vendas ?? 0} vendas, ${params.recordsSummary.doacoes ?? 0} doações, ${params.recordsSummary.auditoria ?? 0} logs de auditoria.`,
    `Data/Hora (UTC): ${new Date().toISOString()}`,
  ];

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; color: #111814; max-width: 640px; margin: 0 auto; border: 1px solid #dce5de; border-radius: 10px; overflow: hidden;">
      <div style="background: #14532d; color: #ffffff; padding: 18px 22px;">
        <h2 style="margin: 0; font-size: 18px;">Nzila Agro — Relatório de Backup Agendado</h2>
      </div>
      <div style="padding: 20px 22px; font-size: 14px; line-height: 1.6;">
        <p>${params.isTest ? 'Este é um envio de teste do relatório automático de backups.' : 'Um novo dump completo da base de dados foi gerado automaticamente pelo servidor.'}</p>
        <ul style="padding-left: 18px; color: #1c2720;">
          ${summaryItems.map((line) => `<li>${line}</li>`).join('')}
        </ul>
        <p style="font-size: 12px; color: #546459;">Pode também descarregar este e outros dumps diretamente na aba <strong>Segurança e Backups</strong> do Painel do Administrador Principal.</p>
      </div>
    </div>
  `;

  const shouldAttach = cfg.attachJsonDump && params.sizeBytes <= 5 * 1024 * 1024;
  const base64Dump = shouldAttach ? Buffer.from(params.content, 'utf-8').toString('base64') : null;

  try {
    if (cfg.emailProvider === 'smtp') {
      await sendPlatformEmail({
        to: recipientEmail,
        subject,
        title: 'Relatório de Backup Agendado (JSON)',
        paragraphs: summaryItems,
        eventType: 'backup_report',
      });
      const summary = 'Relatório encaminhado via serviço SMTP configurado na plataforma.';
      recordBackupEmailLog({
        provider: 'smtp',
        recipientEmail,
        backupFilename: params.filename,
        success: true,
        summary,
      });
      return { sent: true, provider: 'smtp', recipientEmail, summary };
    }

    if (!apiKey) {
      throw new Error(`Configure a API Key do serviço transacional (${cfg.emailProvider.toUpperCase()}).`);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    let response: Response;

    try {
      if (cfg.emailProvider === 'resend') {
        response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [recipientEmail],
            subject,
            html: htmlBody,
            ...(base64Dump
              ? { attachments: [{ filename: params.filename, content: base64Dump }] }
              : {}),
          }),
          signal: controller.signal,
        });
      } else if (cfg.emailProvider === 'sendgrid') {
        response = await fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: recipientEmail }] }],
            from: { email: fromEmail, name: 'Nzila Agro Backups' },
            subject,
            content: [{ type: 'text/html', value: htmlBody }],
            ...(base64Dump
              ? {
                  attachments: [
                    {
                      content: base64Dump,
                      filename: params.filename,
                      type: 'application/json',
                      disposition: 'attachment',
                    },
                  ],
                }
              : {}),
          }),
          signal: controller.signal,
        });
      } else {
        // Brevo (Sendinblue)
        response = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'api-key': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sender: { email: fromEmail, name: 'Nzila Agro Backups' },
            to: [{ email: recipientEmail }],
            subject,
            htmlContent: htmlBody,
            ...(base64Dump
              ? { attachment: [{ name: params.filename, content: base64Dump }] }
              : {}),
          }),
          signal: controller.signal,
        });
      }
    } finally {
      clearTimeout(timeout);
    }

    const respText = await response.text().catch(() => '');
    const summary = response.ok
      ? `Email aceite pelo serviço ${cfg.emailProvider.toUpperCase()} (HTTP ${response.status}).`
      : `Erro HTTP ${response.status}: ${respText.slice(0, 180) || response.statusText}`;

    recordBackupEmailLog({
      provider: cfg.emailProvider,
      recipientEmail,
      backupFilename: params.filename,
      success: response.ok,
      summary,
    });

    return { sent: response.ok, provider: cfg.emailProvider, recipientEmail, summary };
  } catch (err) {
    const summary = err instanceof Error ? err.message : 'Erro ao enviar relatório de backup por email.';
    recordBackupEmailLog({
      provider: cfg.emailProvider,
      recipientEmail,
      backupFilename: params.filename,
      success: false,
      summary,
    });
    return { sent: false, provider: cfg.emailProvider, recipientEmail, summary };
  }
}

export async function sendTestBackupEmailReport() {
  const latest = getLatestAutomaticBackupFile();
  const latestRow = db
    .prepare("SELECT size_bytes, records_summary FROM backups WHERE trigger_type = 'automatico' ORDER BY id DESC LIMIT 1")
    .get() as { size_bytes?: number; records_summary?: string } | undefined;

  const result = await sendBackupEmailReport({
    filename: latest.filename,
    content: latest.content,
    sizeBytes: Number(latestRow?.size_bytes || Buffer.byteLength(latest.content, 'utf-8')),
    recordsSummary: JSON.parse(String(latestRow?.records_summary || '{}')) as Record<string, number>,
    isTest: true,
    forceAttempt: true,
  });

  return {
    result,
    status: getBackupStatus(),
  };
}

export function startWeeklyBackupScheduler(): void {
  ensureWeeklyBackup();

  if (cronTask) {
    cronTask.stop();
    cronTask = null;
  }

  const cfg = getBackupScheduleConfig();
  if (!cfg.enabled) {
    console.log('[Nzila Agro Cron] Agendamento automático de backups pausado pelo Administrador Principal.');
    return;
  }

  const { expression, description } = buildCronFromConfig(cfg);
  if (!cron.validate(expression)) {
    console.error(`[Nzila Agro Cron] Expressão cron inválida: ${expression}`);
    return;
  }

  cronTask = cron.schedule(
    expression,
    () => {
      try {
        const dump = createJsonBackup('automatico');
        console.log(`[Nzila Agro Cron] Dump JSON gerado automaticamente (${description}): ${dump.filename}`);
        void sendBackupEmailReport({
          filename: dump.filename,
          content: dump.content,
          sizeBytes: dump.sizeBytes,
          recordsSummary: dump.recordsSummary,
        });
      } catch (err) {
        console.error('[Nzila Agro Cron] Erro ao gerar dump JSON:', err);
      }
    },
    { timezone: 'UTC' }
  );
}

export function updateBackupScheduleConfig(
  input: Partial<BackupScheduleConfig> & { emailApiKey?: string }
) {
  const current = getBackupScheduleConfig();
  const raw = getRawBackupSettingsRow();
  const next: BackupScheduleConfig = {
    enabled: typeof input.enabled === 'boolean' ? input.enabled : current.enabled,
    frequency:
      input.frequency === 'daily' || input.frequency === 'weekly' || input.frequency === 'monthly'
        ? input.frequency
        : current.frequency,
    dayOfWeek:
      input.dayOfWeek !== undefined ? Math.min(6, Math.max(0, Math.floor(Number(input.dayOfWeek)))) : current.dayOfWeek,
    dayOfMonth:
      input.dayOfMonth !== undefined
        ? Math.min(28, Math.max(1, Math.floor(Number(input.dayOfMonth))))
        : current.dayOfMonth,
    hour: input.hour !== undefined ? Math.min(23, Math.max(0, Math.floor(Number(input.hour)))) : current.hour,
    minute:
      input.minute !== undefined ? Math.min(59, Math.max(0, Math.floor(Number(input.minute)))) : current.minute,
    retentionLimit:
      input.retentionLimit !== undefined
        ? Math.min(50, Math.max(5, Math.floor(Number(input.retentionLimit))))
        : current.retentionLimit,
    emailReportEnabled:
      typeof input.emailReportEnabled === 'boolean' ? input.emailReportEnabled : current.emailReportEnabled,
    emailProvider: input.emailProvider ? normalizeEmailProvider(input.emailProvider) : current.emailProvider,
    hasEmailApiKey: current.hasEmailApiKey,
    emailFrom: typeof input.emailFrom === 'string' ? input.emailFrom.trim() : current.emailFrom,
    emailRecipient: typeof input.emailRecipient === 'string' ? input.emailRecipient.trim() : current.emailRecipient,
    defaultAdminEmail: current.defaultAdminEmail,
    attachJsonDump: typeof input.attachJsonDump === 'boolean' ? input.attachJsonDump : current.attachJsonDump,
  };

  const nextApiKey =
    typeof input.emailApiKey === 'string' && input.emailApiKey.trim().length > 0
      ? input.emailApiKey.trim()
      : String(raw.email_api_key || '');

  const { expression } = buildCronFromConfig(next);
  if (!cron.validate(expression)) {
    throw new Error('Expressão cron resultante inválida.');
  }

  db.prepare(
    `INSERT INTO backup_settings
     (id, enabled, frequency, day_of_week, day_of_month, hour, minute, retention_limit, email_report_enabled, email_provider, email_api_key, email_from, email_recipient, attach_json_dump, updated_at)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       enabled = excluded.enabled,
       frequency = excluded.frequency,
       day_of_week = excluded.day_of_week,
       day_of_month = excluded.day_of_month,
       hour = excluded.hour,
       minute = excluded.minute,
       retention_limit = excluded.retention_limit,
       email_report_enabled = excluded.email_report_enabled,
       email_provider = excluded.email_provider,
       email_api_key = excluded.email_api_key,
       email_from = excluded.email_from,
       email_recipient = excluded.email_recipient,
       attach_json_dump = excluded.attach_json_dump,
       updated_at = datetime('now')`
  ).run(
    next.enabled ? 1 : 0,
    next.frequency,
    next.dayOfWeek,
    next.dayOfMonth,
    next.hour,
    next.minute,
    next.retentionLimit,
    next.emailReportEnabled ? 1 : 0,
    next.emailProvider,
    nextApiKey,
    next.emailFrom,
    next.emailRecipient,
    next.attachJsonDump ? 1 : 0
  );

  startWeeklyBackupScheduler();
  return getBackupStatus();
}

export function getBackupStatus() {
  ensureWeeklyBackup();

  const cfg = getBackupScheduleConfig();
  const { expression, description } = buildCronFromConfig(cfg);
  const rows = db.prepare('SELECT * FROM backups ORDER BY id DESC LIMIT 50').all();
  const emailLogRows = db.prepare('SELECT * FROM backup_email_logs ORDER BY id DESC LIMIT 10').all() as Record<
    string,
    unknown
  >[];
  const lastPeriodicDownloadRow = db
    .prepare(
      "SELECT last_downloaded_at FROM backups WHERE trigger_type = 'automatico' AND last_downloaded_at IS NOT NULL ORDER BY last_downloaded_at DESC LIMIT 1"
    )
    .get();

  let canDownloadNow = true;
  let lastDownloadAt: string | null = null;
  let nextDownloadAvailableAt: string | null = null;

  if (lastPeriodicDownloadRow && lastPeriodicDownloadRow.last_downloaded_at) {
    const dlDate = parseSqliteUtcDate(String(lastPeriodicDownloadRow.last_downloaded_at));
    lastDownloadAt = dlDate.toISOString();
    const nextAllowedMs = dlDate.getTime() + SEVEN_DAYS_MS;
    if (Date.now() < nextAllowedMs) {
      canDownloadNow = false;
      nextDownloadAvailableAt = new Date(nextAllowedMs).toISOString();
    }
  }

  const nextRun = getNextScheduledRunUtc(cfg);

  return {
    backups: rows.map((row) => ({
      id: Number(row.id),
      filename: String(row.filename),
      sizeBytes: Number(row.size_bytes),
      triggerType: String(row.trigger_type),
      recordsSummary: JSON.parse(String(row.records_summary || '{}')) as Record<string, number>,
      createdAt: parseSqliteUtcDate(String(row.created_at)).toISOString(),
      lastDownloadedAt: row.last_downloaded_at
        ? parseSqliteUtcDate(String(row.last_downloaded_at)).toISOString()
        : null,
    })),
    canDownloadNow,
    lastDownloadAt,
    nextDownloadAvailableAt,
    nextScheduledBackupAt: nextRun ? nextRun.toISOString() : null,
    cronExpression: expression,
    cronDescription: cfg.enabled ? description : 'Agendamento automático pausado',
    schedule: cfg,
    emailLogs: emailLogRows.map((l) => ({
      id: Number(l.id),
      provider: String(l.provider || ''),
      recipientEmail: String(l.recipient_email || ''),
      backupFilename: String(l.backup_filename || ''),
      success: Number(l.success) === 1,
      summary: String(l.summary || ''),
      createdAt: parseSqliteUtcDate(String(l.created_at)).toISOString(),
    })),
  };
}

export function getBackupFileById(backupId: number): { filename: string; content: string } | null {
  const row = db.prepare('SELECT * FROM backups WHERE id = ?').get(backupId);
  if (!row) return null;
  const filePath = String(row.file_path);
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf-8');
  db.prepare("UPDATE backups SET last_downloaded_at = datetime('now') WHERE id = ?").run(backupId);
  return {
    filename: String(row.filename),
    content,
  };
}

export function getLatestAutomaticBackupFile(): { filename: string; content: string } {
  ensureWeeklyBackup();
  const row = db
    .prepare("SELECT * FROM backups WHERE trigger_type = 'automatico' ORDER BY id DESC LIMIT 1")
    .get();
  if (!row || !fs.existsSync(String(row.file_path))) {
    const fresh = createJsonBackup('automatico');
    db.prepare("UPDATE backups SET last_downloaded_at = datetime('now') WHERE id = ?").run(fresh.id);
    return { filename: fresh.filename, content: fresh.content };
  }
  const content = fs.readFileSync(String(row.file_path), 'utf-8');
  db.prepare("UPDATE backups SET last_downloaded_at = datetime('now') WHERE id = ?").run(Number(row.id));
  return {
    filename: String(row.filename),
    content,
  };
}

export function consumeWeeklyBackupDownload(backupId?: number): {
  allowed: boolean;
  nextDownloadAvailableAt?: string;
  filename?: string;
  content?: string;
  error?: string;
} {
  const status = getBackupStatus();
  if (!status.canDownloadNow) {
    return {
      allowed: false,
      nextDownloadAvailableAt: status.nextDownloadAvailableAt || undefined,
      error: 'O limite de 1 descarga semanal do backup periódico já foi utilizado. Pode usar o Backup Manual Agora sempre que precisar.',
    };
  }

  const targetRow = backupId
    ? db.prepare('SELECT * FROM backups WHERE id = ?').get(backupId)
    : db.prepare("SELECT * FROM backups WHERE trigger_type = 'automatico' ORDER BY id DESC LIMIT 1").get();

  if (!targetRow) {
    return { allowed: false, error: 'Backup não encontrado.' };
  }

  const filePath = String(targetRow.file_path);
  if (!fs.existsSync(filePath)) {
    const fresh = createJsonBackup('automatico');
    db.prepare("UPDATE backups SET last_downloaded_at = datetime('now') WHERE id = ?").run(fresh.id);
    return {
      allowed: true,
      filename: fresh.filename,
      content: fresh.content,
    };
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  db.prepare("UPDATE backups SET last_downloaded_at = datetime('now') WHERE id = ?").run(Number(targetRow.id));

  return {
    allowed: true,
    filename: String(targetRow.filename),
    content,
  };
}
