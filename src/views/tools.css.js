import { alpha } from '../lib/color';
import { BRAND } from '../lib/brand';
/* ============================================================================
   tools.css.js — chrome for the AI Tools screen only.

   Every class in here is prefixed `tl-` and every rule lives in this file, not
   in src/styles.js, so the shared design system stays untouched. Tools.jsx
   renders it once as <style>{TOOLS_CSS}</style>.

   Same brand as everything else: Space Grotesk headings, Inter body, cobalt
   ${BRAND.colors.cobalt}, ink ${BRAND.colors.ink}, 22px card radius, soft low shadows. Each tool carries
   its own accent through the `--tl-a` custom property, set inline on the card
   and on the workspace header, so one rule set serves all six.

   Motion is decoration: everything animated here is disabled wholesale under
   prefers-reduced-motion.
   ========================================================================== */

export const TOOLS_CSS = `
/* ---------------------------------------------------------------- the pledge
   The "everything here is a draft" promise, as a strip rather than a paragraph. */
.tl-pledge{display:grid;grid-template-columns:repeat(auto-fit,minmax(268px,1fr));gap:9px;
  background:linear-gradient(115deg,#F3F5FE 0%,#FFFFFF 62%);
  border:1px solid #E4E7F5;border-radius:16px;padding:13px;margin-bottom:16px}
.tl-pl{display:flex;align-items:flex-start;gap:9px;padding:9px 12px;border-radius:11px;background:rgba(255,255,255,.72);
  box-shadow:inset 0 0 0 1px #E9EBF7;font-size:12.5px;font-weight:600;color:#4C4870;line-height:1.45}
.tl-pl svg{flex:none;margin-top:1px;color:${BRAND.colors.cobalt}}
.tl-pl b{font-weight:700;color:${BRAND.colors.ink}}

/* ------------------------------------------------------------------ launcher */
.tl-lead{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin:2px 0 14px}
.tl-lead h2{font-family:'Space Grotesk',sans-serif;font-size:18px;font-weight:600;color:${BRAND.colors.ink};margin:0;letter-spacing:-.01em}
.tl-lead span{font-size:12.5px;color:#8E89A8}

.tl-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
@media(max-width:1180px){.tl-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:760px){.tl-grid{grid-template-columns:minmax(0,1fr)}}

.tl-card{position:relative;display:flex;flex-direction:column;align-items:flex-start;
  text-align:left;width:100%;font-family:'Inter',system-ui,sans-serif;
  background:#fff;border:1px solid #E8E9F2;border-radius:22px;padding:20px 20px 15px;
  box-shadow:0 12px 30px -28px rgba(17,21,40,.5);cursor:pointer;overflow:hidden;
  transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease}
.tl-card::before{content:'';position:absolute;left:0;right:0;top:0;height:3px;
  background:var(--tl-a);opacity:.9;transition:opacity .18s ease}
.tl-card:hover{transform:translateY(-3px);box-shadow:0 24px 46px -28px rgba(17,21,40,.5);
  border-color:color-mix(in srgb,var(--tl-a) 34%,#E8E9F2)}
.tl-card:active{transform:translateY(-1px)}
.tl-card:focus-visible{outline:2px solid var(--tl-a);outline-offset:2px}

.tl-ic{width:46px;height:46px;border-radius:50%;display:flex;align-items:center;justify-content:center;
  background:color-mix(in srgb,var(--tl-a) 13%,#fff);color:var(--tl-a);margin-bottom:14px;
  box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--tl-a) 16%,#fff);transition:transform .18s ease}
.tl-card:hover .tl-ic{transform:scale(1.05)}

.tl-name{font-family:'Space Grotesk',sans-serif;font-size:16.5px;font-weight:600;
  color:${BRAND.colors.ink};letter-spacing:-.012em;line-height:1.25}
.tl-what{font-size:13px;line-height:1.6;color:#6C6890;margin-top:7px}

.tl-need{display:flex;align-items:flex-start;gap:8px;width:100%;margin-top:auto;
  padding-top:13px;border-top:1px solid #F0F1F7;
  font-size:11.5px;font-weight:600;line-height:1.45;color:#8E89A8}
.tl-need i{flex:none;width:7px;height:7px;border-radius:50%;background:var(--tl-a);margin-top:4px;
  box-shadow:0 0 0 3px color-mix(in srgb,var(--tl-a) 14%,#fff)}
.tl-need em{font-style:normal;color:#56527a}
.tl-go{position:absolute;right:18px;top:22px;color:#CDCBDE;transition:transform .18s ease,color .18s ease}
.tl-card:hover .tl-go{color:var(--tl-a);transform:translateX(3px)}

/* nothing to work on yet — muted, honest, still clickable */
.tl-card.tl-dim{background:#FCFCFE}
.tl-card.tl-dim::before{opacity:.3}
.tl-card.tl-dim .tl-ic{background:#F3F4F9;color:#A6A2BC;box-shadow:inset 0 0 0 1px #ECEDF5}
.tl-card.tl-dim .tl-name{color:#4E4A72}
.tl-card.tl-dim .tl-what{color:#8B87A6}
.tl-card.tl-dim .tl-need i{background:#C9C6DC;box-shadow:0 0 0 3px #F2F2F8}
.tl-card.tl-dim:hover{border-color:#DEDFEA}
.tl-card.tl-dim:hover .tl-ic{color:var(--tl-a);background:color-mix(in srgb,var(--tl-a) 10%,#fff)}

/* ----------------------------------------------------------------- workspace */
.tl-ws-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px}
.tl-back{display:inline-flex;align-items:center;gap:6px;font-family:'Inter',sans-serif;
  font-size:12.5px;font-weight:600;color:#56527a;background:#fff;border:1px solid #DEDFEA;
  border-radius:20px;padding:7px 14px 7px 10px;cursor:pointer;transition:.16s}
.tl-back:hover{border-color:${BRAND.colors.cobalt};color:${BRAND.colors.cobalt};background:#F6F7FE}

.tl-switch{display:flex;gap:7px;flex-wrap:wrap;margin-left:auto}
.tl-sw{display:inline-flex;align-items:center;gap:7px;font-family:'Inter',sans-serif;
  font-size:12px;font-weight:600;color:#56527a;background:#fff;border:1px solid #E4E5EF;
  border-radius:20px;padding:6px 12px;cursor:pointer;transition:.16s;white-space:nowrap}
.tl-sw svg{color:var(--tl-a);opacity:.85}
.tl-sw:hover{border-color:color-mix(in srgb,var(--tl-a) 45%,#E4E5EF);
  color:color-mix(in srgb,var(--tl-a) 80%,${BRAND.colors.ink});
  background:color-mix(in srgb,var(--tl-a) 7%,#fff)}
.tl-sw:hover svg{opacity:1}

.tl-head{position:relative;display:flex;align-items:center;gap:15px;overflow:hidden;
  background:linear-gradient(110deg,color-mix(in srgb,var(--tl-a) 7%,#fff) 0%,#fff 55%);
  border:1px solid #E8E9F2;border-radius:22px;padding:17px 20px 17px 24px;margin-bottom:14px;
  box-shadow:0 12px 30px -28px rgba(17,21,40,.5)}
.tl-head::before{content:'';position:absolute;left:0;top:0;bottom:0;width:5px;background:var(--tl-a)}
.tl-head-ic{flex:none;width:46px;height:46px;border-radius:50%;display:flex;align-items:center;justify-content:center;
  background:color-mix(in srgb,var(--tl-a) 14%,#fff);color:var(--tl-a);
  box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--tl-a) 18%,#fff)}
.tl-head-t{min-width:0}
.tl-head-t h2{font-family:'Space Grotesk',sans-serif;font-size:18px;font-weight:600;
  color:${BRAND.colors.ink};margin:0;letter-spacing:-.012em}
.tl-head-t p{font-size:12.5px;color:#7B76A0;margin:4px 0 0;line-height:1.5;max-width:76ch}
.tl-head-r{margin-left:auto;flex:none}

/* --------------------------------------------------------------- draft block
   A document, not a textarea: header bar, soft inner surface, wide line-height. */
.tl-draft{margin-top:18px;border:1px solid #E8E9F2;border-radius:16px;background:#fff;
  overflow:hidden;transition:border-color .16s ease,box-shadow .16s ease}
.tl-draft.tl-editing{border-color:#C3CDF7;box-shadow:0 0 0 3px ${alpha(BRAND.colors.cobalt,.09)}}
.tl-draft-bar{display:flex;align-items:center;gap:9px;flex-wrap:wrap;
  padding:10px 12px 10px 14px;background:#FBFBFE;border-bottom:1px solid #EDEEF6}
.tl-draft-label{font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#7E799F}
.tl-state{font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;
  padding:3px 8px;border-radius:20px;background:#EEF0FA;color:#7E799F}
.tl-state.on{background:${alpha(BRAND.colors.cobalt,.11)};color:${BRAND.colors.cobalt}}
.tl-draft-acts{margin-left:auto;display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.tl-draft-body{background:#F8F9FD}
.tl-doc{white-space:pre-wrap;font-size:14px;line-height:1.78;color:#242144;
  padding:18px 22px;max-width:70ch;max-height:440px;overflow:auto}
.tl-doc.tl-doc-none{color:#A6A2BC;font-style:italic}
.tl-draft-edit{display:block;width:100%;border:none;background:#fff;padding:16px 20px;resize:vertical;
  font-family:'Inter',system-ui,sans-serif;font-size:14px;line-height:1.75;color:#242144;outline:none}
.tl-draft-foot{display:flex;align-items:center;gap:10px;flex-wrap:wrap;
  padding:9px 14px;border-top:1px solid #EDEEF6;background:#fff;font-size:11.5px;color:#8E89A8}
.tl-draft-foot.tl-over{color:#B03030;font-weight:700;background:#FDF7F7}
.tl-meter{flex:none;width:110px;height:5px;border-radius:4px;background:#EAECF5;overflow:hidden}
.tl-meter i{display:block;height:100%;border-radius:4px;background:${BRAND.colors.cobalt};transition:width .3s ease}
.tl-draft-foot.tl-over .tl-meter i{background:#C0392B}
.tl-foot-hint{color:#8E89A8;font-weight:400}

/* ------------------------------------------------------------- generate row */
.tl-gen{margin-top:18px}
.tl-gen-row{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.tl-gen-btn{position:relative;overflow:hidden;display:inline-flex;align-items:center;justify-content:center;gap:9px;
  font-family:'Inter',sans-serif;font-size:14.5px;font-weight:600;color:#fff;border:none;cursor:pointer;
  padding:12px 24px;border-radius:12px;min-width:212px;
  background:linear-gradient(135deg,${BRAND.colors.cobalt} 0%,#3350EA 100%);
  box-shadow:0 12px 26px -12px ${alpha(BRAND.colors.cobalt,.75)};transition:transform .16s ease,box-shadow .16s ease}
.tl-gen-btn:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 16px 30px -12px ${alpha(BRAND.colors.cobalt,.8)}}
.tl-gen-btn:disabled{opacity:.5;cursor:not-allowed;box-shadow:none;transform:none}
.tl-gen-btn.tl-busy{opacity:1;cursor:progress}
.tl-gen-btn .tl-shine{position:absolute;inset:0;pointer-events:none;
  background:linear-gradient(100deg,transparent 22%,rgba(255,255,255,.42) 50%,transparent 78%);
  transform:translateX(-100%);animation:tl-shimmer 1.4s linear infinite}
.tl-gen-btn .tl-strip{position:absolute;left:0;right:0;bottom:0;height:3px;
  background:rgba(255,255,255,.26);overflow:hidden;pointer-events:none}
.tl-gen-btn .tl-strip i{display:block;height:100%;width:34%;border-radius:3px;background:#fff;
  animation:tl-slide 1.45s ease-in-out infinite}
@keyframes tl-shimmer{to{transform:translateX(100%)}}
@keyframes tl-slide{0%{transform:translateX(-110%)}100%{transform:translateX(330%)}}
.tl-status{display:inline-flex;align-items:center;gap:8px;font-size:12.5px;font-weight:600;color:#4A4670}
.tl-status .tl-dots{display:inline-flex;gap:3px}
.tl-status .tl-dots b{width:5px;height:5px;border-radius:50%;background:${BRAND.colors.cobalt};opacity:.35;
  animation:tl-pulse 1.1s ease-in-out infinite}
.tl-status .tl-dots b:nth-child(2){animation-delay:.18s}
.tl-status .tl-dots b:nth-child(3){animation-delay:.36s}
@keyframes tl-pulse{0%,100%{opacity:.28;transform:scale(.85)}50%{opacity:1;transform:scale(1)}}
.tl-status-t{animation:tl-rise .4s ease}
@keyframes tl-rise{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
.tl-gen-note{font-size:12px;color:#8E89A8;max-width:52ch;line-height:1.45}

/* ------------------------------------------------------------------- footer */
.tl-model{display:flex;align-items:flex-start;gap:9px;margin:20px 0 26px;padding:11px 14px;
  background:#F6F7FC;border-radius:12px;font-size:11.5px;line-height:1.55;color:#8E89A8}
.tl-model svg{flex:none;margin-top:1px;color:#A6A2BC}

@media(max-width:1020px){.tl-head-r{display:none}}
@media(max-width:760px){
  .tl-switch{margin-left:0;width:100%}
  .tl-head{padding:15px 16px 15px 19px}
  .tl-pl + .tl-pl{padding-left:0;border-left:none}
  .tl-gen-btn{width:100%}
}

@media (prefers-reduced-motion:reduce){
  .tl-card,.tl-card:hover,.tl-card:active,.tl-ic,.tl-card:hover .tl-ic,
  .tl-go,.tl-card:hover .tl-go,.tl-gen-btn,.tl-gen-btn:hover:not(:disabled),
  .tl-meter i,.tl-draft{transition:none;transform:none}
  .tl-gen-btn .tl-shine,.tl-gen-btn .tl-strip i,.tl-status .tl-dots b,.tl-status-t{animation:none}
  .tl-gen-btn .tl-shine{display:none}
  .tl-gen-btn .tl-strip i{width:100%;opacity:.55}
}
`;
