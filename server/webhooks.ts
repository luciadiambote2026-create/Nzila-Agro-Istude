import crypto from 'node:crypto';
import { db } from './db.ts';

export const ALLOWED_WEBHOOK_EVENTS = [
  'user.registered',
  'user.approved',
  'sale.created',
  'listing.created',
  'recovery.requested',
  'donation.created',
] as const;

export type WebhookEventKey = (typeof ALLOWED_WEBHOOK_EVENTS)[number];

interface WebhookRow {
  id: number;
  name: string;
  url: string;
  secret: string;
  events: string;
  is_active: number;
  last_status_code: number | null;
  last_triggered_at: string | null;
  created_at: string;
}

export function formatWebhookPublic(row: Record<string, unknown>) {
  let parsedEvents: string[] = [];
  try {
    const raw = JSON.parse(String(row.events || '[]'));
    if (Array.isArray(raw)) parsedEvents = raw.map(String);
  } catch {
    parsedEvents = [];
  }

  return {
    id: Number(row.id),
    name: String(row.name),
    url: String(row.url),
    hasSecret: Boolean(row.secret && String(row.secret).length > 0),
    events: parsedEvents,
    isActive: Number(row.is_active) === 1,
    lastStatusCode: row.last_status_code !== null && row.last_status_code !== undefined ? Number(row.last_status_code) : null,
    lastTriggeredAt: row.last_triggered_at ? String(row.last_triggered_at) : null,
    createdAt: String(row.created_at),
  };
}

export function formatWebhookDelivery(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    webhookId: Number(row.webhook_id),
    webhookName: String(row.webhook_name),
    eventType: String(row.event_type),
    targetUrl: String(row.target_url),
    statusCode: row.status_code !== null && row.status_code !== undefined ? Number(row.status_code) : null,
    success: Number(row.success) === 1,
    errorMessage: String(row.error_message || ''),
    durationMs: Number(row.duration_ms || 0),
    createdAt: String(row.created_at),
  };
}

async function deliverToWebhook(
  hook: WebhookRow,
  eventType: string,
  payload: Record<string, unknown>
): Promise<{ success: boolean; statusCode: number | null; durationMs: number; errorMessage: string }> {
  const startedAt = Date.now();
  const timestamp = new Date().toISOString();
  const body = JSON.stringify({
    event: eventType,
    timestamp,
    platform: 'Nzila Agro',
    data: payload,
  });

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'NzilaAgro-Webhooks/1.0',
    'X-Nzila-Event': eventType,
    'X-Nzila-Delivery-Timestamp': timestamp,
  };

  if (hook.secret && String(hook.secret).trim().length > 0) {
    const signature = crypto
      .createHmac('sha256', String(hook.secret))
      .update(body)
      .digest('hex');
    headers['X-Nzila-Signature'] = `sha256=${signature}`;
  }

  let statusCode: number | null = null;
  let success = false;
  let errorMessage = '';

  try {
    const response = await fetch(String(hook.url), {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(7000),
    });
    statusCode = response.status;
    success = response.ok;
    if (!response.ok) {
      errorMessage = `HTTP ${response.status} ${response.statusText || ''}`.trim();
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : 'Erro de ligação ao endpoint externo.';
  }

  const durationMs = Math.max(Date.now() - startedAt, 1);

  try {
    db.prepare(`
      UPDATE webhooks
      SET last_status_code = ?, last_triggered_at = datetime('now')
      WHERE id = ?
    `).run(statusCode, Number(hook.id));

    db.prepare(`
      INSERT INTO webhook_deliveries (webhook_id, webhook_name, event_type, target_url, status_code, success, error_message, duration_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      Number(hook.id),
      String(hook.name),
      eventType,
      String(hook.url),
      statusCode,
      success ? 1 : 0,
      errorMessage.slice(0, 240),
      durationMs
    );
  } catch (dbErr) {
    console.error('[Webhooks] Erro ao registar entrega:', dbErr);
  }

  return { success, statusCode, durationMs, errorMessage };
}

export async function dispatchWebhookEvent(
  eventType: WebhookEventKey,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    const activeHooks = db
      .prepare('SELECT * FROM webhooks WHERE is_active = 1')
      .all() as unknown as WebhookRow[];

    const matching = activeHooks.filter((h) => {
      try {
        const events = JSON.parse(String(h.events || '[]'));
        return Array.isArray(events) && events.includes(eventType);
      } catch {
        return false;
      }
    });

    if (matching.length === 0) return;

    await Promise.allSettled(matching.map((hook) => deliverToWebhook(hook, eventType, payload)));
  } catch (err) {
    console.error('[Webhooks] Erro no envio de eventos:', err);
  }
}

export async function sendTestWebhookDelivery(webhookId: number) {
  const hook = db.prepare('SELECT * FROM webhooks WHERE id = ?').get(webhookId) as unknown as WebhookRow | undefined;
  if (!hook) {
    throw new Error('Webhook não encontrado.');
  }

  return deliverToWebhook(hook, 'webhook.test', {
    message: 'Evento de teste enviado pelo Painel do Administrador Principal da Nzila Agro.',
    webhookId: Number(hook.id),
    webhookName: String(hook.name),
  });
}
