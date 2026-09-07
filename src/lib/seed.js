/* ============================================================================
   seed.js — demo data.

   Only loaded when VITE_DEMO=1. Every date is computed RELATIVE TO TODAY so the
   demo always has live urgency: one deadline inside 48 hours, one overdue item,
   an agent mid-cap and an agent capped out.

   Obviously-fake people, real-shaped data. Wichita-area addresses because that
   is where ProyTech is; change BRAND + these rows for a different market.
   ========================================================================== */

import { today, addDays, cascade, computeDeadline, dow } from './dates';
import { defaultSettings, offsetsOf, pcsOffsetsOf } from './settings';
import { computeCommission } from './commission';

const T = tz => today(tz);
const d = (base, n) => addDays(base, n);

export const DEMO_USERS = [
  {
    id: 'u-leader', name: 'Jeff Schnell', email: 'jeff@dwellwichita.test', role: 'leader', active: true,
    sections: [], permissions: {}, pools: [],
    plan: { keepPct: 100, cap: 0, postCapPct: 100, postCapFee: 0, teamPct: 0, teamOrder: 'team-first', fees: [], capCadence: 'calendar' },
  },
  {
    id: 'u-marcus', name: 'Marcus Bell', email: 'marcus@dwellwichita.test', role: 'agent', active: true,
    sections: [], pools: ['house'],
    permissions: { seeTeamPipeline: false, seeOtherContacts: false, seeTeamCommission: false, seeOtherCommission: false, books: true, editOwnSplit: false, createPools: false, exportData: false },
    plan: { keepPct: 85, cap: 12000, postCapPct: 100, postCapFee: 285, teamPct: 10, teamOrder: 'team-first', fees: [{ label: 'E&O', type: 'flat', value: 45 }], capCadence: 'calendar' },
  },
  {
    id: 'u-priya', name: 'Priya Raman', email: 'priya@dwellwichita.test', role: 'agent', active: true,
    sections: [], pools: ['house'],
    permissions: { seeTeamPipeline: true, seeOtherContacts: false, seeTeamCommission: false, seeOtherCommission: false, books: true, editOwnSplit: false, createPools: false, exportData: true },
    plan: { keepPct: 80, cap: 10000, postCapPct: 100, postCapFee: 285, teamPct: 0, teamOrder: 'team-first', fees: [{ label: 'E&O', type: 'flat', value: 45 }], capCadence: 'calendar' },
  },
  {
    /* the transaction coordinator: works every closing, sees no money.
       Not a permission toggle — a role, enforced in MIGRATION.sql. */
    id: 'u-robin', name: 'Robin Castellano', email: 'robin@dwellwichita.test', role: 'coordinator', active: true,
    sections: [], pools: [], permissions: {},
    plan: {},
  },
  {
    id: 'u-tom', name: 'Tom Ruiz', email: 'tom@dwellwichita.test', role: 'agent', active: false,
    sections: [], pools: [], permissions: {},
    plan: { keepPct: 80, cap: 10000, postCapPct: 100, postCapFee: 285, teamPct: 0, teamOrder: 'team-first', fees: [], capCadence: 'calendar' },
  },
];

export const DEMO_ACCOUNT = { id: 'main', name: 'Dwell Real Estate Group', seat_limit: 5, contact_url: 'mailto:hello@getproytech.com?subject=Add%20a%20seat' };

/* ------------------------------------------------------------------ contacts
   [name, side, stage, source, owner, priceLow, priceHigh, timeline, daysSinceTouch] */
const C = [
  ['Alicia Monroe',     'seller', 'apptset',   'Sphere of Influence', 'u-marcus', 285000, 310000, '30 days',   1],
  ['Ben & Kara Ortiz',  'buyer',  'apptheld',  'Referral',            'u-marcus', 240000, 275000, 'ASAP',      2],
  ['Curtis Vaughn',     'seller', 'signed',    'Past Client',         'u-marcus', 415000, 415000, '30 days',   1],
  ['Dee Ann Fletcher',  'buyer',  'nurturing', 'Zillow',              'u-marcus', 180000, 215000, '90 days',   9],
  ['Elias Brandt',      'buyer',  'new',       'Sign Call',           'u-marcus', 300000, 350000, '60 days',   0],
  ['Farrah Nsubuga',    'seller', 'active',    'Farming',             'u-marcus', 199000, 199000, 'ASAP',      3],
  ['Gil Hartman',       'both',   'nurturing', 'Past Client',         'u-marcus', 350000, 420000, '6 months', 21],
  ['Hannah Liu',        'buyer',  'offer',     'Open House',          'u-marcus', 265000, 285000, 'ASAP',      1],
  ['Ivan Petrov',       'buyer',  'nurturing', 'Realtor.com',         'u-marcus', 150000, 185000, '12 months+',34],
  ['Jolene Marks',      'seller', 'apptheld',  'Expired',             'u-marcus', 329000, 349000, '30 days',   4],
  ['Kip Delgado',       'buyer',  'new',       'Social',              'u-marcus', 210000, 240000, '90 days',   0],
  ['Lorna Beckett',     'seller', 'nurturing', 'Referral',            'u-marcus', 475000, 520000, '6 months', 12],
  ['Mika Ostrander',    'buyer',  'apptset',   'Website',             'u-marcus', 190000, 225000, '60 days',   2],
  ['Nate Kowalski',     'buyer',  'lost',      'Zillow',              'u-marcus', 160000, 180000, 'ASAP',     46],
  ['Odessa Rhodes',     'seller', 'new',       'FSBO',                'u-marcus', 245000, 265000, '60 days',   1],

  ['Paulo Ferreira',    'buyer',  'apptheld',  'Referral',            'u-priya',  520000, 600000, '30 days',   1],
  ['Quinn Hardesty',    'seller', 'signed',    'Sphere of Influence', 'u-priya',  289000, 289000, 'ASAP',      2],
  ['Rosalind Achebe',   'buyer',  'active',    'Past Client',         'u-priya',  310000, 355000, '30 days',   1],
  ['Sam Trilling',      'seller', 'offer',     'Sign Call',           'u-priya',  399000, 399000, 'ASAP',      0],
  ['Tessa Nakamura',    'buyer',  'nurturing', 'Open House',          'u-priya',  225000, 260000, '90 days',   7],
  ['Ulises Vega',       'buyer',  'new',       'Social',              'u-priya',  175000, 200000, '6 months',  1],
  ['Vera Dunlop',       'seller', 'nurturing', 'Farming',             'u-priya',  610000, 675000, '12 months+',18],
  ['Wendell Barr',      'both',   'apptset',   'Referral',            'u-priya',  340000, 380000, '60 days',   3],
  ['Xochitl Ramos',     'buyer',  'apptheld',  'Website',             'u-priya',  255000, 290000, 'ASAP',      2],
  ['Yusuf Ali',         'seller', 'active',    'Expired',             'u-priya',  365000, 365000, '30 days',   5],
  ['Zadie Coleman',     'buyer',  'lost',      'Realtor.com',         'u-priya',  145000, 165000, 'Just looking', 58],
  ['Aaron Whitlock',    'buyer',  'nurturing', 'Sphere of Influence', 'u-priya',  430000, 480000, '90 days',  11],
  ['Bianca Ruiz',       'seller', 'new',       'Referral',            'u-priya',  275000, 300000, '60 days',   0],

  /* unclaimed — these sit in the House Leads pool and show time-in-pool */
  ['Cody Enright',      'buyer',  'new',       'Zillow',              null,       195000, 220000, 'ASAP',      2],
  ['Delia Frost',       'seller', 'new',       'Sign Call',           null,       320000, 340000, '30 days',   6],
  ['Emmett Zhao',       'buyer',  'new',       'Website',             null,       260000, 290000, '60 days',  14],
  ['Freya Lindqvist',   'buyer',  'new',       'Social',              null,       205000, 230000, '90 days',  23],

  /* past clients — the reactivation and anniversary features need these */
  ['Gordon Selby',      'both',   'nurturing', 'Past Client',         'u-marcus', 300000, 300000, '12 months+',131],
  ['Harriet Vance',     'both',   'nurturing', 'Past Client',         'u-marcus', 265000, 265000, '12 months+',214],
  ['Isaac Mbeki',       'both',   'nurturing', 'Past Client',         'u-priya',  410000, 410000, '12 months+',176],
  ['Junia Alvarez',     'both',   'nurturing', 'Past Client',         'u-priya',  238000, 238000, '12 months+',309],
  ['Kelvin Stroud',     'both',   'nurturing', 'Sphere of Influence', 'u-marcus', 355000, 390000, '6 months',  97],
  ['Liesel Hoffmann',   'seller', 'nurturing', 'Farming',             'u-priya',  289000, 315000, '6 months',  63],
  ['Marco Ferretti',    'buyer',  'nurturing', 'Referral',            'u-marcus', 180000, 205000, '90 days',   41],
  ['Nadia Osei',        'buyer',  'apptset',   'Open House',          'u-priya',  245000, 270000, '30 days',    1],

  /* ---- PCS / relocation families (McConnell AFB) -------------------------
     Flagged in PCS_FAMILIES below. They are ordinary contacts first — a PCS
     family is a contact with a relocation side to their record, not a
     separate species — so they carry the same shape as everybody above and
     the pipeline, contacts and dashboard screens all see them. */
  ['Staff Sgt. Rey Delacruz',  'buyer',  'apptheld',  'Referral',            'u-marcus', 235000, 275000, 'ASAP',      1],
  ['Capt. Nora Whitfield',     'buyer',  'active',    'Website',             'u-marcus', 320000, 380000, '60 days',   2],
  ['MSgt. Owen Baptiste',      'seller', 'signed',    'Past Client',         'u-marcus', 295000, 315000, '30 days',   3],
  ['SrA. Tiana Brooks',        'buyer',  'nurturing', 'Social',              'u-priya',  185000, 215000, '6 months',  5],
  ['Lt. Col. Marisol Ferrand', 'buyer',  'apptset',   'Sphere of Influence', 'u-priya',  440000, 505000, '90 days',   2],
  ['CW3 Devon Achterberg',     'both',   'nurturing', 'Referral',            'u-priya',  260000, 300000, '12 months+', 8],
  ['TSgt. Amara Kingsley',     'buyer',  'nurturing', 'Past Client',         'u-marcus', 245000, 275000, '12 months+', 14],
];

const STREETS = ['N Bluff Ridge Ct', 'S Osage Ave', 'E Central Park Ln', 'W Douglas Ave', 'N Rock Rd',
  'S Hydraulic St', 'E Harry St', 'N Tyler Rd', 'W 21st St N', 'S Seneca St', 'E Kellogg Dr', 'N Woodlawn Blvd'];
const CITY = ['Wichita, KS 67206', 'Wichita, KS 67211', 'Derby, KS 67037', 'Andover, KS 67002', 'Wichita, KS 67212'];
const PROPS = ['Single family', 'Condo / townhome', 'Single family', 'Single family', 'New construction'];
const AREAS = [['College Hill', 'Riverside'], ['East Wichita', 'Andover'], ['Delano', 'Riverside'], ['Derby', 'Haysville'], ['Northeast Heights']];

const slugId = n => 'c-' + n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function mkContact(row, i, base) {
  const [name, side, stage, source, owner, lo, hi, timeline, since] = row;
  const email = name.toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '') + '@example.test';
  const phone = `(316) 555-0${String(100 + i).slice(-3)}`;
  const created = d(base, -(since + 6 + (i % 40)));
  const isPast = source === 'Past Client';
  return {
    id: slugId(name), name, email, phone, side, stage, source,
    owner_id: owner, pool: owner ? null : 'house',
    pooled_at: owner ? null : d(base, -since),
    created_at: created, lastTouch: d(base, -since),
    priceMin: lo, priceMax: hi,
    targetPrice: side === 'seller' ? hi : null,
    preapproval: side === 'seller' ? 'n/a' : (['Pre-approved', 'Pre-qualified', 'In progress', 'Not started', 'Cash'][i % 5]),
    lender: side === 'seller' ? '' : (['Meridian Lending', 'Plains State Bank', 'Rocket', ''][i % 4]),
    timeline, propertyType: PROPS[i % PROPS.length],
    areas: AREAS[i % AREAS.length],
    address: `${1100 + i * 37} ${STREETS[i % STREETS.length]}, ${CITY[i % CITY.length]}`,
    nextAction: stage === 'new' ? 'First call' : stage === 'nurturing' ? 'Check in' : stage === 'apptset' ? 'Confirm appointment' : 'Follow up',
    nextActionDue: d(base, since > 14 ? -1 : (i % 5)),
    beds: 3 + (i % 3), baths: 2,
    notes: isPast ? `Closed with us ${Math.round(since / 30)} months ago. Anniversary outreach candidate.` : '',
    closedWithUsOn: isPast ? d(base, -since) : null,
    appointments: stage === 'apptset' ? [{ id: 'ap-' + i, type: side === 'seller' ? 'listing' : 'consult', at: d(base, 1 + (i % 4)), status: 'booked' }]
      : (stage === 'apptheld' || stage === 'signed' || stage === 'active' || stage === 'offer')
        ? [{ id: 'ap-' + i, type: side === 'seller' ? 'listing' : 'consult', at: d(base, -(since + 2)), status: 'held' }] : [],
    checklist: {},
    activity: [
      { id: 'a1-' + i, at: d(base, -since), kind: 'call', note: `Spoke about ${side === 'seller' ? 'listing timing and price' : 'showings this weekend'}.`, by: owner || 'u-leader' },
      { id: 'a2-' + i, at: created, kind: 'note', note: `Came in from ${source}.`, by: owner || 'u-leader' },
    ],
  };
}

/* ------------------------------------------------------------------ PCS
   Seven military families around McConnell AFB, dated relative to today like
   everything else here, chosen so every branch of the PCS screen has a real
   case behind it rather than a placeholder:

     Delacruz   reports in 26 days against a 120-day plan — the compressed move,
                with five steps already behind him
     Whitfield  the remote buyer, mid-flow: video tour and proxy viewing done,
                power of attorney and remote notary still open
     Baptiste   PCSing OUT — a listing, not a purchase
     Brooks     orders still pending, so there is no report date at all and
                nothing to count from yet
     Ferrand    a comfortable 165 days out, orders already in hand
     Achterberg separating / retiring, tight, with the VA row waived because he
                is going conventional
     Kingsley   already reported, closed, all but the lodging window met

   `report` is days from today. Nothing here is an entitlement figure: tleDays
   is the number of days the member SAID they expect to use, and that is all it
   ever is. */
const PCS_FAMILIES = [
  {
    name: 'Staff Sgt. Rey Delacruz', report: 26,
    met: ['orders', 'brief', 'coe', 'preapproval'],
    pcs: {
      status: 'House hunting', branch: 'Air Force', rank: 'SSgt', moveType: 'PCS in',
      ordersInHand: true, currentStation: 'Nellis AFB, NV', nextStation: 'McConnell AFB',
      remote: false, hhtStart: null, hhtEnd: null, tleDays: 10,
      loanType: 'VA', coeInHand: true, dependents: 3, bedsNeeded: 4,
      pets: '2 dogs, one 70lb', commuteBand: 20,
      commuteNote: '~18 min via Rock Rd outside the gate rush — my own drive, not a calculation',
      notes: 'Orders cut late. He has been at this five weeks, not five months — everything below is already behind and he knows it.',
    },
  },
  {
    name: 'Capt. Nora Whitfield', report: 74,
    met: ['orders', 'brief', 'hhg'],
    remoteDone: { video: -9, proxy: -4 },
    pcs: {
      status: 'House hunting', branch: 'Air Force', rank: 'Capt', moveType: 'PCS in',
      ordersInHand: true, currentStation: 'Ramstein AB, Germany', nextStation: 'McConnell AFB',
      remote: true, hhtStart: null, hhtEnd: null, tleDays: 14,
      loanType: 'VA', coeInHand: false, dependents: 2, bedsNeeded: 3,
      pets: 'one cat', commuteBand: 30,
      commuteNote: 'Andover is roughly 30 minutes for her in the morning — my estimate from driving it',
      notes: 'Eight time zones out. She will buy this house on a video tour and a friend walking it for her.',
    },
  },
  {
    name: 'MSgt. Owen Baptiste', report: 96,
    met: ['orders', 'brief'],
    pcs: {
      status: 'Under contract', branch: 'Air Force', rank: 'MSgt', moveType: 'PCS out',
      ordersInHand: true, currentStation: 'McConnell AFB', nextStation: 'Joint Base Lewis-McChord, WA',
      remote: false, hhtStart: null, hhtEnd: null, tleDays: 7,
      loanType: 'Undecided', coeInHand: false, dependents: 4, bedsNeeded: null,
      pets: '', commuteBand: null, commuteNote: '',
      notes: 'This one is a LISTING — he is selling on the way out and renting at the far end. No purchase on this side.',
    },
  },
  {
    name: 'SrA. Tiana Brooks', report: null,
    pcs: {
      status: 'Orders pending', branch: 'Air Force', rank: 'SrA', moveType: 'PCS in',
      ordersInHand: false, currentStation: 'Sheppard AFB, TX', nextStation: 'McConnell AFB',
      remote: false, hhtStart: null, hhtEnd: null, tleDays: 10,
      loanType: 'VA', coeInHand: false, dependents: 1, bedsNeeded: 2,
      pets: '', commuteBand: 45,
      commuteNote: 'Happy as far out as Derby if the price is right — about 45 minutes by my reckoning',
      notes: 'Her shop told her it is coming. Nothing is signed, so there is no report date to count from yet.',
    },
  },
  {
    name: 'Lt. Col. Marisol Ferrand', report: 165,
    met: ['orders'],
    remoteDone: { video: -3 },
    pcs: {
      status: 'Orders in hand', branch: 'Space Force', rank: 'Lt Col', moveType: 'PCS in',
      ordersInHand: true, currentStation: 'Peterson SFB, CO', nextStation: 'McConnell AFB',
      remote: true, hhtStart: null, hhtEnd: null, tleDays: 10,
      loanType: 'VA', coeInHand: true, dependents: 3, bedsNeeded: 4,
      pets: 'two dogs', commuteBand: 20,
      commuteNote: 'Wants under 20 minutes to the gate. East side, on my own timings.',
      notes: 'The rare one who called early. Everything below has room in it.',
    },
  },
  {
    name: 'CW3 Devon Achterberg', report: 60,
    met: ['orders', 'brief'], waived: ['coe'],
    pcs: {
      status: 'Orders in hand', branch: 'Army', rank: 'CW3', moveType: 'Separating / retiring',
      ordersInHand: true, currentStation: 'Fort Riley, KS', nextStation: 'Staying in Wichita',
      remote: false, hhtStart: null, hhtEnd: null, tleDays: 5,
      loanType: 'Conventional', coeInHand: false, dependents: 2, bedsNeeded: 3,
      pets: '', commuteBand: 30,
      commuteNote: 'No gate to get to any more — 30 minutes is about his tolerance for the new job downtown',
      notes: 'Terminal leave starts before the date below. Going conventional, so the VA row is waived rather than chased.',
    },
  },
  {
    name: 'TSgt. Amara Kingsley', report: -12,
    met: ['orders', 'brief', 'hhg', 'coe', 'preapproval', 'hht', 'hhtend', 'offerby', 'vaappraisal', 'closeby'],
    remoteDone: { video: -78, proxy: -74, poa: -66, esign: -40, utilities: -22 },
    pcs: {
      status: 'Moved out', branch: 'Air Force', rank: 'TSgt', moveType: 'PCS in',
      ordersInHand: true, currentStation: 'Travis AFB, CA', nextStation: 'McConnell AFB',
      remote: true, hhtStart: null, hhtEnd: null, tleDays: 10,
      loanType: 'VA', coeInHand: true, dependents: 2, bedsNeeded: 3,
      pets: 'one dog', commuteBand: 10,
      commuteNote: 'Ten minutes from the gate — I timed it twice',
      notes: 'Closed remotely with a power of attorney two days before she reported. Ask her for the referral.',
    },
  },
];

/**
 * A family's relocation record, including the timeline.
 *
 * Built by the SAME cascade() the contract deadlines use, anchored to the
 * report date, and then re-asked of computeDeadline() with the PCS anchor
 * label so every row explains itself in report-date words instead of
 * effective-date ones. No arithmetic happens in this file.
 */
function mkPcs(fam, contact, settings, base) {
  const p = { ...fam.pcs, isPcs: true };

  /* the remote-buyer flow, with who / when stamps */
  p.remoteSteps = {};
  Object.entries(fam.remoteDone || {}).forEach(([k, days]) => {
    p.remoteSteps[k] = { done: d(base, days), by: contact.owner_id, note: '' };
  });

  if (fam.report == null) return { ...p, reportDate: '', steps: [] };

  const report = d(base, fam.report);
  const { deadlines } = cascade([], {
    effective: report, closeDate: null,
    holidays: settings.dateRules.holidays, rollover: settings.dateRules.rollover,
    offsets: pcsOffsetsOf(settings), assignee: contact.owner_id,
  });
  const steps = deadlines.map(dl => {
    const c = computeDeadline({
      anchorDate: report, offset: dl.offset, count: dl.count, inclusive: dl.inclusive,
      rollover: settings.dateRules.rollover, holidays: settings.dateRules.holidays,
      anchorLabel: 'report date',
    });
    const row = { ...dl, source: 'pcs', rule: c ? c.rule : dl.rule, explain: c ? c.explain : dl.explain };
    if ((fam.met || []).includes(dl.key)) return { ...row, status: 'met', statusBy: contact.owner_id, statusAt: dl.date };
    if ((fam.waived || []).includes(dl.key)) return { ...row, status: 'waived', statusBy: contact.owner_id, statusAt: dl.date };
    return row;
  });
  return { ...p, reportDate: report, steps };
}

/* -------------------------------------------------------------- transactions */
function mkTxn(t, settings, base) {
  const off = offsetsOf(settings).filter(o => !t.skip || !t.skip.includes(o.key));
  const { deadlines } = cascade([], {
    effective: t.effectiveDate, closeDate: t.closeDate,
    holidays: settings.dateRules.holidays, rollover: settings.dateRules.rollover,
    offsets: off, assignee: t.owner_id,
  });
  /* mark the ones that would plainly be done by now */
  const marked = deadlines.map(dl => {
    /* the quoted clause stays on the record whatever the status — a met
       deadline you can still see the contract language for is the point */
    const q = t.quotes ? (t.quotes[dl.key] || '') : '';
    const base = { ...dl, source: t.source || 'default', quote: q, confidence: q ? 0.95 : null };
    if (t.met && t.met.includes(dl.key)) return { ...base, status: 'met', statusBy: t.owner_id, statusAt: dl.date };
    if (t.waived && t.waived.includes(dl.key)) return { ...base, status: 'waived', statusBy: t.owner_id, statusAt: dl.date };
    return base;
  });
  return { ...t, deadlines: marked };
}

export function seedData(tz) {
  const base = T(tz);
  const settings = defaultSettings();
  const contacts = C.map((row, i) => mkContact(row, i, base));

  /* the relocation side of the record, on the contacts that have one */
  PCS_FAMILIES.forEach(fam => {
    const c = contacts.find(x => x.id === slugId(fam.name));
    if (c) c.pcs = mkPcs(fam, c, settings, base);
  });

  /* --- live transactions ------------------------------------------------ */
  const txnDefs = [
    {
      id: 't-bluffridge', owner_id: 'u-marcus', contact_id: slugId('Curtis Vaughn'), side: 'seller',
      phase: 'inspection', status: 'active',
      address: '4412 N Bluff Ridge Ct, Wichita, KS 67206', mls: 'W-661204',
      salePrice: 415000, commissionRate: 3, referralOutType: 'flat', referralOut: 0,
      effectiveDate: d(base, -11), closeDate: d(base, 19),
      coopAgent: 'Renée Colton', coopBrokerage: 'Prairie Gate Realty',
      titleCompany: 'Arkansas River Title', lender: 'Plains State Bank',
      earnestAmount: 4000,
      source: 'contract',
      /* Deliberate shape for a demo: most things done, ONE overdue (the HOA
         documents the seller has not produced — the most common real one), and
         the inspection objection deadline landing tomorrow so the 48-hour flag
         is visible without anyone having to imagine it. */
      met: ['earnest', 'title', 'inspend', 'apprordered'],
      quotes: {
        earnest: 'Buyer shall deliver the Earnest Money to the Escrow Agent within three (3) business days after the Effective Date.',
        inspend: 'Buyer shall have ten (10) days after the Effective Date to complete all inspections.',
        inspobj: 'Buyer shall deliver written objections no later than twelve (12) days after the Effective Date.',
        sellerresp: 'Seller shall respond in writing within fourteen (14) days of the Effective Date.',
        financing: 'Buyer shall obtain a written loan commitment within twenty-five (25) days of the Effective Date.',
        closing: 'Closing shall occur on or before the date set forth in Section 4 of this Agreement.',
      },
      notes: 'Roof age flagged in the listing — expect an objection.',
      contractName: 'Vaughn_4412_Bluff_Ridge_Contract.pdf',
    },
    {
      id: 't-osage', owner_id: 'u-marcus', contact_id: slugId('Hannah Liu'), side: 'buyer',
      phase: 'uc', status: 'active',
      address: '1209 S Osage Ave, Wichita, KS 67213', mls: 'W-660877',
      salePrice: 268500, commissionRate: 2.7, referralOutType: 'pct', referralOut: 25,
      effectiveDate: d(base, -4), closeDate: d(base, 26),
      coopAgent: 'Doug Aimes', coopBrokerage: 'Heartland Homes',
      titleCompany: 'Sedgwick Title Co', lender: 'Meridian Lending',
      earnestAmount: 2500,
      met: [],
      notes: 'Zillow referral — 25% referral fee off the top.',
    },
    {
      id: 't-centralpark', owner_id: 'u-priya', contact_id: slugId('Rosalind Achebe'), side: 'buyer',
      phase: 'ctc', status: 'active',
      address: '8830 E Central Park Ln, Wichita, KS 67206', mls: 'W-659140',
      salePrice: 342000, commissionRate: 3, referralOutType: 'flat', referralOut: 0,
      effectiveDate: d(base, -24), closeDate: d(base, 6),
      coopAgent: 'Marlene Fitch', coopBrokerage: 'Summit & Vine Realty',
      titleCompany: 'Arkansas River Title', lender: 'Rocket',
      earnestAmount: 3500,
      met: ['earnest', 'inspend', 'inspobj', 'sellerresp', 'apprordered', 'apprrecd', 'title', 'titleobj', 'survey'],
      waived: ['hoadocs', 'hoareview'],
      notes: 'Clear to close. Walkthrough the day before.',
    },
  ];

  /* --- closed + fell through ------------------------------------------- */
  const closedDefs = [
    { id: 't-tyler', owner_id: 'u-marcus', contact_id: slugId('Gordon Selby'), side: 'seller', phase: 'closed', status: 'closed',
      address: '2255 N Tyler Rd, Wichita, KS 67205', salePrice: 289000, commissionRate: 3,
      referralOutType: 'flat', referralOut: 0, effectiveDate: d(base, -150), closeDate: d(base, -118), closedActual: d(base, -118) },
    { id: 't-harry', owner_id: 'u-marcus', contact_id: slugId('Harriet Vance'), side: 'buyer', phase: 'closed', status: 'closed',
      address: '710 E Harry St, Wichita, KS 67211', salePrice: 205000, commissionRate: 3,
      referralOutType: 'flat', referralOut: 0, effectiveDate: d(base, -95), closeDate: d(base, -64), closedActual: d(base, -64) },
    { id: 't-seneca', owner_id: 'u-priya', contact_id: slugId('Isaac Mbeki'), side: 'seller', phase: 'closed', status: 'closed',
      address: '3140 S Seneca St, Wichita, KS 67217', salePrice: 412000, commissionRate: 3,
      referralOutType: 'flat', referralOut: 0, effectiveDate: d(base, -190), closeDate: d(base, -160), closedActual: d(base, -160) },
    { id: 't-woodlawn', owner_id: 'u-priya', contact_id: slugId('Junia Alvarez'), side: 'buyer', phase: 'closed', status: 'closed',
      address: '5501 N Woodlawn Blvd, Bel Aire, KS 67220', salePrice: 468000, commissionRate: 3,
      referralOutType: 'flat', referralOut: 0, effectiveDate: d(base, -120), closeDate: d(base, -88), closedActual: d(base, -88) },
    { id: 't-hydraulic', owner_id: 'u-priya', contact_id: slugId('Yusuf Ali'), side: 'seller', phase: 'closed', status: 'closed',
      address: '1808 S Hydraulic St, Wichita, KS 67211', salePrice: 356000, commissionRate: 3,
      referralOutType: 'flat', referralOut: 0, effectiveDate: d(base, -70), closeDate: d(base, -38), closedActual: d(base, -38) },
    /* Two more for agent A so she reads as genuinely mid-cap rather than barely
       started — the cap meter is only interesting part-way up. */
    { id: 't-21st', owner_id: 'u-marcus', contact_id: slugId('Kelvin Stroud'), side: 'seller', phase: 'closed', status: 'closed',
      address: '4127 W 21st St N, Wichita, KS 67205', salePrice: 385000, commissionRate: 3,
      referralOutType: 'flat', referralOut: 0, effectiveDate: d(base, -78), closeDate: d(base, -46), closedActual: d(base, -46) },
    { id: 't-rockrd', owner_id: 'u-marcus', contact_id: slugId('Marco Ferretti'), side: 'buyer', phase: 'closed', status: 'closed',
      address: '9012 N Rock Rd, Wichita, KS 67226', salePrice: 450000, commissionRate: 3,
      referralOutType: 'flat', referralOut: 0, effectiveDate: d(base, -54), closeDate: d(base, -22), closedActual: d(base, -22) },
    /* And one for agent B that STRADDLES her cap: she has ~2.6k of a 10k cap
       left going in and this deal owes the brokerage ~3k, so part of it finishes
       the cap and the rest runs at her post-cap split. It is the case every
       other realtor CRM gets wrong, so the demo has one on the books. */
    { id: 't-collegehill', owner_id: 'u-priya', contact_id: slugId('Aaron Whitlock'), side: 'buyer', phase: 'closed', status: 'closed',
      address: '215 N Belmont Ave, Wichita, KS 67208', salePrice: 500000, commissionRate: 3,
      referralOutType: 'flat', referralOut: 0, effectiveDate: d(base, -40), closeDate: d(base, -9), closedActual: d(base, -9) },
    /* fell through is an OUTCOME, not a delete — realtors need to see where deals die */
    { id: 't-kellogg', owner_id: 'u-marcus', contact_id: slugId('Nate Kowalski'), side: 'buyer', phase: 'fell', status: 'fell',
      address: '9902 E Kellogg Dr, Wichita, KS 67207', salePrice: 178000, commissionRate: 3,
      referralOutType: 'flat', referralOut: 0, effectiveDate: d(base, -52), closeDate: d(base, -20),
      fellReason: 'Financing denied at underwriting', fellPhase: 'financing', fellAt: d(base, -31) },
  ];

  const transactions = [...txnDefs, ...closedDefs].map(t => mkTxn(t, settings, base));

  /* snapshot cap contributions in close order, per agent, exactly as the real
     app does when a transaction is marked closed */
  const paid = {};
  transactions
    .filter(t => t.status === 'closed')
    .sort((a, b) => String(a.closeDate).localeCompare(String(b.closeDate)))
    .forEach(t => {
      const u = DEMO_USERS.find(x => x.id === t.owner_id);
      const before = paid[t.owner_id] || 0;
      const calc = computeCommission(t, u.plan, { capPaidToDate: before });
      paid[t.owner_id] = before + calc.capContribution;
      t.capContribution = calc.capContribution;
      t.commissionSnapshot = { gross: calc.gross, agentNet: calc.agentNet, toBrokerage: calc.toBrokerage, teamCut: calc.teamCut, at: t.closeDate };
    });

  /* --- tasks ------------------------------------------------------------ */
  const tasks = [
    { id: 'tk-1', user_id: 'u-marcus', contact_id: slugId('Alicia Monroe'), due: d(base, 0), done: false, title: 'Prep CMA for listing appointment', kind: 'prep' },
    { id: 'tk-2', user_id: 'u-marcus', transaction_id: 't-bluffridge', due: d(base, 1), done: false, title: 'Collect inspection objections from buyer agent', kind: 'deadline' },
    { id: 'tk-3', user_id: 'u-marcus', contact_id: slugId('Dee Ann Fletcher'), due: d(base, -2), done: false, title: 'Follow up — no contact in 9 days', kind: 'followup' },
    { id: 'tk-4', user_id: 'u-priya', transaction_id: 't-centralpark', due: d(base, 5), done: false, title: 'Schedule final walkthrough', kind: 'deadline' },
    { id: 'tk-5', user_id: 'u-priya', contact_id: slugId('Sam Trilling'), due: d(base, 0), done: false, title: 'Present two offers side by side', kind: 'offer' },
    { id: 'tk-6', user_id: 'u-priya', contact_id: slugId('Vera Dunlop'), due: d(base, 3), done: false, title: 'Send 6-month market update', kind: 'followup' },
    { id: 'tk-7', user_id: 'u-marcus', transaction_id: 't-osage', due: d(base, -1), done: true, title: 'Wire earnest money instructions to buyer', kind: 'deadline' },
  ];

  /* --- expenses: per agent, private to that agent (§7) ------------------ */
  const exp = (id, user, days, amount, category, note, miles) => ({
    id, user_id: user, spentOn: d(base, -days), amount, category, note, miles: miles || null,
    receiptPath: null, source: 'manual',
  });
  const expenses = [
    exp('e-1', 'u-marcus', 3, 84.5, 'Marketing', 'Facebook ads — Bluff Ridge listing'),
    exp('e-2', 'u-marcus', 6, 41.3, 'Mileage', 'Showings loop, east side', 59),
    exp('e-3', 'u-marcus', 12, 350, 'Photography', 'Vaughn listing photos + drone'),
    exp('e-4', 'u-marcus', 19, 62, 'Signage & lockboxes', 'Two lockboxes'),
    exp('e-5', 'u-marcus', 26, 128, 'MLS & dues', 'Quarterly MLS'),
    exp('e-6', 'u-marcus', 33, 47.8, 'Client gifts', 'Closing gift — Vance'),
    exp('e-7', 'u-priya', 2, 210, 'Staging', 'Consult for Hardesty listing'),
    exp('e-8', 'u-priya', 5, 33.6, 'Mileage', 'Andover showings', 48),
    exp('e-9', 'u-priya', 9, 96, 'Meals', 'Buyer consult lunch x3'),
    exp('e-10', 'u-priya', 15, 425, 'Marketing', 'Farming postcards — 67206'),
    exp('e-11', 'u-priya', 22, 128, 'MLS & dues', 'Quarterly MLS'),
    exp('e-12', 'u-priya', 30, 189, 'CE & licensing', 'CE hours renewal'),
    /* the team leader's own, brokerage-level. She cannot see the agents' rows. */
    exp('e-13', 'u-leader', 4, 899, 'Software', 'CRM + e-sign, team wide'),
    exp('e-14', 'u-leader', 11, 1250, 'Marketing', 'Team billboard, Kellogg & Rock'),
    exp('e-15', 'u-leader', 25, 340, 'Office', 'Suite internet + phones'),
    exp('e-16', 'u-robin', 8, 62, 'Office', 'Courier runs to title'),
  ];

  /* --- contract on file for the flagship transaction -------------------- */
  const contracts = [{
    id: 'ct-1', owner_id: 'u-marcus', transaction_id: 't-bluffridge',
    filename: 'Vaughn_4412_Bluff_Ridge_Contract.pdf',
    path: 'u-marcus/t-bluffridge/Vaughn_4412_Bluff_Ridge_Contract.pdf',
    uploaded_at: d(base, -11) + 'T15:04:00.000Z',
    extracted: { fields: 14, lowConfidence: 1, confirmedBy: 'u-marcus', confirmedAt: d(base, -11) },
    delete_after: d(base, 2545),
  }];

  /* --- huddle ---------------------------------------------------------- */
  const huddle = {
    weekOf: d(base, -(dow(base) === 0 ? 6 : dow(base) - 1)),
    wins: ['Central Park is clear to close — 3 days early.', 'Vaughn listing had 14 showings in the first weekend.'],
    misses: ['Two pool leads have sat unclaimed for 2+ weeks.'],
    focus: ['Inspection objections on Bluff Ridge land tomorrow.', 'Financing commitment on Osage is 21 days out — start chasing now.'],
    numbers: { apptsSet: 7, apptsHeld: 5, agreementsSigned: 2, underContract: 1, closed: 1 },
    notes: 'Price review on Farrah Nsubuga hits 14 days on Thursday.',
  };

  /* DEMO_USERS and DEMO_ACCOUNT are module constants, so they must be COPIED
     out — the demo adapter mutates users (adding a seat, deactivating one) and
     without the copy a reset would hand back the mutated array and "resets on
     refresh" would quietly be false. */
  return {
    users: JSON.parse(JSON.stringify(DEMO_USERS)),
    account: JSON.parse(JSON.stringify(DEMO_ACCOUNT)),
    contacts, transactions, tasks, expenses, contracts, settings, huddle,
  };
}
