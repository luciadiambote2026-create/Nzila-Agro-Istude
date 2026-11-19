import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, CheckCheck, MessageCircle, Send, UserRound, X } from 'lucide-react';
import {
  appendDirectMessage,
  DirectConversation,
  getOrCreateConversationForListing,
  loadConversations,
  markConversationRead,
  resolvePeerIdentity,
  subscribeToP2PUpdates,
} from '../lib/directMessages';
import type { Listing, User } from '../types';

interface DirectMessagesModalProps {
  isOpen: boolean;
  currentUser: User | null;
  targetListing: Listing | null;
  availableListings: Listing[];
  onClose: () => void;
  onConversationsUpdated: (conversations: DirectConversation[]) => void;
}

const QUICK_PROMPTS = [
  'Olá! Este produto ainda está disponível?',
  'Qual é a quantidade mínima e o prazo de entrega?',
  'Podemos combinar uma visita ou envio para a minha província?',
];

export const DirectMessagesModal: React.FC<DirectMessagesModalProps> = ({
  isOpen,
  currentUser,
  targetListing,
  availableListings,
  onClose,
  onConversationsUpdated,
}) => {
  const identity = useMemo(() => resolvePeerIdentity(currentUser), [currentUser]);
  const [conversations, setConversations] = useState<DirectConversation[]>(() => loadConversations());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const visibleConversations = useMemo(
    () =>
      conversations.filter(
        (c) => c.buyerId === identity.peerId || c.sellerId === identity.peerId
      ),
    [conversations, identity.peerId]
  );

  // Sync from BroadcastChannel / storage events across tabs
  useEffect(() => {
    const sync = () => {
      const latest = loadConversations();
      setConversations(latest);
      onConversationsUpdated(latest);
    };
    return subscribeToP2PUpdates(sync);
  }, [onConversationsUpdated]);

  // Open or create conversation when launched from a specific listing card
  useEffect(() => {
    if (!isOpen) return;
    if (targetListing) {
      const { conversation, all } = getOrCreateConversationForListing(targetListing, identity);
      setConversations(all);
      setSelectedId(conversation.id);
      onConversationsUpdated(all);
    } else if (!selectedId) {
      const all = loadConversations();
      setConversations(all);
      const mine = all.filter(
        (c) => c.buyerId === identity.peerId || c.sellerId === identity.peerId
      );
      if (mine.length > 0) {
        setSelectedId(mine[0].id);
      }
    }
  }, [isOpen, targetListing, identity, onConversationsUpdated]);

  const activeConversation = useMemo(
    () => visibleConversations.find((c) => c.id === selectedId) || null,
    [visibleConversations, selectedId]
  );

  // Mark messages read when viewing a conversation
  useEffect(() => {
    if (!isOpen || !activeConversation) return;
    const hasUnread = activeConversation.messages.some(
      (m) => m.senderId !== identity.peerId && !m.readByRecipient
    );
    if (hasUnread) {
      const updated = markConversationRead(activeConversation.id, identity.peerId);
      setConversations(updated);
      onConversationsUpdated(updated);
    }
  }, [isOpen, activeConversation, identity.peerId, onConversationsUpdated]);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isOpen, activeConversation?.messages.length]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isCurrentUserSeller = activeConversation
    ? activeConversation.sellerId === identity.peerId
    : false;

  const handleSend = (text?: string) => {
    if (!activeConversation) return;
    const content = (text ?? draft).trim();
    if (!content) return;

    const updated = appendDirectMessage(
      activeConversation.id,
      identity.peerId,
      identity.peerName,
      isCurrentUserSeller ? 'seller' : 'buyer',
      content
    );
    setConversations(updated);
    onConversationsUpdated(updated);
    if (text === undefined) {
      setDraft('');
    }
  };

  const handleSimulatePeerReply = () => {
    if (!activeConversation) return;
    const replyAsSeller = !isCurrentUserSeller;
    const peerId = replyAsSeller ? activeConversation.sellerId : activeConversation.buyerId;
    const peerName = replyAsSeller ? activeConversation.sellerName : activeConversation.buyerName;
    const sampleBody = replyAsSeller
      ? `Olá ${activeConversation.buyerName.split(' ')[0]}! Obrigado pelo contacto sobre "${activeConversation.listingTitle}" (${activeConversation.listingProvince}). Temos disponibilidade imediata — que quantidade precisa?`
      : `Obrigado pela resposta! Gostaria de confirmar o preço por volume e opções de entrega.`;

    const updated = appendDirectMessage(
      activeConversation.id,
      peerId,
      peerName,
      replyAsSeller ? 'seller' : 'buyer',
      sampleBody
    );
    setConversations(updated);
    onConversationsUpdated(updated);
  };

  const handleStartFromListing = (listing: Listing) => {
    const { conversation, all } = getOrCreateConversationForListing(listing, identity);
    setConversations(all);
    setSelectedId(conversation.id);
    onConversationsUpdated(all);
  };

  const sharpListings = availableListings.filter((l) => !l.isBlurred && `user-${l.userId}` !== identity.peerId);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Mensagens Diretas P2P"
    >
      <div className="flex h-[82vh] max-h-[680px] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-[#DCE5DE] bg-white shadow-2xl">
        {/* Top Modal Header */}
        <div className="flex items-center justify-between gap-4 border-b border-[#DCE5DE] bg-[#F7F9F7] px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="font-display text-base font-bold text-[#14532D] flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-[#15803D]" />
              Mensagens Diretas (Comprador ↔ Produtor)
            </h2>
            <p className="text-[11px] text-[#546459] truncate">
              Sessão ativa como <strong className="text-[#111814]">{identity.peerName}</strong> · Canal Peer-to-Peer local sincronizado entre separadores
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar mensagens diretas"
            className="rounded-lg p-1.5 text-[#546459] hover:bg-[#E8F0EA] hover:text-[#111814] transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Two-Pane Body */}
        <div className="grid flex-1 min-h-0 grid-cols-1 md:grid-cols-12">
          {/* Left Pane: Conversations List */}
          <aside className="md:col-span-4 border-b md:border-b-0 md:border-r border-[#DCE5DE] flex flex-col min-h-0 max-h-48 md:max-h-none bg-[#FAFBF9]">
            <div className="px-4 py-2.5 border-b border-[#EDF2EE] flex items-center justify-between">
              <span className="text-xs font-semibold text-[#445449]">
                Conversas ({visibleConversations.length})
              </span>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-[#EDF2EE]">
              {visibleConversations.length === 0 ? (
                <div className="p-4 text-xs text-[#546459] space-y-3">
                  <p>Ainda não iniciou nenhuma conversa direta.</p>
                  {sharpListings.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="font-semibold text-[#14532D]">Iniciar conversa sobre:</div>
                      {sharpListings.slice(0, 4).map((l) => (
                        <button
                          key={l.id}
                          type="button"
                          onClick={() => handleStartFromListing(l)}
                          className="w-full text-left rounded-lg border border-[#DCE5DE] bg-white px-3 py-2 hover:border-[#15803D] transition-colors"
                        >
                          <div className="font-semibold text-[#111814] truncate">{l.title}</div>
                          <div className="text-[11px] text-[#546459] truncate">
                            {l.sellerName} · {l.province}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                visibleConversations.map((conv) => {
                  const isSeller = conv.sellerId === identity.peerId;
                  const peerLabel = isSeller ? conv.buyerName : conv.sellerName;
                  const lastMsg = conv.messages[conv.messages.length - 1];
                  const unread = conv.messages.filter(
                    (m) => m.senderId !== identity.peerId && !m.readByRecipient
                  ).length;

                  return (
                    <button
                      key={conv.id}
                      type="button"
                      onClick={() => setSelectedId(conv.id)}
                      className={`w-full text-left px-4 py-3 transition-colors ${
                        selectedId === conv.id ? 'bg-[#EEF7F0]' : 'hover:bg-[#F2F7F3]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-[#111814] truncate">{peerLabel}</span>
                        {unread > 0 && (
                          <span className="font-mono-tabular text-[11px] font-bold text-[#14532D]">
                            {unread} nova{unread > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] font-medium text-[#15803D] truncate mt-0.5">
                        {conv.listingTitle} · {conv.listingProvince}
                      </div>
                      <div className="text-[11px] text-[#546459] truncate mt-1">
                        {lastMsg ? lastMsg.body : 'Sem mensagens ainda — escreva abaixo'}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          {/* Right Pane: Active Message Thread */}
          <div className="md:col-span-8 flex flex-col min-h-0 bg-white">
            {!activeConversation ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-sm text-[#546459]">
                <MessageCircle className="w-8 h-8 text-[#15803D] mb-2" />
                <p className="font-semibold text-[#111814]">Selecione ou inicie uma conversa</p>
                <p className="mt-1 text-xs max-w-sm">
                  Clique em «Mensagem» em qualquer produto ou serviço na vitrine pública para comunicar diretamente com o produtor.
                </p>
              </div>
            ) : (
              <>
                {/* Thread Header */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#EDF2EE] px-5 py-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {!isCurrentUserSeller && activeConversation.sellerPhoto ? (
                      <img
                        src={activeConversation.sellerPhoto}
                        alt={activeConversation.sellerName}
                        referrerPolicy="no-referrer"
                        className="h-8 w-8 rounded-full object-cover border border-[#DCE5DE] shrink-0"
                      />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#EEF7F0] text-[#14532D] shrink-0">
                        <UserRound className="w-4 h-4" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[#111814] truncate">
                        {isCurrentUserSeller
                          ? activeConversation.buyerName
                          : activeConversation.sellerName}
                      </div>
                      <div className="text-[11px] text-[#546459] truncate">
                        {activeConversation.listingTitle} · {activeConversation.listingCategory} ·{' '}
                        {activeConversation.listingProvince}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleSimulatePeerReply}
                    className="rounded-lg border border-[#EAB308] bg-[#FEFCE8] px-2.5 py-1 text-[11px] font-semibold text-[#713F12] hover:bg-[#FEF08A] transition-colors whitespace-nowrap shrink-0"
                  >
                    Simular resposta P2P
                  </button>
                </div>

                {/* Messages Stream */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 bg-[#FAFBF9]">
                  {activeConversation.messages.length === 0 ? (
                    <div className="space-y-3 py-6 text-center">
                      <p className="text-xs text-[#546459]">
                        Inicie a negociação direta sobre{' '}
                        <strong className="text-[#111814]">{activeConversation.listingTitle}</strong>.
                      </p>
                      <div className="flex flex-wrap justify-center gap-2">
                        {QUICK_PROMPTS.map((prompt) => (
                          <button
                            key={prompt}
                            type="button"
                            onClick={() => handleSend(prompt)}
                            className="rounded-lg border border-[#D4DDD6] bg-white px-3 py-1.5 text-xs text-[#14532D] hover:border-[#15803D] hover:bg-[#EEF7F0] transition-colors"
                          >
                            {prompt}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    activeConversation.messages.map((msg) => {
                      const isMine = msg.senderId === identity.peerId;
                      const timeLabel = new Date(msg.createdAt).toLocaleTimeString('pt-AO', {
                        hour: '2-digit',
                        minute: '2-digit',
                      });

                      return (
                        <div
                          key={msg.id}
                          className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                        >
                          <div
                            className={`max-w-[82%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
                              isMine
                                ? 'bg-[#14532D] text-white'
                                : 'border border-[#DCE5DE] bg-white text-[#111814]'
                            }`}
                          >
                            {!isMine && (
                              <div className="text-[10px] font-semibold text-[#15803D] mb-0.5">
                                {msg.senderName}
                              </div>
                            )}
                            <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                            <div
                              className={`mt-1 flex items-center justify-end gap-1 text-[10px] font-mono-tabular ${
                                isMine ? 'text-white/75' : 'text-[#7B8B80]'
                              }`}
                            >
                              <span>{timeLabel}</span>
                              {isMine &&
                                (msg.readByRecipient ? (
                                  <CheckCheck className="w-3 h-3 text-[#FACC15]" />
                                ) : (
                                  <Check className="w-3 h-3" />
                                ))}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Message Composer */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSend();
                  }}
                  className="flex items-center gap-2 border-t border-[#DCE5DE] bg-white px-4 py-3"
                >
                  <input
                    type="text"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Escreva a sua mensagem direta..."
                    aria-label="Escrever mensagem direta"
                    className="flex-1 rounded-lg border border-[#D4DDD6] bg-[#F7F9F7] px-3.5 py-2 text-xs text-[#111814] focus:border-[#15803D] focus:bg-white focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!draft.trim()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#14532D] px-4 py-2 text-xs font-semibold text-white hover:bg-[#15803D] disabled:opacity-45 transition-colors whitespace-nowrap shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Enviar
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
