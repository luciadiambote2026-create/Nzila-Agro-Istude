import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, BellRing, CheckCircle2, Mail, Save, Send } from 'lucide-react';
import { apiRequest } from '../lib/api';

interface CriticalAlertSettings {
  enabled: boolean;
  cpuThresholdPct: number;
  memoryThresholdPct: number;
  durationMinutes: number;
  cooldownMinutes: number;
  notifyInApp: boolean;
  notifyEmail: boolean;
  notifySms: boolean;
  alertEmail: string;
  updatedAt?: string;
}

interface CriticalAlertLogEntry {
  id: number;
  metric: string;
  currentValue: number;
  thresholdValue: number;
  sustainedSeconds: number;
  channels: string;
  message: string;
  isTest: boolean;
  createdAt: string;
}

interface CriticalAlertsResponse {
  settings: CriticalAlertSettings;
  logs: CriticalAlertLogEntry[];
  breachState: {
    cpuBreaching: boolean;
    cpuSustainedSeconds: number;
    memoryBreaching: boolean;
    memorySustainedSeconds: number;
  };
}

export const CriticalAlertsSettingsCard: React.FC<{
  onAlertDispatched?: () => void;
  onThresholdsChanged?: (thresholds: { cpu: number; memory: number }) => void;
}> = ({ onAlertDispatched, onThresholdsChanged }) => {
  const [form, setForm] = useState<CriticalAlertSettings>({
    enabled: true,
    cpuThresholdPct: 85,
    memoryThresholdPct: 85,
    durationMinutes: 5,
    cooldownMinutes: 30,
    notifyInApp: true,
    notifyEmail: true,
    notifySms: false,
    alertEmail: '',
  });
  const [logs, setLogs] = useState<CriticalAlertLogEntry[]>([]);
  const [breachState, setBreachState] = useState<CriticalAlertsResponse['breachState'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const loadAlerts = useCallback(async () => {
    try {
      const res = await apiRequest<CriticalAlertsResponse>('/api/admin/principal/critical-alerts');
      setForm(res.settings);
      setLogs(res.logs);
      setBreachState(res.breachState);
      onThresholdsChanged?.({
        cpu: res.settings.cpuThresholdPct,
        memory: res.settings.memoryThresholdPct,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao carregar configurações de alertas críticos.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setSaving(true);
    try {
      const res = await apiRequest<CriticalAlertsResponse>('/api/admin/principal/critical-alerts/settings', {
        method: 'PUT',
        body: JSON.stringify(form),
      });
      setForm(res.settings);
      setLogs(res.logs);
      setBreachState(res.breachState);
      onThresholdsChanged?.({
        cpu: res.settings.cpuThresholdPct,
        memory: res.settings.memoryThresholdPct,
      });
      setFeedback({
        type: 'ok',
        text: `Limiares guardados: aviso automático se CPU ≥ ${res.settings.cpuThresholdPct}% ou Memória ≥ ${res.settings.memoryThresholdPct}% por mais de ${res.settings.durationMinutes} min.`,
      });
      onAlertDispatched?.();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao guardar configurações de alertas críticos.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSendTest = async () => {
    setFeedback(null);
    setTesting(true);
    try {
      const res = await apiRequest<CriticalAlertsResponse>('/api/admin/principal/critical-alerts/test', {
        method: 'POST',
      });
      setLogs(res.logs);
      setBreachState(res.breachState);
      setFeedback({
        type: 'ok',
        text: 'Alerta crítico de teste enviado com sucesso para os canais configurados.',
      });
      onAlertDispatched?.();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao enviar alerta crítico de teste.',
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="rounded-xl border border-[#DCE5DE] bg-white p-6 space-y-5">
      <form onSubmit={handleSave} className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#EDF2EE] pb-4">
          <div>
            <h3 className="font-display text-base font-bold text-[#111814] flex items-center gap-2">
              <BellRing className="w-4 h-4 text-[#CA8A04]" />
              Notificações Críticas de Recursos (CPU e Memória)
            </h3>
            <p className="text-xs text-[#546459] mt-0.5">
              Envia avisos automáticos ao Administrador Principal quando a utilização de CPU ou Memória RAM ultrapassa o limite definido de forma contínua.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-xs font-bold text-[#14532D] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
              className="h-4 w-4 rounded border-[#D4DDD6] accent-[#14532D]"
            />
            Alertas Automáticos Ativos
          </label>
        </div>

        {breachState && (breachState.cpuBreaching || breachState.memoryBreaching) && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-semibold text-red-700 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              Sobrecarga detetada em curso:{' '}
              {breachState.cpuBreaching && `CPU acima do limite há ${breachState.cpuSustainedSeconds}s`}
              {breachState.cpuBreaching && breachState.memoryBreaching ? ' · ' : ''}
              {breachState.memoryBreaching && `Memória acima do limite há ${breachState.memorySustainedSeconds}s`}
            </span>
          </div>
        )}

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

        {/* Manual Threshold Presets + Interactive Sliders & Numeric Inputs */}
        <div className="rounded-xl border border-[#E5ECE6] bg-[#FCFEFD] p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-[#14532D]">
              Definição Manual de Limiares Percentuais de Alerta
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { label: 'Conservador (75%)', val: 75 },
                { label: 'Padrão (85%)', val: 85 },
                { label: 'Tolerante (90%)', val: 90 },
              ].map((preset) => (
                <button
                  key={preset.val}
                  type="button"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      cpuThresholdPct: preset.val,
                      memoryThresholdPct: preset.val,
                    }))
                  }
                  className="rounded-md border border-[#D4DDD6] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#1C2720] hover:border-[#15803D] hover:text-[#14532D] transition-colors"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-lg border border-[#E5ECE6] bg-white p-3.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="cpu-threshold-input" className="text-xs font-semibold text-[#1C2720]">
                  Limiar Crítico de CPU (%)
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    id="cpu-threshold-input"
                    type="number"
                    min={50}
                    max={99}
                    step={1}
                    required
                    value={form.cpuThresholdPct}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        cpuThresholdPct: Math.min(99, Math.max(50, Number(e.target.value) || 50)),
                      })
                    }
                    className="w-16 rounded-md border border-[#D4DDD6] bg-white px-2 py-1 text-right text-xs font-mono-tabular font-bold text-[#14532D] focus:border-[#15803D] focus:outline-none"
                  />
                  <span className="text-xs font-bold text-[#546459]">%</span>
                </div>
              </div>
              <input
                type="range"
                min={50}
                max={99}
                step={1}
                value={form.cpuThresholdPct}
                onChange={(e) => setForm({ ...form, cpuThresholdPct: Number(e.target.value) })}
                className="w-full accent-[#14532D] cursor-pointer"
                aria-label="Limiar percentual de CPU"
              />
              <div className="flex justify-between text-[10px] font-mono-tabular text-[#546459]">
                <span>50%</span>
                <span>75%</span>
                <span>85%</span>
                <span>99%</span>
              </div>
            </div>

            <div className="rounded-lg border border-[#E5ECE6] bg-white p-3.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="mem-threshold-input" className="text-xs font-semibold text-[#1C2720]">
                  Limiar Crítico de Memória RAM (%)
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    id="mem-threshold-input"
                    type="number"
                    min={50}
                    max={99}
                    step={1}
                    required
                    value={form.memoryThresholdPct}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        memoryThresholdPct: Math.min(99, Math.max(50, Number(e.target.value) || 50)),
                      })
                    }
                    className="w-16 rounded-md border border-[#D4DDD6] bg-white px-2 py-1 text-right text-xs font-mono-tabular font-bold text-[#14532D] focus:border-[#15803D] focus:outline-none"
                  />
                  <span className="text-xs font-bold text-[#546459]">%</span>
                </div>
              </div>
              <input
                type="range"
                min={50}
                max={99}
                step={1}
                value={form.memoryThresholdPct}
                onChange={(e) => setForm({ ...form, memoryThresholdPct: Number(e.target.value) })}
                className="w-full accent-[#14532D] cursor-pointer"
                aria-label="Limiar percentual de Memória RAM"
              />
              <div className="flex justify-between text-[10px] font-mono-tabular text-[#546459]">
                <span>50%</span>
                <span>75%</span>
                <span>85%</span>
                <span>99%</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div>
              <label className="block text-xs font-medium text-[#1C2720] mb-1">
                Duração Contínua Acima do Limiar (minutos)
              </label>
              <input
                type="number"
                min={1}
                max={60}
                step={1}
                required
                value={form.durationMinutes}
                onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })}
                className="w-full rounded-lg border border-[#D4DDD6] bg-white px-3 py-2 text-xs font-mono-tabular focus:border-[#15803D] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#1C2720] mb-1">
                Intervalo Mínimo entre Avisos / Cooldown (minutos)
              </label>
              <input
                type="number"
                min={5}
                max={240}
                step={5}
                required
                value={form.cooldownMinutes}
                onChange={(e) => setForm({ ...form, cooldownMinutes: Number(e.target.value) })}
                className="w-full rounded-lg border border-[#D4DDD6] bg-white px-3 py-2 text-xs font-mono-tabular focus:border-[#15803D] focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-lg border border-[#E5ECE6] bg-[#F8FBF9] p-4">
          <div className="space-y-2.5">
            <div className="text-xs font-bold text-[#14532D]">Canais de Notificação</div>
            <label className="flex items-center gap-2 text-xs text-[#1C2720] cursor-pointer">
              <input
                type="checkbox"
                checked={form.notifyInApp}
                onChange={(e) => setForm({ ...form, notifyInApp: e.target.checked })}
                className="h-4 w-4 rounded border-[#D4DDD6] accent-[#14532D]"
              />
              Notificação no Painel do Administrador Principal (In-App)
            </label>
            <label className="flex items-center gap-2 text-xs text-[#1C2720] cursor-pointer">
              <input
                type="checkbox"
                checked={form.notifyEmail}
                onChange={(e) => setForm({ ...form, notifyEmail: e.target.checked })}
                className="h-4 w-4 rounded border-[#D4DDD6] accent-[#14532D]"
              />
              Envio Automático por Email (requer SMTP ativo)
            </label>
            <label className="flex items-center gap-2 text-xs text-[#1C2720] cursor-pointer">
              <input
                type="checkbox"
                checked={form.notifySms}
                onChange={(e) => setForm({ ...form, notifySms: e.target.checked })}
                className="h-4 w-4 rounded border-[#D4DDD6] accent-[#14532D]"
              />
              Envio Automático por SMS para o Admin Principal (requer Gateway SMS ativo)
            </label>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#1C2720] mb-1 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-[#15803D]" />
              Email de Destino para Alertas (opcional)
            </label>
            <input
              type="email"
              value={form.alertEmail}
              onChange={(e) => setForm({ ...form, alertEmail: e.target.value })}
              placeholder="Deixe vazio para usar o email do Admin Principal"
              className="w-full rounded-lg border border-[#D4DDD6] bg-white px-3 py-2 text-xs focus:border-[#15803D] focus:outline-none"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <span className="text-[11px] text-[#546459]">
            Regra ativa: disparar se CPU ≥ <strong className="font-mono-tabular">{form.cpuThresholdPct}%</strong> ou Memória ≥{' '}
            <strong className="font-mono-tabular">{form.memoryThresholdPct}%</strong> durante mais de{' '}
            <strong className="font-mono-tabular">{form.durationMinutes} min</strong> consecutivos.
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={testing || loading}
              onClick={handleSendTest}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#CA8A04]/40 bg-[#FEFCE8] px-3.5 py-2 text-xs font-bold text-[#854D0E] hover:bg-[#FEF9C3] disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              <Send className="w-3.5 h-3.5 text-[#CA8A04]" />
              {testing ? 'A enviar teste...' : 'Enviar Alerta de Teste'}
            </button>
            <button
              type="submit"
              disabled={saving || loading}
              className="inline-flex items-center gap-2 rounded-lg bg-[#14532D] px-4 py-2 text-xs font-bold text-white hover:bg-[#15803D] disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              <Save className="w-4 h-4" />
              {saving ? 'A guardar...' : 'Guardar Configurações'}
            </button>
          </div>
        </div>
      </form>

      {/* Dispatched Alerts History */}
      <div className="overflow-x-auto rounded-lg border border-[#E5ECE6]">
        <div className="border-b border-[#E5ECE6] bg-[#F8FBF9] px-4 py-2.5 flex items-center justify-between">
          <span className="text-xs font-bold text-[#14532D]">Histórico de Alertas Críticos Enviados</span>
          <span className="text-[11px] font-mono-tabular text-[#546459]">{logs.length} registos</span>
        </div>
        <table className="w-full text-left text-xs">
          <thead className="border-b border-[#E5ECE6] bg-[#F2F7F3] text-[#14532D]">
            <tr>
              <th className="px-3 py-2 font-bold">Data / Hora</th>
              <th className="px-3 py-2 font-bold">Recurso</th>
              <th className="px-3 py-2 font-bold">Pico / Limite</th>
              <th className="px-3 py-2 font-bold">Canais</th>
              <th className="px-3 py-2 font-bold">Mensagem</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EDF2EE]">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-5 text-center text-[#546459]">
                  A carregar histórico de alertas...
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-5 text-center text-[#546459]">
                  Nenhum alerta crítico disparado até ao momento. O servidor encontra-se dentro dos limites configurados.
                </td>
              </tr>
            ) : (
              logs.slice(0, 8).map((item) => (
                <tr key={item.id} className="hover:bg-[#F9FCFA]">
                  <td className="px-3 py-2 font-mono-tabular text-[#546459] whitespace-nowrap">
                    {new Date(item.createdAt).toLocaleString('pt-AO')}
                  </td>
                  <td className="px-3 py-2 font-semibold text-[#111814] whitespace-nowrap">
                    {item.metric} {item.isTest ? '(Teste)' : ''}
                  </td>
                  <td className="px-3 py-2 font-mono-tabular font-bold text-[#B45309] whitespace-nowrap">
                    {item.currentValue.toFixed(1)}% / {item.thresholdValue}%
                  </td>
                  <td className="px-3 py-2 text-[#445449] whitespace-nowrap">{item.channels}</td>
                  <td className="px-3 py-2 text-[#546459] max-w-[300px] truncate">{item.message}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
