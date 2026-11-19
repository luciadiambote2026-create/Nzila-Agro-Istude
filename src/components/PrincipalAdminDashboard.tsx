import React, { useEffect, useMemo, useState } from 'react';
import {
  Award,
  Bug,
  CheckCircle2,
  ClipboardList,
  Clock,
  Coins,
  Compass,
  Database,
  Download,
  FileSpreadsheet,
  Flame,
  HeartHandshake,
  KeyRound,
  Mail,
  Megaphone,
  Printer,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  TrendingUp,
  UserCheck,
  UserCog,
  Webhook,
  XCircle,
} from 'lucide-react';
import { apiRequest, formatActiveDuration, formatCurrency, getStoredToken } from '../lib/api';
import type {
  AuditLog,
  BackupStatusResponse,
  BonusLog,
  Campaign,
  Donation,
  FinancialSettings,
  RecoveryRequest,
  User,
} from '../types';
import { AccessControlPanel } from './AccessControlPanel';
import { AdminPaymentValidationPanel } from './AdminPaymentValidationPanel';
import { AuxAdminDashboard } from './AuxAdminDashboard';
import { ErrorReportsPanel } from './ErrorReportsPanel';
import { ExecutiveSummaryPanel } from './ExecutiveSummaryPanel';
import { FinancialTransactionsExportCard } from './FinancialTransactionsExportCard';
import { MarketPriceAnalyticsPanel } from './MarketPriceAnalyticsPanel';
import { MulticaixaSettingsCard } from './MulticaixaSettingsCard';
import { AngolaProvinceActivityHeatmap } from './AngolaProvinceActivityHeatmap';
import { SecurityBackupsPanel } from './SecurityBackupsPanel';
import { SmtpSettingsPanel } from './SmtpSettingsPanel';
import { WebhooksPanel } from './WebhooksPanel';
import { syncPersistedUsersFromAdmin } from '../lib/localAuthStore';

interface PrincipalAdminDashboardProps {
  onDataChanged: () => void;
  onReplayTour?: () => void;
}

interface PrincipalOverview {
  counters: {
    pendingRegistrations: number;
    pendingRecoveries: number;
    inactiveQuotas: number;
    openSupport: number;
  };
  users: User[];
  recoveryRequests: RecoveryRequest[];
  donations: Donation[];
  bonusLogs: BonusLog[];
  campaigns: Campaign[];
  settings: FinancialSettings;
  auditLogs: AuditLog[];
}

export const PrincipalAdminDashboard: React.FC<PrincipalAdminDashboardProps> = ({
  onDataChanged,
  onReplayTour,
}) => {
  const [tab, setTab] = useState<
    'videos' | 'recoveries' | 'access' | 'finance' | 'smtp' | 'webhooks' | 'market' | 'heatmap' | 'executive' | 'quotas' | 'usage' | 'donations' | 'campaigns' | 'backups' | 'audit' | 'errors' | 'moderation'
  >('videos');
  const [data, setData] = useState<PrincipalOverview | null>(null);
  const [backupStatus, setBackupStatus] = useState<BackupStatusResponse | null>(null);
  const [downloadingBackup, setDownloadingBackup] = useState(false);
  const [auditCategory, setAuditCategory] = useState<'Todas' | AuditLog['category']>('Todas');
  const [auditSearch, setAuditSearch] = useState('');
  const [exportingAudit, setExportingAudit] = useState(false);
  const [exportingUsers, setExportingUsers] = useState(false);
  const [exportingListings, setExportingListings] = useState(false);
  const [exportingFinanceXlsx, setExportingFinanceXlsx] = useState(false);
  const [exportingListingsXlsx, setExportingListingsXlsx] = useState(false);
  const [showMarketPreview, setShowMarketPreview] = useState(true);
  const [confirmDeleteUserId, setConfirmDeleteUserId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Financial form state
  const [settingsForm, setSettingsForm] = useState<FinancialSettings | null>(null);

  // Quota & Bonus state
  const [quotaDaysMap, setQuotaDaysMap] = useState<Record<number, string>>({});
  const [bonusUserId, setBonusUserId] = useState<string>('');
  const [bonusAmount, setBonusAmount] = useState<string>('2500');
  const [bonusReason, setBonusReason] = useState<string>('');

  // Campaign form state
  const [campTitle, setCampTitle] = useState('');
  const [campSubtitle, setCampSubtitle] = useState('');
  const [campCtaLabel, setCampCtaLabel] = useState('Explorar Vitrine');
  const [campCtaUrl, setCampCtaUrl] = useState('#vitrine');
  const [campImageUrl, setCampImageUrl] = useState('/campaign-default.jpg');

  // Recovery notes
  const [recoveryNotes, setRecoveryNotes] = useState<Record<number, string>>({});

  const loadOverview = async () => {
    setLoading(true);
    try {
      const [res, bkpRes] = await Promise.all([
        apiRequest<PrincipalOverview>('/api/admin/principal/overview'),
        apiRequest<BackupStatusResponse>('/api/admin/principal/backups'),
      ]);
      setData(res);
      syncPersistedUsersFromAdmin(res.users);
      setBackupStatus(bkpRes);
      setSettingsForm(res.settings);
      if (!bonusUserId && res.users.length > 0) {
        setBonusUserId(String(res.users[0].id));
      }
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erro ao carregar painel principal.' });
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadLatestAutoDump = async () => {
    setFeedback(null);
    setDownloadingBackup(true);
    try {
      const token = getStoredToken();
      const response = await fetch('/api/admin/principal/backups/latest-auto', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Erro ao descarregar dump automático.');
      }

      const disposition = response.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match ? match[1] : `nzila-agro-dump-segunda-${new Date().toISOString().slice(0, 10)}.json`;
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);

      setFeedback({
        type: 'ok',
        text: `Dump automático "${filename}" descarregado diretamente com sucesso.`,
      });
      await loadOverview();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erro ao descarregar dump automático.' });
    } finally {
      setDownloadingBackup(false);
    }
  };

  const handleDownloadWeeklyBackup = async (backupId?: number) => {
    setFeedback(null);
    setDownloadingBackup(true);
    try {
      const token = getStoredToken();
      const url = backupId
        ? `/api/admin/principal/backups/download?id=${backupId}`
        : '/api/admin/principal/backups/download';
      const response = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Não foi possível descarregar o backup semanal.');
      }

      const disposition = response.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match ? match[1] : `nzila-agro-backup-${new Date().toISOString().slice(0, 10)}.json`;

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);

      setFeedback({
        type: 'ok',
        text: `Backup semanal "${filename}" descarregado com sucesso. Próxima descarga disponível dentro de 7 dias.`,
      });
      await loadOverview();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erro ao descarregar backup.' });
    } finally {
      setDownloadingBackup(false);
    }
  };

  const handleDownloadManualBackup = async () => {
    setFeedback(null);
    setDownloadingBackup(true);
    try {
      const token = getStoredToken();
      const response = await fetch('/api/admin/principal/backups/manual', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Não foi possível gerar o backup manual.');
      }

      const disposition = response.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match ? match[1] : `nzila-agro-backup-manual-${new Date().toISOString().slice(0, 10)}.json`;

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);

      setFeedback({
        type: 'ok',
        text: `Backup manual "${filename}" com o estado atual da base de dados descarregado com sucesso.`,
      });
      await loadOverview();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erro ao gerar backup manual.' });
    } finally {
      setDownloadingBackup(false);
    }
  };

  const handleDownloadStoredDump = async (backupId: number, fallbackFilename: string) => {
    setFeedback(null);
    setDownloadingBackup(true);
    try {
      const token = getStoredToken();
      const response = await fetch(`/api/admin/principal/backups/${backupId}/file`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Erro ao descarregar dump JSON.');
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = fallbackFilename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
      setFeedback({ type: 'ok', text: `Dump "${fallbackFilename}" descarregado com sucesso.` });
      await loadOverview();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erro ao descarregar dump.' });
    } finally {
      setDownloadingBackup(false);
    }
  };

  const handleExportAuditReport = async () => {
    setFeedback(null);
    setExportingAudit(true);
    try {
      const token = getStoredToken();
      const response = await fetch('/api/admin/principal/audit-logs/export', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Erro ao exportar relatório de auditoria.');
      }

      const disposition = response.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match
        ? match[1]
        : `nzila-agro-relatorio-auditoria-${new Date().toISOString().slice(0, 10)}.csv`;

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);

      setFeedback({
        type: 'ok',
        text: `Relatório de auditoria "${filename}" exportado com sucesso em formato CSV.`,
      });
      await loadOverview();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao exportar relatório de auditoria.',
      });
    } finally {
      setExportingAudit(false);
    }
  };

  const handleExportUsersCsv = async () => {
    setFeedback(null);
    setExportingUsers(true);
    try {
      const token = getStoredToken();
      const response = await fetch('/api/admin/principal/users/export', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Erro ao exportar lista de utilizadores.');
      }

      const disposition = response.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match
        ? match[1]
        : `nzila-agro-utilizadores-contactos-${new Date().toISOString().slice(0, 10)}.csv`;

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);

      setFeedback({
        type: 'ok',
        text: `Lista de utilizadores e contactos "${filename}" exportada com sucesso em formato CSV.`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao exportar lista de utilizadores.',
      });
    } finally {
      setExportingUsers(false);
    }
  };

  const handleExportListingsCsv = async () => {
    setFeedback(null);
    setExportingListings(true);
    try {
      const token = getStoredToken();
      const response = await fetch('/api/admin/principal/listings/export', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Erro ao exportar inventário de produtos.');
      }

      const disposition = response.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match
        ? match[1]
        : `nzila-agro-inventario-produtos-${new Date().toISOString().slice(0, 10)}.csv`;

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);

      setFeedback({
        type: 'ok',
        text: `Inventário de produtos "${filename}" exportado com sucesso em formato CSV.`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao exportar inventário de produtos.',
      });
    } finally {
      setExportingListings(false);
    }
  };

  const handleExportFinancialExcel = async () => {
    setFeedback(null);
    setExportingFinanceXlsx(true);
    try {
      const token = getStoredToken();
      const response = await fetch('/api/admin/principal/finance/export-xlsx', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Erro ao exportar relatório financeiro em Excel.');
      }

      const disposition = response.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match
        ? match[1]
        : `nzila-agro-relatorio-financeiro-${new Date().toISOString().slice(0, 10)}.xlsx`;

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);

      setFeedback({
        type: 'ok',
        text: `Relatório financeiro "${filename}" exportado com sucesso em formato Excel (.xlsx).`,
      });
      await loadOverview();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao exportar relatório financeiro em Excel.',
      });
    } finally {
      setExportingFinanceXlsx(false);
    }
  };

  const handleExportListingsExcel = async () => {
    setFeedback(null);
    setExportingListingsXlsx(true);
    try {
      const token = getStoredToken();
      const response = await fetch('/api/admin/principal/listings/export-xlsx', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Erro ao exportar inventário em Excel.');
      }

      const disposition = response.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match
        ? match[1]
        : `nzila-agro-inventario-produtos-${new Date().toISOString().slice(0, 10)}.xlsx`;

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);

      setFeedback({
        type: 'ok',
        text: `Inventário de produtos "${filename}" exportado com sucesso em formato Excel (.xlsx).`,
      });
      await loadOverview();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao exportar inventário em Excel.',
      });
    } finally {
      setExportingListingsXlsx(false);
    }
  };

  useEffect(() => {
    loadOverview();
  }, []);

  // Real-time refresh of Logs de Auditoria every 5 seconds while viewing the audit tab
  useEffect(() => {
    if (tab !== 'audit') return;
    const syncAuditLogs = async () => {
      try {
        const res = await apiRequest<{ auditLogs: AuditLog[] }>('/api/admin/principal/audit-logs');
        setData((prev) => (prev ? { ...prev, auditLogs: res.auditLogs } : prev));
      } catch {
        // Ignore transient polling errors
      }
    };
    syncAuditLogs();
    const interval = window.setInterval(syncAuditLogs, 5000);
    return () => window.clearInterval(interval);
  }, [tab]);

  const handleUserStatus = async (userId: number, status: 'Ativo' | 'Suspenso') => {
    try {
      await apiRequest(`/api/admin/aux/users/${userId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      });
      setFeedback({ type: 'ok', text: `Utilizador atualizado para ${status}.` });
      await loadOverview();
      onDataChanged();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erro ao atualizar estado.' });
    }
  };

  const handleRoleChange = async (userId: number, role: 'ADMIN_AUXILIAR' | 'USER') => {
    try {
      await apiRequest(`/api/admin/principal/users/${userId}/role`, {
        method: 'PUT',
        body: JSON.stringify({ role }),
      });
      setFeedback({ type: 'ok', text: 'Cargo administrativo atualizado com sucesso.' });
      await loadOverview();
      onDataChanged();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erro ao alterar cargo.' });
    }
  };

  const handleDeleteUser = async (userId: number) => {
    try {
      await apiRequest(`/api/admin/principal/users/${userId}`, { method: 'DELETE' });
      setConfirmDeleteUserId(null);
      setFeedback({ type: 'ok', text: 'Utilizador eliminado permanentemente e registado nos logs de auditoria.' });
      await loadOverview();
      onDataChanged();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erro ao eliminar utilizador.' });
    }
  };

  const handleRecoveryDecision = async (reqId: number, decision: 'Aprovado' | 'Rejeitado') => {
    try {
      await apiRequest(`/api/admin/principal/recoveries/${reqId}/decision`, {
        method: 'POST',
        body: JSON.stringify({ decision, adminNotes: recoveryNotes[reqId] || '' }),
      });
      setFeedback({
        type: 'ok',
        text:
          decision === 'Aprovado'
            ? 'Recuperação aprovada e nova palavra-passe ativada!'
            : 'Pedido de recuperação rejeitado.',
      });
      await loadOverview();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erro ao decidir recuperação.' });
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settingsForm) return;
    try {
      await apiRequest('/api/admin/principal/settings', {
        method: 'PUT',
        body: JSON.stringify(settingsForm),
      });
      setFeedback({
        type: 'ok',
        text: 'Dados financeiros oficiais, câmbios e valores das cotas nas 4 moedas atualizados em tempo real!',
      });
      await loadOverview();
      onDataChanged();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erro ao guardar finanças.' });
    }
  };

  const handleQuotaAction = async (userId: number, active: boolean, days?: number) => {
    try {
      await apiRequest(`/api/admin/principal/users/${userId}/quota`, {
        method: 'PUT',
        body: JSON.stringify({ active, days }),
      });
      setFeedback({
        type: 'ok',
        text: active ? `Cota ativada/estendida por ${days} dias.` : 'Cota desativada.',
      });
      await loadOverview();
      onDataChanged();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erro ao atualizar cota.' });
    }
  };

  const handleGrantBonus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bonusUserId) return;
    try {
      await apiRequest(`/api/admin/principal/users/${bonusUserId}/bonus`, {
        method: 'POST',
        body: JSON.stringify({ amountKz: Number(bonusAmount), reason: bonusReason }),
      });
      setBonusReason('');
      setFeedback({ type: 'ok', text: 'Bónus atribuído com sucesso ao utilizador.' });
      await loadOverview();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erro ao atribuir bónus.' });
    }
  };

  const handleDonationStatus = async (donationId: number, status: 'Pendente' | 'Confirmada' | 'Arquivada') => {
    try {
      await apiRequest(`/api/admin/principal/donations/${donationId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      });
      setFeedback({ type: 'ok', text: `Doação marcada como ${status}.` });
      await loadOverview();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erro ao atualizar doação.' });
    }
  };

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/admin/principal/campaigns', {
        method: 'POST',
        body: JSON.stringify({
          title: campTitle,
          subtitle: campSubtitle,
          imageUrl: campImageUrl,
          ctaLabel: campCtaLabel,
          ctaUrl: campCtaUrl,
          isActive: true,
        }),
      });
      setCampTitle('');
      setCampSubtitle('');
      setFeedback({ type: 'ok', text: 'Campanha criada e publicada na página inicial.' });
      await loadOverview();
      onDataChanged();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erro ao criar campanha.' });
    }
  };

  const handleToggleCampaign = async (camp: Campaign) => {
    try {
      await apiRequest(`/api/admin/principal/campaigns/${camp.id}`, {
        method: 'PUT',
        body: JSON.stringify({ ...camp, isActive: !camp.isActive }),
      });
      await loadOverview();
      onDataChanged();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erro ao atualizar campanha.' });
    }
  };

  const handleDeleteCampaign = async (id: number) => {
    try {
      await apiRequest(`/api/admin/principal/campaigns/${id}`, { method: 'DELETE' });
      await loadOverview();
      onDataChanged();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erro ao eliminar campanha.' });
    }
  };

  const filteredAuditLogs = useMemo(() => {
    if (!data) return [];
    return data.auditLogs.filter((log) => {
      if (auditCategory !== 'Todas' && log.category !== auditCategory) return false;
      if (auditSearch.trim()) {
        const q = auditSearch.toLowerCase();
        return (
          log.actorName.toLowerCase().includes(q) ||
          log.action.toLowerCase().includes(q) ||
          log.targetLabel.toLowerCase().includes(q) ||
          log.details.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [data, auditCategory, auditSearch]);

  if (loading || !data) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 text-sm text-[#546459]">
        A carregar Controlo Total do Administrador Principal...
      </div>
    );
  }

  const totalDonationsKz = data.donations
    .filter((d) => d.status !== 'Arquivada')
    .reduce((acc, d) => acc + d.amountKz, 0);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Institutional Print-Only Document Header */}
      <div className="print-only print-header-banner">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="font-display text-lg font-bold tracking-tight">
              NZILA AGRO — DOCUMENTO ADMINISTRATIVO OFICIAL
            </div>
            <div className="text-xs">
              Secção:{' '}
              {tab === 'audit'
                ? 'Logs de Auditoria (Fiscalização e Controlo Interno)'
                : tab === 'finance'
                  ? 'Gestão Financeira Oficial e Relatório de Transações'
                  : 'Painel do Administrador Principal'}
            </div>
          </div>
          <div className="text-right text-xs font-mono-tabular">
            Impresso em: {new Date().toLocaleString('pt-AO')}
          </div>
        </div>
      </div>

      {/* Header + Pending Counters */}
      <div className="space-y-4 print-hide">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-[#111814]">
              Painel do Administrador Principal (Controlo Total)
            </h1>
            <p className="text-sm text-[#546459]">
              Aprovação de vídeos, recuperação blindada, gestão financeira, cotas, bónus, tempo de uso e doações privadas.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {onReplayTour && (
              <button
                type="button"
                onClick={onReplayTour}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#D4DDD6] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#14532D] hover:bg-[#F2F7F3] transition-colors whitespace-nowrap shrink-0"
              >
                <Compass className="w-4 h-4 text-[#CA8A04]" />
                Tour da Plataforma
              </button>
            )}
            <button
              type="button"
              disabled={exportingUsers}
              onClick={handleExportUsersCsv}
              className="inline-flex items-center gap-2 rounded-lg border border-[#14532D]/30 bg-white px-3.5 py-2.5 text-xs font-bold text-[#14532D] hover:bg-[#EEF7F0] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-4 h-4 text-[#15803D]" />
              {exportingUsers ? 'A exportar...' : `Exportar Contactos CSV (${data.users.length})`}
            </button>
            <button
              type="button"
              disabled={exportingListings}
              onClick={handleExportListingsCsv}
              className="inline-flex items-center gap-2 rounded-lg border border-[#14532D]/30 bg-white px-3.5 py-2.5 text-xs font-bold text-[#14532D] hover:bg-[#EEF7F0] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-4 h-4 text-[#CA8A04]" />
              {exportingListings ? 'A exportar...' : 'Inventário CSV'}
            </button>
            <button
              type="button"
              disabled={exportingFinanceXlsx}
              onClick={handleExportFinancialExcel}
              className="inline-flex items-center gap-2 rounded-lg border border-[#15803D]/40 bg-[#EEF7F0] px-3.5 py-2.5 text-xs font-bold text-[#14532D] hover:bg-[#DFF1E4] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
            >
              <FileSpreadsheet className="w-4 h-4 text-[#15803D]" />
              {exportingFinanceXlsx ? 'A gerar .xlsx...' : 'Financeiro Excel (.xlsx)'}
            </button>
            <button
              type="button"
              disabled={exportingListingsXlsx}
              onClick={handleExportListingsExcel}
              className="inline-flex items-center gap-2 rounded-lg border border-[#CA8A04]/40 bg-[#FEFCE8] px-3.5 py-2.5 text-xs font-bold text-[#854D0E] hover:bg-[#FEF9C3] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
            >
              <FileSpreadsheet className="w-4 h-4 text-[#CA8A04]" />
              {exportingListingsXlsx ? 'A gerar .xlsx...' : 'Inventário Excel (.xlsx)'}
            </button>
            <button
              type="button"
              data-tour="principal-backup-btn"
              disabled={downloadingBackup}
              onClick={handleDownloadManualBackup}
              className="inline-flex items-center gap-2 rounded-lg bg-[#14532D] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#15803D] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-4 h-4" />
              {downloadingBackup ? 'A gerar JSON...' : 'Descarregar Backup JSON'}
            </button>
          </div>
        </div>

        {/* Contadores de Pendentes */}
        <div data-tour="principal-counters" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <button
            type="button"
            onClick={() => setTab('videos')}
            className="text-left rounded-xl border border-[#DCE5DE] bg-white p-4 hover:border-[#15803D] transition-colors"
          >
            <div className="text-xs font-medium text-[#546459]">Registos Pendentes</div>
            <div className="mt-1 font-display text-2xl font-extrabold text-[#B45309] font-mono-tabular">
              {data.counters.pendingRegistrations}
            </div>
          </button>

          <button
            type="button"
            onClick={() => setTab('recoveries')}
            className="text-left rounded-xl border border-[#DCE5DE] bg-white p-4 hover:border-[#15803D] transition-colors"
          >
            <div className="text-xs font-medium text-[#546459]">Recuperações Pendentes</div>
            <div className="mt-1 font-display text-2xl font-extrabold text-[#B45309] font-mono-tabular">
              {data.counters.pendingRecoveries}
            </div>
          </button>

          <button
            type="button"
            onClick={() => setTab('quotas')}
            className="text-left rounded-xl border border-[#DCE5DE] bg-white p-4 hover:border-[#15803D] transition-colors"
          >
            <div className="text-xs font-medium text-[#546459]">Cotas Inativas</div>
            <div className="mt-1 font-display text-2xl font-extrabold text-[#111814] font-mono-tabular">
              {data.counters.inactiveQuotas}
            </div>
          </button>

          <button
            type="button"
            onClick={() => setTab('moderation')}
            className="text-left rounded-xl border border-[#DCE5DE] bg-white p-4 hover:border-[#15803D] transition-colors"
          >
            <div className="text-xs font-medium text-[#546459]">Suporte Aberto</div>
            <div className="mt-1 font-display text-2xl font-extrabold text-[#14532D] font-mono-tabular">
              {data.counters.openSupport}
            </div>
          </button>
        </div>
      </div>

      {/* Collapsible 6-Month Comparative Market Price Overview (directly visible on dashboard load) */}
      {tab !== 'market' && (
        <div className="space-y-2 print-hide">
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={() => setShowMarketPreview((prev) => !prev)}
              className="text-xs font-semibold text-[#14532D] hover:underline"
            >
              {showMarketPreview
                ? 'Ocultar gráfico de preços médios (6 meses)'
                : 'Mostrar gráfico de preços médios (6 meses)'}
            </button>
          </div>
          {showMarketPreview && (
            <MarketPriceAnalyticsPanel
              settings={data.settings}
              compact
              onOpenFullAnalysis={() => setTab('market')}
            />
          )}
        </div>
      )}

      {/* Navigation Tabs */}
      <div data-tour="principal-tabs" className="flex flex-wrap items-center gap-1.5 rounded-xl border border-[#DCE5DE] bg-white p-1.5">
        {[
          { id: 'videos', label: `Vídeos de Registo (${data.counters.pendingRegistrations})`, icon: UserCheck },
          { id: 'recoveries', label: `Recuperação Blindada (${data.counters.pendingRecoveries})`, icon: KeyRound },
          { id: 'access', label: 'Níveis de Acesso', icon: UserCog },
          { id: 'finance', label: 'Gestão Financeira', icon: Coins },
          { id: 'smtp', label: 'Configuração SMTP', icon: Mail },
          { id: 'webhooks', label: 'Webhooks', icon: Webhook },
          { id: 'market', label: 'Preços de Mercado', icon: TrendingUp },
          { id: 'heatmap', label: 'Mapa de Calor Provincial', icon: Flame },
          { id: 'executive', label: 'Resumo Executivo (IA)', icon: Sparkles },
          { id: 'quotas', label: 'Cotas e Bónus', icon: Award },
          { id: 'usage', label: 'Relatório de Uso Ativo', icon: Clock },
          { id: 'donations', label: `Gestão de Doações Privada (${data.donations.length})`, icon: HeartHandshake },
          { id: 'campaigns', label: 'Publicidade e Campanhas', icon: Megaphone },
          { id: 'backups', label: 'Segurança e Backups', icon: Database },
          { id: 'audit', label: `Logs de Auditoria (${data.auditLogs.length})`, icon: ClipboardList },
          { id: 'errors', label: 'Relatório de Erros', icon: Bug },
          { id: 'moderation', label: 'Moderação & Mascaramento', icon: ShieldCheck },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id as typeof tab)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                tab === item.id
                  ? 'bg-[#14532D] text-white'
                  : 'text-[#445449] hover:bg-[#F2F7F3] hover:text-[#111814]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {item.label}
            </button>
          );
        })}
      </div>

      {feedback && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            feedback.type === 'ok'
              ? 'border-[#15803D]/30 bg-[#EEF7F0] text-[#14532D]'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* TAB 1: INDIVIDUAL REGISTRATION VIDEO APPROVAL */}
      {tab === 'videos' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold text-[#111814]">
                Aprovação Individual de Vídeos de Registo e Gestão de Cargos
              </h2>
              <p className="text-xs text-[#546459] mt-0.5">
                Exporte todos os utilizadores registados com telefone, WhatsApp, província e profissão para campanhas de marketing direto.
              </p>
            </div>
            <button
              type="button"
              disabled={exportingUsers}
              onClick={handleExportUsersCsv}
              className="inline-flex items-center gap-2 rounded-lg bg-[#14532D] px-4 py-2 text-xs font-bold text-white hover:bg-[#15803D] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto"
            >
              <Download className="w-4 h-4" />
              {exportingUsers ? 'A exportar CSV...' : `Exportar Utilizadores e Contactos (CSV)`}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {data.users.map((u) => (
              <div key={u.id} className="rounded-xl border border-[#DCE5DE] bg-white p-5 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <img
                      src={u.profilePhoto}
                      alt={u.name}
                      className="h-14 w-14 rounded-xl object-cover border border-[#DCE5DE]"
                    />
                    <div>
                      <h3 className="font-display text-base font-bold text-[#111814]">{u.name}</h3>
                      <p className="text-xs text-[#546459]">
                        {u.email} · {u.age} anos
                      </p>
                      <p className="text-xs text-[#14532D] font-medium">
                        {u.profession} · {u.province}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-xs font-bold ${
                      u.status === 'Ativo'
                        ? 'text-[#15803D]'
                        : u.status === 'Pendente'
                        ? 'text-[#B45309]'
                        : 'text-red-700'
                    }`}
                  >
                    {u.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs bg-[#F7F9F7] rounded-lg p-3 font-mono-tabular">
                  <div>Telefone: {u.phone}</div>
                  <div>WhatsApp: {u.whatsapp}</div>
                </div>

                {u.verificationVideo && (
                  <div className="overflow-hidden rounded-lg border border-[#DCE5DE] bg-[#111814]">
                    <video src={u.verificationVideo} controls className="w-full max-h-52 object-cover" />
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#EDF2EE]">
                  {u.role === 'ADMIN_PRINCIPAL' ? (
                    <span className="text-xs font-bold text-[#14532D]">Administrador Principal</span>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        {u.status !== 'Ativo' && (
                          <button
                            type="button"
                            onClick={() => handleUserStatus(u.id, 'Ativo')}
                            className="inline-flex items-center gap-1 rounded-lg bg-[#15803D] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#14532D]"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Aprovar Vídeo & Conta
                          </button>
                        )}
                        {u.status !== 'Suspenso' && (
                          <button
                            type="button"
                            onClick={() => handleUserStatus(u.id, 'Suspenso')}
                            className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            Suspender
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <select
                          value={u.role}
                          onChange={(e) => handleRoleChange(u.id, e.target.value as 'ADMIN_AUXILIAR' | 'USER')}
                          className="rounded-lg border border-[#D4DDD6] bg-white px-2.5 py-1.5 text-xs font-medium text-[#1C2720]"
                        >
                          <option value="USER">Utilizador Comum</option>
                          <option value="ADMIN_AUXILIAR">Administrador Auxiliar</option>
                        </select>

                        {confirmDeleteUserId === u.id ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleDeleteUser(u.id)}
                              className="rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-red-700 whitespace-nowrap"
                            >
                              Confirmar
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteUserId(null)}
                              className="rounded-lg border border-[#D4DDD6] px-2 py-1.5 text-xs text-[#546459] hover:bg-[#F7F9F7]"
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteUserId(u.id)}
                            title="Eliminar utilizador"
                            className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 whitespace-nowrap"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Eliminar
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: ARMORED PASSWORD RECOVERY VIDEO APPROVAL */}
      {tab === 'recoveries' && (
        <div className="space-y-4">
          <h2 className="font-display text-lg font-bold text-[#111814]">
            Pedidos de Recuperação de Palavra-passe Blindada
          </h2>
          {data.recoveryRequests.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#C7D3CA] bg-white p-10 text-center text-sm text-[#546459]">
              Não existem pedidos de recuperação submetidos.
            </div>
          ) : (
            <div className="space-y-5">
              {data.recoveryRequests.map((req) => (
                <div key={req.id} className="rounded-xl border border-[#DCE5DE] bg-white p-6 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="font-display text-base font-bold text-[#111814]">
                        {req.userName} ({req.userEmail})
                      </h3>
                      <p className="text-xs text-[#546459]">
                        {req.userProvince} · Tel: {req.userPhone} · Solicitado em {req.createdAt}
                      </p>
                    </div>
                    <span
                      className={`text-xs font-bold ${
                        req.status === 'Pendente'
                          ? 'text-[#B45309]'
                          : req.status === 'Aprovado'
                          ? 'text-[#15803D]'
                          : 'text-red-700'
                      }`}
                    >
                      {req.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <span className="block text-xs font-semibold text-[#546459]">
                        Vídeo Original de Registo (Referência)
                      </span>
                      <video src={req.originalVideo} controls className="w-full max-h-52 rounded-lg bg-[#111814]" />
                    </div>
                    <div className="space-y-1.5">
                      <span className="block text-xs font-semibold text-[#14532D]">
                        Novo Mini-vídeo de Confirmação
                      </span>
                      <video src={req.recoveryVideo} controls className="w-full max-h-52 rounded-lg bg-[#111814]" />
                    </div>
                  </div>

                  {req.status === 'Pendente' && (
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-3 border-t border-[#EDF2EE]">
                      <input
                        type="text"
                        value={recoveryNotes[req.id] || ''}
                        onChange={(e) => setRecoveryNotes((prev) => ({ ...prev, [req.id]: e.target.value }))}
                        placeholder="Observação administrativa (opcional)..."
                        className="flex-1 rounded-lg border border-[#D4DDD6] px-3 py-2 text-xs focus:border-[#15803D] focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleRecoveryDecision(req.id, 'Aprovado')}
                        className="rounded-lg bg-[#15803D] px-4 py-2 text-xs font-bold text-white hover:bg-[#14532D] whitespace-nowrap"
                      >
                        Validar Vídeo e Aprovar Nova Senha
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRecoveryDecision(req.id, 'Rejeitado')}
                        className="rounded-lg border border-red-200 px-4 py-2 text-xs font-bold text-red-700 hover:bg-red-50 whitespace-nowrap"
                      >
                        Rejeitar
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: DYNAMIC FINANCIAL MANAGEMENT */}
      {tab === 'finance' && settingsForm && (
        <div className="space-y-6">
          <MulticaixaSettingsCard />
          <AdminPaymentValidationPanel
            onReviewed={() => {
              loadOverview();
              onDataChanged();
            }}
          />
          <FinancialTransactionsExportCard onExported={() => loadOverview()} />
          <form onSubmit={handleSaveSettings} className="rounded-xl border border-[#DCE5DE] bg-white p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold text-[#111814]">
                Gestão Financeira Oficial e Câmbios Dinâmicos
              </h2>
              <p className="text-xs text-[#546459]">
                Todos os valores aqui gravados atualizam imediatamente a Página Pública e o Conversor de Moedas.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0 self-start sm:self-auto print-hide">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#D4DDD6] bg-white px-3.5 py-2 text-xs font-bold text-[#14532D] hover:bg-[#F2F7F3] transition-colors whitespace-nowrap"
              >
                <Printer className="w-4 h-4 text-[#15803D]" />
                Imprimir Relatório
              </button>
              <button
                type="button"
                disabled={exportingFinanceXlsx}
                onClick={handleExportFinancialExcel}
                className="inline-flex items-center gap-2 rounded-lg bg-[#14532D] px-4 py-2 text-xs font-bold text-white hover:bg-[#15803D] disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                <FileSpreadsheet className="w-4 h-4 text-[#FACC15]" />
                {exportingFinanceXlsx ? 'A gerar Excel...' : 'Exportar Relatório Financeiro (.xlsx)'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#1C2720] mb-1">WhatsApp Oficial</label>
              <input
                type="text"
                required
                value={settingsForm.officialWhatsapp}
                onChange={(e) => setSettingsForm({ ...settingsForm, officialWhatsapp: e.target.value })}
                className="w-full rounded-lg border border-[#D4DDD6] px-3.5 py-2.5 text-sm font-mono-tabular"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#1C2720] mb-1">IBAN Oficial</label>
              <input
                type="text"
                required
                value={settingsForm.officialIban}
                onChange={(e) => setSettingsForm({ ...settingsForm, officialIban: e.target.value })}
                className="w-full rounded-lg border border-[#D4DDD6] px-3.5 py-2.5 text-sm font-mono-tabular"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#1C2720] mb-1">Multicaixa Express</label>
              <input
                type="text"
                required
                value={settingsForm.officialExpress}
                onChange={(e) => setSettingsForm({ ...settingsForm, officialExpress: e.target.value })}
                className="w-full rounded-lg border border-[#D4DDD6] px-3.5 py-2.5 text-sm font-mono-tabular"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#1C2720] mb-1">Número de Conta</label>
              <input
                type="text"
                required
                value={settingsForm.officialAccountNumber}
                onChange={(e) => setSettingsForm({ ...settingsForm, officialAccountNumber: e.target.value })}
                className="w-full rounded-lg border border-[#D4DDD6] px-3.5 py-2.5 text-sm font-mono-tabular"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-[#1C2720] mb-1">Titular da Conta</label>
              <input
                type="text"
                required
                value={settingsForm.officialAccountHolder}
                onChange={(e) => setSettingsForm({ ...settingsForm, officialAccountHolder: e.target.value })}
                className="w-full rounded-lg border border-[#D4DDD6] px-3.5 py-2.5 text-sm"
              />
            </div>
          </div>

          <div className="border-t border-[#EDF2EE] pt-5">
            <h3 className="text-sm font-bold text-[#14532D] mb-3">Taxas de Câmbio (para 1 unidade em Kz)</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#1C2720] mb-1">1 USD em Kz</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={settingsForm.rateUsdToKz}
                  onChange={(e) => setSettingsForm({ ...settingsForm, rateUsdToKz: Number(e.target.value) })}
                  className="w-full rounded-lg border border-[#D4DDD6] px-3.5 py-2.5 text-sm font-mono-tabular"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#1C2720] mb-1">1 EUR em Kz</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={settingsForm.rateEurToKz}
                  onChange={(e) => setSettingsForm({ ...settingsForm, rateEurToKz: Number(e.target.value) })}
                  className="w-full rounded-lg border border-[#D4DDD6] px-3.5 py-2.5 text-sm font-mono-tabular"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#1C2720] mb-1">1 GBP em Kz</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={settingsForm.rateGbpToKz}
                  onChange={(e) => setSettingsForm({ ...settingsForm, rateGbpToKz: Number(e.target.value) })}
                  className="w-full rounded-lg border border-[#D4DDD6] px-3.5 py-2.5 text-sm font-mono-tabular"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-[#EDF2EE] pt-5">
            <h3 className="text-sm font-bold text-[#14532D] mb-3">Valores Oficiais das Cotas nas 4 Moedas</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#1C2720] mb-1">Cota em Kz (AOA)</label>
                <input
                  type="number"
                  step="1"
                  required
                  value={settingsForm.quotaValueKz}
                  onChange={(e) => setSettingsForm({ ...settingsForm, quotaValueKz: Number(e.target.value) })}
                  className="w-full rounded-lg border border-[#D4DDD6] px-3.5 py-2.5 text-sm font-mono-tabular"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#1C2720] mb-1">Cota em USD ($)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={settingsForm.quotaValueUsd}
                  onChange={(e) => setSettingsForm({ ...settingsForm, quotaValueUsd: Number(e.target.value) })}
                  className="w-full rounded-lg border border-[#D4DDD6] px-3.5 py-2.5 text-sm font-mono-tabular"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#1C2720] mb-1">Cota em EUR (€)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={settingsForm.quotaValueEur}
                  onChange={(e) => setSettingsForm({ ...settingsForm, quotaValueEur: Number(e.target.value) })}
                  className="w-full rounded-lg border border-[#D4DDD6] px-3.5 py-2.5 text-sm font-mono-tabular"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#1C2720] mb-1">Cota em GBP (£)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={settingsForm.quotaValueGbp}
                  onChange={(e) => setSettingsForm({ ...settingsForm, quotaValueGbp: Number(e.target.value) })}
                  className="w-full rounded-lg border border-[#D4DDD6] px-3.5 py-2.5 text-sm font-mono-tabular"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="rounded-lg bg-[#14532D] px-6 py-2.5 text-xs font-bold text-white hover:bg-[#15803D]"
            >
              Guardar Definições Financeiras
            </button>
          </div>
          </form>
        </div>
      )}

      {/* TAB 4: QUOTA TIME CONTROL & BONUS ATTRIBUTION */}
      {tab === 'quotas' && (
        <div className="space-y-6">
          {/* Quota table */}
          <div className="overflow-x-auto rounded-xl border border-[#DCE5DE] bg-white">
            <div className="border-b border-[#E5ECE6] px-5 py-4">
              <h2 className="font-display text-lg font-bold text-[#111814]">Controle de Tempo de Cotas</h2>
            </div>
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[#E5ECE6] bg-[#F7F9F7] text-xs font-semibold text-[#546459]">
                <tr>
                  <th className="px-4 py-3">Utilizador</th>
                  <th className="px-4 py-3">Cota</th>
                  <th className="px-4 py-3">Expira em</th>
                  <th className="px-4 py-3 text-right">Definir / Estender Dias</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EDF2EE]">
                {data.users.map((u) => {
                  const daysVal = Number(quotaDaysMap[u.id] || 30);
                  return (
                    <tr key={u.id}>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-[#111814]">{u.name}</div>
                        <div className="text-xs text-[#546459]">{u.email} · Bónus: {formatCurrency(u.bonusKz, 'AOA')}</div>
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold">
                        <span className={u.quotaActive ? 'text-[#15803D]' : 'text-red-700'}>
                          {u.quotaActive ? 'Ativa' : 'Inativa'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs font-mono-tabular text-[#445449]">
                        {u.quotaExpiresAt ? new Date(u.quotaExpiresAt).toLocaleDateString('pt-AO') : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          <input
                            type="number"
                            min="1"
                            value={quotaDaysMap[u.id] ?? '30'}
                            onChange={(e) => setQuotaDaysMap({ ...quotaDaysMap, [u.id]: e.target.value })}
                            className="w-16 rounded border border-[#D4DDD6] px-2 py-1 text-xs font-mono-tabular text-center"
                          />
                          <button
                            type="button"
                            onClick={() => handleQuotaAction(u.id, true, daysVal)}
                            className="rounded-lg bg-[#15803D] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#14532D] whitespace-nowrap"
                          >
                            +{daysVal} dias
                          </button>
                          {u.quotaActive && (
                            <button
                              type="button"
                              onClick={() => handleQuotaAction(u.id, false)}
                              className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 whitespace-nowrap"
                            >
                              Desativar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Bonus Attribution */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <form onSubmit={handleGrantBonus} className="lg:col-span-5 rounded-xl border border-[#DCE5DE] bg-white p-6 space-y-4">
              <h3 className="font-display text-base font-bold text-[#111814]">Atribuição de Bónus</h3>
              <div>
                <label className="block text-xs font-medium text-[#1C2720] mb-1">Utilizador</label>
                <select
                  value={bonusUserId}
                  onChange={(e) => setBonusUserId(e.target.value)}
                  className="w-full rounded-lg border border-[#D4DDD6] bg-white px-3 py-2 text-sm"
                >
                  {data.users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.email})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#1C2720] mb-1">Valor do Bónus (Kz)</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={bonusAmount}
                  onChange={(e) => setBonusAmount(e.target.value)}
                  className="w-full rounded-lg border border-[#D4DDD6] px-3 py-2 text-sm font-mono-tabular"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#1C2720] mb-1">Motivo / Justificação</label>
                <input
                  type="text"
                  required
                  value={bonusReason}
                  onChange={(e) => setBonusReason(e.target.value)}
                  placeholder="Ex: Incentivo produtor destaque da província"
                  className="w-full rounded-lg border border-[#D4DDD6] px-3 py-2 text-sm"
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-lg bg-[#EAB308] px-4 py-2.5 text-xs font-bold text-[#111814] hover:bg-[#CA8A04] hover:text-white transition-colors"
              >
                Atribuir Bónus
              </button>
            </form>

            <div className="lg:col-span-7 rounded-xl border border-[#DCE5DE] bg-white p-6 space-y-3">
              <h3 className="font-display text-base font-bold text-[#111814]">Registo de Bónus Atribuídos</h3>
              {data.bonusLogs.length === 0 ? (
                <p className="text-sm text-[#546459]">Nenhum bónus atribuído até ao momento.</p>
              ) : (
                <div className="divide-y divide-[#EDF2EE] text-xs">
                  {data.bonusLogs.map((b) => (
                    <div key={b.id} className="py-2.5 flex items-center justify-between gap-4">
                      <div>
                        <span className="font-bold text-[#111814]">{b.userName}</span>
                        <span className="text-[#546459]"> · {b.reason}</span>
                      </div>
                      <span className="font-mono-tabular font-bold text-[#14532D]">
                        +{formatCurrency(b.amountKz, 'AOA')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: ACTIVE USAGE TIME REPORT */}
      {tab === 'usage' && (
        <div className="overflow-x-auto rounded-xl border border-[#DCE5DE] bg-white">
          <div className="border-b border-[#E5ECE6] px-5 py-4">
            <h2 className="font-display text-lg font-bold text-[#111814]">
              Relatório de Tempo de Uso Ativo dos Utilizadores
            </h2>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[#E5ECE6] bg-[#F7F9F7] text-xs font-semibold text-[#546459]">
              <tr>
                <th className="px-4 py-3">Utilizador</th>
                <th className="px-4 py-3">Cargo</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Tempo Ativo Acumulado</th>
                <th className="px-4 py-3">Última Atividade</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EDF2EE]">
              {[...data.users]
                .sort((a, b) => b.activeSeconds - a.activeSeconds)
                .map((u) => (
                  <tr key={u.id}>
                    <td className="px-4 py-3 font-medium text-[#111814]">
                      {u.name} <span className="text-xs text-[#546459]">({u.province})</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-[#445449]">{u.role}</td>
                    <td className="px-4 py-3 text-xs font-semibold">{u.status}</td>
                    <td className="px-4 py-3 font-mono-tabular font-bold text-[#14532D]">
                      {formatActiveDuration(u.activeSeconds)}
                    </td>
                    <td className="px-4 py-3 font-mono-tabular text-xs text-[#546459]">
                      {u.lastActiveAt || '—'}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 6: PRIVATE DONATIONS MANAGEMENT TAB */}
      {tab === 'donations' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#EAB308] bg-[#FEFCE8] p-5">
            <div>
              <h2 className="font-display text-lg font-bold text-[#111814]">
                Aba Privada de Gestão de Doações
              </h2>
              <p className="text-xs text-[#713F12]">
                Acesso exclusivo do Administrador Principal. Estes dados nunca são exibidos publicamente.
              </p>
            </div>
            <div className="text-right">
              <div className="text-xs text-[#713F12]">Total Registado (Equivalente Kz)</div>
              <div className="font-display text-2xl font-extrabold text-[#14532D] font-mono-tabular">
                {formatCurrency(totalDonationsKz, 'AOA')}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-[#DCE5DE] bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[#E5ECE6] bg-[#F7F9F7] text-xs font-semibold text-[#546459]">
                <tr>
                  <th className="px-4 py-3">Doador / Contacto</th>
                  <th className="px-4 py-3">Valor Original</th>
                  <th className="px-4 py-3">Equiv. Kz</th>
                  <th className="px-4 py-3">Via & Referência</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EDF2EE]">
                {data.donations.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-[#546459]">
                      Nenhuma doação privada registada até ao momento.
                    </td>
                  </tr>
                ) : (
                  data.donations.map((d) => (
                    <tr key={d.id}>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-[#111814]">{d.donorName}</div>
                        <div className="text-xs text-[#546459]">{d.donorContact}</div>
                        {d.message && <div className="text-xs italic text-[#445449] mt-0.5">"{d.message}"</div>}
                      </td>
                      <td className="px-4 py-3 font-mono-tabular font-semibold text-[#111814]">
                        {formatCurrency(d.amount, d.currency)}
                      </td>
                      <td className="px-4 py-3 font-mono-tabular font-bold text-[#14532D]">
                        {formatCurrency(d.amountKz, 'AOA')}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <div className="font-medium">{d.method}</div>
                        <div className="font-mono-tabular text-[#546459]">{d.reference}</div>
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold">{d.status}</td>
                      <td className="px-4 py-3 text-right">
                        <select
                          value={d.status}
                          onChange={(e) =>
                            handleDonationStatus(d.id, e.target.value as 'Pendente' | 'Confirmada' | 'Arquivada')
                          }
                          className="rounded-lg border border-[#D4DDD6] bg-white px-2.5 py-1.5 text-xs font-medium"
                        >
                          <option value="Pendente">Pendente</option>
                          <option value="Confirmada">Confirmada</option>
                          <option value="Arquivada">Arquivada</option>
                        </select>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 7: DYNAMIC ADVERTISING & CAMPAIGNS */}
      {tab === 'campaigns' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form onSubmit={handleCreateCampaign} className="lg:col-span-5 rounded-xl border border-[#DCE5DE] bg-white p-6 space-y-4">
            <h2 className="font-display text-lg font-bold text-[#111814]">Nova Campanha / Publicidade</h2>
            <div>
              <label className="block text-xs font-medium text-[#1C2720] mb-1">Título *</label>
              <input
                type="text"
                required
                value={campTitle}
                onChange={(e) => setCampTitle(e.target.value)}
                placeholder="Ex: Feira Agrícola de Benguela 2026"
                className="w-full rounded-lg border border-[#D4DDD6] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#1C2720] mb-1">Texto da Campanha *</label>
              <textarea
                rows={3}
                required
                value={campSubtitle}
                onChange={(e) => setCampSubtitle(e.target.value)}
                placeholder="Descrição da iniciativa ou destaque publicitário..."
                className="w-full rounded-lg border border-[#D4DDD6] px-3 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#1C2720] mb-1">Texto do Botão</label>
                <input
                  type="text"
                  value={campCtaLabel}
                  onChange={(e) => setCampCtaLabel(e.target.value)}
                  className="w-full rounded-lg border border-[#D4DDD6] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#1C2720] mb-1">Destino (#vitrine ou #registar)</label>
                <input
                  type="text"
                  value={campCtaUrl}
                  onChange={(e) => setCampCtaUrl(e.target.value)}
                  className="w-full rounded-lg border border-[#D4DDD6] px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#1C2720] mb-1">Imagem (URL ou /campaign-default.jpg)</label>
              <input
                type="text"
                value={campImageUrl}
                onChange={(e) => setCampImageUrl(e.target.value)}
                className="w-full rounded-lg border border-[#D4DDD6] px-3 py-2 text-sm"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-lg bg-[#14532D] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#15803D]"
            >
              Publicar Campanha
            </button>
          </form>

          <div className="lg:col-span-7 space-y-4">
            {data.campaigns.map((camp) => (
              <div key={camp.id} className="rounded-xl border border-[#DCE5DE] bg-white p-5 flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold text-[#15803D]">
                    {camp.isActive ? 'Ativa na Página Pública' : 'Inativa'}
                  </div>
                  <h3 className="font-display text-base font-bold text-[#111814] mt-0.5">{camp.title}</h3>
                  <p className="text-xs text-[#546459] mt-1">{camp.subtitle}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleToggleCampaign(camp)}
                    className="rounded-lg border border-[#D4DDD6] px-3 py-1.5 text-xs font-semibold text-[#1C2720] hover:bg-[#F7F9F7]"
                  >
                    {camp.isActive ? 'Pausar' : 'Ativar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteCampaign(camp.id)}
                    className="rounded-lg border border-red-200 p-1.5 text-red-700 hover:bg-red-50"
                    aria-label="Eliminar campanha"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 8: SECURITY & BACKUPS CONFIGURATION + HISTORY */}
      {tab === 'backups' && backupStatus && (
        <SecurityBackupsPanel
          backupStatus={backupStatus}
          downloadingBackup={downloadingBackup}
          onDownloadLatestAuto={handleDownloadLatestAutoDump}
          onDownloadManual={handleDownloadManualBackup}
          onDownloadStoredDump={handleDownloadStoredDump}
          onScheduleUpdated={(updated) => {
            setBackupStatus(updated);
            loadOverview();
          }}
        />
      )}

      {/* TAB 9: CRITICAL ACTIVITY AUDIT LOGS */}
      {tab === 'audit' && (
        <div className="space-y-5">
          <div className="rounded-xl border border-[#DCE5DE] bg-white p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-lg font-bold text-[#111814] flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-[#15803D]" />
                Logs de Auditoria
              </h2>
              <p className="text-xs text-[#546459] mt-0.5">
                Tabela de histórico atualizada em tempo real com aprovações de contas, edições financeiras e deleção de dados.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 print-hide">
              <div className="relative">
                <Search className="w-4 h-4 text-[#7B8B80] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                  placeholder="Pesquisar por utilizador, ação ou alvo..."
                  className="w-full sm:w-64 rounded-lg border border-[#D4DDD6] bg-white pl-9 pr-3 py-2 text-xs text-[#111814] focus:border-[#15803D] focus:outline-none"
                />
              </div>

              <button
                type="button"
                onClick={() => window.print()}
                title="Imprimir logs de auditoria com formatação limpa para arquivo físico"
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#D4DDD6] bg-white px-3.5 py-2 text-xs font-bold text-[#14532D] hover:bg-[#F2F7F3] transition-colors whitespace-nowrap shrink-0"
              >
                <Printer className="w-4 h-4 text-[#15803D]" />
                Imprimir Logs
              </button>

              <button
                type="button"
                disabled={exportingAudit}
                onClick={handleExportAuditReport}
                title="Gerar ficheiro CSV com todo o histórico de atividades para fiscalização"
                className="inline-flex items-center gap-2 rounded-lg bg-[#14532D] px-4 py-2 text-xs font-bold text-white hover:bg-[#15803D] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
              >
                <Download className="w-4 h-4" />
                {exportingAudit ? 'A exportar...' : 'Exportar Relatório'}
              </button>
            </div>
          </div>

          <div className="print-only text-xs">
            Filtro aplicado — Categoria: <strong>{auditCategory}</strong>
            {auditSearch.trim() ? ` | Pesquisa: "${auditSearch.trim()}"` : ''} | Registos exibidos:{' '}
            <strong>{filteredAuditLogs.length}</strong>
          </div>

          <div className="flex flex-wrap items-center gap-1 rounded-lg bg-white p-1 border border-[#DCE5DE] w-fit print-hide">
            {(['Todas', 'Aprovação', 'Financeiro', 'Segurança', 'Utilizadores', 'Moderação', 'Sistema'] as const).map(
              (cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setAuditCategory(cat)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                    auditCategory === cat ? 'bg-[#14532D] text-white' : 'text-[#445449] hover:text-[#111814]'
                  }`}
                >
                  {cat}
                </button>
              )
            )}
          </div>

          <div className="overflow-x-auto rounded-xl border border-[#DCE5DE] bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[#E5ECE6] bg-[#F7F9F7] text-xs font-semibold text-[#546459]">
                <tr>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Utilizador Responsável</th>
                  <th className="px-4 py-3">Ação Realizada</th>
                  <th className="px-4 py-3">Categoria</th>
                  <th className="px-4 py-3">Alvo</th>
                  <th className="px-4 py-3">Detalhes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EDF2EE]">
                {filteredAuditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-[#546459]">
                      Nenhum registo encontrado em Logs de Auditoria para os filtros selecionados.
                    </td>
                  </tr>
                ) : (
                  filteredAuditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-[#F7F9F7]">
                      <td className="px-4 py-3 font-mono-tabular text-xs text-[#546459] whitespace-nowrap">
                        {new Date(log.createdAt + (log.createdAt.endsWith('Z') ? '' : 'Z')).toLocaleString('pt-AO')}
                      </td>
                      <td className="px-4 py-3 text-xs text-[#111814] font-medium whitespace-nowrap">
                        {log.actorName}{' '}
                        <span className="text-[11px] text-[#7B8B80]">
                          ({log.actorRole === 'ADMIN_PRINCIPAL' ? 'Principal' : 'Auxiliar'})
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs font-bold text-[#111814] whitespace-nowrap">
                        {log.action}
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold whitespace-nowrap">
                        <span
                          className={
                            log.category === 'Utilizadores'
                              ? 'text-red-700'
                              : log.category === 'Financeiro'
                              ? 'text-[#B45309]'
                              : log.category === 'Aprovação'
                              ? 'text-[#15803D]'
                              : 'text-[#14532D]'
                          }
                        >
                          {log.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs font-medium text-[#1C2720]">
                        {log.targetLabel}
                      </td>
                      <td className="px-4 py-3 text-xs text-[#546459] max-w-xs">
                        {log.details || '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: SMTP EMAIL CONFIGURATION */}
      {tab === 'smtp' && <SmtpSettingsPanel />}

      {/* TAB: WEBHOOKS MANAGEMENT */}
      {tab === 'webhooks' && <WebhooksPanel />}

      {/* TAB: COMPARATIVE MARKET PRICE ANALYTICS (6 MONTHS) */}
      {tab === 'market' && <MarketPriceAnalyticsPanel settings={data.settings} />}

      {/* TAB: PROVINCE ACTIVITY HEATMAP (RECHARTS) */}
      {tab === 'heatmap' && <AngolaProvinceActivityHeatmap />}

      {/* TAB: EXECUTIVE SUMMARY REPORT (GEMINI AI) */}
      {tab === 'executive' && <ExecutiveSummaryPanel />}

      {/* TAB: GRANULAR ACCESS LEVELS (AUXILIARY ADMINS RBAC) */}
      {tab === 'access' && (
        <AccessControlPanel
          users={data.users}
          onUpdated={async () => {
            await loadOverview();
            onDataChanged();
          }}
        />
      )}

      {/* TAB: CLIENT ERROR BOUNDARY REPORTS */}
      {tab === 'errors' && <ErrorReportsPanel />}

      {/* TAB 10: EMBEDDED AUX MODERATION + PHOTO MASKING */}
      {tab === 'moderation' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-[#DCE5DE] bg-white px-5 py-4">
            <div>
              <h2 className="font-display text-base font-bold text-[#111814]">
                Exportação do Inventário de Produtos
              </h2>
              <p className="text-xs text-[#546459] mt-0.5">
                Descarregue todas as listagens atuais em Excel (.xlsx) formatado por produto, província e categoria, ou em formato CSV simples.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0 self-start sm:self-auto">
              <button
                type="button"
                disabled={exportingListingsXlsx}
                onClick={handleExportListingsExcel}
                className="inline-flex items-center gap-2 rounded-lg bg-[#14532D] px-4 py-2 text-xs font-bold text-white hover:bg-[#15803D] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
              >
                <FileSpreadsheet className="w-4 h-4 text-[#FACC15]" />
                {exportingListingsXlsx ? 'A gerar .xlsx...' : 'Exportar Inventário Excel (.xlsx)'}
              </button>
              <button
                type="button"
                disabled={exportingListings}
                onClick={handleExportListingsCsv}
                className="inline-flex items-center gap-2 rounded-lg border border-[#14532D]/30 bg-white px-3.5 py-2 text-xs font-bold text-[#14532D] hover:bg-[#EEF7F0] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
              >
                <Download className="w-4 h-4" />
                {exportingListings ? 'A exportar CSV...' : 'Exportar CSV'}
              </button>
            </div>
          </div>
          <AuxAdminDashboard onDataChanged={() => { loadOverview(); onDataChanged(); }} />
        </div>
      )}
    </div>
  );
};
