import { guard, sweep } from './_guard.js';
// Creates (or deletes) an event on the connected Google Calendar's primary calendar.
// POST body to create: { title, start, end, notes, attendees:[email], meet:bool, timezone }
// POST body to delete: { action:'delete', eventId }
// start/end are local wall-clock strings 'YYYY-MM-DDTHH:MM:SS'; timezone names the zone.
import { getAccessToken } from './_google.js';

const CAL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'POST only' }); return; }

  /* SIGNED-IN USERS ONLY. This route takes an arbitrary `attendees` array and
     posts to Google with sendUpdates=all — so before this guard, anyone who
     found the URL could send calendar invitations from this install's connected
     Google account to any address they chose. That is an outbound-email
     primitive on a real person's account, which is worse than the spend risk on
     the AI routes.

     A SESSION IS NOT THE WHOLE ANSWER, and this is deliberately only half the
     fix: it stops anonymous abuse, but a signed-in agent can still name any
     attendee. Constraining the recipient needs a decision about what the
     legitimate set IS on Dwell — contacts the caller owns, the team, something
     else — and that is not a decision to make at midnight inside a security
     patch. Written up rather than guessed at. */
  const gate = await guard(req, res, {
    name: 'calendar-event', perIp: 30, windowMin: 10, perDay: 600,
    maxChars: 20000, requireAuth: true,
  });
  if (!gate.ok) return;
  sweep();
  try {
    const token = await getAccessToken();
    if (!token) { res.status(200).json({ ok: false, error: 'not_connected' }); return; }
    const b = req.body || {};

    if (b.action === 'delete') {
      if (!b.eventId) { res.status(400).json({ ok: false, error: 'no eventId' }); return; }
      const r = await fetch(`${CAL}/${encodeURIComponent(b.eventId)}?sendUpdates=all`, {
        method: 'DELETE', headers: { Authorization: 'Bearer ' + token },
      });
      // 410/404 = already gone; treat as success
      if (!r.ok && r.status !== 410 && r.status !== 404) {
        res.status(200).json({ ok: false, error: await r.text() }); return;
      }
      res.status(200).json({ ok: true }); return;
    }

    if (!b.start || !b.end) { res.status(400).json({ ok: false, error: 'start/end required' }); return; }
    const tz = b.timezone || 'America/Chicago';
    const event = {
      summary: b.title || 'Meeting',
      description: b.notes || '',
      start: { dateTime: b.start, timeZone: tz },
      end: { dateTime: b.end, timeZone: tz },
    };
    if (Array.isArray(b.attendees) && b.attendees.length) {
      event.attendees = b.attendees.filter(Boolean).map((email) => ({ email }));
    }
    let url = CAL + '?sendUpdates=all';
    if (b.meet) {
      url += '&conferenceDataVersion=1';
      event.conferenceData = {
        createRequest: { requestId: 'proytech-' + Date.now(), conferenceSolutionKey: { type: 'hangoutsMeet' } },
      };
    }
    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'content-type': 'application/json' },
      body: JSON.stringify(event),
    });
    const j = await r.json();
    if (!r.ok) { res.status(200).json({ ok: false, error: (j.error && j.error.message) || 'create failed' }); return; }
    const meetLink = ((j.conferenceData && j.conferenceData.entryPoints) || [])
      .find((p) => p.entryPointType === 'video')?.uri || '';
    res.status(200).json({ ok: true, eventId: j.id, htmlLink: j.htmlLink || '', meetLink });
  } catch (e) {
    res.status(200).json({ ok: false, error: e.message || 'error' });
  }
}
