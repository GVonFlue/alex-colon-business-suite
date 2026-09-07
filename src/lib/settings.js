/* ============================================================================
   settings.js — CONFIG OVER FORK.

   Ground rule 2 from the brief: anything a different brokerage would change
   belongs here, not in component code. Stages, phases, checklist items,
   appointment types, split rules, critical-date offsets, dashboard layout,
   holiday list, permissions, lead pools, mileage rate, retention.

   Nothing in this file is a domain fact. Every number is a seed a brokerage
   edits in Settings on day one.

   No React, no env, no Supabase — importable from tests and from api/ routes.
   ========================================================================== */

import { seedHolidays } from './dates';

const COBALT = '#1338DE', INDIGO = '#3B3470', GOLD = '#C8A24A', GREEN = '#1F9D55', RED = '#D14343';

/* ---------------------------------------------------------------- stages
   ONE pipeline. Buyer and seller stages map one-to-one, so a card renders the
   label for its own side. Two boards would split the funnel for no gain. */
export const DEFAULT_STAGES = [
  { key: 'new',       sellerLabel: 'New Lead',                 buyerLabel: 'New Lead',              color: '#6B73C9', prob: 0.05, open: true,  won: false, lost: false },
  { key: 'nurturing', sellerLabel: 'Contacted / Nurturing',    buyerLabel: 'Contacted / Nurturing', color: '#5C76EE', prob: 0.12, open: true,  won: false, lost: false },
  { key: 'apptset',   sellerLabel: 'Listing Appt Set',         buyerLabel: 'Buyer Consult Set',     color: COBALT,    prob: 0.25, open: true,  won: false, lost: false },
  { key: 'apptheld',  sellerLabel: 'Listing Appt Held',        buyerLabel: 'Buyer Consult Held',    color: '#7A5CC8', prob: 0.45, open: true,  won: false, lost: false },
  { key: 'signed',    sellerLabel: 'Listing Agreement Signed', buyerLabel: 'Buyer Agreement Signed',color: GOLD,      prob: 0.65, open: true,  won: false, lost: false },
  { key: 'active',    sellerLabel: 'Live on Market',           buyerLabel: 'Actively Showing',      color: '#D98A3D', prob: 0.75, open: true,  won: false, lost: false },
  { key: 'offer',     sellerLabel: 'Offer Received',           buyerLabel: 'Offer Submitted',       color: '#2BA7A0', prob: 0.85, open: true,  won: false, lost: false },
  { key: 'contract',  sellerLabel: 'Under Contract',           buyerLabel: 'Under Contract',        color: GREEN,     prob: 1.00, open: false, won: true,  lost: false },
  { key: 'lost',      sellerLabel: 'Lost / Withdrawn',         buyerLabel: 'Lost',                  color: '#B0606A', prob: 0,    open: false, won: false, lost: true },
];

/* ------------------------------------------------------- transaction phases
   The closing pipeline. A contact that reaches Under Contract appears here. */
export const DEFAULT_PHASES = [
  { key: 'uc',        label: 'Under Contract', color: '#6B73C9' },
  { key: 'inspection',label: 'Inspection',     color: COBALT },
  { key: 'appraisal', label: 'Appraisal',      color: '#7A5CC8' },
  { key: 'financing', label: 'Financing',      color: GOLD },
  { key: 'ctc',       label: 'Clear to Close', color: '#2BA7A0' },
  { key: 'closed',    label: 'Closed',         color: GREEN,  terminal: true },
  { key: 'fell',      label: 'Fell Through',   color: '#B0606A', terminal: true, lost: true },
];

/* ------------------------------------------------------- critical dates
   Offsets are DAYS FROM THE EFFECTIVE (binding) DATE unless anchor='close'.
   `count` is per deadline and shown on screen. `inclusive` false means day one
   is the day AFTER the effective date — the usual contract reading.
   These are seeds. Every brokerage edits them. */
export const DEFAULT_OFFSETS = [
  { key: 'earnest',    label: 'Earnest money delivered',   offset: 3,  count: 'business', inclusive: false, anchor: 'effective', reminders: null },
  { key: 'inspend',    label: 'Inspection period ends',    offset: 10, count: 'calendar', inclusive: false, anchor: 'effective', reminders: null },
  { key: 'inspobj',    label: 'Inspection objections due', offset: 12, count: 'calendar', inclusive: false, anchor: 'effective', reminders: null },
  { key: 'sellerresp', label: 'Seller response due',       offset: 14, count: 'calendar', inclusive: false, anchor: 'effective', reminders: null },
  { key: 'apprordered',label: 'Appraisal ordered',         offset: 7,  count: 'business', inclusive: false, anchor: 'effective', reminders: null },
  { key: 'apprrecd',   label: 'Appraisal received',        offset: 21, count: 'calendar', inclusive: false, anchor: 'effective', reminders: null },
  { key: 'financing',  label: 'Financing commitment',      offset: 25, count: 'calendar', inclusive: false, anchor: 'effective', reminders: null },
  { key: 'title',      label: 'Title commitment delivered',offset: 14, count: 'calendar', inclusive: false, anchor: 'effective', reminders: null },
  { key: 'titleobj',   label: 'Title objections due',      offset: 19, count: 'calendar', inclusive: false, anchor: 'effective', reminders: null },
  { key: 'survey',     label: 'Survey delivered',          offset: 17, count: 'calendar', inclusive: false, anchor: 'effective', reminders: null },
  { key: 'hoadocs',    label: 'HOA documents delivered',   offset: 10, count: 'calendar', inclusive: false, anchor: 'effective', reminders: null },
  { key: 'hoareview',  label: 'HOA review period ends',    offset: 15, count: 'calendar', inclusive: false, anchor: 'effective', reminders: null },
  { key: 'walkthrough',label: 'Final walkthrough',         offset: -1, count: 'calendar', inclusive: false, anchor: 'close',     reminders: null },
  { key: 'closing',    label: 'Closing',                   offset: 0,  count: 'calendar', inclusive: false, anchor: 'close',     reminders: null },
];


/* ------------------------------------------------------- PCS / relocation
   Dwell's differentiator: military moves around McConnell AFB. A PCS is driven
   by the ORDERS, not by a contract — the whole timeline hangs off the report
   date (RNLTD, "report no later than date"), which exists months before there
   is a property. Every offset below is DAYS FROM THE REPORT DATE, negative =
   before it, and every one is a setting because the services and the family's
   situation change what is realistic.

   Nothing here is entitlement advice. The app counts days and shows what the
   member told us; it does not compute a BAH rate, decide TLE eligibility or
   interpret a VA benefit. Those are the finance office's job and the screen
   says so. */
export const DEFAULT_PCS_OFFSETS = [
  { key: 'orders',      label: 'Orders in hand',                     offset: -120, count: 'calendar', anchor: 'report' },
  { key: 'brief',       label: 'Relocation call held',               offset: -105, count: 'calendar', anchor: 'report' },
  { key: 'hhg',         label: 'Household goods / movers booked',    offset: -75,  count: 'calendar', anchor: 'report' },
  { key: 'coe',         label: 'VA Certificate of Eligibility',      offset: -70,  count: 'calendar', anchor: 'report' },
  { key: 'preapproval', label: 'Lender pre-approval in hand',        offset: -65,  count: 'calendar', anchor: 'report' },
  { key: 'hht',         label: 'House-hunting trip window opens',    offset: -55,  count: 'calendar', anchor: 'report' },
  { key: 'hhtend',      label: 'House-hunting trip window closes',   offset: -45,  count: 'calendar', anchor: 'report' },
  { key: 'offerby',     label: 'Under contract by',                  offset: -42,  count: 'calendar', anchor: 'report' },
  { key: 'vaappraisal', label: 'VA appraisal ordered',               offset: -35,  count: 'calendar', anchor: 'report' },
  { key: 'closeby',     label: 'Close by',                           offset: -10,  count: 'calendar', anchor: 'report' },
  { key: 'tleends',     label: 'Temporary lodging window ends',      offset: 10,   count: 'calendar', anchor: 'report' },
];

export const DEFAULT_PCS = {
  enabled: true,
  installation: {
    name: 'McConnell AFB',
    address: 'McConnell AFB, Wichita, KS 67221',
    /* the commute filter is a plain drive-time estimate the agent enters — the
       app does not call a mapping service */
    commuteBands: [10, 20, 30, 45],
  },
  branches: ['Air Force', 'Army', 'Navy', 'Marine Corps', 'Space Force', 'Coast Guard', 'National Guard', 'Reserve', 'DoD civilian', 'Contractor'],
  moveTypes: ['PCS in', 'PCS out', 'Separating / retiring', 'Base housing to off-base', 'Not military'],
  loanTypes: ['VA', 'Conventional', 'FHA', 'Cash', 'USDA', 'Undecided'],
  statuses: ['Orders pending', 'Orders in hand', 'House hunting', 'Under contract', 'Closed', 'Moved out'],
  offsets: DEFAULT_PCS_OFFSETS,
  /* days of temporary lodging the member expects to use — a number they tell
     us, used only to show the clock. Not an entitlement calculation. */
  tleDefaultDays: 10,
  remoteBuyerSteps: [
    { key: 'video',     label: 'Video tour walkthrough done' },
    { key: 'proxy',     label: 'Local proxy / friend viewing arranged' },
    { key: 'poa',       label: 'Power of attorney on file (if closing remotely)' },
    { key: 'esign',     label: 'E-sign and remote notary confirmed' },
    { key: 'utilities', label: 'Utilities and keys handoff planned' },
  ],
  disclaimer: 'Dates and checklists only. Nothing here calculates BAH, decides TLE or DLA eligibility, or interprets a VA benefit — that is the finance office and the lender.',
};

/* --------------------------------------------------------------- checklists */
export const DEFAULT_CHECKLISTS = {
  listing: [
    { key: 'prelist',    label: 'Pre-listing paperwork' },
    { key: 'cma',        label: 'CMA prepared' },
    { key: 'agreement',  label: 'Listing agreement signed' },
    { key: 'photos_sch', label: 'Photos scheduled' },
    { key: 'photos_recd',label: 'Photos received' },
    { key: 'mls',        label: 'MLS entered' },
    { key: 'sign',       label: 'Sign installed' },
    { key: 'lockbox',    label: 'Lockbox placed' },
    { key: 'marketing',  label: 'Marketing launched' },
    { key: 'openhouse',  label: 'Open house scheduled' },
    { key: 'feedback',   label: 'Showing feedback logged' },
    { key: 'pricereview',label: 'Price review at 14 days', dueOffset: 14 },
  ],
  buyer: [
    { key: 'bagreement', label: 'Buyer agreement signed' },
    { key: 'preapproval',label: 'Pre-approval received' },
    { key: 'criteria',   label: 'Search criteria set' },
    { key: 'showings',   label: 'Showings booked' },
    { key: 'offerwrite', label: 'Offer written' },
    { key: 'offersub',   label: 'Offer submitted' },
  ],
};

/* ------------------------------------------------------------------ sources */
export const DEFAULT_SOURCES = [
  'Sphere of Influence', 'Past Client', 'Referral', 'Open House', 'Sign Call',
  'Zillow', 'Realtor.com', 'Social', 'Website', 'FSBO', 'Expired', 'Farming', 'Other',
];

/* ------------------------------------------------- appointments / meetings
   `counts` decides whether the type is a real sales conversation for the
   appointment-to-close ratio. Same rule as the source repo. */
export const DEFAULT_APPT_TYPES = [
  { key: 'listing',   label: 'Listing appointment', counts: true },
  { key: 'consult',   label: 'Buyer consultation',  counts: true },
  { key: 'showing',   label: 'Showing',             counts: false },
  { key: 'openhouse', label: 'Open house',          counts: false },
  { key: 'closing',   label: 'Closing',             counts: false },
  { key: 'checkin',   label: 'Check-in / coffee',   counts: false },
  { key: 'inspection',label: 'Inspection',          counts: false },
];

/* ------------------------------------------------------------- permissions
   Defaults CLOSED. A UI filter is not a permission — these mirror what the RLS
   policies allow, they do not replace them (see MIGRATION.sql). */
export const PERMISSION_KEYS = [
  { key: 'seeTeamPipeline',   label: 'See team-wide pipeline',       def: false },
  { key: 'seeOtherContacts',  label: "See other agents' contacts",   def: false },
  { key: 'seeTeamCommission', label: 'See team commission totals',   def: false },
  { key: 'seeOtherCommission',label: "See other agents' commission", def: false },
  { key: 'books',             label: 'Access The Books',             def: true,  note: 'own expenses only' },
  { key: 'editOwnSplit',      label: 'Edit their own split/cap settings', def: false, locked: true, note: 'never' },
  { key: 'createPools',       label: 'Create lead pools',            def: false },
  { key: 'exportData',        label: 'Export data',                  def: false },
];
export const defaultPermissions = () => {
  const o = {};
  PERMISSION_KEYS.forEach(p => { o[p.key] = p.def; });
  return o;
};

/* --------------------------------------------------------------- dashboard */
export const DASH_SECTIONS = [
  { key: 'dates',    label: 'Critical dates due' },
  { key: 'pipeline', label: 'Pipeline & production' },
  { key: 'cap',      label: 'Cap progress' },
  { key: 'activity', label: 'Activity & health' },
  { key: 'txsummary',label: 'Transactions board summary' },
  { key: 'funnel',   label: 'Conversion funnel' },
  { key: 'source',   label: 'Lead source ROI' },
  { key: 'scorecard',label: 'Team scorecard', leaderOnly: true },
  { key: 'followups',label: 'Follow-ups and hot leads' },
];

/* ----------------------------------------------------------------- modules */
export const SECTIONS = [
  { key: 'dashboard',    label: 'Dashboard' },
  /* The label is the tenant's AI_NAME, substituted where it is rendered.
     settings.js stays free of brand.js on purpose: it is a pure data module,
     and importing brand drags import.meta.env into every bundle that touches
     it — which is what the scoping suite caught the moment I tried. */
  { key: 'assistant',    label: 'Assistant' },
  { key: 'tasks',        label: 'Tasks' },
  { key: 'activity',     label: 'Activity' },
  { key: 'pcs',          label: 'PCS / Relocation' },
  { key: 'pipeline',     label: 'Pipeline' },
  { key: 'contacts',     label: 'Contacts' },
  { key: 'transactions', label: 'Transactions' },
  { key: 'contracts',    label: 'Contracts' },
  { key: 'commission',   label: 'Commission' },
  { key: 'books',        label: 'The Books' },
  { key: 'tools',        label: 'AI Tools' },
  { key: 'huddle',       label: 'Monday Huddle' },
  { key: 'settings',     label: 'Settings', leaderOnly: true },
];
export const DEFAULT_AGENT_SECTIONS = ['dashboard', 'assistant', 'tasks', 'activity', 'activity', 'pcs', 'pipeline', 'contacts', 'transactions', 'contracts', 'commission', 'books', 'tools'];
/* A transaction coordinator works the closing pipeline and the dates. They see
   no commission and no expenses — not by a toggle, by policy (MIGRATION.sql). */
export const DEFAULT_COORDINATOR_SECTIONS = ['dashboard', 'assistant', 'tasks', 'pcs', 'pipeline', 'contacts', 'transactions', 'contracts', 'tools'];
export const ROLES = [
  { key: 'leader',      label: 'Team leader',            note: 'everything, sets all permissions' },
  { key: 'agent',       label: 'Agent',                  note: 'own contacts, transactions, commission and expenses' },
  { key: 'coordinator', label: 'Transaction coordinator', note: 'every transaction and deadline; no commission, no expenses' },
];

/* ------------------------------------------------------------ the defaults */
export function defaultSettings() {
  const year = +String(new Date().getUTCFullYear());
  return {
    version: 1,

    /* brand — editable so a brokerage can rename itself without a redeploy */
    brand: { name: '', logo: '', cobalt: '', ink: '' },

    stages: DEFAULT_STAGES,
    phases: DEFAULT_PHASES,
    offsets: DEFAULT_OFFSETS,
    checklists: DEFAULT_CHECKLISTS,
    sources: DEFAULT_SOURCES,
    apptTypes: DEFAULT_APPT_TYPES,
    propertyTypes: ['Single family', 'Condo / townhome', 'Multi-family', 'Land', 'New construction', 'Manufactured', 'Commercial'],
    timelines: ['ASAP', '30 days', '60 days', '90 days', '6 months', '12 months+', 'Just looking'],
    preapprovalStatuses: ['Not started', 'In progress', 'Pre-qualified', 'Pre-approved', 'Cash'],

    /* counting rules (§4b) */
    dateRules: {
      rollover: 'forward',        // 'forward' | 'stand' | 'back'  — confirmed default
      inclusiveDefault: false,    // exclusive start is the default and is shown on screen
      holidays: seedHolidays(year - 1, 4),
      tz: 'America/Chicago',
    },

    /* reminders (§4c) */
    reminders: {
      escalation: [7, 1, 0],      // days before; 0 = morning of
      dailyWhenOverdue: true,
      recipients: { assignedAgent: true, coordinator: false, client: false },
      coordinatorEmail: '',
      hardFlagHours: 48,
    },

    /* contracts (§4a storage + privacy) */
    contracts: {
      retentionMonths: 84,        // 7 years — confirmed default
      hardDelete: true,           // removes the storage object, not just the row
      allowExternalSend: false,   // ask before sending contract text anywhere but the Anthropic API
      model: 'claude-sonnet-5',        // the model contract extraction uses
    },

    /* commission — per-agent plans live on the user row; these are the seeds
       a team leader starts from when adding a seat */
    commissionDefaults: {
      keepPct: 85, cap: 12000, postCapPct: 100, postCapFee: 285,
      postCapFeeOnStraddle: false,
      teamPct: 0, teamOrder: 'team-first',       // confirmed default
      fees: [{ label: 'E&O', type: 'flat', value: 45 }],
      capCadence: 'anniversary',
    },

    /* the books */
    books: {
      mileageRate: 0.70,                          // IRS rate — a setting, not a constant
      categories: ['Mileage', 'Marketing', 'Signage & lockboxes', 'Photography', 'Staging',
        'MLS & dues', 'CE & licensing', 'Client gifts', 'Meals', 'Software', 'Office', 'Other'],
      leaderSeesAgentExpenses: false,             // §7 — deliberate, confirmed
    },

    /* lead pools (§6) */
    pools: [{ key: 'house', name: 'House Leads', agents: [] }],

    pcs: DEFAULT_PCS,

    /* dashboard layout */
    dashOrder: DASH_SECTIONS.map(s => s.key),
    dashHidden: [],

    /* which sections this install shows at all */
    modules: SECTIONS.map(s => s.key),

    /* The commission rate used to FORECAST open pipeline. It is an assumption,
       it is stated on screen wherever it is used, and it is editable — before
       this existed the dashboard warned "not configured" with no way to fix it
       and the pipeline hardcoded its own copy of the number. */
    forecastRate: 3,

    /* apptsPerWeek is a PER-AGENT, appointments-SET goal. Both facts matter:
       the dashboard used to compare it against team-wide appointments HELD. */
    goals: { apptsPerWeek: 5, closingsPerMonth: 2 },
  };
}

/* ------------------------------------------------------------ merge helper
   A saved settings row from an older build must never lose new keys, and a new
   build must never clobber a brokerage's edits. Shallow-merge one level deep,
   arrays replaced wholesale (an edited stage list is authoritative). */
export function mergeSettings(saved) {
  const base = defaultSettings();
  if (!saved || typeof saved !== 'object') return base;
  const out = { ...base };
  Object.keys(saved).forEach(k => {
    const v = saved[k];
    if (v == null) return;
    if (Array.isArray(v)) { out[k] = v; return; }
    if (typeof v === 'object' && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
      out[k] = { ...base[k], ...v };
      /* nested objects one more level (checklists.listing etc.) */
      Object.keys(v).forEach(k2 => {
        if (v[k2] && typeof v[k2] === 'object' && !Array.isArray(v[k2]) && base[k] && base[k][k2] && typeof base[k][k2] === 'object' && !Array.isArray(base[k][k2]))
          out[k][k2] = { ...base[k][k2], ...v[k2] };
      });
      return;
    }
    out[k] = v;
  });
  return out;
}

/* --------------------------------------------------------------- accessors
   Side-aware label rendering. `side` is 'buyer' | 'seller' | 'both'. */
export const stagesOf = s => (s && s.stages && s.stages.length ? s.stages : DEFAULT_STAGES);
export const phasesOf = s => (s && s.phases && s.phases.length ? s.phases : DEFAULT_PHASES);
export const offsetsOf = s => (s && s.offsets && s.offsets.length ? s.offsets : DEFAULT_OFFSETS);
export const holidaysOf = s => (s && s.dateRules && s.dateRules.holidays) || [];
export const rolloverOf = s => (s && s.dateRules && s.dateRules.rollover) || 'forward';
export const tzOf = s => (s && s.dateRules && s.dateRules.tz) || 'America/Chicago';

export const stageOf = (key, s) => stagesOf(s).find(x => x.key === key) || stagesOf(s)[0];

/** the label a card shows, for its own side */
export function stageLabel(key, side, s) {
  const st = stageOf(key, s);
  if (!st) return key;
  if (side === 'buyer') return st.buyerLabel || st.sellerLabel || st.key;
  if (side === 'seller') return st.sellerLabel || st.buyerLabel || st.key;
  /* 'both' — show the seller label with the buyer one when they differ */
  const a = st.sellerLabel || '', b = st.buyerLabel || '';
  return a === b ? a : `${a} / ${b}`;
}
/** column header when the board is filtered to one side, or unfiltered */
export function columnLabel(st, filter) {
  if (!st) return '';
  if (filter === 'buyers') return st.buyerLabel || st.sellerLabel;
  if (filter === 'sellers') return st.sellerLabel || st.buyerLabel;
  const a = st.sellerLabel || '', b = st.buyerLabel || '';
  return a === b ? a : `${a} / ${b}`;
}
export const openStages = s => stagesOf(s).filter(x => x.open);
export const wonStage = s => stagesOf(s).find(x => x.won) || null;
export const lostStage = s => stagesOf(s).find(x => x.lost) || null;

export const pcsOf = s => (s && s.pcs) || DEFAULT_PCS;
export const pcsOffsetsOf = s => { const p = pcsOf(s); return (p.offsets && p.offsets.length) ? p.offsets : DEFAULT_PCS_OFFSETS; };

export const checklistFor = (side, s) => {
  const c = (s && s.checklists) || DEFAULT_CHECKLISTS;
  return side === 'buyer' ? (c.buyer || []) : (c.listing || []);
};
export const apptCounts = (key, s) => {
  const t = ((s && s.apptTypes) || DEFAULT_APPT_TYPES).find(x => x.key === key);
  return !!(t && t.counts);
};
