/* ============================================================================
   Activity — one component, two presets.

   "Everything that happened" and "what I got done" are different questions and
   they are deliberately NOT two screens. Two screens would mean two definitions
   of what counts, and the definition is the whole difficulty here — see
   lib/activity.js. One stream, two filters, and the accomplishment one is the
   restrictive one.

   WHAT THE ACCOMPLISHMENT VIEW LEAVES OUT, and why each:

     imports          a spreadsheet arriving is not a day's work
     the contract-    Contracts.jsx writes kind:'note' saying "Created from a
     upload note      contract upload." — a machine note wearing a human kind
     deadline dates   a date passing is not something a person did
     phase moves      bookkeeping

   Transactions contribute nothing to either view. They have no activity array —
   their history is the deadline list and the phase — and folding those in would
   mix a contract clause with somebody's phone call.
   ========================================================================== */

import React, { useMemo, useState } from 'react';
import { Phone, CalendarCheck, StickyNote, MessageSquare, Upload, CheckCircle2, Star } from 'lucide-react';
import { Card, Empty, Seg, Sel, Pill } from '../components/ui';
import { addDays, fmtLong, fmtShort } from '../lib/dates';
import { buildStream, byDay } from '../lib/activity';

const ICON = {
  call: Phone, appointment: CalendarCheck, note: StickyNote,
  feedback: Star, text: MessageSquare, email: MessageSquare,
  import: Upload, task: CheckCircle2,
};
const LABEL = {
  call: 'Call', appointment: 'Appointment', note: 'Note', feedback: 'Showing feedback',
  text: 'Text', email: 'Email', import: 'Import', task: 'Task completed',
};

const RANGES = [
  { value: '1',  label: 'Today' },
  { value: '7',  label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
];

export default function ActivityView({ ctx }) {
  const [preset, setPreset] = useState('done');
  const [days, setDays] = useState('7');
  const [who, setWho] = useState('me');

  const me = ctx.me || {};
  const canSeeOthers = ctx.isLeader || ctx.isCoordinator;
  const to = ctx.todayIso;
  const from = addDays(to, -(Number(days) - 1));

  const stream = useMemo(() => buildStream({
    contacts: ctx.contacts, tasks: ctx.tasks, preset,
    who: who === 'all' && canSeeOthers ? '' : me.id,
    from, to,
  }), [ctx.contacts, ctx.tasks, preset, who, canSeeOthers, me.id, from, to]);

  const days_ = useMemo(() => byDay(stream), [stream]);
  const nameOf = id => {
    const u = (ctx.users || []).find(x => x.id === id);
    return (u && (u.name || u.email)) || '';
  };

  const sub = preset === 'done'
    ? 'Calls, appointments, notes you wrote and tasks you finished. Imports and contract paperwork are left out — nobody did those.'
    : 'Everything recorded against a contact, including what the app wrote itself.';

  return (
    <Card
      title={preset === 'done' ? 'What got done' : 'Everything that happened'}
      sub={sub}
      right={
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Seg
            value={preset}
            onChange={setPreset}
            options={[{ value: 'done', label: 'What got done' }, { value: 'all', label: 'Everything' }]}
          />
          <Sel value={days} onChange={e => setDays(e.target.value)} options={RANGES} />
          {canSeeOthers && (
            <Sel
              value={who}
              onChange={e => setWho(e.target.value)}
              options={[{ value: 'me', label: 'Me' }, { value: 'all', label: 'Everyone' }]}
            />
          )}
        </div>
      }
    >
      <div className="ac-range">{fmtShort(from)} – {fmtShort(to)} · {stream.length} entr{stream.length === 1 ? 'y' : 'ies'}</div>

      {!stream.length && (
        <Empty>
          {preset === 'done'
            ? 'Nothing logged in this window. Logging a call on a contact puts it here.'
            : 'Nothing recorded in this window.'}
        </Empty>
      )}

      {days_.map(([d, rows]) => (
        <div className="ac-day" key={d}>
          <div className="ac-day-h">
            {d === to ? 'Today' : fmtLong(d)}
            <span className="ac-day-n">{rows.length}</span>
          </div>
          {rows.map(e => {
            const I = ICON[e.kind] || StickyNote;
            return (
              <div className={'ac-row' + (e.machine ? ' machine' : '')} key={e.id + e.at}>
                <div className="ac-ic"><I size={13} /></div>
                <div className="ac-mid">
                  <div className="ac-note">{e.note || LABEL[e.kind] || e.kind}</div>
                  <div className="ac-meta">
                    <span className="ac-kind">{LABEL[e.kind] || e.kind}</span>
                    {e.contactName && (
                      <button className="ac-link" onClick={() => ctx.go('contacts', { id: e.contactId })}>
                        {e.contactName}
                      </button>
                    )}
                    {who === 'all' && e.by && <span className="ac-by">{nameOf(e.by)}</span>}
                    {/* named, not hidden: in the everything view a machine entry
                        should be legible AS a machine entry rather than passing
                        for somebody's work */}
                    {e.machine && <Pill color="#8E89A8">written by the app</Pill>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </Card>
  );
}
