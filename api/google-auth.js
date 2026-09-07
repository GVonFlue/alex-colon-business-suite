// Kicks off the Google OAuth consent flow. The browser hits this, gets bounced
// to Google, approves once, and Google sends the code to /api/google-callback.
import { OAUTH_SCOPES, redirectUri } from './_google.js';

export default async function handler(req, res) {
  const cid = process.env.GOOGLE_CLIENT_ID;
  if (!cid) { res.status(500).send('GOOGLE_CLIENT_ID not set'); return; }
  const params = new URLSearchParams({
    client_id: cid,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: OAUTH_SCOPES,
    access_type: 'offline',   // gives us a refresh token
    prompt: 'consent',        // force refresh token even on re-consent
    include_granted_scopes: 'true',
  });
  res.writeHead(302, { Location: 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString() });
  res.end();
}
