import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

function createGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Chave GEMINI_API_KEY não configurada no servidor. Verifique Settings > Secrets para ativar a sugestão de preços.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export interface PriceSuggestionInput {
  category: string;
  province: string;
  title?: string;
  unit?: string;
  localStats?: {
    count: number;
    avgPriceKz: number | null;
    minPriceKz: number | null;
    maxPriceKz: number | null;
  };
}

export interface PriceSuggestionResult {
  minPriceKz: number;
  recommendedPriceKz: number;
  maxPriceKz: number;
  marketInsight: string;
  tip: string;
}

export async function suggestCompetitivePriceRange(
  input: PriceSuggestionInput
): Promise<PriceSuggestionResult> {
  const ai = createGeminiClient();

  const localContext =
    input.localStats && input.localStats.count > 0 && input.localStats.avgPriceKz
      ? `Dados atuais da plataforma nesta categoria/província (${input.localStats.count} anúncios): mínimo ${input.localStats.minPriceKz} Kz, médio ${input.localStats.avgPriceKz} Kz, máximo ${input.localStats.maxPriceKz} Kz.`
      : 'Ainda não existem anúncios suficientes na plataforma para esta província; baseie-se nos preços reais praticados no mercado agrícola angolano atual.';

  const prompt = [
    `Categoria: ${input.category}`,
    `Província em Angola: ${input.province}`,
    input.title?.trim() ? `Produto / Serviço: ${input.title.trim()}` : 'Produto / Serviço: (genérico da categoria)',
    input.unit?.trim() ? `Unidade de venda: ${input.unit.trim()}` : 'Unidade de venda: Unidade padrão',
    localContext,
    'Sugira uma faixa de preço competitiva em Kwanzas (AOA) para ajudar o produtor a definir um preço justo e atrativo nesta província.',
  ].join('\n');

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      systemInstruction:
        'És um consultor de mercados agrícolas em Angola. Responde exclusivamente em Português de Angola com valores realistas em Kwanzas (AOA), inteiros arredondados (ex: múltiplos de 100 ou 500 Kz). Mantém marketInsight em 1 a 2 frases curtas e tip em 1 frase prática.',
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          minPriceKz: {
            type: Type.NUMBER,
            description: 'Preço mínimo competitivo sugerido em Kwanzas (AOA).',
          },
          recommendedPriceKz: {
            type: Type.NUMBER,
            description: 'Preço ideal recomendado em Kwanzas (AOA).',
          },
          maxPriceKz: {
            type: Type.NUMBER,
            description: 'Preço máximo competitivo sugerido em Kwanzas (AOA).',
          },
          marketInsight: {
            type: Type.STRING,
            description: 'Breve explicação sobre a dinâmica de preço na província indicada.',
          },
          tip: {
            type: Type.STRING,
            description: 'Dica prática curta para aumentar vendas com este preço.',
          },
        },
        required: ['minPriceKz', 'recommendedPriceKz', 'maxPriceKz', 'marketInsight', 'tip'],
      },
    },
  });

  const rawText = (response.text ?? '').trim();
  if (!rawText) {
    throw new Error('A API Gemini não retornou conteúdo para a sugestão de preço.');
  }

  const parsed = JSON.parse(rawText) as Partial<PriceSuggestionResult>;
  const minVal = Math.max(100, Math.round(Number(parsed.minPriceKz) || 0));
  const maxVal = Math.max(minVal, Math.round(Number(parsed.maxPriceKz) || minVal));
  const recVal = Math.min(
    maxVal,
    Math.max(minVal, Math.round(Number(parsed.recommendedPriceKz) || Math.round((minVal + maxVal) / 2)))
  );

  return {
    minPriceKz: minVal,
    recommendedPriceKz: recVal,
    maxPriceKz: maxVal,
    marketInsight: String(parsed.marketInsight || 'Faixa estimada para o mercado provincial angolano.').trim(),
    tip: String(parsed.tip || 'Destaque a qualidade e a frescura do produto na descrição.').trim(),
  };
}

export interface MonthlyPlatformMetrics {
  periodLabel: string;
  periodMode?: 'current_month' | 'last_30d';
  focus: string;
  totalUsers: number;
  newUsersLast30d: number;
  activeUsers: number;
  pendingUsers: number;
  activeQuotas: number;
  estimatedQuotaRevenueKz?: number;
  bonusesGrantedKz?: number;
  totalListings: number;
  newListingsLast30d: number;
  agriculturalListingsInPeriod?: number;
  consultingListingsInPeriod?: number;
  avgListingPriceKz: number;
  topProvinces: Array<{ province: string; count: number }>;
  salesCountLast30d: number;
  salesVolumeKzLast30d: number;
  avgSaleTicketKzLast30d: number;
  prevSalesVolumeKz: number;
  salesGrowthPct: number | null;
  conversionRatePct: number | null;
  topSellingProducts: Array<{ title: string; salesCount: number; volumeKz: number }>;
  inquiriesLast30d: number;
  donationsCountLast30d: number;
  donationsTotalKzLast30d: number;
  openSupportTickets: number;
  pendingRecoveries: number;
  auditEventsLast30d: number;
}

export interface ExecutiveSummaryReport {
  headline: string;
  executiveNarrative: string;
  keyHighlights: string[];
  attentionPoints: string[];
  strategicRecommendations: string[];
}

export async function generateExecutiveSummaryReport(
  metrics: MonthlyPlatformMetrics
): Promise<ExecutiveSummaryReport> {
  const ai = createGeminiClient();

  const provincesSummary =
    metrics.topProvinces.length > 0
      ? metrics.topProvinces.map((p) => `${p.province} (${p.count})`).join(', ')
      : 'Sem publicações registadas por província no período';

  const topProductsSummary =
    metrics.topSellingProducts.length > 0
      ? metrics.topSellingProducts
          .map((p) => `${p.title} (${p.salesCount} vendas · ${p.volumeKz} Kz)`)
          .join('; ')
      : 'Sem vendas de produtos registadas no período';

  const salesGrowthText =
    metrics.salesGrowthPct !== null
      ? `${metrics.salesGrowthPct >= 0 ? '+' : ''}${metrics.salesGrowthPct}% face ao período anterior (${metrics.prevSalesVolumeKz} Kz)`
      : `Sem base comparativa no período anterior (${metrics.prevSalesVolumeKz} Kz)`;

  const conversionText =
    metrics.conversionRatePct !== null
      ? `${metrics.conversionRatePct}% de conversão (vendas sobre consultas)`
      : 'Sem consultas suficientes para cálculo de conversão';

  const prompt = [
    `Período analisado: ${metrics.periodLabel}`,
    `Foco solicitado pela direção: ${metrics.focus}`,
    '',
    'Métricas reais de desempenho financeiro e listagens de produtos da plataforma Nzila Agro (Angola):',
    `- Utilizadores: ${metrics.totalUsers} totais (novos no período: ${metrics.newUsersLast30d}; ativos: ${metrics.activeUsers}; pendentes: ${metrics.pendingUsers}; cotas ativas: ${metrics.activeQuotas})`,
    `- Listagens de Produtos: ${metrics.totalListings} totais (novas no período: ${metrics.newListingsLast30d}, sendo ${metrics.agriculturalListingsInPeriod ?? 0} Produtos Agrícolas e ${metrics.consultingListingsInPeriod ?? 0} Consultoria/Formação; preço médio nacional: ${metrics.avgListingPriceKz} Kz)`,
    `- Províncias mais ativas em listagens: ${provincesSummary}`,
    `- Desempenho Financeiro & Vendas no período: ${metrics.salesCountLast30d} vendas registadas, volume transacionado de ${metrics.salesVolumeKzLast30d} Kz, ticket médio de ${metrics.avgSaleTicketKzLast30d} Kz (${salesGrowthText})`,
    `- Receita de Cotas & Incentivos: receita estimada de cotas ativas de ${metrics.estimatedQuotaRevenueKz ?? 0} Kz; bónus concedidos no período: ${metrics.bonusesGrantedKz ?? 0} Kz; doações privadas: ${metrics.donationsCountLast30d} contribuições (${metrics.donationsTotalKzLast30d} Kz)`,
    `- Procura & Conversão: ${metrics.inquiriesLast30d} consultas de compradores (${conversionText})`,
    `- Produtos com maior volume de vendas: ${topProductsSummary}`,
    `- Operações e governança: ${metrics.openSupportTickets} pedidos de suporte abertos, ${metrics.pendingRecoveries} recuperações de conta pendentes, ${metrics.auditEventsLast30d} registos de auditoria no período`,
    '',
    'Produza um resumo executivo em texto claro, objetivo e fiel exclusivamente aos números acima (sem inventar números adicionais), destacando o desempenho financeiro e a dinâmica de listagens de produtos.',
  ].join('\n');

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      systemInstruction:
        'És um diretor de estratégia e análise de dados da plataforma agrícola angolana Nzila Agro. Redige relatórios executivos em Português de Angola com clareza, rigor e tom institucional. Mantém a narrativa executiva em 2 a 3 parágrafos objetivos, 3 a 5 destaques, 2 a 4 pontos de atenção e 3 recomendações estratégicas práticas.',
      thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          headline: {
            type: Type.STRING,
            description: 'Título executivo curto resumindo o desempenho do último mês.',
          },
          executiveNarrative: {
            type: Type.STRING,
            description: 'Texto corrido em linguagem natural (2 a 3 parágrafos) analisando o desempenho mensal.',
          },
          keyHighlights: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Lista de 3 a 5 principais destaques positivos ou factuais.',
          },
          attentionPoints: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Lista de 2 a 4 pontos de atenção operacional ou comercial.',
          },
          strategicRecommendations: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Lista de 3 recomendações estratégicas acionáveis para o próximo mês.',
          },
        },
        required: [
          'headline',
          'executiveNarrative',
          'keyHighlights',
          'attentionPoints',
          'strategicRecommendations',
        ],
      },
    },
  });

  const rawText = (response.text ?? '').trim();
  if (!rawText) {
    throw new Error('A API Gemini não retornou conteúdo para o relatório executivo.');
  }

  const parsed = JSON.parse(rawText) as Partial<ExecutiveSummaryReport>;
  return {
    headline: String(parsed.headline || 'Resumo Executivo Mensal — Nzila Agro').trim(),
    executiveNarrative: String(parsed.executiveNarrative || '').trim(),
    keyHighlights: Array.isArray(parsed.keyHighlights) ? parsed.keyHighlights.map(String) : [],
    attentionPoints: Array.isArray(parsed.attentionPoints) ? parsed.attentionPoints.map(String) : [],
    strategicRecommendations: Array.isArray(parsed.strategicRecommendations)
      ? parsed.strategicRecommendations.map(String)
      : [],
  };
}
