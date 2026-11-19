import React, { useMemo, useState } from 'react';
import { Check, CheckCircle2, Lock, Save, Search, Shield, ShieldOff, UserCog, UserPlus } from 'lucide-react';
import { apiRequest } from '../lib/api';
import type { AuxAdminPermission, User } from '../types';

interface AccessControlPanelProps {
  users: User[];
  onUpdated: () => Promise<void>;
}

interface PermissionDefinition {
  key: AuxAdminPermission;
  label: string;
  description: string;
  group: 'Moderação & Suporte' | 'Financeiro & Estratégia';
}

const PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  {
    key: 'moderate_listings',
    label: 'Moderar Produtos & Mascaramento',
    description: 'Eliminar anúncios impróprios e mascarar dados sensíveis nas fotografias.',
    group: 'Moderação & Suporte',
  },
  {
    key: 'moderate_users',
    label: 'Gerir Contas de Utilizadores',
    description: 'Ativar ou suspender contas de produtores e compradores.',
    group: 'Moderação & Suporte',
  },
  {
    key: 'reply_support',
    label: 'Responder a Suporte Técnico',
    description: 'Atender e encerrar pedidos de apoio enviados pelos utilizadores.',
    group: 'Moderação & Suporte',
  },
  {
    key: 'manage_quotas',
    label: 'Gerir Quotas de Membros',
    description: 'Acompanhar e validar pagamentos de quotas mensais de produtores.',
    group: 'Financeiro & Estratégia',
  },
  {
    key: 'manage_donations',
    label: 'Gerir Doações & Apoios',
    description: 'Confirmar, auditar ou arquivar contribuições institucionais.',
    group: 'Financeiro & Estratégia',
  },
  {
    key: 'manage_bonuses',
    label: 'Atribuir Bónus (AOA)',
    description: 'Conceder créditos promocionais a produtores ativos na plataforma.',
    group: 'Financeiro & Estratégia',
  },
  {
    key: 'view_analytics',
    label: 'Consultar Relatórios & Preços',
    description: 'Aceder a analíticas de mercado, mapa de calor provincial e indicadores.',
    group: 'Financeiro & Estratégia',
  },
  {
    key: 'manage_campaigns',
    label: 'Gerir Campanhas Institucionais',
    description: 'Criar e ativar banners de campanhas agrícolas na página pública.',
    group: 'Financeiro & Estratégia',
  },
];

interface RolePreset {
  name: string;
  summary: string;
  permissions: AuxAdminPermission[];
}

const ROLE_PRESETS: RolePreset[] = [
  {
    name: 'Moderador de Conteúdo',
    summary: 'Foco em qualidade da vitrine, mascaramento de imagens e resposta ao suporte.',
    permissions: ['moderate_listings', 'reply_support'],
  },
  {
    name: 'Gestor Financeiro',
    summary: 'Controlo de quotas, doações, atribuição de bónus e relatórios de preços.',
    permissions: ['manage_quotas', 'manage_donations', 'manage_bonuses', 'view_analytics'],
  },
  {
    name: 'Gestor de Comunidade & Suporte',
    summary: 'Moderação de contas, vitrine de produtos e atendimento de suporte.',
    permissions: ['moderate_listings', 'moderate_users', 'reply_support'],
  },
  {
    name: 'Analista & Marketing',
    summary: 'Consulta de analíticas provinciais, preços de mercado e gestão de campanhas.',
    permissions: ['view_analytics', 'manage_campaigns'],
  },
  {
    name: 'Administrador Auxiliar Completo',
    summary: 'Acesso delegado a todas as áreas operacionais permitidas a auxiliares.',
    permissions: PERMISSION_DEFINITIONS.map((p) => p.key),
  },
];

const detectPresetName = (perms: AuxAdminPermission[]): string => {
  const sorted = [...perms].sort().join('|');
  const match = ROLE_PRESETS.find((preset) => [...preset.permissions].sort().join('|') === sorted);
  return match ? match.name : 'Personalizado';
};

export const AccessControlPanel: React.FC<AccessControlPanelProps> = ({ users, onUpdated }) => {
  const [search, setSearch] = useState('');
  const [promoteUserId, setPromoteUserId] = useState<string>('');
  const [promotePreset, setPromotePreset] = useState<string>(ROLE_PRESETS[0].name);
  const [drafts, setDrafts] = useState<
    Record<number, { accessProfile: string; permissions: AuxAdminPermission[] }>
  >({});
  const [savingId, setSavingId] = useState<number | 'promote' | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const auxAdmins = useMemo(
    () => users.filter((u) => u.role === 'ADMIN_AUXILIAR'),
    [users]
  );

  const eligibleUsers = useMemo(
    () => users.filter((u) => u.role === 'USER' && u.status === 'Ativo'),
    [users]
  );

  const filteredAuxAdmins = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return auxAdmins;
    return auxAdmins.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.accessProfile || '').toLowerCase().includes(q) ||
        u.province.toLowerCase().includes(q)
    );
  }, [auxAdmins, search]);

  const getCurrentConfig = (u: User) => {
    const draft = drafts[u.id];
    if (draft) return draft;
    const basePerms: AuxAdminPermission[] = Array.isArray(u.permissions)
      ? u.permissions
      : ['moderate_listings', 'moderate_users', 'reply_support'];
    return {
      accessProfile: u.accessProfile || detectPresetName(basePerms),
      permissions: basePerms,
    };
  };

  const isDirty = (u: User): boolean => {
    const draft = drafts[u.id];
    if (!draft) return false;
    const origPerms = [...(u.permissions || [])].sort().join('|');
    const draftPerms = [...draft.permissions].sort().join('|');
    return origPerms !== draftPerms || (u.accessProfile || '') !== draft.accessProfile;
  };

  const handleApplyPreset = (u: User, presetName: string) => {
    const preset = ROLE_PRESETS.find((p) => p.name === presetName);
    if (!preset) return;
    setDrafts((prev) => ({
      ...prev,
      [u.id]: {
        accessProfile: preset.name,
        permissions: [...preset.permissions],
      },
    }));
  };

  const handleTogglePermission = (u: User, perm: AuxAdminPermission) => {
    const current = getCurrentConfig(u);
    const exists = current.permissions.includes(perm);
    const nextPermissions = exists
      ? current.permissions.filter((p) => p !== perm)
      : [...current.permissions, perm];
    setDrafts((prev) => ({
      ...prev,
      [u.id]: {
        accessProfile: detectPresetName(nextPermissions),
        permissions: nextPermissions,
      },
    }));
  };

  const handleSavePermissions = async (u: User) => {
    const config = getCurrentConfig(u);
    setFeedback(null);
    setSavingId(u.id);
    try {
      await apiRequest(`/api/admin/principal/users/${u.id}/permissions`, {
        method: 'PUT',
        body: JSON.stringify({
          role: 'ADMIN_AUXILIAR',
          accessProfile: config.accessProfile,
          permissions: config.permissions,
        }),
      });
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[u.id];
        return next;
      });
      setFeedback({
        type: 'ok',
        text: `Permissões de ${u.name} atualizadas para "${config.accessProfile}" (${config.permissions.length} permissões ativas).`,
      });
      await onUpdated();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao guardar permissões.',
      });
    } finally {
      setSavingId(null);
    }
  };

  const handleRevokeAuxAccess = async (u: User) => {
    setFeedback(null);
    setSavingId(u.id);
    try {
      await apiRequest(`/api/admin/principal/users/${u.id}/permissions`, {
        method: 'PUT',
        body: JSON.stringify({
          role: 'USER',
          accessProfile: 'Utilizador Padrão',
          permissions: [],
        }),
      });
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[u.id];
        return next;
      });
      setFeedback({
        type: 'ok',
        text: `Acesso de Administrador Auxiliar revogado para ${u.name}.`,
      });
      await onUpdated();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao revogar acesso.',
      });
    } finally {
      setSavingId(null);
    }
  };

  const handlePromoteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetId = Number(promoteUserId);
    if (!targetId) return;
    const preset = ROLE_PRESETS.find((p) => p.name === promotePreset) || ROLE_PRESETS[0];
    setFeedback(null);
    setSavingId('promote');
    try {
      await apiRequest(`/api/admin/principal/users/${targetId}/permissions`, {
        method: 'PUT',
        body: JSON.stringify({
          role: 'ADMIN_AUXILIAR',
          accessProfile: preset.name,
          permissions: preset.permissions,
        }),
      });
      setPromoteUserId('');
      setFeedback({
        type: 'ok',
        text: `Conta promovida a Administrador Auxiliar com o perfil "${preset.name}".`,
      });
      await onUpdated();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao atribuir nível de acesso.',
      });
    } finally {
      setSavingId(null);
    }
  };

  const moderatorsCount = auxAdmins.filter(
    (u) => u.permissions?.includes('moderate_listings')
  ).length;
  const financialManagersCount = auxAdmins.filter(
    (u) =>
      u.permissions?.includes('manage_quotas') ||
      u.permissions?.includes('manage_donations') ||
      u.permissions?.includes('manage_bonuses')
  ).length;

  return (
    <div className="space-y-6">
      {feedback && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            feedback.type === 'ok'
              ? 'border-[#BBF7D0] bg-[#EEF7F0] text-[#14532D]'
              : 'border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-[#DCE5DE] bg-white p-5">
          <div className="text-xs font-medium text-[#546459]">Administradores Auxiliares</div>
          <div className="mt-1 font-display text-2xl font-extrabold text-[#14532D] font-mono-tabular">
            {auxAdmins.length}
          </div>
          <div className="mt-0.5 text-[11px] text-[#546459]">Contas com permissões delegadas</div>
        </div>

        <div className="rounded-xl border border-[#DCE5DE] bg-white p-5">
          <div className="text-xs font-medium text-[#546459]">Com Moderação de Conteúdo</div>
          <div className="mt-1 font-display text-2xl font-extrabold text-[#111814] font-mono-tabular">
            {moderatorsCount}
          </div>
          <div className="mt-0.5 text-[11px] text-[#546459]">Podem moderar vitrine e imagens</div>
        </div>

        <div className="rounded-xl border border-[#DCE5DE] bg-white p-5">
          <div className="text-xs font-medium text-[#546459]">Com Acesso Financeiro</div>
          <div className="mt-1 font-display text-2xl font-extrabold text-[#CA8A04] font-mono-tabular">
            {financialManagersCount}
          </div>
          <div className="mt-0.5 text-[11px] text-[#546459]">Quotas, doações ou bónus</div>
        </div>

        <div className="rounded-xl border border-[#DCE5DE] bg-white p-5">
          <div className="text-xs font-medium text-[#546459]">Utilizadores Elegíveis</div>
          <div className="mt-1 font-display text-2xl font-extrabold text-[#15803D] font-mono-tabular">
            {eligibleUsers.length}
          </div>
          <div className="mt-0.5 text-[11px] text-[#546459]">Contas ativas prontas a delegar</div>
        </div>
      </div>

      {/* Promote Active User to Auxiliary Admin */}
      <form
        onSubmit={handlePromoteUser}
        className="rounded-xl border border-[#DCE5DE] bg-white p-6 space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#EDF2EE] pb-3">
          <div>
            <h2 className="font-display text-base font-bold text-[#111814] flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-[#15803D]" />
              Atribuir Novo Administrador Auxiliar
            </h2>
            <p className="text-xs text-[#546459] mt-0.5">
              Promova uma conta ativa e associe imediatamente um perfil de permissões (ex.: Moderador de Conteúdo ou Gestor Financeiro).
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-5">
            <label className="block text-xs font-semibold text-[#1C2720] mb-1">
              Conta de Utilizador Ativo
            </label>
            <select
              value={promoteUserId}
              onChange={(e) => setPromoteUserId(e.target.value)}
              required
              className="w-full rounded-lg border border-[#D4DDD6] bg-white px-3 py-2 text-xs text-[#1C2720] focus:border-[#15803D] focus:outline-none"
            >
              <option value="">Selecionar utilizador...</option>
              {eligibleUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.email}) · {u.province}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-4">
            <label className="block text-xs font-semibold text-[#1C2720] mb-1">
              Perfil de Acesso Inicial
            </label>
            <select
              value={promotePreset}
              onChange={(e) => setPromotePreset(e.target.value)}
              className="w-full rounded-lg border border-[#D4DDD6] bg-white px-3 py-2 text-xs text-[#1C2720] focus:border-[#15803D] focus:outline-none"
            >
              {ROLE_PRESETS.map((preset) => (
                <option key={preset.name} value={preset.name}>
                  {preset.name} ({preset.permissions.length} permissões)
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-3">
            <button
              type="submit"
              disabled={!promoteUserId || savingId === 'promote'}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#14532D] px-4 py-2 text-xs font-bold text-white hover:bg-[#15803D] disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              <Shield className="w-3.5 h-3.5" />
              {savingId === 'promote' ? 'A atribuir...' : 'Atribuir Acesso'}
            </button>
          </div>
        </div>
      </form>

      {/* Active Auxiliary Administrators & Granular Permissions */}
      <div className="rounded-xl border border-[#DCE5DE] bg-white p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#EDF2EE] pb-4">
          <div>
            <h2 className="font-display text-lg font-bold text-[#111814] flex items-center gap-2">
              <UserCog className="w-5 h-5 text-[#15803D]" />
              Gestão de Permissões Granulares
            </h2>
            <p className="text-xs text-[#546459] mt-0.5">
              Personalize exatamente o que cada administrador auxiliar pode executar. Todas as alterações ficam registadas nos logs de auditoria.
            </p>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-[#546459] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar auxiliar ou perfil..."
              className="w-full rounded-lg border border-[#D4DDD6] bg-white pl-8 pr-3 py-1.5 text-xs text-[#1C2720] focus:border-[#15803D] focus:outline-none"
            />
          </div>
        </div>

        {filteredAuxAdmins.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#C7D3CA] bg-[#F7F9F7] px-6 py-10 text-center">
            <Lock className="w-7 h-7 text-[#15803D] mx-auto mb-2" />
            <p className="text-sm font-semibold text-[#111814]">
              {auxAdmins.length === 0
                ? 'Nenhum administrador auxiliar atribuído até ao momento'
                : 'Nenhum administrador auxiliar corresponde à pesquisa'}
            </p>
            <p className="mt-1 text-xs text-[#546459] max-w-md mx-auto">
              Utilize o formulário acima para promover uma conta ativa para Moderador de Conteúdo, Gestor Financeiro ou outro perfil granular.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#EDF2EE]">
            {filteredAuxAdmins.map((admin) => {
              const config = getCurrentConfig(admin);
              const dirty = isDirty(admin);
              const isSaving = savingId === admin.id;
              const modPerms = PERMISSION_DEFINITIONS.filter((p) => p.group === 'Moderação & Suporte');
              const finPerms = PERMISSION_DEFINITIONS.filter((p) => p.group === 'Financeiro & Estratégia');

              return (
                <div key={admin.id} className="py-5 first:pt-0 last:pb-0 space-y-4">
                  {/* Admin Row Header */}
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={admin.profilePhoto}
                        alt={admin.name}
                        className="w-10 h-10 rounded-full object-cover border border-[#DCE5DE] shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="font-display text-sm font-bold text-[#111814] truncate">
                            {admin.name}
                          </span>
                          <span className="text-xs text-[#546459]">·</span>
                          <span className="text-xs font-semibold text-[#15803D]">
                            {config.accessProfile}
                          </span>
                          {dirty && (
                            <>
                              <span className="text-xs text-[#546459]">·</span>
                              <span className="text-xs font-semibold text-[#CA8A04]">
                                Alterações por guardar
                              </span>
                            </>
                          )}
                        </div>
                        <div className="text-xs text-[#546459] truncate">
                          {admin.email} · {admin.province} ·{' '}
                          <span className="font-mono-tabular">
                            {config.permissions.length}/{PERMISSION_DEFINITIONS.length} permissões
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <select
                        value={
                          ROLE_PRESETS.some((p) => p.name === config.accessProfile)
                            ? config.accessProfile
                            : 'Personalizado'
                        }
                        onChange={(e) => {
                          if (e.target.value !== 'Personalizado') {
                            handleApplyPreset(admin, e.target.value);
                          }
                        }}
                        aria-label={`Perfil predefinido para ${admin.name}`}
                        className="rounded-lg border border-[#D4DDD6] bg-white px-2.5 py-1.5 text-xs font-medium text-[#1C2720] focus:border-[#15803D] focus:outline-none"
                      >
                        {ROLE_PRESETS.map((preset) => (
                          <option key={preset.name} value={preset.name}>
                            Perfil: {preset.name}
                          </option>
                        ))}
                        <option value="Personalizado">Perfil: Personalizado</option>
                      </select>

                      <button
                        type="button"
                        onClick={() => handleSavePermissions(admin)}
                        disabled={!dirty || isSaving}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#14532D] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#15803D] disabled:opacity-45 transition-colors whitespace-nowrap"
                      >
                        <Save className="w-3.5 h-3.5" />
                        {isSaving ? 'A guardar...' : 'Guardar Permissões'}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRevokeAuxAccess(admin)}
                        disabled={isSaving}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 dark:border-red-900/50 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-45 transition-colors whitespace-nowrap"
                      >
                        <ShieldOff className="w-3.5 h-3.5" />
                        Revogar
                      </button>
                    </div>
                  </div>

                  {/* Granular Checkboxes Matrix */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-1">
                    {[
                      { title: 'Moderação & Suporte', items: modPerms },
                      { title: 'Financeiro & Estratégia', items: finPerms },
                    ].map((group) => (
                      <div key={group.title} className="space-y-2">
                        <div className="text-[11px] font-bold text-[#546459] tracking-wide">
                          {group.title}
                        </div>
                        <div className="space-y-1.5">
                          {group.items.map((perm) => {
                            const checked = config.permissions.includes(perm.key);
                            return (
                              <label
                                key={perm.key}
                                className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                                  checked
                                    ? 'border-[#15803D]/50 bg-[#EEF7F0]'
                                    : 'border-[#EDF2EE] bg-[#FAFDFB] hover:border-[#D4DDD6]'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => handleTogglePermission(admin, perm.key)}
                                  className="mt-0.5 h-4 w-4 rounded border-[#C7D3CA] accent-[#14532D] cursor-pointer"
                                />
                                <div className="min-w-0">
                                  <div className="text-xs font-semibold text-[#111814]">
                                    {perm.label}
                                  </div>
                                  <div className="text-[11px] text-[#546459] leading-snug">
                                    {perm.description}
                                  </div>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Built-in Access Profiles Reference Table */}
      <div className="rounded-xl border border-[#DCE5DE] bg-white p-6 space-y-4">
        <div>
          <h3 className="font-display text-base font-bold text-[#111814]">
            Matriz de Referência dos Níveis de Acesso Predefinidos
          </h3>
          <p className="text-xs text-[#546459] mt-0.5">
            Resumo das permissões incluídas em cada perfil padrão para facilitar a governação da equipa.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#DCE5DE] text-[#546459]">
                <th className="py-2.5 pr-4 font-semibold">Perfil</th>
                {PERMISSION_DEFINITIONS.map((p) => (
                  <th key={p.key} className="py-2.5 px-2 font-semibold text-center whitespace-nowrap">
                    {p.label.split(' ')[0]} {p.label.split(' ')[1] || ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EDF2EE]">
              {ROLE_PRESETS.map((preset) => (
                <tr key={preset.name} className="hover:bg-[#FAFDFB]">
                  <td className="py-2.5 pr-4">
                    <div className="font-semibold text-[#111814]">{preset.name}</div>
                    <div className="text-[11px] text-[#546459]">{preset.summary}</div>
                  </td>
                  {PERMISSION_DEFINITIONS.map((p) => {
                    const included = preset.permissions.includes(p.key);
                    return (
                      <td key={p.key} className="py-2.5 px-2 text-center">
                        {included ? (
                          <CheckCircle2 className="w-4 h-4 text-[#15803D] inline-block" aria-label="Incluído" />
                        ) : (
                          <span className="text-[#9AA89F]" aria-label="Não incluído">
                            —
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr className="bg-[#F2F7F3]/70">
                <td className="py-2.5 pr-4">
                  <div className="font-bold text-[#14532D]">Administrador Principal</div>
                  <div className="text-[11px] text-[#546459]">
                    Controlo soberano total (inclui finanças, SMTP, backups e níveis de acesso).
                  </div>
                </td>
                {PERMISSION_DEFINITIONS.map((p) => (
                  <td key={p.key} className="py-2.5 px-2 text-center">
                    <Check className="w-4 h-4 text-[#14532D] inline-block" aria-label="Total" />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
