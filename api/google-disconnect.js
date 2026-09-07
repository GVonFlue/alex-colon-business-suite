// Forgets the stored Google connection.
//
// GUARDED, and requireLeader rather than requireAuth. There is ONE Google
// connection per install, so severing it switches booking off for the whole
// brokerage — an agent must not be able to do that to everyone else, and until
// this commit a STRANGER could: the handler ran clearGoogle() for anybody who
// sent it a POST. An unauthenticated destructive endpoint.
//
// requireLeader implies requireAuth. Tiny body: the action takes no arguments.
import { guard, sweep } from './_guard.js';
import { clearGoogle } from './_google.js';

export default async function handler(req, res) {
  const gate = await guard(req, res, {
    name: 'google-disconnect', perIp: 10, windowMin: 10, perDay: 100,
    maxChars: 500, requireLeader: true,
  });
  if (!gate.ok) return;
  sweep();

  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
  try { await clearGoogle(); res.status(200).json({ ok: true }); }
  catch (e) { res.status(200).json({ ok: false, error: e.message }); }
}
