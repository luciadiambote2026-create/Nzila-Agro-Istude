import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import {
  AuthenticatedRequest,
  hashPassword,
  requireAuth,
  requireAuxOrPrincipalAdmin,
  requirePermission,
  requirePrincipalAdmin,
  signToken,
  verifyPassword,
  verifyToken,
} from './server/auth.ts';
import {
  consumeWeeklyBackupDownload,
  createJsonBackup,
  getBackupFileById,
  getBackupStatus,
  getLatestAutomaticBackupFile,
  sendTestBackupEmailReport,
  startWeeklyBackupScheduler,
  updateBackupScheduleConfig,
} from './server/backup.ts';
import {
  db,
  isQuotaCurrentlyActive,
  parseUserPermissions,
  recordAuditLog,
  sanitizeUserRow,
  VALID_AUX_PERMISSIONS,
} from './server/db.ts';
import { buildPostgresMigrationSql, getCloudMigrationStatus } from './server/cloudMigration.ts';
import { buildFinancialReportWorkbook, buildInventoryReportWorkbook } from './server/excelExports.ts';
import { generateExecutiveSummaryReport, suggestCompetitivePriceRange } from './server/gemini.ts';
import { getPublicSmtpSettings, sendPlatformEmail, sendSmtpTestEmail } from './server/mailer.ts';
import {
  getPublicSmsGatewaySettings,
  getSmsDeliveryLogs,
  sendCriticalSmsAlert,
  updateSmsGatewaySettings,
} from './server/smsGateway.ts';
import {
  getCriticalAlertLogs,
  getCriticalAlertSettings,
  getMonitorBreachState,
  getServerMetricHistory,
  getSystemHealthSnapshot,
  sendTestCriticalAlert,
  startSystemAlertMonitor,
  updateCriticalAlertSettings,
} from './server/systemMonitor.ts';
import {
  ALLOWED_WEBHOOK_EVENTS,
  dispatchWebhookEvent,
  formatWebhookDelivery,
  formatWebhookPublic,
  sendTestWebhookDelivery,
} from './server/webhooks.ts';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '30mb' }));

function formatSettings(row: Record<string, unknown>) {
  return {
    officialWhatsapp: String(row.official_whatsapp),
    officialIban: String(row.official_iban),
    officialExpress: String(row.official_express),
    officialAccountNumber: String(row.official_account_number),
    officialAccountHolder: String(row.official_account_holder),
    rateUsdToKz: Number(row.rate_usd_to_kz),
    rateEurToKz: Number(row.rate_eur_to_kz),
    rateGbpToKz: Number(row.rate_gbp_to_kz),
    quotaValueKz: Number(row.quota_value_kz),
    quotaValueUsd: Number(row.quota_value_usd),
    quotaValueEur: Number(row.quota_value_eur),
    quotaValueGbp: Number(row.quota_value_gbp),
    updatedAt: String(row.updated_at),
  };
}

function formatCampaign(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    title: String(row.title),
    subtitle: String(row.subtitle),
    imageUrl: String(row.image_url),
    ctaLabel: String(row.cta_label),
    ctaUrl: String(row.cta_url),
    isActive: Number(row.is_active) === 1,
    createdAt: String(row.created_at),
  };
}

function isListingCurrentlyFeatured(row: Record<string, unknown>): boolean {
  if (Number(row.is_featured || 0) !== 1) return false;
  if (!row.featured_until) return true;
  const expiresMs = new Date(String(row.featured_until)).getTime();
  return Number.isFinite(expiresMs) && expiresMs > Date.now();
}

function formatListingPublic(row: Record<string, unknown>) {
  const sellerActive = String(row.seller_status) === 'Ativo';
  const quotaActive = isQuotaCurrentlyActive({
    quota_active: row.seller_quota_active,
    quota_expires_at: row.seller_quota_expires_at,
  });
  const visibleClear = sellerActive && quotaActive;
  const featured = isListingCurrentlyFeatured(row);

  if (!visibleClear) {
    return {
      id: Number(row.id),
      userId: 0,
      category: String(row.category),
      title: 'Conteúdo Reservado — Conta Pendente ou Cota Inativa',
      description: 'Este anúncio aguarda validação administrativa ou ativação de cota para ficar visível na vitrine pública.',
      priceKz: 0,
      unit: '—',
      province: String(row.province),
      imageUrl: String(row.image_url),
      isMasked: Boolean(row.is_masked),
      isFeatured: false,
      featuredUntil: null,
      createdAt: String(row.created_at),
      sellerStatus: String(row.seller_status),
      sellerQuotaActive: quotaActive,
      isBlurred: true,
    };
  }

  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    category: String(row.category),
    title: String(row.title),
    description: String(row.description),
    priceKz: Number(row.price_kz),
    unit: String(row.unit),
    province: String(row.province),
    imageUrl: String(row.image_url),
    isMasked: Number(row.is_masked) === 1,
    isFeatured: featured,
    featuredUntil: featured && row.featured_until ? String(row.featured_until) : null,
    createdAt: String(row.created_at),
    sellerName: String(row.seller_name),
    sellerProvince: String(row.seller_province),
    sellerPhone: String(row.seller_phone),
    sellerWhatsapp: String(row.seller_whatsapp),
    sellerPhoto: String(row.seller_photo),
    sellerStatus: String(row.seller_status),
    sellerQuotaActive: true,
    isBlurred: false,
  };
}

// ---------- PUBLIC ENDPOINTS ----------

app.get('/api/public/overview', (_req, res) => {
  const userCountRow = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  const settingsRow = db.prepare('SELECT * FROM financial_settings WHERE id = 1').get()!;
  const campaignRows = db.prepare('SELECT * FROM campaigns WHERE is_active = 1 ORDER BY id DESC').all();
  const listingRows = db
    .prepare(`
      SELECT l.*, u.name as seller_name, u.province as seller_province, u.phone as seller_phone,
             u.whatsapp as seller_whatsapp, u.profile_photo as seller_photo, u.status as seller_status,
             u.quota_active as seller_quota_active, u.quota_expires_at as seller_quota_expires_at,
             CASE
               WHEN l.is_featured = 1 AND (l.featured_until IS NULL OR datetime(l.featured_until) > datetime('now'))
               THEN 1 ELSE 0
             END as active_featured_rank
      FROM listings l
      JOIN users u ON l.user_id = u.id
      ORDER BY active_featured_rank DESC, l.id DESC
    `)
    .all();

  res.json({
    hasAnyUser: Number(userCountRow.count) > 0,
    settings: formatSettings(settingsRow),
    campaigns: campaignRows.map(formatCampaign),
    listings: listingRows.map(formatListingPublic),
  });
});

app.post('/api/public/donations', (req, res) => {
  const { donorName, donorContact, amount, currency, method, reference, message } = req.body ?? {};
  const numericAmount = Number(amount);

  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    res.status(400).json({ error: 'Indique um valor válido para a doação.' });
    return;
  }

  const allowedCurrencies = ['AOA', 'USD', 'EUR', 'GBP'];
  const curr = allowedCurrencies.includes(String(currency)) ? String(currency) : 'AOA';
  const allowedMethods = ['IBAN', 'Express', 'Conta', 'WhatsApp'];
  const payMethod = allowedMethods.includes(String(method)) ? String(method) : 'IBAN';

  const settings = db.prepare('SELECT * FROM financial_settings WHERE id = 1').get()!;
  let amountKz = numericAmount;
  if (curr === 'USD') amountKz = numericAmount * Number(settings.rate_usd_to_kz);
  if (curr === 'EUR') amountKz = numericAmount * Number(settings.rate_eur_to_kz);
  if (curr === 'GBP') amountKz = numericAmount * Number(settings.rate_gbp_to_kz);

  db.prepare(`
    INSERT INTO donations (donor_name, donor_contact, amount, currency, amount_kz, method, reference, message, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pendente')
  `).run(
    String(donorName || 'Doador Privado').trim() || 'Doador Privado',
    String(donorContact || 'Não informado').trim() || 'Não informado',
    numericAmount,
    curr,
    Math.round(amountKz * 100) / 100,
    payMethod,
    String(reference || 'Sem referência').trim() || 'Sem referência',
    String(message || '').trim()
  );

  void dispatchWebhookEvent('donation.created', {
    donorName: String(donorName || 'Doador Privado').trim() || 'Doador Privado',
    amount: numericAmount,
    currency: curr,
    amountKz: Math.round(amountKz * 100) / 100,
    method: payMethod,
  });

  res.status(201).json({
    success: true,
    message: 'Doação privada registada com confidencialidade total. Apenas o Administrador Principal tem acesso a este registo.',
  });
});

app.post('/api/public/listings/:id/inquiry', (req, res) => {
  const listingId = Number(req.params.id);
  const listing = db.prepare('SELECT id, user_id FROM listings WHERE id = ?').get(listingId);
  if (!listing) {
    res.status(404).json({ error: 'Publicação não encontrada.' });
    return;
  }

  db.prepare('INSERT INTO listing_inquiries (listing_id, seller_id) VALUES (?, ?)').run(
    Number(listing.id),
    Number(listing.user_id)
  );

  res.status(201).json({ success: true });
});

// ---------- AUTHENTICATION & GOLDEN ACCESS RULE ----------

app.post('/api/auth/register', async (req, res) => {
  const {
    email,
    password,
    profilePhoto,
    verificationVideo,
    name,
    age,
    province,
    profession,
    phone,
    whatsapp,
  } = req.body ?? {};

  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanName = String(name || '').trim();
  const numericAge = Number(age);
  const cleanProvince = String(province || '').trim();
  const cleanProfession = String(profession || '').trim();
  const cleanPhone = String(phone || '').trim();
  const cleanWhatsapp = String(whatsapp || '').trim();
  const cleanPhoto = String(profilePhoto || '').trim();
  const cleanVideo = String(verificationVideo || '').trim();

  if (
    !cleanEmail ||
    !password ||
    String(password).length < 6 ||
    !cleanPhoto ||
    !cleanVideo ||
    !cleanName ||
    !Number.isInteger(numericAge) ||
    numericAge < 18 ||
    !cleanProvince ||
    !cleanProfession ||
    !cleanPhone ||
    !cleanWhatsapp
  ) {
    res.status(400).json({
      error:
        'Todos os campos são obrigatórios (e-mail, palavra-passe min. 6 caracteres, foto de perfil, mini-vídeo de 5s, nome, idade >= 18, província, profissão, telefone e WhatsApp).',
    });
    return;
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
  if (existing) {
    res.status(409).json({ error: 'Já existe uma conta registada com este e-mail.' });
    return;
  }

  const passwordHash = await hashPassword(String(password));

  let createdUserId = 0;
  try {
    db.exec('BEGIN IMMEDIATE');
    const countRow = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
    const isFirstUser = Number(countRow.count) === 0;

    const assignedRole = isFirstUser ? 'ADMIN_PRINCIPAL' : 'USER';
    const assignedStatus = isFirstUser ? 'Ativo' : 'Pendente';
    const quotaActive = isFirstUser ? 1 : 0;
    const quotaExpiresAt = isFirstUser ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() : null;

    const result = db
      .prepare(`
        INSERT INTO users (
          email, password_hash, name, age, province, profession, phone, whatsapp,
          profile_photo, verification_video, role, status, quota_active, quota_expires_at, last_active_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `)
      .run(
        cleanEmail,
        passwordHash,
        cleanName,
        numericAge,
        cleanProvince,
        cleanProfession,
        cleanPhone,
        cleanWhatsapp,
        cleanPhoto,
        cleanVideo,
        assignedRole,
        assignedStatus,
        quotaActive,
        quotaExpiresAt
      );

    createdUserId = Number(result.lastInsertRowid);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('Erro no registo:', err);
    res.status(500).json({ error: 'Erro interno ao criar conta.' });
    return;
  }

  const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(createdUserId)!;
  const token = signToken(createdUserId, String(userRow.role));

  void dispatchWebhookEvent('user.registered', {
    userId: createdUserId,
    name: String(userRow.name),
    email: String(userRow.email),
    province: String(userRow.province),
    profession: String(userRow.profession),
    role: String(userRow.role),
    status: String(userRow.status),
  });

  res.status(201).json({
    token,
    user: sanitizeUserRow(userRow, false),
    isFirstPrincipalAdmin: userRow.role === 'ADMIN_PRINCIPAL',
  });
});

app.post('/api/auth/restore-local-accounts', async (req, res) => {
  try {
    const { accounts, activeEmail } = req.body ?? {};
    if (!Array.isArray(accounts) || accounts.length === 0) {
      res.json({ restored: 0, token: null, user: null });
      return;
    }

    const existingCountRow = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
    const hadAnyUserBefore = Number(existingCountRow?.count || 0) > 0;
    let restored = 0;

    const sortedAccounts = [...accounts].sort((a, b) => {
      if (a?.role === 'ADMIN_PRINCIPAL' && b?.role !== 'ADMIN_PRINCIPAL') return -1;
      if (b?.role === 'ADMIN_PRINCIPAL' && a?.role !== 'ADMIN_PRINCIPAL') return 1;
      return 0;
    });

    for (const acc of sortedAccounts) {
      const normalizedEmail = String(acc?.email || '').trim().toLowerCase();
      if (!normalizedEmail) continue;

      const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
      if (exists) continue;

      const rawPassword = String(acc?.password || '');
      const passwordHash = rawPassword
        ? await hashPassword(rawPassword)
        : await hashPassword(`NzilaRestored#${Date.now()}`);

      const requestedRole = String(acc?.role || 'USER');
      const safeRole =
        !hadAnyUserBefore && requestedRole === 'ADMIN_PRINCIPAL'
          ? 'ADMIN_PRINCIPAL'
          : requestedRole === 'ADMIN_AUXILIAR'
            ? 'ADMIN_AUXILIAR'
            : 'USER';

      const status = safeRole === 'ADMIN_PRINCIPAL' ? 'Ativo' : String(acc?.status || 'Pendente');
      const quotaActive = safeRole === 'ADMIN_PRINCIPAL' || acc?.quotaActive ? 1 : 0;
      const quotaExpiresAt =
        acc?.quotaExpiresAt ||
        (safeRole === 'ADMIN_PRINCIPAL'
          ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
          : null);

      db.prepare(`
        INSERT INTO users (
          email, password_hash, name, age, province, profession, phone, whatsapp,
          profile_photo, verification_video, role, status, quota_active, quota_expires_at,
          subscription_plan, featured_credits, last_active_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        normalizedEmail,
        passwordHash,
        String(acc?.name || 'Utilizador Nzila'),
        Number(acc?.age || 28),
        String(acc?.province || 'Luanda'),
        String(acc?.profession || 'Produtor Agrícola'),
        String(acc?.phone || '+244 900 000 000'),
        String(acc?.whatsapp || '+244 900 000 000'),
        String(acc?.profilePhoto || '/icon.svg'),
        String(acc?.verificationVideo || 'restored-from-local-storage'),
        safeRole,
        status,
        quotaActive,
        quotaExpiresAt,
        String(acc?.subscriptionPlan || 'basico'),
        Number(acc?.featuredCredits || 0)
      );
      restored += 1;
    }

    let token: string | null = null;
    let activeUser: ReturnType<typeof sanitizeUserRow> | null = null;
    const normalizedActive = String(activeEmail || '').trim().toLowerCase();
    if (normalizedActive) {
      const row = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedActive) as
        | Record<string, unknown>
        | undefined;
      if (row) {
        token = signToken(Number(row.id), String(row.role));
        activeUser = sanitizeUserRow(row);
      }
    }

    res.json({ restored, token, user: activeUser });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Erro ao restaurar contas guardadas localmente.',
    });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  const cleanEmail = String(email || '').trim().toLowerCase();

  if (!cleanEmail || !password) {
    res.status(400).json({ error: 'Informe o e-mail e a palavra-passe.' });
    return;
  }

  const userRow = db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail);
  if (!userRow) {
    res.status(401).json({ error: 'Credenciais inválidas.' });
    return;
  }

  const valid = await verifyPassword(String(password), String(userRow.password_hash));
  if (!valid) {
    res.status(401).json({ error: 'Credenciais inválidas.' });
    return;
  }

  db.prepare("UPDATE users SET last_active_at = datetime('now') WHERE id = ?").run(Number(userRow.id));
  const refreshed = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(userRow.id))!;
  const token = signToken(Number(refreshed.id), String(refreshed.role));

  res.json({
    token,
    user: sanitizeUserRow(refreshed, false),
  });
});

// Armored Password Recovery: Requires new 5s identity confirmation video; stays Pendente until Admin Principal approves!
app.post('/api/auth/recovery-request', async (req, res) => {
  const { email, newPassword, recoveryVideo } = req.body ?? {};
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanVideo = String(recoveryVideo || '').trim();

  if (!cleanEmail || !newPassword || String(newPassword).length < 6 || !cleanVideo) {
    res.status(400).json({
      error: 'Informe o e-mail da conta, a nova palavra-passe (mín. 6 caracteres) e o novo mini-vídeo de confirmação de identidade.',
    });
    return;
  }

  const userRow = db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail);
  if (!userRow) {
    res.status(404).json({ error: 'Nenhuma conta encontrada com este endereço de e-mail.' });
    return;
  }

  const newHash = await hashPassword(String(newPassword));
  db.prepare(`
    INSERT INTO password_recovery_requests (user_id, new_password_hash, recovery_video, status)
    VALUES (?, ?, ?, 'Pendente')
  `).run(Number(userRow.id), newHash, cleanVideo);

  // Automatic SMTP notification to user and Principal Admin (non-blocking)
  void sendPlatformEmail({
    to: String(userRow.email),
    subject: 'Nzila Agro — Pedido de Recuperação de Palavra-passe Recebido',
    title: 'Pedido de Recuperação Blindada Recebido',
    paragraphs: [
      `Olá ${String(userRow.name)},`,
      'Recebemos o seu pedido de recuperação de palavra-passe acompanhado pelo novo mini-vídeo de confirmação de identidade.',
      'Por razões de segurança, a nova palavra-passe só será ativada após a validação manual pelo Administrador Principal.',
    ],
    eventType: 'recovery',
  });

  const principalRow = db
    .prepare("SELECT email, name FROM users WHERE role = 'ADMIN_PRINCIPAL' ORDER BY id ASC LIMIT 1")
    .get() as { email: string; name: string } | undefined;
  if (principalRow?.email) {
    void sendPlatformEmail({
      to: String(principalRow.email),
      subject: `Nzila Agro — Novo Pedido de Recuperação (${String(userRow.name)})`,
      title: 'Novo Pedido de Recuperação de Palavra-passe Pendente',
      paragraphs: [
        `O utilizador ${String(userRow.name)} (${String(userRow.email)}) submeteu um novo mini-vídeo de confirmação de identidade para redefinição de palavra-passe.`,
        'Aceda ao Painel do Administrador Principal na aba «Recuperação Blindada» para validar o vídeo e aprovar ou rejeitar o pedido.',
      ],
      eventType: 'recovery',
    });
  }

  void dispatchWebhookEvent('recovery.requested', {
    userId: Number(userRow.id),
    name: String(userRow.name),
    email: String(userRow.email),
    province: String(userRow.province),
  });

  res.status(201).json({
    success: true,
    message:
      'Pedido de recuperação blindada enviado. A sua palavra-passe só será alterada após o Administrador Principal validar o seu mini-vídeo de confirmação.',
  });
});

app.get('/api/auth/recovery-status', (req, res) => {
  const cleanEmail = String(req.query.email || '').trim().toLowerCase();
  if (!cleanEmail) {
    res.status(400).json({ error: 'Indique o e-mail para consultar.' });
    return;
  }
  const row = db
    .prepare(`
      SELECT r.id, r.status, r.admin_notes, r.created_at, r.reviewed_at
      FROM password_recovery_requests r
      JOIN users u ON r.user_id = u.id
      WHERE u.email = ?
      ORDER BY r.id DESC
      LIMIT 1
    `)
    .get(cleanEmail);

  if (!row) {
    res.json({ found: false });
    return;
  }
  res.json({
    found: true,
    id: Number(row.id),
    status: String(row.status),
    adminNotes: row.admin_notes ? String(row.admin_notes) : null,
    createdAt: String(row.created_at),
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
  });
});

// ---------- USER PANEL ENDPOINTS ----------

app.get('/api/users/me', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  res.json({ user: sanitizeUserRow(user, false) });
});

app.get('/api/users/notifications', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = Number(req.authUser!.id);
  const rows = db
    .prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 30')
    .all(userId);

  res.json({
    notifications: rows.map((row) => ({
      id: Number(row.id),
      userId: Number(row.user_id),
      type: String(row.type),
      title: String(row.title),
      message: String(row.message),
      isRead: Number(row.is_read) === 1,
      createdAt: String(row.created_at),
    })),
  });
});

app.put('/api/users/notifications/read-all', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = Number(req.authUser!.id);
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(userId);
  res.json({ success: true });
});

app.put('/api/users/notifications/:id/read', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = Number(req.authUser!.id);
  const notifId = Number(req.params.id);
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(notifId, userId);
  res.json({ success: true });
});

app.post('/api/users/heartbeat', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = Number(req.authUser!.id);
  const delta = Math.min(Math.max(Number(req.body?.seconds || 30), 1), 120);

  db.prepare("UPDATE users SET active_seconds = active_seconds + ?, last_active_at = datetime('now') WHERE id = ?").run(
    delta,
    userId
  );

  const updated = db.prepare('SELECT active_seconds, last_active_at FROM users WHERE id = ?').get(userId)!;
  res.json({
    activeSeconds: Number(updated.active_seconds),
    lastActiveAt: String(updated.last_active_at),
  });
});

app.put('/api/users/profile', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = Number(req.authUser!.id);
  const { name, province, profession, phone, whatsapp, profilePhoto } = req.body ?? {};

  const cleanPhone = String(phone || '').trim();
  if (!cleanPhone) {
    res.status(400).json({ error: 'O número de telefone é obrigatório.' });
    return;
  }

  db.prepare(`
    UPDATE users
    SET name = COALESCE(NULLIF(?, ''), name),
        province = COALESCE(NULLIF(?, ''), province),
        profession = COALESCE(NULLIF(?, ''), profession),
        phone = ?,
        whatsapp = COALESCE(NULLIF(?, ''), whatsapp),
        profile_photo = COALESCE(NULLIF(?, ''), profile_photo)
    WHERE id = ?
  `).run(
    String(name || '').trim(),
    String(province || '').trim(),
    String(profession || '').trim(),
    cleanPhone,
    String(whatsapp || '').trim(),
    String(profilePhoto || '').trim(),
    userId
  );

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(userId)!;
  res.json({ user: sanitizeUserRow(updated, false) });
});

app.put('/api/users/password', requireAuth, async (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  const { currentPassword, newPassword } = req.body ?? {};

  if (!currentPassword || !newPassword || String(newPassword).length < 6) {
    res.status(400).json({ error: 'Informe a palavra-passe atual e a nova palavra-passe (mín. 6 caracteres).' });
    return;
  }

  const matches = await verifyPassword(String(currentPassword), String(user.password_hash));
  if (!matches) {
    res.status(401).json({ error: 'A palavra-passe atual está incorreta.' });
    return;
  }

  const newHash = await hashPassword(String(newPassword));
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, Number(user.id));

  res.json({ success: true, message: 'Palavra-passe atualizada com sucesso.' });
});

app.get('/api/users/my-listings', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = Number(req.authUser!.id);
  const rows = db.prepare('SELECT * FROM listings WHERE user_id = ? ORDER BY id DESC').all(userId);
  res.json({
    listings: rows.map((row) => {
      const featured = isListingCurrentlyFeatured(row);
      return {
        id: Number(row.id),
        userId: Number(row.user_id),
        category: String(row.category),
        title: String(row.title),
        description: String(row.description),
        priceKz: Number(row.price_kz),
        unit: String(row.unit),
        province: String(row.province),
        imageUrl: String(row.image_url),
        isMasked: Number(row.is_masked) === 1,
        isFeatured: featured,
        featuredUntil: featured && row.featured_until ? String(row.featured_until) : null,
        createdAt: String(row.created_at),
      };
    }),
  });
});

// ---------- SUBSCRIPTION PLANS, FEATURED LISTINGS & MULTICAIXA PAYMENT ORDERS ----------

const FEATURED_BOOST_PRICE_KZ = 2500;
const FEATURED_BOOST_DAYS = 7;

interface MulticaixaGatewayRow {
  enabled: boolean;
  provider: 'proxypay' | 'appypay' | 'emis_gpo' | 'manual';
  environment: 'sandbox' | 'production';
  entityCode: string;
  apiKey: string;
  webhookSecret: string;
  endpointUrl: string;
  referenceValidityHours: number;
  autoConfirmWebhook: boolean;
  updatedAt?: string;
}

function getMulticaixaGatewaySettingsInternal(): MulticaixaGatewayRow {
  const row = db
    .prepare('SELECT * FROM multicaixa_gateway_settings WHERE id = 1')
    .get() as Record<string, unknown> | undefined;

  if (!row) {
    db.prepare(
      `INSERT OR IGNORE INTO multicaixa_gateway_settings
       (id, enabled, provider, environment, entity_code, api_key, webhook_secret, endpoint_url, reference_validity_hours, auto_confirm_webhook)
       VALUES (1, 1, 'manual', 'sandbox', '00521', '', '', '', 48, 0)`
    ).run();
    return {
      enabled: true,
      provider: 'manual',
      environment: 'sandbox',
      entityCode: '00521',
      apiKey: '',
      webhookSecret: '',
      endpointUrl: '',
      referenceValidityHours: 48,
      autoConfirmWebhook: false,
    };
  }

  const rawProvider = String(row.provider || 'manual');
  const provider: MulticaixaGatewayRow['provider'] =
    rawProvider === 'proxypay' || rawProvider === 'appypay' || rawProvider === 'emis_gpo'
      ? rawProvider
      : 'manual';

  return {
    enabled: Number(row.enabled) === 1,
    provider,
    environment: String(row.environment) === 'production' ? 'production' : 'sandbox',
    entityCode: String(row.entity_code || '00521').trim() || '00521',
    apiKey: String(row.api_key || ''),
    webhookSecret: String(row.webhook_secret || ''),
    endpointUrl: String(row.endpoint_url || ''),
    referenceValidityHours: Math.min(168, Math.max(1, Math.floor(Number(row.reference_validity_hours || 48)))),
    autoConfirmWebhook: Number(row.auto_confirm_webhook) === 1,
    updatedAt: row.updated_at ? String(row.updated_at) : undefined,
  };
}

function getPublicMulticaixaGatewaySettings() {
  const cfg = getMulticaixaGatewaySettingsInternal();
  return {
    enabled: cfg.enabled,
    provider: cfg.provider,
    environment: cfg.environment,
    entityCode: cfg.entityCode,
    hasApiKey: cfg.apiKey.length > 0,
    hasWebhookSecret: cfg.webhookSecret.length > 0,
    endpointUrl: cfg.endpointUrl,
    referenceValidityHours: cfg.referenceValidityHours,
    autoConfirmWebhook: cfg.autoConfirmWebhook,
    updatedAt: cfg.updatedAt,
  };
}

function updateMulticaixaGatewaySettings(input: Record<string, unknown>) {
  const current = getMulticaixaGatewaySettingsInternal();
  const rawProvider = typeof input.provider === 'string' ? input.provider : current.provider;
  const provider: MulticaixaGatewayRow['provider'] =
    rawProvider === 'proxypay' || rawProvider === 'appypay' || rawProvider === 'emis_gpo'
      ? rawProvider
      : 'manual';
  const environment = input.environment === 'production' ? 'production' : 'sandbox';
  const entityCode =
    typeof input.entityCode === 'string' && input.entityCode.trim()
      ? input.entityCode.trim().replace(/\s+/g, '').slice(0, 12)
      : current.entityCode;
  const apiKey =
    typeof input.apiKey === 'string' && input.apiKey.trim()
      ? input.apiKey.trim()
      : current.apiKey;
  const webhookSecret =
    typeof input.webhookSecret === 'string' && input.webhookSecret.trim()
      ? input.webhookSecret.trim()
      : current.webhookSecret;
  const endpointUrl =
    typeof input.endpointUrl === 'string' ? input.endpointUrl.trim() : current.endpointUrl;
  const referenceValidityHours =
    input.referenceValidityHours !== undefined
      ? Math.min(168, Math.max(1, Math.floor(Number(input.referenceValidityHours))))
      : current.referenceValidityHours;
  const enabled = typeof input.enabled === 'boolean' ? input.enabled : current.enabled;
  const autoConfirmWebhook =
    typeof input.autoConfirmWebhook === 'boolean'
      ? input.autoConfirmWebhook
      : current.autoConfirmWebhook;

  db.prepare(
    `INSERT INTO multicaixa_gateway_settings
     (id, enabled, provider, environment, entity_code, api_key, webhook_secret, endpoint_url, reference_validity_hours, auto_confirm_webhook, updated_at)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       enabled = excluded.enabled,
       provider = excluded.provider,
       environment = excluded.environment,
       entity_code = excluded.entity_code,
       api_key = excluded.api_key,
       webhook_secret = excluded.webhook_secret,
       endpoint_url = excluded.endpoint_url,
       reference_validity_hours = excluded.reference_validity_hours,
       auto_confirm_webhook = excluded.auto_confirm_webhook,
       updated_at = datetime('now')`
  ).run(
    enabled ? 1 : 0,
    provider,
    environment,
    entityCode,
    apiKey,
    webhookSecret,
    endpointUrl,
    referenceValidityHours,
    autoConfirmWebhook ? 1 : 0
  );

  return getPublicMulticaixaGatewaySettings();
}

function generateMulticaixaReference(): string {
  for (let attempt = 0; attempt < 20; attempt++) {
    const part1 = String(Math.floor(100 + Math.random() * 900));
    const part2 = String(Math.floor(100 + Math.random() * 900));
    const part3 = String(Math.floor(100 + Math.random() * 900));
    const ref = `${part1} ${part2} ${part3}`;
    const existing = db.prepare('SELECT id FROM payment_orders WHERE reference_code = ?').get(ref);
    if (!existing) return ref;
  }
  return `${Date.now().toString().slice(-9).replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3')}`;
}

function formatPaymentOrderRow(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    userName: row.user_name ? String(row.user_name) : undefined,
    userEmail: row.user_email ? String(row.user_email) : undefined,
    userPhone: row.user_phone ? String(row.user_phone) : undefined,
    orderType: String(row.order_type) as 'subscription' | 'featured_boost',
    planCode: row.plan_code ? String(row.plan_code) : null,
    planName: row.plan_name ? String(row.plan_name) : null,
    listingId: row.listing_id ? Number(row.listing_id) : null,
    listingTitle: row.listing_title ? String(row.listing_title) : null,
    amountKz: Number(row.amount_kz),
    paymentMethod: String(row.payment_method) as 'multicaixa_ref' | 'iban_transfer' | 'multicaixa_express',
    entityCode: String(row.entity_code),
    referenceCode: String(row.reference_code),
    status: String(row.status) as 'Aguardando Pagamento' | 'Comprovativo Enviado' | 'Aprovado' | 'Rejeitado',
    proofFileUrl: row.proof_file_url ? String(row.proof_file_url) : null,
    proofNotes: row.proof_notes ? String(row.proof_notes) : null,
    adminNotes: row.admin_notes ? String(row.admin_notes) : null,
    expiresAt: String(row.expires_at),
    reviewedBy: row.reviewed_by ? String(row.reviewed_by) : null,
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
    createdAt: String(row.created_at),
  };
}

app.get('/api/payments/plans', (_req, res) => {
  const planRows = db
    .prepare('SELECT * FROM subscription_plans WHERE is_active = 1 ORDER BY price_kz ASC')
    .all() as Array<Record<string, unknown>>;
  const settingsRow = db.prepare('SELECT * FROM financial_settings WHERE id = 1').get()!;
  const mcCfg = getMulticaixaGatewaySettingsInternal();

  res.json({
    entityCode: mcCfg.entityCode,
    provider: mcCfg.provider,
    environment: mcCfg.environment,
    referenceValidityHours: mcCfg.referenceValidityHours,
    featuredBoostPriceKz: FEATURED_BOOST_PRICE_KZ,
    featuredBoostDays: FEATURED_BOOST_DAYS,
    bankDetails: {
      iban: String(settingsRow.official_iban || ''),
      express: String(settingsRow.official_express || ''),
      accountNumber: String(settingsRow.official_account_number || ''),
      accountHolder: String(settingsRow.official_account_holder || ''),
      whatsapp: String(settingsRow.official_whatsapp || ''),
    },
    plans: planRows.map((p) => {
      let features: string[] = [];
      try {
        features = JSON.parse(String(p.features_json || '[]'));
      } catch {
        features = [];
      }
      return {
        code: String(p.code),
        name: String(p.name),
        description: String(p.description),
        priceKz: Number(p.price_kz),
        durationDays: Number(p.duration_days),
        featuredCredits: Number(p.featured_credits),
        badgeLabel: String(p.badge_label || ''),
        features,
        isPopular: Number(p.is_popular) === 1,
      };
    }),
  });
});

app.get('/api/users/payment-orders', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = Number(req.authUser!.id);
  const rows = db
    .prepare(`
      SELECT po.*, sp.name as plan_name, l.title as listing_title
      FROM payment_orders po
      LEFT JOIN subscription_plans sp ON po.plan_code = sp.code
      LEFT JOIN listings l ON po.listing_id = l.id
      WHERE po.user_id = ?
      ORDER BY po.id DESC
      LIMIT 30
    `)
    .all(userId) as Array<Record<string, unknown>>;

  const freshUser = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as Record<string, unknown>;
  res.json({
    user: sanitizeUserRow(freshUser),
    orders: rows.map(formatPaymentOrderRow),
  });
});

app.post('/api/users/payment-orders', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = Number(req.authUser!.id);
  const { orderType, planCode, listingId, paymentMethod } = req.body ?? {};
  const validMethod =
    paymentMethod === 'iban_transfer' || paymentMethod === 'multicaixa_express'
      ? paymentMethod
      : 'multicaixa_ref';

  let amountKz = 0;
  let resolvedPlanCode: string | null = null;
  let resolvedListingId: number | null = null;

  if (orderType === 'subscription') {
    const plan = db
      .prepare('SELECT * FROM subscription_plans WHERE code = ? AND is_active = 1')
      .get(String(planCode || '')) as Record<string, unknown> | undefined;
    if (!plan) {
      res.status(400).json({ error: 'Plano de subscrição inválido.' });
      return;
    }
    amountKz = Number(plan.price_kz);
    resolvedPlanCode = String(plan.code);
  } else if (orderType === 'featured_boost') {
    const listing = db
      .prepare('SELECT id, title FROM listings WHERE id = ? AND user_id = ?')
      .get(Number(listingId), userId) as Record<string, unknown> | undefined;
    if (!listing) {
      res.status(404).json({ error: 'Anúncio não encontrado na sua conta.' });
      return;
    }
    amountKz = FEATURED_BOOST_PRICE_KZ;
    resolvedListingId = Number(listing.id);
  } else {
    res.status(400).json({ error: 'Tipo de pagamento inválido.' });
    return;
  }

  const mcCfg = getMulticaixaGatewaySettingsInternal();
  const referenceCode = generateMulticaixaReference();
  const expiresAt = new Date(Date.now() + mcCfg.referenceValidityHours * 60 * 60 * 1000).toISOString();

  const insert = db
    .prepare(`
      INSERT INTO payment_orders
        (user_id, order_type, plan_code, listing_id, amount_kz, payment_method, entity_code, reference_code, status, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Aguardando Pagamento', ?)
    `)
    .run(
      userId,
      orderType,
      resolvedPlanCode,
      resolvedListingId,
      amountKz,
      validMethod,
      mcCfg.entityCode,
      referenceCode,
      expiresAt
    );

  const created = db
    .prepare(`
      SELECT po.*, sp.name as plan_name, l.title as listing_title
      FROM payment_orders po
      LEFT JOIN subscription_plans sp ON po.plan_code = sp.code
      LEFT JOIN listings l ON po.listing_id = l.id
      WHERE po.id = ?
    `)
    .get(Number(insert.lastInsertRowid)) as Record<string, unknown>;

  res.status(201).json({ order: formatPaymentOrderRow(created) });
});

app.post('/api/users/payment-orders/:id/proof', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = Number(req.authUser!.id);
  const orderId = Number(req.params.id);
  const { proofFileUrl, proofNotes } = req.body ?? {};

  const order = db
    .prepare('SELECT * FROM payment_orders WHERE id = ? AND user_id = ?')
    .get(orderId, userId) as Record<string, unknown> | undefined;

  if (!order) {
    res.status(404).json({ error: 'Ordem de pagamento não encontrada.' });
    return;
  }
  if (String(order.status) === 'Aprovado') {
    res.status(400).json({ error: 'Este pagamento já foi aprovado.' });
    return;
  }
  if (!proofFileUrl && !String(proofNotes || '').trim()) {
    res.status(400).json({ error: 'Carregue a imagem do comprovativo ou informe o código da operação.' });
    return;
  }

  db.prepare(`
    UPDATE payment_orders
    SET proof_file_url = COALESCE(?, proof_file_url),
        proof_notes = ?,
        status = 'Comprovativo Enviado'
    WHERE id = ?
  `).run(
    proofFileUrl ? String(proofFileUrl) : null,
    String(proofNotes || '').trim(),
    orderId
  );

  const principalAdmins = db
    .prepare("SELECT id FROM users WHERE role = 'ADMIN_PRINCIPAL'")
    .all() as Array<{ id: number }>;
  const notifyStmt = db.prepare(
    `INSERT INTO notifications (user_id, type, title, message) VALUES (?, 'info', ?, ?)`
  );
  for (const admin of principalAdmins) {
    notifyStmt.run(
      Number(admin.id),
      'Novo Comprovativo Multicaixa / IBAN',
      `${req.authUser!.name} enviou comprovativo para a referência ${order.reference_code} (${Number(order.amount_kz).toLocaleString('pt-AO')} Kz).`
    );
  }

  const updated = db
    .prepare(`
      SELECT po.*, sp.name as plan_name, l.title as listing_title
      FROM payment_orders po
      LEFT JOIN subscription_plans sp ON po.plan_code = sp.code
      LEFT JOIN listings l ON po.listing_id = l.id
      WHERE po.id = ?
    `)
    .get(orderId) as Record<string, unknown>;

  res.json({ order: formatPaymentOrderRow(updated) });
});

app.post('/api/users/listings/:id/feature', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = Number(req.authUser!.id);
  const listingId = Number(req.params.id);

  const freshUser = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as Record<string, unknown>;
  const credits = Number(freshUser?.featured_credits || 0);
  if (credits <= 0) {
    res.status(400).json({
      error: 'Sem créditos de destaque disponíveis. Adira a um plano ou gere uma Referência Multicaixa de 2.500 Kz para destacar este anúncio.',
    });
    return;
  }

  const listing = db
    .prepare('SELECT id, title FROM listings WHERE id = ? AND user_id = ?')
    .get(listingId, userId) as Record<string, unknown> | undefined;
  if (!listing) {
    res.status(404).json({ error: 'Anúncio não encontrado.' });
    return;
  }

  const featuredUntil = new Date(Date.now() + FEATURED_BOOST_DAYS * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('UPDATE listings SET is_featured = 1, featured_until = ? WHERE id = ?').run(featuredUntil, listingId);
  db.prepare('UPDATE users SET featured_credits = MAX(0, featured_credits - 1) WHERE id = ?').run(userId);

  const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as Record<string, unknown>;
  res.json({
    success: true,
    featuredUntil,
    user: sanitizeUserRow(updatedUser),
  });
});

app.post('/api/users/listings', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  const { category, title, description, priceKz, unit, province, imageUrl } = req.body ?? {};

  const validCategory = category === 'Consultoria/Formação' ? 'Consultoria/Formação' : category === 'Produto Agrícola' ? 'Produto Agrícola' : null;
  const numericPrice = Number(priceKz);

  if (!validCategory || !String(title || '').trim() || !String(description || '').trim() || !Number.isFinite(numericPrice) || numericPrice <= 0 || !String(imageUrl || '').trim()) {
    res.status(400).json({
      error: 'Preencha categoria ("Produto Agrícola" ou "Consultoria/Formação"), título, descrição, preço válido em Kz e fotografia.',
    });
    return;
  }

  const result = db
    .prepare(`
      INSERT INTO listings (user_id, category, title, description, price_kz, unit, province, image_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      Number(user.id),
      validCategory,
      String(title).trim(),
      String(description).trim(),
      numericPrice,
      String(unit || (validCategory === 'Produto Agrícola' ? 'Kg / Saco' : 'Sessão / Curso')).trim(),
      String(province || user.province).trim(),
      String(imageUrl).trim()
    );

  const created = db.prepare('SELECT * FROM listings WHERE id = ?').get(Number(result.lastInsertRowid))!;
  void dispatchWebhookEvent('listing.created', {
    listingId: Number(created.id),
    userId: Number(created.user_id),
    sellerName: String(user.name),
    category: String(created.category),
    title: String(created.title),
    priceKz: Number(created.price_kz),
    unit: String(created.unit),
    province: String(created.province),
  });

  res.status(201).json({
    listing: {
      id: Number(created.id),
      userId: Number(created.user_id),
      category: String(created.category),
      title: String(created.title),
      description: String(created.description),
      priceKz: Number(created.price_kz),
      unit: String(created.unit),
      province: String(created.province),
      imageUrl: String(created.image_url),
      isMasked: Number(created.is_masked) === 1,
      createdAt: String(created.created_at),
    },
  });
});

app.delete('/api/users/listings/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = Number(req.authUser!.id);
  const listingId = Number(req.params.id);
  const info = db.prepare('DELETE FROM listings WHERE id = ? AND user_id = ?').run(listingId, userId);
  if (Number(info.changes) === 0) {
    res.status(404).json({ error: 'Publicação não encontrada.' });
    return;
  }
  res.json({ success: true });
});

app.post('/api/users/listings/suggest-price', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { category, province, title, unit } = req.body ?? {};
  const cleanCategory = String(category || '').trim();
  const cleanProvince = String(province || '').trim();

  if (!cleanCategory || !cleanProvince) {
    res.status(400).json({ error: 'Selecione a categoria e a província para obter a sugestão de preço.' });
    return;
  }

  const benchmarkRow = db
    .prepare(
      `SELECT COUNT(*) AS cnt, ROUND(AVG(price_kz)) AS avg_p, MIN(price_kz) AS min_p, MAX(price_kz) AS max_p
       FROM listings
       WHERE category = ? AND province = ?`
    )
    .get(cleanCategory, cleanProvince) as
    | { cnt: number; avg_p: number | null; min_p: number | null; max_p: number | null }
    | undefined;

  const localStats = {
    count: Number(benchmarkRow?.cnt || 0),
    avgPriceKz: benchmarkRow?.avg_p != null ? Number(benchmarkRow.avg_p) : null,
    minPriceKz: benchmarkRow?.min_p != null ? Number(benchmarkRow.min_p) : null,
    maxPriceKz: benchmarkRow?.max_p != null ? Number(benchmarkRow.max_p) : null,
  };

  try {
    const suggestion = await suggestCompetitivePriceRange({
      category: cleanCategory,
      province: cleanProvince,
      title: typeof title === 'string' ? title : undefined,
      unit: typeof unit === 'string' ? unit : undefined,
      localStats,
    });
    res.json({ suggestion, localStats });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : 'Erro ao consultar a API Gemini para sugestão de preço.';
    res.status(502).json({ error: msg });
  }
});

app.get('/api/users/monthly-report', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = Number(req.authUser!.id);
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const rawMonth = String(req.query.month || defaultMonth).trim();
  const monthKey = /^\d{4}-\d{2}$/.test(rawMonth) ? rawMonth : defaultMonth;

  const salesRows = db
    .prepare(
      `SELECT s.id, s.listing_id, s.quantity, s.total_kz, s.sale_date, s.note,
              l.title AS listing_title, l.category AS listing_category, l.unit AS listing_unit
       FROM listing_sales s
       JOIN listings l ON s.listing_id = l.id
       WHERE s.seller_id = ? AND substr(s.sale_date, 1, 7) = ?
       ORDER BY s.sale_date ASC, s.id ASC`
    )
    .all(userId, monthKey) as Array<Record<string, unknown>>;

  const inquiryRows = db
    .prepare(
      `SELECT i.listing_id, l.title AS listing_title, l.category AS listing_category,
              COUNT(i.id) AS inquiry_count, MAX(i.created_at) AS last_inquiry_at
       FROM listing_inquiries i
       JOIN listings l ON i.listing_id = l.id
       WHERE i.seller_id = ? AND substr(i.created_at, 1, 7) = ?
       GROUP BY i.listing_id
       ORDER BY inquiry_count DESC, l.title ASC`
    )
    .all(userId, monthKey) as Array<Record<string, unknown>>;

  const sales = salesRows.map((r) => ({
    id: Number(r.id),
    listingId: Number(r.listing_id),
    listingTitle: String(r.listing_title || 'Produto'),
    category: String(r.listing_category || 'Produto Agrícola'),
    unit: String(r.listing_unit || 'Unidade'),
    quantity: Number(r.quantity || 0),
    totalKz: Math.round(Number(r.total_kz || 0) * 100) / 100,
    saleDate: String(r.sale_date || ''),
    note: String(r.note || ''),
  }));

  const inquiriesByProduct = inquiryRows.map((r) => ({
    listingId: Number(r.listing_id),
    listingTitle: String(r.listing_title || 'Produto'),
    category: String(r.listing_category || 'Produto Agrícola'),
    count: Number(r.inquiry_count || 0),
    lastInquiryAt: String(r.last_inquiry_at || ''),
  }));

  const totalSalesCount = sales.length;
  const totalUnitsSold = Math.round(sales.reduce((acc, s) => acc + s.quantity, 0) * 100) / 100;
  const totalRevenueKz = Math.round(sales.reduce((acc, s) => acc + s.totalKz, 0) * 100) / 100;
  const averageTicketKz = totalSalesCount > 0 ? Math.round(totalRevenueKz / totalSalesCount) : 0;
  const totalInquiries = inquiriesByProduct.reduce((acc, i) => acc + i.count, 0);
  const conversionRatePct =
    totalInquiries > 0 ? Number(((totalSalesCount / totalInquiries) * 100).toFixed(1)) : null;

  res.json({
    monthKey,
    producer: {
      name: String(req.authUser!.name || ''),
      email: String(req.authUser!.email || ''),
      phone: String(req.authUser!.phone || ''),
      whatsapp: String(req.authUser!.whatsapp || ''),
      province: String(req.authUser!.province || ''),
      profession: String(req.authUser!.profession || ''),
    },
    summary: {
      totalSalesCount,
      totalUnitsSold,
      totalRevenueKz,
      averageTicketKz,
      totalInquiries,
      conversionRatePct,
    },
    sales,
    inquiriesByProduct,
  });
});

app.get('/api/users/analytics', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = Number(req.authUser!.id);
  const requestedMonths = Math.min(Math.max(Number(req.query.months || 6), 3), 12);

  const monthNamesPt = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const now = new Date();
  const buckets: Array<{
    monthKey: string;
    monthLabel: string;
    inquiries: number;
    salesCount: number;
    salesVolumeKz: number;
  }> = [];
  const bucketMap = new Map<string, (typeof buckets)[number]>();

  for (let i = requestedMonths - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = `${monthNamesPt[d.getMonth()]}/${String(d.getFullYear()).slice(-2)}`;
    const entry = {
      monthKey: key,
      monthLabel: label,
      inquiries: 0,
      salesCount: 0,
      salesVolumeKz: 0,
    };
    buckets.push(entry);
    bucketMap.set(key, entry);
  }

  const inquiryRows = db
    .prepare(`
      SELECT substr(created_at, 1, 7) as ym, COUNT(*) as cnt
      FROM listing_inquiries
      WHERE seller_id = ?
      GROUP BY ym
    `)
    .all(userId);

  for (const row of inquiryRows) {
    const b = bucketMap.get(String(row.ym));
    if (b) {
      b.inquiries = Number(row.cnt || 0);
    }
  }

  const salesRows = db
    .prepare(`
      SELECT substr(sale_date, 1, 7) as ym, COUNT(*) as cnt, COALESCE(SUM(total_kz), 0) as vol
      FROM listing_sales
      WHERE seller_id = ?
      GROUP BY ym
    `)
    .all(userId);

  for (const row of salesRows) {
    const b = bucketMap.get(String(row.ym));
    if (b) {
      b.salesCount = Number(row.cnt || 0);
      b.salesVolumeKz = Math.round(Number(row.vol || 0) * 100) / 100;
    }
  }

  const recentSalesRows = db
    .prepare(`
      SELECT s.*, l.title as listing_title
      FROM listing_sales s
      JOIN listings l ON s.listing_id = l.id
      WHERE s.seller_id = ?
      ORDER BY s.sale_date DESC, s.id DESC
      LIMIT 20
    `)
    .all(userId);

  const totals = buckets.reduce(
    (acc, item) => ({
      inquiries: acc.inquiries + item.inquiries,
      salesCount: acc.salesCount + item.salesCount,
      salesVolumeKz: acc.salesVolumeKz + item.salesVolumeKz,
    }),
    { inquiries: 0, salesCount: 0, salesVolumeKz: 0 }
  );

  res.json({
    months: buckets,
    totals,
    recentSales: recentSalesRows.map((row) => ({
      id: Number(row.id),
      listingId: Number(row.listing_id),
      listingTitle: String(row.listing_title),
      quantity: Number(row.quantity),
      totalKz: Number(row.total_kz),
      saleDate: String(row.sale_date),
      note: String(row.note || ''),
      createdAt: String(row.created_at),
    })),
  });
});

app.post('/api/users/sales', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = Number(req.authUser!.id);
  const { listingId, quantity, totalKz, saleDate, note } = req.body ?? {};
  const numericListingId = Number(listingId);
  const numericQty = Number(quantity);
  const numericTotal = Number(totalKz);
  const cleanDate = String(saleDate || new Date().toISOString().slice(0, 10)).trim();

  if (
    !Number.isInteger(numericListingId) ||
    !Number.isFinite(numericQty) ||
    numericQty <= 0 ||
    !Number.isFinite(numericTotal) ||
    numericTotal <= 0 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)
  ) {
    res.status(400).json({ error: 'Selecione um produto, quantidade válida, valor em Kz e data da venda.' });
    return;
  }

  const owned = db.prepare('SELECT id FROM listings WHERE id = ? AND user_id = ?').get(numericListingId, userId);
  if (!owned) {
    res.status(404).json({ error: 'Publicação não encontrada na sua conta.' });
    return;
  }

  db.prepare(`
    INSERT INTO listing_sales (listing_id, seller_id, quantity, total_kz, sale_date, note)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(numericListingId, userId, numericQty, numericTotal, cleanDate, String(note || '').trim());

  void dispatchWebhookEvent('sale.created', {
    listingId: numericListingId,
    sellerId: userId,
    sellerName: String(req.authUser!.name),
    quantity: numericQty,
    totalKz: numericTotal,
    saleDate: cleanDate,
    note: String(note || '').trim(),
  });

  res.status(201).json({ success: true });
});

app.delete('/api/users/sales/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = Number(req.authUser!.id);
  const saleId = Number(req.params.id);
  const info = db.prepare('DELETE FROM listing_sales WHERE id = ? AND seller_id = ?').run(saleId, userId);
  if (Number(info.changes) === 0) {
    res.status(404).json({ error: 'Registo de venda não encontrado.' });
    return;
  }
  res.json({ success: true });
});

app.get('/api/users/support', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = Number(req.authUser!.id);
  const rows = db
    .prepare(`
      SELECT s.*, u.name as user_name, u.email as user_email
      FROM support_messages s
      JOIN users u ON s.user_id = u.id
      WHERE s.user_id = ?
      ORDER BY s.id DESC
    `)
    .all(userId);

  res.json({
    messages: rows.map((row) => ({
      id: Number(row.id),
      userId: Number(row.user_id),
      userName: String(row.user_name),
      userEmail: String(row.user_email),
      subject: String(row.subject),
      message: String(row.message),
      adminReply: row.admin_reply ? String(row.admin_reply) : null,
      repliedBy: row.replied_by ? String(row.replied_by) : null,
      status: String(row.status),
      createdAt: String(row.created_at),
      repliedAt: row.replied_at ? String(row.replied_at) : null,
    })),
  });
});

app.post('/api/users/support', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = Number(req.authUser!.id);
  const { subject, message } = req.body ?? {};
  if (!String(subject || '').trim() || !String(message || '').trim()) {
    res.status(400).json({ error: 'Preencha o assunto e a mensagem de suporte.' });
    return;
  }

  db.prepare('INSERT INTO support_messages (user_id, subject, message) VALUES (?, ?, ?)').run(
    userId,
    String(subject).trim(),
    String(message).trim()
  );

  res.status(201).json({ success: true });
});

app.get('/api/users/voice-memos', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = Number(req.authUser!.id);
  const rows = db
    .prepare('SELECT * FROM voice_memos WHERE user_id = ? ORDER BY id DESC')
    .all(userId);

  res.json({
    memos: rows.map((r) => ({
      id: Number(r.id),
      userId: Number(r.user_id),
      title: String(r.title),
      transcript: String(r.transcript),
      category: String(r.category || 'Campo / Lavra'),
      language: String(r.language || 'pt-PT'),
      durationSeconds: Number(r.duration_seconds || 0),
      createdAt: String(r.created_at),
    })),
  });
});

app.post('/api/users/voice-memos', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = Number(req.authUser!.id);
  const { title, transcript, category, language, durationSeconds } = req.body ?? {};
  const cleanTranscript = String(transcript || '').trim();
  if (!cleanTranscript) {
    res.status(400).json({ error: 'A nota de campo não pode estar vazia.' });
    return;
  }

  const cleanTitle =
    String(title || '').trim() ||
    `Nota de Campo · ${new Date().toLocaleDateString('pt-AO')}`;
  const cleanCategory = String(category || 'Campo / Lavra').trim().slice(0, 60);
  const cleanLanguage = String(language || 'pt-PT').trim().slice(0, 20);
  const cleanDuration = Math.max(0, Math.round(Number(durationSeconds) || 0));

  const result = db
    .prepare(
      `INSERT INTO voice_memos (user_id, title, transcript, category, language, duration_seconds)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(userId, cleanTitle, cleanTranscript, cleanCategory, cleanLanguage, cleanDuration);

  const created = db.prepare('SELECT * FROM voice_memos WHERE id = ?').get(Number(result.lastInsertRowid));
  res.status(201).json({
    memo: created
      ? {
          id: Number(created.id),
          userId: Number(created.user_id),
          title: String(created.title),
          transcript: String(created.transcript),
          category: String(created.category),
          language: String(created.language),
          durationSeconds: Number(created.duration_seconds || 0),
          createdAt: String(created.created_at),
        }
      : null,
  });
});

app.delete('/api/users/voice-memos/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = Number(req.authUser!.id);
  const memoId = Number(req.params.id);
  const existing = db
    .prepare('SELECT id FROM voice_memos WHERE id = ? AND user_id = ?')
    .get(memoId, userId);

  if (!existing) {
    res.status(404).json({ error: 'Nota de voz não encontrada.' });
    return;
  }

  db.prepare('DELETE FROM voice_memos WHERE id = ? AND user_id = ?').run(memoId, userId);
  res.json({ success: true });
});

app.get('/api/users/events', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = Number(req.authUser!.id);
  const rows = db
    .prepare(
      'SELECT * FROM scheduled_events WHERE user_id = ? ORDER BY event_date ASC, start_time ASC, id DESC'
    )
    .all(userId);

  res.json({
    events: rows.map((r) => ({
      id: Number(r.id),
      userId: Number(r.user_id),
      title: String(r.title),
      eventType: String(r.event_type || 'Colheita'),
      eventDate: String(r.event_date),
      startTime: String(r.start_time || '08:00'),
      endTime: String(r.end_time || '10:00'),
      location: String(r.location || ''),
      description: String(r.description || ''),
      reminderMinutes: Number(r.reminder_minutes ?? 30),
      createdAt: String(r.created_at),
    })),
  });
});

app.post('/api/users/events', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = Number(req.authUser!.id);
  const { title, eventType, eventDate, startTime, endTime, location, description, reminderMinutes } =
    req.body ?? {};

  const cleanTitle = String(title || '').trim();
  const cleanDate = String(eventDate || '').trim();
  if (!cleanTitle || !/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
    res.status(400).json({ error: 'Informe o título e uma data válida (AAAA-MM-DD) para o evento.' });
    return;
  }

  const cleanType = String(eventType || 'Colheita').trim().slice(0, 50);
  const cleanStart = /^\d{2}:\d{2}$/.test(String(startTime || '')) ? String(startTime) : '08:00';
  const cleanEnd = /^\d{2}:\d{2}$/.test(String(endTime || '')) ? String(endTime) : '10:00';
  const cleanLocation = String(location || '').trim().slice(0, 140);
  const cleanDescription = String(description || '').trim().slice(0, 1000);
  const cleanReminder = Math.max(0, Math.min(10080, Math.round(Number(reminderMinutes) || 30)));

  const result = db
    .prepare(
      `INSERT INTO scheduled_events (user_id, title, event_type, event_date, start_time, end_time, location, description, reminder_minutes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      userId,
      cleanTitle,
      cleanType,
      cleanDate,
      cleanStart,
      cleanEnd,
      cleanLocation,
      cleanDescription,
      cleanReminder
    );

  const created = db
    .prepare('SELECT * FROM scheduled_events WHERE id = ?')
    .get(Number(result.lastInsertRowid));

  res.status(201).json({
    event: created
      ? {
          id: Number(created.id),
          userId: Number(created.user_id),
          title: String(created.title),
          eventType: String(created.event_type),
          eventDate: String(created.event_date),
          startTime: String(created.start_time),
          endTime: String(created.end_time),
          location: String(created.location || ''),
          description: String(created.description || ''),
          reminderMinutes: Number(created.reminder_minutes ?? 30),
          createdAt: String(created.created_at),
        }
      : null,
  });
});

app.delete('/api/users/events/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = Number(req.authUser!.id);
  const eventId = Number(req.params.id);
  const existing = db
    .prepare('SELECT id FROM scheduled_events WHERE id = ? AND user_id = ?')
    .get(eventId, userId);

  if (!existing) {
    res.status(404).json({ error: 'Evento agendado não encontrado.' });
    return;
  }

  db.prepare('DELETE FROM scheduled_events WHERE id = ? AND user_id = ?').run(eventId, userId);
  res.json({ success: true });
});

// ---------- AUXILIAR + PRINCIPAL ADMIN MODERATION ENDPOINTS ----------

app.get('/api/admin/aux/overview', requireAuth, requireAuxOrPrincipalAdmin, (req: AuthenticatedRequest, res) => {
  const userRows = db.prepare('SELECT * FROM users ORDER BY id DESC').all();
  const listingRows = db
    .prepare(`
      SELECT l.*, u.name as seller_name, u.province as seller_province, u.phone as seller_phone,
             u.whatsapp as seller_whatsapp, u.profile_photo as seller_photo, u.status as seller_status,
             u.quota_active as seller_quota_active, u.quota_expires_at as seller_quota_expires_at
      FROM listings l
      JOIN users u ON l.user_id = u.id
      ORDER BY l.id DESC
    `)
    .all();
  const supportRows = db
    .prepare(`
      SELECT s.*, u.name as user_name, u.email as user_email
      FROM support_messages s
      JOIN users u ON s.user_id = u.id
      ORDER BY s.id DESC
    `)
    .all();

  const actorRole = String(req.authUser!.role);
  const actorAccessProfile =
    actorRole === 'ADMIN_PRINCIPAL'
      ? 'Administrador Principal'
      : String(req.authUser!.access_profile || 'Moderador de Conteúdo');
  const actorPermissions = parseUserPermissions(req.authUser!);

  res.json({
    actorAccessProfile,
    actorPermissions,
    users: userRows.map((row) => sanitizeUserRow(row, false)),
    listings: listingRows.map((row) => ({
      id: Number(row.id),
      userId: Number(row.user_id),
      category: String(row.category),
      title: String(row.title),
      description: String(row.description),
      priceKz: Number(row.price_kz),
      unit: String(row.unit),
      province: String(row.province),
      imageUrl: String(row.image_url),
      isMasked: Number(row.is_masked) === 1,
      createdAt: String(row.created_at),
      sellerName: String(row.seller_name),
      sellerProvince: String(row.seller_province),
      sellerStatus: String(row.seller_status),
      sellerQuotaActive: isQuotaCurrentlyActive({
        quota_active: row.seller_quota_active,
        quota_expires_at: row.seller_quota_expires_at,
      }),
    })),
    supportMessages: supportRows.map((row) => ({
      id: Number(row.id),
      userId: Number(row.user_id),
      userName: String(row.user_name),
      userEmail: String(row.user_email),
      subject: String(row.subject),
      message: String(row.message),
      adminReply: row.admin_reply ? String(row.admin_reply) : null,
      repliedBy: row.replied_by ? String(row.replied_by) : null,
      status: String(row.status),
      createdAt: String(row.created_at),
      repliedAt: row.replied_at ? String(row.replied_at) : null,
    })),
  });
});

app.put('/api/admin/aux/users/:id/status', requireAuth, requirePermission('moderate_users'), (req: AuthenticatedRequest, res) => {
  const targetId = Number(req.params.id);
  const { status } = req.body ?? {};
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId);

  if (!target) {
    res.status(404).json({ error: 'Utilizador não encontrado.' });
    return;
  }

  if (target.role === 'ADMIN_PRINCIPAL' && req.authUser!.role !== 'ADMIN_PRINCIPAL') {
    res.status(403).json({ error: 'Não é permitido alterar o estado do Administrador Principal.' });
    return;
  }

  if (target.role === 'ADMIN_PRINCIPAL' && status !== 'Ativo') {
    res.status(400).json({ error: 'O Administrador Principal não pode ser desativado.' });
    return;
  }

  const allowed = ['Ativo', 'Suspenso', 'Pendente'];
  if (!allowed.includes(String(status))) {
    res.status(400).json({ error: 'Estado inválido.' });
    return;
  }

  db.prepare('UPDATE users SET status = ? WHERE id = ?').run(String(status), targetId);

  if (status === 'Ativo' && String(target.status) !== 'Ativo') {
    db.prepare(`
      INSERT INTO notifications (user_id, type, title, message)
      VALUES (?, 'account_approved', ?, ?)
    `).run(
      targetId,
      'Registo Aprovado',
      'A sua conta foi aprovada pela administração. Já pode utilizar plenamente a plataforma Nzila Agro.'
    );

    void sendPlatformEmail({
      to: String(target.email),
      subject: 'Nzila Agro — A sua conta foi aprovada!',
      title: 'Registo Aprovado na Nzila Agro',
      paragraphs: [
        `Olá ${String(target.name)},`,
        'Temos o prazer de informar que o seu registo e vídeo de identidade foram validados e a sua conta encontra-se agora com o estado Ativo.',
        'Já pode aceder ao seu painel para publicar produtos agrícolas ou serviços de consultoria/formação em Angola.',
      ],
      eventType: 'approval',
    });

    void dispatchWebhookEvent('user.approved', {
      userId: targetId,
      name: String(target.name),
      email: String(target.email),
      province: String(target.province),
      approvedBy: String(req.authUser!.name),
    });
  }

  recordAuditLog({
    actorId: Number(req.authUser!.id),
    actorName: String(req.authUser!.name),
    actorRole: String(req.authUser!.role),
    category: 'Aprovação',
    action: status === 'Ativo' ? 'Conta Aprovada / Ativada' : `Estado Alterado para ${status}`,
    targetLabel: `${String(target.name)} (${String(target.email)})`,
    details: `Estado anterior: ${String(target.status)} → Novo estado: ${String(status)}`,
  });

  res.json({ success: true });
});

app.delete('/api/admin/aux/listings/:id', requireAuth, requirePermission('moderate_listings'), (req: AuthenticatedRequest, res) => {
  const listingId = Number(req.params.id);
  const existing = db.prepare('SELECT id, title, category FROM listings WHERE id = ?').get(listingId);
  if (!existing) {
    res.status(404).json({ error: 'Publicação não encontrada.' });
    return;
  }
  db.prepare('DELETE FROM listings WHERE id = ?').run(listingId);

  recordAuditLog({
    actorId: Number(req.authUser!.id),
    actorName: String(req.authUser!.name),
    actorRole: String(req.authUser!.role),
    category: 'Moderação',
    action: 'Publicação Eliminada',
    targetLabel: `${String(existing.title)} (#${listingId})`,
    details: `Categoria: ${String(existing.category)}`,
  });

  res.json({ success: true });
});

app.put('/api/admin/aux/listings/:id/image', requireAuth, requirePermission('moderate_listings'), (req: AuthenticatedRequest, res) => {
  const listingId = Number(req.params.id);
  const { maskedImageUrl } = req.body ?? {};
  if (!String(maskedImageUrl || '').trim()) {
    res.status(400).json({ error: 'Imagem mascarada inválida.' });
    return;
  }

  const existing = db.prepare('SELECT id, title FROM listings WHERE id = ?').get(listingId);
  if (!existing) {
    res.status(404).json({ error: 'Publicação não encontrada.' });
    return;
  }

  db.prepare('UPDATE listings SET image_url = ?, is_masked = 1 WHERE id = ?').run(String(maskedImageUrl).trim(), listingId);

  recordAuditLog({
    actorId: Number(req.authUser!.id),
    actorName: String(req.authUser!.name),
    actorRole: String(req.authUser!.role),
    category: 'Moderação',
    action: 'Imagem Mascarada',
    targetLabel: `${String(existing.title)} (#${listingId})`,
    details: 'Dados sensíveis ocultados via ferramenta de pincel/borracha.',
  });

  res.json({ success: true });
});

app.post('/api/admin/aux/support/:id/reply', requireAuth, requirePermission('reply_support'), (req: AuthenticatedRequest, res) => {
  const ticketId = Number(req.params.id);
  const { reply } = req.body ?? {};
  if (!String(reply || '').trim()) {
    res.status(400).json({ error: 'Escreva uma resposta para o utilizador.' });
    return;
  }

  db.prepare("UPDATE support_messages SET admin_reply = ?, replied_by = ?, status = 'Respondido', replied_at = datetime('now') WHERE id = ?").run(
    String(reply).trim(),
    String(req.authUser!.name),
    ticketId
  );

  res.json({ success: true });
});

// ---------- PRINCIPAL ADMIN FULL CONTROL ENDPOINTS ----------

app.get('/api/admin/principal/overview', requireAuth, requirePrincipalAdmin, (_req, res) => {
  const users = db.prepare('SELECT * FROM users ORDER BY id DESC').all();
  const recoveryRows = db
    .prepare(`
      SELECT r.*, u.name as user_name, u.email as user_email, u.phone as user_phone,
             u.province as user_province, u.profile_photo as original_photo, u.verification_video as original_video
      FROM password_recovery_requests r
      JOIN users u ON r.user_id = u.id
      ORDER BY r.id DESC
    `)
    .all();
  const donationRows = db.prepare('SELECT * FROM donations ORDER BY id DESC').all();
  const bonusRows = db
    .prepare(`
      SELECT b.*, u.name as user_name
      FROM bonus_logs b
      JOIN users u ON b.user_id = u.id
      ORDER BY b.id DESC
    `)
    .all();
  const campaignRows = db.prepare('SELECT * FROM campaigns ORDER BY id DESC').all();
  const settingsRow = db.prepare('SELECT * FROM financial_settings WHERE id = 1').get()!;
  const auditRows = db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 120').all();

  const pendingRegistrations = users.filter((u) => u.status === 'Pendente').length;
  const pendingRecoveries = recoveryRows.filter((r) => r.status === 'Pendente').length;
  const inactiveQuotas = users.filter((u) => !isQuotaCurrentlyActive(u)).length;
  const openSupportRow = db.prepare("SELECT COUNT(*) as count FROM support_messages WHERE status = 'Aberto'").get() as { count: number };

  res.json({
    counters: {
      pendingRegistrations,
      pendingRecoveries,
      inactiveQuotas,
      openSupport: Number(openSupportRow.count),
    },
    users: users.map((u) => sanitizeUserRow(u, true)),
    recoveryRequests: recoveryRows.map((r) => ({
      id: Number(r.id),
      userId: Number(r.user_id),
      userName: String(r.user_name),
      userEmail: String(r.user_email),
      userPhone: String(r.user_phone),
      userProvince: String(r.user_province),
      originalPhoto: String(r.original_photo),
      originalVideo: String(r.original_video),
      recoveryVideo: String(r.recovery_video),
      status: String(r.status),
      adminNotes: r.admin_notes ? String(r.admin_notes) : null,
      createdAt: String(r.created_at),
      reviewedAt: r.reviewed_at ? String(r.reviewed_at) : null,
    })),
    donations: donationRows.map((d) => ({
      id: Number(d.id),
      donorName: String(d.donor_name),
      donorContact: String(d.donor_contact),
      amount: Number(d.amount),
      currency: String(d.currency),
      amountKz: Number(d.amount_kz),
      method: String(d.method),
      reference: String(d.reference),
      message: String(d.message),
      status: String(d.status),
      createdAt: String(d.created_at),
    })),
    bonusLogs: bonusRows.map((b) => ({
      id: Number(b.id),
      userId: Number(b.user_id),
      userName: String(b.user_name),
      amountKz: Number(b.amount_kz),
      reason: String(b.reason),
      grantedBy: String(b.granted_by),
      createdAt: String(b.created_at),
    })),
    campaigns: campaignRows.map(formatCampaign),
    settings: formatSettings(settingsRow),
    auditLogs: auditRows.map((a) => ({
      id: Number(a.id),
      actorId: a.actor_id ? Number(a.actor_id) : null,
      actorName: String(a.actor_name),
      actorRole: String(a.actor_role),
      category: String(a.category),
      action: String(a.action),
      targetLabel: String(a.target_label),
      details: String(a.details || ''),
      createdAt: String(a.created_at),
    })),
  });
});

app.get('/api/admin/principal/market-prices', requireAuth, requirePrincipalAdmin, (req, res) => {
  const rawProvince = String(req.query.province || 'Todas').trim();
  const filterByProvince = rawProvince !== '' && rawProvince !== 'Todas';

  const ptMonths = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const now = new Date();
  const months: Array<{
    monthKey: string;
    monthLabel: string;
    produtoAgricolaAvgKz: number;
    produtoAgricolaCount: number;
    consultoriaAvgKz: number;
    consultoriaCount: number;
    overallAvgKz: number;
    totalCount: number;
  }> = [];

  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const monthKey = `${yyyy}-${mm}`;
    const monthLabel = `${ptMonths[d.getMonth()]}/${String(yyyy).slice(-2)}`;
    months.push({
      monthKey,
      monthLabel,
      produtoAgricolaAvgKz: 0,
      produtoAgricolaCount: 0,
      consultoriaAvgKz: 0,
      consultoriaCount: 0,
      overallAvgKz: 0,
      totalCount: 0,
    });
  }

  const firstMonthKey = months[0].monthKey;
  const rows = (
    filterByProvince
      ? db
          .prepare(
            `SELECT substr(created_at, 1, 7) as month_key, category, price_kz, province
             FROM listings
             WHERE substr(created_at, 1, 7) >= ? AND province = ?`
          )
          .all(firstMonthKey, rawProvince)
      : db
          .prepare(
            `SELECT substr(created_at, 1, 7) as month_key, category, price_kz, province
             FROM listings
             WHERE substr(created_at, 1, 7) >= ?`
          )
          .all(firstMonthKey)
  ) as Array<{ month_key: string; category: string; price_kz: number; province: string }>;

  const monthBuckets = new Map<
    string,
    { prodSum: number; prodCnt: number; consSum: number; consCnt: number; allSum: number; allCnt: number }
  >();
  months.forEach((m) => {
    monthBuckets.set(m.monthKey, { prodSum: 0, prodCnt: 0, consSum: 0, consCnt: 0, allSum: 0, allCnt: 0 });
  });

  const provinceMap = new Map<string, { sum: number; count: number; min: number; max: number }>();

  let totalProdSum = 0;
  let totalProdCnt = 0;
  let totalConsSum = 0;
  let totalConsCnt = 0;
  let totalAllSum = 0;
  let totalAllCnt = 0;

  for (const r of rows) {
    const price = Number(r.price_kz) || 0;
    const key = String(r.month_key);
    const cat = String(r.category);
    const prov = String(r.province || 'Não especificada');

    const bucket = monthBuckets.get(key);
    if (bucket) {
      bucket.allSum += price;
      bucket.allCnt += 1;
      if (cat === 'Produto Agrícola') {
        bucket.prodSum += price;
        bucket.prodCnt += 1;
      } else {
        bucket.consSum += price;
        bucket.consCnt += 1;
      }
    }

    totalAllSum += price;
    totalAllCnt += 1;
    if (cat === 'Produto Agrícola') {
      totalProdSum += price;
      totalProdCnt += 1;
    } else {
      totalConsSum += price;
      totalConsCnt += 1;
    }

    const pEntry = provinceMap.get(prov) || { sum: 0, count: 0, min: price, max: price };
    pEntry.sum += price;
    pEntry.count += 1;
    pEntry.min = Math.min(pEntry.min, price);
    pEntry.max = Math.max(pEntry.max, price);
    provinceMap.set(prov, pEntry);
  }

  for (const m of months) {
    const b = monthBuckets.get(m.monthKey)!;
    m.produtoAgricolaAvgKz = b.prodCnt > 0 ? Math.round(b.prodSum / b.prodCnt) : 0;
    m.produtoAgricolaCount = b.prodCnt;
    m.consultoriaAvgKz = b.consCnt > 0 ? Math.round(b.consSum / b.consCnt) : 0;
    m.consultoriaCount = b.consCnt;
    m.overallAvgKz = b.allCnt > 0 ? Math.round(b.allSum / b.allCnt) : 0;
    m.totalCount = b.allCnt;
  }

  const calcTrendPct = (values: number[]): number | null => {
    const nonZero = values.filter((v) => v > 0);
    if (nonZero.length < 2) return null;
    const first = nonZero[0];
    const last = nonZero[nonZero.length - 1];
    if (first === 0) return null;
    return Math.round(((last - first) / first) * 1000) / 10;
  };

  const byProvince = Array.from(provinceMap.entries())
    .map(([province, stats]) => ({
      province,
      listingsCount: stats.count,
      avgPriceKz: Math.round(stats.sum / stats.count),
      minPriceKz: Math.round(stats.min),
      maxPriceKz: Math.round(stats.max),
    }))
    .sort((a, b) => b.listingsCount - a.listingsCount);

  res.json({
    province: filterByProvince ? rawProvince : 'Todas',
    months,
    summary: {
      totalListings: totalAllCnt,
      overallAvgKz: totalAllCnt > 0 ? Math.round(totalAllSum / totalAllCnt) : 0,
      produtoAgricolaAvgKz: totalProdCnt > 0 ? Math.round(totalProdSum / totalProdCnt) : 0,
      produtoAgricolaCount: totalProdCnt,
      produtoAgricolaTrendPct: calcTrendPct(months.map((m) => m.produtoAgricolaAvgKz)),
      consultoriaAvgKz: totalConsCnt > 0 ? Math.round(totalConsSum / totalConsCnt) : 0,
      consultoriaCount: totalConsCnt,
      consultoriaTrendPct: calcTrendPct(months.map((m) => m.consultoriaAvgKz)),
    },
    byProvince,
  });
});

app.get('/api/admin/principal/province-heatmap', requireAuth, requirePrincipalAdmin, (req, res) => {
  const rawCategory = String(req.query.category || 'Todas').trim();
  const filterByCategory = rawCategory !== '' && rawCategory !== 'Todas';
  const rawPeriod = String(req.query.period || 'all').trim();
  const periodDaysMap: Record<string, number> = {
    '7d': 7,
    '30d': 30,
    '90d': 90,
  };
  const periodDays = periodDaysMap[rawPeriod] ?? null;

  const angolaProvinces = [
    'Bengo',
    'Benguela',
    'Bié',
    'Cabinda',
    'Cuando Cubango',
    'Cuanza Norte',
    'Cuanza Sul',
    'Cunene',
    'Huambo',
    'Huíla',
    'Luanda',
    'Lunda Norte',
    'Lunda Sul',
    'Malanje',
    'Moxico',
    'Namibe',
    'Uíge',
    'Zaire',
  ];

  const whereClauses: string[] = [];
  const params: Array<string | number> = [];

  if (filterByCategory) {
    whereClauses.push('category = ?');
    params.push(rawCategory);
  }
  if (periodDays !== null) {
    whereClauses.push(`datetime(created_at) >= datetime('now', ?)`);
    params.push(`-${periodDays} days`);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const rows = db
    .prepare(
      `SELECT
         province,
         COUNT(*) AS total_products,
         SUM(CASE WHEN category = 'Produto Agrícola' THEN 1 ELSE 0 END) AS agro_count,
         SUM(CASE WHEN category != 'Produto Agrícola' THEN 1 ELSE 0 END) AS consult_count,
         SUM(CASE WHEN datetime(created_at) >= datetime('now', '-30 days') THEN 1 ELSE 0 END) AS recent_30d,
         COUNT(DISTINCT user_id) AS active_producers,
         ROUND(AVG(price_kz)) AS avg_price_kz
       FROM listings
       ${whereSql}
       GROUP BY province`
    )
    .all(...params) as Array<{
    province: string;
    total_products: number;
    agro_count: number;
    consult_count: number;
    recent_30d: number;
    active_producers: number;
    avg_price_kz: number;
  }>;

  const mapByProvince = new Map<
    string,
    {
      totalProducts: number;
      agriculturalProducts: number;
      consultingServices: number;
      recentListings30d: number;
      activeProducers: number;
      avgPriceKz: number;
    }
  >();

  let totalListings = 0;
  let maxProducts = 0;

  for (const r of rows) {
    const provName = String(r.province || 'Não especificada');
    const count = Number(r.total_products || 0);
    totalListings += count;
    if (count > maxProducts) maxProducts = count;
    mapByProvince.set(provName, {
      totalProducts: count,
      agriculturalProducts: Number(r.agro_count || 0),
      consultingServices: Number(r.consult_count || 0),
      recentListings30d: Number(r.recent_30d || 0),
      activeProducers: Number(r.active_producers || 0),
      avgPriceKz: Number(r.avg_price_kz || 0),
    });
  }

  const allProvinceNames = Array.from(new Set([...angolaProvinces, ...mapByProvince.keys()]));

  const provinces = allProvinceNames
    .map((province) => {
      const stats = mapByProvince.get(province) || {
        totalProducts: 0,
        agriculturalProducts: 0,
        consultingServices: 0,
        recentListings30d: 0,
        activeProducers: 0,
        avgPriceKz: 0,
      };
      const sharePct = totalListings > 0 ? Number(((stats.totalProducts / totalListings) * 100).toFixed(1)) : 0;
      const intensity = maxProducts > 0 ? Math.round((stats.totalProducts / maxProducts) * 100) : 0;
      return {
        province,
        ...stats,
        sharePct,
        intensity,
      };
    })
    .sort((a, b) => b.totalProducts - a.totalProducts || a.province.localeCompare(b.province));

  const activeProvinces = provinces.filter((p) => p.totalProducts > 0);
  const topProvince = activeProvinces[0] || null;

  res.json({
    category: filterByCategory ? rawCategory : 'Todas',
    period: periodDays !== null ? rawPeriod : 'all',
    summary: {
      totalListings,
      activeProvincesCount: activeProvinces.length,
      totalProvincesTracked: provinces.length,
      mostActiveProvince: topProvince ? topProvince.province : null,
      mostActiveCount: topProvince ? topProvince.totalProducts : 0,
      averagePerActiveProvince:
        activeProvinces.length > 0 ? Number((totalListings / activeProvinces.length).toFixed(1)) : 0,
    },
    provinces,
  });
});

app.get('/api/admin/principal/executive-summary/history', requireAuth, requirePrincipalAdmin, (_req, res) => {
  const rows = db
    .prepare('SELECT * FROM executive_reports ORDER BY id DESC LIMIT 10')
    .all() as Array<Record<string, unknown>>;

  const reports = rows.map((r) => ({
    id: Number(r.id),
    generatedAt: String(r.created_at),
    generatedBy: String(r.generated_by || 'Administrador Principal'),
    metrics: JSON.parse(String(r.metrics_json || '{}')),
    report: JSON.parse(String(r.report_json || '{}')),
  }));

  res.json({ reports });
});

app.post(
  '/api/admin/principal/executive-summary',
  requireAuth,
  requirePrincipalAdmin,
  async (req: AuthenticatedRequest, res) => {
    const focus = String(req.body?.focus || 'Desempenho Financeiro e Listagens').trim().slice(0, 80);
    const periodMode: 'current_month' | 'last_30d' =
      req.body?.periodMode === 'last_30d' ? 'last_30d' : 'current_month';

    const now = new Date();
    const monthNamesPt = [
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
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthKey = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;

    const startDate =
      periodMode === 'current_month'
        ? new Date(now.getFullYear(), now.getMonth(), 1)
        : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const periodLabel =
      periodMode === 'current_month'
        ? `Mês Corrente — ${monthNamesPt[now.getMonth()]} de ${now.getFullYear()}`
        : `Últimos 30 dias (${startDate.toLocaleDateString('pt-AO')} a ${now.toLocaleDateString('pt-AO')})`;

    const countScalar = (sql: string, ...args: Array<string | number>): number => {
      const row = db.prepare(sql).get(...args) as { val?: number } | undefined;
      return Number(row?.val || 0);
    };

    const userRows = db.prepare('SELECT status, quota_active, quota_expires_at, created_at FROM users').all();
    const cutoffMs = startDate.getTime();
    let newUsersLast30d = 0;
    let activeUsers = 0;
    let pendingUsers = 0;
    let activeQuotas = 0;

    for (const u of userRows) {
      if (String(u.status) === 'Ativo') activeUsers += 1;
      if (String(u.status) === 'Pendente') pendingUsers += 1;
      if (isQuotaCurrentlyActive(u as Record<string, unknown>)) activeQuotas += 1;
      const createdMs = Date.parse(String(u.created_at || ''));
      if (Number.isFinite(createdMs) && createdMs >= cutoffMs) newUsersLast30d += 1;
    }

    const finSettings = db.prepare('SELECT quota_value_kz FROM financial_settings WHERE id = 1').get() as
      | { quota_value_kz?: number }
      | undefined;
    const quotaUnitKz = Number(finSettings?.quota_value_kz || 5000);
    const estimatedQuotaRevenueKz = Math.round(activeQuotas * quotaUnitKz);

    const totalListings = countScalar('SELECT COUNT(*) AS val FROM listings');
    const newListingsLast30d =
      periodMode === 'current_month'
        ? countScalar("SELECT COUNT(*) AS val FROM listings WHERE substr(created_at, 1, 7) = ?", currentMonthKey)
        : countScalar("SELECT COUNT(*) AS val FROM listings WHERE datetime(created_at) >= datetime('now', '-30 days')");

    const agriculturalListingsInPeriod =
      periodMode === 'current_month'
        ? countScalar(
            "SELECT COUNT(*) AS val FROM listings WHERE category = 'Produto Agrícola' AND substr(created_at, 1, 7) = ?",
            currentMonthKey
          )
        : countScalar(
            "SELECT COUNT(*) AS val FROM listings WHERE category = 'Produto Agrícola' AND datetime(created_at) >= datetime('now', '-30 days')"
          );

    const consultingListingsInPeriod = Math.max(0, newListingsLast30d - agriculturalListingsInPeriod);

    const avgListingPriceKz = Math.round(
      countScalar('SELECT COALESCE(AVG(price_kz), 0) AS val FROM listings')
    );

    const topProvinceRows = db
      .prepare(
        `SELECT province, COUNT(*) AS cnt
         FROM listings
         GROUP BY province
         ORDER BY cnt DESC
         LIMIT 5`
      )
      .all() as Array<{ province: string; cnt: number }>;

    const salesCountLast30d =
      periodMode === 'current_month'
        ? countScalar("SELECT COUNT(*) AS val FROM listing_sales WHERE substr(sale_date, 1, 7) = ?", currentMonthKey)
        : countScalar("SELECT COUNT(*) AS val FROM listing_sales WHERE datetime(created_at) >= datetime('now', '-30 days')");

    const salesVolumeKzLast30d = Math.round(
      periodMode === 'current_month'
        ? countScalar(
            "SELECT COALESCE(SUM(total_kz), 0) AS val FROM listing_sales WHERE substr(sale_date, 1, 7) = ?",
            currentMonthKey
          )
        : countScalar(
            "SELECT COALESCE(SUM(total_kz), 0) AS val FROM listing_sales WHERE datetime(created_at) >= datetime('now', '-30 days')"
          )
    );

    const prevSalesVolumeKz = Math.round(
      periodMode === 'current_month'
        ? countScalar(
            "SELECT COALESCE(SUM(total_kz), 0) AS val FROM listing_sales WHERE substr(sale_date, 1, 7) = ?",
            prevMonthKey
          )
        : countScalar(
            "SELECT COALESCE(SUM(total_kz), 0) AS val FROM listing_sales WHERE datetime(created_at) >= datetime('now', '-60 days') AND datetime(created_at) < datetime('now', '-30 days')"
          )
    );

    const avgSaleTicketKzLast30d =
      salesCountLast30d > 0 ? Math.round(salesVolumeKzLast30d / salesCountLast30d) : 0;
    const salesGrowthPct =
      prevSalesVolumeKz > 0
        ? Number((((salesVolumeKzLast30d - prevSalesVolumeKz) / prevSalesVolumeKz) * 100).toFixed(1))
        : null;

    const topProductRows = (
      periodMode === 'current_month'
        ? db
            .prepare(
              `SELECT l.title AS title, COUNT(s.id) AS sales_count, COALESCE(SUM(s.total_kz), 0) AS volume_kz
               FROM listing_sales s
               JOIN listings l ON l.id = s.listing_id
               WHERE substr(s.sale_date, 1, 7) = ?
               GROUP BY s.listing_id
               ORDER BY volume_kz DESC
               LIMIT 5`
            )
            .all(currentMonthKey)
        : db
            .prepare(
              `SELECT l.title AS title, COUNT(s.id) AS sales_count, COALESCE(SUM(s.total_kz), 0) AS volume_kz
               FROM listing_sales s
               JOIN listings l ON l.id = s.listing_id
               WHERE datetime(s.created_at) >= datetime('now', '-30 days')
               GROUP BY s.listing_id
               ORDER BY volume_kz DESC
               LIMIT 5`
            )
            .all()
    ) as Array<{ title: string; sales_count: number; volume_kz: number }>;

    const inquiriesLast30d =
      periodMode === 'current_month'
        ? countScalar("SELECT COUNT(*) AS val FROM listing_inquiries WHERE substr(created_at, 1, 7) = ?", currentMonthKey)
        : countScalar("SELECT COUNT(*) AS val FROM listing_inquiries WHERE datetime(created_at) >= datetime('now', '-30 days')");

    const conversionRatePct =
      inquiriesLast30d > 0 ? Number(((salesCountLast30d / inquiriesLast30d) * 100).toFixed(1)) : null;

    const bonusesGrantedKz = Math.round(
      periodMode === 'current_month'
        ? countScalar(
            "SELECT COALESCE(SUM(amount_kz), 0) AS val FROM bonus_logs WHERE substr(created_at, 1, 7) = ?",
            currentMonthKey
          )
        : countScalar(
            "SELECT COALESCE(SUM(amount_kz), 0) AS val FROM bonus_logs WHERE datetime(created_at) >= datetime('now', '-30 days')"
          )
    );

    const donationsCountLast30d =
      periodMode === 'current_month'
        ? countScalar("SELECT COUNT(*) AS val FROM donations WHERE substr(created_at, 1, 7) = ?", currentMonthKey)
        : countScalar("SELECT COUNT(*) AS val FROM donations WHERE datetime(created_at) >= datetime('now', '-30 days')");

    const donationsTotalKzLast30d = Math.round(
      periodMode === 'current_month'
        ? countScalar(
            "SELECT COALESCE(SUM(amount_kz), 0) AS val FROM donations WHERE substr(created_at, 1, 7) = ?",
            currentMonthKey
          )
        : countScalar(
            "SELECT COALESCE(SUM(amount_kz), 0) AS val FROM donations WHERE datetime(created_at) >= datetime('now', '-30 days')"
          )
    );

    const openSupportTickets = countScalar(
      "SELECT COUNT(*) AS val FROM support_messages WHERE status != 'Respondido'"
    );
    const pendingRecoveries = countScalar(
      "SELECT COUNT(*) AS val FROM password_recovery_requests WHERE status = 'Pendente'"
    );
    const auditEventsLast30d =
      periodMode === 'current_month'
        ? countScalar("SELECT COUNT(*) AS val FROM audit_logs WHERE substr(created_at, 1, 7) = ?", currentMonthKey)
        : countScalar("SELECT COUNT(*) AS val FROM audit_logs WHERE datetime(created_at) >= datetime('now', '-30 days')");

    const metrics = {
      periodLabel,
      periodMode,
      focus,
      totalUsers: userRows.length,
      newUsersLast30d,
      activeUsers,
      pendingUsers,
      activeQuotas,
      estimatedQuotaRevenueKz,
      bonusesGrantedKz,
      totalListings,
      newListingsLast30d,
      agriculturalListingsInPeriod,
      consultingListingsInPeriod,
      avgListingPriceKz,
      topProvinces: topProvinceRows.map((r) => ({
        province: String(r.province),
        count: Number(r.cnt),
      })),
      salesCountLast30d,
      salesVolumeKzLast30d,
      avgSaleTicketKzLast30d,
      prevSalesVolumeKz,
      salesGrowthPct,
      conversionRatePct,
      topSellingProducts: topProductRows.map((r) => ({
        title: String(r.title),
        salesCount: Number(r.sales_count),
        volumeKz: Math.round(Number(r.volume_kz || 0)),
      })),
      inquiriesLast30d,
      donationsCountLast30d,
      donationsTotalKzLast30d,
      openSupportTickets,
      pendingRecoveries,
      auditEventsLast30d,
    };

    try {
      const report = await generateExecutiveSummaryReport(metrics);
      const generatedAt = now.toISOString();

      const insertInfo = db
        .prepare(
          `INSERT INTO executive_reports (focus, period_label, metrics_json, report_json, generated_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(
          focus,
          periodLabel,
          JSON.stringify(metrics),
          JSON.stringify(report),
          String(req.authUser!.name),
          generatedAt
        );

      recordAuditLog({
        actorId: Number(req.authUser!.id),
        actorName: String(req.authUser!.name),
        actorRole: String(req.authUser!.role),
        category: 'Sistema',
        action: 'Relatório Executivo IA Gerado',
        targetLabel: focus,
        details: `Resumo executivo (${periodLabel}) gerado via API Gemini.`,
      });

      res.json({
        id: Number(insertInfo.lastInsertRowid),
        generatedAt,
        generatedBy: String(req.authUser!.name),
        metrics,
        report,
      });
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Erro ao gerar relatório executivo com a API Gemini.';
      res.status(502).json({ error: msg });
    }
  }
);

app.put('/api/admin/principal/users/:id/role', requireAuth, requirePrincipalAdmin, (req: AuthenticatedRequest, res) => {
  const targetId = Number(req.params.id);
  const { role } = req.body ?? {};
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId);

  if (!target) {
    res.status(404).json({ error: 'Utilizador não encontrado.' });
    return;
  }

  if (target.role === 'ADMIN_PRINCIPAL') {
    res.status(400).json({ error: 'Não é possível alterar o cargo do Administrador Principal.' });
    return;
  }

  if (role !== 'ADMIN_AUXILIAR' && role !== 'USER') {
    res.status(400).json({ error: 'Cargo inválido.' });
    return;
  }

  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, targetId);

  recordAuditLog({
    actorId: Number(req.authUser!.id),
    actorName: String(req.authUser!.name),
    actorRole: String(req.authUser!.role),
    category: 'Segurança',
    action: 'Cargo Administrativo Alterado',
    targetLabel: `${String(target.name)} (${String(target.email)})`,
    details: `${String(target.role)} → ${role}`,
  });

  res.json({ success: true });
});

app.put('/api/admin/principal/users/:id/permissions', requireAuth, requirePrincipalAdmin, (req: AuthenticatedRequest, res) => {
  const targetId = Number(req.params.id);
  const { role, accessProfile, permissions } = req.body ?? {};
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId);

  if (!target) {
    res.status(404).json({ error: 'Utilizador não encontrado.' });
    return;
  }

  if (target.role === 'ADMIN_PRINCIPAL') {
    res.status(400).json({ error: 'As permissões do Administrador Principal são totais e imutáveis.' });
    return;
  }

  const nextRole =
    role === 'ADMIN_AUXILIAR' || role === 'USER' ? role : String(target.role);

  const validSet = new Set<string>(VALID_AUX_PERMISSIONS);
  const sanitizedPermissions = Array.isArray(permissions)
    ? Array.from(
        new Set(
          permissions.filter((p): p is string => typeof p === 'string' && validSet.has(p))
        )
      )
    : [];

  const profileName =
    nextRole === 'ADMIN_AUXILIAR'
      ? String(accessProfile || 'Personalizado').trim().slice(0, 60) || 'Personalizado'
      : 'Utilizador Padrão';

  const permsJson = JSON.stringify(nextRole === 'ADMIN_AUXILIAR' ? sanitizedPermissions : []);

  db.prepare(
    'UPDATE users SET role = ?, access_profile = ?, permissions_json = ? WHERE id = ?'
  ).run(nextRole, profileName, permsJson, targetId);

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId);

  recordAuditLog({
    actorId: Number(req.authUser!.id),
    actorName: String(req.authUser!.name),
    actorRole: String(req.authUser!.role),
    category: 'Segurança',
    action: 'Nível de Acesso Atualizado',
    targetLabel: `${String(target.name)} (${String(target.email)})`,
    details:
      nextRole === 'ADMIN_AUXILIAR'
        ? `Perfil: ${profileName} · Permissões (${sanitizedPermissions.length}): ${sanitizedPermissions.join(', ') || 'nenhuma'}`
        : 'Acesso administrativo auxiliar revogado (conta revertida para Utilizador Padrão).',
  });

  res.json({
    success: true,
    user: updated ? sanitizeUserRow(updated, false) : null,
  });
});

app.delete('/api/admin/principal/users/:id', requireAuth, requirePrincipalAdmin, (req: AuthenticatedRequest, res) => {
  const targetId = Number(req.params.id);
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId);

  if (!target) {
    res.status(404).json({ error: 'Utilizador não encontrado.' });
    return;
  }

  if (target.role === 'ADMIN_PRINCIPAL') {
    res.status(400).json({ error: 'Não é permitido eliminar o Administrador Principal.' });
    return;
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(targetId);

  recordAuditLog({
    actorId: Number(req.authUser!.id),
    actorName: String(req.authUser!.name),
    actorRole: String(req.authUser!.role),
    category: 'Utilizadores',
    action: 'Utilizador Eliminado',
    targetLabel: `${String(target.name)} (${String(target.email)})`,
    details: `Província: ${String(target.province)} · Cargo anterior: ${String(target.role)}`,
  });

  res.json({ success: true });
});

app.put('/api/admin/principal/users/:id/quota', requireAuth, requirePrincipalAdmin, (req: AuthenticatedRequest, res) => {
  const targetId = Number(req.params.id);
  const { active, days } = req.body ?? {};
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId);
  if (!target) {
    res.status(404).json({ error: 'Utilizador não encontrado.' });
    return;
  }

  if (!active) {
    db.prepare('UPDATE users SET quota_active = 0, quota_expires_at = NULL WHERE id = ?').run(targetId);
    recordAuditLog({
      actorId: Number(req.authUser!.id),
      actorName: String(req.authUser!.name),
      actorRole: String(req.authUser!.role),
      category: 'Financeiro',
      action: 'Cota Desativada',
      targetLabel: `${String(target.name)} (${String(target.email)})`,
      details: 'Cota removida manualmente.',
    });
    res.json({ success: true });
    return;
  }

  const addDays = Math.max(Number(days || 30), 1);
  const currentExpiry = target.quota_expires_at ? new Date(String(target.quota_expires_at)).getTime() : 0;
  const baseTime = currentExpiry > Date.now() ? currentExpiry : Date.now();
  const nextExpiry = new Date(baseTime + addDays * 24 * 60 * 60 * 1000).toISOString();

  db.prepare('UPDATE users SET quota_active = 1, quota_expires_at = ? WHERE id = ?').run(nextExpiry, targetId);
  recordAuditLog({
    actorId: Number(req.authUser!.id),
    actorName: String(req.authUser!.name),
    actorRole: String(req.authUser!.role),
    category: 'Financeiro',
    action: 'Cota Ativada / Estendida',
    targetLabel: `${String(target.name)} (${String(target.email)})`,
    details: `+${addDays} dias (válida até ${nextExpiry.slice(0, 10)})`,
  });
  res.json({ success: true, quotaExpiresAt: nextExpiry });
});

app.post('/api/admin/principal/users/:id/bonus', requireAuth, requirePrincipalAdmin, (req: AuthenticatedRequest, res) => {
  const targetId = Number(req.params.id);
  const { amountKz, reason } = req.body ?? {};
  const numericAmount = Number(amountKz);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0 || !String(reason || '').trim()) {
    res.status(400).json({ error: 'Indique um valor de bónus positivo (em Kz) e a justificação.' });
    return;
  }

  const target = db.prepare('SELECT name, email FROM users WHERE id = ?').get(targetId);
  if (!target) {
    res.status(404).json({ error: 'Utilizador não encontrado.' });
    return;
  }

  try {
    db.exec('BEGIN IMMEDIATE');
    db.prepare('UPDATE users SET bonus_kz = bonus_kz + ? WHERE id = ?').run(numericAmount, targetId);
    db.prepare('INSERT INTO bonus_logs (user_id, amount_kz, reason, granted_by) VALUES (?, ?, ?, ?)').run(
      targetId,
      numericAmount,
      String(reason).trim(),
      String(req.authUser!.name)
    );
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Erro ao atribuir bónus.' });
    return;
  }

  recordAuditLog({
    actorId: Number(req.authUser!.id),
    actorName: String(req.authUser!.name),
    actorRole: String(req.authUser!.role),
    category: 'Financeiro',
    action: 'Bónus Atribuído',
    targetLabel: `${String(target.name)} (${String(target.email)})`,
    details: `+${numericAmount} Kz · Motivo: ${String(reason).trim()}`,
  });

  res.json({ success: true });
});

app.post('/api/admin/principal/recoveries/:id/decision', requireAuth, requirePrincipalAdmin, (req: AuthenticatedRequest, res) => {
  const requestId = Number(req.params.id);
  const { decision, adminNotes } = req.body ?? {};

  if (decision !== 'Aprovado' && decision !== 'Rejeitado') {
    res.status(400).json({ error: 'Decisão inválida.' });
    return;
  }

  const reqRow = db.prepare('SELECT * FROM password_recovery_requests WHERE id = ?').get(requestId);
  if (!reqRow) {
    res.status(404).json({ error: 'Pedido de recuperação não encontrado.' });
    return;
  }

  if (reqRow.status !== 'Pendente') {
    res.status(400).json({ error: 'Este pedido já foi analisado anteriormente.' });
    return;
  }

  const targetUser = db.prepare('SELECT name, email FROM users WHERE id = ?').get(Number(reqRow.user_id));

  try {
    db.exec('BEGIN IMMEDIATE');
    const cleanNotes = String(adminNotes || '').trim() || null;
    if (decision === 'Aprovado') {
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(String(reqRow.new_password_hash), Number(reqRow.user_id));
      db.prepare(`
        INSERT INTO notifications (user_id, type, title, message)
        VALUES (?, 'recovery_approved', ?, ?)
      `).run(
        Number(reqRow.user_id),
        'Alteração de Senha Aprovada',
        cleanNotes
          ? `O seu pedido de recuperação de senha foi aprovado pelo Administrador Principal. Nota: ${cleanNotes}`
          : 'O seu pedido de recuperação de senha foi aprovado pelo Administrador Principal. A sua nova palavra-passe já está ativa.'
      );
    } else {
      db.prepare(`
        INSERT INTO notifications (user_id, type, title, message)
        VALUES (?, 'recovery_rejected', ?, ?)
      `).run(
        Number(reqRow.user_id),
        'Alteração de Senha Rejeitada',
        cleanNotes
          ? `O seu pedido de recuperação de senha foi rejeitado pelo Administrador Principal. Motivo: ${cleanNotes}`
          : 'O seu pedido de recuperação de senha foi rejeitado pelo Administrador Principal. Submeta um novo vídeo de confirmação.'
      );
    }
    db.prepare("UPDATE password_recovery_requests SET status = ?, admin_notes = ?, reviewed_at = datetime('now') WHERE id = ?").run(
      decision,
      cleanNotes,
      requestId
    );
    db.exec('COMMIT');

    recordAuditLog({
      actorId: Number(req.authUser!.id),
      actorName: String(req.authUser!.name),
      actorRole: String(req.authUser!.role),
      category: 'Segurança',
      action: decision === 'Aprovado' ? 'Recuperação de Senha Aprovada' : 'Recuperação de Senha Rejeitada',
      targetLabel: targetUser ? `${String(targetUser.name)} (${String(targetUser.email)})` : `Utilizador #${reqRow.user_id}`,
      details: cleanNotes || `Pedido #${requestId} decidido manualmente após validação de vídeo.`,
    });

    if (targetUser?.email) {
      const isApproved = decision === 'Aprovado';
      void sendPlatformEmail({
        to: String(targetUser.email),
        subject: isApproved
          ? 'Nzila Agro — Alteração de Palavra-passe Aprovada'
          : 'Nzila Agro — Pedido de Recuperação de Palavra-passe Rejeitado',
        title: isApproved ? 'Alteração de Senha Aprovada' : 'Pedido de Recuperação Rejeitado',
        paragraphs: isApproved
          ? [
              `Olá ${String(targetUser.name)},`,
              'O Administrador Principal validou o seu mini-vídeo de confirmação e aprovou a redefinição da sua palavra-passe.',
              cleanNotes
                ? `Nota administrativa: ${cleanNotes}`
                : 'Já pode iniciar sessão na Nzila Agro com a sua nova palavra-passe.',
            ]
          : [
              `Olá ${String(targetUser.name)},`,
              'O seu pedido de recuperação de palavra-passe foi rejeitado após revisão administrativa.',
              cleanNotes
                ? `Motivo indicado: ${cleanNotes}`
                : 'Por favor, submeta um novo mini-vídeo nítido de confirmação de identidade.',
            ],
        eventType: 'recovery',
      });
    }
  } catch (err) {
    db.exec('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Erro ao processar pedido de recuperação.' });
    return;
  }

  res.json({ success: true });
});

app.get('/api/admin/principal/smtp', requireAuth, requirePrincipalAdmin, (_req, res) => {
  res.json({ smtp: getPublicSmtpSettings() });
});

app.put('/api/admin/principal/smtp', requireAuth, requirePrincipalAdmin, (req: AuthenticatedRequest, res) => {
  const {
    host,
    port,
    secure,
    username,
    password,
    fromName,
    fromEmail,
    enabled,
    notifyOnApproval,
    notifyOnRecovery,
  } = req.body ?? {};

  const cleanHost = String(host || '').trim();
  const numericPort = Math.min(Math.max(Number(port) || 587, 1), 65535);
  const cleanSecure = secure ? 1 : 0;
  const cleanUsername = String(username || '').trim();
  const cleanFromName = String(fromName || 'Nzila Agro').trim() || 'Nzila Agro';
  const cleanFromEmail = String(fromEmail || '').trim();
  const cleanEnabled = enabled ? 1 : 0;
  const cleanNotifyApproval = notifyOnApproval === false ? 0 : 1;
  const cleanNotifyRecovery = notifyOnRecovery === false ? 0 : 1;

  if (cleanEnabled === 1 && (!cleanHost || !cleanFromEmail)) {
    res.status(400).json({
      error: 'Para ativar o envio SMTP, preencha pelo menos o Servidor SMTP (Host) e o E-mail do Remetente.',
    });
    return;
  }

  const existing = db.prepare('SELECT password FROM smtp_settings WHERE id = 1').get() as { password?: string } | undefined;
  const finalPassword =
    typeof password === 'string' && password.length > 0 ? password : String(existing?.password || '');

  db.prepare(`
    UPDATE smtp_settings
    SET host = ?,
        port = ?,
        secure = ?,
        username = ?,
        password = ?,
        from_name = ?,
        from_email = ?,
        enabled = ?,
        notify_on_approval = ?,
        notify_on_recovery = ?,
        updated_at = datetime('now')
    WHERE id = 1
  `).run(
    cleanHost,
    numericPort,
    cleanSecure,
    cleanUsername,
    finalPassword,
    cleanFromName,
    cleanFromEmail,
    cleanEnabled,
    cleanNotifyApproval,
    cleanNotifyRecovery
  );

  recordAuditLog({
    actorId: Number(req.authUser!.id),
    actorName: String(req.authUser!.name),
    actorRole: String(req.authUser!.role),
    category: 'Sistema',
    action: 'Configuração SMTP Atualizada',
    targetLabel: cleanHost ? `${cleanHost}:${numericPort}` : 'SMTP Institucional',
    details: `Estado: ${cleanEnabled ? 'Ativo' : 'Desativado'} · Remetente: ${cleanFromEmail || 'Não definido'}`,
  });

  res.json({
    smtp: getPublicSmtpSettings(),
    message: 'Configuração SMTP guardada com sucesso.',
  });
});

app.post('/api/admin/principal/smtp/test', requireAuth, requirePrincipalAdmin, async (req: AuthenticatedRequest, res) => {
  const toEmail = String(req.body?.toEmail || req.authUser?.email || '').trim();
  if (!toEmail || !toEmail.includes('@')) {
    res.status(400).json({ error: 'Indique um endereço de e-mail válido para o envio de teste.' });
    return;
  }

  try {
    await sendSmtpTestEmail(toEmail);
    res.json({
      success: true,
      message: `E-mail de teste enviado com sucesso para ${toEmail}.`,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Erro desconhecido na ligação SMTP.';
    res.status(400).json({
      error: `Falha na verificação/envio SMTP: ${detail}`,
    });
  }
});

// ---------- WEBHOOKS MANAGEMENT (ZAPIER / MAKE / AUTOMATION) ----------

app.get('/api/admin/principal/webhooks', requireAuth, requirePrincipalAdmin, (_req, res) => {
  const rows = db.prepare('SELECT * FROM webhooks ORDER BY id DESC').all();
  const deliveryRows = db.prepare('SELECT * FROM webhook_deliveries ORDER BY id DESC LIMIT 30').all();
  res.json({
    webhooks: rows.map(formatWebhookPublic),
    deliveries: deliveryRows.map(formatWebhookDelivery),
  });
});

app.post('/api/admin/principal/webhooks', requireAuth, requirePrincipalAdmin, (req: AuthenticatedRequest, res) => {
  const { name, url, secret, events } = req.body ?? {};
  const cleanName = String(name || '').trim();
  const cleanUrl = String(url || '').trim();
  const cleanSecret = String(secret || '').trim();

  if (!cleanName || !cleanUrl) {
    res.status(400).json({ error: 'Indique o nome e o URL do webhook.' });
    return;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(cleanUrl);
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      throw new Error('Protocolo inválido');
    }
  } catch {
    res.status(400).json({ error: 'Indique um URL válido começando por https:// ou http://.' });
    return;
  }

  const validEvents = Array.isArray(events)
    ? Array.from(
        new Set(
          events
            .map(String)
            .filter((ev) => (ALLOWED_WEBHOOK_EVENTS as readonly string[]).includes(ev))
        )
      )
    : [];

  if (validEvents.length === 0) {
    res.status(400).json({ error: 'Selecione pelo menos um evento válido para subscrever.' });
    return;
  }

  const result = db
    .prepare('INSERT INTO webhooks (name, url, secret, events, is_active) VALUES (?, ?, ?, ?, 1)')
    .run(cleanName, parsedUrl.toString(), cleanSecret, JSON.stringify(validEvents));

  const created = db.prepare('SELECT * FROM webhooks WHERE id = ?').get(Number(result.lastInsertRowid))!;

  recordAuditLog({
    actorId: Number(req.authUser!.id),
    actorName: String(req.authUser!.name),
    actorRole: String(req.authUser!.role),
    category: 'Sistema',
    action: 'Webhook Criado',
    targetLabel: cleanName,
    details: `Eventos: ${validEvents.join(', ')} · URL: ${parsedUrl.origin}`,
  });

  res.status(201).json({ webhook: formatWebhookPublic(created) });
});

app.put('/api/admin/principal/webhooks/:id', requireAuth, requirePrincipalAdmin, (req: AuthenticatedRequest, res) => {
  const webhookId = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM webhooks WHERE id = ?').get(webhookId);
  if (!existing) {
    res.status(404).json({ error: 'Webhook não encontrado.' });
    return;
  }

  const { name, url, secret, events, isActive } = req.body ?? {};
  const cleanName = String(name || existing.name).trim();
  const cleanUrl = String(url || existing.url).trim();
  const finalSecret = typeof secret === 'string' && secret.length > 0 ? secret.trim() : String(existing.secret || '');
  const finalActive = typeof isActive === 'boolean' ? (isActive ? 1 : 0) : Number(existing.is_active);

  const validEvents = Array.isArray(events)
    ? Array.from(
        new Set(
          events
            .map(String)
            .filter((ev) => (ALLOWED_WEBHOOK_EVENTS as readonly string[]).includes(ev))
        )
      )
    : JSON.parse(String(existing.events || '[]'));

  db.prepare(`
    UPDATE webhooks
    SET name = ?, url = ?, secret = ?, events = ?, is_active = ?
    WHERE id = ?
  `).run(cleanName, cleanUrl, finalSecret, JSON.stringify(validEvents), finalActive, webhookId);

  const updated = db.prepare('SELECT * FROM webhooks WHERE id = ?').get(webhookId)!;

  recordAuditLog({
    actorId: Number(req.authUser!.id),
    actorName: String(req.authUser!.name),
    actorRole: String(req.authUser!.role),
    category: 'Sistema',
    action: 'Webhook Atualizado',
    targetLabel: cleanName,
    details: `Estado: ${finalActive ? 'Ativo' : 'Pausado'} · Eventos: ${validEvents.join(', ')}`,
  });

  res.json({ webhook: formatWebhookPublic(updated) });
});

app.delete('/api/admin/principal/webhooks/:id', requireAuth, requirePrincipalAdmin, (req: AuthenticatedRequest, res) => {
  const webhookId = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM webhooks WHERE id = ?').get(webhookId);
  if (!existing) {
    res.status(404).json({ error: 'Webhook não encontrado.' });
    return;
  }

  db.prepare('DELETE FROM webhooks WHERE id = ?').run(webhookId);

  recordAuditLog({
    actorId: Number(req.authUser!.id),
    actorName: String(req.authUser!.name),
    actorRole: String(req.authUser!.role),
    category: 'Sistema',
    action: 'Webhook Eliminado',
    targetLabel: String(existing.name),
    details: `URL removido: ${String(existing.url)}`,
  });

  res.json({ success: true });
});

app.post('/api/admin/principal/webhooks/:id/test', requireAuth, requirePrincipalAdmin, async (req, res) => {
  const webhookId = Number(req.params.id);
  try {
    const result = await sendTestWebhookDelivery(webhookId);
    res.json(result);
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : 'Webhook não encontrado.' });
  }
});

app.put('/api/admin/principal/settings', requireAuth, requirePrincipalAdmin, (req: AuthenticatedRequest, res) => {
  const {
    officialWhatsapp,
    officialIban,
    officialExpress,
    officialAccountNumber,
    officialAccountHolder,
    rateUsdToKz,
    rateEurToKz,
    rateGbpToKz,
    quotaValueKz,
    quotaValueUsd,
    quotaValueEur,
    quotaValueGbp,
  } = req.body ?? {};

  db.prepare(`
    UPDATE financial_settings
    SET official_whatsapp = ?,
        official_iban = ?,
        official_express = ?,
        official_account_number = ?,
        official_account_holder = ?,
        rate_usd_to_kz = ?,
        rate_eur_to_kz = ?,
        rate_gbp_to_kz = ?,
        quota_value_kz = ?,
        quota_value_usd = ?,
        quota_value_eur = ?,
        quota_value_gbp = ?,
        updated_at = datetime('now')
    WHERE id = 1
  `).run(
    String(officialWhatsapp || '').trim(),
    String(officialIban || '').trim(),
    String(officialExpress || '').trim(),
    String(officialAccountNumber || '').trim(),
    String(officialAccountHolder || '').trim(),
    Math.max(Number(rateUsdToKz || 915), 1),
    Math.max(Number(rateEurToKz || 985), 1),
    Math.max(Number(rateGbpToKz || 1160), 1),
    Math.max(Number(quotaValueKz || 5000), 1),
    Math.max(Number(quotaValueUsd || 5.5), 0.1),
    Math.max(Number(quotaValueEur || 5.1), 0.1),
    Math.max(Number(quotaValueGbp || 4.3), 0.1)
  );

  recordAuditLog({
    actorId: Number(req.authUser!.id),
    actorName: String(req.authUser!.name),
    actorRole: String(req.authUser!.role),
    category: 'Financeiro',
    action: 'Edição Financeira Oficial',
    targetLabel: 'Definições Financeiras e Cotas',
    details: `IBAN: ${String(officialIban || '').trim()} · Cota: ${Number(quotaValueKz || 5000)} Kz / $${Number(quotaValueUsd || 5.5)} / €${Number(quotaValueEur || 5.1)} / £${Number(quotaValueGbp || 4.3)}`,
  });

  const updated = db.prepare('SELECT * FROM financial_settings WHERE id = 1').get()!;
  res.json({ settings: formatSettings(updated) });
});

app.put('/api/admin/principal/donations/:id/status', requireAuth, requirePrincipalAdmin, (req: AuthenticatedRequest, res) => {
  const donationId = Number(req.params.id);
  const { status } = req.body ?? {};
  const allowed = ['Pendente', 'Confirmada', 'Arquivada'];
  if (!allowed.includes(String(status))) {
    res.status(400).json({ error: 'Estado inválido.' });
    return;
  }
  db.prepare('UPDATE donations SET status = ? WHERE id = ?').run(String(status), donationId);
  recordAuditLog({
    actorId: Number(req.authUser!.id),
    actorName: String(req.authUser!.name),
    actorRole: String(req.authUser!.role),
    category: 'Financeiro',
    action: 'Estado de Doação Atualizado',
    targetLabel: `Doação Privada #${donationId}`,
    details: `Novo estado: ${String(status)}`,
  });
  res.json({ success: true });
});

app.post('/api/admin/principal/campaigns', requireAuth, requirePrincipalAdmin, (req, res) => {
  const { title, subtitle, imageUrl, ctaLabel, ctaUrl, isActive } = req.body ?? {};
  if (!String(title || '').trim() || !String(subtitle || '').trim()) {
    res.status(400).json({ error: 'Informe o título e a descrição da campanha.' });
    return;
  }

  db.prepare(`
    INSERT INTO campaigns (title, subtitle, image_url, cta_label, cta_url, is_active)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    String(title).trim(),
    String(subtitle).trim(),
    String(imageUrl || '/campaign-default.jpg').trim() || '/campaign-default.jpg',
    String(ctaLabel || 'Saber Mais').trim(),
    String(ctaUrl || '#vitrine').trim(),
    isActive === false ? 0 : 1
  );

  res.status(201).json({ success: true });
});

app.put('/api/admin/principal/campaigns/:id', requireAuth, requirePrincipalAdmin, (req, res) => {
  const campaignId = Number(req.params.id);
  const { title, subtitle, imageUrl, ctaLabel, ctaUrl, isActive } = req.body ?? {};

  db.prepare(`
    UPDATE campaigns
    SET title = COALESCE(NULLIF(?, ''), title),
        subtitle = COALESCE(NULLIF(?, ''), subtitle),
        image_url = COALESCE(NULLIF(?, ''), image_url),
        cta_label = COALESCE(NULLIF(?, ''), cta_label),
        cta_url = COALESCE(NULLIF(?, ''), cta_url),
        is_active = ?
    WHERE id = ?
  `).run(
    String(title || '').trim(),
    String(subtitle || '').trim(),
    String(imageUrl || '').trim(),
    String(ctaLabel || '').trim(),
    String(ctaUrl || '').trim(),
    isActive ? 1 : 0,
    campaignId
  );

  res.json({ success: true });
});

app.delete('/api/admin/principal/campaigns/:id', requireAuth, requirePrincipalAdmin, (req: AuthenticatedRequest, res) => {
  const campaignId = Number(req.params.id);
  const existing = db.prepare('SELECT id, title FROM campaigns WHERE id = ?').get(campaignId);
  db.prepare('DELETE FROM campaigns WHERE id = ?').run(campaignId);
  if (existing) {
    recordAuditLog({
      actorId: Number(req.authUser!.id),
      actorName: String(req.authUser!.name),
      actorRole: String(req.authUser!.role),
      category: 'Sistema',
      action: 'Campanha Eliminada',
      targetLabel: `${String(existing.title)} (#${campaignId})`,
      details: 'Campanha removida permanentemente da página pública.',
    });
  }
  res.json({ success: true });
});

app.get('/api/admin/principal/audit-logs', requireAuth, requirePrincipalAdmin, (_req, res) => {
  const auditRows = db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 150').all();
  res.json({
    auditLogs: auditRows.map((a) => ({
      id: Number(a.id),
      actorId: a.actor_id ? Number(a.actor_id) : null,
      actorName: String(a.actor_name),
      actorRole: String(a.actor_role),
      category: String(a.category),
      action: String(a.action),
      targetLabel: String(a.target_label),
      details: String(a.details || ''),
      createdAt: String(a.created_at),
    })),
  });
});

app.get('/api/admin/principal/audit-logs/export', requireAuth, requirePrincipalAdmin, (req: AuthenticatedRequest, res) => {
  const allRows = db.prepare('SELECT * FROM audit_logs ORDER BY id DESC').all();

  const escapeCsv = (value: unknown) => {
    const str = String(value ?? '').replace(/\r?\n/g, ' ');
    return `"${str.replace(/"/g, '""')}"`;
  };

  const headers = [
    'ID',
    'Timestamp (UTC)',
    'ID do Responsável',
    'Utilizador Responsável',
    'Cargo',
    'Categoria',
    'Ação Realizada',
    'Alvo',
    'Detalhes',
  ];

  const lines = [
    headers.map(escapeCsv).join(','),
    ...allRows.map((row) =>
      [
        Number(row.id),
        String(row.created_at),
        row.actor_id !== null && row.actor_id !== undefined ? Number(row.actor_id) : 'Sistema',
        String(row.actor_name),
        String(row.actor_role),
        String(row.category),
        String(row.action),
        String(row.target_label),
        String(row.details || ''),
      ]
        .map(escapeCsv)
        .join(',')
    ),
  ];

  recordAuditLog({
    actorId: Number(req.authUser!.id),
    actorName: String(req.authUser!.name),
    actorRole: String(req.authUser!.role),
    category: 'Segurança',
    action: 'Exportação de Relatório de Auditoria (CSV)',
    targetLabel: `${allRows.length} registos`,
    details: 'Exportação integral do histórico de atividades em CSV para fins de fiscalização.',
  });

  const csvContent = '\uFEFF' + lines.join('\r\n');
  const dateStamp = new Date().toISOString().slice(0, 10);
  const filename = `nzila-agro-relatorio-auditoria-${dateStamp}.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csvContent);
});

app.get('/api/admin/principal/users/export', requireAuth, requirePrincipalAdmin, (req: AuthenticatedRequest, res) => {
  const allUsers = db
    .prepare(
      `SELECT id, name, email, phone, whatsapp, province, profession, age, role, status, quota_active, quota_expires_at, created_at
       FROM users
       ORDER BY id DESC`
    )
    .all();

  const escapeCsv = (value: unknown) => {
    const str = String(value ?? '').replace(/\r?\n/g, ' ');
    return `"${str.replace(/"/g, '""')}"`;
  };

  const formatWhatsAppLink = (raw: unknown) => {
    const digits = String(raw ?? '').replace(/\D/g, '');
    return digits ? `https://wa.me/${digits}` : '';
  };

  const headers = [
    'ID',
    'Nome Completo',
    'Email',
    'Telefone',
    'WhatsApp',
    'Link WhatsApp',
    'Província',
    'Profissão',
    'Idade',
    'Cargo',
    'Estado da Conta',
    'Cota Ativa',
    'Data de Registo (UTC)',
  ];

  const lines = [
    headers.map(escapeCsv).join(','),
    ...allUsers.map((row) =>
      [
        Number(row.id),
        String(row.name),
        String(row.email),
        String(row.phone),
        String(row.whatsapp),
        formatWhatsAppLink(row.whatsapp || row.phone),
        String(row.province),
        String(row.profession),
        Number(row.age),
        String(row.role),
        String(row.status),
        Number(row.quota_active) === 1 ? 'Sim' : 'Não',
        String(row.created_at),
      ]
        .map(escapeCsv)
        .join(',')
    ),
  ];

  recordAuditLog({
    actorId: Number(req.authUser!.id),
    actorName: String(req.authUser!.name),
    actorRole: String(req.authUser!.role),
    category: 'Utilizadores',
    action: 'Exportação CSV de Utilizadores e Contactos',
    targetLabel: `${allUsers.length} utilizadores`,
    details: 'Lista completa de utilizadores registados (telefone/WhatsApp) exportada para marketing direto.',
  });

  const csvContent = '\uFEFF' + lines.join('\r\n');
  const dateStamp = new Date().toISOString().slice(0, 10);
  const filename = `nzila-agro-utilizadores-contactos-${dateStamp}.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csvContent);
});

app.get('/api/admin/principal/listings/export', requireAuth, requirePrincipalAdmin, (req: AuthenticatedRequest, res) => {
  const allListings = db
    .prepare(
      `SELECT
         l.id,
         l.title,
         l.category,
         l.description,
         l.price_kz,
         l.unit,
         l.province,
         l.is_masked,
         l.created_at,
         u.name AS seller_name,
         u.email AS seller_email,
         u.phone AS seller_phone,
         u.whatsapp AS seller_whatsapp,
         u.profession AS seller_profession,
         u.status AS seller_status
       FROM listings l
       LEFT JOIN users u ON u.id = l.user_id
       ORDER BY l.id DESC`
    )
    .all();

  const escapeCsv = (value: unknown) => {
    const str = String(value ?? '').replace(/\r?\n/g, ' ');
    return `"${str.replace(/"/g, '""')}"`;
  };

  const headers = [
    'ID',
    'Título do Produto / Serviço',
    'Categoria',
    'Descrição',
    'Preço (Kz)',
    'Unidade',
    'Província',
    'Estado da Foto',
    'Produtor / Anunciante',
    'Profissão',
    'Email do Anunciante',
    'Telefone',
    'WhatsApp',
    'Estado da Conta',
    'Data de Publicação (UTC)',
  ];

  const lines = [
    headers.map(escapeCsv).join(','),
    ...allListings.map((row) =>
      [
        Number(row.id),
        String(row.title || ''),
        String(row.category || ''),
        String(row.description || ''),
        Number(row.price_kz || 0),
        String(row.unit || 'Unidade'),
        String(row.province || ''),
        Number(row.is_masked) === 1 ? 'Mascarada' : 'Visível',
        String(row.seller_name || 'N/D'),
        String(row.seller_profession || 'N/D'),
        String(row.seller_email || ''),
        String(row.seller_phone || ''),
        String(row.seller_whatsapp || ''),
        String(row.seller_status || 'N/D'),
        String(row.created_at || ''),
      ]
        .map(escapeCsv)
        .join(',')
    ),
  ];

  recordAuditLog({
    actorId: Number(req.authUser!.id),
    actorName: String(req.authUser!.name),
    actorRole: String(req.authUser!.role),
    category: 'Moderação',
    action: 'Exportação CSV de Inventário de Produtos',
    targetLabel: `${allListings.length} listagens`,
    details: 'Exportação completa das listagens de produtos atuais para análise externa de inventário.',
  });

  const csvContent = '\uFEFF' + lines.join('\r\n');
  const dateStamp = new Date().toISOString().slice(0, 10);
  const filename = `nzila-agro-inventario-produtos-${dateStamp}.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csvContent);
});

app.get('/api/admin/principal/finance/export-xlsx', requireAuth, requirePrincipalAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { buffer, summary } = await buildFinancialReportWorkbook();
    recordAuditLog({
      actorId: Number(req.authUser!.id),
      actorName: String(req.authUser!.name),
      actorRole: String(req.authUser!.role),
      category: 'Financeiro',
      action: 'Exportação Excel (.xlsx) do Relatório Financeiro',
      targetLabel: `${summary.salesCount} vendas • ${summary.donationsCount} doações • ${summary.activeQuotasCount} cotas ativas`,
      details: 'Exportação contabilística em formato Excel (.xlsx) com 5 folhas formatadas (Resumo, Vendas, Doações, Cotas e Bónus).',
    });

    const dateStamp = new Date().toISOString().slice(0, 10);
    const filename = `nzila-agro-relatorio-financeiro-${dateStamp}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    console.error('Erro ao gerar relatório financeiro Excel:', err);
    res.status(500).json({ error: 'Não foi possível gerar o relatório financeiro em formato Excel (.xlsx).' });
  }
});

app.get('/api/admin/principal/listings/export-xlsx', requireAuth, requirePrincipalAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { buffer, summary } = await buildInventoryReportWorkbook();
    recordAuditLog({
      actorId: Number(req.authUser!.id),
      actorName: String(req.authUser!.name),
      actorRole: String(req.authUser!.role),
      category: 'Moderação',
      action: 'Exportação Excel (.xlsx) do Inventário de Produtos',
      targetLabel: `${summary.listingsCount} listagens • ${summary.provincesCount} províncias`,
      details: 'Exportação completa do inventário em formato Excel (.xlsx) com folhas por produto, província e categoria.',
    });

    const dateStamp = new Date().toISOString().slice(0, 10);
    const filename = `nzila-agro-inventario-produtos-${dateStamp}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    console.error('Erro ao gerar inventário Excel:', err);
    res.status(500).json({ error: 'Não foi possível gerar o inventário de produtos em formato Excel (.xlsx).' });
  }
});

app.get('/api/admin/principal/finance/transactions', requireAuth, requirePrincipalAdmin, (req: AuthenticatedRequest, res) => {
  const startDate = typeof req.query.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.startDate)
    ? req.query.startDate
    : '';
  const endDate = typeof req.query.endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.endDate)
    ? req.query.endDate
    : '';
  const userCategory = typeof req.query.userCategory === 'string' ? req.query.userCategory.trim() : 'Todas';
  const txType = typeof req.query.txType === 'string' ? req.query.txType.trim() : 'Todas';

  const roleLabels: Record<string, string> = {
    USER: 'Produtor / Utilizador',
    ADMIN_AUX: 'Administrador Auxiliar',
    ADMIN_PRINCIPAL: 'Administrador Principal',
  };

  const salesRows = db
    .prepare(
      `SELECT
         s.id,
         s.sale_date,
         s.quantity,
         s.total_kz,
         s.note,
         l.title AS listing_title,
         l.province AS listing_province,
         u.name AS user_name,
         u.email AS user_email,
         u.role AS user_role,
         u.profession AS user_profession,
         u.province AS user_province
       FROM listing_sales s
       LEFT JOIN listings l ON l.id = s.listing_id
       LEFT JOIN users u ON u.id = s.seller_id
       ORDER BY s.sale_date DESC, s.id DESC`
    )
    .all() as Record<string, unknown>[];

  const donationRows = db
    .prepare(
      `SELECT id, donor_name, donor_contact, amount, currency, amount_kz, method, reference, message, status, created_at
       FROM donations
       ORDER BY created_at DESC, id DESC`
    )
    .all() as Record<string, unknown>[];

  const bonusRows = db
    .prepare(
      `SELECT
         b.id,
         b.amount_kz,
         b.reason,
         b.granted_by,
         b.created_at,
         u.name AS user_name,
         u.email AS user_email,
         u.role AS user_role,
         u.profession AS user_profession,
         u.province AS user_province
       FROM bonus_logs b
       LEFT JOIN users u ON u.id = b.user_id
       ORDER BY b.created_at DESC, b.id DESC`
    )
    .all() as Record<string, unknown>[];

  const professions = db
    .prepare(`SELECT DISTINCT profession FROM users WHERE profession IS NOT NULL AND TRIM(profession) != '' ORDER BY profession ASC`)
    .all() as Array<{ profession: string }>;

  const unified = [
    ...salesRows.map((row) => {
      const role = String(row.user_role || 'USER');
      const prof = String(row.user_profession || '').trim();
      return {
        id: `sale-${row.id}`,
        txCode: `VND-${String(row.id).padStart(4, '0')}`,
        date: String(row.sale_date || '').slice(0, 10),
        type: 'Venda' as const,
        description: `${String(row.listing_title || 'Produto')} (Qtd: ${Number(row.quantity || 1)})`,
        userName: String(row.user_name || 'N/D'),
        userEmail: String(row.user_email || ''),
        userRole: role,
        userProfession: prof,
        userCategory: prof ? `${roleLabels[role] || role} • ${prof}` : roleLabels[role] || role,
        province: String(row.listing_province || row.user_province || 'N/D'),
        amountKz: Number(row.total_kz || 0),
        originalAmount: Number(row.total_kz || 0),
        currency: 'AOA',
        status: 'Registada',
        reference: String(row.note || ''),
      };
    }),
    ...donationRows.map((row) => ({
      id: `don-${row.id}`,
      txCode: `DOA-${String(row.id).padStart(4, '0')}`,
      date: String(row.created_at || '').slice(0, 10),
      type: 'Doação' as const,
      description: `Doação via ${String(row.method || 'Transferência')}`,
      userName: String(row.donor_name || 'Anónimo'),
      userEmail: String(row.donor_contact || ''),
      userRole: 'EXTERNAL_DONOR',
      userProfession: '',
      userCategory: 'Doador Externo',
      province: 'Nacional',
      amountKz: Number(row.amount_kz || 0),
      originalAmount: Number(row.amount || 0),
      currency: String(row.currency || 'AOA'),
      status: String(row.status || 'Pendente'),
      reference: String(row.reference || row.message || ''),
    })),
    ...bonusRows.map((row) => {
      const role = String(row.user_role || 'USER');
      const prof = String(row.user_profession || '').trim();
      return {
        id: `bon-${row.id}`,
        txCode: `BON-${String(row.id).padStart(4, '0')}`,
        date: String(row.created_at || '').slice(0, 10),
        type: 'Bónus' as const,
        description: String(row.reason || 'Bónus de incentivo'),
        userName: String(row.user_name || 'N/D'),
        userEmail: String(row.user_email || ''),
        userRole: role,
        userProfession: prof,
        userCategory: prof ? `${roleLabels[role] || role} • ${prof}` : roleLabels[role] || role,
        province: String(row.user_province || 'N/D'),
        amountKz: Number(row.amount_kz || 0),
        originalAmount: Number(row.amount_kz || 0),
        currency: 'AOA',
        status: 'Atribuído',
        reference: `Por ${String(row.granted_by || 'Admin Principal')}`,
      };
    }),
  ];

  const filtered = unified
    .filter((tx) => {
      if (startDate && tx.date < startDate) return false;
      if (endDate && tx.date > endDate) return false;
      if (txType !== 'Todas' && tx.type !== txType) return false;
      if (userCategory && userCategory !== 'Todas') {
        if (userCategory.startsWith('ROLE:')) {
          const targetRole = userCategory.slice(5);
          if (tx.userRole !== targetRole) return false;
        } else if (userCategory.startsWith('PROF:')) {
          const targetProf = userCategory.slice(5).toLowerCase();
          if (tx.userProfession.toLowerCase() !== targetProf) return false;
        } else if (tx.userCategory !== userCategory) {
          return false;
        }
      }
      return true;
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  const sales = filtered.filter((t) => t.type === 'Venda');
  const donations = filtered.filter((t) => t.type === 'Doação');
  const bonuses = filtered.filter((t) => t.type === 'Bónus');

  const availableUserCategories = [
    { value: 'Todas', label: 'Todas as Categorias de Utilizador' },
    { value: 'ROLE:USER', label: 'Produtores / Utilizadores' },
    { value: 'ROLE:ADMIN_AUX', label: 'Administradores Auxiliares' },
    { value: 'ROLE:ADMIN_PRINCIPAL', label: 'Administrador Principal' },
    { value: 'ROLE:EXTERNAL_DONOR', label: 'Doadores Externos' },
    ...professions.map((p) => ({
      value: `PROF:${p.profession}`,
      label: `Profissão: ${p.profession}`,
    })),
  ];

  res.json({
    transactions: filtered.map(({ userProfession: _omit, ...rest }) => rest),
    summary: {
      count: filtered.length,
      totalKz: filtered.reduce((acc, t) => acc + t.amountKz, 0),
      salesCount: sales.length,
      salesKz: sales.reduce((acc, t) => acc + t.amountKz, 0),
      donationsCount: donations.length,
      donationsKz: donations.reduce((acc, t) => acc + t.amountKz, 0),
      bonusCount: bonuses.length,
      bonusKz: bonuses.reduce((acc, t) => acc + t.amountKz, 0),
    },
    availableUserCategories,
  });
});

app.post('/api/admin/principal/finance/transactions/export-audit', requireAuth, requirePrincipalAdmin, (req: AuthenticatedRequest, res) => {
  const { startDate, endDate, userCategory, txType, exportedCount, totalKz, filename } = req.body || {};
  recordAuditLog({
    actorId: Number(req.authUser!.id),
    actorName: String(req.authUser!.name),
    actorRole: String(req.authUser!.role),
    category: 'Financeiro',
    action: 'Exportação Excel (.xlsx) de Transações Filtradas',
    targetLabel: `${Number(exportedCount || 0)} transações • ${Number(totalKz || 0).toLocaleString('pt-PT')} AOA`,
    details: `Ficheiro: ${String(filename || 'transacoes.xlsx')} | Período: ${startDate || 'Início'} a ${endDate || 'Hoje'} | Categoria: ${String(userCategory || 'Todas')} | Tipo: ${String(txType || 'Todas')}`,
  });
  res.json({ ok: true });
});

// ---------- CLIENT ERROR BOUNDARY REPORTING & PRINCIPAL DEBUG CONSOLE ----------

app.post('/api/client-errors', (req, res) => {
  const {
    boundaryName,
    errorName,
    errorMessage,
    errorStack,
    componentStack,
    pageUrl,
    userAgent,
  } = req.body ?? {};

  const message = String(errorMessage || '').trim().slice(0, 1000);
  if (!message) {
    res.status(400).json({ error: 'Mensagem de erro obrigatória.' });
    return;
  }

  let userId: number | null = null;
  let userName = 'Visitante';
  let userEmail = '';
  let userRole = 'ANON';

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const payload = verifyToken(authHeader.slice('Bearer '.length).trim());
    if (payload) {
      const userRow = db
        .prepare('SELECT id, name, email, role FROM users WHERE id = ?')
        .get(payload.userId) as Record<string, unknown> | undefined;
      if (userRow) {
        userId = Number(userRow.id);
        userName = String(userRow.name || 'Utilizador');
        userEmail = String(userRow.email || '');
        userRole = String(userRow.role || 'USER');
      }
    }
  }

  const info = db
    .prepare(
      `INSERT INTO client_error_reports (
         user_id, user_name, user_email, user_role,
         boundary_name, error_name, error_message,
         error_stack, component_stack, page_url, user_agent
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      userId,
      userName,
      userEmail,
      userRole,
      String(boundaryName || 'Aplicação Global').trim().slice(0, 120),
      String(errorName || 'Error').trim().slice(0, 120),
      message,
      String(errorStack || '').slice(0, 8000),
      String(componentStack || '').slice(0, 8000),
      String(pageUrl || '').slice(0, 500),
      String(userAgent || req.headers['user-agent'] || '').slice(0, 400)
    );

  res.status(201).json({ success: true, id: Number(info.lastInsertRowid) });
});

app.get('/api/admin/principal/error-reports', requireAuth, requirePrincipalAdmin, (req, res) => {
  const statusFilter = String(req.query.status || '').trim();
  const boundaryFilter = String(req.query.boundary || '').trim();

  const whereClauses: string[] = [];
  const params: Array<string> = [];

  if (statusFilter === 'Aberto' || statusFilter === 'Resolvido') {
    whereClauses.push('status = ?');
    params.push(statusFilter);
  }
  if (boundaryFilter && boundaryFilter !== 'Todas') {
    whereClauses.push('boundary_name = ?');
    params.push(boundaryFilter);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
  const rows = db
    .prepare(`SELECT * FROM client_error_reports ${whereSql} ORDER BY id DESC LIMIT 200`)
    .all(...params) as Array<Record<string, unknown>>;

  const countScalar = (sql: string): number => {
    const row = db.prepare(sql).get() as { val?: number } | undefined;
    return Number(row?.val || 0);
  };

  res.json({
    summary: {
      total: countScalar('SELECT COUNT(*) as val FROM client_error_reports'),
      openCount: countScalar("SELECT COUNT(*) as val FROM client_error_reports WHERE status = 'Aberto'"),
      resolvedCount: countScalar("SELECT COUNT(*) as val FROM client_error_reports WHERE status = 'Resolvido'"),
      last24hCount: countScalar(
        "SELECT COUNT(*) as val FROM client_error_reports WHERE datetime(created_at) >= datetime('now', '-1 day')"
      ),
    },
    reports: rows.map((r) => ({
      id: Number(r.id),
      userId: r.user_id !== null && r.user_id !== undefined ? Number(r.user_id) : null,
      userName: String(r.user_name || 'Visitante'),
      userEmail: String(r.user_email || ''),
      userRole: String(r.user_role || 'ANON'),
      boundaryName: String(r.boundary_name || 'Aplicação Global'),
      errorName: String(r.error_name || 'Error'),
      errorMessage: String(r.error_message || ''),
      errorStack: String(r.error_stack || ''),
      componentStack: String(r.component_stack || ''),
      pageUrl: String(r.page_url || ''),
      userAgent: String(r.user_agent || ''),
      status: String(r.status || 'Aberto') as 'Aberto' | 'Resolvido',
      resolvedBy: r.resolved_by ? String(r.resolved_by) : null,
      resolvedAt: r.resolved_at ? String(r.resolved_at) : null,
      createdAt: String(r.created_at),
    })),
  });
});

app.put('/api/admin/principal/error-reports/:id/status', requireAuth, requirePrincipalAdmin, (req: AuthenticatedRequest, res) => {
  const reportId = Number(req.params.id);
  const { status } = req.body ?? {};
  if (status !== 'Aberto' && status !== 'Resolvido') {
    res.status(400).json({ error: 'Estado inválido. Use Aberto ou Resolvido.' });
    return;
  }

  const existing = db.prepare('SELECT id, error_message, boundary_name FROM client_error_reports WHERE id = ?').get(reportId);
  if (!existing) {
    res.status(404).json({ error: 'Registo de erro não encontrado.' });
    return;
  }

  if (status === 'Resolvido') {
    db.prepare(
      "UPDATE client_error_reports SET status = 'Resolvido', resolved_by = ?, resolved_at = datetime('now') WHERE id = ?"
    ).run(String(req.authUser!.name), reportId);
  } else {
    db.prepare(
      "UPDATE client_error_reports SET status = 'Aberto', resolved_by = NULL, resolved_at = NULL WHERE id = ?"
    ).run(reportId);
  }

  recordAuditLog({
    actorId: Number(req.authUser!.id),
    actorName: String(req.authUser!.name),
    actorRole: String(req.authUser!.role),
    category: 'Sistema',
    action: `Relatório de Erro Marcado como ${status}`,
    targetLabel: `Erro #${reportId} (${String(existing.boundary_name)})`,
    details: String(existing.error_message).slice(0, 140),
  });

  res.json({ success: true });
});

app.delete('/api/admin/principal/error-reports/:id', requireAuth, requirePrincipalAdmin, (req: AuthenticatedRequest, res) => {
  const reportId = Number(req.params.id);
  const existing = db.prepare('SELECT id FROM client_error_reports WHERE id = ?').get(reportId);
  if (!existing) {
    res.status(404).json({ error: 'Registo de erro não encontrado.' });
    return;
  }
  db.prepare('DELETE FROM client_error_reports WHERE id = ?').run(reportId);
  res.json({ success: true });
});

app.delete('/api/admin/principal/error-reports', requireAuth, requirePrincipalAdmin, (req: AuthenticatedRequest, res) => {
  const scope = String(req.query.scope || 'resolved');
  if (scope === 'all') {
    db.prepare('DELETE FROM client_error_reports').run();
  } else {
    db.prepare("DELETE FROM client_error_reports WHERE status = 'Resolvido'").run();
  }

  recordAuditLog({
    actorId: Number(req.authUser!.id),
    actorName: String(req.authUser!.name),
    actorRole: String(req.authUser!.role),
    category: 'Sistema',
    action: scope === 'all' ? 'Relatório de Erros Limpo (Todos)' : 'Erros Resolvidos Removidos',
    targetLabel: 'Relatório de Erros',
    details: `Limpeza executada com âmbito: ${scope}`,
  });

  res.json({ success: true });
});

app.get('/api/admin/principal/backups', requireAuth, requirePrincipalAdmin, (_req, res) => {
  res.json(getBackupStatus());
});

app.get('/api/admin/principal/backups/cloud-migration-status', requireAuth, requirePrincipalAdmin, (_req, res) => {
  res.json(getCloudMigrationStatus());
});

app.get('/api/admin/principal/backups/export-postgres-sql', requireAuth, requirePrincipalAdmin, (req: AuthenticatedRequest, res) => {
  const result = buildPostgresMigrationSql();
  recordAuditLog({
    actorId: Number(req.authUser!.id),
    actorName: String(req.authUser!.name),
    actorRole: String(req.authUser!.role),
    category: 'Segurança',
    action: 'Exportação de Script de Migração PostgreSQL / Cloud SQL',
    targetLabel: result.filename,
    details: `${result.tablesCount} tabelas · ${result.rowsCount} registos exportados em formato .sql compatível com PostgreSQL/Cloud SQL.`,
  });
  res.setHeader('Content-Type', 'application/sql; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
  res.send(result.sql);
});

app.get('/api/admin/principal/multicaixa-settings', requireAuth, requirePrincipalAdmin, (_req, res) => {
  res.json({ settings: getPublicMulticaixaGatewaySettings() });
});

app.put('/api/admin/principal/multicaixa-settings', requireAuth, requirePrincipalAdmin, (req: AuthenticatedRequest, res) => {
  const updated = updateMulticaixaGatewaySettings(req.body || {});
  recordAuditLog({
    actorId: Number(req.authUser!.id),
    actorName: String(req.authUser!.name),
    actorRole: String(req.authUser!.role),
    category: 'Financeiro',
    action: 'Configuração de Credenciais Referência Multicaixa',
    targetLabel: `Entidade ${updated.entityCode} (${updated.provider.toUpperCase()})`,
    details: `Ambiente: ${updated.environment} · Validade: ${updated.referenceValidityHours}h · Estado: ${updated.enabled ? 'Ativo' : 'Inativo'}.`,
  });
  res.json({ settings: updated });
});

app.get('/api/admin/principal/payment-orders', requireAuth, requirePrincipalAdmin, (_req, res) => {
  const rows = db
    .prepare(`
      SELECT po.*, u.name as user_name, u.email as user_email, u.phone as user_phone,
             sp.name as plan_name, l.title as listing_title
      FROM payment_orders po
      JOIN users u ON po.user_id = u.id
      LEFT JOIN subscription_plans sp ON po.plan_code = sp.code
      LEFT JOIN listings l ON po.listing_id = l.id
      ORDER BY CASE WHEN po.status = 'Comprovativo Enviado' THEN 0 WHEN po.status = 'Aguardando Pagamento' THEN 1 ELSE 2 END, po.id DESC
      LIMIT 100
    `)
    .all() as Array<Record<string, unknown>>;

  res.json({ orders: rows.map(formatPaymentOrderRow) });
});

app.put('/api/admin/principal/payment-orders/:id/review', requireAuth, requirePrincipalAdmin, (req: AuthenticatedRequest, res) => {
  const orderId = Number(req.params.id);
  const { decision, adminNotes } = req.body ?? {};
  if (decision !== 'approve' && decision !== 'reject') {
    res.status(400).json({ error: 'Decisão inválida. Utilize "approve" ou "reject".' });
    return;
  }

  const order = db
    .prepare('SELECT * FROM payment_orders WHERE id = ?')
    .get(orderId) as Record<string, unknown> | undefined;
  if (!order) {
    res.status(404).json({ error: 'Ordem de pagamento não encontrada.' });
    return;
  }
  if (String(order.status) === 'Aprovado') {
    res.status(400).json({ error: 'Esta ordem já foi aprovada anteriormente.' });
    return;
  }

  const reviewerName = String(req.authUser!.name);
  const nextStatus = decision === 'approve' ? 'Aprovado' : 'Rejeitado';

  db.prepare(`
    UPDATE payment_orders
    SET status = ?, admin_notes = ?, reviewed_by = ?, reviewed_at = datetime('now')
    WHERE id = ?
  `).run(nextStatus, String(adminNotes || '').trim(), reviewerName, orderId);

  const targetUserId = Number(order.user_id);
  let activationDetail = '';

  if (decision === 'approve') {
    if (String(order.order_type) === 'subscription' && order.plan_code) {
      const plan = db
        .prepare('SELECT * FROM subscription_plans WHERE code = ?')
        .get(String(order.plan_code)) as Record<string, unknown> | undefined;
      const durationDays = Number(plan?.duration_days || 30);
      const creditsToAdd = Number(plan?.featured_credits || 1);
      const targetUser = db
        .prepare('SELECT quota_expires_at FROM users WHERE id = ?')
        .get(targetUserId) as { quota_expires_at?: string | null } | undefined;

      const currentExp = targetUser?.quota_expires_at ? new Date(targetUser.quota_expires_at).getTime() : 0;
      const baseMs = currentExp > Date.now() ? currentExp : Date.now();
      const nextExpiry = new Date(baseMs + durationDays * 24 * 60 * 60 * 1000).toISOString();

      db.prepare(`
        UPDATE users
        SET quota_active = 1,
            quota_expires_at = ?,
            subscription_plan = ?,
            featured_credits = COALESCE(featured_credits, 0) + ?
        WHERE id = ?
      `).run(nextExpiry, String(order.plan_code), creditsToAdd, targetUserId);

      activationDetail = `Plano ${String(plan?.name || order.plan_code)} ativado por ${durationDays} dias (+${creditsToAdd} créditos de destaque).`;
    } else if (String(order.order_type) === 'featured_boost' && order.listing_id) {
      const featuredUntil = new Date(Date.now() + FEATURED_BOOST_DAYS * 24 * 60 * 60 * 1000).toISOString();
      db.prepare('UPDATE listings SET is_featured = 1, featured_until = ? WHERE id = ?').run(
        featuredUntil,
        Number(order.listing_id)
      );
      activationDetail = `Anúncio #${order.listing_id} colocado em Destaque por ${FEATURED_BOOST_DAYS} dias.`;
    }

    db.prepare(`INSERT INTO notifications (user_id, type, title, message) VALUES (?, 'info', ?, ?)`).run(
      targetUserId,
      'Pagamento Multicaixa / IBAN Confirmado',
      `A referência ${order.reference_code} (${Number(order.amount_kz).toLocaleString('pt-AO')} Kz) foi aprovada. ${activationDetail}`
    );
  } else {
    db.prepare(`INSERT INTO notifications (user_id, type, title, message) VALUES (?, 'info', ?, ?)`).run(
      targetUserId,
      'Comprovativo de Pagamento Recusado',
      `O comprovativo da referência ${order.reference_code} não foi validado.${adminNotes ? ` Motivo: ${adminNotes}` : ' Por favor, envie um novo comprovativo legível.'}`
    );
  }

  recordAuditLog({
    actorId: Number(req.authUser!.id),
    actorName: reviewerName,
    actorRole: String(req.authUser!.role),
    category: 'Financeiro',
    action: decision === 'approve' ? 'Aprovação de Pagamento Multicaixa / IBAN' : 'Rejeição de Comprovativo de Pagamento',
    targetLabel: `Ref. ${order.reference_code} (${Number(order.amount_kz).toLocaleString('pt-AO')} Kz)`,
    details: activationDetail || String(adminNotes || 'Sem observações adicionais.'),
  });

  res.json({ success: true, status: nextStatus, detail: activationDetail });
});

app.get('/api/admin/principal/system-health', requireAuth, requirePrincipalAdmin, (_req, res) => {
  res.json(getSystemHealthSnapshot());
});

app.get('/api/admin/principal/system-health/history-24h', requireAuth, requirePrincipalAdmin, (req, res) => {
  const hoursParam = Number(req.query.hours ?? 24);
  const hours = Number.isFinite(hoursParam) ? hoursParam : 24;
  res.json(getServerMetricHistory(hours));
});

app.get('/api/admin/principal/critical-alerts', requireAuth, requirePrincipalAdmin, (_req, res) => {
  res.json({
    settings: getCriticalAlertSettings(),
    logs: getCriticalAlertLogs(),
    breachState: getMonitorBreachState(),
  });
});

app.put('/api/admin/principal/critical-alerts/settings', requireAuth, requirePrincipalAdmin, (req: AuthenticatedRequest, res) => {
  const updated = updateCriticalAlertSettings(req.body || {});
  recordAuditLog({
    actorId: Number(req.authUser!.id),
    actorName: String(req.authUser!.name),
    actorRole: String(req.authUser!.role),
    category: 'Segurança',
    action: 'Configuração de Notificações Críticas do Servidor',
    targetLabel: `CPU ≥ ${updated.cpuThresholdPct}% | RAM ≥ ${updated.memoryThresholdPct}%`,
    details: `Estado: ${updated.enabled ? 'Ativo' : 'Desativado'} | Duração contínua: ${updated.durationMinutes} min | Cooldown: ${updated.cooldownMinutes} min.`,
  });
  res.json({
    settings: updated,
    logs: getCriticalAlertLogs(),
    breachState: getMonitorBreachState(),
  });
});

app.post('/api/admin/principal/critical-alerts/test', requireAuth, requirePrincipalAdmin, async (_req, res) => {
  try {
    const result = await sendTestCriticalAlert();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao enviar alerta crítico de teste.' });
  }
});

app.get('/api/admin/principal/sms-gateway', requireAuth, requirePrincipalAdmin, (_req, res) => {
  res.json({
    settings: getPublicSmsGatewaySettings(),
    logs: getSmsDeliveryLogs(),
  });
});

app.put('/api/admin/principal/sms-gateway', requireAuth, requirePrincipalAdmin, (req: AuthenticatedRequest, res) => {
  const updated = updateSmsGatewaySettings(req.body || {});
  recordAuditLog({
    actorId: Number(req.authUser!.id),
    actorName: String(req.authUser!.name),
    actorRole: String(req.authUser!.role),
    category: 'Segurança',
    action: 'Configuração de Gateway SMS',
    targetLabel: `${updated.provider.toUpperCase()} • ${updated.recipientPhone || updated.defaultAdminPhone || 'Sem número'}`,
    details: `Estado: ${updated.enabled ? 'Ativo' : 'Desativado'} | Remetente: ${updated.senderId}`,
  });
  res.json({
    settings: updated,
    logs: getSmsDeliveryLogs(),
  });
});

app.post('/api/admin/principal/sms-gateway/test', requireAuth, requirePrincipalAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const result = await sendCriticalSmsAlert({
      message: '[Nzila Agro] Teste de integração do Gateway SMS para alertas críticos de CPU/Memória.',
      forceAttempt: true,
    });
    recordAuditLog({
      actorId: Number(req.authUser!.id),
      actorName: String(req.authUser!.name),
      actorRole: String(req.authUser!.role),
      category: 'Segurança',
      action: 'Envio de SMS de Teste',
      targetLabel: result.recipientPhone || 'N/D',
      details: `${result.provider.toUpperCase()} | ${result.summary}`,
    });
    res.json({
      result,
      settings: getPublicSmsGatewaySettings(),
      logs: getSmsDeliveryLogs(),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao enviar SMS de teste.' });
  }
});

app.put('/api/admin/principal/backups/schedule', requireAuth, requirePrincipalAdmin, (req: AuthenticatedRequest, res) => {
  try {
    const updated = updateBackupScheduleConfig(req.body || {});
    recordAuditLog({
      actorId: Number(req.authUser!.id),
      actorName: String(req.authUser!.name),
      actorRole: String(req.authUser!.role),
      category: 'Segurança',
      action: 'Configuração de Agendamento e Email de Backups',
      targetLabel: updated.cronExpression,
      details: `${updated.cronDescription} | Retenção: ${updated.schedule.retentionLimit} dumps | Relatório Email: ${updated.schedule.emailReportEnabled ? `${updated.schedule.emailProvider.toUpperCase()} (${updated.schedule.emailRecipient || updated.schedule.defaultAdminEmail})` : 'Desativado'}.`,
    });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Erro ao atualizar agendamento de backups.' });
  }
});

app.post('/api/admin/principal/backups/email-test', requireAuth, requirePrincipalAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const data = await sendTestBackupEmailReport();
    recordAuditLog({
      actorId: Number(req.authUser!.id),
      actorName: String(req.authUser!.name),
      actorRole: String(req.authUser!.role),
      category: 'Segurança',
      action: 'Teste de Envio de Relatório de Backup por Email',
      targetLabel: data.result.recipientEmail || 'N/D',
      details: `${data.result.provider.toUpperCase()} | ${data.result.summary}`,
    });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao enviar teste de relatório por email.' });
  }
});

app.post('/api/admin/principal/backups/manual', requireAuth, requirePrincipalAdmin, (req: AuthenticatedRequest, res) => {
  const snapshot = createJsonBackup('manual');
  recordAuditLog({
    actorId: Number(req.authUser!.id),
    actorName: String(req.authUser!.name),
    actorRole: String(req.authUser!.role),
    category: 'Sistema',
    action: 'Backup Manual Exportado',
    targetLabel: snapshot.filename,
    details: `Tamanho: ${(snapshot.sizeBytes / 1024).toFixed(1)} KB`,
  });
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${snapshot.filename}"`);
  res.send(snapshot.content);
});

app.get('/api/admin/principal/backups/download', requireAuth, requirePrincipalAdmin, (req, res) => {
  const backupId = req.query.id ? Number(req.query.id) : undefined;
  const result = consumeWeeklyBackupDownload(backupId);

  if (!result.allowed || !result.content || !result.filename) {
    res.status(429).json({
      error: result.error || 'Descarga semanal indisponível no momento.',
      nextDownloadAvailableAt: result.nextDownloadAvailableAt || null,
    });
    return;
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
  res.send(result.content);
});

app.get('/api/admin/principal/backups/latest-auto', requireAuth, requirePrincipalAdmin, (req: AuthenticatedRequest, res) => {
  const file = getLatestAutomaticBackupFile();
  recordAuditLog({
    actorId: Number(req.authUser!.id),
    actorName: String(req.authUser!.name),
    actorRole: String(req.authUser!.role),
    category: 'Sistema',
    action: 'Download Direto do Dump Automático (Segunda-feira 00:00)',
    targetLabel: file.filename,
    details: 'Descarga direta do último dump JSON gerado pelo cron job de segunda-feira às 00:00.',
  });
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
  res.send(file.content);
});

app.get('/api/admin/principal/backups/:id/file', requireAuth, requirePrincipalAdmin, (req, res) => {
  const backupId = Number(req.params.id);
  const file = getBackupFileById(backupId);
  if (!file) {
    res.status(404).json({ error: 'Ficheiro de dump JSON não encontrado.' });
    return;
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
  res.send(file.content);
});

// ---------- VITE / STATIC SERVING ----------

async function startServer() {
  startWeeklyBackupScheduler();
  startSystemAlertMonitor();

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Nzila Agro server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
