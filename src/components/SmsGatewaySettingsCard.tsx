import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, MessageSquareText, Phone, Save, Send, ShieldAlert } from 'lucide-react';
import { apiRequest } from '../lib/api';

type SmsProvider = 'twilio' | 'africastalking' | 'vonage' | 'webhook_http';

interface SmsGatewaySettings {
  enabled: boolean;
  provider: SmsProvider;
  endpointUrl: string;
  accountId: string;
  hasAuthToken: boolean;
  senderId: string;
  recipientPhone: string;
  defaultAdminPhone: string;
  updatedAt?: string;
}

interface SmsDeliveryLogEntry {
  id: number;
  provider: string;
  recipientPhone: string;
  message: string;
  success: boolean;
  statusCode: number | null;
  responseSummary: string;
  createdAt: string;
}

interface SmsGatewayResponse {
  settings: SmsGatewaySettings;
  logs: SmsDeliveryLogEntry[];
  result?: {
    sent: boolean;
    recipientPhone: string;
    provider: SmsProvider;
    statusCode: number | null;
    summary: string;
  };
}

const PROVIDER_META: Record<
  SmsProvider,
  { label: string; accountLabel: string; tokenLabel: string; needsEndpoint: boolean }
> = {
  twilio: {
    label: 'Twilio SMS API',
    accountLabel: 'Account SID',
    tokenLabel: 'Auth Token',
    needsEndpoint: false,
  },
  africastalking: {
    label: "Africa's Talking SMS",
    accountLabel: 'Username',
    tokenLabel: 'API Key',
    needsEndpoint: false,
  },
  vonage: {
    label: 'Vonage (Nexmo) SMS',
    accountLabel: 'API Key',
    tokenLabel: 'API Secret',
    needsEndpoint: false,
  },
  webhook_http: {
    label: 'Gateway HTTP/REST Personalizado (Angola / TelcoSMS)',
    accountLabel: 'ID da Conta / Cliente (opcional)',
    tokenLabel: 'Bearer Token / Chave API (opcional)',
    needsEndpoint: true,
  },
};

export const SmsGatewaySettingsCard: React.FC = () => {
  const [settings, setSettings] = useState<SmsGatewaySettings>({
    enabled: false,
    provider: 'twilio',
    endpointUrl: '',
    accountId: '',
    hasAuthToken: false,
    senderId: 'NzilaAgro',
    recipientPhone: '',
    defaultAdminPhone: '',
  });
  const [authTokenInput, setAuthTokenInput] = useState('');
  const [logs, setLogs] = useState<SmsDeliveryLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const loadSmsConfig = useCallback(async () => {
    try {
      const res = await apiRequest<SmsGatewayResponse>('/api/admin/principal/sms-gateway');
      setSettings(res.settings);
      setLogs(res.logs);
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao carregar configuração do Gateway SMS.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSmsConfig();
  }, [loadSmsConfig]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setSaving(true);
    try {
      const res = await apiRequest<SmsGatewayResponse>('/api/admin/principal/sms-gateway', {
        method: 'PUT',
        body: JSON.stringify({
          enabled: settings.enabled,
          provider: settings.provider,
          endpointUrl: settings.endpointUrl,
          accountId: settings.accountId,
          authToken: authTokenInput.trim() || undefined,
          senderId: settings.senderId,
          recipientPhone: settings.recipientPhone,
        }),
      });
      setSettings(res.settings);
      setLogs(res.logs);
      setAuthTokenInput('');
      setFeedback({
        type: 'ok',
        text: `Integração de Gateway SMS (${PROVIDER_META[res.settings.provider].label}) guardada com sucesso.`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao guardar configuração de Gateway SMS.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTestSms = async () => {
    setFeedback(null);
    setTesting(true);
    try {
      const res = await apiRequest<SmsGatewayResponse>('/api/admin/principal/sms-gateway/test', {
        method: 'POST',
      });
      setSettings(res.settings);
      setLogs(res.logs);
      if (res.result?.sent) {
        setFeedback({
          type: 'ok',
          text: `SMS de teste enviado para ${res.result.recipientPhone}: ${res.result.summary}`,
        });
      } else {
        setFeedback({
          type: 'err',
          text: res.result?.summary || 'O gateway rejeitou o envio do SMS de teste.',
        });
      }
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao enviar SMS de teste.',
      });
    } finally {
      setTesting(false);
    }
  };

  const providerMeta = PROVIDER_META[settings.provider];

  return (
    <div className="rounded-xl border border-[#DCE5DE] bg-white p-6 space-y-5">
      <form onSubmit={handleSave} className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#EDF2EE] pb-4">
          <div>
            <h3 className="font-display text-base font-bold text-[#111814] flex items-center gap-2">
              <MessageSquareText className="w-4 h-4 text-[#15803D]" />
              Integração de Gateway SMS para Alertas Críticos
            </h3>
            <p className="text-xs text-[#546459] mt-0.5">
              Configure um fornecedor SMS para enviar alertas de sobrecarga de CPU/memória diretamente por mensagem de texto para o telemóvel do Administrador Principal.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-xs font-bold text-[#14532D] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
              className="h-4 w-4 rounded border-[#D4DDD6] accent-[#14532D]"
            />
            Gateway SMS Ativo
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
            {feedback.type === 'ok' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <ShieldAlert className="w-4 h-4 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-[#1C2720] mb-1">
              Fornecedor de Gateway SMS
            </label>
            <select
              value={settings.provider}
              onChange={(e) => setSettings({ ...settings, provider: e.target.value as SmsProvider })}
              className="w-full rounded-lg border border-[#D4DDD6] bg-white px-3 py-2 text-xs focus:border-[#15803D] focus:outline-none"
            >
              {Object.entries(PROVIDER_META).map(([key, meta]) => (
                <option key={key} value={key}>
                  {meta.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#1C2720] mb-1">
              Remetente (Sender ID / Número)
            </label>
            <input
              type="text"
              value={settings.senderId}
              onChange={(e) => setSettings({ ...settings, senderId: e.target.value })}
              placeholder="Ex: NzilaAgro ou +2449XXXXXXXX"
              className="w-full rounded-lg border border-[#D4DDD6] bg-white px-3 py-2 text-xs font-mono-tabular focus:border-[#15803D] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#1C2720] mb-1 flex items-center gap-1">
              <Phone className="w-3.5 h-3.5 text-[#15803D]" />
              Contacto SMS do Admin Principal
            </label>
            <input
              type="tel"
              value={settings.recipientPhone}
              onChange={(e) => setSettings({ ...settings, recipientPhone: e.target.value })}
              placeholder={
                settings.defaultAdminPhone
                  ? `Padrão: ${settings.defaultAdminPhone}`
                  : '+244 9XX XXX XXX'
              }
              className="w-full rounded-lg border border-[#D4DDD6] bg-white px-3 py-2 text-xs font-mono-tabular focus:border-[#15803D] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#1C2720] mb-1">
              {providerMeta.accountLabel}
            </label>
            <input
              type="text"
              value={settings.accountId}
              onChange={(e) => setSettings({ ...settings, accountId: e.target.value })}
              placeholder="Identificador da conta no fornecedor"
              className="w-full rounded-lg border border-[#D4DDD6] bg-white px-3 py-2 text-xs font-mono-tabular focus:border-[#15803D] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#1C2720] mb-1">
              {providerMeta.tokenLabel}{' '}
              {settings.hasAuthToken && (
                <span className="text-[11px] font-semibold text-[#15803D]">(Guardado)</span>
              )}
            </label>
            <input
              type="password"
              value={authTokenInput}
              onChange={(e) => setAuthTokenInput(e.target.value)}
              placeholder={
                settings.hasAuthToken
                  ? '•••••••• (deixe vazio para manter o atual)'
                  : 'Cole a chave secreta / token do gateway'
              }
              className="w-full rounded-lg border border-[#D4DDD6] bg-white px-3 py-2 text-xs font-mono-tabular focus:border-[#15803D] focus:outline-none"
            />
          </div>

          {providerMeta.needsEndpoint && (
            <div>
              <label className="block text-xs font-medium text-[#1C2720] mb-1">
                Endpoint URL do Gateway HTTP
              </label>
              <input
                type="url"
                value={settings.endpointUrl}
                onChange={(e) => setSettings({ ...settings, endpointUrl: e.target.value })}
                placeholder="https://api.gateway-sms.ao/v1/send"
                className="w-full rounded-lg border border-[#D4DDD6] bg-white px-3 py-2 text-xs font-mono-tabular focus:border-[#15803D] focus:outline-none"
              />
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#EDF2EE]">
          <span className="text-[11px] text-[#546459]">
            Destino efetivo:{' '}
            <strong className="font-mono-tabular text-[#111814]">
              {settings.recipientPhone || settings.defaultAdminPhone || 'Não definido'}
            </strong>{' '}
            · Credenciais encriptadas/guardadas apenas no servidor.
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={testing || loading}
              onClick={handleTestSms}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#CA8A04]/40 bg-[#FEFCE8] px-3.5 py-2 text-xs font-bold text-[#854D0E] hover:bg-[#FEF9C3] disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              <Send className="w-3.5 h-3.5 text-[#CA8A04]" />
              {testing ? 'A enviar SMS...' : 'Enviar SMS de Teste'}
            </button>
            <button
              type="submit"
              disabled={saving || loading}
              className="inline-flex items-center gap-2 rounded-lg bg-[#14532D] px-4 py-2 text-xs font-bold text-white hover:bg-[#15803D] disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              <Save className="w-4 h-4" />
              {saving ? 'A guardar...' : 'Guardar Gateway SMS'}
            </button>
          </div>
        </div>
      </form>

      {/* SMS Delivery Logs */}
      <div className="overflow-x-auto rounded-lg border border-[#E5ECE6]">
        <div className="border-b border-[#E5ECE6] bg-[#F8FBF9] px-4 py-2.5 flex items-center justify-between">
          <span className="text-xs font-bold text-[#14532D]">Histórico de Envios SMS</span>
          <span className="text-[11px] font-mono-tabular text-[#546459]">{logs.length} registos</span>
        </div>
        <table className="w-full text-left text-xs">
          <thead className="border-b border-[#E5ECE6] bg-[#F2F7F3] text-[#14532D]">
            <tr>
              <th className="px-3 py-2 font-bold">Data / Hora</th>
              <th className="px-3 py-2 font-bold">Fornecedor</th>
              <th className="px-3 py-2 font-bold">Destino</th>
              <th className="px-3 py-2 font-bold">Estado</th>
              <th className="px-3 py-2 font-bold">Resposta do Gateway</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EDF2EE]">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-5 text-center text-[#546459]">
                  A carregar histórico de envios SMS...
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-5 text-center text-[#546459]">
                  Nenhum SMS enviado até ao momento.
                </td>
              </tr>
            ) : (
              logs.slice(0, 6).map((log) => (
                <tr key={log.id} className="hover:bg-[#F9FCFA]">
                  <td className="px-3 py-2 font-mono-tabular text-[#546459] whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString('pt-AO')}
                  </td>
                  <td className="px-3 py-2 font-semibold uppercase text-[#111814] whitespace-nowrap">
                    {log.provider}
                  </td>
                  <td className="px-3 py-2 font-mono-tabular text-[#111814] whitespace-nowrap">
                    {log.recipientPhone}
                  </td>
                  <td className="px-3 py-2 font-bold whitespace-nowrap">
                    <span className={log.success ? 'text-[#15803D]' : 'text-red-700'}>
                      {log.success ? `Enviado (${log.statusCode ?? 200})` : `Falhou${log.statusCode ? ` (${log.statusCode})` : ''}`}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-[#546459] max-w-[280px] truncate">{log.responseSummary}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
