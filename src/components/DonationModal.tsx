import React, { useState } from 'react';
import { HeartHandshake, Lock, X } from 'lucide-react';
import { apiRequest, convertToKz, formatCurrency } from '../lib/api';
import type { CurrencyCode, FinancialSettings } from '../types';

interface DonationModalProps {
  settings: FinancialSettings;
  defaultCurrency: CurrencyCode;
  onClose: () => void;
}

export const DonationModal: React.FC<DonationModalProps> = ({ settings, defaultCurrency, onClose }) => {
  const [donorName, setDonorName] = useState('');
  const [donorContact, setDonorContact] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>(defaultCurrency);
  const [amount, setAmount] = useState('5000');
  const [method, setMethod] = useState<'IBAN' | 'Express' | 'Conta' | 'WhatsApp'>('IBAN');
  const [reference, setReference] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedMsg, setSubmittedMsg] = useState<string | null>(null);

  const numericAmount = Number(amount) || 0;
  const equivalentKz = convertToKz(numericAmount, currency, settings);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiRequest<{ success: boolean; message: string }>('/api/public/donations', {
        method: 'POST',
        body: JSON.stringify({
          donorName: donorName.trim() || 'Anónimo',
          donorContact: donorContact.trim() || 'Privado',
          amount: numericAmount,
          currency,
          method,
          reference,
          message,
        }),
      });
      setSubmittedMsg(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao registar doação.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 overflow-y-auto">
      <div className="my-8 w-full max-w-lg overflow-hidden rounded-xl border border-[#D4DDD6] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#E5ECE6] bg-[#14532D] px-6 py-4 text-white">
          <div className="flex items-center gap-2.5">
            <HeartHandshake className="w-5 h-5 text-[#FACC15]" />
            <div>
              <h2 className="font-display text-base font-bold">Doação Direta Privada</h2>
              <p className="text-xs text-white/80">Confidencial — sem exibição pública de doadores</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar janela de doação"
            className="rounded-lg p-1.5 text-white/80 hover:bg-white/10 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Official Coordinates Summary */}
          <div className="rounded-lg border border-[#DCE5DE] bg-[#F7F9F7] p-4 text-xs space-y-1.5">
            <div className="font-semibold text-[#14532D] mb-1">Coordenadas Oficiais para Transferência</div>
            <div className="flex justify-between gap-2">
              <span className="text-[#546459]">Titular:</span>
              <span className="font-medium text-[#111814]">{settings.officialAccountHolder}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-[#546459]">IBAN:</span>
              <span className="font-mono-tabular font-semibold text-[#111814]">{settings.officialIban}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-[#546459]">Multicaixa Express:</span>
              <span className="font-mono-tabular font-semibold text-[#111814]">{settings.officialExpress}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-[#546459]">N.º de Conta:</span>
              <span className="font-mono-tabular font-semibold text-[#111814]">{settings.officialAccountNumber}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-[#546459]">WhatsApp Oficial:</span>
              <span className="font-mono-tabular font-semibold text-[#111814]">{settings.officialWhatsapp}</span>
            </div>
          </div>

          {submittedMsg ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-[#15803D]/30 bg-[#EEF7F0] p-4 text-sm text-[#14532D]">
                {submittedMsg}
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg bg-[#14532D] px-5 py-2 text-sm font-semibold text-white hover:bg-[#15803D]"
                >
                  Concluir
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3.5">
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#1C2720] mb-1">Valor da Doação *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full rounded-lg border border-[#D4DDD6] px-3 py-2 text-sm font-mono-tabular focus:border-[#15803D] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#1C2720] mb-1">Moeda</label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                    className="w-full rounded-lg border border-[#D4DDD6] bg-white px-3 py-2 text-sm focus:border-[#15803D] focus:outline-none"
                  >
                    <option value="AOA">AOA (Kwanza)</option>
                    <option value="USD">USD (Dólar)</option>
                    <option value="EUR">EUR (Euro)</option>
                    <option value="GBP">GBP (Libra)</option>
                  </select>
                </div>
              </div>

              {currency !== 'AOA' && numericAmount > 0 && (
                <p className="text-xs text-[#546459] font-mono-tabular">
                  Equivalente aproximado: {formatCurrency(equivalentKz, 'AOA')}
                </p>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#1C2720] mb-1">Via de Pagamento</label>
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value as 'IBAN' | 'Express' | 'Conta' | 'WhatsApp')}
                    className="w-full rounded-lg border border-[#D4DDD6] bg-white px-3 py-2 text-sm focus:border-[#15803D] focus:outline-none"
                  >
                    <option value="IBAN">Transferência IBAN</option>
                    <option value="Express">Multicaixa Express</option>
                    <option value="Conta">Depósito em Conta</option>
                    <option value="WhatsApp">Comprovativo WhatsApp</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#1C2720] mb-1">Referência / Comprovativo</label>
                  <input
                    type="text"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="N.º de operação"
                    className="w-full rounded-lg border border-[#D4DDD6] px-3 py-2 text-sm focus:border-[#15803D] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#1C2720] mb-1">Nome (Opcional / Privado)</label>
                  <input
                    type="text"
                    value={donorName}
                    onChange={(e) => setDonorName(e.target.value)}
                    placeholder="Anónimo"
                    className="w-full rounded-lg border border-[#D4DDD6] px-3 py-2 text-sm focus:border-[#15803D] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#1C2720] mb-1">Contacto Privado (Opcional)</label>
                  <input
                    type="text"
                    value={donorContact}
                    onChange={(e) => setDonorContact(e.target.value)}
                    placeholder="Telefone ou e-mail"
                    className="w-full rounded-lg border border-[#D4DDD6] px-3 py-2 text-sm focus:border-[#15803D] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1C2720] mb-1">Nota Privada para a Administração</label>
                <textarea
                  rows={2}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Apoio à agricultura familiar..."
                  className="w-full rounded-lg border border-[#D4DDD6] px-3 py-2 text-sm focus:border-[#15803D] focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="inline-flex items-center gap-1.5 text-xs text-[#546459]">
                  <Lock className="w-3.5 h-3.5 text-[#15803D]" />
                  Visível apenas ao Admin Principal
                </span>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-lg bg-[#EAB308] px-5 py-2.5 text-xs font-bold text-[#111814] hover:bg-[#CA8A04] hover:text-white transition-colors whitespace-nowrap"
                >
                  {loading ? 'A registar...' : 'Confirmar Doação Privada'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
