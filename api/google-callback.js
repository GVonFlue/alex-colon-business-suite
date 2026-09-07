// Google redirects here with ?code=... after consent. We swap the code for a
// refresh token, note which account connected, store it server-side, and bounce
// back to the app.
import { redirectUri, saveGoogle, appUrl } from './_google.js';

export default async function handler(req, res) {
  const back = appUrl();
  const code = req.query.code;
  const bounce = (q) => { res.writeHead(302, { Location: back + '/?' + q }); res.end(); };

  if (!code) { bounce('gcal=error&reason=no_code'); return; }
  try {
    const body = new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      redirect_uri: redirectUri(),
      grant_type: 'authorization_code',
    });
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    const j = await r.json();
    if (!r.ok || !j.refresh_token) {
      bounce('gcal=error&reason=' + encodeURIComponent(j.error || 'no_refresh_token'));
      return;
    }
    let email = '';
    try {
      const ui = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: 'Bearer ' + j.access_token },
      });
      const uj = await ui.json();
      email = uj.email || '';
    } catch { /* email is best-effort */ }

    await saveGoogle({ refresh_token: j.refresh_token, email, connected_at: new Date().toISOString() });
    bounce('gcal=connected');
  } catch (e) {
    bounce('gcal=error&reason=' + encodeURIComponent(e.message || 'exchange_failed'));
  }
}
