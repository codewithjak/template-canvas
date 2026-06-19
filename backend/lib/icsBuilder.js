'use strict';

/**
 * lib/icsBuilder.js
 *
 * Builds a minimal, valid iCalendar (.ics) "respond by" event with a reminder
 * alarm. METHOD:PUBLISH — a deadline reminder, not an RSVP invite, so there is
 * no inbound Accept/Decline to handle. Pure: give it a deadline, get a string.
 *
 * Mail clients (Gmail/Outlook/Apple) render this as an "Add to calendar" action.
 */

const crypto = require('crypto');

const DAY_MS            = 86400000;
const DEFAULT_ALARM_MS  = DAY_MS;        // remind 1 day before by default
const EVENT_DURATION_MS = 30 * 60000;    // a 30-minute block ending the deadline window

/** Format a Date as an iCalendar UTC timestamp: YYYYMMDDTHHMMSSZ. */
function toIcsUtc(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** Escape a value for an iCalendar TEXT field (backslash, newline, comma, semicolon). */
function escapeIcsText(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

/** VALARM TRIGGER (e.g. -PT60M), clamped so it never precedes "now". */
function alarmTrigger(deadline, leadMs) {
  const untilStart = deadline.getTime() - Date.now();
  const cap        = untilStart > 0 ? untilStart : leadMs;
  const lead       = Math.max(60000, Math.min(leadMs, cap));
  return `-PT${Math.round(lead / 60000)}M`;
}

/** Build the .ics string for a deadline reminder. */
function buildDeadlineIcs({ title, description, deadline, organizer, attendee, alarmLeadMs = DEFAULT_ALARM_MS }) {
  const summary = escapeIcsText(title || 'Respond by deadline');
  const desc    = escapeIcsText(description || title || 'Respond by deadline');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//map-doc//export-delivery//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${crypto.randomUUID()}@map-doc.com`,
    `DTSTAMP:${toIcsUtc(new Date())}`,
    `DTSTART:${toIcsUtc(deadline)}`,
    `DTEND:${toIcsUtc(new Date(deadline.getTime() + EVENT_DURATION_MS))}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${desc}`,
  ];
  if (organizer) lines.push(`ORGANIZER:mailto:${organizer}`);
  if (attendee)  lines.push(`ATTENDEE:mailto:${attendee}`);
  lines.push(
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${summary}`,
    `TRIGGER:${alarmTrigger(deadline, alarmLeadMs)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  );
  return lines.join('\r\n');
}

module.exports = { buildDeadlineIcs, toIcsUtc, escapeIcsText };
