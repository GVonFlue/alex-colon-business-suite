import { BRAND } from '../lib/brand';
/* ============================================================================
   import.css.js — every style the CSV importer needs, as one template string.

   It lives here rather than in src/styles.js because the importer is one screen
   that most installs open twice in their life: on go-live day and the day they
   buy another team's book. Keeping it out of the global sheet means the class
   names cannot collide with anything, and the file can be deleted whole if the
   importer ever is.

   Rendered as <style>{IMPORT_CSS}</style> from ImportContacts.jsx. Every class
   is prefixed imp-, and every colour is one already in the design system.
   ========================================================================== */

export const IMPORT_CSS = `
.imp-body{padding:16px 20px 6px;overflow:auto;max-height:calc(90vh - 210px)}

/* ---------------------------------------------------------- step markers */
.imp-steps{display:flex;gap:6px;flex-wrap:wrap}
.imp-step{font-size:11.5px;font-weight:700;letter-spacing:.02em;color:#8E89A8;background:#F1F2FA;
  border:1px solid #E4E7F5;border-radius:999px;padding:4px 11px}
.imp-step.on{background:${BRAND.colors.cobalt};border-color:${BRAND.colors.cobalt};color:#fff}
.imp-step.done{background:#EAF0FF;border-color:#CFDBFF;color:${BRAND.colors.cobalt}}

/* ------------------------------------------------------------- drop zone */
.imp-drop{border:2px dashed #C9CEEA;border-radius:18px;background:#F8F9FE;padding:38px 20px;text-align:center;
  cursor:pointer;color:#5A5680;transition:border-color .12s,background .12s}
.imp-drop:hover,.imp-drop.on{border-color:${BRAND.colors.cobalt};background:#F1F4FF}
.imp-drop svg{color:${BRAND.colors.cobalt}}
.imp-drop-t{font-size:15px;font-weight:700;color:${BRAND.colors.ink};margin-top:10px}
.imp-drop-s{font-size:12.5px;color:#8E89A8;margin-top:4px}

/* ------------------------------------------------------- notes / banners */
.imp-note{font-size:12.5px;line-height:1.55;color:#5A5680;background:#F6F7FD;border:1px solid #E9EBF7;
  border-radius:12px;padding:10px 13px;margin-top:12px}
.imp-note b{color:${BRAND.colors.ink}}
.imp-note.warn{background:#FFF8EC;border-color:#F2E2C2;color:#7A5A20}
.imp-note.warn b{color:#6A4C15}
.imp-warn{display:flex;align-items:flex-start;gap:8px;font-size:12.5px;line-height:1.5;color:#7A5A20;
  background:#FFF8EC;border:1px solid #F2E2C2;border-radius:12px;padding:10px 13px;margin-top:12px}
.imp-warn svg{flex:none;margin-top:2px}

/* --------------------------------------------------------- section heads */
.imp-h2{font-family:'Space Grotesk',sans-serif;font-size:14px;font-weight:600;color:${BRAND.colors.ink};
  margin:20px 0 9px;padding-bottom:6px;border-bottom:1px solid #EEF0FA}
.imp-head{display:flex;align-items:flex-end;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:10px}
.imp-head-l{font-size:12.5px;color:#5A5680;line-height:1.5;max-width:620px}
.imp-head-l b{color:${BRAND.colors.ink}}
.imp-head-r{display:flex;align-items:flex-end;gap:10px;flex-wrap:wrap}
.imp-head-r .field{margin:0;min-width:180px}

/* ---------------------------------------------------------------- tables */
.imp-tbl td,.imp-tbl th{font-size:12.5px;vertical-align:top}
.imp-tbl select{width:100%;font-size:12.5px;padding:5px 7px}
.imp-tbl tr.imp-off td{opacity:.55}
.imp-tbl tr.imp-skip td{background:#FAFAFD;color:#8E89A8}
.imp-tbl tr.imp-bad td{background:#FDF6F6}
.imp-sample{color:#5A5680;max-width:320px}
.imp-sample i{display:block;font-style:normal;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.imp-sample i+i{color:#928DAD;margin-top:2px}
.imp-sub{font-size:11.5px;color:#8E89A8;margin-top:2px}
.imp-sub.warn,.imp-tbl td.warn{color:#B0741F}
.imp-dim{color:#928DAD}
.imp-scroll{max-height:330px;overflow:auto}
.imp-t-new{background:#E7F5EC;color:#1F7A45}
.imp-t-upd{background:#EAF0FF;color:${BRAND.colors.cobalt}}
.imp-t-mrg{background:#F3EEFB;color:#6A4CB0}
.imp-dup{color:#B0741F;font-weight:700}

/* ------------------------------------------------- their value -> our value */
.imp-vgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(430px,1fr));gap:8px}
.imp-vrow{display:flex;align-items:center;gap:8px;background:#F8F9FE;border:1px solid #E9EBF7;
  border-radius:11px;padding:7px 10px}
.imp-vrow.miss{background:#FFF8EC;border-color:#F2E2C2}
.imp-vfrom{font-size:12.5px;font-weight:700;color:${BRAND.colors.ink};max-width:170px;overflow:hidden;
  text-overflow:ellipsis;white-space:nowrap}
.imp-vn{font-size:11px;font-weight:700;color:#8E89A8;background:#EEF0FA;border-radius:999px;padding:2px 7px;flex:none}
.imp-varr{color:#C9C6DC;flex:none}
.imp-vrow select{flex:1;min-width:0;font-size:12.5px;padding:5px 7px}

/* ------------------------------------------------------------ radio rows */
.imp-daterow{display:flex;align-items:center;gap:12px;flex-wrap:wrap;font-size:12.5px;color:#5A5680}
.imp-daterow .field{margin:0;min-width:200px}
.imp-radio{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;font-weight:600;color:#5A5680;
  background:#F8F9FE;border:1px solid #E9EBF7;border-radius:10px;padding:7px 12px;cursor:pointer}
.imp-radio.on{border-color:${BRAND.colors.cobalt};color:${BRAND.colors.cobalt};background:#F1F4FF}

/* ------------------------------------------------------------------ kpis */
.imp-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(158px,1fr));gap:10px;margin-bottom:4px}
.imp-kpi{background:#F8F9FE;border:1px solid #E9EBF7;border-radius:14px;padding:11px 13px}
.imp-kpi.good{background:#F1FAF4;border-color:#D5EEDF}
.imp-kpi.warn{background:#FFF8EC;border-color:#F2E2C2}
.imp-kpi.bad{background:#FDF1F1;border-color:#F2D2D2}
.imp-kl{font-size:11px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:#8E89A8;line-height:1.35}
.imp-kv{font-family:'Space Grotesk',sans-serif;font-size:23px;font-weight:600;color:${BRAND.colors.ink};margin-top:3px}

.imp-duphead{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;
  font-size:12.5px;color:#5A5680;margin-bottom:9px}

/* --------------------------------------------------------- progress / done */
.imp-run{padding:44px 10px;text-align:center}
.imp-run-t{font-family:'Space Grotesk',sans-serif;font-size:16px;font-weight:600;color:${BRAND.colors.ink}}
.imp-run-s{font-size:12.5px;color:#8E89A8;margin-top:10px;line-height:1.55}
.imp-bar{height:9px;border-radius:999px;background:#EEF0FA;overflow:hidden;margin:16px auto 0;max-width:520px}
.imp-bar i{display:block;height:100%;background:${BRAND.colors.cobalt};border-radius:999px;transition:width .12s linear}
.imp-count{font-family:'Space Grotesk',sans-serif;font-size:30px;font-weight:600;color:${BRAND.colors.cobalt};margin-top:14px}

.imp-done{display:flex;align-items:center;gap:12px;background:#F1FAF4;border:1px solid #D5EEDF;
  border-radius:14px;padding:13px 15px;margin-bottom:12px}
.imp-done.part{background:#FFF8EC;border-color:#F2E2C2}
.imp-done svg{color:${BRAND.colors.green};flex:none}
.imp-done.part svg{color:#B0741F}
.imp-done-t{font-family:'Space Grotesk',sans-serif;font-size:15.5px;font-weight:600;color:${BRAND.colors.ink}}
.imp-done-s{font-size:12.5px;color:#5A5680;margin-top:2px}
.imp-done-s b{color:${BRAND.colors.ink}}
.imp-done-s b.bad{color:${BRAND.colors.red}}
.imp-batch{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;color:#5A5680;
  background:#EEF0FA;border-radius:6px;padding:2px 7px}

@media (max-width:720px){
  .imp-vgrid{grid-template-columns:1fr}
  .imp-vfrom{max-width:110px}
  .imp-body{max-height:calc(92vh - 230px)}
}
`;

export default IMPORT_CSS;
