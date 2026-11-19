import React, { useEffect, useState } from 'react';
import { CheckCircle2, KeyRound, Save, ShieldCheck } from 'lucide-react';
import { apiRequest } from '../lib/api';

interface MulticaixaSettings {
  enabled: boolean;
  provider: 'proxypay' | 'appypay' | 'emis_gpo' | 'manual';
  environment: 'sandbox' | 'production';
  entityCode: string;
  hasApiKey: boolean;
  hasWebhookSecret: boolean;
  endpointUrl: string;
  referenceValidityHours: number;
  autoConfirmWebhook: boolean;
  updatedAt?: string;
}

export const MulticaixaSettingsCard: React.FC = () => {
  const [settings, setSettings] = useState<MulticaixaSettings | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [webhookSecretInput, setWebhookSecretInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    apiRequest<{ settings: MulticaixaSettings }>('/api/admin/principal/multicaixa-settings')
      .then((res) => setSettings(res.settings))
      .catch((err) => {
        setFeedback({
          type: 'err',
          text: err instanceof Error ? err.message : 'Erro ao carregar credenciais Multicaixa.',
        });
      });
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setFeedback(null);
    setSaving(true);
    try {
      const res = await apiRequest<{ settings: MulticaixaSettings }>(
        '/api/admin/principal/multicaixa-settings',
        {
          method: 'PUT',
          body: JSON.stringify({
            enabled: settings.enabled,
            provider: settings.provider,
            environment: settings.environment,
            entityCode: settings.entityCode,
            endpointUrl: settings.endpointUrl,
            referenceValidityHours: settings.referenceValidityHours,
            autoConfirmWebhook: settings.autoConfirmWebhook,
            apiKey: apiKeyInput.trim() || undefined,
            webhookSecret: webhookSecretInput.trim() || undefined,
          }),
        }
      );
      setSettings(res.settings);
      setApiKeyInput('');
      setWebhookSecretInput('');
      setFeedback({
        type: 'ok',
        text: `Credenciais Referência Multicaixa guardadas (${res.settings.provider.toUpperCase()} · Entidade ${res.settings.entityCode}).`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao guardar credenciais Multicaixa.',
      });
    } finally {
      setSaving(false);
    }
  };

  if (!settings) {
    return (
      <div className="rounded-xl border border-[#DCE5DE] bg-white p-6 text-xs text-[#546459]">
        A carregar configuração de credenciais Multicaixa...
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="rounded-xl border border-[#DCE5DE] bg-white p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#EDF2EE] pb-4">
        <div>
          <h3 className="font-display text-base font-bold text-[#111814] flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-[#15803D]" />
            Credenciais de Pagamento por Referência Multicaixa
          </h3>
          <p className="text-xs text-[#546459] mt-0.5">
            Configure a entidade oficial EMIS/ProxyPay/AppyPay, chaves de API e prazo de validade das referências geradas para os produtores.
          </p>
        </div>

        <label className="inline-flex items-center gap-2 text-xs font-bold text-[#14532D] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
            className="h-4 w-4 rounded border-[#D4DDD6] accent-[#14532D]"
          />
          Pagamentos por Referência Ativos
        </label>
      </div>

      {feedback && (
        <div
          className={`rounded-lg border px-3.5 py-2.5 text-xs font-medium flex items-center gap-2 ${
            feedback.type === 'ok'
              ? 'border-[#15803D]/30 bg-[#EEF7F0] text-[#14532D]'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {feedback.type === 'ok' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
          <span>{feedback.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label className="block text-xs font-medium text-[#1C2720] mb-1">
            Fornecedor / Gateway
          </label>
          <select
            value={settings.provider}
            onChange={(e) =>
              setSettings({
                ...settings,
                provider: e.target.value as MulticaixaSettings['provider'],
              })
            }
            className="w-full rounded-lg border border-[#D4DDD6] bg-white px-3 py-2 text-xs focus:border-[#15803D] focus:outline-none"
          >
            <option value="manual">Manual (Referência + Comprovativo)</option>
            <option value="proxypay">ProxyPay (Referência Multicaixa)</option>
            <option value="appypay">AppyPay (GPO / Referência)</option>
            <option value="emis_gpo">EMIS GPO (Multicaixa Express)</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-[#1C2720] mb-1">Ambiente</label>
          <select
            value={settings.environment}
            onChange={(e) =>
              setSettings({
                ...settings,
                environment: e.target.value as MulticaixaSettings['environment'],
              })
            }
            className="w-full rounded-lg border border-[#D4DDD6] bg-white px-3 py-2 text-xs focus:border-[#15803D] focus:outline-none"
          >
            <option value="sandbox">Sandbox (Testes)</option>
            <option value="production">Produção (Dinheiro Real)</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-[#1C2720] mb-1">
            Código da Entidade Multicaixa
          </label>
          <input
            type="text"
            value={settings.entityCode}
            onChange={(e) => setSettings({ ...settings, entityCode: e.target.value })}
            placeholder="00521"
            className="w-full rounded-lg border border-[#D4DDD6] bg-white px-3 py-2 text-xs font-mono-tabular focus:border-[#15803D] focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-[#1C2720] mb-1">
            Validade da Referência (horas)
          </label>
          <input
            type="number"
            min={1}
            max={168}
            value={settings.referenceValidityHours}
            onChange={(e) =>
              setSettings({
                ...settings,
                referenceValidityHours: Math.min(168, Math.max(1, Number(e.target.value) || 48)),
              })
            }
            className="w-full rounded-lg border border-[#D4DDD6] bg-white px-3 py-2 text-xs font-mono-tabular focus:border-[#15803D] focus:outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-[#1C2720] mb-1">
            API Key / Token da Gateway{' '}
            {settings.hasApiKey && (
              <span className="text-[11px] font-semibold text-[#15803D]">(Guardada)</span>
            )}
          </label>
          <input
            type="password"
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            placeholder={settings.hasApiKey ? '•••••••• (manter atual)' : 'Opcional em modo manual'}
            className="w-full rounded-lg border border-[#D4DDD6] bg-white px-3 py-2 text-xs font-mono-tabular focus:border-[#15803D] focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-[#1C2720] mb-1">
            Webhook Secret (Assinatura){' '}
            {settings.hasWebhookSecret && (
              <span className="text-[11px] font-semibold text-[#15803D]">(Guardada)</span>
            )}
          </label>
          <input
            type="password"
            value={webhookSecretInput}
            onChange={(e) => setWebhookSecretInput(e.target.value)}
            placeholder={settings.hasWebhookSecret ? '•••••••• (manter atual)' : 'Segredo HMAC do webhook'}
            className="w-full rounded-lg border border-[#D4DDD6] bg-white px-3 py-2 text-xs font-mono-tabular focus:border-[#15803D] focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-[#1C2720] mb-1">
            URL do Endpoint da Gateway (Opcional)
          </label>
          <input
            type="url"
            value={settings.endpointUrl}
            onChange={(e) => setSettings({ ...settings, endpointUrl: e.target.value })}
            placeholder="https://api.proxypay.co.ao/v2"
            className="w-full rounded-lg border border-[#D4DDD6] bg-white px-3 py-2 text-xs font-mono-tabular focus:border-[#15803D] focus:outline-none"
          />
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-[#EDF2EE]">
        <label className="inline-flex items-center gap-2 text-xs text-[#1C2720] cursor-pointer">
          <input
            type="checkbox"
            checked={settings.autoConfirmWebhook}
            onChange={(e) => setSettings({ ...settings, autoConfirmWebhook: e.target.checked })}
            className="h-4 w-4 rounded border-[#D4DDD6] accent-[#14532D]"
          />
          <ShieldCheck className="w-3.5 h-3.5 text-[#15803D]" />
          Confirmar pagamentos automaticamente quando o webhook da gateway notificar liquidação
        </label>

        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#14532D] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#15803D] disabled:opacity-50 whitespace-nowrap"
        >
          <Save className="w-4 h-4" />
          {saving ? 'A guardar...' : 'Guardar Credenciais Multicaixa'}
        </button>
      </div>
    </form>
  );
};
