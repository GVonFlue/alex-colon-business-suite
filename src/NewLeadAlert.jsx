import React, { useState } from 'react';
import { BellRing, ArrowRight, X } from 'lucide-react';

/* ============================================================================
   NewLeadAlert.jsx — a new lead, in front of him, wherever he is.

   THE REQUIREMENT, restated because it drove every decision here: it appears
   anywhere in the app, it survives a refresh, and it goes away only when he
   acts on it. Not on a timer, not on a route change, not on a reload.

   WHY THE ACKNOWLEDGEMENT LIVES ON THE CONTACT AND NOT IN COMPONENT STATE.
   Local state dies on refresh, which fails the requirement outright.
   localStorage survives a refresh but is per browser, so a lead dismissed on
   his laptop reappears on his phone and vice versa. The only place an
   acknowledgement is true everywhere is next to the lead itself, so it is
   written to `data.seenAt` on the contact row. That also makes it queryable
   later: "leads that sat unacknowledged for more than an hour" is a real
   question about speed to lead, and it is answerable because this field exists.

   WHY IT DOES NOT AUTO DISMISS. The existing `flash` toast in App.jsx clears
   itself after 3.2 seconds, which is right for "Contact deleted." and wrong
   for this. A lead that arrives while he is on a showing and disappears before
   he looks at his phone is a lead the system quietly failed to deliver, and it
   would look identical to no lead at all.

   WHY IT STACKS RATHER THAN QUEUES. Three leads in ten minutes is a good day,
   not an edge case. Showing one and hiding the rest behind it means the second
   and third are invisible until the first is handled.

   ACCESSIBILITY. role="alert" with aria-live="assertive": this is exactly the
   case that setting exists for, an interruption the user genuinely needs. It is
   NOT aria-live="polite", which would wait for a pause and could sit silent
   through a long form.
   ============================================================================ */

const money = v => (v == null || v === '' ? null : '$' + Number(v).toLocaleString('en-US'));

/** Minutes since an ISO timestamp, rendered the way a person would say it. */
function ago(iso) {
  if (!iso) return '';
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins === 1) return '1 minute ago';
  if (mins < 60) return mins + ' minutes ago';
  const h = Math.round(mins / 60);
  return h === 1 ? '1 hour ago' : h + ' hours ago';
}

export default function NewLeadAlert({ leads, onOpen, onAcknowledge }) {
  const [busy, setBusy] = useState('');
  if (!leads || !leads.length) return null;

  const act = async (lead, andOpen) => {
    if (busy) return;
    setBusy(lead.id);
    try {
      /* Acknowledge FIRST, then navigate. The other order looks smoother and
         loses the acknowledgement whenever the navigation unmounts this
         component before the write resolves, which puts the alert back on the
         next poll and makes it look like the button did not work. */
      await onAcknowledge(lead);
      if (andOpen) onOpen(lead);
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="nl-wrap" role="alert" aria-live="assertive">
      {leads.map(lead => {
        const d = lead.data || {};
        const src = d.source || 'the website';
        const price = money(d.priceMax || d.price);
        return (
          <div className="nl" key={lead.id}>
            <div className="nl-ic"><BellRing size={17} /></div>

            <div className="nl-body">
              <div className="nl-top">
                <b>New lead</b>
                <span className="nl-when">{ago(d.created_at || lead.created_at)}</span>
              </div>
              <div className="nl-name">{d.name || 'Someone'}</div>
              <div className="nl-meta">
                {src}
                {d.landingRoute || d.attribution?.landingRoute
                  ? ' · ' + (d.landingRoute || d.attribution.landingRoute) : ''}
                {price ? ' · ' + price : ''}
              </div>
              {/* Their phone and email, plainly, so the fastest possible
                  response does not require opening anything at all. Speed to
                  lead is the metric this whole path exists to serve. */}
              {(d.phone || d.email) && (
                <div className="nl-contact">
                  {d.phone && <a href={'tel:' + d.phone.replace(/[^\d+]/g, '')}>{d.phone}</a>}
                  {d.phone && d.email && <span className="nl-dot">·</span>}
                  {d.email && <a href={'mailto:' + d.email}>{d.email}</a>}
                </div>
              )}
            </div>

            <div className="nl-acts">
              <button className="nl-open" disabled={!!busy} onClick={() => act(lead, true)}>
                Open <ArrowRight size={14} />
              </button>
              {/* "Got it" acknowledges without navigating: he is mid-task, he
                  has read it, and he does not want to lose what he is doing.
                  Dismissing without acknowledging is deliberately NOT offered —
                  an X that only hides the thing is how a lead gets lost. */}
              <button className="nl-ack" disabled={!!busy} onClick={() => act(lead, false)}>
                <X size={13} /> Got it
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
