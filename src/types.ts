export type UserRole = 'ADMIN_PRINCIPAL' | 'ADMIN_AUXILIAR' | 'USER';
export type UserStatus = 'Pendente' | 'Ativo' | 'Suspenso';
export type ListingCategory = 'Produto Agrícola' | 'Consultoria/Formação';
export type CurrencyCode = 'AOA' | 'USD' | 'EUR' | 'GBP';

export type AuxAdminPermission =
  | 'moderate_listings'
  | 'moderate_users'
  | 'reply_support'
  | 'manage_quotas'
  | 'manage_donations'
  | 'manage_bonuses'
  | 'view_analytics'
  | 'manage_campaigns';

export interface User {
  id: number;
  email: string;
  name: string;
  age: number;
  province: string;
  profession: string;
  phone: string;
  whatsapp: string;
  profilePhoto: string;
  verificationVideo?: string;
  role: UserRole;
  accessProfile?: string;
  permissions?: AuxAdminPermission[];
  status: UserStatus;
  quotaActive: boolean;
  quotaExpiresAt: string | null;
  subscriptionPlan?: string;
  featuredCredits?: number;
  bonusKz: number;
  activeSeconds: number;
  lastActiveAt: string | null;
  createdAt: string;
}

export interface Listing {
  id: number;
  userId: number;
  category: ListingCategory;
  title: string;
  description: string;
  priceKz: number;
  unit: string;
  province: string;
  imageUrl: string;
  isMasked: boolean;
  isFeatured?: boolean;
  featuredUntil?: string | null;
  createdAt: string;
  sellerName?: string;
  sellerProvince?: string;
  sellerPhone?: string;
  sellerWhatsapp?: string;
  sellerPhoto?: string;
  sellerStatus?: UserStatus;
  sellerQuotaActive?: boolean;
  isBlurred?: boolean;
}

export interface FinancialSettings {
  officialWhatsapp: string;
  officialIban: string;
  officialExpress: string;
  officialAccountNumber: string;
  officialAccountHolder: string;
  rateUsdToKz: number;
  rateEurToKz: number;
  rateGbpToKz: number;
  quotaValueKz: number;
  quotaValueUsd: number;
  quotaValueEur: number;
  quotaValueGbp: number;
  updatedAt: string;
}

export interface Campaign {
  id: number;
  title: string;
  subtitle: string;
  imageUrl: string;
  ctaLabel: string;
  ctaUrl: string;
  isActive: boolean;
  createdAt: string;
}

export interface RecoveryRequest {
  id: number;
  userId: number;
  userName: string;
  userEmail: string;
  userPhone: string;
  userProvince: string;
  originalPhoto: string;
  originalVideo: string;
  recoveryVideo: string;
  status: 'Pendente' | 'Aprovado' | 'Rejeitado';
  adminNotes: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export interface SupportMessage {
  id: number;
  userId: number;
  userName: string;
  userEmail: string;
  subject: string;
  message: string;
  adminReply: string | null;
  repliedBy: string | null;
  status: 'Aberto' | 'Respondido';
  createdAt: string;
  repliedAt: string | null;
}

export interface Donation {
  id: number;
  donorName: string;
  donorContact: string;
  amount: number;
  currency: CurrencyCode;
  amountKz: number;
  method: 'IBAN' | 'Express' | 'Conta' | 'WhatsApp';
  reference: string;
  message: string;
  status: 'Pendente' | 'Confirmada' | 'Arquivada';
  createdAt: string;
}

export interface BonusLog {
  id: number;
  userId: number;
  userName: string;
  amountKz: number;
  reason: string;
  grantedBy: string;
  createdAt: string;
}

export interface AppNotification {
  id: number;
  userId: number;
  type: 'account_approved' | 'recovery_approved' | 'recovery_rejected' | 'info';
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface MonthlyMetric {
  monthKey: string;
  monthLabel: string;
  inquiries: number;
  salesCount: number;
  salesVolumeKz: number;
}

export interface UserSale {
  id: number;
  listingId: number;
  listingTitle: string;
  quantity: number;
  totalKz: number;
  saleDate: string;
  note: string;
  createdAt: string;
}

export interface UserAnalyticsResponse {
  months: MonthlyMetric[];
  totals: {
    inquiries: number;
    salesCount: number;
    salesVolumeKz: number;
  };
  recentSales: UserSale[];
}

export interface BackupRecord {
  id: number;
  filename: string;
  sizeBytes: number;
  triggerType: string;
  recordsSummary: Record<string, number>;
  createdAt: string;
  lastDownloadedAt: string | null;
}

export type TransactionalEmailProvider = 'smtp' | 'resend' | 'sendgrid' | 'brevo';

export interface BackupScheduleConfig {
  enabled: boolean;
  frequency: 'daily' | 'weekly' | 'monthly';
  dayOfWeek: number;
  dayOfMonth: number;
  hour: number;
  minute: number;
  retentionLimit: number;
  emailReportEnabled: boolean;
  emailProvider: TransactionalEmailProvider;
  hasEmailApiKey: boolean;
  emailFrom: string;
  emailRecipient: string;
  defaultAdminEmail: string;
  attachJsonDump: boolean;
  updatedAt?: string;
}

export interface BackupEmailLog {
  id: number;
  provider: string;
  recipientEmail: string;
  backupFilename: string;
  success: boolean;
  summary: string;
  createdAt: string;
}

export interface BackupStatusResponse {
  backups: BackupRecord[];
  canDownloadNow: boolean;
  lastDownloadAt: string | null;
  nextDownloadAvailableAt: string | null;
  nextScheduledBackupAt: string | null;
  cronExpression: string;
  cronDescription: string;
  schedule: BackupScheduleConfig;
  emailLogs: BackupEmailLog[];
}

export interface AuditLog {
  id: number;
  actorId: number | null;
  actorName: string;
  actorRole: string;
  category: 'Aprovação' | 'Financeiro' | 'Segurança' | 'Utilizadores' | 'Moderação' | 'Sistema';
  action: string;
  targetLabel: string;
  details: string;
  createdAt: string;
}

export interface MarketPriceMonthPoint {
  monthKey: string;
  monthLabel: string;
  produtoAgricolaAvgKz: number;
  produtoAgricolaCount: number;
  consultoriaAvgKz: number;
  consultoriaCount: number;
  overallAvgKz: number;
  totalCount: number;
}

export interface ProvincePriceSummary {
  province: string;
  listingsCount: number;
  avgPriceKz: number;
  minPriceKz: number;
  maxPriceKz: number;
}

export interface MarketPriceAnalyticsResponse {
  province: string;
  months: MarketPriceMonthPoint[];
  summary: {
    totalListings: number;
    overallAvgKz: number;
    produtoAgricolaAvgKz: number;
    produtoAgricolaCount: number;
    produtoAgricolaTrendPct: number | null;
    consultoriaAvgKz: number;
    consultoriaCount: number;
    consultoriaTrendPct: number | null;
  };
  byProvince: ProvincePriceSummary[];
}

export interface SmtpSettings {
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

export type WebhookEventKey =
  | 'user.registered'
  | 'user.approved'
  | 'sale.created'
  | 'listing.created'
  | 'recovery.requested'
  | 'donation.created';

export interface WebhookConfig {
  id: number;
  name: string;
  url: string;
  hasSecret: boolean;
  events: WebhookEventKey[];
  isActive: boolean;
  lastStatusCode: number | null;
  lastTriggeredAt: string | null;
  createdAt: string;
}

export interface WebhookDeliveryLog {
  id: number;
  webhookId: number;
  webhookName: string;
  eventType: string;
  targetUrl: string;
  statusCode: number | null;
  success: boolean;
  errorMessage: string;
  durationMs: number;
  createdAt: string;
}

export interface ClientErrorReport {
  id: number;
  userId: number | null;
  userName: string;
  userEmail: string;
  userRole: string;
  boundaryName: string;
  errorName: string;
  errorMessage: string;
  errorStack: string;
  componentStack: string;
  pageUrl: string;
  userAgent: string;
  status: 'Aberto' | 'Resolvido';
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface ClientErrorReportsResponse {
  summary: {
    total: number;
    openCount: number;
    resolvedCount: number;
    last24hCount: number;
  };
  reports: ClientErrorReport[];
}

export interface SubscriptionPlan {
  code: string;
  name: string;
  description: string;
  priceKz: number;
  durationDays: number;
  featuredCredits: number;
  badgeLabel: string;
  features: string[];
  isPopular: boolean;
}

export interface PaymentOrder {
  id: number;
  userId: number;
  userName?: string;
  userEmail?: string;
  userPhone?: string;
  orderType: 'subscription' | 'featured_boost';
  planCode: string | null;
  planName: string | null;
  listingId: number | null;
  listingTitle: string | null;
  amountKz: number;
  paymentMethod: 'multicaixa_ref' | 'iban_transfer' | 'multicaixa_express';
  entityCode: string;
  referenceCode: string;
  status: 'Aguardando Pagamento' | 'Comprovativo Enviado' | 'Aprovado' | 'Rejeitado';
  proofFileUrl: string | null;
  proofNotes: string | null;
  adminNotes: string | null;
  expiresAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface CloudMigrationStatus {
  currentEngine: string;
  targetEngine: string;
  sqliteFileSizeBytes: number;
  totalTables: number;
  totalRows: number;
  hasDatabaseUrlEnv: boolean;
  tables: Array<{ tableName: string; rowCount: number }>;
  checklist: Array<{
    key: string;
    label: string;
    ready: boolean;
    detail: string;
  }>;
}

export type MulticaixaProvider = 'proxypay' | 'appypay' | 'emis_gpo' | 'manual';

export interface MulticaixaGatewaySettings {
  enabled: boolean;
  provider: MulticaixaProvider;
  environment: 'sandbox' | 'production';
  entityCode: string;
  hasApiKey: boolean;
  hasWebhookSecret: boolean;
  endpointUrl: string;
  referenceValidityHours: number;
  autoConfirmWebhook: boolean;
  updatedAt?: string;
}









