import React, { useEffect } from 'react';
import { AlertTriangle, Home, RefreshCw } from 'lucide-react';
import { getStoredToken } from '../lib/api';

interface ReportPayload {
  boundaryName: string;
  errorName: string;
  errorMessage: string;
  errorStack?: string;
  componentStack?: string;
}

export async function reportClientError(payload: ReportPayload): Promise<number | null> {
  try {
    const token = getStoredToken();
    const res = await fetch('/api/client-errors', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        ...payload,
        pageUrl: typeof window !== 'undefined' ? window.location.href : '',
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { id?: number };
    return typeof json.id === 'number' ? json.id : null;
  } catch {
    return null;
  }
}

interface ErrorBoundaryProps {
  boundaryName?: string;
  resetKey?: string | number;
  onGoHome?: () => void;
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  reportId: number | null;
  reporting: boolean;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      reportId: null,
      reporting: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null, reportId: null, reporting: false });
    }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    const boundaryName = this.props.boundaryName || 'Aplicação Global';
    this.setState({ reporting: true });

    void reportClientError({
      boundaryName,
      errorName: error?.name || 'RenderError',
      errorMessage: error?.message || 'Erro inesperado durante a renderização da interface.',
      errorStack: error?.stack || '',
      componentStack: errorInfo?.componentStack || '',
    }).then((id) => {
      this.setState({ reportId: id, reporting: false });
    });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, reportId: null, reporting: false });
  };

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const boundaryName = this.props.boundaryName || 'Aplicação Global';

    return (
      <div className="mx-auto max-w-2xl px-4 py-14">
        <div className="rounded-xl border border-[#DCE5DE] bg-white p-6 sm:p-8 space-y-5">
          <div className="flex items-start gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-lg font-bold text-[#111814]">
                Ocorreu uma falha inesperada em {boundaryName}
              </h2>
              <p className="mt-1 text-sm text-[#546459] leading-relaxed">
                A interface foi protegida automaticamente para evitar perda de sessão. O detalhe técnico foi enviado para o{' '}
                <strong className="text-[#111814]">Relatório de Erros</strong> da administração para análise.
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-[#EDF2EE] bg-[#F7F9F7] p-3.5 text-xs space-y-1">
            <div className="font-semibold text-[#1C2720]">
              {this.state.error?.name || 'Error'}: {this.state.error?.message || 'Falha de renderização'}
            </div>
            <div className="text-[11px] text-[#546459] font-mono-tabular">
              {this.state.reporting
                ? 'A enviar relatório de diagnóstico...'
                : this.state.reportId
                  ? `Registo de diagnóstico #${this.state.reportId} guardado com sucesso.`
                  : 'Registo capturado localmente.'}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={this.handleReset}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#14532D] px-4 py-2 text-xs font-bold text-white hover:bg-[#15803D] transition-colors whitespace-nowrap"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Tentar Novamente
            </button>
            {this.props.onGoHome && (
              <button
                type="button"
                onClick={() => {
                  this.handleReset();
                  this.props.onGoHome?.();
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#D4DDD6] bg-white px-4 py-2 text-xs font-semibold text-[#1C2720] hover:bg-[#F2F7F3] transition-colors whitespace-nowrap"
              >
                <Home className="w-3.5 h-3.5" />
                Voltar à Vitrine Pública
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
}

export const GlobalErrorListener: React.FC<{ activeView: string }> = ({ activeView }) => {
  useEffect(() => {
    const recentFingerprints = new Map<string, number>();

    const shouldReport = (fingerprint: string): boolean => {
      const lower = fingerprint.toLowerCase();
      // Ignore benign browser/HMR WebSocket noise
      if (lower.includes('websocket') || lower.includes('resizeobserver loop')) {
        return false;
      }
      const now = Date.now();
      const prev = recentFingerprints.get(fingerprint);
      if (prev && now - prev < 15000) return false;
      recentFingerprints.set(fingerprint, now);
      return true;
    };

    const viewLabel =
      activeView === 'user-panel'
        ? 'Painel do Utilizador'
        : activeView === 'aux-panel'
          ? 'Painel Auxiliar'
          : activeView === 'principal-panel'
            ? 'Painel Principal'
            : 'Página Pública';

    const handleWindowError = (event: ErrorEvent) => {
      const msg = event.message || event.error?.message || 'Erro de execução JavaScript';
      if (!shouldReport(msg)) return;
      void reportClientError({
        boundaryName: `${viewLabel} (Runtime)`,
        errorName: event.error?.name || 'WindowError',
        errorMessage: msg,
        errorStack: event.error?.stack || `${event.filename || ''}:${event.lineno || 0}:${event.colno || 0}`,
      });
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const msg =
        reason instanceof Error
          ? reason.message
          : typeof reason === 'string'
            ? reason
            : 'Promessa rejeitada sem tratamento';
      if (!shouldReport(msg)) return;
      void reportClientError({
        boundaryName: `${viewLabel} (Promise)`,
        errorName: reason instanceof Error ? reason.name : 'UnhandledRejection',
        errorMessage: msg,
        errorStack: reason instanceof Error ? reason.stack || '' : '',
      });
    };

    window.addEventListener('error', handleWindowError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    return () => {
      window.removeEventListener('error', handleWindowError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, [activeView]);

  return null;
};
