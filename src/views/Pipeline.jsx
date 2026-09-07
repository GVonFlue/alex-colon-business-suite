/* ============================================================================
   views/Pipeline.jsx — ONE pipeline board, side-aware labels (§3).

   Buyer and seller stages map one-to-one in settings.js, so a card renders the
   label for its OWN side and there is never a second board. Filtering to Buyers
   or Sellers switches the column headers to that side's wording.

   The board itself is the shared `Board` from components/ui.jsx: it carries
   drag-and-drop AND ‹ › arrows on every card. The arrows are the only thing that
   works on a touchscreen, and realtors live on their phones.

   Moving a card into the won stage never silently creates a transaction. It
   asks, because a transaction is a real record with real deadlines attached.
   ========================================================================== */

import React, { useState, useMemo, useEffect } from 'react';
import { Snowflake, TrendingUp, Handshake, ArrowRight, X, Clock, Users } from 'lucide-react';

import { Card, Btn, Tag, Board, Seg, SideChip, Empty, SecTitle } from '../components/ui';
import { stagesOf, stageOf, stageLabel, columnLabel, wonStage } from '../lib/settings';
import { daysUntil, fmtShort, fmtLong } from '../lib/dates';
import { computeCommission } from '../lib/commission';
import { usd, uid, initials } from '../lib/format';
import { ContactModal } from './Contacts';
import { expectedPrice } from '../lib/txn';
import { BRAND } from '../lib/brand';

/* The commission rate used for a FORECAST, before a contract exists. It lives
   in settings (settings.forecastRate) so the pipeline and the dashboard cannot
   drift apart; 3 is the seed the install starts from. */
const FORECAST_FALLBACK = 3;
const forecastRateOf = settings => {
  const r = Number(settings && settings.forecastRate);
  return Number.isFinite(r) && r > 0 ? { rate: r, assumed: false } : { rate: FORECAST_FALLBACK, assumed: true };
};
const rateNoteFor = (rate, assumed) => `Expected gross commission is figured at ${rate}%${assumed
  ? ' — no forecast rate is configured, so this is an assumption'
  : ' — the install\'s forecast rate'}, not a rate anyone has agreed to. The real rate goes on the transaction.`;
const COLD_TOUCH_DAYS = 14;

const daysSince = (iso, tz) => {
  const n = daysUntil(iso, tz);
  return n == null ? null : -n;
};
const agoText = d => (d == null ? 'never touched' : d <= 0 ? 'touched today' : d === 1 ? 'touched yesterday' : `${d}d since contact`);

/** gross commission for a forecast. Money maths stays in commission.js. */
const forecastGross = (price, rate) =>
  computeCommission({ salePrice: price, commissionRate: rate }, {}, {}).gross;

/**
 * The weighted forecast strip and its total.
 *
 * The total sums OPEN stages only. It used to iterate every column including
 * the won one, while the caption underneath said the won column carries
 * nothing — so moving a card into Under Contract made the dashboard forecast
 * fall and this total rise by the same amount.
 *
 * A contact that already has a live or closed transaction is out too, for the
 * same reason the dashboard leaves it out: that money is on the transactions
 * board or already in GCI. A deal that fell through puts its contact back in.
 */
export function weightedForecast(cols, items, transactions, settings, rate) {
  const onTheBoard = new Set();
  (transactions || []).forEach(t => {
    if (t && t.contact_id && t.status !== 'fell') onTheBoard.add(t.contact_id);
  });
  let excluded = 0;
  const per = (cols || []).map(col => {
    const st = stageOf(col.key, settings);
    const all = (items || []).filter(c => c.stage === col.key);
    const carries = !!(st && st.open);
    const list = carries ? all.filter(c => !onTheBoard.has(c.id)) : all;
    if (carries) excluded += all.length - list.length;
    const gross = carries ? list.reduce((s, c) => s + forecastGross(expectedPrice(c), rate), 0) : 0;
    const weighted = carries ? gross * (Number(st.prob) || 0) : 0;
    return { col, st, carries, n: all.length, counted: list.length, gross, weighted };
  });
  return {
    per,
    excluded,
    total: per.reduce((s, x) => s + (x.carries ? x.weighted : 0), 0),
  };
}

export default function Pipeline({ ctx }) {
  const { settings, contacts, tz } = ctx;
  const stages = stagesOf(settings);
  const won = wonStage(settings);
  const teamScope = ctx.isLeader || ctx.can('seeTeamPipeline');
  const { rate: FORECAST_RATE, assumed: rateAssumed } = forecastRateOf(settings);
  const RATE_NOTE = rateNoteFor(FORECAST_RATE, rateAssumed);

  const [filter, setFilter] = useState('all');            // all | buyers | sellers
  const [scope, setScope] = useState('all');              // all | <user id> | pool
  const [openId, setOpenId] = useState(null);
  const [ask, setAsk] = useState(null);                   // { contact, stage } — won-stage confirm

  useEffect(() => {
    if (ctx.params && ctx.params.open) setOpenId(ctx.params.open);
  }, [ctx.params]);

  const sideOf = c => (filter === 'buyers' ? 'buyer' : filter === 'sellers' ? 'seller' : c.side);

  const counts = useMemo(() => {
    const all = contacts || [];
    return {
      all: all.length,
      buyers: all.filter(c => c.side === 'buyer' || c.side === 'both').length,
      sellers: all.filter(c => c.side === 'seller' || c.side === 'both').length,
    };
  }, [contacts]);

  const items = useMemo(() => (contacts || []).filter(c => {
    if (filter === 'buyers' && !(c.side === 'buyer' || c.side === 'both')) return false;
    if (filter === 'sellers' && !(c.side === 'seller' || c.side === 'both')) return false;
    if (teamScope && scope !== 'all') {
      if (scope === 'pool' ? c.owner_id != null : c.owner_id !== scope) return false;
    }
    return true;
  }), [contacts, filter, scope, teamScope]);

  const cols = useMemo(() => stages.map(s => {
    const label = columnLabel(s, filter);
    const short = filter === 'all'
      ? [s.sellerLabel, s.buyerLabel].filter(Boolean).sort((a, b) => a.length - b.length)[0] || s.key
      : label;
    return { key: s.key, label, short, color: s.color };
  }), [stages, filter]);

  /* ------------------------------------------------ weighted forecast strip */
  const forecast = useMemo(
    () => weightedForecast(cols, items, ctx.transactions, settings, FORECAST_RATE),
    [cols, items, ctx.transactions, settings, FORECAST_RATE],
  );

  /* ------------------------------------------------------------ moving cards */
  const moveTo = (contact, stageKey) => {
    if (won && stageKey === won.key) { setAsk({ contact, stage: stageKey }); return; }
    ctx.upsertContact({ ...contact, stage: stageKey });
  };

  const justMove = () => {
    if (!ask) return;
    ctx.upsertContact({ ...ask.contact, stage: ask.stage });
    ctx.flash(`${ask.contact.name} moved to ${stageLabel(ask.stage, sideOf(ask.contact), settings)}.`);
    setAsk(null);
  };

  const createTransaction = () => {
    if (!ask) return;
    const c = ask.contact;
    const id = uid();
    ctx.upsertContact({ ...c, stage: ask.stage });
    ctx.upsertTransaction({
      id,
      owner_id: c.owner_id || ctx.me.id,
      contact_id: c.id,
      side: c.side,                          // 'both' is a real side — dual agency
      phase: 'uc',
      status: 'active',
      address: c.address || '',
      salePrice: expectedPrice(c),
      commissionRate: FORECAST_RATE,
      effectiveDate: ctx.todayIso,
      closeDate: null,
      deadlines: [],
    });
    setAsk(null);
    ctx.go('transactions', { open: id });
  };

  const open = (contacts || []).find(c => c.id === openId) || null;
  const agents = (ctx.users || []).filter(u => u.active !== false);

  /* ------------------------------------------------------------------ card */
  const card = c => {
    const side = sideOf(c);
    const since = daysSince(c.lastTouch, tz);
    const cold = since != null && since > COLD_TOUCH_DAYS;
    const dueN = daysUntil(c.nextActionDue, tz);
    const inPool = c.pool && c.owner_id == null;
    const poolDays = inPool ? daysSince(c.pooled_at || c.created_at, tz) : null;
    const ownerUser = c.owner_id ? ctx.users_by_id[c.owner_id] : null;
    return (
      <>
        <div className="kcard-top">
          <div style={{ minWidth: 0 }}>
            <div className="kn">{c.name}<SideChip side={c.side} /></div>
            <div className="kco">{stageLabel(c.stage, side, settings)}</div>
          </div>
          {teamScope && (
            ownerUser
              ? <span className="kown" title={ownerUser.name}>{initials(ownerUser.name)}</span>
              : <span className="kown" title="Unclaimed — sitting in a pool" style={{ background: '#8E89A8' }}>—</span>
          )}
        </div>

        <div className="kvals">
          <span className="kdv">{priceOf(c)}</span>
          <Tag>{c.source || 'Unknown source'}</Tag>
          {inPool && (
            <span className={'pool-chip' + (poolDays != null && poolDays > 7 ? ' cold' : '')}
              title={c.pooled_at ? `In the pool since ${fmtLong(c.pooled_at)}` : 'No pooled date recorded'}>
              {poolDays == null ? 'in pool' : `${poolDays}d in pool`}
            </span>
          )}
        </div>

        {cold
          ? <div className="kstale cold"><Snowflake size={11} /> {since}d since contact</div>
          : <div className="kstale" style={{ background: '#F1F2F8', color: '#7B76A0' }}><Clock size={11} /> {agoText(since)}</div>}

        {(c.nextAction || c.nextActionDue) && (
          <div className="kwtd" style={{ fontSize: 11.5, marginTop: 7 }}>
            {c.nextAction || 'Next action not set'}
            {c.nextActionDue && (
              <span className={'due ' + dueClass(dueN)} style={{ marginLeft: 6 }}>
                {dueN < 0 ? `${Math.abs(dueN)}d overdue` : dueN === 0 ? 'today' : fmtShort(c.nextActionDue)}
              </span>
            )}
          </div>
        )}
      </>
    );
  };

  return (
    <>
      <div className="toolbar">
        <Seg value={filter} onChange={setFilter} options={[
          { value: 'all', label: 'All', n: counts.all },
          { value: 'buyers', label: 'Buyers', n: counts.buyers },
          { value: 'sellers', label: 'Sellers', n: counts.sellers },
        ]} />
        {teamScope && (
          <select className="selctl" value={scope} onChange={e => setScope(e.target.value)}>
            <option value="all">All agents</option>
            {agents.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            <option value="pool">Unclaimed pool</option>
          </select>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 12.5, color: '#8E89A8' }}>
          {filter === 'buyers' ? 'Buyer-side wording, including contacts doing both.'
            : filter === 'sellers' ? 'Seller-side wording, including contacts doing both.'
            : 'One board. Each card is labelled for its own side.'}
        </span>
      </div>

      {ask && (
        <div className="convert-banner fix" style={{ display: 'block' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Handshake size={17} style={{ color: BRAND.colors.gold, flex: 'none' }} />
            <b>Under contract — start a transaction for {ask.contact.address || ask.contact.name}?</b>
            <button className="kcoll-x" style={{ marginLeft: 'auto' }} onClick={() => setAsk(null)} aria-label="Cancel">
              <X size={13} />
            </button>
          </div>
          <div style={{ fontSize: 12.5, color: '#56527a', margin: '8px 0 10px', lineHeight: 1.5 }}>
            The transaction is where the critical dates live — they get set from the contract when you upload one,
            or from this install's default offsets until then.
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Btn kind="p" sm icon={<ArrowRight size={14} />} onClick={createTransaction}>Create transaction</Btn>
            <Btn kind="g" sm onClick={justMove}>Just move the card</Btn>
          </div>
        </div>
      )}

      <Card
        title="Weighted forecast"
        sub={`Stage probability × expected gross commission, at ${FORECAST_RATE}%. Open stages only.`}
        right={<span className="tag" title={RATE_NOTE}>{FORECAST_RATE}% — {rateAssumed ? 'assumed' : 'install setting'}</span>}>
        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
          {forecast.per.map(x => (
            <div key={x.col.key} title={RATE_NOTE} style={{
              flex: '1 0 150px', minWidth: 150, border: '1px solid #E8E9F2',
              borderTop: `3px solid ${x.col.color}`, borderRadius: 12, padding: '10px 12px',
              opacity: x.carries ? 1 : 0.6,
            }}>
              <div className="kmv-s" style={{ textAlign: 'left' }}>{x.col.label}</div>
              <div className="kdv" style={{ fontSize: 16, marginTop: 5 }}>
                {x.carries ? usd(x.weighted) : '—'}
              </div>
              <div style={{ fontSize: 11.5, color: '#8E89A8', marginTop: 3 }}>
                {x.n} contact{x.n === 1 ? '' : 's'} · {x.carries
                  ? `${Math.round((Number(x.st.prob) || 0) * 100)}% weight${x.counted !== x.n ? ` · ${x.n - x.counted} already on the board` : ''}`
                  : 'carries no forecast'}
              </div>
            </div>
          ))}
        </div>
        <div className="wf-row tot" style={{ marginTop: 12 }}>
          <span className="wl"><TrendingUp size={13} style={{ verticalAlign: -2, marginRight: 6 }} />Weighted pipeline</span>
          <span className="wv" title={RATE_NOTE}>{usd(forecast.total)}</span>
        </div>
        <div className="wf-note">
          Open stages only carry a forecast; the won column is already sold and the lost column carries nothing, so the
          total counts neither. A contact that already has a transaction is left out too — that money shows as “under
          contract” or as closed GCI on the dashboard, and counting it here would count it twice
          {forecast.excluded ? ` (${forecast.excluded} right now)` : ''}. A deal that fell through puts its contact back
          in. Expected gross uses the seller's target price, or the midpoint of a buyer's range.
        </div>
      </Card>

      <SecTitle right={`${items.length} in view`}>Pipeline</SecTitle>

      {items.length === 0 ? (
        <Card>
          <Empty>
            {(contacts || []).length === 0
              ? 'Nothing in the pipeline yet. Add a contact and it appears here at the first stage.'
              : filter !== 'all'
                ? 'No one on that side right now. Switch the filter back to All.'
                : 'Nothing matches that scope. Try All agents.'}
          </Empty>
          {(contacts || []).length === 0 && (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <Btn kind="p" sm icon={<Users size={14} />} onClick={() => ctx.go('contacts')}>Go to contacts</Btn>
            </div>
          )}
        </Card>
      ) : (
        <Board
          cols={cols}
          items={items}
          colOf={c => c.stage}
          onMove={moveTo}
          onOpen={c => setOpenId(c.id)}
          card={card}
          empty="Nothing at this stage"
        />
      )}

      {open && <ContactModal key={open.id} contact={open} ctx={ctx} onClose={() => setOpenId(null)} />}
    </>
  );
}

/* card price: the seller's target, or the buyer's range */
function priceOf(c) {
  if (Number(c.targetPrice) > 0) return usd(c.targetPrice);
  const lo = Number(c.priceMin) || 0, hi = Number(c.priceMax) || 0;
  if (lo && hi && lo !== hi) return `${usd(lo)}–${usd(hi)}`;
  return lo || hi ? usd(lo || hi) : 'No price yet';
}

const dueClass = n => (n == null ? 'far' : n < 0 ? 'over' : n === 0 ? 'today' : n <= 7 ? 'soon' : 'far');
