import type { User } from '../types';

const ADMIN_INITIALIZED_KEY = 'nzila_admin_initialized_v1';
const PERSISTED_ACTIVE_USER_KEY = 'nzila_persisted_active_user_v1';
const PERSISTED_ACCOUNTS_VAULT_KEY = 'nzila_persisted_accounts_vault_v1';

export interface PersistedAccountRecord {
  email: string;
  password?: string;
  name: string;
  age: number;
  province: string;
  profession: string;
  phone: string;
  whatsapp: string;
  profilePhoto: string;
  role: User['role'];
  status: User['status'];
  quotaActive: boolean;
  quotaExpiresAt: string | null;
  subscriptionPlan?: string;
  featuredCredits?: number;
}

export function isLocalAdminInitialized(): boolean {
  try {
    return localStorage.getItem(ADMIN_INITIALIZED_KEY) === '1';
  } catch {
    return false;
  }
}

export function markLocalAdminInitialized(): void {
  try {
    localStorage.setItem(ADMIN_INITIALIZED_KEY, '1');
  } catch {
    // ignore storage errors
  }
}

export function loadPersistedActiveUser(): User | null {
  try {
    const raw = localStorage.getItem(PERSISTED_ACTIVE_USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as User;
    if (parsed && typeof parsed.email === 'string' && typeof parsed.role === 'string') {
      return parsed;
    }
  } catch {
    // ignore malformed storage
  }
  return null;
}

export function savePersistedActiveUser(user: User | null): void {
  try {
    if (!user) {
      localStorage.removeItem(PERSISTED_ACTIVE_USER_KEY);
      return;
    }
    const compactUser: User = {
      ...user,
      verificationVideo: undefined,
    };
    localStorage.setItem(PERSISTED_ACTIVE_USER_KEY, JSON.stringify(compactUser));
    if (user.role === 'ADMIN_PRINCIPAL') {
      markLocalAdminInitialized();
    }
  } catch {
    // ignore storage quota errors
  }
}

export function loadPersistedAccountsVault(): PersistedAccountRecord[] {
  try {
    const raw = localStorage.getItem(PERSISTED_ACCOUNTS_VAULT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function upsertPersistedAccount(user: User, rawPassword?: string): void {
  try {
    const list = loadPersistedAccountsVault();
    const email = user.email.trim().toLowerCase();
    const existing = list.find((a) => a.email === email);

    // Keep profile photo lightweight in localStorage (skip > 120KB data URLs)
    const safePhoto =
      user.profilePhoto && user.profilePhoto.length < 120_000
        ? user.profilePhoto
        : existing?.profilePhoto || '/icon.svg';

    const record: PersistedAccountRecord = {
      email,
      password: rawPassword || existing?.password,
      name: user.name,
      age: user.age,
      province: user.province,
      profession: user.profession,
      phone: user.phone,
      whatsapp: user.whatsapp,
      profilePhoto: safePhoto,
      role: user.role,
      status: user.status,
      quotaActive: user.quotaActive,
      quotaExpiresAt: user.quotaExpiresAt,
      subscriptionPlan: user.subscriptionPlan,
      featuredCredits: user.featuredCredits,
    };

    const next = [...list.filter((a) => a.email !== email), record];
    localStorage.setItem(PERSISTED_ACCOUNTS_VAULT_KEY, JSON.stringify(next));
    markLocalAdminInitialized();
  } catch {
    // ignore storage quota errors
  }
}

export function syncPersistedUsersFromAdmin(users: User[]): void {
  if (!Array.isArray(users) || users.length === 0) return;
  for (const u of users) {
    upsertPersistedAccount(u);
  }
}
