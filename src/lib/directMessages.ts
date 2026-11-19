import type { Listing, User } from '../types';

export interface DirectMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderRole: 'buyer' | 'seller';
  body: string;
  createdAt: string;
  readByRecipient: boolean;
}

export interface DirectConversation {
  id: string;
  listingId: number;
  listingTitle: string;
  listingProvince: string;
  listingCategory: string;
  buyerId: string;
  buyerName: string;
  sellerId: string;
  sellerName: string;
  sellerPhoto?: string;
  updatedAt: string;
  messages: DirectMessage[];
}

const STORAGE_KEY = 'nzila_p2p_direct_messages_v1';
const GUEST_ID_KEY = 'nzila_p2p_guest_identity_v1';
const CHANNEL_NAME = 'nzila_agro_p2p_direct_messages';

export interface PeerIdentity {
  peerId: string;
  peerName: string;
  isGuest: boolean;
}

export function resolvePeerIdentity(currentUser: User | null): PeerIdentity {
  if (currentUser) {
    return {
      peerId: `user-${currentUser.id}`,
      peerName: currentUser.name,
      isGuest: false,
    };
  }

  try {
    const saved = localStorage.getItem(GUEST_ID_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as PeerIdentity;
      if (parsed?.peerId && parsed?.peerName) return parsed;
    }
  } catch {
    // Ignore malformed guest identity
  }

  const created: PeerIdentity = {
    peerId: `guest-${Math.random().toString(36).slice(2, 9)}`,
    peerName: 'Comprador Visitante',
    isGuest: true,
  };
  try {
    localStorage.setItem(GUEST_ID_KEY, JSON.stringify(created));
  } catch {
    // Ignore storage errors
  }
  return created;
}

export function loadConversations(): DirectConversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as DirectConversation[]) : [];
  } catch {
    return [];
  }
}

function broadcastUpdate(): void {
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const ch = new BroadcastChannel(CHANNEL_NAME);
      ch.postMessage({ type: 'SYNC', timestamp: Date.now() });
      ch.close();
    }
  } catch {
    // Ignore BroadcastChannel unavailability
  }
}

export function saveConversations(conversations: DirectConversation[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  } catch {
    // Ignore storage quota errors
  }
  broadcastUpdate();
}

export function subscribeToP2PUpdates(onChange: () => void): () => void {
  let channel: BroadcastChannel | null = null;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = () => onChange();
    }
  } catch {
    channel = null;
  }

  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      onChange();
    }
  };
  window.addEventListener('storage', onStorage);

  return () => {
    window.removeEventListener('storage', onStorage);
    if (channel) {
      channel.close();
    }
  };
}

export function getOrCreateConversationForListing(
  listing: Listing,
  identity: PeerIdentity
): { conversation: DirectConversation; all: DirectConversation[] } {
  const sellerId = `user-${listing.userId}`;
  const sellerName = listing.sellerName || 'Produtor Nzila Agro';
  const convId = `conv-listing-${listing.id}-buyer-${identity.peerId}`;
  const all = loadConversations();

  const existing = all.find((c) => c.id === convId);
  if (existing) {
    return { conversation: existing, all };
  }

  const created: DirectConversation = {
    id: convId,
    listingId: listing.id,
    listingTitle: listing.title,
    listingProvince: listing.province,
    listingCategory: listing.category,
    buyerId: identity.peerId,
    buyerName: identity.peerName,
    sellerId,
    sellerName,
    sellerPhoto: listing.sellerPhoto,
    updatedAt: new Date().toISOString(),
    messages: [],
  };

  const next = [created, ...all];
  saveConversations(next);
  return { conversation: created, all: next };
}

export function appendDirectMessage(
  conversationId: string,
  senderId: string,
  senderName: string,
  senderRole: 'buyer' | 'seller',
  body: string
): DirectConversation[] {
  const trimmed = body.trim();
  if (!trimmed) return loadConversations();

  const all = loadConversations();
  const now = new Date().toISOString();
  const message: DirectMessage = {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    conversationId,
    senderId,
    senderName,
    senderRole,
    body: trimmed,
    createdAt: now,
    readByRecipient: false,
  };

  const next = all
    .map((conv) =>
      conv.id === conversationId
        ? { ...conv, updatedAt: now, messages: [...conv.messages, message] }
        : conv
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  saveConversations(next);
  return next;
}

export function markConversationRead(conversationId: string, readerPeerId: string): DirectConversation[] {
  const all = loadConversations();
  let changed = false;

  const next = all.map((conv) => {
    if (conv.id !== conversationId) return conv;
    const updatedMsgs = conv.messages.map((m) => {
      if (m.senderId !== readerPeerId && !m.readByRecipient) {
        changed = true;
        return { ...m, readByRecipient: true };
      }
      return m;
    });
    return changed ? { ...conv, messages: updatedMsgs } : conv;
  });

  if (changed) {
    saveConversations(next);
  }
  return next;
}

export function getUnreadCountForPeer(conversations: DirectConversation[], peerId: string): number {
  let count = 0;
  for (const conv of conversations) {
    if (conv.buyerId !== peerId && conv.sellerId !== peerId) continue;
    for (const msg of conv.messages) {
      if (msg.senderId !== peerId && !msg.readByRecipient) {
        count += 1;
      }
    }
  }
  return count;
}
