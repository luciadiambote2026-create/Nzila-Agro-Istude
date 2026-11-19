import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'nzila-agro.sqlite');
export const db = new DatabaseSync(dbPath);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    age INTEGER NOT NULL,
    province TEXT NOT NULL,
    profession TEXT NOT NULL,
    phone TEXT NOT NULL,
    whatsapp TEXT NOT NULL,
    profile_photo TEXT NOT NULL,
    verification_video TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'USER',
    status TEXT NOT NULL DEFAULT 'Pendente',
    quota_active INTEGER NOT NULL DEFAULT 0,
    quota_expires_at TEXT,
    bonus_kz REAL NOT NULL DEFAULT 0,
    active_seconds INTEGER NOT NULL DEFAULT 0,
    last_active_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS listings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    price_kz REAL NOT NULL,
    unit TEXT NOT NULL DEFAULT 'Unidade',
    province TEXT NOT NULL,
    image_url TEXT NOT NULL,
    is_masked INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS financial_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    official_whatsapp TEXT NOT NULL,
    official_iban TEXT NOT NULL,
    official_express TEXT NOT NULL,
    official_account_number TEXT NOT NULL,
    official_account_holder TEXT NOT NULL,
    rate_usd_to_kz REAL NOT NULL DEFAULT 915,
    rate_eur_to_kz REAL NOT NULL DEFAULT 985,
    rate_gbp_to_kz REAL NOT NULL DEFAULT 1160,
    quota_value_kz REAL NOT NULL DEFAULT 5000,
    quota_value_usd REAL NOT NULL DEFAULT 5.5,
    quota_value_eur REAL NOT NULL DEFAULT 5.1,
    quota_value_gbp REAL NOT NULL DEFAULT 4.3,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    subtitle TEXT NOT NULL,
    image_url TEXT NOT NULL,
    cta_label TEXT NOT NULL,
    cta_url TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS password_recovery_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    new_password_hash TEXT NOT NULL,
    recovery_video TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Pendente',
    admin_notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    reviewed_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS support_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    admin_reply TEXT,
    replied_by TEXT,
    status TEXT NOT NULL DEFAULT 'Aberto',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    replied_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS donations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    donor_name TEXT NOT NULL,
    donor_contact TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT NOT NULL,
    amount_kz REAL NOT NULL,
    method TEXT NOT NULL,
    reference TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Pendente',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS bonus_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    amount_kz REAL NOT NULL,
    reason TEXT NOT NULL,
    granted_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS listing_inquiries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id INTEGER NOT NULL,
    seller_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE,
    FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS listing_sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id INTEGER NOT NULL,
    seller_id INTEGER NOT NULL,
    quantity REAL NOT NULL DEFAULT 1,
    total_kz REAL NOT NULL,
    sale_date TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE,
    FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS backups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    file_path TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    trigger_type TEXT NOT NULL DEFAULT 'automatico',
    records_summary TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_downloaded_at TEXT
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id INTEGER,
    actor_name TEXT NOT NULL,
    actor_role TEXT NOT NULL,
    category TEXT NOT NULL,
    action TEXT NOT NULL,
    target_label TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS smtp_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    host TEXT NOT NULL DEFAULT '',
    port INTEGER NOT NULL DEFAULT 587,
    secure INTEGER NOT NULL DEFAULT 0,
    username TEXT NOT NULL DEFAULT '',
    password TEXT NOT NULL DEFAULT '',
    from_name TEXT NOT NULL DEFAULT 'Nzila Agro',
    from_email TEXT NOT NULL DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 0,
    notify_on_approval INTEGER NOT NULL DEFAULT 1,
    notify_on_recovery INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS webhooks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    secret TEXT NOT NULL DEFAULT '',
    events TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    last_status_code INTEGER,
    last_triggered_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    webhook_id INTEGER NOT NULL,
    webhook_name TEXT NOT NULL,
    event_type TEXT NOT NULL,
    target_url TEXT NOT NULL,
    status_code INTEGER,
    success INTEGER NOT NULL DEFAULT 0,
    error_message TEXT NOT NULL DEFAULT '',
    duration_ms INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (webhook_id) REFERENCES webhooks(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS voice_memos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    transcript TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'Campo / Lavra',
    language TEXT NOT NULL DEFAULT 'pt-PT',
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS scheduled_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    event_type TEXT NOT NULL DEFAULT 'Colheita',
    event_date TEXT NOT NULL,
    start_time TEXT NOT NULL DEFAULT '08:00',
    end_time TEXT NOT NULL DEFAULT '10:00',
    location TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    reminder_minutes INTEGER NOT NULL DEFAULT 30,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS client_error_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    user_name TEXT NOT NULL DEFAULT 'Visitante',
    user_email TEXT NOT NULL DEFAULT '',
    user_role TEXT NOT NULL DEFAULT 'ANON',
    boundary_name TEXT NOT NULL DEFAULT 'Aplicação Global',
    error_name TEXT NOT NULL DEFAULT 'Error',
    error_message TEXT NOT NULL,
    error_stack TEXT NOT NULL DEFAULT '',
    component_stack TEXT NOT NULL DEFAULT '',
    page_url TEXT NOT NULL DEFAULT '',
    user_agent TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Aberto',
    resolved_by TEXT,
    resolved_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS executive_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    focus TEXT NOT NULL,
    period_label TEXT NOT NULL,
    metrics_json TEXT NOT NULL,
    report_json TEXT NOT NULL,
    generated_by TEXT NOT NULL DEFAULT 'Administrador Principal',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS backup_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    enabled INTEGER NOT NULL DEFAULT 1,
    frequency TEXT NOT NULL DEFAULT 'weekly',
    day_of_week INTEGER NOT NULL DEFAULT 1,
    day_of_month INTEGER NOT NULL DEFAULT 1,
    hour INTEGER NOT NULL DEFAULT 0,
    minute INTEGER NOT NULL DEFAULT 0,
    retention_limit INTEGER NOT NULL DEFAULT 20,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS critical_alert_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    enabled INTEGER NOT NULL DEFAULT 1,
    cpu_threshold_pct REAL NOT NULL DEFAULT 85,
    memory_threshold_pct REAL NOT NULL DEFAULT 85,
    duration_minutes INTEGER NOT NULL DEFAULT 5,
    cooldown_minutes INTEGER NOT NULL DEFAULT 30,
    notify_in_app INTEGER NOT NULL DEFAULT 1,
    notify_email INTEGER NOT NULL DEFAULT 1,
    notify_sms INTEGER NOT NULL DEFAULT 0,
    alert_email TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS critical_alert_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    metric TEXT NOT NULL,
    current_value REAL NOT NULL,
    threshold_value REAL NOT NULL,
    sustained_seconds INTEGER NOT NULL DEFAULT 0,
    channels TEXT NOT NULL DEFAULT 'In-App',
    message TEXT NOT NULL,
    is_test INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sms_gateway_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    enabled INTEGER NOT NULL DEFAULT 0,
    provider TEXT NOT NULL DEFAULT 'twilio',
    endpoint_url TEXT NOT NULL DEFAULT '',
    account_id TEXT NOT NULL DEFAULT '',
    auth_token TEXT NOT NULL DEFAULT '',
    sender_id TEXT NOT NULL DEFAULT 'NzilaAgro',
    recipient_phone TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sms_delivery_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL,
    recipient_phone TEXT NOT NULL,
    message TEXT NOT NULL,
    success INTEGER NOT NULL DEFAULT 0,
    status_code INTEGER,
    response_summary TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS backup_email_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL,
    recipient_email TEXT NOT NULL,
    backup_filename TEXT NOT NULL,
    success INTEGER NOT NULL DEFAULT 0,
    summary TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS server_metric_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cpu_percent REAL NOT NULL,
    memory_percent REAL NOT NULL,
    memory_used_mb INTEGER NOT NULL DEFAULT 0,
    memory_total_mb INTEGER NOT NULL DEFAULT 0,
    load_avg_1m REAL NOT NULL DEFAULT 0,
    db_latency_ms REAL NOT NULL DEFAULT 0,
    recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_server_metric_history_recorded_at
    ON server_metric_history (recorded_at);

  CREATE TABLE IF NOT EXISTS subscription_plans (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    price_kz REAL NOT NULL,
    duration_days INTEGER NOT NULL DEFAULT 30,
    featured_credits INTEGER NOT NULL DEFAULT 1,
    badge_label TEXT NOT NULL DEFAULT '',
    features_json TEXT NOT NULL DEFAULT '[]',
    is_popular INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS payment_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    order_type TEXT NOT NULL,
    plan_code TEXT,
    listing_id INTEGER,
    amount_kz REAL NOT NULL,
    payment_method TEXT NOT NULL DEFAULT 'multicaixa_ref',
    entity_code TEXT NOT NULL DEFAULT '00521',
    reference_code TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'Aguardando Pagamento',
    proof_file_url TEXT,
    proof_notes TEXT,
    admin_notes TEXT,
    expires_at TEXT NOT NULL,
    reviewed_by TEXT,
    reviewed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_payment_orders_user_status
    ON payment_orders (user_id, status);

  CREATE TABLE IF NOT EXISTS multicaixa_gateway_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    enabled INTEGER NOT NULL DEFAULT 1,
    provider TEXT NOT NULL DEFAULT 'manual',
    environment TEXT NOT NULL DEFAULT 'sandbox',
    entity_code TEXT NOT NULL DEFAULT '00521',
    api_key TEXT NOT NULL DEFAULT '',
    webhook_secret TEXT NOT NULL DEFAULT '',
    endpoint_url TEXT NOT NULL DEFAULT '',
    reference_validity_hours INTEGER NOT NULL DEFAULT 48,
    auto_confirm_webhook INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Safe migrations for subscription plans & featured listings
const userCols = db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;
const userColNames = new Set(userCols.map((c) => c.name));
if (!userColNames.has('subscription_plan')) {
  db.exec("ALTER TABLE users ADD COLUMN subscription_plan TEXT NOT NULL DEFAULT 'basico';");
}
if (!userColNames.has('featured_credits')) {
  db.exec('ALTER TABLE users ADD COLUMN featured_credits INTEGER NOT NULL DEFAULT 0;');
}

const listingCols = db.prepare('PRAGMA table_info(listings)').all() as Array<{ name: string }>;
const listingColNames = new Set(listingCols.map((c) => c.name));
if (!listingColNames.has('is_featured')) {
  db.exec('ALTER TABLE listings ADD COLUMN is_featured INTEGER NOT NULL DEFAULT 0;');
}
if (!listingColNames.has('featured_until')) {
  db.exec('ALTER TABLE listings ADD COLUMN featured_until TEXT;');
}

// Seed default Angolan subscription plans if empty
const existingPlans = db.prepare('SELECT COUNT(*) as count FROM subscription_plans').get() as { count: number };
if (Number(existingPlans?.count || 0) === 0) {
  const insertPlan = db.prepare(`
    INSERT INTO subscription_plans
      (code, name, description, price_kz, duration_days, featured_credits, badge_label, features_json, is_popular, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);
  insertPlan.run(
    'basico',
    'Produtor Essencial',
    'Ideal para produtores individuais que pretendem publicar colheitas na vitrine pública.',
    5000,
    30,
    1,
    'Essencial',
    JSON.stringify([
      'Cota ativa por 30 dias na vitrine pública',
      '1 crédito de Anúncio em Destaque (7 dias)',
      'Etiquetas PDF com QR Code ilimitadas',
      'Contacto direto via WhatsApp e Telefone',
    ]),
    0
  );
  insertPlan.run(
    'profissional',
    'Produtor Profissional',
    'Para produtores com escoamento frequente que querem aparecer no topo das pesquisas.',
    12500,
    30,
    5,
    'Mais Popular',
    JSON.stringify([
      'Cota ativa por 30 dias com prioridade na vitrine',
      '5 créditos de Anúncio em Destaque (7 dias cada)',
      'Selo de Produtor Profissional nos anúncios',
      'Relatório mensal de contabilidade em PDF/Excel',
    ]),
    1
  );
  insertPlan.run(
    'cooperativa',
    'Cooperativa & Fazenda',
    'Pensado para cooperativas, fazendas comerciais e fornecedores grossistas.',
    28000,
    30,
    15,
    'Empresarial',
    JSON.stringify([
      'Cota ativa por 30 dias com visibilidade máxima',
      '15 créditos de Anúncio em Destaque (7 dias cada)',
      'Destaque prioritário para vendas grossistas',
      'Suporte prioritário da equipa Nzila Agro',
    ]),
    0
  );
}

// Safe migration for notify_sms on existing critical_alert_settings tables
const alertCols = db.prepare('PRAGMA table_info(critical_alert_settings)').all() as Array<{ name: string }>;
if (!alertCols.some((c) => c.name === 'notify_sms')) {
  db.exec('ALTER TABLE critical_alert_settings ADD COLUMN notify_sms INTEGER NOT NULL DEFAULT 0;');
}

// Safe migration for transactional email report settings on backup_settings
const backupSettingCols = db.prepare('PRAGMA table_info(backup_settings)').all() as Array<{ name: string }>;
const backupSettingColNames = new Set(backupSettingCols.map((c) => c.name));
if (!backupSettingColNames.has('email_report_enabled')) {
  db.exec('ALTER TABLE backup_settings ADD COLUMN email_report_enabled INTEGER NOT NULL DEFAULT 0;');
}
if (!backupSettingColNames.has('email_provider')) {
  db.exec("ALTER TABLE backup_settings ADD COLUMN email_provider TEXT NOT NULL DEFAULT 'smtp';");
}
if (!backupSettingColNames.has('email_api_key')) {
  db.exec("ALTER TABLE backup_settings ADD COLUMN email_api_key TEXT NOT NULL DEFAULT '';");
}
if (!backupSettingColNames.has('email_from')) {
  db.exec("ALTER TABLE backup_settings ADD COLUMN email_from TEXT NOT NULL DEFAULT '';");
}
if (!backupSettingColNames.has('email_recipient')) {
  db.exec("ALTER TABLE backup_settings ADD COLUMN email_recipient TEXT NOT NULL DEFAULT '';");
}
if (!backupSettingColNames.has('attach_json_dump')) {
  db.exec('ALTER TABLE backup_settings ADD COLUMN attach_json_dump INTEGER NOT NULL DEFAULT 1;');
}

// Safe migration for granular auxiliary admin permissions on existing SQLite databases
const userColumns = db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;
const userColumnNames = new Set(userColumns.map((c) => c.name));
if (!userColumnNames.has('access_profile')) {
  db.exec(`ALTER TABLE users ADD COLUMN access_profile TEXT NOT NULL DEFAULT 'Moderador de Conteúdo';`);
}
if (!userColumnNames.has('permissions_json')) {
  db.exec(
    `ALTER TABLE users ADD COLUMN permissions_json TEXT NOT NULL DEFAULT '["moderate_listings","moderate_users","reply_support"]';`
  );
}

// Seed ONLY institutional platform defaults (NEVER seed users, so the first registrant is guaranteed to be Administrador Principal)
const existingSettings = db.prepare('SELECT id FROM financial_settings WHERE id = 1').get();
if (!existingSettings) {
  db.prepare(`
    INSERT INTO financial_settings (
      id,
      official_whatsapp,
      official_iban,
      official_express,
      official_account_number,
      official_account_holder,
      rate_usd_to_kz,
      rate_eur_to_kz,
      rate_gbp_to_kz,
      quota_value_kz,
      quota_value_usd,
      quota_value_eur,
      quota_value_gbp
    ) VALUES (1, ?, ?, ?, ?, ?, 915, 985, 1160, 5000, 5.5, 5.1, 4.3)
  `).run(
    '+244 923 000 000',
    'AO06 0040 0000 1234 5678 9012 3',
    '923 000 000',
    '000012345678901',
    'Nzila Agro Lda — Conta Institucional'
  );
}

const existingSmtp = db.prepare('SELECT id FROM smtp_settings WHERE id = 1').get();
if (!existingSmtp) {
  db.prepare(`
    INSERT INTO smtp_settings (id, host, port, secure, username, password, from_name, from_email, enabled, notify_on_approval, notify_on_recovery)
    VALUES (1, '', 587, 0, '', '', 'Nzila Agro', '', 0, 1, 1)
  `).run();
}

const existingCampaigns = db.prepare('SELECT COUNT(*) as count FROM campaigns').get() as { count: number } | undefined;
if (!existingCampaigns || Number(existingCampaigns.count) === 0) {
  db.prepare(`
    INSERT INTO campaigns (title, subtitle, image_url, cta_label, cta_url, is_active)
    VALUES (?, ?, ?, ?, ?, 1)
  `).run(
    'Campanha Nacional de Escoamento Agrícola 2026',
    'Ligamos cooperativas do Huambo, Bié, Malanje e Kwanza Sul diretamente aos mercados urbanos de Luanda e Benguela com verificação administrativa.',
    '/campaign-default.jpg',
    'Publicar Produção',
    '#registar'
  );
}

export function isQuotaCurrentlyActive(userRow: Record<string, unknown>): boolean {
  const activeFlag = Number(userRow.quota_active || 0) === 1;
  if (!activeFlag) return false;
  const expiresAt = userRow.quota_expires_at as string | null;
  if (!expiresAt) return true;
  return new Date(expiresAt).getTime() > Date.now();
}

export const VALID_AUX_PERMISSIONS = [
  'moderate_listings',
  'moderate_users',
  'reply_support',
  'manage_quotas',
  'manage_donations',
  'manage_bonuses',
  'view_analytics',
  'manage_campaigns',
] as const;

export type AuxPermissionKey = (typeof VALID_AUX_PERMISSIONS)[number];

export function parseUserPermissions(row: Record<string, unknown>): AuxPermissionKey[] {
  const role = String(row.role || 'USER');
  if (role === 'ADMIN_PRINCIPAL') {
    return [...VALID_AUX_PERMISSIONS];
  }
  if (role !== 'ADMIN_AUXILIAR') {
    return [];
  }
  const raw = row.permissions_json;
  if (typeof raw !== 'string' || !raw.trim()) {
    return ['moderate_listings', 'moderate_users', 'reply_support'];
  }
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const validSet = new Set<string>(VALID_AUX_PERMISSIONS);
      return parsed.filter((p): p is AuxPermissionKey => typeof p === 'string' && validSet.has(p));
    }
  } catch {
    // fallback to default auxiliary permissions
  }
  return ['moderate_listings', 'moderate_users', 'reply_support'];
}

export function sanitizeUserRow(row: Record<string, unknown>, includeVideo = false) {
  const role = String(row.role);
  return {
    id: Number(row.id),
    email: String(row.email),
    name: String(row.name),
    age: Number(row.age),
    province: String(row.province),
    profession: String(row.profession),
    phone: String(row.phone),
    whatsapp: String(row.whatsapp),
    profilePhoto: String(row.profile_photo),
    ...(includeVideo ? { verificationVideo: String(row.verification_video) } : {}),
    role,
    accessProfile:
      role === 'ADMIN_PRINCIPAL'
        ? 'Administrador Principal'
        : role === 'ADMIN_AUXILIAR'
          ? String(row.access_profile || 'Moderador de Conteúdo')
          : 'Utilizador Padrão',
    permissions: parseUserPermissions(row),
    status: String(row.status),
    quotaActive: isQuotaCurrentlyActive(row),
    quotaExpiresAt: (row.quota_expires_at as string | null) || null,
    subscriptionPlan: String(row.subscription_plan || 'basico'),
    featuredCredits: Number(row.featured_credits || 0),
    bonusKz: Number(row.bonus_kz || 0),
    activeSeconds: Number(row.active_seconds || 0),
    lastActiveAt: (row.last_active_at as string | null) || null,
    createdAt: String(row.created_at),
  };
}

export function recordAuditLog(params: {
  actorId?: number | null;
  actorName: string;
  actorRole: string;
  category: 'Aprovação' | 'Financeiro' | 'Segurança' | 'Utilizadores' | 'Moderação' | 'Sistema';
  action: string;
  targetLabel: string;
  details?: string;
}): void {
  db.prepare(`
    INSERT INTO audit_logs (actor_id, actor_name, actor_role, category, action, target_label, details)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    params.actorId ?? null,
    params.actorName,
    params.actorRole,
    params.category,
    params.action,
    params.targetLabel,
    params.details || ''
  );
}

