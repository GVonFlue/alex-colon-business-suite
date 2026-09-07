import { alpha } from '../lib/color';
import { BRAND } from '../lib/brand';
/* ============================================================================
   pcs.css.js — chrome for the PCS / Relocation screen only.

   Every class is prefixed `pcs-` and every rule lives here rather than in
   src/styles.js, so the shared design system stays untouched. PCS.jsx renders
   it once as <style>{PCS_CSS}</style>, the same way Tools.jsx ships its own.

   Same brand as the rest of the app: Space Grotesk headings, Inter body,
   cobalt ${BRAND.colors.cobalt}, ink ${BRAND.colors.ink}, soft low shadows, 14–22px radii.
   ========================================================================== */

export const PCS_CSS = `
/* ------------------------------------------------------------ the header */
.pcs-lead{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin:2px 0 12px}
.pcs-lead h2{font-family:'Space Grotesk',sans-serif;font-size:18px;font-weight:600;color:${BRAND.colors.ink};margin:0;letter-spacing:-.01em}
.pcs-lead span{font-size:12.5px;color:#8E89A8}

/* the line that keeps this module honest. It is not decoration — it is on
   screen wherever an entitlement gets a mention. */
.pcs-disc{display:flex;align-items:flex-start;gap:9px;background:#F6F7FC;border:1px solid #E4E7F5;
  border-radius:12px;padding:11px 13px;font-size:12px;color:#56527a;line-height:1.5;margin:12px 0}
.pcs-disc svg{flex:none;margin-top:1px;color:${BRAND.colors.cobalt}}
.pcs-disc b{color:${BRAND.colors.ink};font-weight:700}

/* ------------------------------------------------------------- the board */
.pcs-kmeta{font-size:12px;color:#777296;margin:2px 0 8px;line-height:1.45}
.pcs-krow{display:flex;align-items:center;justify-content:space-between;gap:8px;
  font-size:12px;color:#56527a;padding:5px 0;border-top:1px dashed #EDEEF6}
.pcs-krow b{font-weight:700;color:${BRAND.colors.ink};font-variant-numeric:tabular-nums}
.pcs-rnltd{display:flex;align-items:baseline;justify-content:space-between;gap:8px;
  background:#F4F6FF;border-radius:10px;padding:7px 10px;margin-bottom:8px}
.pcs-rnltd .l{font-size:9.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#8E89A8}
.pcs-rnltd .v{font-size:12.5px;font-weight:700;color:${BRAND.colors.cobalt};font-variant-numeric:tabular-nums}
.pcs-rnltd.tight{background:#FFF3E8}.pcs-rnltd.tight .v{color:#A85B10}
.pcs-rnltd.past{background:#FDECEC}.pcs-rnltd.past .v{color:#B03030}

.pcs-flag{display:flex;align-items:center;gap:6px;background:#FDECEC;color:#B03030;
  border-radius:9px;padding:6px 9px;font-size:11.5px;font-weight:700;line-height:1.35;margin-top:8px}
.pcs-flag svg{flex:none}
.pcs-flag.warn{background:#FFF3E4;color:#9a5a12}
.pcs-dir{display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:800;letter-spacing:.05em;
  text-transform:uppercase;border-radius:20px;padding:3px 8px}
.pcs-dir.in{background:${alpha(BRAND.colors.green,.12)};color:#1a7d46}
.pcs-dir.out{background:${alpha(BRAND.colors.cobalt,.1)};color:${BRAND.colors.cobalt}}
.pcs-dir.sep{background:${alpha(BRAND.colors.gold,.16)};color:#8a6a1d}
.pcs-dir.na{background:#EEF0FA;color:#5A5680}

/* ------------------------------------------------------- the squeeze panel
   The compression warning. It is deliberately loud when it is real and
   deliberately quiet when it is not. */
.pcs-sq{border:1px solid #E8E9F2;border-radius:16px;padding:14px 16px;background:#fff;margin-bottom:14px}
.pcs-sq.bad{border-color:#F0C4C4;background:linear-gradient(115deg,#FDF4F4 0%,#fff 60%)}
.pcs-sq.warn{border-color:#EBD8B8;background:linear-gradient(115deg,#FFF9F0 0%,#fff 60%)}
.pcs-sq.ok{border-color:#CDE9D9;background:linear-gradient(115deg,#F4FBF7 0%,#fff 60%)}
.pcs-sq-h{display:flex;align-items:center;gap:8px;font-family:'Space Grotesk',sans-serif;
  font-size:15px;font-weight:600;color:${BRAND.colors.ink};margin-bottom:6px}
.pcs-sq-h svg{flex:none}
.pcs-sq.bad .pcs-sq-h svg{color:#B03030}
.pcs-sq.warn .pcs-sq-h svg{color:#A85B10}
.pcs-sq.ok .pcs-sq-h svg{color:#1a7d46}
.pcs-sq-p{font-size:13px;color:#56527a;line-height:1.55}
.pcs-sq-p b{color:${BRAND.colors.ink};font-weight:700}
.pcs-sq-nums{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin:12px 0 4px}
.pcs-sq-n{background:rgba(255,255,255,.7);box-shadow:inset 0 0 0 1px #EAEBF5;border-radius:12px;padding:9px 12px}
.pcs-sq-n .l{font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#928DAD}
.pcs-sq-n .v{font-family:'Space Grotesk',sans-serif;font-size:19px;font-weight:600;color:${BRAND.colors.ink};
  font-variant-numeric:tabular-nums;margin-top:2px}
.pcs-sq-list{margin:10px 0 0;padding-left:18px;font-size:12.5px;color:#7a3b3b;line-height:1.7}
.pcs-sq-list li b{color:${BRAND.colors.ink}}
.pcs-sq-foot{font-size:11.5px;color:#8E89A8;margin-top:10px;line-height:1.5}

/* ------------------------------------------------------- remote buyer flow */
.pcs-rb{display:flex;align-items:flex-start;gap:11px;padding:10px 11px;border-radius:12px;
  border:1px solid #EDEEF6;background:#fff;margin-bottom:8px}
.pcs-rb.done{background:#F6FBF8;border-color:#D7EDE1}
.pcs-rb-x{flex:none;width:22px;height:22px;border-radius:7px;border:1px solid #DEDFEA;background:#fff;
  cursor:pointer;display:flex;align-items:center;justify-content:center;color:#C9C6DC;margin-top:1px}
.pcs-rb.done .pcs-rb-x{background:${BRAND.colors.green};border-color:${BRAND.colors.green};color:#fff}
.pcs-rb-b{flex:1;min-width:0}
.pcs-rb-l{font-size:13px;font-weight:600;color:${BRAND.colors.ink};line-height:1.4}
.pcs-rb.done .pcs-rb-l{color:#4a7a61}
.pcs-rb-s{font-size:11.5px;color:#8E89A8;margin-top:3px}
.pcs-rb-b input{width:100%;padding:7px 10px;border:1px solid #DEDFEA;border-radius:9px;
  font-size:12.5px;font-family:'Inter',system-ui,sans-serif;color:${BRAND.colors.ink};background:#fff}
.pcs-rb-b input:focus{outline:none;border-color:${BRAND.colors.cobalt};box-shadow:0 0 0 3px ${alpha(BRAND.colors.cobalt,.13)}}

/* --------------------------------------------------------- toggle-as-field
   A <Toggle> is itself a <label>, so dropping one inside .field makes the
   shared ".field label" rule uppercase it and stack it on top of the hint.
   This is the same slot without that collision. */
.pcs-tog .pcs-tog-l{display:block;font-size:10.5px;font-weight:700;letter-spacing:.05em;
  text-transform:uppercase;color:#928DAD;margin-bottom:1px}
.pcs-tog .pcs-tog-h{font-size:11px;color:#928DAD;margin-top:7px;line-height:1.45}
.pcs-tog.full{grid-column:1/-1}

/* ------------------------------------------------------------ small bits */
.pcs-bands{display:flex;flex-wrap:wrap;gap:7px;align-items:center}
.pcs-note{font-size:11.5px;color:#8E89A8;line-height:1.5;margin-top:8px}
.pcs-chart{width:100%;height:210px}
.pcs-nodata{padding:22px;text-align:center;color:#A6A2BC;font-size:13px;line-height:1.5}
.pcs-stamp{font-size:11.5px;color:#8E89A8;line-height:1.55;margin-top:10px}
.pcs-tblnote{font-size:11.5px;color:#8E89A8;margin-top:8px}
`;
