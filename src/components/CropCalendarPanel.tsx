import React, { useMemo, useState } from 'react';
import { CalendarDays, CloudRain, MapPin, Sprout, Sun } from 'lucide-react';
import type { User } from '../types';

interface CropCalendarPanelProps {
  user: User;
}

type MonthAction = 'plant' | 'harvest' | 'both' | 'grow';
type ActivityFilter = 'all' | 'plant' | 'harvest';

interface CropCalendarEntry {
  id: string;
  name: string;
  scientificName: string;
  cycleLabel: string;
  mainProvinces: string[];
  plantingMonths: number[]; // 1..12
  harvestMonths: number[]; // 1..12
  waterNeed: string;
  agronomicTip: string;
}

const MONTHS_PT = [
  { num: 1, short: 'Jan', full: 'Janeiro', season: 'Chuvas' },
  { num: 2, short: 'Fev', full: 'Fevereiro', season: 'Chuvas' },
  { num: 3, short: 'Mar', full: 'Março', season: 'Chuvas' },
  { num: 4, short: 'Abr', full: 'Abril', season: 'Transição' },
  { num: 5, short: 'Mai', full: 'Maio', season: 'Cacimbo' },
  { num: 6, short: 'Jun', full: 'Junho', season: 'Cacimbo' },
  { num: 7, short: 'Jul', full: 'Julho', season: 'Cacimbo' },
  { num: 8, short: 'Ago', full: 'Agosto', season: 'Cacimbo' },
  { num: 9, short: 'Set', full: 'Setembro', season: 'Chuvas' },
  { num: 10, short: 'Out', full: 'Outubro', season: 'Chuvas' },
  { num: 11, short: 'Nov', full: 'Novembro', season: 'Chuvas' },
  { num: 12, short: 'Dez', full: 'Dezembro', season: 'Chuvas' },
] as const;

const ANGOLA_CROP_CALENDAR: CropCalendarEntry[] = [
  {
    id: 'milho',
    name: 'Milho',
    scientificName: 'Zea mays',
    cycleLabel: '110 – 130 dias',
    mainProvinces: ['Huambo', 'Bié', 'Huíla', 'Cuanza Sul', 'Malanje'],
    plantingMonths: [9, 10, 11, 2],
    harvestMonths: [1, 2, 3, 5, 6],
    waterNeed: '500 – 800 mm / ciclo',
    agronomicTip: 'A 1ª época (Set–Nov) aproveita as chuvas principais; no Planalto Central pode-se fazer 2ª época em Fevereiro.',
  },
  {
    id: 'mandioca',
    name: 'Mandioca',
    scientificName: 'Manihot esculenta',
    cycleLabel: '10 – 14 meses',
    mainProvinces: ['Uíge', 'Malanje', 'Cuanza Norte', 'Bengo', 'Zaire', 'Moxico'],
    plantingMonths: [10, 11, 12],
    harvestMonths: [7, 8, 9, 10, 11],
    waterNeed: 'Tolerante à seca',
    agronomicTip: 'Plantar estacas sadias no início das chuvas para garantir enraizamento forte antes do cacimbo.',
  },
  {
    id: 'feijao',
    name: 'Feijão',
    scientificName: 'Phaseolus vulgaris',
    cycleLabel: '75 – 95 dias',
    mainProvinces: ['Huambo', 'Bié', 'Cuanza Sul', 'Huíla', 'Uíge'],
    plantingMonths: [9, 10, 2, 3],
    harvestMonths: [12, 1, 5, 6],
    waterNeed: '350 – 500 mm / ciclo',
    agronomicTip: 'A 2ª época (Fev–Mar) produz grão com menos humidade na colheita, facilitando a secagem e conservação.',
  },
  {
    id: 'batata-rena',
    name: 'Batata Rena',
    scientificName: 'Solanum tuberosum',
    cycleLabel: '95 – 120 dias',
    mainProvinces: ['Huambo', 'Huíla', 'Bié', 'Benguela'],
    plantingMonths: [10, 11, 5, 6],
    harvestMonths: [1, 2, 8, 9],
    waterNeed: 'Irrigação regular no cacimbo',
    agronomicTip: 'A campanha de cacimbo (Mai–Jun com rega) apresenta menor incidência de míldio e excelente qualidade comercial.',
  },
  {
    id: 'batata-doce',
    name: 'Batata Doce',
    scientificName: 'Ipomoea batatas',
    cycleLabel: '100 – 130 dias',
    mainProvinces: ['Bengo', 'Malanje', 'Cuanza Sul', 'Huambo', 'Bié'],
    plantingMonths: [10, 11, 12, 5, 6],
    harvestMonths: [2, 3, 4, 9, 10],
    waterNeed: 'Moderada',
    agronomicTip: 'Cultura rústica de ótimo rendimento em solos bem drenados; usar ramas jovens e vigorosas.',
  },
  {
    id: 'cafe',
    name: 'Café (Robusta / Arábica)',
    scientificName: 'Coffea spp.',
    cycleLabel: 'Cultura perene',
    mainProvinces: ['Uíge', 'Cuanza Sul', 'Cuanza Norte', 'Bengo', 'Huambo'],
    plantingMonths: [11, 12, 1],
    harvestMonths: [5, 6, 7, 8],
    waterNeed: '1.200 – 1.800 mm / ano',
    agronomicTip: 'Transplantar mudas no auge das chuvas; colheita seletiva dos frutos maduros (cereja) durante o cacimbo.',
  },
  {
    id: 'tomate',
    name: 'Tomate',
    scientificName: 'Solanum lycopersicum',
    cycleLabel: '85 – 110 dias',
    mainProvinces: ['Benguela', 'Bengo', 'Cuanza Sul', 'Huíla', 'Luanda'],
    plantingMonths: [4, 5, 6, 7, 9],
    harvestMonths: [7, 8, 9, 10, 12],
    waterNeed: 'Rega controlada (gota-a-gota)',
    agronomicTip: 'O cacimbo (Abr–Jul) oferece temperaturas amenas e menos doenças fúngicas, ideal para alta produtividade.',
  },
  {
    id: 'banana',
    name: 'Banana',
    scientificName: 'Musa spp.',
    cycleLabel: '10 – 12 meses (perene)',
    mainProvinces: ['Bengo', 'Benguela', 'Cuanza Sul', 'Cabinda', 'Uíge'],
    plantingMonths: [10, 11, 12, 1],
    harvestMonths: [3, 4, 5, 6, 7, 8],
    waterNeed: 'Elevada / constante',
    agronomicTip: 'Estabelecer novos bananais nas chuvas; com irrigação adequada a colheita decorre quase todo o ano.',
  },
  {
    id: 'arroz',
    name: 'Arroz',
    scientificName: 'Oryza sativa',
    cycleLabel: '115 – 140 dias',
    mainProvinces: ['Bié', 'Moxico', 'Malanje', 'Cuando Cubango', 'Lunda Sul'],
    plantingMonths: [10, 11, 12],
    harvestMonths: [3, 4, 5],
    waterNeed: 'Alta (várzeas / alagado)',
    agronomicTip: 'Aproveitar as baixas húmidas e chanas alagáveis no início da estação chuvosa.',
  },
  {
    id: 'ginguba',
    name: 'Amendoim (Ginguba)',
    scientificName: 'Arachis hypogaea',
    cycleLabel: '95 – 120 dias',
    mainProvinces: ['Uíge', 'Malanje', 'Cuanza Norte', 'Bié', 'Huíla'],
    plantingMonths: [9, 10, 11],
    harvestMonths: [1, 2, 3],
    waterNeed: '450 – 650 mm / ciclo',
    agronomicTip: 'Prefere solos franco-arenosos soltos para facilitar a penetração dos frutos e a colheita limpa.',
  },
];

function getMonthAction(crop: CropCalendarEntry, monthNum: number): MonthAction {
  const isPlant = crop.plantingMonths.includes(monthNum);
  const isHarvest = crop.harvestMonths.includes(monthNum);
  if (isPlant && isHarvest) return 'both';
  if (isPlant) return 'plant';
  if (isHarvest) return 'harvest';
  return 'grow';
}

export const CropCalendarPanel: React.FC<CropCalendarPanelProps> = ({ user }) => {
  const realCurrentMonth = new Date().getMonth() + 1; // 1..12
  const [selectedMonth, setSelectedMonth] = useState<number>(realCurrentMonth);
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all');
  const [onlyMyProvince, setOnlyMyProvince] = useState<boolean>(false);

  const selectedMonthMeta = MONTHS_PT.find((m) => m.num === selectedMonth) || MONTHS_PT[0];

  const monthSummary = useMemo(() => {
    const plantNow = ANGOLA_CROP_CALENDAR.filter((c) => c.plantingMonths.includes(selectedMonth));
    const harvestNow = ANGOLA_CROP_CALENDAR.filter((c) => c.harvestMonths.includes(selectedMonth));
    return { plantNow, harvestNow };
  }, [selectedMonth]);

  const filteredCrops = useMemo(() => {
    return ANGOLA_CROP_CALENDAR.filter((crop) => {
      if (onlyMyProvince && user.province && !crop.mainProvinces.includes(user.province)) {
        return false;
      }
      if (activityFilter === 'plant') return crop.plantingMonths.includes(selectedMonth);
      if (activityFilter === 'harvest') return crop.harvestMonths.includes(selectedMonth);
      return true;
    });
  }, [activityFilter, onlyMyProvince, selectedMonth, user.province]);

  const isRainySeason = selectedMonthMeta.season === 'Chuvas';

  return (
    <div className="space-y-6">
      {/* Header & Month Selector */}
      <div className="rounded-xl border border-[#DCE5DE] bg-white p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#EDF2EE] pb-4">
          <div>
            <h2 className="font-display text-lg font-bold text-[#111814] flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-[#15803D]" />
              Calendário de Cultivo de Angola
            </h2>
            <p className="text-xs text-[#546459] mt-0.5">
              Consulte os melhores períodos de plantio e colheita das principais culturas angolanas conforme o mês atual.
            </p>
          </div>

          <div className="inline-flex items-center gap-2 rounded-lg border border-[#DCE5DE] bg-[#F2F7F3] px-3 py-1.5 text-xs font-semibold text-[#14532D] shrink-0 self-start sm:self-auto">
            {isRainySeason ? (
              <CloudRain className="w-4 h-4 text-[#15803D]" />
            ) : (
              <Sun className="w-4 h-4 text-[#CA8A04]" />
            )}
            <span>
              {selectedMonthMeta.full}: Época {selectedMonthMeta.season === 'Cacimbo' ? 'Seca (Cacimbo)' : selectedMonthMeta.season === 'Transição' ? 'de Transição' : 'das Chuvas'}
            </span>
          </div>
        </div>

        {/* 12-Month Interactive Selector */}
        <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-12 gap-1.5">
          {MONTHS_PT.map((m) => {
            const isSelected = m.num === selectedMonth;
            const isRealNow = m.num === realCurrentMonth;
            return (
              <button
                key={m.num}
                type="button"
                onClick={() => setSelectedMonth(m.num)}
                className={`relative rounded-lg border px-2 py-2 text-xs font-semibold transition-colors ${
                  isSelected
                    ? 'border-[#14532D] bg-[#14532D] text-white'
                    : 'border-[#DCE5DE] bg-[#F7F9F7] text-[#1C2720] hover:border-[#15803D]'
                }`}
              >
                <div>{m.short}</div>
                {isRealNow && (
                  <div
                    className={`text-[9px] font-bold mt-0.5 ${
                      isSelected ? 'text-[#FACC15]' : 'text-[#15803D]'
                    }`}
                  >
                    Atual
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Selected Month Summary Strip */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-[#15803D]/30 bg-[#EEF7F0] p-4 space-y-2">
            <div className="text-xs font-bold text-[#14532D] flex items-center gap-1.5">
              <Sprout className="w-4 h-4 text-[#15803D]" />
              Ideal para Plantio em {selectedMonthMeta.full} ({monthSummary.plantNow.length})
            </div>
            {monthSummary.plantNow.length === 0 ? (
              <p className="text-xs text-[#546459]">
                Período focado em manutenção e preparação de solos para a próxima campanha.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {monthSummary.plantNow.map((c) => (
                  <span
                    key={c.id}
                    className="rounded-md bg-white border border-[#15803D]/30 px-2.5 py-1 text-xs font-semibold text-[#14532D]"
                  >
                    {c.name}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-[#EAB308]/50 bg-[#FEFCE8] p-4 space-y-2">
            <div className="text-xs font-bold text-[#713F12] flex items-center gap-1.5">
              <Sun className="w-4 h-4 text-[#CA8A04]" />
              Período de Colheita em {selectedMonthMeta.full} ({monthSummary.harvestNow.length})
            </div>
            {monthSummary.harvestNow.length === 0 ? (
              <p className="text-xs text-[#713F12]">
                Sem picos principais de colheita neste mês; foque na adubação e controlo de pragas.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {monthSummary.harvestNow.map((c) => (
                  <span
                    key={c.id}
                    className="rounded-md bg-white border border-[#EAB308]/60 px-2.5 py-1 text-xs font-semibold text-[#713F12]"
                  >
                    {c.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Annual 12-Month Matrix Card */}
      <div className="rounded-xl border border-[#DCE5DE] bg-white p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-base font-bold text-[#111814]">
              Matriz Anual de Plantio e Colheita
            </h3>
            <p className="text-xs text-[#546459] mt-0.5">
              A coluna destacada corresponde a <strong>{selectedMonthMeta.full}</strong>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg bg-[#F2F7F3] p-1 border border-[#DCE5DE]">
              {([
                { id: 'all', label: 'Todas' },
                { id: 'plant', label: `Plantar em ${selectedMonthMeta.short}` },
                { id: 'harvest', label: `Colher em ${selectedMonthMeta.short}` },
              ] as const).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setActivityFilter(opt.id)}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
                    activityFilter === opt.id
                      ? 'bg-[#14532D] text-white'
                      : 'text-[#445449] hover:text-[#111814]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {user.province && (
              <label className="inline-flex items-center gap-1.5 rounded-lg border border-[#D4DDD6] bg-white px-2.5 py-1.5 text-xs font-medium text-[#1C2720] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={onlyMyProvince}
                  onChange={(e) => setOnlyMyProvince(e.target.checked)}
                  className="accent-[#15803D]"
                />
                <span>Destaque em {user.province}</span>
              </label>
            )}
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 text-[11px] text-[#546459]">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3.5 h-3.5 rounded-sm bg-[#15803D]" />
            <strong>P</strong> — Plantio / Sementeira
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3.5 h-3.5 rounded-sm bg-[#EAB308]" />
            <strong>C</strong> — Colheita
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3.5 h-3.5 rounded-sm bg-[#14532D] border border-[#FACC15]" />
            <strong>P/C</strong> — Plantio e Colheita (2 épocas)
          </span>
        </div>

        {filteredCrops.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#C7D3CA] bg-[#F7F9F7] p-6 text-center text-xs text-[#546459]">
            Nenhuma cultura corresponde aos filtros selecionados. Desative o filtro provincial ou escolha outro mês.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#E5ECE6] text-[#546459]">
                  <th className="py-2.5 pr-3 font-semibold min-w-[150px]">Cultura</th>
                  {MONTHS_PT.map((m) => (
                    <th
                      key={m.num}
                      className={`px-1 py-2.5 text-center font-semibold cursor-pointer ${
                        m.num === selectedMonth
                          ? 'bg-[#EEF7F0] text-[#14532D] font-bold'
                          : ''
                      }`}
                      onClick={() => setSelectedMonth(m.num)}
                    >
                      {m.short}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EDF2EE]">
                {filteredCrops.map((crop) => (
                  <tr key={crop.id} className="hover:bg-[#FAFDFB]">
                    <td className="py-2.5 pr-3">
                      <div className="font-bold text-[#111814]">{crop.name}</div>
                      <div className="text-[10px] text-[#546459]">{crop.cycleLabel}</div>
                    </td>
                    {MONTHS_PT.map((m) => {
                      const action = getMonthAction(crop, m.num);
                      const isCurrentCol = m.num === selectedMonth;
                      return (
                        <td
                          key={m.num}
                          className={`px-1 py-2 text-center ${
                            isCurrentCol ? 'bg-[#EEF7F0]/70' : ''
                          }`}
                        >
                          {action === 'plant' && (
                            <span
                              title={`Plantio de ${crop.name} em ${m.full}`}
                              className="inline-flex h-6 w-7 items-center justify-center rounded bg-[#15803D] text-[10px] font-bold text-white"
                            >
                              P
                            </span>
                          )}
                          {action === 'harvest' && (
                            <span
                              title={`Colheita de ${crop.name} em ${m.full}`}
                              className="inline-flex h-6 w-7 items-center justify-center rounded bg-[#EAB308] text-[10px] font-bold text-[#111814]"
                            >
                              C
                            </span>
                          )}
                          {action === 'both' && (
                            <span
                              title={`Plantio e Colheita de ${crop.name} em ${m.full}`}
                              className="inline-flex h-6 w-7 items-center justify-center rounded bg-[#14532D] text-[9px] font-bold text-[#FACC15] border border-[#FACC15]"
                            >
                              P/C
                            </span>
                          )}
                          {action === 'grow' && (
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#DCE5DE]" />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Agronomic Guidance Cards */}
      {filteredCrops.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredCrops.map((crop) => {
            const action = getMonthAction(crop, selectedMonth);
            const badgeText =
              action === 'both'
                ? 'Plantio & Colheita'
                : action === 'plant'
                ? 'Época de Plantio'
                : action === 'harvest'
                ? 'Época de Colheita'
                : 'Desenvolvimento';
            const badgeColor =
              action === 'plant' || action === 'both'
                ? 'text-[#15803D]'
                : action === 'harvest'
                ? 'text-[#B45309]'
                : 'text-[#546459]';

            return (
              <div
                key={crop.id}
                className="rounded-xl border border-[#DCE5DE] bg-white p-4 space-y-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="font-display text-sm font-bold text-[#111814]">
                      {crop.name}{' '}
                      <span className="font-normal italic text-xs text-[#546459]">
                        ({crop.scientificName})
                      </span>
                    </h4>
                    <div className="text-[11px] text-[#546459]">
                      Ciclo: <strong>{crop.cycleLabel}</strong> · Água: {crop.waterNeed}
                    </div>
                  </div>
                  <span className={`text-[11px] font-bold shrink-0 ${badgeColor}`}>
                    {badgeText}
                  </span>
                </div>

                <p className="text-xs text-[#1C2720] leading-relaxed">{crop.agronomicTip}</p>

                <div className="flex items-center gap-1.5 text-[11px] text-[#546459] pt-1.5 border-t border-[#EDF2EE]">
                  <MapPin className="w-3.5 h-3.5 text-[#15803D] shrink-0" />
                  <span className="truncate">Polos: {crop.mainProvinces.join(', ')}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
