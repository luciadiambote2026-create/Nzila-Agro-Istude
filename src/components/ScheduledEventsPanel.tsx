import React, { useEffect, useState } from 'react';
import {
  Calendar,
  CalendarPlus,
  Clock,
  Download,
  ExternalLink,
  MapPin,
  Trash2,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import {
  buildGoogleCalendarUrl,
  exportAllEventsToIcs,
  exportSingleEventToIcs,
  ScheduledEventItem,
} from '../lib/icsExport';
import type { User } from '../types';

interface ScheduledEventsPanelProps {
  user: User;
}

const EVENT_TYPES = [
  'Colheita',
  'Reunião',
  'Entrega de Produção',
  'Aplicação de Insumos',
  'Visita Técnica',
] as const;

const REMINDER_OPTIONS = [
  { value: 0, label: 'Sem lembrete' },
  { value: 15, label: '15 minutos antes' },
  { value: 30, label: '30 minutos antes' },
  { value: 60, label: '1 hora antes' },
  { value: 1440, label: '1 dia antes' },
] as const;

export const ScheduledEventsPanel: React.FC<ScheduledEventsPanelProps> = ({ user }) => {
  const todayIso = new Date().toISOString().slice(0, 10);

  const [events, setEvents] = useState<ScheduledEventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState('');
  const [eventType, setEventType] = useState<string>('Colheita');
  const [eventDate, setEventDate] = useState(todayIso);
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('10:00');
  const [location, setLocation] = useState(user.province || '');
  const [description, setDescription] = useState('');
  const [reminderMinutes, setReminderMinutes] = useState<number>(30);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const loadEvents = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ events: ScheduledEventItem[] }>('/api/users/events');
      setEvents(res.events);
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao carregar eventos agendados.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, []);

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setSaving(true);
    try {
      await apiRequest('/api/users/events', {
        method: 'POST',
        body: JSON.stringify({
          title,
          eventType,
          eventDate,
          startTime,
          endTime,
          location,
          description,
          reminderMinutes,
        }),
      });
      setTitle('');
      setDescription('');
      setFeedback({
        type: 'ok',
        text: 'Evento agendado com sucesso. Pode agora exportar o ficheiro .ics para o Google Calendar ou Outlook.',
      });
      await loadEvents();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao agendar evento.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEvent = async (id: number) => {
    try {
      await apiRequest(`/api/users/events/${id}`, { method: 'DELETE' });
      setEvents((prev) => prev.filter((ev) => ev.id !== id));
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao eliminar evento.',
      });
    }
  };

  const handleExportOne = (ev: ScheduledEventItem) => {
    const filename = exportSingleEventToIcs(ev);
    setFeedback({
      type: 'ok',
      text: `Ficheiro "${filename}" exportado. Abra-o no Google Calendar, Outlook ou Apple Calendar.`,
    });
  };

  const handleExportAll = () => {
    if (events.length === 0) return;
    const filename = exportAllEventsToIcs(events);
    setFeedback({
      type: 'ok',
      text: `Agenda completa "${filename}" (${events.length} eventos) exportada em formato .ics.`,
    });
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

      {/* Schedule Event Form */}
      <form onSubmit={handleCreateEvent} className="rounded-xl border border-[#DCE5DE] bg-white p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#EDF2EE] pb-4">
          <div>
            <h2 className="font-display text-lg font-bold text-[#111814] flex items-center gap-2">
              <Calendar className="w-5 h-5 text-[#15803D]" />
              Agenda Agrícola & Exportação (.ICS)
            </h2>
            <p className="text-xs text-[#546459] mt-0.5">
              Agende colheitas, reuniões ou entregas e exporte ficheiros <strong>.ics</strong> compatíveis com Google Calendar e Outlook.
            </p>
          </div>
          {events.length > 0 && (
            <button
              type="button"
              onClick={handleExportAll}
              className="inline-flex items-center gap-2 rounded-lg bg-[#14532D] px-3.5 py-2 text-xs font-bold text-white hover:bg-[#15803D] transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto"
            >
              <Download className="w-3.5 h-3.5" />
              Exportar Todos (.ICS · {events.length})
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-[#1C2720] mb-1">
              Título do Compromisso *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Colheita de Milho — Parcela Norte / Reunião com Comprador"
              className="w-full rounded-lg border border-[#D4DDD6] px-3.5 py-2 text-sm text-[#111814] focus:border-[#15803D] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#1C2720] mb-1">Tipo de Evento</label>
            <select
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              className="w-full rounded-lg border border-[#D4DDD6] bg-white px-3 py-2 text-sm text-[#111814] focus:border-[#15803D] focus:outline-none"
            >
              {EVENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#1C2720] mb-1">Data *</label>
            <input
              type="date"
              required
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="w-full rounded-lg border border-[#D4DDD6] px-3 py-2 text-sm font-mono-tabular text-[#111814] focus:border-[#15803D] focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-semibold text-[#1C2720] mb-1">Início</label>
              <input
                type="time"
                required
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full rounded-lg border border-[#D4DDD6] px-2.5 py-2 text-sm font-mono-tabular text-[#111814] focus:border-[#15803D] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#1C2720] mb-1">Fim</label>
              <input
                type="time"
                required
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full rounded-lg border border-[#D4DDD6] px-2.5 py-2 text-sm font-mono-tabular text-[#111814] focus:border-[#15803D] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#1C2720] mb-1">Lembrete no Calendário</label>
            <select
              value={reminderMinutes}
              onChange={(e) => setReminderMinutes(Number(e.target.value))}
              className="w-full rounded-lg border border-[#D4DDD6] bg-white px-3 py-2 text-sm text-[#111814] focus:border-[#15803D] focus:outline-none"
            >
              {REMINDER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2 lg:col-span-3">
            <label className="block text-xs font-semibold text-[#1C2720] mb-1">Local / Fazenda / Município</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder={`Ex: Fazenda Kianda, ${user.province}`}
              className="w-full rounded-lg border border-[#D4DDD6] px-3.5 py-2 text-sm text-[#111814] focus:border-[#15803D] focus:outline-none"
            />
          </div>

          <div className="sm:col-span-2 lg:col-span-3">
            <label className="block text-xs font-semibold text-[#1C2720] mb-1">Notas / Detalhes</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Equipa necessária, contacto do comprador, número de sacos previstos..."
              className="w-full rounded-lg border border-[#D4DDD6] px-3.5 py-2 text-sm text-[#111814] focus:border-[#15803D] focus:outline-none"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-[#14532D] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#15803D] disabled:opacity-50 transition-colors"
          >
            <CalendarPlus className="w-4 h-4" />
            {saving ? 'A agendar...' : 'Agendar Evento'}
          </button>
        </div>
      </form>

      {/* Scheduled Events List */}
      <div className="rounded-xl border border-[#DCE5DE] bg-white p-6 space-y-4">
        <h3 className="font-display text-base font-bold text-[#111814]">
          Eventos Agendados ({events.length})
        </h3>

        {loading ? (
          <p className="text-xs text-[#546459]">A carregar agenda...</p>
        ) : events.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#C7D3CA] bg-[#F7F9F7] p-6 text-center text-xs text-[#546459]">
            Ainda não tem eventos agendados. Crie acima uma colheita, reunião ou entrega para gerar o ficheiro <strong>.ics</strong>.
          </div>
        ) : (
          <div className="divide-y divide-[#EDF2EE]">
            {events.map((ev) => {
              const isPast = ev.eventDate < todayIso;
              return (
                <div
                  key={ev.id}
                  className="py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-bold text-[#14532D]">{ev.eventType}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-tabular font-semibold text-[#111814]">
                        {new Date(`${ev.eventDate}T12:00:00`).toLocaleDateString('pt-AO')}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[#546459] font-mono-tabular">
                        <Clock className="w-3 h-3" />
                        {ev.startTime} – {ev.endTime}
                      </span>
                      {isPast && (
                        <span className="text-[11px] font-semibold text-[#B45309]">(Concluído)</span>
                      )}
                    </div>

                    <h4 className="font-display text-sm font-bold text-[#111814]">{ev.title}</h4>

                    {ev.location && (
                      <div className="inline-flex items-center gap-1 text-xs text-[#546459]">
                        <MapPin className="w-3.5 h-3.5 text-[#15803D]" />
                        {ev.location}
                      </div>
                    )}

                    {ev.description && (
                      <p className="text-xs text-[#445449]">{ev.description}</p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleExportOne(ev)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#14532D]/30 bg-[#F2F7F3] px-3 py-1.5 text-xs font-semibold text-[#14532D] hover:bg-[#E2EFE5] transition-colors whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Exportar .ICS
                    </button>
                    <a
                      href={buildGoogleCalendarUrl(ev)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#D4DDD6] bg-white px-3 py-1.5 text-xs font-semibold text-[#1C2720] hover:bg-[#F7F9F7] transition-colors whitespace-nowrap"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-[#CA8A04]" />
                      Google Calendar
                    </a>
                    <button
                      type="button"
                      onClick={() => handleDeleteEvent(ev.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Eliminar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
