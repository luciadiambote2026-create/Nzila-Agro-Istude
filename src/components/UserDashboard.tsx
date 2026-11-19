import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  Calculator,
  Calendar,
  Clock,
  Compass,
  CreditCard,
  GraduationCap,
  MessageSquare,
  Mic,
  PackagePlus,
  Printer,
  QrCode,
  Send,
  ShieldAlert,
  Sparkles,
  Sprout,
  Trash2,
  Upload,
  UserCog,
} from 'lucide-react';
import sampleAgronomyImg from '../assets/images/sample_agronomy_field_1794631512757.jpg';
import sampleCassavaImg from '../assets/images/sample_cassava_basket_1794631511573.jpg';
import sampleCoffeeImg from '../assets/images/sample_angola_coffee_1794631510894.jpg';
import {
  ANGOLA_PROVINCES,
  apiRequest,
  compressImageFileToDataUrl,
  formatActiveDuration,
  formatCurrency,
} from '../lib/api';
import { generateAllProductLabelsPdf, generateProductLabelPdf } from '../lib/productLabelPdf';
import type { Listing, ListingCategory, SupportMessage, User } from '../types';
import { CropCalendarPanel } from './CropCalendarPanel';
import { InputsCalculatorPanel } from './InputsCalculatorPanel';
import { MonthlyAccountingReportPanel } from './MonthlyAccountingReportPanel';
import { PasswordInput } from './PasswordInput';
import { PriceSuggestionWidget } from './PriceSuggestionWidget';
import { ProductPhotoEnhancer } from './ProductPhotoEnhancer';
import { ScheduledEventsPanel } from './ScheduledEventsPanel';
import { SubscriptionPaymentsPanel } from './SubscriptionPaymentsPanel';
import { UserAnalyticsPanel } from './UserAnalyticsPanel';
import { VoiceMemoPanel } from './VoiceMemoPanel';

interface UserDashboardProps {
  user: User;
  onUserUpdated: (user: User) => void;
  onListingChanged: () => void;
  onReplayTour?: () => void;
}

export const UserDashboard: React.FC<UserDashboardProps> = ({
  user,
  onUserUpdated,
  onListingChanged,
  onReplayTour,
}) => {
  const [activeTab, setActiveTab] = useState<
    'listings' | 'plans' | 'analytics' | 'calculator' | 'crop-calendar' | 'voice-memos' | 'events' | 'profile' | 'support'
  >('listings');
  const [myListings, setMyListings] = useState<Listing[]>([]);
  const [supportMessages, setSupportMessages] = useState<SupportMessage[]>([]);
  const [localActiveSeconds, setLocalActiveSeconds] = useState<number>(user.activeSeconds);

  // Submission state ("Produto Agrícola" or "Consultoria/Formação")
  const [submitCategory, setSubmitCategory] = useState<ListingCategory | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priceKz, setPriceKz] = useState('');
  const [unit, setUnit] = useState('');
  const [province, setProvince] = useState(user.province);
  const [imageUrl, setImageUrl] = useState('');
  const [submittingListing, setSubmittingListing] = useState(false);

  // Profile & password state
  const [editName, setEditName] = useState(user.name);
  const [editProvince, setEditProvince] = useState(user.province);
  const [editProfession, setEditProfession] = useState(user.profession);
  const [editPhone, setEditPhone] = useState(user.phone);
  const [editWhatsapp, setEditWhatsapp] = useState(user.whatsapp);
  const [editPhoto, setEditPhoto] = useState(user.profilePhoto);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  // Support state
  const [supportSubject, setSupportSubject] = useState('');
  const [supportBody, setSupportBody] = useState('');

  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [generatingLabelId, setGeneratingLabelId] = useState<number | null>(null);
  const [generatingAllLabels, setGeneratingAllLabels] = useState(false);

  const loadData = async () => {
    try {
      const [listingsRes, supportRes] = await Promise.all([
        apiRequest<{ listings: Listing[] }>('/api/users/my-listings'),
        apiRequest<{ messages: SupportMessage[] }>('/api/users/support'),
      ]);
      setMyListings(listingsRes.listings);
      setSupportMessages(supportRes.messages);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    setLocalActiveSeconds(user.activeSeconds);
  }, [user.activeSeconds]);

  // Background active usage time counter + server heartbeat every 20 seconds
  useEffect(() => {
    const tickInterval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        setLocalActiveSeconds((prev) => prev + 1);
      }
    }, 1000);

    const syncInterval = window.setInterval(async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const res = await apiRequest<{ activeSeconds: number }>('/api/users/heartbeat', {
          method: 'POST',
          body: JSON.stringify({ seconds: 20 }),
        });
        setLocalActiveSeconds(res.activeSeconds);
      } catch {
        // Ignore transient heartbeat errors
      }
    }, 20000);

    return () => {
      window.clearInterval(tickInterval);
      window.clearInterval(syncInterval);
    };
  }, []);

  const openSubmissionForm = (category: ListingCategory) => {
    setSubmitCategory(category);
    setUnit(category === 'Produto Agrícola' ? 'Saco 50kg' : 'Sessão / Consultoria');
    setImageUrl('');
    setFeedback(null);
  };

  const handleListingImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageFileToDataUrl(file, 960, 0.85);
      setImageUrl(compressed);
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erro ao processar foto.' });
    }
  };

  const handleCreateListing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!submitCategory) return;
    setFeedback(null);
    setSubmittingListing(true);

    try {
      await apiRequest('/api/users/listings', {
        method: 'POST',
        body: JSON.stringify({
          category: submitCategory,
          title,
          description,
          priceKz: Number(priceKz),
          unit,
          province,
          imageUrl,
        }),
      });
      setTitle('');
      setDescription('');
      setPriceKz('');
      setImageUrl('');
      setSubmitCategory(null);
      setFeedback({ type: 'ok', text: 'Publicação enviada com sucesso!' });
      await loadData();
      onListingChanged();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erro ao publicar.' });
    } finally {
      setSubmittingListing(false);
    }
  };

  const handleDeleteListing = async (id: number) => {
    try {
      await apiRequest(`/api/users/listings/${id}`, { method: 'DELETE' });
      await loadData();
      onListingChanged();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erro ao remover.' });
    }
  };

  const handleDownloadProductQrPdf = async (item: Listing) => {
    setFeedback(null);
    setGeneratingLabelId(item.id);
    try {
      const filename = await generateProductLabelPdf(item, user);
      setFeedback({
        type: 'ok',
        text: `Etiqueta PDF com QR Code "${filename}" gerada (4 etiquetas prontas para impressão A4).`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao gerar etiqueta PDF com QR Code.',
      });
    } finally {
      setGeneratingLabelId(null);
    }
  };

  const handleDownloadAllLabelsPdf = async () => {
    if (myListings.length === 0) return;
    setFeedback(null);
    setGeneratingAllLabels(true);
    try {
      const filename = await generateAllProductLabelsPdf(myListings, user);
      setFeedback({
        type: 'ok',
        text: `Folha de etiquetas "${filename}" gerada com QR Code para todas as ${myListings.length} listagens.`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao gerar PDF de etiquetas.',
      });
    } finally {
      setGeneratingAllLabels(false);
    }
  };

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      const res = await apiRequest<{ user: User }>('/api/users/profile', {
        method: 'PUT',
        body: JSON.stringify({
          name: editName,
          province: editProvince,
          profession: editProfession,
          phone: editPhone,
          whatsapp: editWhatsapp,
          profilePhoto: editPhoto,
        }),
      });
      onUserUpdated(res.user);
      setFeedback({ type: 'ok', text: 'Dados pessoais e telefone atualizados com sucesso.' });
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erro ao atualizar dados.' });
    }
  };

  const handlePasswordSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      const res = await apiRequest<{ message: string }>('/api/users/password', {
        method: 'PUT',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword('');
      setNewPassword('');
      setFeedback({ type: 'ok', text: res.message });
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erro ao alterar palavra-passe.' });
    }
  };

  const handleProfilePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageFileToDataUrl(file, 640, 0.85);
      setEditPhoto(compressed);
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erro ao carregar foto.' });
    }
  };

  const handleSupportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      await apiRequest('/api/users/support', {
        method: 'POST',
        body: JSON.stringify({ subject: supportSubject, message: supportBody }),
      });
      setSupportSubject('');
      setSupportBody('');
      setFeedback({ type: 'ok', text: 'Mensagem enviada para a Caixa de Suporte Administrativa.' });
      await loadData();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erro ao enviar suporte.' });
    }
  };

  const isVisibleClear = user.status === 'Ativo' && user.quotaActive;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* LEFT PROFILE SIDEBAR (Foto de perfil à esquerda + tempo de uso ativo) */}
        <aside data-tour="user-profile-card" className="lg:col-span-4 rounded-xl border border-[#DCE5DE] bg-white p-6 space-y-6">
          <div className="flex items-start gap-4">
            <img
              src={user.profilePhoto}
              alt={user.name}
              referrerPolicy="no-referrer"
              className="h-20 w-20 rounded-xl object-cover border border-[#DCE5DE] shrink-0"
            />
            <div className="min-w-0">
              <h2 className="font-display text-lg font-bold text-[#111814] truncate">{user.name}</h2>
              <p className="text-xs text-[#546459] mt-0.5">{user.profession} · {user.province}</p>
              <p className="text-xs font-semibold text-[#14532D] mt-1">
                {user.role === 'ADMIN_PRINCIPAL'
                  ? 'Administrador Principal'
                  : user.role === 'ADMIN_AUXILIAR'
                  ? 'Administrador Auxiliar'
                  : 'Utilizador Comum'}
              </p>
            </div>
          </div>

          <div className="space-y-3 border-t border-[#EDF2EE] pt-4 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[#546459]">Estado da Conta:</span>
              <span
                className={`font-semibold ${
                  user.status === 'Ativo'
                    ? 'text-[#15803D]'
                    : user.status === 'Pendente'
                    ? 'text-[#B45309]'
                    : 'text-red-700'
                }`}
              >
                {user.status}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[#546459]">Estado da Cota:</span>
              <span className={`font-semibold ${user.quotaActive ? 'text-[#15803D]' : 'text-red-700'}`}>
                {user.quotaActive ? 'Ativa' : 'Inativa'}
              </span>
            </div>

            {user.quotaExpiresAt && (
              <div className="flex items-center justify-between">
                <span className="text-[#546459]">Validade da Cota:</span>
                <span className="font-mono-tabular text-[#111814]">
                  {new Date(user.quotaExpiresAt).toLocaleDateString('pt-AO')}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="text-[#546459]">Bónus Atribuídos:</span>
              <span className="font-mono-tabular font-bold text-[#14532D]">
                {formatCurrency(user.bonusKz, 'AOA')}
              </span>
            </div>

            <div className="flex items-center justify-between rounded-lg bg-[#F2F7F3] px-3 py-2.5 border border-[#DCE5DE]">
              <span className="inline-flex items-center gap-1.5 font-medium text-[#14532D]">
                <Clock className="w-3.5 h-3.5" />
                Uso Ativo Registado:
              </span>
              <span className="font-mono-tabular font-bold text-[#111814]">
                {formatActiveDuration(localActiveSeconds)}
              </span>
            </div>
          </div>

          {!isVisibleClear && (
            <div className="rounded-lg border border-[#EAB308]/60 bg-[#FEFCE8] p-3.5 text-xs text-[#713F12] flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 text-[#CA8A04] shrink-0 mt-0.5" />
              <div>
                As suas publicações ficam <strong>desfocadas/ocultas</strong> na vitrine pública enquanto o estado da
                conta for <strong>{user.status}</strong> ou a cota estiver <strong>{user.quotaActive ? 'Ativa' : 'Inativa'}</strong>.
              </div>
            </div>
          )}

          {/* Panel Navigation */}
          <div className="space-y-1.5 border-t border-[#EDF2EE] pt-4">
            <button
              type="button"
              onClick={() => setActiveTab('listings')}
              className={`w-full flex items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-xs font-semibold transition-colors ${
                activeTab === 'listings' ? 'bg-[#14532D] text-white' : 'text-[#1C2720] hover:bg-[#F2F7F3]'
              }`}
            >
              <PackagePlus className="w-4 h-4" />
              Submissões e Publicações ({myListings.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('plans')}
              className={`w-full flex items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-xs font-semibold transition-colors ${
                activeTab === 'plans' ? 'bg-[#14532D] text-white' : 'text-[#1C2720] hover:bg-[#F2F7F3]'
              }`}
            >
              <CreditCard className="w-4 h-4" />
              Planos, Destaques & Multicaixa
            </button>
            <button
              type="button"
              data-tour="user-analytics-tab"
              onClick={() => setActiveTab('analytics')}
              className={`w-full flex items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-xs font-semibold transition-colors ${
                activeTab === 'analytics' ? 'bg-[#14532D] text-white' : 'text-[#1C2720] hover:bg-[#F2F7F3]'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              Desempenho e Gráficos
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('calculator')}
              className={`w-full flex items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-xs font-semibold transition-colors ${
                activeTab === 'calculator' ? 'bg-[#14532D] text-white' : 'text-[#1C2720] hover:bg-[#F2F7F3]'
              }`}
            >
              <Calculator className="w-4 h-4" />
              Calculadora de Insumos
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('crop-calendar')}
              className={`w-full flex items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-xs font-semibold transition-colors ${
                activeTab === 'crop-calendar' ? 'bg-[#14532D] text-white' : 'text-[#1C2720] hover:bg-[#F2F7F3]'
              }`}
            >
              <Sprout className="w-4 h-4" />
              Calendário de Cultivo
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('voice-memos')}
              className={`w-full flex items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-xs font-semibold transition-colors ${
                activeTab === 'voice-memos' ? 'bg-[#14532D] text-white' : 'text-[#1C2720] hover:bg-[#F2F7F3]'
              }`}
            >
              <Mic className="w-4 h-4" />
              Notas de Voz (Campo)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('events')}
              className={`w-full flex items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-xs font-semibold transition-colors ${
                activeTab === 'events' ? 'bg-[#14532D] text-white' : 'text-[#1C2720] hover:bg-[#F2F7F3]'
              }`}
            >
              <Calendar className="w-4 h-4" />
              Agenda & Eventos (.ics)
            </button>
            <button
              type="button"
              data-tour="user-profile-tab"
              onClick={() => setActiveTab('profile')}
              className={`w-full flex items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-xs font-semibold transition-colors ${
                activeTab === 'profile' ? 'bg-[#14532D] text-white' : 'text-[#1C2720] hover:bg-[#F2F7F3]'
              }`}
            >
              <UserCog className="w-4 h-4" />
              Dados Pessoais e Palavra-passe
            </button>
            <button
              type="button"
              data-tour="user-support-tab"
              onClick={() => setActiveTab('support')}
              className={`w-full flex items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-xs font-semibold transition-colors ${
                activeTab === 'support' ? 'bg-[#14532D] text-white' : 'text-[#1C2720] hover:bg-[#F2F7F3]'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              Caixa de Suporte ({supportMessages.length})
            </button>
            {onReplayTour && (
              <button
                type="button"
                onClick={onReplayTour}
                className="w-full flex items-center gap-2.5 rounded-lg border border-[#DCE5DE] bg-[#F7F9F7] px-3.5 py-2.5 text-xs font-semibold text-[#14532D] hover:bg-[#EEF7F0] transition-colors mt-2"
              >
                <Compass className="w-4 h-4 text-[#CA8A04]" />
                Tour da Plataforma
              </button>
            )}
          </div>
        </aside>

        {/* MAIN CONTENT AREA */}
        <div className="lg:col-span-8 space-y-6">
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

          {activeTab === 'listings' && (
            <div className="space-y-6">
              {/* MANDATORY SUBMISSION BUTTONS */}
              <div className="rounded-xl border border-[#DCE5DE] bg-white p-6">
                <h1 className="font-display text-xl font-bold text-[#111814]">
                  Nova Submissão na Plataforma
                </h1>
                <p className="mt-1 text-xs text-[#546459]">
                  Escolha o tipo de oferta agrícola que pretende disponibilizar em Angola.
                </p>

                <div data-tour="user-submission-actions" className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <button
                    type="button"
                    onClick={() => openSubmissionForm('Produto Agrícola')}
                    className={`flex items-center justify-center gap-2.5 rounded-xl border px-5 py-4 text-sm font-bold transition-colors ${
                      submitCategory === 'Produto Agrícola'
                        ? 'border-[#14532D] bg-[#14532D] text-white'
                        : 'border-[#15803D] bg-[#F2F7F3] text-[#14532D] hover:bg-[#E4EFE6]'
                    }`}
                  >
                    <PackagePlus className="w-5 h-5" />
                    Produto Agrícola
                  </button>

                  <button
                    type="button"
                    onClick={() => openSubmissionForm('Consultoria/Formação')}
                    className={`flex items-center justify-center gap-2.5 rounded-xl border px-5 py-4 text-sm font-bold transition-colors ${
                      submitCategory === 'Consultoria/Formação'
                        ? 'border-[#EAB308] bg-[#EAB308] text-[#111814]'
                        : 'border-[#EAB308] bg-[#FEFCE8] text-[#713F12] hover:bg-[#FEF08A]'
                    }`}
                  >
                    <GraduationCap className="w-5 h-5" />
                    Consultoria/Formação
                  </button>
                </div>

                {submitCategory && (
                  <form onSubmit={handleCreateListing} className="mt-6 space-y-4 border-t border-[#EDF2EE] pt-6">
                    <div className="flex items-center justify-between">
                      <h3 className="font-display text-base font-bold text-[#111814]">
                        Publicar {submitCategory}
                      </h3>
                      <button
                        type="button"
                        onClick={() => setSubmitCategory(null)}
                        className="text-xs font-medium text-[#546459] hover:text-[#111814]"
                      >
                        Cancelar
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-[#1C2720] mb-1">Título *</label>
                        <input
                          type="text"
                          required
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          placeholder={
                            submitCategory === 'Produto Agrícola'
                              ? 'Ex: Mandioca Fresca do Uíge'
                              : 'Ex: Formação em Irrigação por Gotejamento'
                          }
                          className="w-full rounded-lg border border-[#D4DDD6] px-3.5 py-2.5 text-sm focus:border-[#15803D] focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-[#1C2720] mb-1">Preço em Kwanzas (Kz) *</label>
                        <input
                          type="number"
                          min="1"
                          required
                          value={priceKz}
                          onChange={(e) => setPriceKz(e.target.value)}
                          placeholder="15000"
                          className="w-full rounded-lg border border-[#D4DDD6] px-3.5 py-2.5 text-sm font-mono-tabular focus:border-[#15803D] focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-[#1C2720] mb-1">Unidade / Modalidade *</label>
                        <input
                          type="text"
                          required
                          value={unit}
                          onChange={(e) => setUnit(e.target.value)}
                          placeholder="Saco 50kg / Sessão"
                          className="w-full rounded-lg border border-[#D4DDD6] px-3.5 py-2.5 text-sm focus:border-[#15803D] focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-[#1C2720] mb-1">Província *</label>
                        <select
                          value={province}
                          onChange={(e) => setProvince(e.target.value)}
                          className="w-full rounded-lg border border-[#D4DDD6] bg-white px-3.5 py-2.5 text-sm focus:border-[#15803D] focus:outline-none"
                        >
                          {ANGOLA_PROVINCES.map((prov) => (
                            <option key={prov} value={prov}>
                              {prov}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-[#1C2720] mb-1">Fotografia *</label>
                        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-[#D4DDD6] bg-[#F7F9F7] px-3.5 py-2.5 text-xs font-semibold text-[#1C2720] hover:bg-[#EEF3EF]">
                          <Upload className="w-4 h-4 text-[#15803D]" />
                          {imageUrl ? 'Fotografia Carregada' : 'Carregar Fotografia'}
                          <input type="file" accept="image/*" onChange={handleListingImageUpload} className="hidden" />
                        </label>
                      </div>

                      <PriceSuggestionWidget
                        category={submitCategory}
                        province={province}
                        title={title}
                        unit={unit}
                        onApplyPrice={(suggestedKz) => setPriceKz(String(suggestedKz))}
                      />

                      {/* Quick reference image presets or uploaded preview */}
                      <div className="sm:col-span-2">
                        <span className="block text-[11px] text-[#546459] mb-1.5">
                          Ou escolha uma fotografia ilustrativa verificada caso esteja sem imagem no momento:
                        </span>
                        <div className="flex flex-wrap items-center gap-2">
                          {[
                            { label: 'Mandioca & Batata', src: sampleCassavaImg },
                            { label: 'Café de Angola', src: sampleCoffeeImg },
                            { label: 'Consultoria de Campo', src: sampleAgronomyImg },
                          ].map((sample) => (
                            <button
                              key={sample.label}
                              type="button"
                              onClick={() => setImageUrl(sample.src)}
                              className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                                imageUrl === sample.src
                                  ? 'border-[#14532D] bg-[#EEF7F0] text-[#14532D] font-semibold'
                                  : 'border-[#D4DDD6] text-[#546459] hover:text-[#111814]'
                              }`}
                            >
                              {sample.label}
                            </button>
                          ))}
                        </div>
                        {imageUrl && (
                          <ProductPhotoEnhancer
                            sourceImageUrl={imageUrl}
                            onApplyEnhancedImage={(enhancedDataUrl) => setImageUrl(enhancedDataUrl)}
                          />
                        )}
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-[#1C2720] mb-1">Descrição Detalhada *</label>
                        <textarea
                          rows={3}
                          required
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          placeholder="Qualidade, disponibilidade, entrega ou conteúdo programático..."
                          className="w-full rounded-lg border border-[#D4DDD6] px-3.5 py-2.5 text-sm focus:border-[#15803D] focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={submittingListing || !imageUrl}
                        className="rounded-lg bg-[#14532D] px-6 py-2.5 text-xs font-bold text-white hover:bg-[#15803D] disabled:opacity-50"
                      >
                        {submittingListing ? 'A publicar...' : `Confirmar Submissão (${submitCategory})`}
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* MY LISTINGS */}
              <div className="rounded-xl border border-[#DCE5DE] bg-white p-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                  <div>
                    <h2 className="font-display text-lg font-bold text-[#111814]">
                      Meus Produtos e Publicações
                    </h2>
                    <p className="text-xs text-[#546459] mt-0.5">
                      Gere etiquetas em PDF com QR Code para colar em sacos, caixas ou embalagens físicas.
                    </p>
                  </div>
                  {myListings.length > 0 && (
                    <button
                      type="button"
                      disabled={generatingAllLabels}
                      onClick={handleDownloadAllLabelsPdf}
                      className="inline-flex items-center gap-2 rounded-lg bg-[#14532D] px-3.5 py-2 text-xs font-bold text-white hover:bg-[#15803D] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      {generatingAllLabels ? 'A gerar PDF...' : `Imprimir Todas Etiquetas PDF (${myListings.length})`}
                    </button>
                  )}
                </div>

                {myListings.length === 0 ? (
                  <p className="text-sm text-[#546459]">
                    Ainda não submeteu nenhum produto agrícola ou serviço de consultoria/formação.
                  </p>
                ) : (
                  <div className="divide-y divide-[#EDF2EE]">
                    {myListings.map((item) => (
                      <div key={item.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-4 min-w-0">
                          <img
                            src={item.imageUrl}
                            alt={item.title}
                            referrerPolicy="no-referrer"
                            className="h-16 w-20 rounded-lg object-cover border border-[#DCE5DE] shrink-0"
                          />
                          <div className="min-w-0">
                            <div className="text-xs text-[#546459]">
                              {item.category} · {item.province} ·{' '}
                              <span className={isVisibleClear ? 'text-[#15803D] font-semibold' : 'text-[#B45309] font-semibold'}>
                                {isVisibleClear ? 'Nítido na Vitrine' : 'Desfocado na Vitrine'}
                              </span>
                            </div>
                            <h3 className="font-display text-sm font-bold text-[#111814] truncate flex items-center gap-2">
                              <span className="truncate">{item.title}</span>
                              {item.isFeatured && (
                                <span className="shrink-0 rounded bg-[#FEFCE8] border border-[#CA8A04]/40 px-1.5 py-0.5 text-[10px] font-bold text-[#854D0E]">
                                  Em Destaque
                                </span>
                              )}
                            </h3>
                            <div className="text-xs font-mono-tabular font-semibold text-[#14532D]">
                              {formatCurrency(item.priceKz, 'AOA')} / {item.unit}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 shrink-0 self-start sm:self-center">
                          {!item.isFeatured && (
                            <button
                              type="button"
                              onClick={() => setActiveTab('plans')}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-[#CA8A04]/40 bg-[#FEFCE8] px-3 py-1.5 text-xs font-semibold text-[#854D0E] hover:bg-[#FEF9C3] transition-colors whitespace-nowrap"
                            >
                              <Sparkles className="w-3.5 h-3.5 text-[#CA8A04]" />
                              Destacar
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={generatingLabelId === item.id}
                            onClick={() => handleDownloadProductQrPdf(item)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-[#14532D]/30 bg-[#F2F7F3] px-3 py-1.5 text-xs font-semibold text-[#14532D] hover:bg-[#E2EFE5] disabled:opacity-50 transition-colors whitespace-nowrap"
                          >
                            <QrCode className="w-3.5 h-3.5" />
                            {generatingLabelId === item.id ? 'A gerar...' : 'Etiqueta PDF (QR)'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteListing(item.id)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Eliminar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'plans' && (
            <SubscriptionPaymentsPanel
              user={user}
              listings={myListings}
              onUserUpdated={onUserUpdated}
              onListingChanged={() => {
                loadData();
                onListingChanged();
              }}
            />
          )}

          {activeTab === 'analytics' && (
            <div className="space-y-6">
              <MonthlyAccountingReportPanel />
              <UserAnalyticsPanel listings={myListings} />
            </div>
          )}

          {activeTab === 'profile' && (
            <div className="space-y-6">
              <form onSubmit={handleProfileSave} className="rounded-xl border border-[#DCE5DE] bg-white p-6 space-y-4">
                <h2 className="font-display text-lg font-bold text-[#111814]">
                  Atualizar Dados Pessoais e Telefone
                </h2>

                <div className="flex items-center gap-4">
                  <img
                    src={editPhoto}
                    alt={editName}
                    className="h-16 w-16 rounded-xl object-cover border border-[#DCE5DE]"
                  />
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[#D4DDD6] px-3.5 py-2 text-xs font-semibold text-[#1C2720] hover:bg-[#F7F9F7]">
                    <Upload className="w-4 h-4 text-[#15803D]" />
                    Alterar Foto de Perfil
                    <input type="file" accept="image/*" onChange={handleProfilePhotoUpload} className="hidden" />
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-[#1C2720] mb-1">Nome Completo</label>
                    <input
                      type="text"
                      required
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full rounded-lg border border-[#D4DDD6] px-3.5 py-2.5 text-sm focus:border-[#15803D] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#1C2720] mb-1">Província</label>
                    <select
                      value={editProvince}
                      onChange={(e) => setEditProvince(e.target.value)}
                      className="w-full rounded-lg border border-[#D4DDD6] bg-white px-3.5 py-2.5 text-sm focus:border-[#15803D] focus:outline-none"
                    >
                      {ANGOLA_PROVINCES.map((prov) => (
                        <option key={prov} value={prov}>
                          {prov}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#1C2720] mb-1">Profissão</label>
                    <input
                      type="text"
                      required
                      value={editProfession}
                      onChange={(e) => setEditProfession(e.target.value)}
                      className="w-full rounded-lg border border-[#D4DDD6] px-3.5 py-2.5 text-sm focus:border-[#15803D] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#1C2720] mb-1">Número de Telefone *</label>
                    <input
                      type="tel"
                      required
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      className="w-full rounded-lg border border-[#D4DDD6] px-3.5 py-2.5 text-sm font-mono-tabular focus:border-[#15803D] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#1C2720] mb-1">WhatsApp</label>
                    <input
                      type="tel"
                      required
                      value={editWhatsapp}
                      onChange={(e) => setEditWhatsapp(e.target.value)}
                      className="w-full rounded-lg border border-[#D4DDD6] px-3.5 py-2.5 text-sm font-mono-tabular focus:border-[#15803D] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="rounded-lg bg-[#14532D] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#15803D]"
                  >
                    Guardar Dados Pessoais
                  </button>
                </div>
              </form>

              <form onSubmit={handlePasswordSave} className="rounded-xl border border-[#DCE5DE] bg-white p-6 space-y-4">
                <h2 className="font-display text-lg font-bold text-[#111814]">
                  Alterar Palavra-passe
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <PasswordInput
                    id="user-current-pass"
                    label="Palavra-passe Atual"
                    value={currentPassword}
                    onChange={setCurrentPassword}
                    required
                  />
                  <PasswordInput
                    id="user-new-pass"
                    label="Nova Palavra-passe (mín. 6 caracteres)"
                    value={newPassword}
                    onChange={setNewPassword}
                    required
                    minLength={6}
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="rounded-lg bg-[#EAB308] px-5 py-2.5 text-xs font-bold text-[#111814] hover:bg-[#CA8A04] hover:text-white transition-colors"
                  >
                    Atualizar Palavra-passe
                  </button>
                </div>
              </form>
            </div>
          )}

          {activeTab === 'support' && (
            <div className="space-y-6">
              <form onSubmit={handleSupportSubmit} className="rounded-xl border border-[#DCE5DE] bg-white p-6 space-y-4">
                <h2 className="font-display text-lg font-bold text-[#111814]">Caixa de Suporte</h2>
                <p className="text-xs text-[#546459]">
                  Contacte diretamente a equipa administrativa para validação de cota, dúvidas ou suporte técnico.
                </p>
                <div>
                  <label className="block text-xs font-medium text-[#1C2720] mb-1">Assunto *</label>
                  <input
                    type="text"
                    required
                    value={supportSubject}
                    onChange={(e) => setSupportSubject(e.target.value)}
                    placeholder="Ex: Comprovativo de pagamento de cota"
                    className="w-full rounded-lg border border-[#D4DDD6] px-3.5 py-2.5 text-sm focus:border-[#15803D] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#1C2720] mb-1">Mensagem *</label>
                  <textarea
                    rows={3}
                    required
                    value={supportBody}
                    onChange={(e) => setSupportBody(e.target.value)}
                    placeholder="Descreva a sua solicitação..."
                    className="w-full rounded-lg border border-[#D4DDD6] px-3.5 py-2.5 text-sm focus:border-[#15803D] focus:outline-none"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#14532D] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#15803D]"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Enviar para Suporte
                  </button>
                </div>
              </form>

              <div className="rounded-xl border border-[#DCE5DE] bg-white p-6 space-y-4">
                <h3 className="font-display text-base font-bold text-[#111814]">Histórico de Suporte</h3>
                {supportMessages.length === 0 ? (
                  <p className="text-sm text-[#546459]">Sem mensagens enviadas até ao momento.</p>
                ) : (
                  <div className="space-y-4">
                    {supportMessages.map((msg) => (
                      <div key={msg.id} className="rounded-lg border border-[#E5ECE6] bg-[#F7F9F7] p-4 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-[#111814]">{msg.subject}</span>
                          <span className={msg.status === 'Respondido' ? 'text-[#15803D] font-semibold' : 'text-[#B45309] font-semibold'}>
                            {msg.status}
                          </span>
                        </div>
                        <p className="text-sm text-[#1C2720]">{msg.message}</p>
                        {msg.adminReply && (
                          <div className="mt-2 rounded-lg border border-[#DCE5DE] bg-white p-3 text-xs text-[#14532D]">
                            <strong>Resposta Administrativa ({msg.repliedBy}):</strong> {msg.adminReply}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: CALCULADORA DE INSUMOS */}
          {activeTab === 'calculator' && <InputsCalculatorPanel user={user} />}

          {/* TAB: CALENDÁRIO DE CULTIVO (ANGOLA) */}
          {activeTab === 'crop-calendar' && <CropCalendarPanel user={user} />}

          {/* TAB: NOTAS DE VOZ (DIÁRIO DE CAMPO) */}
          {activeTab === 'voice-memos' && <VoiceMemoPanel user={user} />}

          {/* TAB: AGENDA & EVENTOS (.ICS) */}
          {activeTab === 'events' && <ScheduledEventsPanel user={user} />}
        </div>
      </div>
    </div>
  );
};
