import { useCallback, useEffect, useRef, useState } from 'react';
import { AuthModal } from './components/AuthModal';
import { AuxAdminDashboard } from './components/AuxAdminDashboard';
import { DirectMessagesModal } from './components/DirectMessagesModal';
import { ErrorBoundary, GlobalErrorListener } from './components/ErrorBoundary';
import { KeyboardShortcutsManager } from './components/KeyboardShortcutsManager';
import { ActiveView, Navbar, VitrineCategoryFilter } from './components/Navbar';
import { NotificationToasts, ToastAlert } from './components/NotificationCenter';
import { OfflineStatusBanner } from './components/OfflineStatusBanner';
import { PlatformTour } from './components/PlatformTour';
import { PrincipalAdminDashboard } from './components/PrincipalAdminDashboard';
import { PublicHome } from './components/PublicHome';
import { UserDashboard } from './components/UserDashboard';
import { apiRequest, getStoredToken, setStoredToken } from './lib/api';
import {
  isLocalAdminInitialized,
  loadPersistedAccountsVault,
  loadPersistedActiveUser,
  markLocalAdminInitialized,
  savePersistedActiveUser,
  upsertPersistedAccount,
} from './lib/localAuthStore';
import {
  DirectConversation,
  getUnreadCountForPeer,
  loadConversations,
  resolvePeerIdentity,
  subscribeToP2PUpdates,
} from './lib/directMessages';
import type { AppNotification, Campaign, FinancialSettings, Listing, User } from './types';

interface PublicOverviewResponse {
  hasAnyUser: boolean;
  settings: FinancialSettings;
  campaigns: Campaign[];
  listings: Listing[];
}

const TRACKED_RECOVERY_EMAIL_KEY = 'nzila_tracked_recovery_email';
const SEEN_RECOVERY_DECISION_KEY = 'nzila_seen_recovery_decision_id';
const OFFLINE_PUBLIC_CACHE_KEY = 'nzila_offline_public_overview_v1';
const THEME_STORAGE_KEY = 'nzila_theme_mode';

const DEFAULT_SETTINGS: FinancialSettings = {
  officialWhatsapp: '+244 923 000 000',
  officialIban: 'AO06 0040 0000 1234 5678 9012 3',
  officialExpress: '923 000 000',
  officialAccountNumber: '000012345678901',
  officialAccountHolder: 'Nzila Agro Lda — Conta Institucional',
  rateUsdToKz: 915,
  rateEurToKz: 985,
  rateGbpToKz: 1160,
  quotaValueKz: 5000,
  quotaValueUsd: 5.5,
  quotaValueEur: 5.1,
  quotaValueGbp: 4.3,
  updatedAt: '',
};

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(() => loadPersistedActiveUser());
  const [activeView, setActiveView] = useState<ActiveView>('public');
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register' | 'recovery' | null>(null);
  const [publicData, setPublicData] = useState<PublicOverviewResponse>(() => {
    try {
      const cached = localStorage.getItem(OFFLINE_PUBLIC_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as PublicOverviewResponse;
        if (parsed && parsed.settings && Array.isArray(parsed.listings)) {
          return parsed;
        }
      }
    } catch {
      // Ignore malformed cache
    }
    return {
      hasAnyUser: false,
      settings: DEFAULT_SETTINGS,
      campaigns: [],
      listings: [],
    };
  });
  const [globalNotice, setGlobalNotice] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [toasts, setToasts] = useState<ToastAlert[]>([]);
  const [trackedRecoveryEmail, setTrackedRecoveryEmail] = useState<string | null>(() =>
    localStorage.getItem(TRACKED_RECOVERY_EMAIL_KEY)
  );
  const [tourReplayId, setTourReplayId] = useState(0);
  const [globalSearchQuery, setGlobalSearchQuery] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get('q') || '';
    } catch {
      return '';
    }
  });
  const [globalCategoryFilter, setGlobalCategoryFilter] = useState<VitrineCategoryFilter>('Todos');
  const [globalProvinceFilter, setGlobalProvinceFilter] = useState('Todas');
  const [directChatOpen, setDirectChatOpen] = useState(false);
  const [directChatListing, setDirectChatListing] = useState<Listing | null>(null);
  const [unreadDirectMessages, setUnreadDirectMessages] = useState(0);
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'dark' || saved === 'light') return saved;
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
      }
    } catch {
      // Ignore storage errors
    }
    return 'light';
  });
  const shownNotificationIdsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.style.colorScheme = theme;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage errors
    }
  }, [theme]);

  const fetchPublicOverview = useCallback(async () => {
    try {
      const res = await apiRequest<PublicOverviewResponse>('/api/public/overview');
      if (res.hasAnyUser) {
        markLocalAdminInitialized();
      } else {
        // If server database restarted empty, automatically rehydrate Principal Admin & users from localStorage
        const vault = loadPersistedAccountsVault();
        if (vault.length > 0) {
          const savedUser = loadPersistedActiveUser();
          const restoreRes = await apiRequest<{
            restored: number;
            token: string | null;
            user: User | null;
          }>('/api/auth/restore-local-accounts', {
            method: 'POST',
            body: JSON.stringify({
              accounts: vault,
              activeEmail: savedUser?.email || undefined,
            }),
          });
          if (restoreRes.token && restoreRes.user) {
            setStoredToken(restoreRes.token);
            setCurrentUser(restoreRes.user);
            savePersistedActiveUser(restoreRes.user);
          }
          if (restoreRes.restored > 0) {
            const refreshed = await apiRequest<PublicOverviewResponse>('/api/public/overview');
            setPublicData(refreshed);
            try {
              localStorage.setItem(OFFLINE_PUBLIC_CACHE_KEY, JSON.stringify(refreshed));
            } catch {
              // ignore quota
            }
            return;
          }
        }
      }
      setPublicData(res);
      try {
        localStorage.setItem(OFFLINE_PUBLIC_CACHE_KEY, JSON.stringify(res));
      } catch {
        // Ignore storage quota errors
      }
    } catch (err) {
      console.error('Erro ao carregar dados públicos (a usar cache local se disponível):', err);
    }
  }, []);

  const syncNotificationsAndProfile = useCallback(async () => {
    const token = getStoredToken();
    if (!token) return;
    try {
      const [meRes, notifRes] = await Promise.all([
        apiRequest<{ user: User }>('/api/users/me'),
        apiRequest<{ notifications: AppNotification[] }>('/api/users/notifications'),
      ]);

      setCurrentUser((prev) => {
        if (prev && prev.status !== meRes.user.status) {
          fetchPublicOverview();
        }
        return meRes.user;
      });
      savePersistedActiveUser(meRes.user);
      upsertPersistedAccount(meRes.user);
      setNotifications(notifRes.notifications);

      const unreadNew = notifRes.notifications.filter(
        (n) => !n.isRead && !shownNotificationIdsRef.current.has(n.id)
      );

      if (unreadNew.length > 0) {
        unreadNew.forEach((n) => shownNotificationIdsRef.current.add(n.id));
        setToasts((prev) => [
          ...unreadNew.map((n) => ({
            id: `notif-${n.id}`,
            notificationId: n.id,
            type: n.type,
            title: n.title,
            message: n.message,
          })),
          ...prev,
        ]);
      }
    } catch {
      // Ignore transient polling failures
    }
  }, [fetchPublicOverview]);

  const restoreSession = useCallback(async () => {
    const token = getStoredToken();
    const savedUser = loadPersistedActiveUser();
    if (!token) {
      if (savedUser) {
        const vault = loadPersistedAccountsVault();
        if (vault.length > 0) {
          try {
            const restored = await apiRequest<{ token: string | null; user: User | null }>(
              '/api/auth/restore-local-accounts',
              {
                method: 'POST',
                body: JSON.stringify({ accounts: vault, activeEmail: savedUser.email }),
              }
            );
            if (restored.token && restored.user) {
              setStoredToken(restored.token);
              setCurrentUser(restored.user);
              savePersistedActiveUser(restored.user);
              return;
            }
          } catch {
            // ignore
          }
        }
      }
      return;
    }
    try {
      const res = await apiRequest<{ user: User }>('/api/users/me');
      setCurrentUser(res.user);
      savePersistedActiveUser(res.user);
      upsertPersistedAccount(res.user);
    } catch {
      // If token expired because server DB restarted, rehydrate from localStorage vault
      const vault = loadPersistedAccountsVault();
      if (savedUser && vault.length > 0) {
        try {
          const restored = await apiRequest<{ token: string | null; user: User | null }>(
            '/api/auth/restore-local-accounts',
            {
              method: 'POST',
              body: JSON.stringify({ accounts: vault, activeEmail: savedUser.email }),
            }
          );
          if (restored.token && restored.user) {
            setStoredToken(restored.token);
            setCurrentUser(restored.user);
            savePersistedActiveUser(restored.user);
            return;
          }
        } catch {
          // ignore
        }
      }
      setStoredToken(null);
      setCurrentUser(null);
      savePersistedActiveUser(null);
    }
  }, []);

  useEffect(() => {
    fetchPublicOverview();
    restoreSession();
  }, [fetchPublicOverview, restoreSession]);

  const syncUnreadDirectMessages = useCallback(
    (conversationsList?: DirectConversation[]) => {
      const identity = resolvePeerIdentity(currentUser);
      const list = conversationsList ?? loadConversations();
      setUnreadDirectMessages(getUnreadCountForPeer(list, identity.peerId));
    },
    [currentUser]
  );

  useEffect(() => {
    syncUnreadDirectMessages();
    return subscribeToP2PUpdates(() => syncUnreadDirectMessages());
  }, [syncUnreadDirectMessages]);

  // Poll notifications & account status every 10s when authenticated
  useEffect(() => {
    if (!currentUser) {
      setNotifications([]);
      shownNotificationIdsRef.current.clear();
      return;
    }

    syncNotificationsAndProfile();
    const interval = window.setInterval(syncNotificationsAndProfile, 10000);
    const onFocus = () => syncNotificationsAndProfile();
    window.addEventListener('focus', onFocus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [currentUser?.id, syncNotificationsAndProfile]);

  // Poll tracked password recovery request when logged out
  useEffect(() => {
    if (currentUser || !trackedRecoveryEmail) return;

    const checkRecovery = async () => {
      try {
        const res = await apiRequest<{
          found: boolean;
          id?: number;
          status?: 'Pendente' | 'Aprovado' | 'Rejeitado';
          adminNotes?: string | null;
        }>(`/api/auth/recovery-status?email=${encodeURIComponent(trackedRecoveryEmail)}`);

        if (res.found && res.id && (res.status === 'Aprovado' || res.status === 'Rejeitado')) {
          const seenId = Number(localStorage.getItem(SEEN_RECOVERY_DECISION_KEY) || 0);
          if (seenId !== res.id) {
            localStorage.setItem(SEEN_RECOVERY_DECISION_KEY, String(res.id));
            localStorage.removeItem(TRACKED_RECOVERY_EMAIL_KEY);
            setTrackedRecoveryEmail(null);

            const isApproved = res.status === 'Aprovado';
            setToasts((prev) => [
              {
                id: `recovery-${res.id}`,
                type: isApproved ? 'recovery_approved' : 'recovery_rejected',
                title: isApproved ? 'Alteração de Senha Aprovada' : 'Alteração de Senha Rejeitada',
                message: isApproved
                  ? `O Administrador Principal aprovou a nova palavra-passe para ${trackedRecoveryEmail}.${res.adminNotes ? ` Nota: ${res.adminNotes}` : ''}`
                  : `O Administrador Principal rejeitou o pedido de recuperação para ${trackedRecoveryEmail}.${res.adminNotes ? ` Motivo: ${res.adminNotes}` : ''}`,
                actionLabel: isApproved ? 'Iniciar Sessão Agora' : undefined,
                onAction: isApproved ? () => setAuthModalMode('login') : undefined,
              },
              ...prev,
            ]);
          }
        }
      } catch {
        // Ignore transient network errors
      }
    };

    checkRecovery();
    const interval = window.setInterval(checkRecovery, 10000);
    return () => window.clearInterval(interval);
  }, [currentUser, trackedRecoveryEmail]);

  const handleMarkNotificationRead = async (id: number) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    setToasts((prev) => prev.filter((t) => t.notificationId !== id));
    try {
      await apiRequest(`/api/users/notifications/${id}/read`, { method: 'PUT' });
    } catch {
      // Ignore error
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setToasts((prev) => prev.filter((t) => !t.notificationId));
    try {
      await apiRequest('/api/users/notifications/read-all', { method: 'PUT' });
    } catch {
      // Ignore error
    }
  };

  const handleDismissToast = (toast: ToastAlert) => {
    setToasts((prev) => prev.filter((t) => t.id !== toast.id));
    if (toast.notificationId) {
      handleMarkNotificationRead(toast.notificationId);
    }
  };

  const handleRecoverySubmitted = (email: string) => {
    localStorage.setItem(TRACKED_RECOVERY_EMAIL_KEY, email);
    setTrackedRecoveryEmail(email);
  };

  const handleAuthenticated = (user: User, notice?: string) => {
    setCurrentUser(user);
    savePersistedActiveUser(user);
    upsertPersistedAccount(user);
    setAuthModalMode(null);
    if (notice) {
      setGlobalNotice(notice);
    }
    if (user.role === 'ADMIN_PRINCIPAL') {
      setActiveView('principal-panel');
    } else if (user.role === 'ADMIN_AUXILIAR') {
      setActiveView('aux-panel');
    } else {
      setActiveView('user-panel');
    }
    fetchPublicOverview();
  };

  const handleLogout = () => {
    setStoredToken(null);
    savePersistedActiveUser(null);
    setCurrentUser(null);
    setActiveView('public');
    setGlobalNotice(null);
    setNotifications([]);
    setToasts([]);
    shownNotificationIdsRef.current.clear();
  };

  const handleNavigate = (view: ActiveView) => {
    if (view === 'principal-panel' && currentUser?.role !== 'ADMIN_PRINCIPAL') return;
    if (view === 'aux-panel' && currentUser?.role !== 'ADMIN_PRINCIPAL' && currentUser?.role !== 'ADMIN_AUXILIAR') return;
    if (view === 'user-panel' && !currentUser) return;
    setActiveView(view);
  };

  const handleGoToOwnPanel = () => {
    if (!currentUser) return;
    if (currentUser.role === 'ADMIN_PRINCIPAL') setActiveView('principal-panel');
    else if (currentUser.role === 'ADMIN_AUXILIAR') setActiveView('aux-panel');
    else setActiveView('user-panel');
  };

  const scrollToVitrine = () => {
    window.requestAnimationFrame(() => {
      const vitrineEl = document.getElementById('vitrine');
      if (vitrineEl) {
        vitrineEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  };

  const handleGlobalSearchSubmit = () => {
    if (activeView !== 'public') {
      setActiveView('public');
      window.setTimeout(scrollToVitrine, 80);
    } else {
      scrollToVitrine();
    }
  };

  const handleClearGlobalSearch = () => {
    setGlobalSearchQuery('');
    setGlobalCategoryFilter('Todos');
    setGlobalProvinceFilter('Todas');
  };

  const handleFocusGlobalSearch = useCallback(() => {
    const inputs = Array.from(
      document.querySelectorAll<HTMLInputElement>('input[data-global-search-input]')
    );
    const visibleInput = inputs.find((el) => el.offsetParent !== null) || inputs[0];
    if (visibleInput) {
      visibleInput.focus();
      visibleInput.select();
    }
  }, []);

  const handleCloseTopModal = useCallback(() => {
    if (authModalMode) {
      setAuthModalMode(null);
      return;
    }
    if (directChatOpen) {
      setDirectChatOpen(false);
      setDirectChatListing(null);
    }
  }, [authModalMode, directChatOpen]);

  return (
    <div className="min-h-screen bg-[#F7F9F7] text-[#111814]">
      <Navbar
        currentUser={currentUser}
        activeView={activeView}
        notifications={notifications}
        searchQuery={globalSearchQuery}
        categoryFilter={globalCategoryFilter}
        provinceFilter={globalProvinceFilter}
        onSearchQueryChange={setGlobalSearchQuery}
        onCategoryFilterChange={setGlobalCategoryFilter}
        onProvinceFilterChange={setGlobalProvinceFilter}
        onSearchSubmit={handleGlobalSearchSubmit}
        onClearSearch={handleClearGlobalSearch}
        unreadDirectMessages={unreadDirectMessages}
        onOpenDirectMessages={() => {
          setDirectChatListing(null);
          setDirectChatOpen(true);
        }}
        onMarkNotificationRead={handleMarkNotificationRead}
        onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
        onNavigate={handleNavigate}
        onOpenAuth={(mode) => setAuthModalMode(mode)}
        onOpenShortcutsHelp={() => setShortcutsHelpOpen(true)}
        theme={theme}
        onToggleTheme={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
        onLogout={handleLogout}
      />

      <NotificationToasts toasts={toasts} onDismiss={handleDismissToast} />

      {globalNotice && (
        <div className="border-b border-[#EAB308] bg-[#FEFCE8] px-4 py-2.5 text-xs text-[#713F12]">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
            <span className="font-medium">{globalNotice}</span>
            <button
              type="button"
              onClick={() => setGlobalNotice(null)}
              className="font-semibold underline hover:text-[#111814] shrink-0"
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      <main>
        {activeView === 'public' && (
          <PublicHome
            currentUser={currentUser}
            hasAnyUser={publicData.hasAnyUser || isLocalAdminInitialized()}
            settings={publicData.settings}
            campaigns={publicData.campaigns}
            listings={publicData.listings}
            searchQuery={globalSearchQuery}
            categoryFilter={globalCategoryFilter}
            provinceFilter={globalProvinceFilter}
            onSearchQueryChange={setGlobalSearchQuery}
            onCategoryFilterChange={setGlobalCategoryFilter}
            onProvinceFilterChange={setGlobalProvinceFilter}
            onClearSearch={handleClearGlobalSearch}
            onOpenDirectMessage={(listing) => {
              setDirectChatListing(listing);
              setDirectChatOpen(true);
            }}
            onOpenAuth={(mode) => setAuthModalMode(mode)}
            onGoToPanel={handleGoToOwnPanel}
          />
        )}

        {activeView === 'user-panel' && currentUser && (
          <ErrorBoundary
            boundaryName="Painel do Utilizador"
            resetKey={`${activeView}-${currentUser.id}`}
            onGoHome={() => setActiveView('public')}
          >
            <UserDashboard
              user={currentUser}
              onUserUpdated={(updated) => {
                setCurrentUser(updated);
                savePersistedActiveUser(updated);
                upsertPersistedAccount(updated);
              }}
              onListingChanged={fetchPublicOverview}
              onReplayTour={() => setTourReplayId((n) => n + 1)}
            />
          </ErrorBoundary>
        )}

        {activeView === 'aux-panel' &&
          (currentUser?.role === 'ADMIN_AUXILIAR' || currentUser?.role === 'ADMIN_PRINCIPAL') && (
            <ErrorBoundary
              boundaryName="Painel Auxiliar"
              resetKey={`${activeView}-${currentUser.id}`}
              onGoHome={() => setActiveView('public')}
            >
              <AuxAdminDashboard
                onDataChanged={fetchPublicOverview}
                onReplayTour={() => setTourReplayId((n) => n + 1)}
              />
            </ErrorBoundary>
          )}

        {activeView === 'principal-panel' && currentUser?.role === 'ADMIN_PRINCIPAL' && (
          <ErrorBoundary
            boundaryName="Painel Principal"
            resetKey={`${activeView}-${currentUser.id}`}
            onGoHome={() => setActiveView('public')}
          >
            <PrincipalAdminDashboard
              onDataChanged={fetchPublicOverview}
              onReplayTour={() => setTourReplayId((n) => n + 1)}
            />
          </ErrorBoundary>
        )}
      </main>

      <GlobalErrorListener activeView={activeView} />

      <PlatformTour
        user={currentUser}
        activeView={activeView}
        replayRequestId={tourReplayId}
      />

      <DirectMessagesModal
        isOpen={directChatOpen}
        currentUser={currentUser}
        targetListing={directChatListing}
        availableListings={publicData.listings}
        onClose={() => {
          setDirectChatOpen(false);
          setDirectChatListing(null);
        }}
        onConversationsUpdated={(updated) => syncUnreadDirectMessages(updated)}
      />

      <OfflineStatusBanner onReconnected={fetchPublicOverview} />

      <KeyboardShortcutsManager
        currentUser={currentUser}
        isHelpOpen={shortcutsHelpOpen}
        onOpenHelp={() => setShortcutsHelpOpen(true)}
        onCloseHelp={() => setShortcutsHelpOpen(false)}
        onFocusSearch={handleFocusGlobalSearch}
        onNavigate={handleNavigate}
        onToggleDirectMessages={() => {
          setDirectChatListing(null);
          setDirectChatOpen((prev) => !prev);
        }}
        onOpenAuth={(mode) => setAuthModalMode(mode)}
        onCloseTopModal={handleCloseTopModal}
      />

      {authModalMode && (
        <AuthModal
          initialMode={authModalMode}
          hasAnyUser={publicData.hasAnyUser || isLocalAdminInitialized()}
          onClose={() => setAuthModalMode(null)}
          onAuthenticated={handleAuthenticated}
          onRecoverySubmitted={handleRecoverySubmitted}
        />
      )}
    </div>
  );
}
