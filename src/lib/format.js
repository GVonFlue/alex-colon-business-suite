/* small shared formatters — no React, no env */
export const usd = v => '$' + Math.round(Number(v) || 0).toLocaleString();
export const usdc = v => '$' + (Number(v) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const pct = v => `${Math.round((Number(v) || 0) * 100)}%`;
export const initials = n => String(n || '?').trim().split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase();
export const titleCase = s => String(s || '').replace(/\b\w/g, c => c.toUpperCase());

/** RFC4122 v4. leads.id / transactions.id are Postgres uuid columns, so a
    Date.now()+random id would be rejected on insert. */
export function uid() {
  try { if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID(); } catch {}
  const h = '0123456789abcdef';
  let s = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) { s += '-'; continue; }
    if (i === 14) { s += '4'; continue; }
    const r = Math.floor(Math.random() * 16);
    s += i === 19 ? h[(r & 0x3) | 0x8] : h[r];
  }
  return s;
}

export const nowIso = () => new Date().toISOString();
export const phoneFmt = p => {
  const d = String(p || '').replace(/\D/g, '');
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return p || '';
};
export const addr1 = a => String(a || '').split(',')[0].trim();
export const truncate = (s, n) => (String(s || '').length > n ? String(s).slice(0, n - 1) + '…' : String(s || ''));
export const sum = (arr, f) => (arr || []).reduce((s, x) => s + (Number(f ? f(x) : x) || 0), 0);
export const byDateDesc = k => (a, b) => String(b[k] || '').localeCompare(String(a[k] || ''));
export const uniq = a => Array.from(new Set(a || []));
