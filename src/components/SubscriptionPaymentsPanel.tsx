import React, { useEffect, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  Sparkles,
  Upload,
} from 'lucide-react';
import { apiRequest, compressImageFileToDataUrl, formatCurrency } from '../lib/api';
import type { Listing, PaymentOrder, SubscriptionPlan, User } from '../types';

interface SubscriptionPaymentsPanelProps {
  user: User;
  listings: Listing[];
  onUserUpdated: (user: User) => void;
  onListingChanged: () => void;
}

interface PlansPayload {
  entityCode: string;
  featuredBoostPriceKz: number;
  featuredBoostDays: number;
  bankDetails: {
    iban: string;
    express: string;
    accountNumber: string;
    accountHolder: string;
    whatsapp: string;
  };
  plans: SubscriptionPlan[];
}

export const SubscriptionPaymentsPanel: React.FC<SubscriptionPaymentsPanelProps> = ({
  user,
  listings,
  onUserUpdated,
  onListingChanged,
}) => {
  const [plansData, setPlansData] = useState<PlansPayload | null>(null);
  const [orders, setOrders] = useState<PaymentOrder[]>([]);
  const [activeOrder, setActiveOrder] = useState<PaymentOrder | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'multicaixa_ref' | 'iban_transfer' | 'multicaixa_express'>('multicaixa_ref');
  const [selectedListingId, setSelectedListingId] = useState<string>('');
  const [proofFileUrl, setProofFileUrl] = useState<string>('');
  const [proofNotes, setProofNotes] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const loadAll = async () => {
    try {
      const [pRes, oRes] = await Promise.all([
        apiRequest<PlansPayload>('/api/payments/plans'),
        apiRequest<{ user: User; orders: PaymentOrder[] }>('/api/users/payment-orders'),
      ]);
      setPlansData(pRes);
      setOrders(oRes.orders);
      onUserUpdated(oRes.user);
      const pending = oRes.orders.find((o) => o.status === 'Aguardando Pagamento');
      if (pending && !activeOrder) {
        setActiveOrder(pending);
      }
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao carregar planos e pagamentos.',
      });
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const copyText = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(label);
      window.setTimeout(() => setCopiedField(null), 1800);
    } catch {
      // ignore clipboard restrictions
    }
  };

  const handleCreateSubscriptionOrder = async (planCode: string) => {
    setFeedback(null);
    setBusy(true);
    try {
      const res = await apiRequest<{ order: PaymentOrder }>('/api/users/payment-orders', {
        method: 'POST',
        body: JSON.stringify({
          orderType: 'subscription',
          planCode,
          paymentMethod,
        }),
      });
      setActiveOrder(res.order);
      setOrders((prev) => [res.order, ...prev]);
      setFeedback({
        type: 'ok',
        text: `Referência Multicaixa ${res.order.referenceCode} gerada com sucesso! Efetue o pagamento e carregue o comprovativo abaixo.`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao gerar referência de pagamento.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleCreateBoostOrder = async () => {
    if (!selectedListingId) {
      setFeedback({ type: 'err', text: 'Selecione primeiro o anúncio que pretende destacar.' });
      return;
    }
    setFeedback(null);
    setBusy(true);
    try {
      const res = await apiRequest<{ order: PaymentOrder }>('/api/users/payment-orders', {
        method: 'POST',
        body: JSON.stringify({
          orderType: 'featured_boost',
          listingId: Number(selectedListingId),
          paymentMethod,
        }),
      });
      setActiveOrder(res.order);
      setOrders((prev) => [res.order, ...prev]);
      setFeedback({
        type: 'ok',
        text: `Referência Multicaixa ${res.order.referenceCode} gerada para Destaque de 7 dias.`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao gerar referência de destaque.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleUseCreditToFeature = async () => {
    if (!selectedListingId) {
      setFeedback({ type: 'err', text: 'Selecione o anúncio que pretende destacar.' });
      return;
    }
    setFeedback(null);
    setBusy(true);
    try {
      const res = await apiRequest<{ success: boolean; featuredUntil: string; user: User }>(
        `/api/users/listings/${selectedListingId}/feature`,
        { method: 'POST' }
      );
      onUserUpdated(res.user);
      onListingChanged();
      setFeedback({
        type: 'ok',
        text: `Anúncio colocado em Destaque imediato até ${new Date(res.featuredUntil).toLocaleDateString('pt-AO')}!`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao ativar destaque com crédito.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleProofFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageFileToDataUrl(file, 1000, 0.8);
      setProofFileUrl(compressed);
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao processar imagem do comprovativo.',
      });
    }
  };

  const handleSubmitProof = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrder) return;
    setFeedback(null);
    setBusy(true);
    try {
      const res = await apiRequest<{ order: PaymentOrder }>(
        `/api/users/payment-orders/${activeOrder.id}/proof`,
        {
          method: 'POST',
          body: JSON.stringify({
            proofFileUrl: proofFileUrl || undefined,
            proofNotes,
          }),
        }
      );
      setActiveOrder(res.order);
      setOrders((prev) => prev.map((o) => (o.id === res.order.id ? res.order : o)));
      setProofFileUrl('');
      setProofNotes('');
      setFeedback({
        type: 'ok',
        text: `Comprovativo enviado para a referência ${res.order.referenceCode}. O Administrador Principal irá validar em breve.`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao enviar comprovativo.',
      });
    } finally {
      setBusy(false);
    }
  };

  const currentPlanCode = user.subscriptionPlan || 'basico';
  const featuredCredits = user.featuredCredits ?? 0;

  return (
    <div className="space-y-6">
      {/* Current Subscription Summary */}
      <div className="rounded-xl border border-[#DCE5DE] bg-white p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="font-display text-lg font-bold text-[#111814] flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-[#15803D]" />
            Planos de Subscrição & Pagamentos Multicaixa
          </h2>
          <p className="text-xs text-[#546459]">
            Ative a sua cota mensal, ganhe créditos para colocar anúncios no topo da vitrine e pague por Referência Multicaixa, Multicaixa Express ou IBAN.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <div className="rounded-lg border border-[#E5ECE6] bg-[#F8FBF9] px-3.5 py-2">
            <div className="text-[#546459]">Plano Atual</div>
            <div className="font-bold text-[#14532D] capitalize">{currentPlanCode}</div>
          </div>
          <div className="rounded-lg border border-[#E5ECE6] bg-[#F8FBF9] px-3.5 py-2">
            <div className="text-[#546459]">Créditos de Destaque</div>
            <div className="font-mono-tabular font-extrabold text-[#CA8A04] text-sm">
              {featuredCredits} {featuredCredits === 1 ? 'crédito' : 'créditos'}
            </div>
          </div>
        </div>
      </div>

      {feedback && (
        <div
          className={`rounded-xl border px-4 py-3 text-xs font-medium flex items-center gap-2 ${
            feedback.type === 'ok'
              ? 'border-[#15803D]/30 bg-[#EEF7F0] text-[#14532D]'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {feedback.type === 'ok' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Payment Method Selector + Subscription Plans */}
      <div className="rounded-xl border border-[#DCE5DE] bg-white p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="font-display text-base font-bold text-[#111814]">
            Escolha o Seu Plano Mensal
          </h3>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-[#546459] font-medium">Método preferido:</span>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}
              className="rounded-lg border border-[#D4DDD6] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#111814] focus:border-[#15803D] focus:outline-none"
            >
              <option value="multicaixa_ref">Referência Multicaixa (ATM / Express)</option>
              <option value="multicaixa_express">Multicaixa Express (Telemóvel)</option>
              <option value="iban_transfer">Transferência Bancária (IBAN)</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {plansData?.plans.map((plan) => (
            <div
              key={plan.code}
              className={`rounded-xl border p-5 flex flex-col justify-between space-y-4 ${
                plan.isPopular
                  ? 'border-[#15803D] bg-[#F8FBF9] ring-1 ring-[#15803D]/20'
                  : 'border-[#DCE5DE] bg-white'
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display text-base font-bold text-[#111814]">{plan.name}</span>
                  {plan.badgeLabel && (
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                        plan.isPopular
                          ? 'bg-[#14532D] text-[#FACC15]'
                          : 'bg-[#EEF3EF] text-[#14532D]'
                      }`}
                    >
                      {plan.badgeLabel}
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#546459]">{plan.description}</p>
                <div className="pt-1">
                  <span className="font-display text-2xl font-extrabold text-[#14532D] font-mono-tabular">
                    {formatCurrency(plan.priceKz, 'AOA')}
                  </span>
                  <span className="text-xs text-[#546459]"> / {plan.durationDays} dias</span>
                </div>
                <ul className="space-y-1.5 pt-2 border-t border-[#EDF2EE]">
                  {plan.features.map((feat, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-xs text-[#1C2720]">
                      <Check className="w-3.5 h-3.5 text-[#15803D] shrink-0 mt-0.5" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <button
                type="button"
                disabled={busy}
                onClick={() => handleCreateSubscriptionOrder(plan.code)}
                className={`w-full rounded-lg px-4 py-2.5 text-xs font-bold transition-colors disabled:opacity-50 ${
                  plan.isPopular
                    ? 'bg-[#14532D] text-white hover:bg-[#15803D]'
                    : 'border border-[#14532D]/30 bg-white text-[#14532D] hover:bg-[#EEF7F0]'
                }`}
              >
                Gerar Referência Multicaixa
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Featured Listing Boost Box */}
      <div className="rounded-xl border border-[#DCE5DE] bg-white p-6 space-y-4">
        <div>
          <h3 className="font-display text-base font-bold text-[#111814] flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#CA8A04]" />
            Colocar Anúncio em Destaque no Topo da Vitrine (7 dias)
          </h3>
          <p className="text-xs text-[#546459] mt-0.5">
            Anúncios em destaque aparecem primeiro para todos os compradores com selo dourado. Use 1 crédito do seu plano ou pague {formatCurrency(plansData?.featuredBoostPriceKz ?? 2500, 'AOA')} por referência.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <select
            value={selectedListingId}
            onChange={(e) => setSelectedListingId(e.target.value)}
            className="flex-1 rounded-lg border border-[#D4DDD6] bg-white px-3 py-2 text-xs focus:border-[#15803D] focus:outline-none"
          >
            <option value="">Selecione um dos seus anúncios...</option>
            {listings.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title} — {formatCurrency(item.priceKz, 'AOA')} {item.isFeatured ? '(Já em Destaque)' : ''}
              </option>
            ))}
          </select>

          <button
            type="button"
            disabled={busy || featuredCredits <= 0 || !selectedListingId}
            onClick={handleUseCreditToFeature}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#14532D] px-4 py-2 text-xs font-bold text-white hover:bg-[#15803D] disabled:opacity-40 whitespace-nowrap"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#FACC15]" />
            Usar 1 Crédito ({featuredCredits} disp.)
          </button>

          <button
            type="button"
            disabled={busy || !selectedListingId}
            onClick={handleCreateBoostOrder}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#CA8A04]/40 bg-[#FEFCE8] px-4 py-2 text-xs font-bold text-[#854D0E] hover:bg-[#FEF9C3] disabled:opacity-40 whitespace-nowrap"
          >
            Pagar {formatCurrency(plansData?.featuredBoostPriceKz ?? 2500, 'AOA')} (Ref.)
          </button>
        </div>
      </div>

      {/* Active Multicaixa Reference & Proof Upload */}
      {activeOrder && (
        <div className="rounded-xl border-2 border-[#15803D]/40 bg-[#F8FBF9] p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#DCE5DE] pb-3">
            <div>
              <h3 className="font-display text-base font-bold text-[#14532D]">
                Dados de Pagamento — {activeOrder.orderType === 'subscription' ? `Plano ${activeOrder.planName || activeOrder.planCode}` : `Destaque: ${activeOrder.listingTitle || `#${activeOrder.listingId}`}`}
              </h3>
              <p className="text-xs text-[#546459]">
                Pague no ATM Multicaixa, Multicaixa Express ou Transferência IBAN e envie o comprovativo abaixo.
              </p>
            </div>
            <span className="text-xs font-bold text-[#14532D] bg-[#EEF7F0] border border-[#15803D]/25 px-3 py-1 rounded-lg self-start">
              Estado: {activeOrder.status}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-lg border border-[#DCE5DE] bg-white p-3.5 flex items-center justify-between">
              <div>
                <div className="text-[11px] text-[#546459]">Entidade Multicaixa</div>
                <div className="font-mono-tabular text-lg font-extrabold text-[#111814]">
                  {activeOrder.entityCode}
                </div>
              </div>
              <button
                type="button"
                onClick={() => copyText('entity', activeOrder.entityCode)}
                className="p-1.5 rounded border border-[#D4DDD6] text-[#14532D] hover:bg-[#F2F7F3]"
                title="Copiar entidade"
              >
                {copiedField === 'entity' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>

            <div className="rounded-lg border border-[#DCE5DE] bg-white p-3.5 flex items-center justify-between">
              <div>
                <div className="text-[11px] text-[#546459]">Referência (9 dígitos)</div>
                <div className="font-mono-tabular text-lg font-extrabold text-[#14532D]">
                  {activeOrder.referenceCode}
                </div>
              </div>
              <button
                type="button"
                onClick={() => copyText('ref', activeOrder.referenceCode.replace(/\s+/g, ''))}
                className="p-1.5 rounded border border-[#D4DDD6] text-[#14532D] hover:bg-[#F2F7F3]"
                title="Copiar referência"
              >
                {copiedField === 'ref' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>

            <div className="rounded-lg border border-[#DCE5DE] bg-white p-3.5">
              <div className="text-[11px] text-[#546459]">Montante a Pagar</div>
              <div className="font-mono-tabular text-lg font-extrabold text-[#111814]">
                {formatCurrency(activeOrder.amountKz, 'AOA')}
              </div>
            </div>
          </div>

          {plansData?.bankDetails && (
            <div className="rounded-lg border border-[#E5ECE6] bg-white px-4 py-3 text-xs text-[#445449] flex flex-wrap gap-x-6 gap-y-1.5">
              <span>
                IBAN: <strong className="font-mono-tabular text-[#111814]">{plansData.bankDetails.iban}</strong>
              </span>
              <span>
                Multicaixa Express: <strong className="font-mono-tabular text-[#111814]">{plansData.bankDetails.express}</strong>
              </span>
              <span>
                Titular: <strong className="text-[#111814]">{plansData.bankDetails.accountHolder}</strong>
              </span>
            </div>
          )}

          {activeOrder.status !== 'Aprovado' && (
            <form onSubmit={handleSubmitProof} className="space-y-3 pt-2 border-t border-[#DCE5DE]">
              <div className="text-xs font-bold text-[#111814]">Enviar Comprovativo de Pagamento</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-[#546459] mb-1">
                    Foto ou Captura de Ecrã do Talão Multicaixa / IBAN
                  </label>
                  <label className="flex items-center gap-2 rounded-lg border border-dashed border-[#15803D]/50 bg-white px-3 py-2 text-xs text-[#14532D] cursor-pointer hover:bg-[#EEF7F0]">
                    <Upload className="w-4 h-4 shrink-0" />
                    <span className="truncate">
                      {proofFileUrl ? 'Comprovativo carregado (pronto a enviar)' : 'Selecionar imagem do comprovativo...'}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleProofFileChange}
                      className="hidden"
                    />
                  </label>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-[#546459] mb-1">
                    Nº da Operação / Observações (opcional)
                  </label>
                  <input
                    type="text"
                    value={proofNotes}
                    onChange={(e) => setProofNotes(e.target.value)}
                    placeholder="Ex: Pago via Multicaixa Express às 14:30"
                    className="w-full rounded-lg border border-[#D4DDD6] bg-white px-3 py-2 text-xs focus:border-[#15803D] focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={busy || (!proofFileUrl && !proofNotes.trim())}
                className="inline-flex items-center gap-2 rounded-lg bg-[#14532D] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#15803D] disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                {busy ? 'A enviar comprovativo...' : 'Submeter Comprovativo para Validação'}
              </button>
            </form>
          )}
        </div>
      )}

      {/* User Payment Orders History */}
      <div className="overflow-x-auto rounded-xl border border-[#DCE5DE] bg-white">
        <div className="border-b border-[#E5ECE6] px-5 py-4">
          <h3 className="font-display text-base font-bold text-[#111814]">
            Histórico de Referências e Pagamentos
          </h3>
        </div>
        <table className="w-full text-left text-xs">
          <thead className="border-b border-[#E5ECE6] bg-[#F7F9F7] text-[#546459] font-semibold">
            <tr>
              <th className="px-4 py-3">Referência</th>
              <th className="px-4 py-3">Descrição</th>
              <th className="px-4 py-3">Montante</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3 text-right">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EDF2EE]">
            {orders.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-[#546459]">
                  Ainda não gerou nenhuma referência de pagamento.
                </td>
              </tr>
            ) : (
              orders.map((ord) => (
                <tr key={ord.id} className="hover:bg-[#F7F9F7]">
                  <td className="px-4 py-3 font-mono-tabular font-bold text-[#14532D]">
                    {ord.referenceCode}
                  </td>
                  <td className="px-4 py-3 text-[#111814]">
                    {ord.orderType === 'subscription'
                      ? `Subscrição: ${ord.planName || ord.planCode}`
                      : `Destaque 7d: ${ord.listingTitle || `#${ord.listingId}`}`}
                  </td>
                  <td className="px-4 py-3 font-mono-tabular font-semibold text-[#111814]">
                    {formatCurrency(ord.amountKz, 'AOA')}
                  </td>
                  <td className="px-4 py-3 font-semibold">
                    <span
                      className={
                        ord.status === 'Aprovado'
                          ? 'text-[#15803D]'
                          : ord.status === 'Rejeitado'
                            ? 'text-red-700'
                            : ord.status === 'Comprovativo Enviado'
                              ? 'text-[#0F766E]'
                              : 'text-[#B45309]'
                      }
                    >
                      {ord.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono-tabular text-[#546459]">
                    {new Date(ord.createdAt).toLocaleDateString('pt-AO')}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {ord.status !== 'Aprovado' && (
                      <button
                        type="button"
                        onClick={() => setActiveOrder(ord)}
                        className="rounded border border-[#D4DDD6] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#14532D] hover:bg-[#F2F7F3]"
                      >
                        Abrir / Enviar Talão
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
