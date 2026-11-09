import { dateString } from './index.js';
const escapeText = (s: string) =>
  s
    .replaceAll('\\', '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,');
// RFC 5545 folds at 75 octets, never inside a UTF-8 sequence.
export function foldCalendarLine(line: string) {
  const lines: string[] = [];
  let current = '',
    bytes = 0;
  for (const char of line) {
    const size = new TextEncoder().encode(char).length;
    if (bytes + size > 75) {
      lines.push(current);
      current = ' ';
      bytes = 1;
    }
    current += char;
    bytes += size;
  }
  lines.push(current);
  return lines.join('\r\n');
}
export function calendarEvent(
  event: { id: string; title: string; date: string; annual: boolean },
  now = new Date(),
) {
  dateString.parse(event.date);
  const end = new Date(event.date + 'T00:00:00Z');
  end.setUTCDate(end.getUTCDate() + 1);
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
  return (
    [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Little Days//Memories//VI',
      'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      `UID:${escapeText(event.id)}@little-days.local`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${event.date.replaceAll('-', '')}`,
      `DTEND;VALUE=DATE:${end.toISOString().slice(0, 10).replaceAll('-', '')}`,
      `SUMMARY:${escapeText(event.title)}`,
      ...(event.annual ? ['RRULE:FREQ=YEARLY'] : []),
      'CLASS:PRIVATE',
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
      'END:VCALENDAR',
    ]
      .map(foldCalendarLine)
      .join('\r\n') + '\r\n'
  );
}
