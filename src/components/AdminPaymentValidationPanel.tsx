import React, { useEffect, useState } from 'react';
import { CheckCircle2, CreditCard, Eye, RefreshCw, XCircle } from 'lucide-react';
import { apiRequest, formatCurrency } from '../lib/api';
import type { PaymentOrder } from '../types';

export const AdminPaymentValidationPanel: React.FC<{ onReviewed?: () => void }> = ({ onReviewed }) => {
  const [orders, setOrders] = useState<PaymentOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [notesMap, setNotesMap] = useState<Record<number, string>>({});
  const [previewProof, setPreviewProof] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ orders: PaymentOrder[] }>('/api/admin/principal/payment-orders');
      setOrders(res.orders);
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao carregar ordens de pagamento.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const handleReview = async (orderId: number, decision: 'approve' | 'reject') => {
    setFeedback(null);
    setBusyId(orderId);
    try {
      const res = await apiRequest<{ success: boolean; status: string; detail: string }>(
        `/api/admin/principal/payment-orders/${orderId}/review`,
        {
          method: 'PUT',
          body: JSON.stringify({
            decision,
            adminNotes: notesMap[orderId] || '',
          }),
        }
      );
      setFeedback({
        type: 'ok',
        text:
          decision === 'approve'
            ? `Pagamento aprovado! ${res.detail}`
            : 'Comprovativo rejeitado e utilizador notificado.',
      });
      await loadOrders();
      onReviewed?.();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao validar pagamento.',
      });
    } finally {
      setBusyId(null);
    }
  };

  const pendingProofCount = orders.filter((o) => o.status === 'Comprovativo Enviado').length;

  return (
    <div className="rounded-xl border border-[#DCE5DE] bg-white p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-bold text-[#111814] flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-[#15803D]" />
            Validação de Pagamentos Multicaixa / IBAN e Subscrições
            {pendingProofCount > 0 && (
              <span className="rounded bg-[#FEFCE8] border border-[#CA8A04]/40 px-2 py-0.5 text-[11px] font-bold text-[#854D0E]">
                {pendingProofCount} por validar
              </span>
            )}
          </h3>
          <p className="text-xs text-[#546459] mt-0.5">
            Ao aprovar um comprovativo, a plataforma ativa automaticamente o plano do produtor, soma os créditos de destaque ou destaca o anúncio por 7 dias.
          </p>
        </div>

        <button
          type="button"
          onClick={loadOrders}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#D4DDD6] bg-white px-3 py-1.5 text-xs font-semibold text-[#14532D] hover:bg-[#F2F7F3] shrink-0 self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {feedback && (
        <div
          className={`rounded-lg border px-3.5 py-2.5 text-xs font-medium ${
            feedback.type === 'ok'
              ? 'border-[#15803D]/30 bg-[#EEF7F0] text-[#14532D]'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {previewProof && (
        <div className="rounded-xl border border-[#DCE5DE] bg-[#F8FBF9] p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#14532D]">Pré-visualização do Comprovativo</span>
            <button
              type="button"
              onClick={() => setPreviewProof(null)}
              className="text-xs font-semibold text-[#546459] hover:text-[#111814]"
            >
              Fechar
            </button>
          </div>
          <img
            src={previewProof}
            alt="Comprovativo de pagamento"
            className="max-h-96 rounded-lg border border-[#DCE5DE] object-contain bg-white"
          />
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-[#E5ECE6] bg-[#F7F9F7] text-[#546459] font-semibold">
            <tr>
              <th className="px-3 py-2.5">Ref. Multicaixa</th>
              <th className="px-3 py-2.5">Utilizador</th>
              <th className="px-3 py-2.5">Produto / Plano</th>
              <th className="px-3 py-2.5">Valor</th>
              <th className="px-3 py-2.5">Comprovativo</th>
              <th className="px-3 py-2.5">Estado</th>
              <th className="px-3 py-2.5 text-right">Decisão</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EDF2EE]">
            {orders.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-[#546459]">
                  Nenhuma ordem de pagamento Multicaixa/IBAN registada até ao momento.
                </td>
              </tr>
            ) : (
              orders.map((ord) => (
                <tr key={ord.id} className="hover:bg-[#F7F9F7] align-top">
                  <td className="px-3 py-3 font-mono-tabular font-bold text-[#14532D] whitespace-nowrap">
                    <div>{ord.referenceCode}</div>
                    <div className="text-[10px] font-normal text-[#546459]">Ent. {ord.entityCode}</div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="font-semibold text-[#111814]">{ord.userName}</div>
                    <div className="text-[11px] text-[#546459]">{ord.userPhone || ord.userEmail}</div>
                  </td>
                  <td className="px-3 py-3 text-[#111814]">
                    {ord.orderType === 'subscription'
                      ? `Plano ${ord.planName || ord.planCode}`
                      : `Destaque 7d: ${ord.listingTitle || `#${ord.listingId}`}`}
                  </td>
                  <td className="px-3 py-3 font-mono-tabular font-bold text-[#111814] whitespace-nowrap">
                    {formatCurrency(ord.amountKz, 'AOA')}
                  </td>
                  <td className="px-3 py-3 space-y-1">
                    {ord.proofFileUrl ? (
                      <button
                        type="button"
                        onClick={() => setPreviewProof(ord.proofFileUrl)}
                        className="inline-flex items-center gap-1 rounded border border-[#14532D]/30 bg-[#EEF7F0] px-2 py-1 text-[11px] font-semibold text-[#14532D] hover:bg-[#DFF1E4]"
                      >
                        <Eye className="w-3 h-3" />
                        Ver Talão
                      </button>
                    ) : (
                      <span className="text-[#7B8B80]">Sem imagem</span>
                    )}
                    {ord.proofNotes && (
                      <div className="text-[11px] text-[#546459] max-w-[180px] break-words">
                        {ord.proofNotes}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 font-semibold whitespace-nowrap">
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
                  <td className="px-3 py-3 text-right">
                    {ord.status !== 'Aprovado' ? (
                      <div className="flex flex-col items-end gap-1.5">
                        <input
                          type="text"
                          value={notesMap[ord.id] || ''}
                          onChange={(e) => setNotesMap({ ...notesMap, [ord.id]: e.target.value })}
                          placeholder="Nota (opcional)"
                          className="w-36 rounded border border-[#D4DDD6] bg-white px-2 py-1 text-[11px] focus:border-[#15803D] focus:outline-none"
                        />
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={busyId === ord.id}
                            onClick={() => handleReview(ord.id, 'approve')}
                            className="inline-flex items-center gap-1 rounded bg-[#14532D] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#15803D] disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            Aprovar
                          </button>
                          <button
                            type="button"
                            disabled={busyId === ord.id}
                            onClick={() => handleReview(ord.id, 'reject')}
                            className="inline-flex items-center gap-1 rounded border border-red-200 bg-white px-2.5 py-1 text-[11px] font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
                          >
                            <XCircle className="w-3 h-3" />
                            Rejeitar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <span className="text-[11px] text-[#546459]">
                        Validado por {ord.reviewedBy || 'Admin'}
                      </span>
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
