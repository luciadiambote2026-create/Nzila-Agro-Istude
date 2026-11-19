import React, { useEffect, useState } from 'react';
import { CheckCircle2, Compass, MessageSquare, Paintbrush, ShieldBan, Trash2, Users } from 'lucide-react';
import { apiRequest, formatCurrency } from '../lib/api';
import type { AuxAdminPermission, Listing, SupportMessage, User } from '../types';
import { PhotoMaskEditor } from './PhotoMaskEditor';

interface AuxAdminDashboardProps {
  onDataChanged: () => void;
  onReplayTour?: () => void;
}

export const AuxAdminDashboard: React.FC<AuxAdminDashboardProps> = ({ onDataChanged, onReplayTour }) => {
  const [tab, setTab] = useState<'listings' | 'users' | 'support'>('listings');
  const [users, setUsers] = useState<User[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [supportMessages, setSupportMessages] = useState<SupportMessage[]>([]);
  const [actorAccessProfile, setActorAccessProfile] = useState<string>('');
  const [actorPermissions, setActorPermissions] = useState<AuxAdminPermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [maskingTarget, setMaskingTarget] = useState<Listing | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<number, string>>({});

  const loadAuxOverview = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{
        actorAccessProfile?: string;
        actorPermissions?: AuxAdminPermission[];
        users: User[];
        listings: Listing[];
        supportMessages: SupportMessage[];
      }>('/api/admin/aux/overview');
      setActorAccessProfile(res.actorAccessProfile || '');
      setActorPermissions(res.actorPermissions || []);
      setUsers(res.users);
      setListings(res.listings);
      setSupportMessages(res.supportMessages);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erro ao carregar dados de moderação.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAuxOverview();
  }, []);

  const handleToggleUserStatus = async (u: User, nextStatus: 'Ativo' | 'Suspenso') => {
    setFeedback(null);
    try {
      await apiRequest(`/api/admin/aux/users/${u.id}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: nextStatus }),
      });
      setFeedback(`Estado de ${u.name} atualizado para ${nextStatus}.`);
      await loadAuxOverview();
      onDataChanged();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erro ao alterar estado.');
    }
  };

  const handleDeleteListing = async (id: number) => {
    setFeedback(null);
    try {
      await apiRequest(`/api/admin/aux/listings/${id}`, { method: 'DELETE' });
      setFeedback('Publicação eliminada com sucesso.');
      await loadAuxOverview();
      onDataChanged();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erro ao eliminar publicação.');
    }
  };

  const handleSaveMaskedImage = async (listingId: number, maskedDataUrl: string) => {
    await apiRequest(`/api/admin/aux/listings/${listingId}/image`, {
      method: 'PUT',
      body: JSON.stringify({ maskedImageUrl: maskedDataUrl }),
    });
    setFeedback('Fotografia mascarada e guardada com sucesso.');
    await loadAuxOverview();
    onDataChanged();
  };

  const handleReplySupport = async (ticketId: number) => {
    const reply = (replyDrafts[ticketId] || '').trim();
    if (!reply) return;
    try {
      await apiRequest(`/api/admin/aux/support/${ticketId}/reply`, {
        method: 'POST',
        body: JSON.stringify({ reply }),
      });
      setReplyDrafts((prev) => ({ ...prev, [ticketId]: '' }));
      setFeedback('Resposta de suporte enviada.');
      await loadAuxOverview();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erro ao responder.');
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#DCE5DE] pb-5">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#111814]">
            Painel do Administrador Auxiliar
          </h1>
          <p className="text-sm text-[#546459]">
            Moderação de contas, eliminação de produtos e ferramenta de pincel/borracha para mascaramento de fotos.
          </p>
          {actorAccessProfile && (
            <div className="mt-1 text-xs text-[#546459]">
              Perfil atribuído: <strong className="text-[#14532D]">{actorAccessProfile}</strong> ·{' '}
              <span className="font-mono-tabular">{actorPermissions.length}</span> permissões ativas
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {onReplayTour && (
            <button
              type="button"
              onClick={onReplayTour}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#D4DDD6] bg-white px-3 py-2 text-xs font-semibold text-[#14532D] hover:bg-[#F2F7F3] transition-colors whitespace-nowrap shrink-0"
            >
              <Compass className="w-3.5 h-3.5 text-[#CA8A04]" />
              Tour da Plataforma
            </button>
          )}
          <div data-tour="aux-tabs" className="flex items-center gap-1 rounded-lg bg-white p-1 border border-[#D4DDD6]">
          <button
            type="button"
            onClick={() => setTab('listings')}
            className={`rounded-md px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
              tab === 'listings' ? 'bg-[#14532D] text-white' : 'text-[#445449] hover:text-[#111814]'
            }`}
          >
            Produtos & Mascaramento ({listings.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('users')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
              tab === 'users' ? 'bg-[#14532D] text-white' : 'text-[#445449] hover:text-[#111814]'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Contas ({users.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('support')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
              tab === 'support' ? 'bg-[#14532D] text-white' : 'text-[#445449] hover:text-[#111814]'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Suporte ({supportMessages.filter((m) => m.status === 'Aberto').length})
          </button>
          </div>
        </div>
      </div>

      {feedback && (
        <div className="rounded-lg border border-[#15803D]/30 bg-[#EEF7F0] px-4 py-3 text-sm text-[#14532D]">
          {feedback}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-[#DCE5DE] bg-white p-8 text-sm text-[#546459]">
          A carregar dados de moderação...
        </div>
      ) : tab === 'listings' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {listings.length === 0 ? (
            <div className="md:col-span-2 lg:col-span-3 rounded-xl border border-dashed border-[#C7D3CA] bg-white p-10 text-center text-sm text-[#546459]">
              Não existem produtos ou serviços submetidos até ao momento.
            </div>
          ) : (
            listings.map((item) => (
              <div key={item.id} className="overflow-hidden rounded-xl border border-[#DCE5DE] bg-white flex flex-col">
                <div className="aspect-[4/3] bg-[#EEF3EF] relative">
                  <img
                    src={item.imageUrl}
                    alt={item.title}
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  <div>
                    <div className="text-xs text-[#546459]">
                      {item.category} · {item.province} {item.isMasked ? '· Mascarada' : ''}
                    </div>
                    <h3 className="mt-1 font-display text-base font-bold text-[#111814]">{item.title}</h3>
                    <p className="mt-1 text-xs text-[#546459]">
                      Autor: <strong className="text-[#111814]">{item.sellerName}</strong> ({item.sellerStatus})
                    </p>
                    <p className="mt-1 font-mono-tabular text-sm font-bold text-[#14532D]">
                      {formatCurrency(item.priceKz, 'AOA')} / {item.unit}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 pt-3 border-t border-[#EDF2EE]">
                    <button
                      type="button"
                      onClick={() => setMaskingTarget(item)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#EAB308] px-3 py-2 text-xs font-bold text-[#111814] hover:bg-[#CA8A04] hover:text-white transition-colors whitespace-nowrap"
                    >
                      <Paintbrush className="w-3.5 h-3.5" />
                      Pincel / Borracha
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteListing(item.id)}
                      className="inline-flex items-center justify-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 whitespace-nowrap"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Eliminar
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      ) : tab === 'users' ? (
        <div className="overflow-x-auto rounded-xl border border-[#DCE5DE] bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[#E5ECE6] bg-[#F7F9F7] text-xs font-semibold text-[#546459]">
              <tr>
                <th className="px-4 py-3">Utilizador</th>
                <th className="px-4 py-3">Província / Profissão</th>
                <th className="px-4 py-3">Contacto</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Ações de Moderação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EDF2EE]">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-[#F7F9F7]">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <img
                        src={u.profilePhoto}
                        alt={u.name}
                        className="h-10 w-10 rounded-lg object-cover border border-[#DCE5DE] shrink-0"
                      />
                      <div>
                        <div className="font-semibold text-[#111814]">{u.name}</div>
                        <div className="text-xs text-[#546459]">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-[#445449]">
                    <div>{u.province}</div>
                    <div className="text-[#7B8B80]">{u.profession}</div>
                  </td>
                  <td className="px-4 py-3 text-xs font-mono-tabular text-[#1C2720]">
                    <div>Tel: {u.phone}</div>
                    <div>WA: {u.whatsapp}</div>
                  </td>
                  <td className="px-4 py-3 text-xs font-semibold">
                    <span
                      className={
                        u.status === 'Ativo'
                          ? 'text-[#15803D]'
                          : u.status === 'Pendente'
                          ? 'text-[#B45309]'
                          : 'text-red-700'
                      }
                    >
                      {u.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {u.role === 'ADMIN_PRINCIPAL' ? (
                      <span className="text-xs text-[#7B8B80]">Admin Principal</span>
                    ) : (
                      <div className="inline-flex items-center gap-2">
                        {u.status !== 'Ativo' && (
                          <button
                            type="button"
                            onClick={() => handleToggleUserStatus(u, 'Ativo')}
                            className="inline-flex items-center gap-1 rounded-lg bg-[#15803D] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#14532D]"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Ativar
                          </button>
                        )}
                        {u.status !== 'Suspenso' && (
                          <button
                            type="button"
                            onClick={() => handleToggleUserStatus(u, 'Suspenso')}
                            className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                          >
                            <ShieldBan className="w-3.5 h-3.5" />
                            Desativar
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-4">
          {supportMessages.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#C7D3CA] bg-white p-10 text-center text-sm text-[#546459]">
              Sem mensagens na caixa de suporte.
            </div>
          ) : (
            supportMessages.map((msg) => (
              <div key={msg.id} className="rounded-xl border border-[#DCE5DE] bg-white p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-bold text-[#111814]">
                    {msg.subject} — {msg.userName} ({msg.userEmail})
                  </span>
                  <span className={msg.status === 'Respondido' ? 'text-[#15803D] font-semibold' : 'text-[#B45309] font-semibold'}>
                    {msg.status}
                  </span>
                </div>
                <p className="text-sm text-[#445449]">{msg.message}</p>
                {msg.adminReply ? (
                  <div className="rounded-lg bg-[#F2F7F3] p-3 text-xs text-[#14532D]">
                    <strong>Respondido por {msg.repliedBy}:</strong> {msg.adminReply}
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={replyDrafts[msg.id] || ''}
                      onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [msg.id]: e.target.value }))}
                      placeholder="Escreva a resposta administrativa..."
                      className="flex-1 rounded-lg border border-[#D4DDD6] px-3 py-2 text-xs focus:border-[#15803D] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleReplySupport(msg.id)}
                      className="rounded-lg bg-[#14532D] px-4 py-2 text-xs font-semibold text-white hover:bg-[#15803D]"
                    >
                      Responder
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {maskingTarget && (
        <PhotoMaskEditor
          title={maskingTarget.title}
          imageUrl={maskingTarget.imageUrl}
          onClose={() => setMaskingTarget(null)}
          onSave={(masked) => handleSaveMaskedImage(maskingTarget.id, masked)}
        />
      )}
    </div>
  );
};
