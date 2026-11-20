import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, MessageCircle, Moon, Search, SlidersHorizontal, Sun, X } from 'lucide-react';
import { ANGOLA_PROVINCES } from '../lib/api';
import type { AppNotification, User } from '../types';
import { NotificationBell } from './NotificationCenter';
import { PWAInstallButton } from './PWAInstallButton';

export type ActiveView = 'public' | 'user-panel' | 'aux-panel' | 'principal-panel';
export type VitrineCategoryFilter = 'Todos' | 'Produto Agrícola' | 'Consultoria/Formação';

interface NavbarProps {
  currentUser: User | null;
  activeView: ActiveView;
  notifications: AppNotification[];
  searchQuery: string;
  categoryFilter: VitrineCategoryFilter;
  provinceFilter: string;
  onSearchQueryChange: (value: string) => void;
  onCategoryFilterChange: (value: VitrineCategoryFilter) => void;
  onProvinceFilterChange: (value: string) => void;
  onSearchSubmit: () => void;
  onClearSearch: () => void;
  unreadDirectMessages: number;
  onOpenDirectMessages: () => void;
  onMarkNotificationRead: (id: number) => void;
  onMarkAllNotificationsRead: () => void;
  onNavigate: (view: ActiveView) => void;
  onOpenAuth: (mode: 'login' | 'register') => void;
  onOpenShortcutsHelp: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  activeView,
  notifications,
  searchQuery,
  categoryFilter,
  provinceFilter,
  onSearchQueryChange,
  onCategoryFilterChange,
  onProvinceFilterChange,
  onSearchSubmit,
  onClearSearch,
  unreadDirectMessages,
  onOpenDirectMessages,
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  onNavigate,
  onOpenAuth,
  onOpenShortcutsHelp,
  theme,
  onToggleTheme,
  onLogout,
}) => {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterPopoverRef = useRef<HTMLDivElement | null>(null);

  const hasActiveFacet = categoryFilter !== 'Todos' || provinceFilter !== 'Todas';
  const hasAnySearchFilter = searchQuery.trim().length > 0 || hasActiveFacet;

  useEffect(() => {
    if (!filtersOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (filterPopoverRef.current && !filterPopoverRef.current.contains(event.target as Node)) {
        setFiltersOpen(false);
      }
    };
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFiltersOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [filtersOpen]);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFiltersOpen(false);
    onSearchSubmit();
  };

  return (
    <header className="sticky top-0 z-40 border-b border-[#DCE5DE] bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 lg:gap-6 px-4 sm:px-6 lg:px-8 py-3">
        {/* Zone 1: Single text element wordmark */}
        <button
          type="button"
          onClick={() => onNavigate('public')}
          className="font-display text-xl font-extrabold tracking-tight text-[#14532D] whitespace-nowrap shrink-0 hover:opacity-85 transition-opacity"
        >
          Nzila Agro
        </button>

        {/* Global Search Bar (Desktop) */}
        <div ref={filterPopoverRef} className="relative hidden md:block flex-1 max-w-sm lg:max-w-md">
          <form
            onSubmit={handleFormSubmit}
            className="flex items-center rounded-lg border border-[#D4DDD6] bg-[#F7F9F7] focus-within:border-[#15803D] focus-within:bg-white transition-colors"
          >
            <Search className="w-4 h-4 text-[#546459] ml-3 shrink-0" aria-hidden="true" />
            <input
              type="text"
              data-global-search-input="desktop"
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              placeholder="Pesquisar produto, categoria ou província..."
              aria-label="Pesquisar produtos e serviços por nome, categoria ou província"
              className="w-full bg-transparent px-2.5 py-2 text-xs text-[#111814] placeholder:text-[#6B7A70] focus:outline-none"
            />
            {!hasAnySearchFilter && (
              <kbd className="hidden lg:inline-flex items-center rounded border border-[#D4DDD6] bg-white px-1.5 py-0.5 font-mono-tabular text-[10px] font-semibold text-[#546459] mr-1 shrink-0">
                Ctrl+K
              </kbd>
            )}
            {hasAnySearchFilter && (
              <button
                type="button"
                onClick={onClearSearch}
                title="Limpar pesquisa e filtros"
                aria-label="Limpar pesquisa e filtros"
                className="p-1.5 text-[#546459] hover:text-[#111814] transition-colors shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setFiltersOpen((prev) => !prev)}
              aria-expanded={filtersOpen}
              aria-label="Filtrar por categoria ou província"
              className={`mr-1 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 ${
                hasActiveFacet || filtersOpen
                  ? 'bg-[#14532D] text-white'
                  : 'text-[#445449] hover:bg-[#E8F0EA] hover:text-[#14532D]'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Filtros</span>
            </button>
          </form>

          {filtersOpen && (
            <div className="absolute left-0 right-0 top-full mt-2 rounded-xl border border-[#DCE5DE] bg-white p-4 shadow-lg z-50 space-y-3.5">
              <div>
                <label
                  htmlFor="navbar-category-filter"
                  className="block text-[11px] font-semibold text-[#445449] mb-1.5"
                >
                  Categoria
                </label>
                <div id="navbar-category-filter" className="grid grid-cols-3 gap-1 rounded-lg bg-[#F2F7F3] p-1 border border-[#DCE5DE]">
                  {(['Todos', 'Produto Agrícola', 'Consultoria/Formação'] as const).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => onCategoryFilterChange(cat)}
                      className={`rounded-md px-2 py-1.5 text-[11px] font-semibold transition-colors truncate ${
                        categoryFilter === cat
                          ? 'bg-[#14532D] text-white'
                          : 'text-[#445449] hover:text-[#111814]'
                      }`}
                    >
                      {cat === 'Consultoria/Formação' ? 'Consultoria' : cat}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label
                  htmlFor="navbar-province-filter"
                  className="block text-[11px] font-semibold text-[#445449] mb-1.5"
                >
                  Província
                </label>
                <select
                  id="navbar-province-filter"
                  value={provinceFilter}
                  onChange={(e) => onProvinceFilterChange(e.target.value)}
                  className="w-full rounded-lg border border-[#D4DDD6] bg-white px-3 py-2 text-xs font-medium text-[#1C2720] focus:border-[#15803D] focus:outline-none"
                >
                  <option value="Todas">Todas as Províncias</option>
                  {ANGOLA_PROVINCES.map((prov) => (
                    <option key={prov} value={prov}>
                      {prov}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#EDF2EE]">
                <button
                  type="button"
                  onClick={() => {
                    onClearSearch();
                    setFiltersOpen(false);
                  }}
                  className="text-xs font-semibold text-[#546459] hover:text-[#111814] transition-colors"
                >
                  Limpar filtros
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFiltersOpen(false);
                    onSearchSubmit();
                  }}
                  className="rounded-lg bg-[#14532D] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#15803D] transition-colors whitespace-nowrap"
                >
                  Ver na Vitrine
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Zone 2: Concise single-line navigation links */}
        <nav className="hidden xl:flex items-center gap-5 text-sm font-medium text-[#445449]">
          <button
            type="button"
            onClick={() => onNavigate('public')}
            className={`whitespace-nowrap shrink-0 transition-colors hover:text-[#14532D] ${
              activeView === 'public' ? 'text-[#14532D] underline underline-offset-4 decoration-[#EAB308] decoration-2' : ''
            }`}
          >
            Vitrine Pública
          </button>

          {currentUser && (
            <button
              type="button"
              onClick={() => onNavigate('user-panel')}
              className={`whitespace-nowrap shrink-0 transition-colors hover:text-[#14532D] ${
                activeView === 'user-panel' ? 'text-[#14532D] underline underline-offset-4 decoration-[#EAB308] decoration-2' : ''
              }`}
            >
              Painel do Utilizador
            </button>
          )}

          {(currentUser?.role === 'ADMIN_AUXILIAR' || currentUser?.role === 'ADMIN_PRINCIPAL') && (
            <button
              type="button"
              onClick={() => onNavigate('aux-panel')}
              className={`whitespace-nowrap shrink-0 transition-colors hover:text-[#14532D] ${
                activeView === 'aux-panel' ? 'text-[#14532D] underline underline-offset-4 decoration-[#EAB308] decoration-2' : ''
              }`}
            >
              Admin Auxiliar
            </button>
          )}

          {currentUser?.role === 'ADMIN_PRINCIPAL' && (
            <button
              type="button"
              onClick={() => onNavigate('principal-panel')}
              className={`whitespace-nowrap shrink-0 transition-colors hover:text-[#14532D] ${
                activeView === 'principal-panel' ? 'text-[#14532D] underline underline-offset-4 decoration-[#EAB308] decoration-2' : ''
              }`}
            >
              Admin Principal
            </button>
          )}

          {!currentUser && (
            <>
              <a
                href="#vitrine"
                onClick={() => onNavigate('public')}
                className="whitespace-nowrap shrink-0 transition-colors hover:text-[#14532D]"
              >
                Produtos
              </a>
              <a
                href="#pagamentos"
                onClick={() => onNavigate('public')}
                className="whitespace-nowrap shrink-0 transition-colors hover:text-[#14532D]"
              >
                Pagamentos
              </a>
              <a
                href="#campanhas"
                onClick={() => onNavigate('public')}
                className="whitespace-nowrap shrink-0 transition-colors hover:text-[#14532D]"
              >
                Campanhas
              </a>
            </>
          )}
        </nav>

        {/* Zone 3: Primary action & functional notification center */}
        <div className="flex items-center gap-2 shrink-0">
          <PWAInstallButton />
          <button
            type="button"
            onClick={onToggleTheme}
            title={theme === 'dark' ? 'Mudar para Modo Claro' : 'Mudar para Modo Escuro'}
            aria-label={theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
            aria-pressed={theme === 'dark'}
            className="inline-flex items-center justify-center rounded-lg border border-[#D4DDD6] bg-white p-2 text-[#14532D] hover:bg-[#F2F7F3] active:scale-95 transition-all duration-200 shrink-0"
          >
            <span className="relative block w-4 h-4 overflow-hidden">
              <Sun
                aria-hidden="true"
                className={`absolute inset-0 w-4 h-4 text-[#FACC15] transition-all duration-300 ease-in-out motion-reduce:transition-none ${
                  theme === 'dark'
                    ? 'rotate-0 scale-100 opacity-100'
                    : '-rotate-90 scale-0 opacity-0'
                }`}
              />
              <Moon
                aria-hidden="true"
                className={`absolute inset-0 w-4 h-4 transition-all duration-300 ease-in-out motion-reduce:transition-none ${
                  theme === 'dark'
                    ? 'rotate-90 scale-0 opacity-0'
                    : 'rotate-0 scale-100 opacity-100'
                }`}
              />
            </span>
          </button>
          <button
            type="button"
            onClick={onOpenShortcutsHelp}
            title="Atalhos de Teclado (?)"
            aria-label="Ver atalhos de teclado globais"
            className="hidden sm:inline-flex items-center justify-center rounded-lg border border-[#D4DDD6] bg-white p-2 text-[#14532D] hover:bg-[#F2F7F3] transition-colors shrink-0"
          >
            <Keyboard className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onOpenDirectMessages}
            title="Mensagens Diretas (Comprador ↔ Produtor)"
            aria-label="Abrir mensagens diretas"
            className="relative inline-flex items-center justify-center rounded-lg border border-[#D4DDD6] bg-white p-2 text-[#14532D] hover:bg-[#F2F7F3] transition-colors shrink-0"
          >
            <MessageCircle className="w-4 h-4" />
            {unreadDirectMessages > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#EAB308] px-1 text-[10px] font-bold text-[#111814] font-mono-tabular">
                {unreadDirectMessages > 9 ? '9+' : unreadDirectMessages}
              </span>
            )}
          </button>
          {currentUser ? (
            <>
              <span data-tour="nav-notifications" className="inline-flex">
                <NotificationBell
                  notifications={notifications}
                  onMarkRead={onMarkNotificationRead}
                  onMarkAllRead={onMarkAllNotificationsRead}
                />
              </span>
              <button
                type="button"
                onClick={onLogout}
                className="rounded-lg border border-[#D4DDD6] bg-white px-4 py-2 text-xs font-semibold text-[#1C2720] hover:bg-[#F2F7F3] transition-colors whitespace-nowrap shrink-0"
              >
                Terminar Sessão
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => onOpenAuth('login')}
              className="rounded-lg bg-[#14532D] px-4 py-2 text-xs font-semibold text-white hover:bg-[#15803D] transition-colors whitespace-nowrap shrink-0"
            >
              Entrar / Registar
            </button>
          )}
        </div>
      </div>

      {/* Compact mobile search bar */}
      <div className="md:hidden border-t border-[#EDF2EE] px-4 py-2 bg-white">
        <form
          onSubmit={handleFormSubmit}
          className="flex items-center rounded-lg border border-[#D4DDD6] bg-[#F7F9F7] focus-within:border-[#15803D] focus-within:bg-white transition-colors"
        >
          <Search className="w-4 h-4 text-[#546459] ml-3 shrink-0" aria-hidden="true" />
          <input
            type="text"
            data-global-search-input="mobile"
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            placeholder="Pesquisar nome, categoria ou província..."
            aria-label="Pesquisar produtos e serviços"
            className="w-full bg-transparent px-2.5 py-2 text-xs text-[#111814] placeholder:text-[#6B7A70] focus:outline-none"
          />
          {hasAnySearchFilter && (
            <button
              type="button"
              onClick={onClearSearch}
              aria-label="Limpar pesquisa"
              className="p-1.5 text-[#546459] hover:text-[#111814] shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </form>
      </div>

      {/* Compact secondary navigation row for tablet/mobile when authenticated */}
      {currentUser && (
        <div className="flex xl:hidden items-center gap-4 overflow-x-auto border-t border-[#EDF2EE] px-4 sm:px-6 py-2 text-xs font-medium text-[#445449]">
          <button
            type="button"
            onClick={() => onNavigate('public')}
            className={`whitespace-nowrap shrink-0 ${activeView === 'public' ? 'text-[#14532D] font-semibold' : ''}`}
          >
            Vitrine Pública
          </button>
          <button
            type="button"
            onClick={() => onNavigate('user-panel')}
            className={`whitespace-nowrap shrink-0 ${activeView === 'user-panel' ? 'text-[#14532D] font-semibold' : ''}`}
          >
            Painel do Utilizador
          </button>
          {(currentUser.role === 'ADMIN_AUXILIAR' || currentUser.role === 'ADMIN_PRINCIPAL') && (
            <button
              type="button"
              onClick={() => onNavigate('aux-panel')}
              className={`whitespace-nowrap shrink-0 ${activeView === 'aux-panel' ? 'text-[#14532D] font-semibold' : ''}`}
            >
              Admin Auxiliar
            </button>
          )}
          {currentUser.role === 'ADMIN_PRINCIPAL' && (
            <button
              type="button"
              onClick={() => onNavigate('principal-panel')}
              className={`whitespace-nowrap shrink-0 ${activeView === 'principal-panel' ? 'text-[#14532D] font-semibold' : ''}`}
            >
              Admin Principal
            </button>
          )}
        </div>
      )}
    </header>
  );
};

