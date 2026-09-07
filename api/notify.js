import { SUPA_KEY, SUPA_URL } from './_env.js';
import { guard, sweep } from './_guard.js';
/* ============================================================================
   /api/notify — deadline reminders, and the only place email is sent from.

   WHY THIS RUNS SERVER-SIDE ON A SCHEDULE
   ---------------------------------------
   A client-side check only fires when somebody opens the app, so nothing would
   send for a Saturday deadline. Vercel Cron hits this once a day (see
   vercel.json, 07:00 America/Chicago = 12:00 UTC) and it does the work with the
   service key, which never touches client code.

   IDEMPOTENCY IS A DATABASE CONSTRAINT, NOT A HOPE
   ------------------------------------------------
   Every send claims a row in `reminder_log` with a unique key of
   (transaction_id, deadline_key, tier). The claim happens BEFORE the email. A
   duplicate claim comes back as a 409 and the send is skipped, so running the
   cron twice sends once. If the send then fails, the claim is deleted so
   tomorrow's run can retry.

   ESCALATION (settings.reminders.escalation, default [7, 1, 0])
   ------------------------------------------------------------
   7 days out, 1 day out, morning of, then daily while overdue. The overdue tier
   is keyed by date ('overdue-2026-08-05') so it can legitimately send once per
   day without ever sending twice in a day.

   RECIPIENTS
   ----------
   The assigned agent, always. The transaction coordinator and the client are
   opt-in PER TRANSACTION (`data.remindOptIn`), because nobody wants a client
   auto-emailed about a financing deadline before a human has decided that is
   what should happen.

   A deadline marked met, waived or extended stops sending immediately: met and
   waived are skipped outright, and an extension moves the date, which re-keys
   the tiers.

   Env:
     SUPABASE_URL                  https://xxx.supabase.co
     SUPABASE_SERVICE_ROLE_KEY     service key — SERVER ONLY, never VITE_*
     RESEND_API_KEY                re_...
     NOTIFY_FROM                   "Summit & Vine CRM <crm@yourdomain.com>"
     APP_URL                       https://your-crm.vercel.app   (for links)
     CRON_SECRET                   optional; if set, required as a bearer token
   ========================================================================== */

const esc = s => String(s == null ? '' : s).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmt = iso => (/^\d{4}-\d{2}-\d{2}/.test(String(iso || ''))
  ? `${MON[+String(iso).slice(5, 7) - 1]} ${+String(iso).slice(8, 10)}, ${String(iso).slice(0, 4)}` : '—');
const dnum = iso => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000) : NaN;
};
/** today in a timezone, as YYYY-MM-DD — the cron must agree with the app */
const todayIn = tz => {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' })
      .format(new Date()).replace(/\//g, '-');
  } catch { return new Date().toISOString().slice(0, 10); }
};

/* ---------------------------------------------------------------- supabase */
const SB = SUPA_URL;
const SKEY = SUPA_KEY;

async function sb(path, init) {
  const r = await fetch(`${SB}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SKEY, Authorization: `Bearer ${SKEY}`,
      'content-type': 'application/json',
      ...(init && init.headers),
    },
  });
  return r;
}
const sbGet = async path => {
  const r = await sb(path, { method: 'GET' });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return r.json();
};

/** claim a tier. Returns true if THIS run owns the send. */
async function claim(row) {
  const r = await sb('reminder_log', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(row),
  });
  if (r.status === 409) return false;          // unique violation: already sent
  if (!r.ok) throw new Error(`reminder_log: ${r.status} ${await r.text()}`);
  return true;
}
const unclaim = (txnId, key, tier) =>
  sb(`reminder_log?transaction_id=eq.${encodeURIComponent(txnId)}&deadline_key=eq.${encodeURIComponent(key)}&tier=eq.${encodeURIComponent(tier)}`,
    { method: 'DELETE' }).catch(() => {});

/* ------------------------------------------------------------------- email */
async function send({ to, subject, html }) {
  const KEY = process.env.RESEND_API_KEY, FROM = process.env.NOTIFY_FROM;
  if (!KEY || !FROM) return { ok: false, reason: 'not_configured' };
  if (!to.length) return { ok: false, reason: 'no_recipients' };
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ from: FROM, to, subject, html }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, reason: 'send_failed', detail: j.message || j.name || r.status };
    return { ok: true, id: j.id || null };
  } catch (e) {
    return { ok: false, reason: 'send_failed', detail: String(e.message || e) };
  }
}

const body = (d, txn, tierLabel) => {
  const link = process.env.APP_URL ? `${process.env.APP_URL}/?txn=${encodeURIComponent(txn.id)}` : '';
  return `<div style="font-family:-apple-system,Segoe UI,Inter,sans-serif;font-size:15px;color:#111528;line-height:1.55">
    <p style="margin:0 0 6px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#8E89A8">${esc(tierLabel)}</p>
    <p style="margin:0 0 14px;font-size:19px;font-weight:600">${esc(d.label)}</p>
    <p style="margin:0 0 12px"><b>${esc(fmt(d.status === 'extended' && d.extendedTo ? d.extendedTo : d.date))}</b></p>
    <p style="margin:0 0 12px;color:#56527a">${esc(String(txn.address || '').split(',')[0])}${txn.mls ? ` · MLS ${esc(txn.mls)}` : ''}</p>
    ${d.rule ? `<p style="margin:0 0 8px;color:#56527a;font-size:13px">${esc(d.rule)}</p>` : ''}
    ${d.explain ? `<p style="margin:0 0 12px;color:#7B76A0;font-size:12.5px">${esc(d.explain)}</p>` : ''}
    ${d.quote ? `<blockquote style="margin:0 0 14px;padding:8px 12px;border-left:3px solid #CDD3EA;background:#F6F7FC;color:#56527a;font-size:13px;font-style:italic">“${esc(d.quote)}”</blockquote>` : ''}
    ${link ? `<p style="margin:0"><a href="${esc(link)}" style="color:#1338DE">Open it in the CRM</a></p>` : ''}
    <p style="margin:18px 0 0;color:#A6A2BC;font-size:11.5px">Dates and arithmetic only — not legal advice.</p>
  </div>`;
};

/* ---------------------------------------------------------------- recipients

   THE CALLER MAY NARROW THE ALLOWLIST. IT CANNOT EXTEND IT.

   The ad-hoc path used to take `to` straight from the request body. Combined
   with no authentication, that made this an open relay: a stranger chose the
   recipients AND the subject AND the body, and it left from a domain verified
   in Resend. The damage is not a stray email, it is the reputation of a domain
   a client's business runs on.

   Authentication alone would not fix it — a signed-in agent could still mail
   anyone. So the allowlist is built HERE, from sources the caller cannot write:
   NOTIFY_TO on the deployment, plus the active leaders' own addresses.

   An unknown address is dropped rather than fatal: one stale entry must not
   silently stop the leaders being told. */
const norm = e => String(e || '').trim().toLowerCase();

export function pickRecipients(asked, allowed) {
  const want = (Array.isArray(asked) ? asked : []).map(norm).filter(e => e.includes('@'));
  if (!want.length) return { to: allowed.slice(), dropped: [] };
  return {
    to: want.filter(e => allowed.includes(e)),
    dropped: want.filter(e => !allowed.includes(e)),
  };
}

/** Active leaders, read with the service key — a source the caller cannot
 *  write through this endpoint. */
async function leaderEmails() {
  try {
    const rows = await sbGet('crm_users?role=eq.leader&active=is.true&select=email');
    return (rows || []).map(r => norm(r.email)).filter(e => e.includes('@'));
  } catch { return []; }
}

/* -------------------------------------------------------------- the handler */
export default async function handler(req, res) {
  const isCron = String(req.query?.cron || '') === '1' || String(req.headers['x-vercel-cron'] || '') !== '';

  /* ad-hoc single send, kept from the source repo's notify path.

     GUARDED. This path was reachable by anyone, and it took its recipients from
     the request body — a stranger picked who received arbitrary text from a
     domain verified in Resend. requireAuth closes the door; the allowlist below
     means being through the door is still not permission to mail anyone. */
  if (!isCron) {
    const gate = await guard(req, res, {
      name: 'notify-adhoc', perIp: 20, windowMin: 10, perDay: 200,
      maxChars: 4000, requireAuth: true,
    });
    if (!gate.ok) return;
    sweep();

    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });
    let b = req.body; if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
    b = b || {};
    const envTo = String(process.env.NOTIFY_TO || '').split(',').map(norm).filter(e => e.includes('@'));
    const allowed = [...new Set([...envTo, ...(await leaderEmails())])];
    if (!allowed.length) {
      console.error('[notify] no allowed recipients: NOTIFY_TO is unset and no active leader has an email');
      return res.status(200).json({ ok: false, reason: 'no_recipients' });
    }
    const { to, dropped } = pickRecipients(b.to, allowed);
    if (dropped.length) console.error(`[notify] dropped ${dropped.length} recipient(s) not on the allowlist`);
    const r = await send({
      to,
      subject: b.subject || 'ProyTech CRM',
      html: `<div style="font-family:-apple-system,Segoe UI,Inter,sans-serif;font-size:15px;color:#111528">${esc(b.text || '')}</div>`,
    });
    return res.status(200).json(r);
  }

  /* cron mode.

     CRON_SECRET IS REQUIRED, NOT OPTIONAL. It used to be `if (secret) { check }`
     — so an install that never set the variable had no check at all, and the
     endpoint that mails every deadline in the business to its leaders was open.
     A protection that switches itself off when unconfigured is not a
     protection; it is a note asking somebody to remember.

     Fails CLOSED: an unset secret refuses the run and says why in the log,
     rather than running it for anyone. A missed reminder cycle is recoverable.
     An open mail endpoint on a verified domain is not. */
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[notify] CRON_SECRET is not set on this deployment, so the cron endpoint '
      + 'refuses every request. Set it in Vercel and add it to the cron job\'s Authorization header.');
    return res.status(503).json({ ok: false, reason: 'cron_secret_not_configured' });
  }
  const auth = String(req.headers.authorization || '');
  if (auth !== `Bearer ${secret}`) return res.status(401).json({ ok: false, reason: 'unauthorised' });
  if (!SB || !SKEY) return res.status(200).json({ ok: false, reason: 'not_configured', detail: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing' });

  const report = { checked: 0, due: 0, sent: 0, skipped: 0, failed: 0, tiers: {}, errors: [] };

  try {
    const settingsRows = await sbGet('app_settings?id=eq.main&select=data');
    const settings = (settingsRows[0] && settingsRows[0].data) || {};
    const rem = settings.reminders || {};
    const tz = (settings.dateRules && settings.dateRules.tz) || 'America/Chicago';
    const escalation = Array.isArray(rem.escalation) && rem.escalation.length ? rem.escalation : [7, 1, 0];
    const dailyOverdue = rem.dailyWhenOverdue !== false;
    const recip = rem.recipients || { assignedAgent: true };
    const coordinatorEmail = String(rem.coordinatorEmail || '').trim();

    const now = todayIn(tz);
    const users = await sbGet('crm_users?select=id,name,email,active');
    const byId = Object.fromEntries(users.map(u => [u.id, u]));

    const txns = await sbGet("transactions?status=eq.active&select=id,owner_id,address,data");

    for (const row of txns) {
      const txn = { id: row.id, owner_id: row.owner_id, address: row.address || (row.data && row.data.address), mls: row.data && row.data.mls, ...(row.data || {}) };
      const deadlines = Array.isArray(txn.deadlines) ? txn.deadlines : [];
      const optIn = txn.remindOptIn || {};

      for (const d of deadlines) {
        report.checked++;
        if (!d || !d.date) continue;
        /* met and waived stop reminders immediately */
        if (d.status === 'met' || d.status === 'waived') continue;
        const when = d.status === 'extended' && d.extendedTo ? d.extendedTo : d.date;
        const days = dnum(when) - dnum(now);
        if (!Number.isFinite(days)) continue;

        let tier = null, tierLabel = '';
        if (days < 0) {
          if (!dailyOverdue) continue;
          tier = `overdue-${now}`;                       // once per day, never twice
          tierLabel = `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`;
        } else if (escalation.includes(days)) {
          tier = `d${days}`;
          tierLabel = days === 0 ? 'Due today' : `${days} day${days === 1 ? '' : 's'} out`;
        }
        if (!tier) continue;
        report.due++;

        const to = [];
        const agent = byId[d.assignee || txn.owner_id];
        if (recip.assignedAgent !== false && agent && agent.active !== false && agent.email) to.push(agent.email);
        if ((recip.coordinator || optIn.coordinator) && coordinatorEmail) to.push(coordinatorEmail);
        if ((recip.client || optIn.client) && optIn.clientEmail) to.push(String(optIn.clientEmail).trim());
        const list = Array.from(new Set(to.filter(e => e && e.includes('@'))));
        if (!list.length) { report.skipped++; continue; }

        let owned = false;
        try {
          owned = await claim({
            transaction_id: txn.id, deadline_key: d.key, tier,
            sent_to: list.join(','), deadline_date: when, sent_at: new Date().toISOString(),
          });
        } catch (e) { report.errors.push(String(e.message || e)); continue; }
        if (!owned) { report.skipped++; continue; }

        const r = await send({
          to: list,
          subject: `${d.label} — ${String(txn.address || '').split(',')[0]} — ${fmt(when)}`,
          html: body(d, txn, tierLabel),
        });
        if (r.ok) { report.sent++; report.tiers[tier] = (report.tiers[tier] || 0) + 1; }
        else {
          report.failed++;
          report.errors.push(r.reason + (r.detail ? `: ${r.detail}` : ''));
          /* release the claim so tomorrow can retry — a failed send must not
             look like a delivered one */
          await unclaim(txn.id, d.key, tier);
        }
      }
    }
    return res.status(200).json({ ok: true, date: now, ...report });
  } catch (e) {
    return res.status(200).json({ ok: false, reason: 'error', detail: String(e.message || e), ...report });
  }
}
