export interface ScheduledEventItem {
  id: number;
  userId: number;
  title: string;
  eventType: string;
  eventDate: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  location: string;
  description: string;
  reminderMinutes: number;
  createdAt: string;
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function toIcsLocalDateTime(dateStr: string, timeStr: string): string {
  const cleanDate = dateStr.replace(/-/g, '');
  const [hh = '08', mm = '00'] = timeStr.split(':');
  return `${cleanDate}T${hh.padStart(2, '0')}${mm.padStart(2, '0')}00`;
}

function toIcsUtcStamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    date.getUTCFullYear() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    'T' +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    'Z'
  );
}

function buildVEventBlock(event: ScheduledEventItem): string[] {
  const dtStamp = toIcsUtcStamp(new Date());
  const dtStart = toIcsLocalDateTime(event.eventDate, event.startTime);
  const safeEnd =
    event.endTime > event.startTime ? event.endTime : event.startTime;
  const dtEnd = toIcsLocalDateTime(event.eventDate, safeEnd);

  const summary = `[${event.eventType}] ${event.title}`;
  const fullDesc = event.description
    ? `${event.description}\n\nAgendado na plataforma Nzila Agro.`
    : 'Compromisso agrícola agendado na plataforma Nzila Agro.';

  const lines = [
    'BEGIN:VEVENT',
    `UID:nzila-agro-event-${event.id}@nzila-agro.ao`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART;TZID=Africa/Luanda:${dtStart}`,
    `DTEND;TZID=Africa/Luanda:${dtEnd}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    `DESCRIPTION:${escapeIcsText(fullDesc)}`,
    `CATEGORIES:${escapeIcsText(event.eventType)}`,
  ];

  if (event.location.trim()) {
    lines.push(`LOCATION:${escapeIcsText(event.location.trim())}`);
  }

  if (event.reminderMinutes > 0) {
    lines.push(
      'BEGIN:VALARM',
      `TRIGGER:-PT${event.reminderMinutes}M`,
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeIcsText(`Lembrete: ${summary}`)}`,
      'END:VALARM'
    );
  }

  lines.push('END:VEVENT');
  return lines;
}

function buildIcsCalendarContent(events: ScheduledEventItem[]): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Nzila Agro//Agenda Agricola//PT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Nzila Agro - Agenda do Produtor',
    'X-WR-TIMEZONE:Africa/Luanda',
  ];

  for (const event of events) {
    lines.push(...buildVEventBlock(event));
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

function triggerIcsDownload(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function exportSingleEventToIcs(event: ScheduledEventItem): string {
  const slug = event.title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 32);
  const filename = `nzila-evento-${slug || event.id}-${event.eventDate}.ics`;
  triggerIcsDownload(buildIcsCalendarContent([event]), filename);
  return filename;
}

export function exportAllEventsToIcs(events: ScheduledEventItem[]): string {
  const dateStamp = new Date().toISOString().slice(0, 10);
  const filename = `nzila-agro-agenda-${dateStamp}.ics`;
  triggerIcsDownload(buildIcsCalendarContent(events), filename);
  return filename;
}

export function buildGoogleCalendarUrl(event: ScheduledEventItem): string {
  const start = toIcsLocalDateTime(event.eventDate, event.startTime);
  const end = toIcsLocalDateTime(
    event.eventDate,
    event.endTime > event.startTime ? event.endTime : event.startTime
  );
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `[${event.eventType}] ${event.title}`,
    dates: `${start}/${end}`,
    ctz: 'Africa/Luanda',
    details: event.description || 'Compromisso agendado na Nzila Agro.',
    location: event.location || '',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
