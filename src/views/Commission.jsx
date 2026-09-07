/* ============================================================================
   Commission.jsx — build brief §5.

   This view renders the split/cap engine in src/lib/commission.js and does no
   money arithmetic of its own. Every figure on screen comes out of
   computeCommission / replayYear / capProgress — including the words that
   explain a cap straddle, because the engine writes those notes and the UI must
   not be able to drift from the maths.

   Privacy is the database's job (docs/VIEW-CONTRACT.md): ctx.transactions is
   already scoped, so nothing here filters for permission reasons. What the
   permission keys decide is whether a NON-leader is offered a team roll-up at
   all (seeTeamCommission) or other agents' rows (seeOtherCommission). Both
   default to false. `editOwnSplit` is false and locked by design — the plan is
   rendered read-only for everybody and only the leader gets a link to Settings.

   Cap state is REPLAYED in close-date order, never summed from snapshots, so
   each deal is costed against the cap as it stood on the day it closed.
   ========================================================================== */

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle, CalendarClock, CheckCircle2, ChevronDown, ChevronRight,
  Lock, Target, TrendingUp, XCircle,
} from 'lucide-react';

import { agentPlan, capPeriod, capProgress, computeCommission, replayYear } from '../lib/commission';
import { addDays, fmtLong, fmtShort, isDate } from '../lib/dates';
import { sum, uniq, usd, usdc } from '../lib/format';
import { phasesOf } from '../lib/settings';
import { Btn, Card, Empty, Kpi, Pill, SecTitle, Seg, Sel, SideChip, Tag } from '../components/ui';
import { closedOn, onClosedDate } from '../lib/txn';
import { BRAND } from '../lib/brand';

/* ------------------------------------------------------------- helpers ----- */

const street = a => String(a || 'Untitled deal').split(',')[0].trim();
const firstName = n => String(n || '').split(' ')[0] || 'this agent';
/** a negative engine line renders as a real minus sign, not "$-1,234.00" */
const money = v => (Number(v) < 0 ? `− ${usdc(-v)}` : usdc(v));

/**
 * Deals not yet closed: same engine, cap carried forward in scheduled order.
 *
 * A deal scheduled to close in the NEXT cap period is costed against a FRESH
 * cap, not against what is left of this one. Running everything against this
 * period's remainder made a January closing look post-cap in December, which is
 * a projection a realtor would price a decision on.
 */
function runProjection(active, plan, startPaid, currentPeriod) {
  const list = (active || []).slice()
    .sort((a, b) => String(a.closeDate || '9999-99-99').localeCompare(String(b.closeDate || '9999-99-99')));
  let paid = startPaid;
  let periodKey = currentPeriod ? currentPeriod.label : null;
  return list.map(t => {
    const p = isDate(t.closeDate) ? capPeriod(t.closeDate, plan) : currentPeriod;
    const key = p ? p.label : periodKey;
    if (key !== periodKey) { paid = 0; periodKey = key; }   // new cap period, new cap
    const calc = computeCommission(t, plan, { capPaidToDate: paid });
    paid = calc.capAfter;                 // engine output — no arithmetic in this file
    return { txn: t, calc, period: p, nextPeriod: !!(currentPeriod && p && p.label !== currentPeriod.label) };
  });
}

/** everything one agent's section needs, for one cap period */
function roll(user, transactions, settings, anchorIso, archive) {
  const plan = agentPlan(user.plan || (settings && settings.commissionDefaults) || {});
  const period = capPeriod(anchorIso, plan);
  const mine = (transactions || []).filter(t => t.owner_id === user.id);
  /* ONE definition of when it closed, app-wide: the actual close date if there
     is one, else the scheduled one. This view used to ignore closedActual
     entirely while the dashboard's GCI tile used it, so a deal that closed late
     could land in a different period on the two screens. */
  const closed = mine.filter(t => t.status === 'closed' && isDate(closedOn(t))).map(onClosedDate);

  /* the cap-correct costing: every deal priced against the cap as it then was */
  const rep = replayYear(closed, plan, period);
  /* the snapshot view: what was actually billed to the cap at close */
  const progress = capProgress(closed, plan, anchorIso);

  const inPeriod = iso => !!period && isDate(iso) && String(iso) >= period.start && String(iso) <= period.end;
  const active = archive ? [] : mine.filter(t => t.status === 'active');
  const projected = runProjection(active, plan, progress.paid, period);
  const fell = mine
    .filter(t => t.status === 'fell' && inPeriod(t.fellAt || t.closeDate || t.effectiveDate))
    .sort((a, b) => String(b.fellAt || b.closeDate || '').localeCompare(String(a.fellAt || a.closeDate || '')));

  return {
    user, plan, period, progress,
    /* a seat with no plan of its own is costed on the install defaults, and
       says so — a silently invented split is a lie about someone's money */
    planKnown: !!user.plan,
    rows: rep.rows, closedCount: rep.rows.length,
    gci: rep.gci, net: rep.net, replayCapPaid: rep.capPaid,
    toBrokerage: sum(rep.rows, r => r.calc.toBrokerage),
    teamCut: sum(rep.rows, r => r.calc.teamCut),
    fees: sum(rep.rows, r => r.calc.fees),
    projected,
    projectedNet: sum(projected, p => p.calc.agentNet),
    projectedGci: sum(projected, p => p.calc.gross),
    fell,
  };
}

/* ---------------------------------------------------------------- view ----- */

export default function Commission({ ctx }) {
  const { transactions, users, me, isLeader, settings, todayIso, params, go } = ctx;
  const canTeam = isLeader || ctx.can('seeTeamCommission');
  const canOthers = isLeader || ctx.can('seeOtherCommission');
  const phases = phasesOf(settings);

  /* ---- which cap period ------------------------------------------------ */
  const curYear = String(todayIso || '').slice(0, 4);
  const years = useMemo(() => {
    const ys = (transactions || [])
      .map(t => String(t.closeDate || t.fellAt || t.effectiveDate || '').slice(0, 4))
      .filter(y => /^\d{4}$/.test(y));
    return uniq([curYear, ...ys]).sort().reverse();
  }, [transactions, curYear]);

  const [year, setYear] = useState(curYear);
  const archive = year !== curYear;
  /* a year picks the cap period that was running at the end of it, so an
     anniversary cap is reachable from a year label just like a calendar one */
  const anchor = archive ? `${year}-12-31` : todayIso;

  /* ---- whose numbers ---------------------------------------------------
     Everyone whose deals are in ctx.transactions gets a roll — that set is
     already what the database decided this seat may see. The two permissions
     then decide how much of it is rendered: seeTeamCommission = the aggregate,
     seeOtherCommission = the named per-agent rows. They are separate on
     purpose, so "the team did $1.4m" can be shared without "Priya did $600k". */
  const everyone = useMemo(() => {
    const byId = ctx.users_by_id || {};
    const owners = new Set((transactions || []).map(t => t.owner_id).filter(Boolean));
    const ids = uniq([...(me ? [me.id] : []), ...(users || []).map(u => u.id), ...Array.from(owners)]);
    return ids
      .map(id => byId[id] || (me && me.id === id ? me : { id, name: 'Removed seat', plan: null }))
      .filter(u => (me && u.id === me.id) || owners.has(u.id) || u.active !== false)
      .sort((a, b) => (me && a.id === me.id ? -1
        : me && b.id === me.id ? 1
        : String(a.name || '').localeCompare(String(b.name || ''))));
  }, [ctx.users_by_id, users, transactions, me]);

  const allRolls = useMemo(
    () => everyone.map(u => roll(u, transactions, settings, anchor, archive)),
    [everyone, transactions, settings, anchor, archive],
  );
  /* whose individual numbers this seat may look at, one at a time */
  const rolls = useMemo(
    () => (canOthers ? allRolls : allRolls.filter(r => me && r.user.id === me.id)),
    [allRolls, canOthers, me],
  );

  const [who, setWho] = useState((params && params.agent) || (me && me.id) || '');
  const sel = rolls.find(r => r.user.id === who) || rolls[0] || null;
  const many = allRolls.length > 1;

  const team = useMemo(() => ({
    seats: allRolls.length,
    gci: sum(allRolls, r => r.gci),
    net: sum(allRolls, r => r.net),
    toBrokerage: sum(allRolls, r => r.toBrokerage),
    teamCut: sum(allRolls, r => r.teamCut),
    fees: sum(allRolls, r => r.fees),
    closed: sum(allRolls, r => r.closedCount),
    projectedNet: sum(allRolls, r => r.projectedNet),
  }), [allRolls]);

  if (!sel) {
    return (
      <Card title="Commission">
        <Empty>No seat to show commission for yet. Once a transaction closes, the full breakdown of where every
          dollar went lands here.</Empty>
      </Card>
    );
  }

  return (
    <>
      {/* ------------------------------------------------ period picker --- */}
      <div className="toolbar">
        <div className="bk-yr" style={{ marginLeft: 0 }}>
          <span style={{ fontSize: 12.5, color: '#8E89A8', fontWeight: 600 }}>Cap period</span>
          <Sel value={year} onChange={e => setYear(e.target.value)}
            options={years.map(y => ({ value: y, label: y === curYear ? `${y} — current` : `${y} — archived` }))} />
        </div>
        <Pill color={archive ? '#8E89A8' : BRAND.colors.cobalt}>
          {sel.period ? sel.period.label : year}{archive ? ' · archived' : ' · running now'}
        </Pill>
        {sel.period && (
          <span style={{ fontSize: 12.5, color: '#8E89A8' }}>
            {fmtLong(sel.period.start)} → {fmtLong(sel.period.end)} · resets {fmtLong(addDays(sel.period.end, 1))}
            {sel.plan.capCadence === 'calendar'
              ? ' · this plan caps on the calendar year, so it matches the dashboard GCI tile'
              : ' · this plan caps on an anniversary, so it does NOT line up with the dashboard’s calendar-year GCI tile'}
          </span>
        )}
      </div>

      {/* -------------------------------------------------- team roll-up --- */}
      {canTeam && many && (
        <>
          <SecTitle right={<span style={{ fontSize: 12, color: '#8E89A8' }}>{team.seats} seats · {team.closed} closed</span>}>
            Team roll-up{!canOthers ? ' · totals only' : ''}
          </SecTitle>
          <div className="grid3" style={{ marginBottom: 18 }}>
            <Kpi label="Team GCI" value={usd(team.gci)} variant="accent" icon={<TrendingUp size={13} />}
              d={`${team.closed} closed transaction${team.closed === 1 ? '' : 's'}`} />
            <Kpi label="Paid to agents" value={usd(team.net)} variant="green" d="after split, cap, team cut and fees" />
            <Kpi label="To the brokerage" value={usd(team.toBrokerage)} d="cap dollars plus any post-cap share" />
            <Kpi label="To the team" value={usd(team.teamCut)} variant="gold" d="team split across all seats" />
            <Kpi label="Transaction fees" value={usd(team.fees)} d="E&O and per-deal fees paid" />
            <Kpi label="Projected, not earned" value={usd(team.projectedNet)} d="deals still under contract" />
          </div>
          {!canOthers && (
            <div className="seat-note" style={{ marginBottom: 18 }}>
              <Lock size={14} />
              <span>You can see the team’s totals but not who earned what. Naming the individual agents needs the
                separate “see other agents’ commission” permission, and your team leader controls it.</span>
            </div>
          )}
        </>
      )}

      {canOthers && many && <AgentTable rolls={rolls} selected={sel.user.id} onPick={setWho} />}

      {canOthers && many && (
        <div style={{ margin: '18px 0 4px' }}>
          <Seg value={sel.user.id} onChange={setWho}
            options={rolls.map(r => ({ value: r.user.id, label: r.user.name, n: r.closedCount }))} />
        </div>
      )}

      <AgentSection roll={sel} phases={phases} archive={archive} isLeader={isLeader}
        isMe={!!me && sel.user.id === me.id} canEditSplit={ctx.can('editOwnSplit')} go={go} />
    </>
  );
}

/* ----------------------------------------------------------- one agent ----- */

function AgentSection({ roll: r, phases, archive, isLeader, isMe, canEditSplit, go }) {
  const p = r.progress;
  const capOff = r.plan.cap <= 0;
  /* a closed deal edited after the fact moves every later one — say so */
  const drift = !capOff && Math.abs(r.replayCapPaid - p.paid) >= 1;

  return (
    <>
      <SecTitle>
        {isMe ? 'Your numbers' : `${r.user.name}’s numbers`}{r.period ? ` · ${r.period.label}` : ''}
        {archive ? ' · archived period' : ''}
      </SecTitle>

      <div className="cmsn-hero">
        <div className={'cmsn-main' + (p.capped ? ' earned' : '')}>
          <div className="cmsn-l">{isMe ? 'Your net this cap period' : `${firstName(r.user.name)}’s net this cap period`}</div>
          <div className="cmsn-v">{usd(r.net)}</div>
          <div className="cmsn-d">
            {r.closedCount} closed · {usd(r.gci)} gross{p.capped ? ' · capped out' : ''}
          </div>
        </div>
        <Kpi label="Gross commission" value={usd(r.gci)} d="before anything comes off it" icon={<TrendingUp size={13} />} />
        <Kpi label="To the brokerage" value={usd(r.toBrokerage)}
          d={capOff ? 'no cap on this plan' : `${usd(p.paid)} of it counted to the cap`} />
        <Kpi label="To the team" value={usd(r.teamCut)}
          d={r.plan.teamPct > 0 ? `${r.plan.teamPct}%, ${r.plan.teamOrder === 'team-first' ? 'before' : 'after'} the brokerage` : 'no team split on this plan'} />
        <Kpi label="Transaction fees" value={usd(r.fees)} d="E&O and per-deal fees paid" />
      </div>

      <div className="grid2" style={{ marginBottom: 18 }}>
        {/* ------------------------------------------------ cap progress --- */}
        <Card title="Cap progress"
          sub={r.period ? `${r.period.label} · ${fmtLong(r.period.start)} → ${fmtLong(r.period.end)}` : ''}
          right={p.capped
            ? <Pill color="${BRAND.colors.green}"><CheckCircle2 size={11} /> Capped out</Pill>
            : <Tag>{r.plan.capCadence === 'calendar' ? 'Calendar year' : 'Anniversary year'}</Tag>}>
          {capOff ? (
            <div className="cmsn-box">
              This plan has no cap. The brokerage takes {100 - r.plan.keepPct}% of every deal for the whole period —
              there is no point at which it stops.
            </div>
          ) : (
            <>
              <div className="cap-wrap">
                <div className="cap-bar">
                  <div className={'cap-fill' + (p.capped ? ' done' : '')} style={{ width: `${Math.round(p.pct * 100)}%` }} />
                </div>
                <div className="cap-legend">
                  <span>{usd(p.paid)} paid of {usd(p.cap)}</span>
                  <span>{p.capped ? 'Cap met' : `${usd(p.remaining)} to go`}</span>
                </div>
              </div>

              <div className="cmsn-box" style={{ marginTop: 14 }}>
                <div className="cmsn-row"><span>Paid to the cap</span><b>{usdc(p.paid)}</b></div>
                <div className="cmsn-row"><span>Left on the cap</span><b>{usdc(p.remaining)}</b></div>
                <div className="cmsn-row"><span>Closings counted</span><b>{p.count}</b></div>
                <div className="cmsn-row big">
                  <span>{p.capped ? 'Capped out' : 'Projected cap date'}</span>
                  <b>{p.capped ? 'done' : p.projected ? fmtShort(p.projected) : 'not on pace'}</b>
                </div>
              </div>

              <div className="wf-note">
                {p.capped
                  ? <>The cap is met for {r.period ? r.period.label : 'this period'}. Everything from here runs at the
                      post-cap split of {r.plan.postCapPct}% to the agent
                      {r.plan.postCapFee > 0 ? `, less a ${usd(r.plan.postCapFee)} transaction fee per deal` : ''}.</>
                  : p.projected
                    ? <><CalendarClock size={11} style={{ verticalAlign: -1 }} /> At the pace set so far this period the
                        cap lands around <b>{fmtLong(p.projected)}</b>. That is a straight line drawn through closings to
                        date — nothing more.</>
                    : p.paid > 0
                      ? <><b>Not on pace to cap this period.</b> At the pace so far, {usd(p.remaining)} would still be
                          outstanding on {fmtLong(r.period.end)}.</>
                      : <>Nothing has gone to the cap yet this period.</>}
                {r.period && <> The cap period resets {fmtLong(addDays(r.period.end, 1))}.</>}
              </div>

              {drift && (
                <div className="note" style={{ marginTop: 10 }}>
                  <b>These two numbers disagree.</b> Replaying the closed deals as they stand today puts{' '}
                  {usd(r.replayCapPaid)} against the cap, but {usd(p.paid)} was snapshotted at close. A closed deal has
                  been edited since — editing an old deal re-costs every later one, which is exactly why the figure
                  taken at close is the one the brokerage billed.
                </div>
              )}
            </>
          )}
        </Card>

        <PlanCard roll={r} isLeader={isLeader} isMe={isMe} locked={!canEditSplit} go={go} />
      </div>

      {/* ----------------------------------------------- closed waterfalls --- */}
      <SecTitle right={<span style={{ fontSize: 12, color: '#8E89A8', textTransform: 'none', letterSpacing: 0 }}>
        costed against the cap in close-date order</span>}>
        Closed · {r.closedCount} transaction{r.closedCount === 1 ? '' : 's'}
      </SecTitle>
      {r.rows.length === 0 ? (
        <Card>
          <Empty>Nothing closed in {r.period ? r.period.label : 'this period'}. A closed transaction lands here with
            every line of the breakdown — gross, referral out, team split, brokerage split against the cap, fees,
            and the net.</Empty>
        </Card>
      ) : (
        <div className="grid2">
          {r.rows.slice().reverse().map(row => <TxnCard key={row.txn.id} row={row} plan={r.plan} />)}
        </div>
      )}

      {/* --------------------------------------------------------- pending --- */}
      {!archive && (
        <>
          <SecTitle right={<span style={{ fontSize: 12, color: '#8E89A8', textTransform: 'none', letterSpacing: 0 }}>
            projections — they move</span>}>
            Still under contract · {r.projected.length}
          </SecTitle>
          {r.projected.length === 0 ? (
            <Card><Empty>Nothing under contract right now. Deals in the closing pipeline show a projected net here
              before they are real.</Empty></Card>
          ) : (
            <Card
              title={`Projected net ${usd(r.projectedNet)} · not earned`}
              sub={`${usd(r.projectedGci)} projected gross. These are PROJECTIONS: each deal is priced off the sale price and rate on it today, then costed against the cap in scheduled close order starting from ${usd(r.progress.paid)} already paid this period. A deal scheduled to close in a LATER cap period is costed against a fresh cap, not against what is left of this one. A price change, a fall-through, or two deals swapping order all move these numbers.`}>
              <div className="grid2">
                {r.projected.map(row => (
                  <TxnCard key={row.txn.id} row={row} plan={r.plan} projected
                    outsidePeriod={row.nextPeriod}
                    periodLabel={row.period ? row.period.label : null} />
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      {/* ---------------------------------------------------- fell through --- */}
      <SecTitle>Fell through · {r.fell.length} in {r.period ? r.period.label : 'this period'}</SecTitle>
      <Card sub="A dead deal earns nothing, and it is kept here on purpose. How often deals die, and at which phase they
        die, is the number that tells you where to tighten up.">
        {r.fell.length === 0 ? (
          <Empty>No deals fell through in this period.</Empty>
        ) : (
          <div className="hlist" style={{ maxHeight: 'none' }}>
            {r.fell.map(t => {
              const ph = phases.find(x => x.key === (t.fellPhase || t.phase));
              return (
                <div key={t.id} className="hli bad">
                  <XCircle size={13} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b>{street(t.address)}</b>{' '}<SideChip side={t.side} />{' '}
                    {ph && <Tag>died at {ph.label}</Tag>}
                    <div style={{ marginTop: 3 }}>
                      {t.fellReason || 'No reason recorded — add one, or the pattern stays invisible.'}
                      {(t.fellAt || t.closeDate) ? ` · ${fmtLong(t.fellAt || t.closeDate)}` : ''}
                      {' · earned '}<b>$0</b>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </>
  );
}

/* ------------------------------------------------------- one waterfall ----- */

function TxnCard({ row, plan, projected, outsidePeriod, periodLabel }) {
  const [open, setOpen] = useState(true);
  const { txn: t, calc } = row;
  const brokerLine = (calc.lines || []).find(l => l.label === 'Brokerage split');

  return (
    <Card
      title={street(t.address)}
      sub={<span>
        <SideChip side={t.side} />{' '}
        {projected ? `scheduled to close ${fmtLong(t.closeDate)}` : `closed ${fmtLong(closedOn(t))}`}
        {t.mls ? ` · ${t.mls}` : ''}{t.salePrice ? ` · ${usd(t.salePrice)} sale price` : ''}
      </span>}
      right={
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {projected && <Pill color="#D98A3D">Projected</Pill>}
          {outsidePeriod && <Tag>{periodLabel ? `${periodLabel} cap period — fresh cap` : 'next cap period — fresh cap'}</Tag>}
          {calc.capMetOnThis && <Pill color="${BRAND.colors.green}"><Target size={11} /> Capped out on this one</Pill>}
          {calc.straddle && <Pill color="${BRAND.colors.gold}"><AlertTriangle size={11} /> Cap straddle</Pill>}
          {calc.fullyPostCap && <Pill color="${BRAND.colors.green}">Post-cap</Pill>}
          <button className="iconbtn" onClick={() => setOpen(o => !o)} aria-label="Toggle the breakdown">
            {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </button>
        </div>
      }>

      {!open ? (
        <div className="cmsn-row big">
          <span>{projected ? 'Projected net' : 'Agent net'}</span><b>{usd(calc.agentNet)}</b>
        </div>
      ) : (
        <>
          <div className="wf">
            {(calc.lines || []).map((l, i) => (
              <div key={`${l.label}-${i}`}
                className={'wf-row' + (l.kind === 'out' ? ' neg' : '') + (l.kind === 'total' ? ' tot' : '')}>
                <span className="wl" style={{ minWidth: 0 }}>
                  {l.label}
                  {l.note && <span className="wf-note" style={{ display: 'block', margin: '2px 0 0' }}>{l.note}</span>}
                </span>
                <span className="wv">{money(l.value)}</span>
              </div>
            ))}
          </div>

          {calc.straddle && (
            <div className="note" style={{ marginTop: 12 }}>
              <b>This deal straddled the cap.</b>{' '}
              The brokerage’s {100 - plan.keepPct}% share came to {usd(calc.brokerageDesired)}.{' '}
              <b>{usd(calc.capContribution)}</b> of it finished the cap
              {calc.capRemainingBefore != null ? ` — that was all that was left on it` : ''}, and the rest was treated
              at the post-cap split of <b>{plan.postCapPct}% to the agent</b>
              {calc.brokerageFromExcess > 0
                ? `, so the brokerage kept a further ${usd(calc.brokerageFromExcess)} out of the excess.`
                : ', so the agent kept all of the excess.'}
              {brokerLine && brokerLine.note && (
                <div style={{ marginTop: 6 }}>Line by line: {brokerLine.note}.</div>
              )}
              {plan.postCapFee > 0 && (
                <div style={{ marginTop: 6 }}>
                  {plan.postCapFeeOnStraddle
                    ? `On this plan the ${usd(plan.postCapFee)} post-cap transaction fee IS charged on the deal that caps out.`
                    : `On this plan the ${usd(plan.postCapFee)} post-cap transaction fee is NOT charged on the deal that caps out — it starts on the next one.`}
                </div>
              )}
              <div style={{ marginTop: 6 }}>
                Only the {usd(calc.capContribution)} that went to the cap is cap credit. What the brokerage takes out of
                post-cap dollars never counts toward it.
              </div>
            </div>
          )}

          {calc.capMetOnThis && !calc.straddle && (
            <div className="note" style={{ marginTop: 12 }}>
              <b>This is the deal that capped out.</b> {usd(calc.capContribution)} went to the cap and it landed exactly
              on the number — nothing spilled over. From the next deal on, the post-cap split of {plan.postCapPct}% to
              the agent applies.
            </div>
          )}

          {calc.fullyPostCap && (
            <div className="wf-note">
              Post-cap deal — the cap was already met when this one {projected ? 'is due to close' : 'closed'}, so it
              ran at {plan.postCapPct}% to the agent
              {calc.brokerageFromExcess > 0 ? ` and the brokerage still took ${usd(calc.brokerageFromExcess)}` : ''}.
              None of it counted toward the cap.
            </div>
          )}

          {!calc.straddle && !calc.fullyPostCap && plan.cap > 0 && (
            <div className="wf-note">
              Cap before this deal {usd(calc.capBefore)} → after {usd(calc.capAfter)}
              {calc.capRemainingAfter != null ? ` · ${usd(calc.capRemainingAfter)} still left on the cap` : ''}.
            </div>
          )}

          {projected && (
            <div className="wf-note">
              Projection only. None of this is earned until the deal closes, and it changes if the price, the rate, or
              the order of the closings changes.
            </div>
          )}
        </>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------- the plan ---- */

function PlanCard({ roll: r, isLeader, isMe, locked, go }) {
  const p = r.plan;
  return (
    <Card
      title="The plan behind these numbers"
      right={<span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        {!r.planKnown && <Tag>install default plan</Tag>}
        <Pill color="#8E89A8"><Lock size={11} /> Read-only</Pill>
      </span>}
      sub={isLeader
        ? 'You set the split, cap and fees per seat in Settings. An agent can read their own plan here and never change it.'
        : 'Your team leader sets your split and cap. This screen shows it so you can check the maths against your own deals — it cannot change it, and neither can you.'}>
      <div className="cmsn-box">
        <div className="cmsn-row"><span>Agent keeps, pre-cap</span><b>{p.keepPct}%</b></div>
        <div className="cmsn-row"><span>Brokerage share, pre-cap</span><b>{100 - p.keepPct}%</b></div>
        <div className="cmsn-row"><span>Cap</span><b>{p.cap > 0 ? usd(p.cap) : 'none'}</b></div>
        <div className="cmsn-row"><span>Cap period</span>
          <b>{p.capCadence === 'calendar' ? 'Calendar year'
            : `Anniversary${p.capStart ? ` from ${fmtShort(p.capStart)}` : ''}`}</b>
        </div>
        {!r.planKnown && (
          <div className="cmsn-row"><span>Where this plan came from</span><b>the install defaults</b></div>
        )}
        <div className="cmsn-row"><span>Post-cap split</span><b>{p.postCapPct}% to the agent</b></div>
        <div className="cmsn-row"><span>Post-cap transaction fee</span><b>{p.postCapFee > 0 ? usdc(p.postCapFee) : 'none'}</b></div>
        {p.postCapFee > 0 && (
          <div className="cmsn-row"><span>Charged on the capping deal?</span><b>{p.postCapFeeOnStraddle ? 'yes' : 'no'}</b></div>
        )}
        <div className="cmsn-row"><span>Team split</span>
          <b>{p.teamPct > 0 ? `${p.teamPct}%, ${p.teamOrder === 'team-first' ? 'before' : 'after'} the brokerage` : 'none'}</b>
        </div>
        <div className="cmsn-row"><span>Per-transaction fees</span>
          <b>{p.fees.length === 0 ? 'none'
            : p.fees.map(f => `${f.label || 'Fee'} ${f.type === 'pct' ? `${f.value}% of gross` : usdc(f.value)}`).join(' · ')}</b>
        </div>
      </div>

      {locked && (
        <div className="seat-note" style={{ marginTop: 12 }}>
          <Lock size={14} />
          <span>Editing your own split or cap is off by design and cannot be switched on — the database refuses that
            write even if a screen asked it to. If a number here looks wrong, your team leader changes it in Settings.</span>
        </div>
      )}
      {isLeader && (
        <div className="bk-actions" style={{ marginTop: 12 }}>
          <Btn kind="s" sm onClick={() => go('settings', { focus: 'commission', agent: r.user.id })}>
            Edit {isMe ? 'your' : `${firstName(r.user.name)}’s`} plan in Settings
          </Btn>
        </div>
      )}
    </Card>
  );
}

/* --------------------------------------------------------- leader table ---- */

function AgentTable({ rolls, selected, onPick }) {
  return (
    <div className="tbl-wrap">
      <div className="tbl-cap">Per agent — each on their own cap period, because plans differ</div>
      <table className="tbl">
        <thead>
          <tr>
            <th>Agent</th><th>Period</th><th>Closed</th><th>GCI</th><th>Agent net</th>
            <th>Brokerage</th><th>Team</th><th>Fees</th><th>Cap</th><th>Projected</th><th>Fell</th>
          </tr>
        </thead>
        <tbody>
          {rolls.map(r => (
            <tr key={r.user.id} onClick={() => onPick(r.user.id)}
              style={r.user.id === selected ? { background: '#F6F7FC' } : undefined}>
              <td>
                <b>{r.user.name}</b>
                {r.user.active === false ? <> <Tag>inactive</Tag></> : null}
                {!r.planKnown ? <> <Tag>install default plan</Tag></> : null}
              </td>
              <td>{r.period ? r.period.label : '—'}</td>
              <td>{r.closedCount}</td>
              <td>{usd(r.gci)}</td>
              <td><b>{usd(r.net)}</b></td>
              <td>{usd(r.toBrokerage)}</td>
              <td>{usd(r.teamCut)}</td>
              <td>{usd(r.fees)}</td>
              <td>
                {r.plan.cap <= 0 ? <Tag>no cap</Tag>
                  : r.progress.capped ? <Pill color="${BRAND.colors.green}">capped</Pill>
                  : `${usd(r.progress.paid)} / ${usd(r.plan.cap)}`}
              </td>
              <td>{usd(r.projectedNet)}</td>
              <td>{r.fell.length}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
