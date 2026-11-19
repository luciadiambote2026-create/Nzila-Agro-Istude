import React, { useEffect, useState } from 'react';
import { CheckCircle2, Pencil, PlusCircle, Send, Trash2, Webhook, XCircle } from 'lucide-react';
import { apiRequest } from '../lib/api';
import type { WebhookConfig, WebhookDeliveryLog, WebhookEventKey } from '../types';
import { PasswordInput } from './PasswordInput';

const WEBHOOK_EVENT_CATALOG: Array<{ key: WebhookEventKey; label: string; description: string }> = [
  {
    key: 'user.registered',
    label: 'Novo Registo (user.registered)',
    description: 'Disparado quando um novo produtor ou comprador cria conta na plataforma.',
  },
  {
    key: 'user.approved',
    label: 'Conta Aprovada (user.approved)',
    description: 'Disparado quando a administração aprova e ativa um utilizador.',
  },
  {
    key: 'sale.created',
    label: 'Nova Venda (sale.created)',
    description: 'Disparado quando um produtor regista uma nova venda comercial.',
  },
  {
    key: 'listing.created',
    label: 'Nova Publicação (listing.created)',
    description: 'Disparado quando é submetido um Produto Agrícola ou Consultoria/Formação.',
  },
  {
    key: 'recovery.requested',
    label: 'Recuperação Blindada (recovery.requested)',
    description: 'Disparado quando um utilizador solicita redefinição de palavra-passe por vídeo.',
  },
  {
    key: 'donation.created',
    label: 'Nova Doação Privada (donation.created)',
    description: 'Disparado quando é registada uma nova doação institucional.',
  },
];

export const WebhooksPanel: React.FC = () => {
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
  const [deliveries, setDeliveries] = useState<WebhookDeliveryLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Create form state
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<WebhookEventKey[]>([
    'user.registered',
    'sale.created',
  ]);

  // Inline edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [editSecret, setEditSecret] = useState('');
  const [editEvents, setEditEvents] = useState<WebhookEventKey[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);
  const [showPayloadSpec, setShowPayloadSpec] = useState(false);

  const loadWebhooks = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ webhooks: WebhookConfig[]; deliveries: WebhookDeliveryLog[] }>(
        '/api/admin/principal/webhooks'
      );
      setWebhooks(res.webhooks);
      setDeliveries(res.deliveries);
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erro ao carregar webhooks.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWebhooks();
  }, []);

  const toggleEvent = (key: WebhookEventKey) => {
    setSelectedEvents((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]
    );
  };

  const handleCreateWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedEvents.length === 0) {
      setFeedback({ type: 'err', text: 'Selecione pelo menos um evento para o webhook.' });
      return;
    }

    setFeedback(null);
    setSaving(true);
    try {
      await apiRequest('/api/admin/principal/webhooks', {
        method: 'POST',
        body: JSON.stringify({
          name,
          url,
          secret: secret || undefined,
          events: selectedEvents,
        }),
      });
      setName('');
      setUrl('');
      setSecret('');
      setFeedback({ type: 'ok', text: 'Webhook configurado com sucesso e pronto para automações externas.' });
      await loadWebhooks();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erro ao criar webhook.' });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (hook: WebhookConfig) => {
    setFeedback(null);
    try {
      await apiRequest(`/api/admin/principal/webhooks/${hook.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: hook.name,
          url: hook.url,
          events: hook.events,
          isActive: !hook.isActive,
        }),
      });
      setFeedback({
        type: 'ok',
        text: `Webhook "${hook.name}" ${!hook.isActive ? 'ativado' : 'pausado'}.`,
      });
      await loadWebhooks();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erro ao atualizar webhook.' });
    }
  };

  const handleTestWebhook = async (hook: WebhookConfig) => {
    setFeedback(null);
    setTestingId(hook.id);
    try {
      const res = await apiRequest<{
        success: boolean;
        statusCode: number | null;
        durationMs: number;
        errorMessage: string;
      }>(`/api/admin/principal/webhooks/${hook.id}/test`, { method: 'POST' });

      if (res.success) {
        setFeedback({
          type: 'ok',
          text: `Teste enviado para "${hook.name}" com sucesso (HTTP ${res.statusCode} · ${res.durationMs}ms).`,
        });
      } else {
        setFeedback({
          type: 'err',
          text: `Falha no envio de teste para "${hook.name}": ${res.errorMessage || `HTTP ${res.statusCode}`}.`,
        });
      }
      await loadWebhooks();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erro ao testar webhook.' });
    } finally {
      setTestingId(null);
    }
  };

  const handleDeleteWebhook = async (hook: WebhookConfig) => {
    setFeedback(null);
    try {
      await apiRequest(`/api/admin/principal/webhooks/${hook.id}`, { method: 'DELETE' });
      if (editingId === hook.id) setEditingId(null);
      setFeedback({ type: 'ok', text: `Webhook "${hook.name}" eliminado.` });
      await loadWebhooks();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erro ao eliminar webhook.' });
    }
  };

  const startEditing = (hook: WebhookConfig) => {
    setEditingId(hook.id);
    setEditName(hook.name);
    setEditUrl(hook.url);
    setEditSecret('');
    setEditEvents(hook.events);
    setFeedback(null);
  };

  const toggleEditEvent = (key: WebhookEventKey) => {
    setEditEvents((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]
    );
  };

  const handleSaveEdit = async (e: React.FormEvent, hook: WebhookConfig) => {
    e.preventDefault();
    if (editEvents.length === 0) {
      setFeedback({ type: 'err', text: 'Selecione pelo menos um evento para guardar o webhook.' });
      return;
    }
    setFeedback(null);
    setSavingEdit(true);
    try {
      await apiRequest(`/api/admin/principal/webhooks/${hook.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: editName,
          url: editUrl,
          secret: editSecret || undefined,
          events: editEvents,
          isActive: hook.isActive,
        }),
      });
      setEditingId(null);
      setEditSecret('');
      setFeedback({ type: 'ok', text: `Endpoint "${editName}" atualizado com sucesso.` });
      await loadWebhooks();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erro ao atualizar webhook.' });
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div className="space-y-6">
      {feedback && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            feedback.type === 'ok'
              ? 'border-[#15803D]/30 bg-[#EEF7F0] text-[#14532D]'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* Create New Webhook Form */}
      <form onSubmit={handleCreateWebhook} className="rounded-xl border border-[#DCE5DE] bg-white p-6 space-y-5">
        <div className="border-b border-[#EDF2EE] pb-4">
          <h2 className="font-display text-lg font-bold text-[#111814] flex items-center gap-2">
            <Webhook className="w-5 h-5 text-[#15803D]" />
            Gestão de Webhooks (Zapier, Make e Automações)
          </h2>
          <p className="text-xs text-[#546459] mt-0.5">
            Envie eventos JSON em tempo real (com assinatura opcional HMAC-SHA256 no cabeçalho <span className="font-mono-tabular">X-Nzila-Signature</span>) para fluxos externos no Zapier, Make ou ERPs.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-[#1C2720] mb-1">Nome da Integração *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Zapier — Registo de Vendas"
              className="w-full rounded-lg border border-[#D4DDD6] px-3.5 py-2.5 text-sm focus:border-[#15803D] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#1C2720] mb-1">URL do Endpoint (POST) *</label>
            <input
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://hooks.zapier.com/hooks/catch/..."
              className="w-full rounded-lg border border-[#D4DDD6] px-3.5 py-2.5 text-sm font-mono-tabular focus:border-[#15803D] focus:outline-none"
            />
          </div>

          <div>
            <PasswordInput
              id="webhook-secret-input"
              label="Segredo de Assinatura HMAC (opcional)"
              value={secret}
              onChange={setSecret}
              placeholder="Opcional para validar X-Nzila-Signature"
            />
          </div>
        </div>

        <div className="space-y-2.5">
          <div className="text-xs font-bold text-[#14532D]">Eventos Subscritos *</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {WEBHOOK_EVENT_CATALOG.map((ev) => {
              const checked = selectedEvents.includes(ev.key);
              return (
                <label
                  key={ev.key}
                  className={`flex items-start gap-2.5 rounded-lg border p-3 cursor-pointer transition-colors ${
                    checked
                      ? 'border-[#15803D] bg-[#EEF7F0]'
                      : 'border-[#DCE5DE] bg-[#FAFBF9] hover:bg-[#F2F7F3]'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleEvent(ev.key)}
                    className="mt-0.5 h-4 w-4 accent-[#14532D]"
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-[#111814]">{ev.label}</div>
                    <div className="text-[11px] text-[#546459] mt-0.5 leading-snug">{ev.description}</div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#EDF2EE] pt-4">
          <button
            type="button"
            onClick={() => setShowPayloadSpec((prev) => !prev)}
            className="text-xs font-semibold text-[#14532D] hover:underline"
          >
            {showPayloadSpec ? 'Ocultar modelo JSON (Zapier / Make)' : 'Ver modelo de payload JSON (Zapier / Make)'}
          </button>

          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-[#14532D] px-6 py-2.5 text-xs font-bold text-white hover:bg-[#15803D] disabled:opacity-50 transition-colors"
          >
            <PlusCircle className="w-4 h-4" />
            {saving ? 'A guardar...' : 'Adicionar Webhook'}
          </button>
        </div>

        {showPayloadSpec && (
          <div className="rounded-lg border border-[#DCE5DE] bg-[#F7F9F7] p-4 space-y-2 text-xs">
            <div className="font-semibold text-[#14532D]">
              Cabeçalhos HTTP enviados: <span className="font-mono-tabular">X-Nzila-Event</span> ·{' '}
              <span className="font-mono-tabular">X-Nzila-Delivery-Timestamp</span> ·{' '}
              <span className="font-mono-tabular">X-Nzila-Signature</span> (quando segredo HMAC definido)
            </div>
            <pre className="overflow-x-auto rounded-lg bg-[#111814] p-3 text-[11px] text-[#E5ECE6] font-mono-tabular leading-relaxed">
{`{
  "event": "sale.created",
  "timestamp": "2026-11-18T10:30:00.000Z",
  "platform": "Nzila Agro",
  "data": {
    "listingId": 12,
    "sellerId": 4,
    "sellerName": "Cooperativa Agrícola do Huambo",
    "quantity": 5,
    "totalKz": 90000,
    "saleDate": "2026-11-18"
  }
}`}
            </pre>
          </div>
        )}
      </form>

      {/* Configured Webhooks List */}
      <div className="rounded-xl border border-[#DCE5DE] bg-white p-6 space-y-4">
        <h3 className="font-display text-base font-bold text-[#111814]">
          Webhooks Configurados ({webhooks.length})
        </h3>

        {loading ? (
          <p className="text-xs text-[#546459]">A carregar webhooks...</p>
        ) : webhooks.length === 0 ? (
          <p className="text-sm text-[#546459]">
            Ainda não existe nenhum webhook configurado. Adicione um endpoint Zapier ou Make acima para automatizar fluxos.
          </p>
        ) : (
          <div className="divide-y divide-[#EDF2EE]">
            {webhooks.map((hook) => (
              <div key={hook.id} className="py-4 space-y-3">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-bold text-sm text-[#111814]">{hook.name}</span>
                      <span aria-hidden="true" className="text-[#9AA89F]">·</span>
                      <span className={`font-semibold ${hook.isActive ? 'text-[#15803D]' : 'text-[#7B8B80]'}`}>
                        {hook.isActive ? 'Ativo' : 'Pausado'}
                      </span>
                      {hook.hasSecret && (
                        <>
                          <span aria-hidden="true" className="text-[#9AA89F]">·</span>
                          <span className="text-[#546459]">Assinado (HMAC-SHA256)</span>
                        </>
                      )}
                    </div>
                    <div className="font-mono-tabular text-xs text-[#445449] truncate">{hook.url}</div>
                    <div className="text-[11px] text-[#546459]">
                      Eventos: <span className="font-mono-tabular text-[#14532D]">{hook.events.join(', ')}</span>
                      {hook.lastTriggeredAt && (
                        <>
                          {' · '}Último disparo:{' '}
                          <span className="font-mono-tabular">
                            {new Date(hook.lastTriggeredAt + (hook.lastTriggeredAt.endsWith('Z') ? '' : 'Z')).toLocaleString('pt-AO')}
                            {hook.lastStatusCode ? ` (HTTP ${hook.lastStatusCode})` : ''}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={testingId === hook.id}
                      onClick={() => handleTestWebhook(hook)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#EAB308] px-3 py-1.5 text-xs font-bold text-[#111814] hover:bg-[#CA8A04] hover:text-white disabled:opacity-50 transition-colors whitespace-nowrap"
                    >
                      <Send className="w-3.5 h-3.5" />
                      {testingId === hook.id ? 'A enviar...' : 'Testar Envio'}
                    </button>
                    <button
                      type="button"
                      onClick={() => (editingId === hook.id ? setEditingId(null) : startEditing(hook))}
                      className="inline-flex items-center gap-1 rounded-lg border border-[#D4DDD6] bg-white px-3 py-1.5 text-xs font-semibold text-[#14532D] hover:bg-[#F2F7F3] whitespace-nowrap"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      {editingId === hook.id ? 'Cancelar' : 'Editar'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleActive(hook)}
                      className="rounded-lg border border-[#D4DDD6] bg-white px-3 py-1.5 text-xs font-semibold text-[#1C2720] hover:bg-[#F2F7F3] whitespace-nowrap"
                    >
                      {hook.isActive ? 'Pausar' : 'Ativar'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteWebhook(hook)}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 whitespace-nowrap"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Eliminar
                    </button>
                  </div>
                </div>

                {editingId === hook.id && (
                  <form
                    onSubmit={(e) => handleSaveEdit(e, hook)}
                    className="rounded-lg border border-[#DCE5DE] bg-[#F7F9F7] p-4 space-y-4"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-[#1C2720] mb-1">Nome *</label>
                        <input
                          type="text"
                          required
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="w-full rounded-lg border border-[#D4DDD6] bg-white px-3 py-2 text-xs focus:border-[#15803D] focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-[#1C2720] mb-1">URL do Endpoint *</label>
                        <input
                          type="url"
                          required
                          value={editUrl}
                          onChange={(e) => setEditUrl(e.target.value)}
                          className="w-full rounded-lg border border-[#D4DDD6] bg-white px-3 py-2 text-xs font-mono-tabular focus:border-[#15803D] focus:outline-none"
                        />
                      </div>
                      <div>
                        <PasswordInput
                          id={`edit-webhook-secret-${hook.id}`}
                          label={hook.hasSecret ? 'Novo Segredo HMAC (opcional)' : 'Segredo HMAC (opcional)'}
                          value={editSecret}
                          onChange={setEditSecret}
                          placeholder={hook.hasSecret ? 'Deixe em branco para manter' : 'Opcional'}
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {WEBHOOK_EVENT_CATALOG.map((ev) => {
                        const checked = editEvents.includes(ev.key);
                        return (
                          <label
                            key={ev.key}
                            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold cursor-pointer ${
                              checked
                                ? 'border-[#15803D] bg-[#EEF7F0] text-[#14532D]'
                                : 'border-[#D4DDD6] bg-white text-[#445449]'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleEditEvent(ev.key)}
                              className="h-3.5 w-3.5 accent-[#14532D]"
                            />
                            {ev.key}
                          </label>
                        );
                      })}
                    </div>

                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded-lg border border-[#D4DDD6] bg-white px-3.5 py-1.5 text-xs font-semibold text-[#445449] hover:text-[#111814]"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={savingEdit}
                        className="rounded-lg bg-[#14532D] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#15803D] disabled:opacity-50"
                      >
                        {savingEdit ? 'A guardar...' : 'Guardar Alterações'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delivery History Table */}
      {deliveries.length > 0 && (
        <div className="rounded-xl border border-[#DCE5DE] bg-white p-6 space-y-4">
          <h3 className="font-display text-base font-bold text-[#111814]">
            Histórico Recente de Entregas ({deliveries.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#E5ECE6] text-[#546459]">
                <tr>
                  <th className="py-2 pr-3 font-semibold">Timestamp</th>
                  <th className="py-2 pr-3 font-semibold">Webhook</th>
                  <th className="py-2 pr-3 font-semibold">Evento</th>
                  <th className="py-2 pr-3 font-semibold text-right">HTTP</th>
                  <th className="py-2 pr-3 font-semibold text-right">Latência</th>
                  <th className="py-2 font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EDF2EE]">
                {deliveries.map((d) => (
                  <tr key={d.id} className="hover:bg-[#F7F9F7]">
                    <td className="py-2.5 pr-3 font-mono-tabular text-[#546459] whitespace-nowrap">
                      {new Date(d.createdAt + (d.createdAt.endsWith('Z') ? '' : 'Z')).toLocaleString('pt-AO')}
                    </td>
                    <td className="py-2.5 pr-3 font-semibold text-[#111814] whitespace-nowrap">{d.webhookName}</td>
                    <td className="py-2.5 pr-3 font-mono-tabular text-[#14532D] whitespace-nowrap">{d.eventType}</td>
                    <td className="py-2.5 pr-3 text-right font-mono-tabular">{d.statusCode ?? '—'}</td>
                    <td className="py-2.5 pr-3 text-right font-mono-tabular text-[#546459]">{d.durationMs}ms</td>
                    <td className="py-2.5">
                      {d.success ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-[#15803D]">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Entregue
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-semibold text-red-700">
                          <XCircle className="w-3.5 h-3.5" />
                          {d.errorMessage || 'Falha'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
