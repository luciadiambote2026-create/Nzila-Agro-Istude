import nodemailer from 'nodemailer';
import { db } from './db.ts';

export interface SmtpConfigPublic {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  hasPassword: boolean;
  fromName: string;
  fromEmail: string;
  enabled: boolean;
  notifyOnApproval: boolean;
  notifyOnRecovery: boolean;
  updatedAt: string;
}

interface SmtpConfigRow {
  host: string;
  port: number;
  secure: number;
  username: string;
  password: string;
  from_name: string;
  from_email: string;
  enabled: number;
  notify_on_approval: number;
  notify_on_recovery: number;
  updated_at: string;
}

function getRawSmtpRow(): SmtpConfigRow | null {
  const row = db.prepare('SELECT * FROM smtp_settings WHERE id = 1').get() as SmtpConfigRow | undefined;
  return row ?? null;
}

export function getPublicSmtpSettings(): SmtpConfigPublic {
  const row = getRawSmtpRow();
  if (!row) {
    return {
      host: '',
      port: 587,
      secure: false,
      username: '',
      hasPassword: false,
      fromName: 'Nzila Agro',
      fromEmail: '',
      enabled: false,
      notifyOnApproval: true,
      notifyOnRecovery: true,
      updatedAt: '',
    };
  }
  return {
    host: String(row.host || ''),
    port: Number(row.port || 587),
    secure: Number(row.secure || 0) === 1,
    username: String(row.username || ''),
    hasPassword: Boolean(row.password && String(row.password).length > 0),
    fromName: String(row.from_name || 'Nzila Agro'),
    fromEmail: String(row.from_email || ''),
    enabled: Number(row.enabled || 0) === 1,
    notifyOnApproval: Number(row.notify_on_approval ?? 1) === 1,
    notifyOnRecovery: Number(row.notify_on_recovery ?? 1) === 1,
    updatedAt: String(row.updated_at || ''),
  };
}

function buildTransporter(row: SmtpConfigRow) {
  return nodemailer.createTransport({
    host: String(row.host).trim(),
    port: Number(row.port) || 587,
    secure: Number(row.secure) === 1,
    auth:
      row.username && row.password
        ? {
            user: String(row.username).trim(),
            pass: String(row.password),
          }
        : undefined,
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 10000,
  });
}

function wrapEmailHtml(title: string, bodyParagraphs: string[]): string {
  const paragraphsHtml = bodyParagraphs
    .map((p) => `<p style="margin:0 0 12px 0;color:#1C2720;font-size:14px;line-height:1.6;">${p}</p>`)
    .join('');

  return `
    <div style="font-family:'DM Sans',Arial,sans-serif;background:#F7F9F7;padding:24px;">
      <div style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid #DCE5DE;border-radius:12px;overflow:hidden;">
        <div style="background:#14532D;padding:20px 24px;">
          <div style="font-size:18px;font-weight:800;color:#FFFFFF;">Nzila Agro</div>
          <div style="font-size:12px;color:#FACC15;margin-top:4px;">Do campo à cidade, crescemos juntos</div>
        </div>
        <div style="padding:24px;">
          <h2 style="margin:0 0 14px 0;font-size:18px;color:#14532D;">${title}</h2>
          ${paragraphsHtml}
        </div>
        <div style="border-top:1px solid #EDF2EE;padding:14px 24px;font-size:11px;color:#546459;">
          Supervisão 24/7 — Garantia Administrativa · Nzila Agro Angola
        </div>
      </div>
    </div>
  `;
}

export async function sendPlatformEmail(params: {
  to: string;
  subject: string;
  title: string;
  paragraphs: string[];
  eventType: 'approval' | 'recovery' | 'critical_alert' | 'backup_report';
}): Promise<void> {
  const row = getRawSmtpRow();
  if (!row || Number(row.enabled) !== 1) return;
  if (!String(row.host || '').trim() || !String(row.from_email || '').trim()) return;
  if (params.eventType === 'approval' && Number(row.notify_on_approval) !== 1) return;
  if (params.eventType === 'recovery' && Number(row.notify_on_recovery) !== 1) return;

  try {
    const transporter = buildTransporter(row);
    const fromName = String(row.from_name || 'Nzila Agro').trim();
    const fromEmail = String(row.from_email).trim();
    await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: params.to,
      subject: params.subject,
      text: `${params.title}\n\n${params.paragraphs.join('\n\n')}\n\nNzila Agro — Supervisão 24/7`,
      html: wrapEmailHtml(params.title, params.paragraphs),
    });
  } catch (err) {
    console.error('[SMTP] Falha ao enviar notificação automática por e-mail:', err);
  }
}

export async function sendSmtpTestEmail(toEmail: string): Promise<void> {
  const row = getRawSmtpRow();
  if (!row || !String(row.host || '').trim()) {
    throw new Error('Configure e guarde primeiro o servidor SMTP (host) antes de testar.');
  }
  if (!String(row.from_email || '').trim()) {
    throw new Error('Configure e guarde o e-mail do remetente antes de testar.');
  }

  const transporter = buildTransporter(row);
  await transporter.verify();

  const fromName = String(row.from_name || 'Nzila Agro').trim();
  const fromEmail = String(row.from_email).trim();

  await transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to: toEmail,
    subject: 'Nzila Agro — E-mail de Teste SMTP',
    text: 'A configuração SMTP da plataforma Nzila Agro foi validada com sucesso.',
    html: wrapEmailHtml('Configuração SMTP Validada', [
      'Este é um e-mail de teste enviado a partir do Painel do Administrador Principal da Nzila Agro.',
      'As notificações automáticas de aprovação de contas e pedidos de recuperação de palavra-passe estão prontas para envio.',
    ]),
  });
}
