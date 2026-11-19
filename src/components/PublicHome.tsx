import React, { useMemo, useState } from 'react';
import {
  ArrowRightLeft,
  EyeOff,
  HeartHandshake,
  MessageCircle,
  Phone,
  Search,
  ShieldCheck,
  Sprout,
} from 'lucide-react';
import campaignDefaultImg from '../assets/images/campaign_angola_harvest_1794631511611.jpg';
import heroAgroImg from '../assets/images/hero_angola_agro_1794631510017.jpg';
import { ANGOLA_PROVINCES, convertFromKz, formatCurrency } from '../lib/api';
import type { Campaign, CurrencyCode, FinancialSettings, Listing, User } from '../types';
import { DonationModal } from './DonationModal';
import { EssentialPricesDailyChart } from './EssentialPricesDailyChart';

import type { VitrineCategoryFilter } from './Navbar';

interface PublicHomeProps {
  currentUser: User | null;
  hasAnyUser: boolean;
  settings: FinancialSettings;
  campaigns: Campaign[];
  listings: Listing[];
  searchQuery: string;
  categoryFilter: VitrineCategoryFilter;
  provinceFilter: string;
  onSearchQueryChange: (value: string) => void;
  onCategoryFilterChange: (value: VitrineCategoryFilter) => void;
  onProvinceFilterChange: (value: string) => void;
  onClearSearch: () => void;
  onOpenDirectMessage: (listing: Listing) => void;
  onOpenAuth: (mode: 'login' | 'register') => void;
  onGoToPanel: () => void;
}

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export const PublicHome: React.FC<PublicHomeProps> = ({
  currentUser,
  hasAnyUser,
  settings,
  campaigns,
  listings,
  searchQuery,
  categoryFilter,
  provinceFilter,
  onSearchQueryChange,
  onCategoryFilterChange,
  onProvinceFilterChange,
  onClearSearch,
  onOpenDirectMessage,
  onOpenAuth,
  onGoToPanel,
}) => {
  const [currency, setCurrency] = useState<CurrencyCode>('AOA');
  const [converterKz, setConverterKz] = useState<string>('10000');
  const [donationOpen, setDonationOpen] = useState(false);

  const filteredListings = useMemo(() => {
    const normalizedQuery = normalizeSearchText(searchQuery.trim());
    return listings.filter((item) => {
      if (categoryFilter !== 'Todos' && item.category !== categoryFilter) return false;
      if (provinceFilter !== 'Todas' && item.province !== provinceFilter) return false;
      if (normalizedQuery) {
        const matchTitle = normalizeSearchText(item.title).includes(normalizedQuery);
        const matchDesc = normalizeSearchText(item.description).includes(normalizedQuery);
        const matchCategory = normalizeSearchText(item.category).includes(normalizedQuery);
        const matchProv = normalizeSearchText(item.province).includes(normalizedQuery);
        if (!matchTitle && !matchDesc && !matchCategory && !matchProv) return false;
      }
      return true;
    });
  }, [listings, categoryFilter, provinceFilter, searchQuery]);

  const hasActiveSearch =
    searchQuery.trim().length > 0 || categoryFilter !== 'Todos' || provinceFilter !== 'Todas';

  const numericConverterKz = Math.max(0, Number(converterKz) || 0);

  return (
    <div className="min-h-screen bg-[#F7F9F7] pb-20">
      {/* HERO SECTION */}
      <section className="border-b border-[#DCE5DE] bg-white">
        <div className="mx-auto grid max-w-7xl grid-cols-1 lg:grid-cols-12 items-stretch gap-8 px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
          <div className="lg:col-span-6 flex flex-col justify-center space-y-6">
            <div className="text-xs font-semibold tracking-wide text-[#15803D]">
              Mercado Agrícola Verificado de Angola
            </div>

            <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-[#111814] leading-[1.12] [text-wrap:balance]">
              Do campo à cidade, crescemos juntos
            </h1>

            <p className="max-w-xl text-base sm:text-lg text-[#445449] leading-relaxed">
              Conecte produtores, compradores e serviços agrícolas num só lugar
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              {currentUser ? (
                <button
                  type="button"
                  onClick={onGoToPanel}
                  className="rounded-lg bg-[#14532D] px-6 py-3 text-sm font-semibold text-white hover:bg-[#15803D] transition-colors whitespace-nowrap"
                >
                  Abrir Meu Painel
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onOpenAuth('register')}
                  className="rounded-lg bg-[#14532D] px-6 py-3 text-sm font-semibold text-white hover:bg-[#15803D] transition-colors whitespace-nowrap"
                >
                  {hasAnyUser ? 'Registar Produtor / Comprador' : 'Criar Conta (Administrador Principal)'}
                </button>
              )}

              <button
                type="button"
                onClick={() => setDonationOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-[#EAB308] bg-[#FEFCE8] px-5 py-3 text-sm font-semibold text-[#713F12] hover:bg-[#FEF08A] transition-colors whitespace-nowrap"
              >
                <HeartHandshake className="w-4 h-4 text-[#CA8A04]" />
                Doação Direta Privada
              </button>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="relative h-72 sm:h-96 lg:h-full min-h-[320px] overflow-hidden rounded-xl border border-[#DCE5DE] bg-[#14532D]">
              <img
                src={heroAgroImg}
                alt="Campos agrícolas angolanos cultivados"
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
              <div className="absolute bottom-5 left-5 right-5 flex flex-wrap items-end justify-between gap-4 text-white">
                <div>
                  <p className="text-xs font-medium text-[#FACC15]">Produção Nacional Validada</p>
                  <p className="text-sm sm:text-base font-semibold">
                    18 Províncias · Identidade por Vídeo · Cota Ativa
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* INTEGRATED CURRENCY CONVERTER */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mt-8">
        <div className="rounded-xl border border-[#DCE5DE] bg-white p-5 sm:p-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-2 text-sm font-bold text-[#14532D]">
                <ArrowRightLeft className="w-4 h-4 text-[#EAB308]" />
                Conversor de Moedas Integrado (Base: Kwanza)
              </div>
              <p className="text-xs text-[#546459]">
                Selecione a moeda de visualização da vitrine ou converta valores em tempo real.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Currency Selector Segmented Control */}
              <div className="flex items-center gap-1 rounded-lg bg-[#F2F7F3] p-1 border border-[#DCE5DE]">
                {(['AOA', 'USD', 'EUR', 'GBP'] as CurrencyCode[]).map((code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => setCurrency(code)}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                      currency === code
                        ? 'bg-[#14532D] text-white shadow-sm'
                        : 'text-[#445449] hover:text-[#111814]'
                    }`}
                  >
                    {code === 'AOA' ? 'Kz (AOA)' : code}
                  </button>
                ))}
              </div>

              {/* Quick Kz Calculator */}
              <div className="flex items-center gap-2 rounded-lg border border-[#D4DDD6] bg-[#F7F9F7] px-3 py-1.5">
                <span className="text-xs font-medium text-[#546459]">Simular Kz:</span>
                <input
                  type="number"
                  min="0"
                  value={converterKz}
                  onChange={(e) => setConverterKz(e.target.value)}
                  className="w-28 bg-transparent text-sm font-semibold text-[#111814] font-mono-tabular focus:outline-none"
                />
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs font-mono-tabular text-[#1C2720]">
                <span>{formatCurrency(convertFromKz(numericConverterKz, 'USD', settings), 'USD')}</span>
                <span aria-hidden="true" className="text-[#9AA89F]">·</span>
                <span>{formatCurrency(convertFromKz(numericConverterKz, 'EUR', settings), 'EUR')}</span>
                <span aria-hidden="true" className="text-[#9AA89F]">·</span>
                <span>{formatCurrency(convertFromKz(numericConverterKz, 'GBP', settings), 'GBP')}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* DYNAMIC ADVERTISING & CAMPAIGNS AREA */}
      {campaigns.length > 0 && (
        <section id="campanhas" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mt-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-xl font-bold text-[#111814]">
              Publicidade e Campanhas Oficiais
            </h2>
            <span className="text-xs text-[#546459]">Gerido pela Administração Principal</span>
          </div>

          <div className="grid grid-cols-1 gap-5">
            {campaigns.map((camp) => {
              const resolvedImg =
                camp.imageUrl === '/campaign-default.jpg' || !camp.imageUrl ? campaignDefaultImg : camp.imageUrl;
              return (
                <div
                  key={camp.id}
                  className="grid grid-cols-1 md:grid-cols-12 overflow-hidden rounded-xl border border-[#DCE5DE] bg-white"
                >
                  <div className="md:col-span-5 h-56 md:h-auto min-h-[200px] bg-[#14532D]">
                    <img
                      src={resolvedImg}
                      alt={camp.title}
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="md:col-span-7 flex flex-col justify-center p-6 sm:p-8 space-y-3">
                    <span className="text-xs font-semibold text-[#CA8A04]">Campanha em Destaque</span>
                    <h3 className="font-display text-xl sm:text-2xl font-bold text-[#111814]">
                      {camp.title}
                    </h3>
                    <p className="text-sm text-[#445449] leading-relaxed">{camp.subtitle}</p>
                    <div className="pt-2">
                      {camp.ctaUrl === '#registar' ? (
                        <button
                          type="button"
                          onClick={() => (currentUser ? onGoToPanel() : onOpenAuth('register'))}
                          className="rounded-lg bg-[#EAB308] px-5 py-2.5 text-xs font-bold text-[#111814] hover:bg-[#CA8A04] hover:text-white transition-colors whitespace-nowrap"
                        >
                          {camp.ctaLabel}
                        </button>
                      ) : (
                        <a
                          href={camp.ctaUrl}
                          className="inline-block rounded-lg bg-[#EAB308] px-5 py-2.5 text-xs font-bold text-[#111814] hover:bg-[#CA8A04] hover:text-white transition-colors whitespace-nowrap"
                        >
                          {camp.ctaLabel}
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* PUBLIC VITRINE (ONLY ACTIVE & APPROVED USERS SHARP; PENDING/INACTIVE BLURRED) */}
      <section id="vitrine" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mt-12">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[#DCE5DE] pb-5">
          <div>
            <h2 className="font-display text-2xl font-bold text-[#111814]">
              Vitrine de Produtos e Serviços Agrícolas
            </h2>
            <p className="text-sm text-[#546459] mt-1">
              Exibição nítida exclusiva para utilizadores aprovados e com cota ativa.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Search */}
            <div className="relative">
              <Search className="w-4 h-4 text-[#7B8B80] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchQueryChange(e.target.value)}
                placeholder="Pesquisar produto, categoria ou província..."
                className="rounded-lg border border-[#D4DDD6] bg-white pl-9 pr-3 py-2 text-xs text-[#111814] focus:border-[#15803D] focus:outline-none w-56"
              />
            </div>

            {/* Category filter */}
            <div className="flex items-center gap-1 rounded-lg bg-white p-1 border border-[#D4DDD6]">
              {(['Todos', 'Produto Agrícola', 'Consultoria/Formação'] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => onCategoryFilterChange(cat)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                    categoryFilter === cat
                      ? 'bg-[#14532D] text-white'
                      : 'text-[#445449] hover:text-[#111814]'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Province filter */}
            <select
              value={provinceFilter}
              onChange={(e) => onProvinceFilterChange(e.target.value)}
              className="rounded-lg border border-[#D4DDD6] bg-white px-3 py-2 text-xs font-medium text-[#1C2720] focus:border-[#15803D] focus:outline-none"
            >
              <option value="Todas">Todas as Províncias</option>
              {ANGOLA_PROVINCES.map((prov) => (
                <option key={prov} value={prov}>
                  {prov}
                </option>
              ))}
            </select>
          </div>
        </div>

        {hasActiveSearch && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-[#546459]">
            <span className="font-mono-tabular">
              {filteredListings.length} {filteredListings.length === 1 ? 'resultado encontrado' : 'resultados encontrados'}
              {searchQuery.trim() ? ` · Pesquisa: "${searchQuery.trim()}"` : ''}
              {categoryFilter !== 'Todos' ? ` · Categoria: ${categoryFilter}` : ''}
              {provinceFilter !== 'Todas' ? ` · Província: ${provinceFilter}` : ''}
            </span>
            <button
              type="button"
              onClick={onClearSearch}
              className="font-semibold text-[#14532D] hover:underline"
            >
              Limpar filtros
            </button>
          </div>
        )}

        {filteredListings.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed border-[#C7D3CA] bg-white p-12 text-center">
            <Sprout className="w-8 h-8 text-[#15803D] mx-auto mb-3" />
            <h3 className="font-display text-lg font-semibold text-[#111814]">
              Ainda não há publicações correspondentes na vitrine
            </h3>
            <p className="mt-1.5 text-sm text-[#546459] max-w-md mx-auto">
              {hasActiveSearch
                ? 'Nenhum produto ou serviço corresponde aos critérios de pesquisa selecionados. Experimente ajustar ou limpar os filtros.'
                : 'Assim que os utilizadores forem aprovados com cota ativa e publicarem produtos agrícolas ou serviços de consultoria/formação, aparecerão aqui com nitidez total.'}
            </p>
            {hasActiveSearch ? (
              <button
                type="button"
                onClick={onClearSearch}
                className="mt-5 rounded-lg border border-[#D4DDD6] bg-white px-5 py-2.5 text-xs font-semibold text-[#14532D] hover:bg-[#F2F7F3]"
              >
                Limpar Pesquisa e Filtros
              </button>
            ) : (
              !currentUser && (
                <button
                  type="button"
                  onClick={() => onOpenAuth('register')}
                  className="mt-5 rounded-lg bg-[#14532D] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#15803D]"
                >
                  {hasAnyUser ? 'Registar e Publicar' : 'Inaugurar como Administrador Principal'}
                </button>
              )
            )}
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredListings.map((item) => {
              if (item.isBlurred) {
                return (
                  <article
                    key={item.id}
                    className="overflow-hidden rounded-xl border border-[#DCE5DE] bg-white flex flex-col"
                  >
                    <div className="relative aspect-[4/3] overflow-hidden bg-[#E5ECE6]">
                      <img
                        src={item.imageUrl}
                        alt="Conteúdo oculto"
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover blur-xl scale-110 select-none pointer-events-none"
                      />
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/45 p-4 text-center text-white">
                        <EyeOff className="w-6 h-6 text-[#FACC15] mb-2" />
                        <span className="text-xs font-semibold">Conteúdo Desfocado / Oculto</span>
                        <span className="text-[11px] text-white/85 mt-1">
                          Perfil pendente ou cota inativa
                        </span>
                      </div>
                    </div>
                    <div className="p-5 space-y-2 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="text-xs text-[#546459]">
                          {item.category} · {item.province}
                        </div>
                        <h3 className="mt-1.5 font-display text-base font-semibold text-[#111814] blur-[4px] select-none">
                          {item.title}
                        </h3>
                      </div>
                      <div className="pt-3 border-t border-[#EDF2EE] text-xs text-[#7B8B80]">
                        Aguarda validação administrativa e cota ativa
                      </div>
                    </div>
                  </article>
                );
              }

              const convertedPrice = convertFromKz(item.priceKz, currency, settings);

              return (
                <article
                  key={item.id}
                  className={`group overflow-hidden rounded-xl border bg-white flex flex-col transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-md ${
                    item.isFeatured
                      ? 'border-[#CA8A04] ring-1 ring-[#CA8A04]/25'
                      : 'border-[#DCE5DE]'
                  }`}
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-[#EEF3EF]">
                    <img
                      src={item.imageUrl}
                      alt={item.title}
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover"
                    />
                    {item.isFeatured && (
                      <div className="absolute top-3 left-3 rounded-md bg-[#14532D] px-2.5 py-1 text-[11px] font-bold text-[#FACC15] shadow-sm">
                        Em Destaque
                      </div>
                    )}
                  </div>

                  <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                    <div>
                      <div className="flex items-center gap-2 text-xs text-[#546459]">
                        <span className="font-semibold text-[#15803D]">{item.category}</span>
                        <span aria-hidden="true">·</span>
                        <span>{item.province}</span>
                        {item.isMasked && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>Imagem verificada</span>
                          </>
                        )}
                      </div>

                      <h3 className="mt-1.5 font-display text-lg font-bold text-[#111814]">
                        {item.title}
                      </h3>

                      <p className="mt-1.5 text-sm text-[#445449] line-clamp-2">{item.description}</p>
                    </div>

                    <div className="space-y-3 pt-3 border-t border-[#EDF2EE]">
                      <div className="flex items-baseline justify-between gap-2">
                        <div>
                          <span className="font-display text-lg font-extrabold text-[#14532D] font-mono-tabular">
                            {formatCurrency(convertedPrice, currency)}
                          </span>
                          <span className="ml-1.5 text-xs text-[#546459]">/ {item.unit}</span>
                        </div>
                        {currency !== 'AOA' && (
                          <span className="text-xs text-[#7B8B80] font-mono-tabular">
                            ({formatCurrency(item.priceKz, 'AOA')})
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          {item.sellerPhoto && (
                            <img
                              src={item.sellerPhoto}
                              alt={item.sellerName}
                              referrerPolicy="no-referrer"
                              className="h-7 w-7 rounded-full object-cover border border-[#DCE5DE] shrink-0"
                            />
                          )}
                          <span className="text-xs font-medium text-[#1C2720] truncate">
                            {item.sellerName}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              fetch(`/api/public/listings/${item.id}/inquiry`, { method: 'POST' }).catch(() => {});
                              onOpenDirectMessage(item);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-[#15803D] bg-[#F2F7F3] px-2.5 py-1.5 text-xs font-semibold text-[#14532D] hover:bg-[#E4EFE6] transition-colors whitespace-nowrap shrink-0"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            Mensagem
                          </button>

                          {item.sellerWhatsapp && (
                            <a
                              href={`https://wa.me/${item.sellerWhatsapp.replace(/[^0-9]/g, '')}`}
                              target="_blank"
                              rel="noreferrer"
                              onClick={() => {
                                fetch(`/api/public/listings/${item.id}/inquiry`, { method: 'POST' }).catch(() => {});
                              }}
                              className="inline-flex items-center gap-1 rounded-lg bg-[#14532D] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#15803D] transition-colors whitespace-nowrap shrink-0"
                            >
                              <Phone className="w-3.5 h-3.5" />
                              WhatsApp
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* DAILY ESSENTIAL PRODUCT PRICES BAR CHART */}
      <EssentialPricesDailyChart
        listings={listings}
        settings={settings}
        currency={currency}
      />

      {/* DYNAMIC OFFICIAL PAYMENTS & QUOTA AREA */}
      <section id="pagamentos" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mt-14">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 rounded-xl border border-[#DCE5DE] bg-white p-6 sm:p-8">
          <div className="lg:col-span-7 space-y-5">
            <div>
              <h2 className="font-display text-xl sm:text-2xl font-bold text-[#111814]">
                Área de Pagamentos Oficial
              </h2>
              <p className="mt-1 text-sm text-[#546459]">
                Coordenadas financeiras oficiais da Nzila Agro atualizadas em tempo real pela Administração Principal.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-lg border border-[#E5ECE6] bg-[#F7F9F7] p-4">
                <div className="text-xs font-medium text-[#546459]">IBAN Oficial</div>
                <div className="mt-1 text-sm font-bold text-[#111814] font-mono-tabular break-all">
                  {settings.officialIban}
                </div>
              </div>

              <div className="rounded-lg border border-[#E5ECE6] bg-[#F7F9F7] p-4">
                <div className="text-xs font-medium text-[#546459]">Multicaixa Express</div>
                <div className="mt-1 text-sm font-bold text-[#111814] font-mono-tabular">
                  {settings.officialExpress}
                </div>
              </div>

              <div className="rounded-lg border border-[#E5ECE6] bg-[#F7F9F7] p-4">
                <div className="text-xs font-medium text-[#546459]">Número de Conta</div>
                <div className="mt-1 text-sm font-bold text-[#111814] font-mono-tabular">
                  {settings.officialAccountNumber}
                </div>
                <div className="mt-0.5 text-xs text-[#546459]">{settings.officialAccountHolder}</div>
              </div>

              <div className="rounded-lg border border-[#E5ECE6] bg-[#F7F9F7] p-4">
                <div className="text-xs font-medium text-[#546459]">WhatsApp Financeiro Oficial</div>
                <div className="mt-1 text-sm font-bold text-[#14532D] font-mono-tabular">
                  {settings.officialWhatsapp}
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 flex flex-col justify-between rounded-xl border border-[#DCE5DE] bg-[#14532D] p-6 text-white space-y-5">
            <div>
              <span className="text-xs font-semibold text-[#FACC15]">Cotas de Ativação Mensal</span>
              <h3 className="mt-1 font-display text-xl font-bold">Valores Oficiais nas 4 Moedas</h3>
              <p className="mt-1 text-xs text-white/80">
                Mantenha a sua cota ativa para manter os seus produtos nítidos e visíveis ao público.
              </p>

              <div className="mt-4 grid grid-cols-2 gap-3 font-mono-tabular">
                <div className="rounded-lg bg-white/10 p-3">
                  <div className="text-[11px] text-white/75">Kwanza (Kz)</div>
                  <div className="text-base font-bold">{formatCurrency(settings.quotaValueKz, 'AOA')}</div>
                </div>
                <div className="rounded-lg bg-white/10 p-3">
                  <div className="text-[11px] text-white/75">Dólar (USD)</div>
                  <div className="text-base font-bold">{formatCurrency(settings.quotaValueUsd, 'USD')}</div>
                </div>
                <div className="rounded-lg bg-white/10 p-3">
                  <div className="text-[11px] text-white/75">Euro (EUR)</div>
                  <div className="text-base font-bold">{formatCurrency(settings.quotaValueEur, 'EUR')}</div>
                </div>
                <div className="rounded-lg bg-white/10 p-3">
                  <div className="text-[11px] text-white/75">Libra (GBP)</div>
                  <div className="text-base font-bold">{formatCurrency(settings.quotaValueGbp, 'GBP')}</div>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setDonationOpen(true)}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#FACC15] px-5 py-3 text-sm font-bold text-[#111814] hover:bg-[#EAB308] transition-colors"
            >
              <HeartHandshake className="w-4 h-4" />
              Fazer Doação Direta Privada
            </button>
          </div>
        </div>
      </section>

      {/* DISCREET GUARANTEE SEAL IN BOTTOM CORNER */}
      <div className="fixed bottom-4 right-4 z-30 hidden sm:flex items-center gap-2 rounded-lg border border-[#DCE5DE] bg-white/95 px-3.5 py-2 text-xs font-medium text-[#14532D] shadow-sm backdrop-blur-sm">
        <ShieldCheck className="w-4 h-4 text-[#15803D] shrink-0" />
        <span>Supervisão 24/7 - Garantia Administrativa</span>
      </div>

      {/* FOOTER */}
      <footer className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mt-14 pt-6 border-t border-[#DCE5DE] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#546459]">
        <span>© {new Date().getFullYear()} Nzila Agro Angola · Todos os direitos reservados</span>
        <span>Supervisão 24/7 - Garantia Administrativa</span>
      </footer>

      {donationOpen && (
        <DonationModal
          settings={settings}
          defaultCurrency={currency}
          onClose={() => setDonationOpen(false)}
        />
      )}
    </div>
  );
};
