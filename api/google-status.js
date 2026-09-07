// Tells the app whether a Google account is connected, and which one.
//
// GUARDED, because "which one" is an email address. Unauthenticated, this
// handed the connected Google account of the brokerage to anyone who knew the
// URL — no session, no secret. It answered before anyone asked who was calling.
//
// requireAuth and not requireLeader: every agent's booking screen asks whether
// the calendar is connected, so a leader-only check would break the feature for
// the people who use it most.
import { guard, sweep } from './_guard.js';
import { loadGoogle } from './_google.js';

export default async function handler(req, res) {
  const gate = await guard(req, res, {
    name: 'google-status', perIp: 60, windowMin: 10, perDay: 5000,
    maxChars: 2000, requireAuth: true,
  });
  if (!gate.ok) return;
  sweep();

  try {
    const g = await loadGoogle();
    res.status(200).json({ connected: !!(g && g.refresh_token), email: (g && g.email) || '' });
  } catch (e) {
    res.status(200).json({ connected: false, email: '', error: e.message });
  }
}
