import { db } from './db.ts';

export type SmsProvider = 'twilio' | 'africastalking' | 'vonage' | 'webhook_http';

export interface SmsGatewayPublicSettings {
  enabled: boolean;
  provider: SmsProvider;
  endpointUrl: string;
  accountId: string;
  hasAuthToken: boolean;
  senderId: string;
  recipientPhone: string;
  defaultAdminPhone: string;
  updatedAt?: string;
}

export interface SmsDeliveryLogEntry {
  id: number;
  provider: string;
  recipientPhone: string;
  message: string;
  success: boolean;
  statusCode: number | null;
  responseSummary: string;
  createdAt: string;
}

function parseSqliteUtcDate(value: string): string {
  const iso = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
  return new Date(iso).toISOString();
}

function getDefaultPrincipalPhone(): string {
  const admin = db
    .prepare("SELECT phone, whatsapp FROM users WHERE role = 'ADMIN_PRINCIPAL' ORDER BY id ASC LIMIT 1")
    .get() as { phone?: string; whatsapp?: string } | undefined;
  return String(admin?.phone || admin?.whatsapp || '').trim();
}

function getRawSmsRow(): Record<string, unknown> {
  let row = db.prepare('SELECT * FROM sms_gateway_settings WHERE id = 1').get() as
    | Record<string, unknown>
    | undefined;
  if (!row) {
    db.prepare(
      `INSERT OR IGNORE INTO sms_gateway_settings (id, enabled, provider, endpoint_url, account_id, auth_token, sender_id, recipient_phone)
       VALUES (1, 0, 'twilio', '', '', '', 'NzilaAgro', '')`
    ).run();
    row = db.prepare('SELECT * FROM sms_gateway_settings WHERE id = 1').get() as Record<string, unknown>;
  }
  return row;
}

function normalizeProvider(value: unknown): SmsProvider {
  const str = String(value || 'twilio');
  if (str === 'africastalking' || str === 'vonage' || str === 'webhook_http') return str;
  return 'twilio';
}

export function getPublicSmsGatewaySettings(): SmsGatewayPublicSettings {
  const row = getRawSmsRow();
  return {
    enabled: Number(row.enabled) === 1,
    provider: normalizeProvider(row.provider),
    endpointUrl: String(row.endpoint_url || ''),
    accountId: String(row.account_id || ''),
    hasAuthToken: Boolean(String(row.auth_token || '').trim()),
    senderId: String(row.sender_id || 'NzilaAgro'),
    recipientPhone: String(row.recipient_phone || ''),
    defaultAdminPhone: getDefaultPrincipalPhone(),
    updatedAt: row.updated_at ? parseSqliteUtcDate(String(row.updated_at)) : undefined,
  };
}

export function updateSmsGatewaySettings(input: {
  enabled?: boolean;
  provider?: SmsProvider;
  endpointUrl?: string;
  accountId?: string;
  authToken?: string;
  senderId?: string;
  recipientPhone?: string;
}): SmsGatewayPublicSettings {
  const raw = getRawSmsRow();
  const nextEnabled = typeof input.enabled === 'boolean' ? input.enabled : Number(raw.enabled) === 1;
  const nextProvider = input.provider ? normalizeProvider(input.provider) : normalizeProvider(raw.provider);
  const nextEndpointUrl =
    typeof input.endpointUrl === 'string' ? input.endpointUrl.trim() : String(raw.endpoint_url || '');
  const nextAccountId =
    typeof input.accountId === 'string' ? input.accountId.trim() : String(raw.account_id || '');
  const nextAuthToken =
    typeof input.authToken === 'string' && input.authToken.trim().length > 0
      ? input.authToken.trim()
      : String(raw.auth_token || '');
  const nextSenderId =
    typeof input.senderId === 'string' && input.senderId.trim().length > 0
      ? input.senderId.trim()
      : String(raw.sender_id || 'NzilaAgro');
  const nextRecipientPhone =
    typeof input.recipientPhone === 'string' ? input.recipientPhone.trim() : String(raw.recipient_phone || '');

  db.prepare(
    `INSERT INTO sms_gateway_settings
     (id, enabled, provider, endpoint_url, account_id, auth_token, sender_id, recipient_phone, updated_at)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       enabled = excluded.enabled,
       provider = excluded.provider,
       endpoint_url = excluded.endpoint_url,
       account_id = excluded.account_id,
       auth_token = excluded.auth_token,
       sender_id = excluded.sender_id,
       recipient_phone = excluded.recipient_phone,
       updated_at = datetime('now')`
  ).run(
    nextEnabled ? 1 : 0,
    nextProvider,
    nextEndpointUrl,
    nextAccountId,
    nextAuthToken,
    nextSenderId,
    nextRecipientPhone
  );

  return getPublicSmsGatewaySettings();
}

export function getSmsDeliveryLogs(limit = 15): SmsDeliveryLogEntry[] {
  const rows = db
    .prepare('SELECT * FROM sms_delivery_logs ORDER BY id DESC LIMIT ?')
    .all(limit) as Record<string, unknown>[];

  return rows.map((row) => ({
    id: Number(row.id),
    provider: String(row.provider || ''),
    recipientPhone: String(row.recipient_phone || ''),
    message: String(row.message || ''),
    success: Number(row.success) === 1,
    statusCode: row.status_code !== null && row.status_code !== undefined ? Number(row.status_code) : null,
    responseSummary: String(row.response_summary || ''),
    createdAt: parseSqliteUtcDate(String(row.created_at)),
  }));
}

function recordSmsDelivery(params: {
  provider: string;
  recipientPhone: string;
  message: string;
  success: boolean;
  statusCode: number | null;
  responseSummary: string;
}) {
  db.prepare(
    `INSERT INTO sms_delivery_logs (provider, recipient_phone, message, success, status_code, response_summary)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    params.provider,
    params.recipientPhone,
    params.message,
    params.success ? 1 : 0,
    params.statusCode,
    params.responseSummary.slice(0, 300)
  );
}

export async function sendCriticalSmsAlert(params: {
  message: string;
  forceAttempt?: boolean;
}): Promise<{
  sent: boolean;
  recipientPhone: string;
  provider: SmsProvider;
  statusCode: number | null;
  summary: string;
}> {
  const raw = getRawSmsRow();
  const enabled = Number(raw.enabled) === 1;
  const provider = normalizeProvider(raw.provider);
  const endpointUrl = String(raw.endpoint_url || '').trim();
  const accountId = String(raw.account_id || '').trim();
  const authToken = String(raw.auth_token || '').trim();
  const senderId = String(raw.sender_id || 'NzilaAgro').trim();
  const recipientPhone = String(raw.recipient_phone || '').trim() || getDefaultPrincipalPhone();

  if (!enabled && !params.forceAttempt) {
    return {
      sent: false,
      recipientPhone,
      provider,
      statusCode: null,
      summary: 'Gateway SMS desativado.',
    };
  }

  if (!recipientPhone) {
    const summary = 'Nenhum número de telefone configurado para o Administrador Principal.';
    recordSmsDelivery({
      provider,
      recipientPhone: 'N/D',
      message: params.message,
      success: false,
      statusCode: null,
      responseSummary: summary,
    });
    return { sent: false, recipientPhone: '', provider, statusCode: null, summary };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    let response: Response;

    if (provider === 'twilio') {
      if (!accountId || !authToken) {
        throw new Error('Configure o Account SID e o Auth Token da Twilio.');
      }
      const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountId)}/Messages.json`;
      const body = new URLSearchParams({
        From: senderId,
        To: recipientPhone,
        Body: params.message,
      });
      const basicAuth = Buffer.from(`${accountId}:${authToken}`).toString('base64');
      response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
        signal: controller.signal,
      });
    } else if (provider === 'africastalking') {
      if (!accountId || !authToken) {
        throw new Error("Configure o Username e a API Key do Africa's Talking.");
      }
      const url = endpointUrl || 'https://api.africastalking.com/version1/messaging';
      const body = new URLSearchParams({
        username: accountId,
        to: recipientPhone,
        message: params.message,
        ...(senderId ? { from: senderId } : {}),
      });
      response = await fetch(url, {
        method: 'POST',
        headers: {
          apiKey: authToken,
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
        signal: controller.signal,
      });
    } else if (provider === 'vonage') {
      if (!accountId || !authToken) {
        throw new Error('Configure a API Key e o API Secret da Vonage.');
      }
      const url = endpointUrl || 'https://rest.nexmo.com/sms/json';
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: accountId,
          api_secret: authToken,
          from: senderId,
          to: recipientPhone.replace(/[^\d+]/g, ''),
          text: params.message,
        }),
        signal: controller.signal,
      });
    } else {
      // Custom HTTP / REST SMS Gateway (e.g. TelcoSMS / local Angolan gateway)
      if (!endpointUrl) {
        throw new Error('Informe o URL do Endpoint HTTP do Gateway SMS personalizado.');
      }
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (authToken) {
        headers.Authorization = `Bearer ${authToken}`;
      }
      response = await fetch(endpointUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          to: recipientPhone,
          from: senderId,
          message: params.message,
          accountId: accountId || undefined,
        }),
        signal: controller.signal,
      });
    }

    const text = await response.text().catch(() => '');
    const summary = response.ok
      ? `SMS aceite pelo gateway (HTTP ${response.status}).`
      : `Falha HTTP ${response.status}: ${text.slice(0, 180) || response.statusText}`;

    recordSmsDelivery({
      provider,
      recipientPhone,
      message: params.message,
      success: response.ok,
      statusCode: response.status,
      responseSummary: summary,
    });

    return {
      sent: response.ok,
      recipientPhone,
      provider,
      statusCode: response.status,
      summary,
    };
  } catch (err) {
    const summary = err instanceof Error ? err.message : 'Erro de ligação ao gateway SMS.';
    recordSmsDelivery({
      provider,
      recipientPhone,
      message: params.message,
      success: false,
      statusCode: null,
      responseSummary: summary,
    });
    return {
      sent: false,
      recipientPhone,
      provider,
      statusCode: null,
      summary,
    };
  } finally {
    clearTimeout(timeout);
  }
}
