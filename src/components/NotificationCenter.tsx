import React, { useEffect, useRef, useState } from 'react';
import { Bell, Check, CheckCheck, CheckCircle2, KeyRound, X, XCircle } from 'lucide-react';
import type { AppNotification } from '../types';

export interface ToastAlert {
  id: string;
  notificationId?: number;
  type: 'account_approved' | 'recovery_approved' | 'recovery_rejected' | 'info';
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface NotificationBellProps {
  notifications: AppNotification[];
  onMarkRead: (id: number) => void;
  onMarkAllRead: () => void;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({
  notifications,
  onMarkRead,
  onMarkAllRead,
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const renderIcon = (type: AppNotification['type']) => {
    if (type === 'account_approved') {
      return <CheckCircle2 className="w-4 h-4 text-[#15803D] shrink-0 mt-0.5" />;
    }
    if (type === 'recovery_approved') {
      return <KeyRound className="w-4 h-4 text-[#15803D] shrink-0 mt-0.5" />;
    }
    if (type === 'recovery_rejected') {
      return <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />;
    }
    return <Bell className="w-4 h-4 text-[#14532D] shrink-0 mt-0.5" />;
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Notificações"
        className="inline-flex items-center gap-1.5 rounded-lg border border-[#D4DDD6] bg-white px-3 py-2 text-xs font-semibold text-[#1C2720] hover:bg-[#F2F7F3] transition-colors whitespace-nowrap shrink-0"
      >
        <Bell className="w-4 h-4 text-[#14532D]" />
        <span className="hidden sm:inline">Alertas</span>
        {unreadCount > 0 && (
          <span className="rounded bg-[#EAB308] px-1.5 py-0.5 text-[11px] font-bold text-[#111814] font-mono-tabular leading-none">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 overflow-hidden rounded-xl border border-[#DCE5DE] bg-white shadow-xl z-50">
          <div className="flex items-center justify-between border-b border-[#E5ECE6] bg-[#F7F9F7] px-4 py-3">
            <span className="text-xs font-bold text-[#111814]">
              Notificações ({unreadCount} não lida{unreadCount === 1 ? '' : 's'})
            </span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={onMarkAllRead}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#15803D] hover:underline"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Marcar todas
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-[#EDF2EE]">
            {notifications.length === 0 ? (
              <div className="p-6 text-center text-xs text-[#546459]">
                Sem notificações até ao momento. Será alertado aqui quando o seu registo ou pedido de senha for processado.
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`p-4 transition-colors ${n.isRead ? 'bg-white' : 'bg-[#F2F7F3]'}`}
                >
                  <div className="flex items-start gap-3">
                    {renderIcon(n.type)}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-bold text-[#111814]">{n.title}</p>
                        {!n.isRead && (
                          <button
                            type="button"
                            onClick={() => onMarkRead(n.id)}
                            title="Marcar como lida"
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#15803D] hover:underline shrink-0"
                          >
                            <Check className="w-3 h-3" />
                            Lida
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-[#445449] leading-relaxed">{n.message}</p>
                      <p className="text-[11px] text-[#7B8B80] font-mono-tabular">
                        {new Date(n.createdAt + (n.createdAt.endsWith('Z') ? '' : 'Z')).toLocaleString('pt-AO')}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

interface NotificationToastsProps {
  toasts: ToastAlert[];
  onDismiss: (toast: ToastAlert) => void;
}

export const NotificationToasts: React.FC<NotificationToastsProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed top-20 right-4 z-50 flex w-full max-w-sm flex-col gap-3 pointer-events-none"
    >
      {toasts.map((toast) => {
        const isRejected = toast.type === 'recovery_rejected';
        return (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto rounded-xl border bg-white p-4 shadow-lg ${
              isRejected ? 'border-red-300' : 'border-[#15803D]/40'
            }`}
          >
            <div className="flex items-start gap-3">
              {isRejected ? (
                <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              ) : toast.type === 'recovery_approved' ? (
                <KeyRound className="w-5 h-5 text-[#15803D] shrink-0 mt-0.5" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-[#15803D] shrink-0 mt-0.5" />
              )}

              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="text-xs font-bold text-[#111814]">{toast.title}</h4>
                  <button
                    type="button"
                    onClick={() => onDismiss(toast)}
                    aria-label="Fechar notificação"
                    className="rounded p-0.5 text-[#546459] hover:bg-[#F2F7F3] hover:text-[#111814]"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-xs text-[#445449] leading-relaxed">{toast.message}</p>
                {toast.actionLabel && toast.onAction && (
                  <div className="pt-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        toast.onAction?.();
                        onDismiss(toast);
                      }}
                      className="rounded-md bg-[#14532D] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#15803D] transition-colors"
                    >
                      {toast.actionLabel}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
