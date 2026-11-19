import React, { useEffect, useMemo } from 'react';
import { Keyboard, X } from 'lucide-react';
import type { User } from '../types';
import type { ActiveView } from './Navbar';

interface KeyboardShortcutsManagerProps {
  currentUser: User | null;
  isHelpOpen: boolean;
  onOpenHelp: () => void;
  onCloseHelp: () => void;
  onFocusSearch: () => void;
  onNavigate: (view: ActiveView) => void;
  onToggleDirectMessages: () => void;
  onOpenAuth: (mode: 'login' | 'register') => void;
  onCloseTopModal: () => void;
}

interface ShortcutItem {
  keys: string[];
  label: string;
  description: string;
  section: 'actions' | 'navigation';
  onTrigger?: () => void;
}

const isEditableElement = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if (target.isContentEditable) return true;
  return false;
};

export const KeyboardShortcutsManager: React.FC<KeyboardShortcutsManagerProps> = ({
  currentUser,
  isHelpOpen,
  onOpenHelp,
  onCloseHelp,
  onFocusSearch,
  onNavigate,
  onToggleDirectMessages,
  onOpenAuth,
  onCloseTopModal,
}) => {
  const isMac = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);
  }, []);

  const modKey = isMac ? '⌘' : 'Ctrl';

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const hasPrimaryMod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      // 1. Ctrl+K / Cmd+K -> Focus global search
      if (hasPrimaryMod && !event.altKey && !event.shiftKey && key === 'k') {
        event.preventDefault();
        onCloseHelp();
        onFocusSearch();
        return;
      }

      // 2. Ctrl+Enter / Cmd+Enter -> Submit closest active form
      if (hasPrimaryMod && !event.altKey && event.key === 'Enter') {
        const activeEl = document.activeElement;
        const form = activeEl instanceof HTMLElement ? activeEl.closest('form') : null;
        if (form) {
          event.preventDefault();
          const submitBtn = form.querySelector<HTMLButtonElement>('button[type="submit"]:not(:disabled)');
          if (submitBtn) {
            form.requestSubmit(submitBtn);
          } else {
            form.requestSubmit();
          }
        }
        return;
      }

      // 3. Escape -> Close shortcuts help or top open modal
      if (event.key === 'Escape') {
        if (isHelpOpen) {
          event.preventDefault();
          onCloseHelp();
          return;
        }
        onCloseTopModal();
        return;
      }

      // 4. Alt + Number / Letter -> Fast panel & action navigation
      if (event.altKey && !hasPrimaryMod) {
        if (event.key === '1') {
          event.preventDefault();
          onCloseHelp();
          onNavigate('public');
          return;
        }
        if (event.key === '2' && currentUser) {
          event.preventDefault();
          onCloseHelp();
          onNavigate('user-panel');
          return;
        }
        if (
          event.key === '3' &&
          (currentUser?.role === 'ADMIN_AUXILIAR' || currentUser?.role === 'ADMIN_PRINCIPAL')
        ) {
          event.preventDefault();
          onCloseHelp();
          onNavigate('aux-panel');
          return;
        }
        if (event.key === '4' && currentUser?.role === 'ADMIN_PRINCIPAL') {
          event.preventDefault();
          onCloseHelp();
          onNavigate('principal-panel');
          return;
        }
        if (key === 'm') {
          event.preventDefault();
          onCloseHelp();
          onToggleDirectMessages();
          return;
        }
        if (key === 'l' && !currentUser) {
          event.preventDefault();
          onCloseHelp();
          onOpenAuth('login');
          return;
        }
      }

      // 5. ? (Shift + /) outside inputs -> Toggle keyboard shortcuts guide
      if (event.key === '?' && !hasPrimaryMod && !event.altKey && !isEditableElement(event.target)) {
        event.preventDefault();
        if (isHelpOpen) onCloseHelp();
        else onOpenHelp();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    currentUser,
    isHelpOpen,
    onCloseHelp,
    onCloseTopModal,
    onFocusSearch,
    onNavigate,
    onOpenAuth,
    onOpenHelp,
    onToggleDirectMessages,
  ]);

  const shortcuts = useMemo<ShortcutItem[]>(() => {
    const items: ShortcutItem[] = [
      {
        keys: [modKey, 'K'],
        label: 'Abrir Pesquisa Global',
        description: 'Foca instantaneamente a barra de pesquisa na Navbar',
        section: 'actions',
        onTrigger: () => {
          onCloseHelp();
          onFocusSearch();
        },
      },
      {
        keys: [modKey, 'Enter'],
        label: 'Submeter Formulário Ativo',
        description: 'Envia o formulário em edição (publicação, login, suporte, definições)',
        section: 'actions',
      },
      {
        keys: ['Alt', 'M'],
        label: 'Mensagens Diretas',
        description: 'Abre ou fecha o chat direto entre comprador e produtor',
        section: 'actions',
        onTrigger: () => {
          onCloseHelp();
          onToggleDirectMessages();
        },
      },
      {
        keys: ['?'],
        label: 'Guia de Atalhos',
        description: 'Abre ou fecha este painel de referência rápida',
        section: 'actions',
      },
      {
        keys: ['Esc'],
        label: 'Fechar Modal / Janela',
        description: 'Fecha a janela ou painel modal atualmente aberto',
        section: 'actions',
        onTrigger: onCloseHelp,
      },
      {
        keys: ['Alt', '1'],
        label: 'Vitrine Pública',
        description: 'Ir para a página inicial e vitrine de ofertas',
        section: 'navigation',
        onTrigger: () => {
          onCloseHelp();
          onNavigate('public');
        },
      },
    ];

    if (currentUser) {
      items.push({
        keys: ['Alt', '2'],
        label: 'Painel do Utilizador',
        description: 'Aceder às suas publicações, gráficos e calculadora de insumos',
        section: 'navigation',
        onTrigger: () => {
          onCloseHelp();
          onNavigate('user-panel');
        },
      });
    } else {
      items.push({
        keys: ['Alt', 'L'],
        label: 'Entrar / Registar',
        description: 'Abrir janela de início de sessão ou registo de conta',
        section: 'navigation',
        onTrigger: () => {
          onCloseHelp();
          onOpenAuth('login');
        },
      });
    }

    if (currentUser?.role === 'ADMIN_AUXILIAR' || currentUser?.role === 'ADMIN_PRINCIPAL') {
      items.push({
        keys: ['Alt', '3'],
        label: 'Painel Admin Auxiliar',
        description: 'Aceder à moderação, mascaramento de fotos e suporte',
        section: 'navigation',
        onTrigger: () => {
          onCloseHelp();
          onNavigate('aux-panel');
        },
      });
    }

    if (currentUser?.role === 'ADMIN_PRINCIPAL') {
      items.push({
        keys: ['Alt', '4'],
        label: 'Painel Admin Principal',
        description: 'Aceder à gestão financeira, auditoria, webhooks e análises',
        section: 'navigation',
        onTrigger: () => {
          onCloseHelp();
          onNavigate('principal-panel');
        },
      });
    }

    return items;
  }, [currentUser, modKey, onCloseHelp, onFocusSearch, onNavigate, onOpenAuth, onToggleDirectMessages]);

  if (!isHelpOpen) return null;

  const actionShortcuts = shortcuts.filter((s) => s.section === 'actions');
  const navShortcuts = shortcuts.filter((s) => s.section === 'navigation');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="keyboard-shortcuts-title"
      onClick={onCloseHelp}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-[#DCE5DE] bg-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#EDF2EE] bg-[#F7F9F7] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#14532D] text-white">
              <Keyboard className="w-4 h-4" />
            </div>
            <div>
              <h2 id="keyboard-shortcuts-title" className="font-display text-base font-bold text-[#111814]">
                Atalhos de Teclado Globais
              </h2>
              <p className="text-[11px] text-[#546459]">
                Navegação rápida entre painéis e ações frequentes na Nzila Agro.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCloseHelp}
            aria-label="Fechar guia de atalhos"
            className="rounded-lg p-1.5 text-[#546459] hover:bg-[#E8F0EA] hover:text-[#111814] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5 max-h-[75vh] overflow-y-auto">
          <div className="space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#14532D]">
              Ações Comuns
            </div>
            <div className="divide-y divide-[#EDF2EE] rounded-xl border border-[#DCE5DE] bg-white">
              {actionShortcuts.map((item) => (
                <div
                  key={item.label}
                  onClick={item.onTrigger}
                  className={`flex items-center justify-between gap-4 px-3.5 py-2.5 ${
                    item.onTrigger ? 'cursor-pointer hover:bg-[#F7F9F7]' : ''
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[#111814]">{item.label}</div>
                    <div className="text-[11px] text-[#546459]">{item.description}</div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {item.keys.map((k, idx) => (
                      <React.Fragment key={k}>
                        {idx > 0 && <span className="text-[10px] text-[#7B8B80]">+</span>}
                        <kbd className="inline-flex min-w-[26px] items-center justify-center rounded-md border border-[#C7D3CA] bg-[#F2F7F3] px-2 py-0.5 font-mono-tabular text-[11px] font-bold text-[#14532D] shadow-2xs">
                          {k}
                        </kbd>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#14532D]">
              Navegação Rápida entre Painéis
            </div>
            <div className="divide-y divide-[#EDF2EE] rounded-xl border border-[#DCE5DE] bg-white">
              {navShortcuts.map((item) => (
                <div
                  key={item.label}
                  onClick={item.onTrigger}
                  className={`flex items-center justify-between gap-4 px-3.5 py-2.5 ${
                    item.onTrigger ? 'cursor-pointer hover:bg-[#F7F9F7]' : ''
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[#111814]">{item.label}</div>
                    <div className="text-[11px] text-[#546459]">{item.description}</div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {item.keys.map((k, idx) => (
                      <React.Fragment key={k}>
                        {idx > 0 && <span className="text-[10px] text-[#7B8B80]">+</span>}
                        <kbd className="inline-flex min-w-[26px] items-center justify-center rounded-md border border-[#C7D3CA] bg-[#F2F7F3] px-2 py-0.5 font-mono-tabular text-[11px] font-bold text-[#14532D] shadow-2xs">
                          {k}
                        </kbd>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-[#EDF2EE] bg-[#F7F9F7] px-5 py-3 text-[11px] text-[#546459]">
          <span>Clique em qualquer atalho acima para executar imediatamente.</span>
          <button
            type="button"
            onClick={onCloseHelp}
            className="rounded-lg bg-[#14532D] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#15803D]"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
};
