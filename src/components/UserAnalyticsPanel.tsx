import React, { useCallback, useEffect, useState } from 'react';
import { BarChart3, PlusCircle, Trash2 } from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiRequest, formatCurrency } from '../lib/api';
import type { Listing, UserAnalyticsResponse } from '../types';

interface UserAnalyticsPanelProps {
  listings: Listing[];
}

export const UserAnalyticsPanel: React.FC<UserAnalyticsPanelProps> = ({ listings }) => {
  const [monthsRange, setMonthsRange] = useState<6 | 12>(6);
  const [chartMode, setChartMode] = useState<'activity' | 'revenue'>('activity');
  const [analytics, setAnalytics] = useState<UserAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Record sale form state
  const [selectedListingId, setSelectedListingId] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('1');
  const [totalKz, setTotalKz] = useState<string>('');
  const [saleDate, setSaleDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState<string>('');
  const [savingSale, setSavingSale] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<UserAnalyticsResponse>(`/api/users/analytics?months=${monthsRange}`);
      setAnalytics(res);
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erro ao carregar gráficos.' });
    } finally {
      setLoading(false);
    }
  }, [monthsRange]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  useEffect(() => {
    if (!selectedListingId && listings.length > 0) {
      setSelectedListingId(String(listings[0].id));
      setTotalKz(String(listings[0].priceKz));
    }
  }, [listings, selectedListingId]);

  const handleListingSelectChange = (newId: string) => {
    setSelectedListingId(newId);
    const found = listings.find((l) => String(l.id) === newId);
    if (found) {
      const qty = Math.max(Number(quantity) || 1, 1);
      setTotalKz(String(Math.round(found.priceKz * qty)));
    }
  };

  const handleQuantityChange = (val: string) => {
    setQuantity(val);
    const found = listings.find((l) => String(l.id) === selectedListingId);
    const qty = Number(val);
    if (found && Number.isFinite(qty) && qty > 0) {
      setTotalKz(String(Math.round(found.priceKz * qty)));
    }
  };

  const handleRecordSale = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setSavingSale(true);
    try {
      await apiRequest('/api/users/sales', {
        method: 'POST',
        body: JSON.stringify({
          listingId: Number(selectedListingId),
          quantity: Number(quantity),
          totalKz: Number(totalKz),
          saleDate,
          note,
        }),
      });
      setNote('');
      setFeedback({ type: 'ok', text: 'Venda registada e refletida nos gráficos mensais.' });
      await loadAnalytics();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erro ao registar venda.' });
    } finally {
      setSavingSale(false);
    }
  };

  const handleDeleteSale = async (saleId: number) => {
    setFeedback(null);
    try {
      await apiRequest(`/api/users/sales/${saleId}`, { method: 'DELETE' });
      await loadAnalytics();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erro ao eliminar registo.' });
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

      {/* Summary KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-[#DCE5DE] bg-white p-5">
          <div className="text-xs font-medium text-[#546459]">Consultas ({monthsRange} meses)</div>
          <div className="mt-1 font-display text-2xl font-extrabold text-[#14532D] font-mono-tabular">
            {analytics ? analytics.totals.inquiries : '—'}
          </div>
          <div className="mt-0.5 text-[11px] text-[#7B8B80]">Cliques de contacto na vitrine</div>
        </div>

        <div className="rounded-xl border border-[#DCE5DE] bg-white p-5">
          <div className="text-xs font-medium text-[#546459]">Vendas Registadas</div>
          <div className="mt-1 font-display text-2xl font-extrabold text-[#111814] font-mono-tabular">
            {analytics ? analytics.totals.salesCount : '—'}
          </div>
          <div className="mt-0.5 text-[11px] text-[#7B8B80]">Operações concluídas</div>
        </div>

        <div className="rounded-xl border border-[#DCE5DE] bg-white p-5">
          <div className="text-xs font-medium text-[#546459]">Volume de Vendas (Kz)</div>
          <div className="mt-1 font-display text-2xl font-extrabold text-[#CA8A04] font-mono-tabular">
            {analytics ? formatCurrency(analytics.totals.salesVolumeKz, 'AOA') : '—'}
          </div>
          <div className="mt-0.5 text-[11px] text-[#7B8B80]">Receita acumulada no período</div>
        </div>
      </div>

      {/* Main Recharts Card */}
      <div className="rounded-xl border border-[#DCE5DE] bg-white p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-[#111814] flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-[#15803D]" />
              Evolução Mensal de Consultas e Vendas
            </h2>
            <p className="text-xs text-[#546459] mt-0.5">
              Acompanhe a procura e o desempenho comercial dos seus produtos ao longo dos últimos meses.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Metric view switcher */}
            <div className="flex items-center gap-1 rounded-lg bg-[#F2F7F3] p-1 border border-[#DCE5DE]">
              <button
                type="button"
                onClick={() => setChartMode('activity')}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                  chartMode === 'activity'
                    ? 'bg-[#14532D] text-white'
                    : 'text-[#445449] hover:text-[#111814]'
                }`}
              >
                Consultas vs. Vendas
              </button>
              <button
                type="button"
                onClick={() => setChartMode('revenue')}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                  chartMode === 'revenue'
                    ? 'bg-[#14532D] text-white'
                    : 'text-[#445449] hover:text-[#111814]'
                }`}
              >
                Volume (Kz)
              </button>
            </div>

            {/* Period selector */}
            <div className="flex items-center gap-1 rounded-lg bg-[#F2F7F3] p-1 border border-[#DCE5DE]">
              <button
                type="button"
                onClick={() => setMonthsRange(6)}
                className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                  monthsRange === 6
                    ? 'bg-white text-[#14532D] shadow-sm'
                    : 'text-[#445449] hover:text-[#111814]'
                }`}
              >
                6 meses
              </button>
              <button
                type="button"
                onClick={() => setMonthsRange(12)}
                className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                  monthsRange === 12
                    ? 'bg-white text-[#14532D] shadow-sm'
                    : 'text-[#445449] hover:text-[#111814]'
                }`}
              >
                12 meses
              </button>
            </div>
          </div>
        </div>

        <div className="h-72 w-full">
          {loading || !analytics ? (
            <div className="h-full flex items-center justify-center text-xs text-[#546459]">
              A carregar dados dos gráficos...
            </div>
          ) : chartMode === 'activity' ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={analytics.months} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="nzilaInquiriesFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#15803D" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="#15803D" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="nzilaSalesFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#EAB308" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#EAB308" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5ECE6" />
                <XAxis dataKey="monthLabel" tick={{ fontSize: 12, fill: '#546459' }} stroke="#DCE5DE" />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#546459' }} stroke="#DCE5DE" />
                <Tooltip
                  contentStyle={{
                    borderRadius: 10,
                    borderColor: '#DCE5DE',
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area
                  type="monotone"
                  dataKey="inquiries"
                  name="Consultas Recebidas"
                  stroke="#15803D"
                  strokeWidth={2.5}
                  fill="url(#nzilaInquiriesFill)"
                />
                <Area
                  type="monotone"
                  dataKey="salesCount"
                  name="Vendas Concluídas"
                  stroke="#CA8A04"
                  strokeWidth={2.5}
                  fill="url(#nzilaSalesFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.months} margin={{ top: 10, right: 16, left: 6, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5ECE6" />
                <XAxis dataKey="monthLabel" tick={{ fontSize: 12, fill: '#546459' }} stroke="#DCE5DE" />
                <YAxis
                  tick={{ fontSize: 11, fill: '#546459' }}
                  stroke="#DCE5DE"
                  tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                />
                <Tooltip
                  formatter={(value: unknown) => [formatCurrency(Number(value || 0), 'AOA'), 'Volume de Vendas']}
                  contentStyle={{
                    borderRadius: 10,
                    borderColor: '#DCE5DE',
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar
                  dataKey="salesVolumeKz"
                  name="Volume de Vendas (Kz)"
                  fill="#14532D"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={44}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Record Sale Form + Recent Sales Table */}
      <div className="rounded-xl border border-[#DCE5DE] bg-white p-6 space-y-5">
        <div>
          <h3 className="font-display text-base font-bold text-[#111814] flex items-center gap-2">
            <PlusCircle className="w-4 h-4 text-[#15803D]" />
            Registar Venda de Produto ou Serviço
          </h3>
          <p className="text-xs text-[#546459] mt-0.5">
            Registe cada venda fechada para alimentar o gráfico mensal de volume comercial. As consultas são registadas automaticamente quando compradores clicam em "Contactar" na vitrine.
          </p>
        </div>

        {listings.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#C7D3CA] bg-[#F7F9F7] p-5 text-xs text-[#546459]">
            Publique primeiro um Produto Agrícola ou serviço de Consultoria/Formação na aba "Submissões e Publicações" para poder registar vendas.
          </div>
        ) : (
          <form onSubmit={handleRecordSale} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-[#1C2720] mb-1">Produto / Serviço</label>
              <select
                value={selectedListingId}
                onChange={(e) => handleListingSelectChange(e.target.value)}
                required
                className="w-full rounded-lg border border-[#D4DDD6] bg-white px-3 py-2 text-xs text-[#111814] focus:border-[#15803D] focus:outline-none"
              >
                {listings.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title} ({formatCurrency(item.priceKz, 'AOA')})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#1C2720] mb-1">Qtd.</label>
              <input
                type="number"
                step="0.5"
                min="0.5"
                required
                value={quantity}
                onChange={(e) => handleQuantityChange(e.target.value)}
                className="w-full rounded-lg border border-[#D4DDD6] px-3 py-2 text-xs font-mono-tabular focus:border-[#15803D] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#1C2720] mb-1">Total (Kz)</label>
              <input
                type="number"
                min="1"
                required
                value={totalKz}
                onChange={(e) => setTotalKz(e.target.value)}
                className="w-full rounded-lg border border-[#D4DDD6] px-3 py-2 text-xs font-mono-tabular focus:border-[#15803D] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#1C2720] mb-1">Data da Venda</label>
              <input
                type="date"
                required
                value={saleDate}
                onChange={(e) => setSaleDate(e.target.value)}
                className="w-full rounded-lg border border-[#D4DDD6] px-3 py-2 text-xs font-mono-tabular focus:border-[#15803D] focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-4">
              <label className="block text-xs font-medium text-[#1C2720] mb-1">Observação (opcional)</label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ex: Venda para cooperativa em Benguela"
                className="w-full rounded-lg border border-[#D4DDD6] px-3 py-2 text-xs focus:border-[#15803D] focus:outline-none"
              />
            </div>

            <div>
              <button
                type="submit"
                disabled={savingSale}
                className="w-full rounded-lg bg-[#14532D] px-4 py-2 text-xs font-bold text-white hover:bg-[#15803D] disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                {savingSale ? 'A registar...' : 'Registar Venda'}
              </button>
            </div>
          </form>
        )}

        {analytics && analytics.recentSales.length > 0 && (
          <div className="border-t border-[#EDF2EE] pt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#E5ECE6] text-[#546459]">
                <tr>
                  <th className="py-2 pr-3 font-semibold">Data</th>
                  <th className="py-2 pr-3 font-semibold">Produto / Serviço</th>
                  <th className="py-2 pr-3 font-semibold text-right">Qtd.</th>
                  <th className="py-2 pr-3 font-semibold text-right">Total</th>
                  <th className="py-2 font-semibold text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EDF2EE]">
                {analytics.recentSales.map((sale) => (
                  <tr key={sale.id}>
                    <td className="py-2.5 pr-3 font-mono-tabular text-[#546459] whitespace-nowrap">
                      {sale.saleDate}
                    </td>
                    <td className="py-2.5 pr-3">
                      <div className="font-semibold text-[#111814]">{sale.listingTitle}</div>
                      {sale.note && <div className="text-[11px] text-[#7B8B80]">{sale.note}</div>}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono-tabular">{sale.quantity}</td>
                    <td className="py-2.5 pr-3 text-right font-mono-tabular font-bold text-[#14532D] whitespace-nowrap">
                      {formatCurrency(sale.totalKz, 'AOA')}
                    </td>
                    <td className="py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => handleDeleteSale(sale.id)}
                        aria-label="Remover venda"
                        className="rounded p-1 text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
