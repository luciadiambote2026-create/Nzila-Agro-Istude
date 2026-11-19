import React, { useEffect, useMemo, useState } from 'react';
import { Calculator, Download, Info, Leaf, MapPin, Sprout, TrendingUp } from 'lucide-react';
import { ANGOLA_PROVINCES, apiRequest, formatCurrency } from '../lib/api';
import type { Listing, User } from '../types';

interface InputsCalculatorPanelProps {
  user: User;
}

type AreaUnit = 'ha' | 'm2';
type SoilFertility = 'baixa' | 'media' | 'alta';

interface FertilizerItemSpec {
  id: string;
  name: string;
  formula: string;
  kgPerHa: number;
  bagWeightKg: number;
  basePricePerBagKz: number;
  applicationStage: string;
}

interface CropAgronomicProfile {
  id: string;
  name: string;
  scientificName: string;
  cycleDays: string;
  expectedYieldTonPerHa: number;
  seedRateLabel: string;
  notes: string;
  fertilizers: FertilizerItemSpec[];
}

const CROP_PROFILES: CropAgronomicProfile[] = [
  {
    id: 'milho',
    name: 'Milho',
    scientificName: 'Zea mays',
    cycleDays: '110 – 130 dias',
    expectedYieldTonPerHa: 4.5,
    seedRateLabel: '20 – 25 kg/ha de semente certificada',
    notes: 'Aplicar o NPK no sulco de sementeira e dividir a Ureia em duas coberturas (25 e 45 dias após emergência).',
    fertilizers: [
      {
        id: 'npk-12-24-12',
        name: 'Adubo Composto NPK 12-24-12',
        formula: '12% N · 24% P₂O₅ · 12% K₂O',
        kgPerHa: 250,
        bagWeightKg: 50,
        basePricePerBagKz: 38500,
        applicationStage: 'Adubação de fundo (sementeira)',
      },
      {
        id: 'ureia-46',
        name: 'Ureia Granulada 46% N',
        formula: '46% Azoto (N)',
        kgPerHa: 150,
        bagWeightKg: 50,
        basePricePerBagKz: 34000,
        applicationStage: 'Cobertura (25 e 45 dias)',
      },
    ],
  },
  {
    id: 'mandioca',
    name: 'Mandioca',
    scientificName: 'Manihot esculenta',
    cycleDays: '10 – 14 meses',
    expectedYieldTonPerHa: 18,
    seedRateLabel: '10.000 estacas (manivas) / ha',
    notes: 'A mandioca responde muito bem ao potássio para enchimento das raízes tuberosas em solos arenosos.',
    fertilizers: [
      {
        id: 'npk-12-24-12',
        name: 'Adubo Composto NPK 12-24-12',
        formula: '12% N · 24% P₂O₅ · 12% K₂O',
        kgPerHa: 200,
        bagWeightKg: 50,
        basePricePerBagKz: 38500,
        applicationStage: 'Plantio / 30 dias após brotação',
      },
      {
        id: 'kcl-60',
        name: 'Cloreto de Potássio (KCl)',
        formula: '60% K₂O',
        kgPerHa: 100,
        bagWeightKg: 50,
        basePricePerBagKz: 35500,
        applicationStage: 'Cobertura (60 – 90 dias)',
      },
    ],
  },
  {
    id: 'feijao',
    name: 'Feijão',
    scientificName: 'Phaseolus vulgaris',
    cycleDays: '75 – 95 dias',
    expectedYieldTonPerHa: 1.6,
    seedRateLabel: '60 – 75 kg/ha de semente selecionada',
    notes: 'Evitar excesso de azoto mineral para não inibir a fixação biológica simbiótica nas raízes.',
    fertilizers: [
      {
        id: 'npk-12-24-12',
        name: 'Adubo Composto NPK 12-24-12',
        formula: '12% N · 24% P₂O₅ · 12% K₂O',
        kgPerHa: 200,
        bagWeightKg: 50,
        basePricePerBagKz: 38500,
        applicationStage: 'Adubação de fundo (sementeira)',
      },
      {
        id: 'sulfato-amonio',
        name: 'Sulfato de Amónio (21% N)',
        formula: '21% N · 24% Enxofre',
        kgPerHa: 50,
        bagWeightKg: 50,
        basePricePerBagKz: 29500,
        applicationStage: 'Cobertura leve (20 – 25 dias)',
      },
    ],
  },
  {
    id: 'batata-rena',
    name: 'Batata Rena',
    scientificName: 'Solanum tuberosum',
    cycleDays: '95 – 120 dias',
    expectedYieldTonPerHa: 22,
    seedRateLabel: '2.000 – 2.500 kg/ha de batata-semente',
    notes: 'Cultura exigente em fósforo e potássio, muito adaptada ao Planalto Central (Huambo, Bié, Huíla).',
    fertilizers: [
      {
        id: 'npk-12-24-12',
        name: 'Adubo Composto NPK 12-24-12',
        formula: '12% N · 24% P₂O₅ · 12% K₂O',
        kgPerHa: 500,
        bagWeightKg: 50,
        basePricePerBagKz: 38500,
        applicationStage: 'Fundo no sulco de plantio',
      },
      {
        id: 'ureia-46',
        name: 'Ureia Granulada 46% N',
        formula: '46% Azoto (N)',
        kgPerHa: 150,
        bagWeightKg: 50,
        basePricePerBagKz: 34000,
        applicationStage: 'Na amontoa (30 – 35 dias)',
      },
      {
        id: 'kcl-60',
        name: 'Cloreto de Potássio (KCl)',
        formula: '60% K₂O',
        kgPerHa: 100,
        bagWeightKg: 50,
        basePricePerBagKz: 35500,
        applicationStage: 'Tuberização (40 – 45 dias)',
      },
    ],
  },
  {
    id: 'cafe',
    name: 'Café (Robusta / Arábica)',
    scientificName: 'Coffea canephora / arabica',
    cycleDays: 'Perene (ciclo anual)',
    expectedYieldTonPerHa: 1.4,
    seedRateLabel: '1.333 – 2.500 plantas / ha',
    notes: 'Corrigir a acidez do solo com calcário agrícola antes das chuvas no Uíge, Cuanza Sul e Cuanza Norte.',
    fertilizers: [
      {
        id: 'npk-15-15-15',
        name: 'Adubo Equilibrado NPK 15-15-15',
        formula: '15% N · 15% P₂O₅ · 15% K₂O',
        kgPerHa: 350,
        bagWeightKg: 50,
        basePricePerBagKz: 37000,
        applicationStage: '2 parcelas (início e meio das chuvas)',
      },
      {
        id: 'ureia-46',
        name: 'Ureia Granulada 46% N',
        formula: '46% Azoto (N)',
        kgPerHa: 120,
        bagWeightKg: 50,
        basePricePerBagKz: 34000,
        applicationStage: 'Pós-floração / enchimento do grão',
      },
      {
        id: 'calcario',
        name: 'Calcário Agrícola Dolomítico',
        formula: 'CaCO₃ + MgCO₃',
        kgPerHa: 500,
        bagWeightKg: 50,
        basePricePerBagKz: 12500,
        applicationStage: 'Correção de solo (pré-chuvas)',
      },
    ],
  },
  {
    id: 'tomate',
    name: 'Tomate / Hortícolas',
    scientificName: 'Solanum lycopersicum',
    cycleDays: '85 – 110 dias',
    expectedYieldTonPerHa: 30,
    seedRateLabel: '250 – 350 g/ha de semente (viveiro)',
    notes: 'O suplemento de cálcio reduz a podridão apical dos frutos e melhora a conservação pós-colheita.',
    fertilizers: [
      {
        id: 'npk-12-24-12',
        name: 'Adubo Composto NPK 12-24-12',
        formula: '12% N · 24% P₂O₅ · 12% K₂O',
        kgPerHa: 400,
        bagWeightKg: 50,
        basePricePerBagKz: 38500,
        applicationStage: 'Transplante (adubação de base)',
      },
      {
        id: 'nitrato-calcio',
        name: 'Nitrato de Cálcio Agrícola',
        formula: '15.5% N · 19% Ca',
        kgPerHa: 150,
        bagWeightKg: 25,
        basePricePerBagKz: 24500,
        applicationStage: 'Floração e frutificação',
      },
      {
        id: 'composto-organico',
        name: 'Adubo Orgânico / Composto',
        formula: 'Matéria Orgânica Estabilizada',
        kgPerHa: 1500,
        bagWeightKg: 50,
        basePricePerBagKz: 6500,
        applicationStage: 'Incorporação no preparo do canteiro',
      },
    ],
  },
  {
    id: 'banana',
    name: 'Banana',
    scientificName: 'Musa spp.',
    cycleDays: '10 – 12 meses (perene)',
    expectedYieldTonPerHa: 28,
    seedRateLabel: '1.600 – 2.000 rebentos / ha',
    notes: 'Elevada exigência em potássio para cachos pesados e boa doçura, com destaque em Bengo, Benguela e Cuanza Sul.',
    fertilizers: [
      {
        id: 'npk-15-15-15',
        name: 'Adubo Equilibrado NPK 15-15-15',
        formula: '15% N · 15% P₂O₅ · 15% K₂O',
        kgPerHa: 400,
        bagWeightKg: 50,
        basePricePerBagKz: 37000,
        applicationStage: 'Parcelado a cada 3 meses',
      },
      {
        id: 'kcl-60',
        name: 'Cloreto de Potássio (KCl)',
        formula: '60% K₂O',
        kgPerHa: 250,
        bagWeightKg: 50,
        basePricePerBagKz: 35500,
        applicationStage: 'Emissão do cacho / enchimento',
      },
      {
        id: 'ureia-46',
        name: 'Ureia Granulada 46% N',
        formula: '46% Azoto (N)',
        kgPerHa: 150,
        bagWeightKg: 50,
        basePricePerBagKz: 34000,
        applicationStage: 'Crescimento vegetativo',
      },
    ],
  },
  {
    id: 'arroz',
    name: 'Arroz',
    scientificName: 'Oryza sativa',
    cycleDays: '115 – 140 dias',
    expectedYieldTonPerHa: 4.0,
    seedRateLabel: '80 – 100 kg/ha de semente certificada',
    notes: 'Parcelar a ureia no afilhamento e na diferenciação da panícula para maximizar o enchimento dos grãos.',
    fertilizers: [
      {
        id: 'npk-12-24-12',
        name: 'Adubo Composto NPK 12-24-12',
        formula: '12% N · 24% P₂O₅ · 12% K₂O',
        kgPerHa: 250,
        bagWeightKg: 50,
        basePricePerBagKz: 38500,
        applicationStage: 'Adubação de fundo (sementeira)',
      },
      {
        id: 'ureia-46',
        name: 'Ureia Granulada 46% N',
        formula: '46% Azoto (N)',
        kgPerHa: 160,
        bagWeightKg: 50,
        basePricePerBagKz: 34000,
        applicationStage: 'Afilhamento (25d) e panícula (55d)',
      },
    ],
  },
];

// Fator de ajuste logístico regional de referência para insumos em Angola
const PROVINCE_LOGISTICS_FACTOR: Record<string, { factor: number; zoneLabel: string }> = {
  Luanda: { factor: 1.0, zoneLabel: 'Polo Portuário (Base)' },
  Bengo: { factor: 1.02, zoneLabel: 'Corredor Norte Próximo (+2%)' },
  Benguela: { factor: 1.0, zoneLabel: 'Polo Portuário Lobito (Base)' },
  'Cuanza Norte': { factor: 1.04, zoneLabel: 'Corredor Centro-Norte (+4%)' },
  'Cuanza Sul': { factor: 1.04, zoneLabel: 'Corredor Litoral-Centro (+4%)' },
  Huambo: { factor: 1.03, zoneLabel: 'Planalto Central / CFB (+3%)' },
  Huíla: { factor: 1.04, zoneLabel: 'Polo Sul (+4%)' },
  Namibe: { factor: 1.02, zoneLabel: 'Polo Portuário Sul (+2%)' },
  Bié: { factor: 1.06, zoneLabel: 'Planalto Central Interior (+6%)' },
  Malanje: { factor: 1.06, zoneLabel: 'Corredor Malanje (+6%)' },
  Uíge: { factor: 1.07, zoneLabel: 'Norte Interior (+7%)' },
  Zaire: { factor: 1.07, zoneLabel: 'Norte Litoral (+7%)' },
  Cabinda: { factor: 1.08, zoneLabel: 'Enclave Cabinda (+8%)' },
  Cunene: { factor: 1.09, zoneLabel: 'Extremo Sul (+9%)' },
  'Lunda Norte': { factor: 1.12, zoneLabel: 'Leste Interior (+12%)' },
  'Lunda Sul': { factor: 1.12, zoneLabel: 'Leste Interior (+12%)' },
  Moxico: { factor: 1.11, zoneLabel: 'Leste / CFB (+11%)' },
  'Cuando Cubango': { factor: 1.14, zoneLabel: 'Sudeste Interior (+14%)' },
};

const FERTILITY_MULTIPLIER: Record<SoilFertility, { mult: number; label: string; desc: string }> = {
  baixa: { mult: 1.2, label: 'Baixa (+20% dose)', desc: 'Solo cansado ou arenoso com défice nutricional' },
  media: { mult: 1.0, label: 'Média (Dose padrão)', desc: 'Solo agrícola em condições normais de cultivo' },
  alta: { mult: 0.85, label: 'Alta (-15% dose)', desc: 'Solo fértil ou com adubação orgânica recente' },
};

export const InputsCalculatorPanel: React.FC<InputsCalculatorPanelProps> = ({ user }) => {
  const [cropId, setCropId] = useState<string>('milho');
  const [areaInput, setAreaInput] = useState<string>('2');
  const [areaUnit, setAreaUnit] = useState<AreaUnit>('ha');
  const [province, setProvince] = useState<string>(user.province || 'Huambo');
  const [soilFertility, setSoilFertility] = useState<SoilFertility>('media');
  const [customBagPrices, setCustomBagPrices] = useState<Record<string, string>>({});
  const [marketListings, setMarketListings] = useState<Listing[]>([]);
  const [loadingMarket, setLoadingMarket] = useState<boolean>(true);

  useEffect(() => {
    let active = true;
    const loadLocalMarketReference = async () => {
      setLoadingMarket(true);
      try {
        const res = await apiRequest<{ listings: Listing[] }>('/api/public/overview');
        if (active && Array.isArray(res.listings)) {
          setMarketListings(res.listings.filter((l) => l.category === 'Produto Agrícola'));
        }
      } catch {
        // Offline or transient error: keep agronomic reference data working seamlessly
      } finally {
        if (active) setLoadingMarket(false);
      }
    };
    loadLocalMarketReference();
    return () => {
      active = false;
    };
  }, []);

  const selectedCrop = useMemo(
    () => CROP_PROFILES.find((c) => c.id === cropId) || CROP_PROFILES[0],
    [cropId]
  );

  const areaInHectares = useMemo(() => {
    const parsed = Number(areaInput.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return areaUnit === 'ha' ? parsed : parsed / 10000;
  }, [areaInput, areaUnit]);

  const provinceInfo = PROVINCE_LOGISTICS_FACTOR[province] || {
    factor: 1.05,
    zoneLabel: 'Referência Nacional (+5%)',
  };

  const fertilityInfo = FERTILITY_MULTIPLIER[soilFertility];

  const calculationRows = useMemo(() => {
    return selectedCrop.fertilizers.map((fert) => {
      const adjustedKgPerHa = Math.round(fert.kgPerHa * fertilityInfo.mult);
      const totalKg = Number((adjustedKgPerHa * areaInHectares).toFixed(1));
      const bagsNeeded = totalKg > 0 ? Math.ceil(totalKg / fert.bagWeightKg) : 0;
      const defaultRegionalBagPrice = Math.round((fert.basePricePerBagKz * provinceInfo.factor) / 500) * 500;
      const customStr = customBagPrices[fert.id];
      const parsedCustom = customStr !== undefined && customStr.trim() !== '' ? Number(customStr) : NaN;
      const unitBagPriceKz = Number.isFinite(parsedCustom) && parsedCustom > 0 ? parsedCustom : defaultRegionalBagPrice;
      const subtotalKz = bagsNeeded * unitBagPriceKz;

      return {
        ...fert,
        adjustedKgPerHa,
        totalKg,
        bagsNeeded,
        defaultRegionalBagPrice,
        unitBagPriceKz,
        subtotalKz,
      };
    });
  }, [selectedCrop, fertilityInfo.mult, areaInHectares, provinceInfo.factor, customBagPrices]);

  const totals = useMemo(() => {
    const totalKg = calculationRows.reduce((acc, r) => acc + r.totalKg, 0);
    const totalBags = calculationRows.reduce((acc, r) => acc + r.bagsNeeded, 0);
    const totalCostKz = calculationRows.reduce((acc, r) => acc + r.subtotalKz, 0);
    const expectedYieldTon = Number(
      (selectedCrop.expectedYieldTonPerHa * areaInHectares * (soilFertility === 'alta' ? 1.05 : 1)).toFixed(2)
    );
    return { totalKg, totalBags, totalCostKz, expectedYieldTon };
  }, [calculationRows, selectedCrop.expectedYieldTonPerHa, areaInHectares, soilFertility]);

  // Local marketplace reference data from real platform listings
  const localMarketStats = useMemo(() => {
    const norm = (v: string) =>
      v
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();

    const cropKeyword = norm(selectedCrop.name.split(' ')[0]);
    const provinceListings = marketListings.filter((l) => l.province === province);
    const cropMatches = marketListings.filter(
      (l) => norm(l.title).includes(cropKeyword) || norm(l.description).includes(cropKeyword)
    );
    const avg = (items: Listing[]) =>
      items.length > 0 ? Math.round(items.reduce((s, i) => s + Number(i.priceKz || 0), 0) / items.length) : null;

    return {
      totalAgriculturalListings: marketListings.length,
      provinceCount: provinceListings.length,
      provinceAvgKz: avg(provinceListings),
      cropMatchCount: cropMatches.length,
      cropMatchAvgKz: avg(cropMatches),
      sampleMatches: cropMatches.slice(0, 3),
    };
  }, [marketListings, province, selectedCrop.name]);

  const handleExportPlanCsv = () => {
    const escapeCsv = (val: unknown) => `"${String(val ?? '').replace(/"/g, '""')}"`;
    const headers = [
      'Cultura',
      'Província',
      'Área (ha)',
      'Fertilidade do Solo',
      'Insumo / Fertilizante',
      'Fórmula',
      'Dose (kg/ha)',
      'Total Necessário (kg)',
      'Embalagens (sacos)',
      'Peso por Saco (kg)',
      'Preço Referência/Saco (Kz)',
      'Subtotal Estimado (Kz)',
      'Momento de Aplicação',
    ];
    const lines = [
      headers.map(escapeCsv).join(','),
      ...calculationRows.map((row) =>
        [
          selectedCrop.name,
          province,
          areaInHectares.toFixed(2),
          fertilityInfo.label,
          row.name,
          row.formula,
          row.adjustedKgPerHa,
          row.totalKg,
          row.bagsNeeded,
          row.bagWeightKg,
          row.unitBagPriceKz,
          row.subtotalKz,
          row.applicationStage,
        ]
          .map(escapeCsv)
          .join(',')
      ),
    ];

    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nzila-agro-plano-insumos-${selectedCrop.id}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header Card + Configuration Form */}
      <div className="rounded-xl border border-[#DCE5DE] bg-white p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#EDF2EE] pb-4">
          <div>
            <h2 className="font-display text-lg font-bold text-[#111814] flex items-center gap-2">
              <Calculator className="w-5 h-5 text-[#15803D]" />
              Calculadora de Insumos Agrícolas
            </h2>
            <p className="text-xs text-[#546459] mt-0.5">
              Estime a quantidade ideal de fertilizantes e o orçamento de campanha com base na área cultivada, cultura e preços de referência locais em Angola.
            </p>
          </div>
          <button
            type="button"
            disabled={areaInHectares <= 0}
            onClick={handleExportPlanCsv}
            className="inline-flex items-center gap-2 rounded-lg bg-[#14532D] px-4 py-2 text-xs font-bold text-white hover:bg-[#15803D] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto"
          >
            <Download className="w-4 h-4" />
            Exportar Plano (CSV)
          </button>
        </div>

        {/* Input Controls Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#1C2720] mb-1.5">Tipo de Cultura</label>
            <select
              value={cropId}
              onChange={(e) => {
                setCropId(e.target.value);
                setCustomBagPrices({});
              }}
              className="w-full rounded-lg border border-[#D4DDD6] bg-white px-3 py-2.5 text-sm text-[#111814] focus:border-[#15803D] focus:outline-none"
            >
              {CROP_PROFILES.map((crop) => (
                <option key={crop.id} value={crop.id}>
                  {crop.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#1C2720] mb-1.5">Área Cultivada</label>
            <div className="flex rounded-lg border border-[#D4DDD6] overflow-hidden focus-within:border-[#15803D]">
              <input
                type="number"
                min="0.01"
                step="0.1"
                value={areaInput}
                onChange={(e) => setAreaInput(e.target.value)}
                placeholder="Ex: 2.5"
                className="w-full px-3 py-2.5 text-sm font-mono-tabular text-[#111814] focus:outline-none"
              />
              <select
                value={areaUnit}
                onChange={(e) => setAreaUnit(e.target.value as AreaUnit)}
                aria-label="Unidade de área"
                className="border-l border-[#D4DDD6] bg-[#F7F9F7] px-2.5 text-xs font-semibold text-[#14532D] focus:outline-none"
              >
                <option value="ha">ha</option>
                <option value="m2">m²</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#1C2720] mb-1.5">Província de Cultivo</label>
            <select
              value={province}
              onChange={(e) => {
                setProvince(e.target.value);
                setCustomBagPrices({});
              }}
              className="w-full rounded-lg border border-[#D4DDD6] bg-white px-3 py-2.5 text-sm text-[#111814] focus:border-[#15803D] focus:outline-none"
            >
              {ANGOLA_PROVINCES.map((prov) => (
                <option key={prov} value={prov}>
                  {prov}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#1C2720] mb-1.5">Fertilidade do Solo</label>
            <select
              value={soilFertility}
              onChange={(e) => setSoilFertility(e.target.value as SoilFertility)}
              className="w-full rounded-lg border border-[#D4DDD6] bg-white px-3 py-2.5 text-sm text-[#111814] focus:border-[#15803D] focus:outline-none"
            >
              <option value="baixa">Baixa (+20% dose)</option>
              <option value="media">Média (Dose padrão)</option>
              <option value="alta">Alta (-15% dose)</option>
            </select>
          </div>
        </div>

        {/* Crop Technical Strip */}
        <div className="rounded-lg border border-[#DCE5DE] bg-[#F7F9F7] p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-start gap-2 text-[#1C2720]">
            <Sprout className="w-4 h-4 text-[#15803D] shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-[#14532D]">{selectedCrop.name}</span>{' '}
              <span className="italic text-[#546459]">({selectedCrop.scientificName})</span> · Ciclo:{' '}
              <strong>{selectedCrop.cycleDays}</strong> · Sementeira: <strong>{selectedCrop.seedRateLabel}</strong>
            </div>
          </div>
          <div className="inline-flex items-center gap-1 text-[#14532D] font-semibold shrink-0">
            <MapPin className="w-3.5 h-3.5 text-[#CA8A04]" />
            {province}: {provinceInfo.zoneLabel}
          </div>
        </div>
      </div>

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-[#DCE5DE] bg-white p-4">
          <div className="text-xs font-medium text-[#546459]">Área Efetiva</div>
          <div className="mt-1 font-display text-2xl font-extrabold text-[#111814] font-mono-tabular">
            {areaInHectares.toFixed(2)} ha
          </div>
          <div className="mt-0.5 text-[11px] text-[#546459] font-mono-tabular">
            {Math.round(areaInHectares * 10000).toLocaleString('pt-AO')} m²
          </div>
        </div>

        <div className="rounded-xl border border-[#DCE5DE] bg-white p-4">
          <div className="text-xs font-medium text-[#546459]">Fertilizante Total</div>
          <div className="mt-1 font-display text-2xl font-extrabold text-[#14532D] font-mono-tabular">
            {totals.totalKg.toLocaleString('pt-AO')} kg
          </div>
          <div className="mt-0.5 text-[11px] text-[#546459] font-mono-tabular">
            {totals.totalBags} {totals.totalBags === 1 ? 'saco comercial' : 'sacos comerciais'}
          </div>
        </div>

        <div className="rounded-xl border border-[#DCE5DE] bg-white p-4">
          <div className="text-xs font-medium text-[#546459]">Custo Estimado de Insumos</div>
          <div className="mt-1 font-display text-2xl font-extrabold text-[#CA8A04] font-mono-tabular">
            {formatCurrency(totals.totalCostKz, 'AOA')}
          </div>
          <div className="mt-0.5 text-[11px] text-[#546459]">
            Referência regional · {province}
          </div>
        </div>

        <div className="rounded-xl border border-[#DCE5DE] bg-white p-4">
          <div className="text-xs font-medium text-[#546459]">Colheita Estimada</div>
          <div className="mt-1 font-display text-2xl font-extrabold text-[#15803D] font-mono-tabular">
            {totals.expectedYieldTon} t
          </div>
          <div className="mt-0.5 text-[11px] text-[#546459] font-mono-tabular">
            ~{selectedCrop.expectedYieldTonPerHa} t/ha em bom maneio
          </div>
        </div>
      </div>

      {/* Fertilizer Recommendation Table */}
      <div className="rounded-xl border border-[#DCE5DE] bg-white p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-base font-bold text-[#111814] flex items-center gap-2">
              <Leaf className="w-4 h-4 text-[#15803D]" />
              Plano Recomendado de Fertilização
            </h3>
            <p className="text-xs text-[#546459] mt-0.5">
              Pode ajustar o preço unitário por saco caso tenha cotação específica do seu fornecedor local.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#E5ECE6] bg-[#F7F9F7] text-[#546459]">
              <tr>
                <th className="px-3 py-2.5 font-semibold">Fertilizante / Insumo</th>
                <th className="px-3 py-2.5 font-semibold text-right">Dose (kg/ha)</th>
                <th className="px-3 py-2.5 font-semibold text-right">Qtd. Total</th>
                <th className="px-3 py-2.5 font-semibold text-right">Embalagens</th>
                <th className="px-3 py-2.5 font-semibold text-right">Preço Ref. / Saco (Kz)</th>
                <th className="px-3 py-2.5 font-semibold text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EDF2EE]">
              {calculationRows.map((row) => (
                <tr key={row.id} className="hover:bg-[#FAFDFB]">
                  <td className="px-3 py-3">
                    <div className="font-bold text-[#111814]">{row.name}</div>
                    <div className="text-[11px] text-[#546459]">
                      {row.formula} · <span className="text-[#14532D] font-medium">{row.applicationStage}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right font-mono-tabular text-[#1C2720]">
                    {row.adjustedKgPerHa} kg
                  </td>
                  <td className="px-3 py-3 text-right font-mono-tabular font-bold text-[#14532D]">
                    {row.totalKg.toLocaleString('pt-AO')} kg
                  </td>
                  <td className="px-3 py-3 text-right font-mono-tabular text-[#111814]">
                    <strong>{row.bagsNeeded}</strong> × {row.bagWeightKg}kg
                  </td>
                  <td className="px-3 py-3 text-right">
                    <input
                      type="number"
                      min="1000"
                      step="500"
                      value={customBagPrices[row.id] ?? String(row.defaultRegionalBagPrice)}
                      onChange={(e) =>
                        setCustomBagPrices((prev) => ({ ...prev, [row.id]: e.target.value }))
                      }
                      aria-label={`Preço por saco de ${row.name} em Kwanzas`}
                      className="w-28 rounded-md border border-[#D4DDD6] bg-white px-2 py-1 text-right font-mono-tabular text-xs text-[#111814] focus:border-[#15803D] focus:outline-none"
                    />
                  </td>
                  <td className="px-3 py-3 text-right font-mono-tabular font-bold text-[#111814]">
                    {formatCurrency(row.subtotalKz, 'AOA')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-lg border border-[#EAB308]/40 bg-[#FEFCE8] px-4 py-3 text-xs text-[#713F12] flex items-start gap-2.5">
          <Info className="w-4 h-4 text-[#CA8A04] shrink-0 mt-0.5" />
          <div>
            <strong>Recomendação agronómica:</strong> {selectedCrop.notes}
          </div>
        </div>
      </div>

      {/* Local Market Reference Card (integrated with live platform listings) */}
      <div className="rounded-xl border border-[#DCE5DE] bg-white p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-base font-bold text-[#111814] flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#15803D]" />
              Dados de Referência do Mercado Local ({province})
            </h3>
            <p className="text-xs text-[#546459] mt-0.5">
              Indicadores cruzados com as ofertas agrícolas publicadas atualmente na plataforma Nzila Agro.
            </p>
          </div>
          {loadingMarket && <span className="text-xs text-[#546459]">A sincronizar vitrine...</span>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-lg border border-[#E5ECE6] bg-[#F7F9F7] p-4">
            <div className="text-[11px] font-medium text-[#546459]">Ofertas Agrícolas em {province}</div>
            <div className="mt-1 font-display text-xl font-extrabold text-[#111814] font-mono-tabular">
              {localMarketStats.provinceCount}
            </div>
            <div className="mt-0.5 text-[11px] text-[#546459]">
              {localMarketStats.provinceAvgKz !== null
                ? `Preço médio local: ${formatCurrency(localMarketStats.provinceAvgKz, 'AOA')}`
                : 'Sem anúncios ativos nesta província'}
            </div>
          </div>

          <div className="rounded-lg border border-[#E5ECE6] bg-[#F7F9F7] p-4">
            <div className="text-[11px] font-medium text-[#546459]">
              Anúncios Relacionados ({selectedCrop.name})
            </div>
            <div className="mt-1 font-display text-xl font-extrabold text-[#14532D] font-mono-tabular">
              {localMarketStats.cropMatchCount}
            </div>
            <div className="mt-0.5 text-[11px] text-[#546459]">
              {localMarketStats.cropMatchAvgKz !== null
                ? `Preço médio na vitrine: ${formatCurrency(localMarketStats.cropMatchAvgKz, 'AOA')}`
                : 'Sem listagens desta cultura no momento'}
            </div>
          </div>

          <div className="rounded-lg border border-[#E5ECE6] bg-[#F7F9F7] p-4">
            <div className="text-[11px] font-medium text-[#546459]">Custo de Insumos por Hectare</div>
            <div className="mt-1 font-display text-xl font-extrabold text-[#CA8A04] font-mono-tabular">
              {areaInHectares > 0
                ? formatCurrency(Math.round(totals.totalCostKz / areaInHectares), 'AOA')
                : '—'}
            </div>
            <div className="mt-0.5 text-[11px] text-[#546459]">
              Referência por ha ({fertilityInfo.label})
            </div>
          </div>
        </div>

        {localMarketStats.sampleMatches.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-[#EDF2EE]">
            <div className="text-xs font-semibold text-[#1C2720]">
              Exemplos de preços praticados na plataforma para {selectedCrop.name}:
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {localMarketStats.sampleMatches.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-[#DCE5DE] bg-[#FAFDFB] px-3.5 py-2.5 text-xs flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-[#111814] truncate">{item.title}</div>
                    <div className="text-[11px] text-[#546459] truncate">
                      {item.province} · {item.unit}
                    </div>
                  </div>
                  <div className="font-mono-tabular font-bold text-[#14532D] shrink-0">
                    {formatCurrency(item.priceKz, 'AOA')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
