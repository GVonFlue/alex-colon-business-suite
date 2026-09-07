/* ============================================================
   Design system — carried over from GVonFlue/proytech-crm verbatim,
   then extended for the realtor build (see EXTRA at the bottom).
   Same brand: Space Grotesk / Inter, cobalt ${COBALT}, ink ${INK}, 22px cards.
   ============================================================ */
import { BRAND } from './lib/brand';
import { alpha } from './lib/color';

const COBALT = BRAND.colors.cobalt, INDIGO = BRAND.colors.indigo, INK = BRAND.colors.ink;
const GOLD = BRAND.colors.gold, GREEN = BRAND.colors.green, RED = BRAND.colors.red;

export const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap');
*{box-sizing:border-box}
/* --suitebar is the measured height of the product bar (.suite-bar). The page
   header (.top) sticks directly below it, so the two numbers have to agree —
   change the bar's padding or logo height and you must change this too, or the
   header slides under the bar. */
.pt{font-family:'Inter',system-ui,sans-serif;color:#221f3d;display:flex;min-height:100vh;background:#F4F6FB;--suitebar:51px}
.pt h1,.pt h2,.pt h3,.pt h4,.disp{font-family:'Space Grotesk',sans-serif;letter-spacing:-.01em}
.gate{min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(160deg,#211d44,${INK})}
.gate-card{background:#fff;border-radius:20px;padding:38px 34px;width:340px;box-shadow:0 30px 80px -30px rgba(0,0,0,.6);text-align:center}
.gate-card h2{font-size:20px;color:${INK};margin:14px 0 4px}.gate-card p{font-size:13px;color:#8E89A8;margin-bottom:20px}
.gate-card input{width:100%;padding:12px 14px;border:1px solid #DEDFEA;border-radius:10px;font-size:15px;text-align:center;letter-spacing:.04em;margin-bottom:12px}
.gate-card input:focus{outline:none;border-color:${COBALT};box-shadow:0 0 0 3px ${alpha(COBALT,.13)}}
.gate-err{color:${RED};font-size:12.5px;font-weight:600;margin-bottom:10px}
/* ---- sidebar, matched to GVonFlue/proytech-crm ----
   The panel is a dark navy ramp with an inline SVG (components/SidebarArt.jsx)
   sitting behind everything. No background image and no scrim: the art is drawn
   at the opacity it should be, so nothing has to be dimmed back down. */
.sb{width:236px;flex:none;background:linear-gradient(180deg,#0F1433 0%,#0A0E27 55%,#05071A 100%);color:#fff;display:flex;flex-direction:column;position:sticky;top:var(--topbar,0px);height:calc(100dvh - var(--topbar,0px));max-height:calc(100dvh - var(--topbar,0px));padding:20px 14px;z-index:30;overflow:hidden}
.sb-art{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0;opacity:.9}
/* everything else has to sit above the art */
.sb>*:not(.sb-art){position:relative;z-index:1}
.sb-pulse circle{animation:sbp 4.5s ease-in-out infinite}
.sb-pulse circle:nth-child(2){animation-delay:1.5s}
.sb-pulse circle:nth-child(3){animation-delay:3s}
@keyframes sbp{0%,100%{opacity:.25}50%{opacity:.85}}
@media(prefers-reduced-motion:reduce){.sb-pulse circle{animation:none;opacity:.5}}
/* NO box around the mark. A filled panel over the art reads as a sticker; the
   bloom below does the same job the bright node does in the reference art, so
   the logo reads as lit rather than stuck on. */
.sb-brand{position:relative;display:flex;flex-direction:column;align-items:center;gap:2px;padding:22px 14px 18px;margin:-4px -6px 14px}
.sb-logo{max-height:56px;max-width:184px;object-fit:contain;position:relative;z-index:1}
.sb-glow{position:absolute;top:-6px;left:50%;transform:translateX(-50%);
  width:190px;height:120px;pointer-events:none;
  background:radial-gradient(50% 50% at 50% 40%,rgba(56,189,248,.30),${alpha(COBALT,.16)} 45%,transparent 72%);
  filter:blur(2px)}
.sb-suite{position:relative;z-index:1;font-family:'Space Mono',ui-monospace,monospace;
  font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:#7FC8F0;
  text-shadow:0 0 12px rgba(56,189,248,.5);margin-top:4px;text-align:center}
/* a hairline under the mark, brightest in the middle — the panel's own divider
   rather than a border box */
.sb-brand::after{content:'';position:absolute;left:14px;right:14px;bottom:0;height:1px;
  background:linear-gradient(90deg,transparent,rgba(56,189,248,.42),transparent)}
.nucleus{width:14px;height:14px;border-radius:50%;background:${COBALT};box-shadow:0 0 0 4px ${alpha(COBALT,.25)},0 0 14px 2px ${alpha(COBALT,.6)};flex:none}
.nav-i{display:flex;align-items:center;gap:12px;padding:11px 12px;border-radius:10px;color:#C7C3E6;font-size:14px;font-weight:500;cursor:pointer;transition:.16s;border:none;background:none;width:100%;text-align:left;margin-bottom:2px}
.nav-i:hover{background:rgba(255,255,255,.06);color:#fff;backdrop-filter:blur(2px)}
/* The active row fades out to the right and is lit by a 2px cyan bar on its
   inside edge. An even fill would sit on the art as a block; the fade lets the
   traces read straight through the tail of the row. */
.nav-i.on{background:linear-gradient(90deg,color-mix(in srgb,${COBALT} 46%,transparent),color-mix(in srgb,${COBALT} 16%,transparent));
  color:#fff;box-shadow:inset 2px 0 0 #38BDF8,0 0 22px -8px rgba(56,189,248,.55)}
.nav-i.on svg{color:#7FD8FF}
.nav-i svg{flex:none}
.nav-i.nav-edit{cursor:grab;background:rgba(255,255,255,.05);color:#E8E6F7}
.nav-i.nav-edit:active{cursor:grabbing}
.nav-i.nav-edit.dragging{opacity:.4}
.nav-grip{color:#8C88B8}
.nav-l{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nav-mv{display:flex;gap:3px;flex:none}
.nav-mv button{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);border-radius:6px;color:#E8E6F7;cursor:pointer;padding:0}
.nav-mv button:disabled{opacity:.3;cursor:not-allowed}
.nav-i.nav-reorder{margin-top:8px;font-size:12.5px;color:#9C98C4}
.nav-i.nav-reorder.on{background:${COBALT};color:#fff}
.nav-i.nav-reset{font-size:12px;color:#9C98C4;padding-top:6px;padding-bottom:6px}
.sb-foot{margin-top:auto;font-size:11px;color:#888;padding:12px 8px 2px;border-top:1px solid rgba(255,255,255,.08);line-height:1.5}.sb-foot b{color:#B9B5D8;font-weight:600}
.main{flex:1;min-width:0;display:flex;flex-direction:column}
.top{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:18px 30px;background:#fff;border-bottom:1px solid #E8E9F2;position:sticky;top:calc(var(--topbar,0px) + var(--suitebar,51px));z-index:20}
.top h1{font-size:21px;font-weight:600}.top .sub{font-size:13px;color:#777296;margin-top:2px}
.body{padding:26px 30px 60px;width:100%;max-width:1320px}
.hamb{display:none;background:none;border:none;color:${INDIGO};cursor:pointer}
.kgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(176px,1fr));gap:16px;margin-bottom:22px}
.kpi{background:#fff;border:1px solid #E8E9F2;border-radius:22px;padding:18px;box-shadow:0 12px 30px -26px rgba(24,21,48,.5)}
.kpi .kl{font-size:11.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#8E89A8;display:flex;align-items:center;gap:7px}
.kpi .kv{font-family:'Space Grotesk';font-size:26px;font-weight:600;margin-top:9px;color:${INK};line-height:1}
.kpi .kd{font-size:12.5px;font-weight:600;margin-top:8px;color:#8E89A8}
.kpi.accent{background:linear-gradient(135deg,${COBALT},#2540c0);border:none}.kpi.accent .kl,.kpi.accent .kd{color:#D5DCFB}.kpi.accent .kv{color:#fff}
.kpi.gold{background:linear-gradient(135deg,${GOLD},#B0862F);border:none}.kpi.gold .kl,.kpi.gold .kd{color:#fff5e0}.kpi.gold .kv{color:#fff}
.kpi.green{background:linear-gradient(135deg,${GREEN},#178047);border:none}.kpi.green .kl,.kpi.green .kd{color:#dafce8}.kpi.green .kv{color:#fff}
.row{display:grid;gap:18px;margin-bottom:18px}.r2{grid-template-columns:1fr 1fr}.r3{grid-template-columns:2fr 1fr}
@media(max-width:900px){.r2,.r3{grid-template-columns:1fr}}
.card{background:#fff;border:1px solid #E8E9F2;border-radius:22px;padding:20px;box-shadow:0 12px 30px -28px rgba(24,21,48,.5)}
.card h3{font-size:15px;font-weight:600;color:${INK};margin-bottom:3px}.card .ch-sub{font-size:12.5px;color:#8E89A8;margin-bottom:14px}
.chart-h{height:250px}.chart-sm{height:210px}
.sec-title{font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#928DAD;margin:6px 0 14px;display:flex;align-items:center;gap:8px}
.empty{padding:26px;text-align:center;color:#A6A2BC;font-size:13.5px}
.btn{font-family:'Inter';font-size:14px;font-weight:600;padding:10px 18px;border-radius:10px;border:none;cursor:pointer;transition:.16s;display:inline-flex;align-items:center;gap:8px}
.btn-p{background:${COBALT};color:#fff;box-shadow:0 8px 20px -10px ${alpha(COBALT,.8)}}.btn-p:hover{background:#2340bd}
.btn-g{background:#F0F1F7;color:#56527a}.btn-g:hover{background:#E6E7F1}
.btn-d{background:#fff;color:${RED};border:1px solid #F0CACA}.btn-d:hover{background:#FCEDED}
.btn-sm{padding:7px 12px;font-size:12.5px;border-radius:8px}
.pill{font-size:11px;font-weight:700;padding:4px 10px;border-radius:20px;display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
.dot{width:7px;height:7px;border-radius:50%;flex:none}
.tag{font-size:10.5px;font-weight:600;padding:3px 8px;border-radius:6px;background:#EEF0FA;color:#5A5680;white-space:nowrap}
/* table */
.tbl-wrap{background:#fff;border:1px solid #E8E9F2;border-radius:22px;overflow:auto;box-shadow:0 12px 30px -28px rgba(24,21,48,.5)}
.tbl{width:100%;border-collapse:collapse;font-size:13.5px}
.colmenu-wrap{position:relative}
.cm-back{position:fixed;inset:0;z-index:39}
.colmenu{position:absolute;top:46px;right:0;z-index:40;background:#fff;border:1px solid #E8E9F2;border-radius:14px;box-shadow:0 20px 50px -20px rgba(24,21,48,.5);padding:8px;width:252px;max-height:380px;overflow-y:auto}
.colmenu .cm-row{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px}
.colmenu .cm-row:hover{background:#FAFAFD}
.colmenu .cm-name{flex:1;font-size:13px;color:#3a3658}
.colmenu .cm-lock{font-size:10.5px;color:#B6B2CC;text-transform:uppercase;letter-spacing:.04em}
.colmenu input[type=checkbox]{width:15px;height:15px;accent-color:${COBALT};cursor:pointer}
.tbl th{text-align:left;font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:#9C98B4;font-weight:500;padding:13px 14px;border-bottom:1px solid #E8E9F2;background:#FBFBFE;cursor:pointer;user-select:none;white-space:nowrap;position:sticky;top:0}
.tbl th .ar{opacity:.4;margin-left:4px}.tbl th.sorted{color:${COBALT}}.tbl th.sorted .ar{opacity:1}
.tbl td{padding:13px 14px;border-bottom:1px solid #F0F0F6;color:#3a3658;white-space:nowrap}
.tbl tbody tr{cursor:pointer}.tbl tbody tr:hover td{background:#FAFAFD}.tbl tr:last-child td{border-bottom:none}
.namecell{font-weight:600;color:${INK}}.subcell{font-size:12px;color:#928DAD}
.due{font-weight:600}.due.over{color:${RED}}.due.today{color:${GOLD}}.due.soon{color:${COBALT}}.due.far{color:#8E89A8}
.toolbar{display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap}
.searchbox{display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #DEDFEA;border-radius:10px;padding:8px 12px;flex:1;min-width:200px}
.searchbox input{border:none;outline:none;font-size:14px;width:100%;font-family:'Inter';color:${INK}}
.selctl{padding:9px 12px;border:1px solid #DEDFEA;border-radius:10px;font-size:13.5px;font-family:'Inter';background:#fff;color:#56527a;cursor:pointer}
/* kanban (cleaner) */
.kanban{display:flex;gap:14px;overflow-x:auto;padding-bottom:10px;align-items:stretch}
.kcol{background:#fff;border:1px solid #E8E9F2;border-radius:22px;display:flex;flex-direction:column;min-height:140px;overflow:hidden;box-shadow:0 12px 30px -28px rgba(24,21,48,.5);flex:1 0 260px;min-width:260px}
.kcol.drag{outline:2px dashed ${COBALT};outline-offset:-2px}
.kbar{height:4px;width:100%}
.kcol-h{display:flex;align-items:center;justify-content:space-between;padding:13px 14px 4px}
.kcol-h .kt{font-family:'Space Grotesk';font-weight:600;font-size:14px;color:${INK}}
.kcol-h .kc{font-size:11px;font-weight:700;color:#928DAD;background:#F1F2F8;border-radius:20px;padding:2px 9px}
.kcol-v{font-size:11.5px;color:#928DAD;padding:0 14px 10px;font-weight:600}
.kcol-body{padding:6px 10px 12px;flex:1;overflow-y:auto}
.kcard{background:#fff;border:1px solid #E8E9F2;border-radius:12px;padding:12px;margin-bottom:9px;cursor:pointer;box-shadow:0 4px 12px -10px rgba(24,21,48,.5);transition:.14s}
.kcard:hover{box-shadow:0 14px 28px -16px rgba(24,21,48,.5);transform:translateY(-1px);border-color:#D9DBEC}
.kcard .kn{font-weight:600;font-size:14px;color:${INK};display:flex;align-items:center;gap:6px}
.kcard .kco{font-size:12px;color:#777296;margin:2px 0 9px}
.kdeals{display:flex;flex-wrap:wrap;gap:5px;margin:0 0 9px}
.kdeal{font-size:11px;font-weight:700;color:${COBALT};background:color-mix(in srgb,${COBALT} 8%,#fff);border:1px solid color-mix(in srgb,${COBALT} 18%,#fff);border-radius:8px;padding:2px 8px;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kcard .ktags{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:9px}
.kcard .kmeta{display:flex;align-items:center;justify-content:space-between;gap:6px}
.kdrop{font-size:12px;color:#B6B2CC;text-align:center;padding:16px 0;border:1.5px dashed #E4E5F0;border-radius:10px;margin:2px 4px 8px}
.kcol.drag{outline:2px dashed ${COBALT};outline-offset:-3px;box-shadow:0 0 0 4px ${alpha(COBALT,.1)},0 12px 30px -22px ${COBALT}}
.kcard.dragging{opacity:.55;transform:rotate(2deg) scale(.98);box-shadow:0 18px 36px -14px rgba(24,21,48,.6)}
.kcard.od{border-left:3px solid ${RED}}
.kcard-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
.kown{flex:none;width:22px;height:22px;border-radius:50%;background:${INDIGO};color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;font-family:'Space Grotesk'}
.kvals{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.kdv{font-size:12.5px;font-weight:700;color:${INK}}
.kltv{font-size:11.5px;font-weight:800;color:#1a7d46;background:color-mix(in srgb,${GREEN} 10%,#fff);border-radius:12px;padding:1px 8px}
.kmrr{font-size:10.5px;font-weight:700;color:${GREEN};background:${alpha(GREEN,.1)};padding:2px 7px;border-radius:20px}
.kstale{display:inline-flex;align-items:center;gap:4px;margin-top:8px;font-size:10.5px;font-weight:700;color:#A9732B;background:rgba(200,135,40,.12);padding:3px 8px;border-radius:20px}
.kmove{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-top:10px;padding-top:9px;border-top:1px solid #F1F1F7}
.kmv{flex:none;width:30px;height:28px;border-radius:8px;border:1px solid #E4E5F0;background:#fff;color:${COBALT};display:flex;align-items:center;justify-content:center;cursor:pointer;transition:.13s}
.kmv:hover:not(:disabled){background:${COBALT};color:#fff;border-color:${COBALT}}
.kmv:disabled{color:#D2D2DE;cursor:default}
.kmv-s{flex:1;text-align:center;font-size:10px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:#A6A2BC;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kwtd{color:#B6B2CC;font-weight:600}
.kcoll-x{border:none;background:#F1F2F8;color:#928DAD;width:22px;height:22px;border-radius:7px;cursor:pointer;display:flex;align-items:center;justify-content:center}.kcoll-x:hover{background:#E4E5F0}
.kcollapsed{flex:0 0 58px;min-width:58px;max-width:58px;cursor:pointer;align-items:stretch}
.kcollapsed:hover{border-color:#D9DBEC;box-shadow:0 12px 30px -20px rgba(24,21,48,.5)}
.kcoll-body{flex:1;display:flex;flex-direction:column;align-items:center;gap:10px;padding:12px 0}
.kcoll-exp{color:#B6B2CC}
.kcoll-label{writing-mode:vertical-rl;transform:rotate(180deg);font-family:'Space Grotesk';font-weight:600;font-size:13px;color:${INK};letter-spacing:.02em}
/* modal */
.scrim2{position:fixed;inset:0;background:rgba(24,21,48,.5);z-index:50;display:flex;align-items:center;justify-content:center;padding:24px}
.modal{width:960px;max-width:96vw;max-height:90vh;background:#F4F6FB;border-radius:22px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 40px 100px -30px rgba(0,0,0,.6);animation:pop .18s ease}
@keyframes pop{from{transform:scale(.97);opacity:.5}to{transform:none;opacity:1}}
.m-head{background:#fff;border-bottom:1px solid #E8E9F2;padding:18px 24px;display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.m-head h2{font-size:21px;color:${INK}}.m-head .co{font-size:16px;font-weight:500;color:#5A5680;margin-top:4px}
.m-head .meta{font-size:11.5px;color:#A6A2BC;margin-top:6px}
.m-head .qa{display:flex;gap:8px;margin-top:11px;flex-wrap:wrap}
.qbtn{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:${COBALT};background:${alpha(COBALT,.08)};border:none;border-radius:8px;padding:6px 10px;cursor:pointer;text-decoration:none}
.qbtn:hover{background:${alpha(COBALT,.15)}}
.m-x{background:#F0F1F7;border:none;border-radius:9px;width:34px;height:34px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#56527a;flex:none}.m-x:hover{background:#E6E7F1}.m-x:disabled{opacity:.35;cursor:default}
.m-grid{display:grid;grid-template-columns:1.15fr .85fr;overflow:hidden;flex:1;min-height:0}
.m-left{padding:20px 22px;overflow-y:auto}.m-right{padding:20px 22px;overflow-y:auto;background:#fff;border-left:1px solid #E8E9F2;display:flex;flex-direction:column}
@media(max-width:760px){.m-grid{grid-template-columns:1fr;overflow-y:auto}.m-left,.m-right{overflow:visible}.m-right{border-left:none;border-top:1px solid #E8E9F2}}
.dh{font-size:11.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:${COBALT};margin:2px 0 12px;display:flex;align-items:center;gap:8px}.dh.mt{margin-top:22px}
.fgrid{display:grid;grid-template-columns:1fr 1fr;gap:11px}
.field label:not(.toggle){display:block;font-size:10.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#928DAD;margin-bottom:5px}
.field input,.field select,.field textarea{width:100%;padding:9px 11px;border:1px solid #DEDFEA;border-radius:9px;font-size:13.5px;font-family:'Inter';color:${INK};background:#fff}
.field textarea{resize:vertical}
.field input:focus,.field select:focus,.field textarea:focus{outline:none;border-color:${COBALT};box-shadow:0 0 0 3px ${alpha(COBALT,.13)}}
.field input:focus,.field select:focus{outline:none;border-color:${COBALT};box-shadow:0 0 0 3px ${alpha(COBALT,.13)}}
.field.full{grid-column:1/-1}
.chips{display:flex;flex-wrap:wrap;gap:7px}
.chip{font-size:12px;font-weight:600;padding:7px 11px;border-radius:20px;border:1px solid #DEDFEA;background:#fff;color:#56527a;cursor:pointer;transition:.14s;display:inline-flex;align-items:center;gap:6px}
.chip.on{border-color:${COBALT};background:${alpha(COBALT,.1)};color:${COBALT}}
.chip.add{border-style:dashed;color:#928DAD}
.toggle{display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13.5px;color:${INK};font-weight:500;margin-top:11px}
.extras{display:flex;flex-direction:column;gap:8px;margin-top:10px}
.extra-row{display:flex;align-items:center;gap:8px}
.extra-row .ex-label{flex:1;padding:9px 11px;border:1px solid #DEDFEA;border-radius:9px;font-size:13px;font-family:'Inter';color:${INK};background:#fff}
.extra-row .ex-label:focus{outline:none;border-color:${COBALT};box-shadow:0 0 0 3px ${alpha(COBALT,.13)}}
.ex-amt-w{display:flex;align-items:center;gap:4px;border:1px solid #DEDFEA;border-radius:9px;padding:0 10px;background:#fff;width:120px}
.ex-amt-w span{color:#928DAD;font-size:13px}
.ex-amt-w:focus-within{border-color:${COBALT};box-shadow:0 0 0 3px ${alpha(COBALT,.13)}}
.ex-amt{border:none;outline:none;width:100%;padding:9px 0;font-size:13.5px;font-family:'Inter';color:${INK};background:transparent}
.ex-del{border:none;background:#F2F2F8;color:#928DAD;width:34px;height:34px;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex:none}
.ex-del:hover{background:${alpha(RED,.1)};color:${RED}}
.addline{margin-top:10px;background:none;border:1px dashed #CFD0E0;color:${COBALT};font-weight:600;font-size:12.5px;padding:8px 12px;border-radius:9px;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.addline:hover{background:${alpha(COBALT,.05)};border-color:${COBALT}}
.deal-hist{background:color-mix(in srgb,${GREEN} 4%,#fff);border:1px solid color-mix(in srgb,${GREEN} 22%,#fff);border-radius:12px;padding:12px 14px;margin-bottom:14px}
.dh-head{display:flex;justify-content:space-between;align-items:center;font-size:10.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#1a7d46;margin-bottom:8px}
.dh-row{display:flex;align-items:center;gap:10px;padding:7px 0;border-top:1px solid color-mix(in srgb,${GREEN} 14%,#fff)}
.dh-m{flex:1;min-width:0;display:flex;flex-direction:column}
.dh-m b{font-size:13px;color:${INK};font-weight:700}
.dh-m span{font-size:11px;color:#9b98ad}
.dh-v{font-size:14px;font-weight:800;color:#1a7d46;font-family:'Space Grotesk',sans-serif}
.dh-note{margin-top:9px;padding-top:9px;border-top:1px solid color-mix(in srgb,${GREEN} 14%,#fff);font-size:12px;color:#56527a}
.dh-note b{color:${INK};font-weight:800}
.deal-card{border:1px solid #E7E8F1;border-radius:13px;padding:14px;margin-bottom:12px;background:#FBFBFE}
.deal-card-h{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.deal-name{flex:1;min-width:0;border:none;background:none;font-family:'Space Grotesk',sans-serif;font-size:15px;font-weight:700;color:${INK};padding:2px 0;border-bottom:1.5px solid transparent}
.deal-name:focus{outline:none;border-bottom-color:${COBALT}}
.deal-card-v{font-size:14px;font-weight:800;color:${COBALT};font-family:'Space Grotesk',sans-serif}
.deal-add-btn{width:100%;display:flex;align-items:center;justify-content:center;gap:7px;padding:11px;border:1.5px dashed #C9CBDD;border-radius:11px;background:#fff;color:${COBALT};font-size:13px;font-weight:700;cursor:pointer;transition:.15s;margin-bottom:8px}
.deal-add-btn:hover{border-color:${COBALT};background:color-mix(in srgb,${COBALT} 5%,#fff)}
.pay-panel{margin-top:16px;padding:14px;border:1px solid #E7E8F1;border-radius:13px;background:#FBFBFE}
.pay-head{display:flex;justify-content:space-between;align-items:center;font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#8b88a0;margin-bottom:10px}
.pay-head b.due{color:#D97706;font-size:13px}
.pay-head b.clear{color:#1a7d46;font-size:13px}
.pay-bars{margin-bottom:12px}
.pay-bar{height:9px;background:#EEF0F8;border-radius:5px;overflow:hidden}
.pay-bar>div{height:100%;border-radius:5px;background:linear-gradient(90deg,${GREEN},#2BA35C);transition:width .3s}
.pay-nums{display:flex;justify-content:space-between;font-size:11.5px;color:#8b88a0;font-weight:600;margin-top:5px}
.pay-nums span:first-child{color:#1a7d46;font-weight:700}
.pay-list{display:flex;flex-direction:column;gap:2px;margin-bottom:10px}
.pay-row{display:flex;align-items:center;gap:10px;padding:7px 0;border-top:1px solid #EFEFF6}
.pay-m{flex:1;display:flex;flex-direction:column}
.pay-m b{font-size:14px;color:${INK};font-weight:700;font-family:'Space Grotesk',sans-serif}
.pay-m span{font-size:11px;color:#9b98ad}
.pay-over{font-size:11.5px;color:#D97706;font-weight:600;margin-bottom:8px}
.pay-add{width:100%;display:flex;align-items:center;justify-content:center;gap:7px;padding:10px;border:none;border-radius:10px;background:${GREEN};color:#fff;font-size:13px;font-weight:700;cursor:pointer;transition:.15s}
.pay-add:hover{filter:brightness(1.05)}
.kbal{flex:none;font-size:10.5px;font-weight:700;color:#D97706;background:color-mix(in srgb,#FFA500 12%,#fff);border-radius:11px;padding:1px 8px}
.deal-close-btn.sm{margin-top:10px;padding:9px;font-size:12.5px}
.deal-close-btn{width:100%;margin-top:12px;display:flex;align-items:center;justify-content:center;gap:8px;padding:11px;border:none;border-radius:11px;background:${GREEN};color:#fff;font-size:13.5px;font-weight:700;cursor:pointer;transition:.15s}
.deal-close-btn:hover{filter:brightness(1.05);transform:translateY(-1px)}
.deal-total{display:flex;justify-content:space-between;align-items:center;margin-top:12px;padding:11px 13px;background:#F6F7FB;border-radius:10px}
.deal-total span{font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#928DAD}
.deal-total b{font-family:'Space Grotesk';font-size:17px;color:${INK}}
.sw{width:42px;height:24px;border-radius:14px;background:#D9DAE6;position:relative;transition:.18s;flex:none}.sw.on{background:${GREEN}}
.sw b{position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;transition:.18s;box-shadow:0 1px 3px rgba(0,0,0,.2)}.sw.on b{left:21px}
.sw.sm{width:34px;height:20px}.sw.sm b{width:14px;height:14px}.sw.sm.on b{left:17px}
/* activity */
.afilter{display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap}
.afilter button{font-size:11.5px;font-weight:600;padding:5px 10px;border-radius:8px;border:1px solid #E4E5F0;background:#fff;color:#8E89A8;cursor:pointer}
.afilter button.on{border-color:${COBALT};background:${alpha(COBALT,.08)};color:${COBALT}}
.spon-row{display:flex;gap:10px;flex-wrap:wrap;margin-top:2px}
.spon-tog{display:inline-flex;align-items:center;gap:8px;padding:9px 14px;border:1px solid #E1E2EC;border-radius:10px;font-size:13px;font-weight:600;color:#56527a;cursor:pointer;background:#fff}
.spon-tog input{accent-color:${COBALT};width:15px;height:15px;cursor:pointer}
.spon-tog.on{border-color:${COBALT};background:${alpha(COBALT,.08)};color:${COBALT}}
.spon-tog.past input{accent-color:${GOLD}}
.spon-tog.past.on{border-color:${GOLD};background:${alpha(GOLD,.12)};color:#8a6a1f}
.spon-badge{display:inline-block;font-size:11px;font-weight:700;padding:2px 9px;border-radius:20px;background:${alpha(COBALT,.1)};color:${COBALT}}
.spon-badge.past{background:${alpha(GOLD,.16)};color:#8a6a1f}
.spon-tog.rel input{accent-color:#7A5CC8}
.spon-tog.rel.on{border-color:#7A5CC8;background:rgba(122,92,200,.1);color:#5b3fa6}
.rel-hint{font-size:11.5px;color:#8b88a0;margin-top:7px;line-height:1.45}
.rel-tiers{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:12px}
.rel-tier{display:flex;flex-direction:column;min-height:280px;background:#fff;border:1.5px solid #EAEBF2;border-radius:14px;overflow:hidden;position:relative;transition:.14s}
.rel-tier::before{content:'';position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--tc);z-index:1}
.rel-tier:hover{border-color:var(--tc)}
.rel-tier.on{border-color:var(--tc);box-shadow:0 10px 26px -16px var(--tc)}
.rt-head{padding:15px 16px 12px;cursor:pointer;border-bottom:1px solid #F1F1F7}
.rel-tier.on .rt-head{background:color-mix(in srgb,var(--tc) 8%,#fff)}
.rt-top{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:800;color:${INK}}
.rt-dot{width:9px;height:9px;border-radius:50%;background:var(--tc);flex:none}
.rt-count{margin-left:auto;font-size:13px;font-weight:800;color:#fff;background:var(--tc);min-width:24px;text-align:center;padding:2px 8px;border-radius:20px}
.rt-d{font-size:11.5px;color:#8b88a0;font-weight:500;margin-top:5px}
.rt-people{flex:1;overflow-y:auto;padding:6px}
.rt-person{display:flex;align-items:baseline;gap:8px;padding:7px 10px;border-radius:8px;cursor:pointer}
.rt-person:hover{background:color-mix(in srgb,var(--tc) 8%,#fff)}
.rt-pn{font-size:13px;font-weight:600;color:${INK};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rt-pc{font-size:11px;color:#928DAD;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1}
.rt-empty{padding:24px 12px;text-align:center;font-size:12px;color:#b7b4c6}
.rt-foot{padding:9px 14px;font-size:11px;font-weight:700;color:var(--tc);text-align:center;border-top:1px solid #F1F1F7;cursor:pointer;background:#FCFCFE}
.rt-foot:hover{background:color-mix(in srgb,var(--tc) 6%,#fff)}
.rel-netline{display:flex;align-items:center;gap:8px;font-size:12px;color:#8b88a0;font-weight:600;margin-bottom:16px;flex-wrap:wrap}
.rel-clearf{margin-left:auto;border:1px solid #E1E2EC;background:#fff;border-radius:20px;padding:4px 11px;font-size:11.5px;font-weight:700;color:${COBALT};cursor:pointer}
.rel-clearf:hover{background:${alpha(COBALT,.06)}}
.tier-pick{display:inline-flex;align-items:center;gap:5px}
.tier-dot{width:8px;height:8px;border-radius:50%;background:var(--tc);flex:none}
.tier-pick select{border:1px solid #E7E8F0;border-radius:20px;padding:3px 8px;font-size:11.5px;font-weight:700;color:var(--tc);background:#fff;cursor:pointer}
.tier-btns{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
.tier-btn{display:inline-flex;align-items:center;gap:6px;border:1.5px solid #E1E2EC;background:#fff;border-radius:20px;padding:6px 13px;font-size:12.5px;font-weight:700;color:#56527a;cursor:pointer}
.tier-btn.on{border-color:var(--tc);color:var(--tc);background:color-mix(in srgb,var(--tc) 8%,#fff)}
@media(max-width:640px){.rel-tiers{grid-template-columns:1fr}}
.rel-from{display:inline-flex;align-items:center;gap:6px;margin-top:10px;padding:7px 11px;border-radius:9px;background:rgba(122,92,200,.08);border:1px solid rgba(122,92,200,.22);color:#5b3fa6;font-size:12.5px;cursor:pointer}
.rel-from:hover{background:rgba(122,92,200,.15)}
.rel-gave{display:flex;align-items:center;gap:7px;margin-top:10px;padding:8px 11px;border-radius:9px;background:#F4F5FA;border:1px solid #E5E6F0;color:#56527a;font-size:12.5px}
.rel-chip{display:inline-flex;align-items:center;gap:4px;font-size:11.5px;font-weight:600;padding:3px 9px;border-radius:20px;background:rgba(122,92,200,.1);color:#5b3fa6}
.rel-ghead{display:flex;align-items:center;gap:10px;margin-bottom:10px}
.rel-gname{display:inline-flex;align-items:center;gap:6px;font-size:14px;font-weight:800;color:#5b3fa6;cursor:pointer}
.rel-gname:hover{text-decoration:underline}
.rel-gname.plain{color:#8b88a0;cursor:default}
.rel-gname.plain:hover{text-decoration:none}
.rel-gcount{font-size:11px;font-weight:700;padding:2px 9px;border-radius:20px;background:#EEF0F7;color:#56527a}
/* collapsible modal sections */
.msecs{margin-top:18px;border-top:1px solid #F0F0F6}
.msec{border-bottom:1px solid #F0F0F6}
.msec-h{display:flex;align-items:center;gap:9px;padding:13px 2px;cursor:pointer;user-select:none}
.msec-h:hover .msec-t{color:${COBALT}}
.msec-t{display:flex;align-items:center;gap:7px;font-size:11.5px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:${INK};transition:.12s}
.msec-s{margin-left:auto;font-size:12px;color:#9b98ad;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:52%}
.msec-ch{color:#c0bdd0;flex:none;transition:transform .16s;margin-left:auto}
.msec-s+.msec-ch{margin-left:6px}
.msec.open .msec-ch{transform:rotate(180deg);color:${COBALT}}
.msec-b{padding:2px 2px 16px}
/* quick add */
.morebtn{display:flex;align-items:center;gap:7px;width:100%;margin-top:16px;padding:11px 12px;border:1px dashed #D6D8E6;border-radius:10px;background:#FAFAFE;color:#56527a;font-size:12.5px;font-weight:700;cursor:pointer}
.morebtn:hover{border-color:${COBALT};color:${COBALT}}
.morebtn i{margin-left:auto;font-style:normal;font-size:11.5px;color:#9b98ad;font-weight:500}
.mb-ch{transition:transform .16s}.mb-ch.on{transform:rotate(180deg)}
.dupe-warn{display:flex;align-items:center;gap:8px;margin-top:10px;padding:9px 12px;border-radius:9px;background:#FFF7ED;border:1px solid #FCD9B6;color:#9a5a16;font-size:12.5px}
.dupe-warn b{cursor:pointer;text-decoration:underline}
/* follow-up block in modal */
.fu-block{background:#FAFAFE;border:1px solid #EDEEF5;border-radius:11px;padding:13px}
.fu-note{width:100%;border:1px solid #E1E2EC;border-radius:9px;padding:9px 11px;font-size:13px;font-family:inherit;color:${INK};resize:vertical;line-height:1.5}
.fu-note:focus{outline:none;border-color:${COBALT}}
.fu-when{margin-top:10px;font-size:11.5px;font-weight:700;color:#1f8a55}
.fu-when.od{color:#b4322e}
.fn-block{background:#FAFAFE;border:1px solid #EDEEF5;border-radius:11px;padding:13px}
.fn-hint{display:flex;align-items:center;gap:5px;margin-top:8px;font-size:11.5px;color:#9b98ad;font-weight:500}
.chip-toggle{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;font-weight:600;color:#56527a;cursor:pointer}
.chip-toggle input{accent-color:${COBALT};width:15px;height:15px;cursor:pointer}
.phase-badge{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:700;padding:3px 11px;border-radius:20px;white-space:nowrap}
.cli-list{display:flex;flex-direction:column;gap:10px}
.cli-card{background:#fff;border:1px solid #EAEBF2;border-radius:13px;overflow:hidden}
.cli-card.od{border-color:#F3C9C2}
.cli-main{display:grid;grid-template-columns:1.4fr auto 1.5fr 1.6fr auto;gap:16px;align-items:center;padding:14px 16px;cursor:pointer}
.cli-main:hover{background:#FCFCFE}
.cli-id{min-width:0}
.cli-name{font-weight:700;color:${INK};font-size:14.5px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cli-name:hover{color:${COBALT};text-decoration:underline}
.cli-prog2{min-width:0}
.cli-prog2-top{display:flex;justify-content:space-between;font-size:11px;font-weight:700;color:#8b88a0;margin-bottom:5px;text-transform:uppercase;letter-spacing:.04em}
.cli-status{display:flex;flex-direction:column;gap:5px;align-items:flex-start;min-width:0}
.cli-next{display:inline-flex;align-items:center;gap:5px;font-size:12px;color:#56527a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.cli-next svg{flex:none;color:#C9C5D9}
.cli-ch{color:#c0bdd0;transition:transform .16s;flex:none}
.cli-ch.open{transform:rotate(180deg);color:${COBALT}}
.cli-body{border-top:1px solid #EEF0F6;padding:14px 16px;background:#FAFBFE}
.cli-actions{display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap}
.phase-sel{border:1px solid #E1E2EC;border-radius:8px;padding:6px 10px;font-size:12.5px;color:${INK};background:#fff;font-weight:600}
.onb-group{margin-bottom:14px}
.onb-gh{display:flex;align-items:center;gap:9px;margin-bottom:7px}
.onb-gc{font-size:11px;font-weight:700;color:#8b88a0}
.onb-item{display:flex;align-items:center;gap:10px;padding:7px 9px;border-radius:8px}
.onb-item:hover{background:#fff}
.onb-item.over{background:${alpha(RED,.05)}}
.onb-check{cursor:pointer;flex:none;display:flex}
.onb-label{flex:1;min-width:0;font-size:13px;color:${INK};cursor:pointer;line-height:1.4}
.onb-item.done .onb-label{color:#9b98ad;text-decoration:line-through}
.onb-date{font-size:11.5px;font-weight:600;color:#1f8a55;white-space:nowrap;flex:none}
.onb-due{display:inline-flex;align-items:center;gap:6px;flex:none}
.onb-due span{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#a6a2bc}
.onb-due input{border:1px solid #E1E2EC;border-radius:7px;padding:3px 7px;font-size:11.5px;color:#56527a;background:#fff}
.onb-due input.over{border-color:#E0967F;color:#b4322e}
@media(max-width:820px){.cli-main{grid-template-columns:1fr auto;gap:9px}.cli-prog2,.cli-status{grid-column:1/-1}.cli-ch{position:absolute;right:16px;top:16px}}
.seg i{font-style:normal;font-size:10px;font-weight:800;padding:1px 6px;border-radius:20px;background:#DFE2EE;color:#56527a;margin-left:6px}
.seg button.on i{background:${COBALT};color:#fff}
.cp-tag{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;background:rgba(122,92,200,.15);color:#7A5CC8;padding:1px 5px;border-radius:5px;margin-left:6px}
.cli-hint{display:flex;align-items:center;gap:7px;justify-content:center;padding:20px;color:#a6a2bc;font-size:13px}
.cli-detail{background:#fff;border:1px solid #EAEBF2;border-radius:13px;padding:16px;margin-top:14px}
.cli-detail-h{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:14px}
.cp-list{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}
.cp-chip{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;border:1px solid;border-radius:20px;padding:3px 10px}
.cp-chip button{background:none;border:none;cursor:pointer;color:inherit;display:flex;opacity:.6;padding:0}
.cp-chip button:hover{opacity:1}
.cp-add{display:flex;align-items:center;gap:7px;flex-wrap:wrap;background:#F7F8FC;border:1px solid #EDEEF5;border-radius:9px;padding:7px 9px}
.cp-add input[type=text],.cp-add>input:not([type=color]){border:1px solid #E1E2EC;border-radius:7px;padding:5px 8px;font-size:12.5px}
.cp-add input[type=color]{width:30px;height:30px;border:1px solid #E1E2EC;border-radius:7px;padding:2px;background:#fff;cursor:pointer}
.cp-add label{display:inline-flex;align-items:center;gap:5px;font-size:12px;color:#56527a}
.cp-add select{border:1px solid #E1E2EC;border-radius:7px;padding:5px 7px;font-size:12px}
.phase-editor{display:flex;flex-direction:column;gap:8px;margin-bottom:10px}
.phase-row{display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid #EDEEF5;border-radius:10px;background:#FAFAFE}
.phase-row input[type=color]{width:30px;height:30px;border:1px solid #E1E2EC;border-radius:7px;padding:2px;background:#fff;cursor:pointer;flex:none}
.phase-label{flex:1;border:1px solid #E1E2EC;border-radius:7px;padding:6px 9px;font-size:13px;font-weight:600;color:${INK}}
.phase-key{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#a6a2bc;flex:none}
.phase-moves{display:flex;gap:3px;flex:none}
.m-foot{flex:none;background:#fff;border-top:1px solid #E8E9F2;padding:13px 22px;display:flex;align-items:center;gap:10px;box-shadow:0 -6px 20px -12px rgba(0,0,0,.18)}
.m-foot-n{display:flex;align-items:center;gap:5px;margin-left:auto;font-size:12px;color:#8b88a0;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
/* follow-up card: plan + next flow */
.fu-plan{display:flex;gap:7px;align-items:flex-start;margin:9px 0 0;padding:8px 10px;background:#FFFDF5;border:1px solid #F0E4C0;border-radius:8px;font-size:12.5px;color:#6a5a2f;line-height:1.45}
.fu-plan svg{flex:none;margin-top:1px;color:#B9932F}
.fu-next{background:#F4F7FF;border:1px solid #D6E0FA;border-radius:10px;padding:11px}
.fu-next-h{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:${INK};margin-bottom:8px}
.fu-next-h b{color:${COBALT}}
.fu-next-b{display:flex;align-items:center;gap:8px;margin-top:9px;flex-wrap:wrap}
.fu-next-note{font-size:11px;color:#9b98ad}
.rel-chain{margin-top:12px;padding:11px 13px;border-radius:10px;background:#F7F8FC;border:1px solid #EDEEF5}
.rc-lbl{font-size:10px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:#9b98ad;margin-bottom:7px}
.rc-path{display:flex;align-items:center;gap:5px;flex-wrap:wrap}
.rc-node{font-size:12.5px;font-weight:700;color:#5b3fa6;background:rgba(122,92,200,.1);padding:3px 9px;border-radius:20px;cursor:pointer}
.rc-node:hover{background:rgba(122,92,200,.2)}
.rc-node.root{background:${alpha(GOLD,.18)};color:#8a6a1f}
.rc-node.self{background:${INK};color:#fff;cursor:default}
.rc-arrow{color:#c7c5d4;flex:none}
.rc-root{margin-top:8px;font-size:12px;color:#8b88a0}
.rc-root b{color:#8a6a1f;cursor:pointer}
.rc-root b:hover{text-decoration:underline}
.web-card{padding:14px}
.web-actions{margin-left:auto;display:flex;gap:8px}
.task-daypick{display:flex;align-items:center;gap:6px}
.day-chip{border:1px solid #E1E2EC;background:#fff;border-radius:9px;padding:9px 12px;font-size:12.5px;font-weight:700;color:#56527a;cursor:pointer}
.day-chip.on{border-color:${COBALT};background:color-mix(in srgb,${COBALT} 8%,#fff);color:${COBALT}}
.day-date{display:inline-flex;align-items:center;gap:6px;border:1px solid #E1E2EC;border-radius:9px;padding:8px 11px;color:#56527a;cursor:pointer}
.day-date input{border:none;background:none;font-size:12.5px;font-family:inherit;color:#56527a;cursor:pointer;width:120px}
.day-date input:focus{outline:none}
.task-due-chip{position:relative;display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;padding:3px 9px;border-radius:20px;cursor:pointer}
.task-due-chip input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}
.gcal-on{display:flex;align-items:center;gap:11px;background:color-mix(in srgb,${GREEN} 7%,#fff);border:1px solid color-mix(in srgb,${GREEN} 25%,#fff);border-radius:11px;padding:13px 15px}
.gcal-dot{width:10px;height:10px;border-radius:50%;background:${GREEN};flex:none;box-shadow:0 0 0 4px color-mix(in srgb,${GREEN} 18%,#fff)}
.gcal-off{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.mtg-warn{display:flex;align-items:flex-start;gap:7px;background:#FFF7ED;border:1px solid #FCD9B6;color:#9a5a16;border-radius:9px;padding:9px 11px;font-size:12.5px;margin-bottom:12px;line-height:1.45}
.mtg-warn svg{flex:none;margin-top:2px}
.act-t.booked{border-color:#F0C09B;color:#C05A1E}
.act-t.booked.on{background:#E0662B;border-color:#E0662B;color:#fff}
/* header quick facts (the qualifying data, surfaced at the top) */
.m-headright{display:flex;flex-direction:column;align-items:flex-end;gap:10px;flex:none;min-width:0}
.m-facts{display:flex;flex-wrap:wrap;gap:7px;justify-content:flex-end;max-width:430px}
.mf{display:flex;flex-direction:column;align-items:flex-start;gap:1px;background:#F7F8FC;border:1px solid #EAEBF2;border-radius:9px;padding:5px 10px;cursor:pointer;text-align:left;min-width:72px;transition:.12s}
.mf:hover{border-color:${COBALT};background:color-mix(in srgb,${COBALT} 6%,#fff)}
.mf i{font-style:normal;font-size:9px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#a6a2bc}
.mf b{font-size:12.5px;font-weight:700;color:${INK};white-space:nowrap;max-width:130px;overflow:hidden;text-overflow:ellipsis}
.mf.hot{border-color:#EFB98F;background:color-mix(in srgb,#E0662B 8%,#fff)}
.mf.hot b{color:#C05A1E}
/* jump bar — one tap to any section, no scrolling */
.m-jump{display:flex;align-items:center;gap:7px;flex-wrap:wrap;padding:10px 24px;background:#fff;border-bottom:1px solid #E8E9F2;flex:none}
.mj-l{font-size:10px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:#a6a2bc;margin-right:2px}
.mj{display:inline-flex;align-items:center;gap:6px;border:1px solid #E4E5EF;background:#fff;border-radius:20px;padding:6px 13px;font-size:12.5px;font-weight:700;color:#56527a;cursor:pointer;transition:.12s}
.mj:hover{border-color:${COBALT};color:${COBALT}}
.mj.on{background:color-mix(in srgb,${COBALT} 8%,#fff);border-color:${COBALT};color:${COBALT}}
.mj i{font-style:normal;font-size:10px;font-weight:800;background:#EEF0F7;color:#56527a;border-radius:20px;padding:1px 6px}
.mj.on i{background:${COBALT};color:#fff}
@media(max-width:820px){
  .m-head{flex-wrap:wrap}
  .m-headright{max-width:100%}
  .m-facts{max-width:100%;gap:6px}
  .mf{min-width:0;padding:4px 8px}
  .mf b{font-size:12px;max-width:92px}
  .mf:nth-child(n+5){display:none}
  .m-jump{padding:9px 16px;overflow-x:auto;flex-wrap:nowrap;-webkit-overflow-scrolling:touch}
  .mj{flex:none}
  .mj-l{display:none}
}
.mtg-form{margin-top:6px}
.mtg-toggles{display:flex;gap:8px;flex-wrap:wrap}
.mtg-chk{display:inline-flex;align-items:center;gap:6px;border:1.5px solid #E1E2EC;border-radius:9px;padding:8px 11px;font-size:12.5px;font-weight:600;color:#56527a;cursor:pointer}
.mtg-chk input{display:none}
.mtg-chk.on{border-color:${COBALT};color:${COBALT};background:color-mix(in srgb,${COBALT} 7%,#fff)}
.mtg-chk.off{opacity:.5;cursor:not-allowed}
.mtg-err{color:#b4322e;font-size:12.5px;margin:8px 0}
.mtg-list{margin-bottom:14px}
.mtg-empty{font-size:12.5px;color:#9b98ad;padding:8px 0 14px}
.mtg-band{font-size:10.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#8b88a0;margin:10px 0 7px}
.mtg-band.past{color:#b7b4c6}
.mtg-row{display:flex;align-items:center;gap:11px;padding:9px 11px;border:1px solid #EDEEF5;border-radius:10px;margin-bottom:7px;background:#FBFBFE}
.mtg-when{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:${INK};white-space:nowrap;flex:none}
.mtg-when svg{color:${COBALT}}
.mtg-mid{flex:1;min-width:0}
.mtg-title{font-size:13px;font-weight:600;color:${INK};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mtg-badges{display:flex;gap:6px;margin-top:4px;flex-wrap:wrap}
.mtg-b{display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:700;color:#56527a;background:#EEF0F7;border-radius:20px;padding:2px 8px;text-decoration:none}
.mtg-b.link{color:${COBALT};background:color-mix(in srgb,${COBALT} 8%,#fff)}
.mtg-b.type{background:color-mix(in srgb,#7A5CC8 12%,#fff);color:#6A4CB8}
.mtg-row.held{border-color:color-mix(in srgb,${GREEN} 35%,#fff);background:color-mix(in srgb,${GREEN} 4%,#fff)}
.mtg-row.noshow{border-color:#F0C9C4;background:${alpha(RED,.04)}}
.mtg-status{display:flex;gap:5px;flex:none}
.ms-b{display:inline-flex;align-items:center;gap:4px;border:1px solid #E4E5EF;background:#fff;border-radius:20px;padding:4px 9px;font-size:10.5px;font-weight:700;color:#8b88a0;cursor:pointer}
.ms-b.held.on{border-color:${GREEN};background:color-mix(in srgb,${GREEN} 12%,#fff);color:#1a7d46}
.ms-b.no.on{border-color:${RED};background:${alpha(RED,.1)};color:#b4322e}
.ms-b:hover{border-color:#C9C5D9}
.mtype-row{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}
.mtype-row.sm{margin:8px 0 0}
.mtype{border:1px solid #E4E5EF;background:#fff;border-radius:20px;padding:5px 11px;font-size:11.5px;font-weight:700;color:#56527a;cursor:pointer}
.mtype.on{border-color:#7A5CC8;background:color-mix(in srgb,#7A5CC8 8%,#fff);color:#6A4CB8}
.mod-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px}
.mod-row{display:flex;align-items:center;gap:9px;padding:10px 12px;border:1px solid #EDEEF5;border-radius:10px;background:#FAFAFE;cursor:pointer;font-size:13px;font-weight:600;color:#8b88a0}
.mod-row.on{border-color:color-mix(in srgb,${GREEN} 30%,#fff);background:color-mix(in srgb,${GREEN} 5%,#fff);color:${INK}}
.mod-row input{display:none}
.mod-row span{flex:1}
.mt-break{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin:-4px 0 18px;padding:11px 15px;background:#fff;border:1px solid #EAEBF2;border-radius:12px}
.mtb-l{font-size:10.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#a6a2bc}
.mtb{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:#56527a;font-weight:600;background:#F5F6FB;border-radius:20px;padding:3px 11px}
.mtb b{font-size:14px;color:${INK};font-family:'Space Grotesk',sans-serif}
.kpi.clickable{cursor:pointer;transition:.14s}
.kpi.clickable:hover{transform:translateY(-1px);box-shadow:0 12px 26px -14px ${alpha(COBALT,.28)}}
.kpi.active{outline:2px solid ${COBALT};outline-offset:-2px}
.kpi.active .kpi-ch{color:#FFA500}
.kpi-ch{margin-left:auto;opacity:.5;transition:transform .16s}
.kpi-ch.on{transform:rotate(180deg);opacity:1}
.drill{background:#fff;border:1px solid #EAEBF2;border-radius:14px;margin:-4px 0 18px;overflow:hidden;animation:pop .16s ease}
.drill-h{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid #F0F1F7;background:#FBFBFE}
.drill-t{font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:${INK}}
.drill-s{font-size:12px;color:#8b88a0;font-weight:600}
.drill-b{max-height:420px;overflow-y:auto;padding:8px 10px}
.drow{display:flex;align-items:center;gap:12px;padding:9px 11px;border-radius:9px}
.drow:hover{background:#FAFAFE}
.drow+.drow{border-top:1px solid #F4F4FA}
.drow.untyped{background:color-mix(in srgb,#E0662B 5%,#fff)}
.drow-m{flex:1;min-width:0}
.drow-t{font-size:13.5px;font-weight:700;color:${INK};cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block}
.drow-t:hover{color:${COBALT};text-decoration:underline}
.drow-v{font-size:13px;font-weight:700;color:${INK};white-space:nowrap;flex:none}
.mtg-type{border:1px solid #E4E5EF;border-radius:20px;padding:4px 9px;font-size:11.5px;font-weight:700;color:#6A4CB8;background:color-mix(in srgb,#7A5CC8 8%,#fff);cursor:pointer;flex:none}
".mtg-type.unset{color:#C05A1E;background:color-mix(in srgb,#E0662B 9%,#fff);border-color:#F0C09B}
.kgroup{font-size:10.5px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:${COBALT};margin:2px 0 9px;display:flex;align-items:center;gap:8px}
.kgroup::before{content:'';width:14px;height:2px;border-radius:2px;background:#FFA500}
.hud-top{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:16px}
.hud-t{font-size:21px;font-weight:800;color:${INK};font-family:'Space Grotesk',sans-serif}
.hud-d{font-size:12.5px;color:#8b88a0;font-weight:600;margin-top:3px}
.hud-empty{display:flex;flex-direction:column;align-items:center;gap:7px;text-align:center;background:#fff;border:1px dashed #DCDEEA;border-radius:14px;padding:30px 22px;margin-bottom:20px}
.hud-empty svg{color:${COBALT}}
.hud-empty b{font-size:15px;color:${INK}}
.hud-empty span{font-size:13px;color:#8b88a0;max-width:460px;line-height:1.5}
.hud-brief{background:linear-gradient(135deg,${INDIGO},${INK});border-radius:16px;padding:22px 24px;margin-bottom:22px;color:#fff}
.hb-head{font-size:20px;font-weight:800;line-height:1.3;font-family:'Space Grotesk',sans-serif}
.hb-read{font-size:14px;line-height:1.6;color:rgba(255,255,255,.82);margin:10px 0 0}
.hb-cols{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:18px}
.hb-col{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:11px;padding:13px 15px}
.hb-ct{display:flex;align-items:center;gap:6px;font-size:10.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:rgba(255,255,255,.62);margin-bottom:8px}
.hb-col.win .hb-ct{color:#8FE3B4}
.hb-col.warn .hb-ct{color:#F5C08E}
.hb-li{font-size:13px;line-height:1.5;color:rgba(255,255,255,.9);padding:4px 0}
.hb-li+.hb-li{border-top:1px solid rgba(255,255,255,.08)}
.hb-focus{margin-top:14px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:11px;padding:13px 15px}
.hb-focus .hb-ct{color:#BFC8FF}
.hb-f{padding:6px 0;font-size:13px;line-height:1.5}
.hb-f+.hb-f{border-top:1px solid rgba(255,255,255,.08)}
.hb-f b{display:block;color:#fff;font-weight:700}
.hb-f span{color:rgba(255,255,255,.72)}
.hb-proj{display:flex;align-items:flex-start;gap:8px;margin-top:14px;font-size:13px;line-height:1.55;color:rgba(255,255,255,.85);background:rgba(255,255,255,.07);border-radius:11px;padding:12px 15px}
.hb-proj svg{flex:none;margin-top:2px;color:${GOLD}}
.hb-when{margin-top:12px;font-size:11px;color:rgba(255,255,255,.45)}
.hstats{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:11px;margin-bottom:20px}
.hstat{background:#fff;border:1px solid #EAEBF2;border-radius:12px;padding:13px 15px}
.hs-l{font-size:10.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#a6a2bc}
.hs-v{display:flex;align-items:baseline;gap:8px;font-size:23px;font-weight:800;color:${INK};margin:5px 0 2px;font-family:'Space Grotesk',sans-serif}
.hs-p{font-size:11px;color:#b7b4c6}
.dl{font-size:10.5px;font-weight:800;padding:1px 7px;border-radius:20px}
.dl.up{background:color-mix(in srgb,${GREEN} 14%,#fff);color:#1a7d46}
.dl.down{background:${alpha(RED,.11)};color:#b4322e}
.dl.flat{background:#F0F1F7;color:#8b88a0}
.hlist{display:flex;flex-direction:column;gap:6px;margin-top:4px;max-height:330px;overflow-y:auto}
.hli{display:flex;align-items:center;gap:8px;font-size:12.5px;color:#56527a;padding:7px 10px;border-radius:9px;background:#FAFAFE;line-height:1.4}
.hli svg{flex:none;color:#a6a2bc}
.hli.win{background:color-mix(in srgb,${GREEN} 7%,#fff);color:#1a7d46}
.hli.win svg{color:${GREEN}}
.hli.bad{background:${alpha(RED,.06)};color:#b4322e}
.hli.bad svg{color:${RED}}
.hli.warn{background:color-mix(in srgb,#E0662B 6%,#fff);color:#9a5a16}
.hli.warn svg{color:#E0662B}
.hli.done{color:#8b88a0}
@media(max-width:820px){.hb-cols{grid-template-columns:1fr}}
.kgoal{margin-top:9px}
.kgbar{height:5px;border-radius:20px;background:rgba(24,21,48,.09);overflow:hidden}
.kgbar div{height:100%;border-radius:20px;transition:width .35s}
.kgt{display:flex;justify-content:space-between;align-items:center;margin-top:5px;font-size:10.5px;font-weight:700;color:#8b88a0}
.kgt b{font-weight:800;color:${COBALT}}
.kgt b.hit{color:${GREEN}}
.kgt b.behind{color:#D97706}
.kpi.accent .kgbar,.kpi.green .kgbar,.kpi.gold .kgbar{background:rgba(255,255,255,.28)}
.kpi.accent .kgt,.kpi.green .kgt,.kpi.gold .kgt{color:rgba(255,255,255,.75)}
.kpi.accent .kgt b,.kpi.green .kgt b,.kpi.gold .kgt b{color:#fff}
.goal-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px}
.goal-row{display:flex;align-items:center;gap:12px;padding:11px 13px;border:1px solid #EDEEF5;border-radius:10px;background:#FAFAFE}
.goal-l{flex:1;min-width:0;display:flex;flex-direction:column}
.goal-l b{font-size:13px;color:${INK};font-weight:700}
.goal-l span{font-size:11px;color:#9b98ad}
.goal-in{display:flex;align-items:center;gap:3px;flex:none;border:1px solid #E1E2EC;border-radius:9px;background:#fff;padding:0 9px}
.goal-in i{font-style:normal;font-size:12px;color:#a6a2bc;font-weight:700}
.goal-in input{width:74px;border:none;padding:8px 2px;font-size:14px;font-weight:700;color:${INK};text-align:right;background:none}
.goal-in input:focus{outline:none}
.kgroup+.kgrid{margin-bottom:16px}
.funnel{display:flex;flex-direction:column;gap:9px;margin-top:6px}
.fn-row{display:grid;grid-template-columns:104px 1fr 40px 44px 52px;align-items:center;gap:10px}
.fn-row.fn-head{font-size:10px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#b7b4c6}
.fn-head .fn-c,.fn-head .fn-r{text-align:right}
.fn-r.close{font-weight:800;color:#1a7d46}
.fn-r.close.warn{color:#c0392b}
.mtabs{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:12px}
.mtab{display:inline-flex;align-items:center;gap:6px;border:1px solid #E4E5EF;background:#fff;border-radius:20px;padding:6px 12px;font-size:12px;font-weight:700;color:#8b88a0;cursor:pointer}
.mtab.on{border-color:${COBALT};background:color-mix(in srgb,${COBALT} 8%,#fff);color:${COBALT}}
.mtab-n{font-size:10.5px;font-weight:800;background:rgba(24,21,48,.08);border-radius:10px;padding:1px 7px}
.mtab.on .mtab-n{background:color-mix(in srgb,${COBALT} 18%,#fff)}
.mtab.alert{border-color:#FFA500;color:#D97706}
.mtab.alert .mtab-n{background:color-mix(in srgb,#E0662B 16%,#fff);color:#C05A1E}
.mtab-time{margin-left:auto;display:inline-flex;gap:4px}
.mtab-time button{border:1px solid #E4E5EF;background:#fff;border-radius:16px;padding:5px 10px;font-size:11px;font-weight:700;color:#8b88a0;cursor:pointer}
.mtab-time button.on{border-color:${INK};background:${INK};color:#fff}
.mtg-drow{gap:10px}
.mtg-drow.held{background:color-mix(in srgb,${GREEN} 4%,#fff)}
.mtg-drow.noshow{background:${alpha(RED,.04)}}
.mtg-drow.needs{background:color-mix(in srgb,#E0662B 5%,#fff)}
.mtg-flag{color:#D97706;font-weight:700}
.mtg-acct{display:flex;align-items:center;gap:6px;font-size:11.5px;color:#6B6A83;background:#F7F8FC;border:1px solid #E4E5EF;border-radius:10px;padding:7px 10px;margin-bottom:10px}
.mtg-acct b{color:${INK};font-weight:700}
.dash-arrange{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:16px}
.dash-arrange .btn.on{background:${COBALT};color:#fff;border-color:${COBALT}}
.dsec{border:1.5px dashed #D6D8E8;border-radius:16px;padding:0 0 4px;margin-bottom:14px;background:#FCFCFE}
.dsec.dragging{opacity:.45;border-color:${COBALT}}
.dsec.off{opacity:.5}
.dsec-h{display:flex;align-items:center;gap:8px;padding:9px 12px;cursor:grab;border-bottom:1px dashed #E6E7F1}
.dsec-h:active{cursor:grabbing}
.dsec-grip{color:#A5A2BC;flex:none}
.dsec-t{font-size:12.5px;font-weight:700;color:${INK}}
.dsec.off .dsec-t{text-decoration:line-through;color:#9A96AC}
.dsec-btns{margin-left:auto;display:flex;gap:6px}
.dsec-b{display:inline-flex;align-items:center;justify-content:center;min-width:28px;height:26px;border:1px solid #E4E5EF;background:#fff;border-radius:8px;color:${INK};cursor:pointer;font-size:11.5px;font-weight:700}
.dsec-b.wide{padding:0 10px}
.dsec-b:disabled{opacity:.35;cursor:not-allowed}
/* in arrange mode the content is a preview, not a control surface — otherwise
   grabbing a section fires whatever KPI tile happens to be under the cursor */
.dsec-body{pointer-events:none;padding:10px 12px 0;max-height:270px;overflow:hidden;position:relative}
.dsec-body:after{content:'';position:absolute;left:0;right:0;bottom:0;height:44px;background:linear-gradient(to bottom,rgba(252,252,254,0),#FCFCFE)}
.pill-upsell{display:inline-block;margin-right:7px;font-size:9.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:${COBALT};background:color-mix(in srgb,${COBALT} 12%,#fff);border-radius:6px;padding:1px 6px}
.seg-n{margin-left:6px;font-size:10.5px;font-weight:800;opacity:.62}
.seg-b.on .seg-n{opacity:.9}
.task-overdue{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:${RED};background:${alpha(RED,.08)};border:1px solid ${alpha(RED,.2)};border-radius:12px;padding:10px 13px}
.task-hint{display:flex;align-items:center;gap:8px;font-size:13px;color:#5A5680;background:#F4F5FA;border:1px solid #E4E5EF;border-radius:12px;padding:10px 13px}
.ftxt.cancelled{color:#8E89A8;text-decoration:line-through;text-decoration-color:#C9C6D8}
.act-row.cancelled .act-txt,.act-row.cancelled .act-lead{color:#9A96AC;text-decoration:line-through;text-decoration-color:#D5D2E0}
.act-row.cancelled .fcancel{text-decoration:none}
.fcancel{display:inline-block;margin-left:7px;font-size:9.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:${RED};background:${alpha(RED,.09)};border-radius:6px;padding:1px 6px;text-decoration:none;vertical-align:1px}
.mtg-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.bookc{margin-top:10px}
.bookc .mtg-form{padding:0;border:0;background:none}
.mtab.undated{border-color:${COBALT};color:${COBALT}}
.mtab.undated .mtab-n{background:color-mix(in srgb,${COBALT} 16%,#fff);color:${COBALT}}
.mtg-drow.undated{background:color-mix(in srgb,${COBALT} 4%,#fff)}
.mtg-undated{color:${COBALT};font-weight:700}
.mtg-fix{display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap}
.mtg-fix input[type=datetime-local]{border:1px solid #E4E5EF;border-radius:9px;padding:5px 8px;font-size:12px;font-family:inherit;color:${INK};background:#fff}
.mtg-fix select{border:1px solid #E4E5EF;border-radius:9px;padding:5px 6px;font-size:12px;font-family:inherit;color:${INK};background:#fff}
.mtg-fix.sm input[type=datetime-local]{font-size:11.5px;padding:4px 6px}
.mtg-band.undated{color:${COBALT}}
.mtg-row.undated{background:color-mix(in srgb,${COBALT} 4%,#fff)}
@media(max-width:640px){.mtg-fix{width:100%}.mtg-fix input[type=datetime-local]{flex:1 1 150px}}
.an-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:11px;margin-bottom:18px}
.an-card{background:#fff;border:1px solid #EAEBF2;border-radius:13px;padding:14px 16px}
.an-card.warn{border-color:#FFD59E;background:color-mix(in srgb,#FFA500 6%,#fff)}
.an-l{font-size:10.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#a6a2bc}
.an-v{font-size:27px;font-weight:800;color:${INK};font-family:'Space Grotesk',sans-serif;margin:4px 0 2px}
.an-d{font-size:11.5px;color:#9b98ad}
.src-list{display:flex;flex-direction:column;gap:2px;margin-top:6px}
.rbc-list{display:flex;flex-direction:column;gap:3px;margin-top:8px}
.rbc-row{display:grid;grid-template-columns:1fr 120px 88px;align-items:center;gap:12px;padding:8px 10px;border-radius:9px;cursor:pointer;transition:.12s}
.rbc-row:hover{background:#FAFAFE}
.rbc-m{display:flex;align-items:center;gap:8px;min-width:0}
.rbc-name{font-weight:700;color:${INK};font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rbc-deals{flex:none;font-size:10.5px;font-weight:700;color:${COBALT};background:color-mix(in srgb,${COBALT} 9%,#fff);border-radius:11px;padding:1px 8px}
.rbc-mrr{flex:none;font-size:10.5px;font-weight:700;color:#1a7d46;background:color-mix(in srgb,${GREEN} 10%,#fff);border-radius:11px;padding:1px 8px}
.rbc-bar{height:8px;background:#EEF0F8;border-radius:5px;overflow:hidden}
.rbc-bar>div{height:100%;border-radius:5px;background:linear-gradient(90deg,${COBALT},#4E6BF0)}
.rbc-v{text-align:right;font-family:'Space Grotesk',sans-serif;font-weight:800;font-size:14px;color:${INK}}
.rbc-more{margin-top:8px;font-size:12px;color:#928DAD;text-align:center}
@media(max-width:640px){.rbc-row{grid-template-columns:1fr 70px;gap:8px}.rbc-bar{display:none}}
.src-row{display:grid;grid-template-columns:1fr 60px 60px 56px 90px;align-items:center;gap:8px;padding:8px 10px;border-radius:8px;font-size:13px;color:${INK}}
.src-row:not(.src-head):hover{background:#FAFAFE}
.src-row.src-head{font-size:10px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#b7b4c6}
.src-row span:not(.src-name){text-align:right}
.src-name{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.src-hi{color:#1a7d46;font-weight:800}
.src-lo{color:#c0392b;font-weight:800}
@media(max-width:640px){.src-row{grid-template-columns:1fr 40px 40px 44px;gap:6px}.src-row span:nth-child(5){display:none}}
.fn-l{font-size:12.5px;font-weight:700;color:${INK};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fn-bar{height:11px;background:#F1F2F8;border-radius:20px;overflow:hidden}
.fn-bar div{height:100%;border-radius:20px;transition:width .3s}
.fn-c{font-size:13px;font-weight:800;color:${INK};text-align:right;font-family:'Space Grotesk',sans-serif}
.fn-r{font-size:11.5px;font-weight:700;color:#8b88a0;text-align:right}
@media(max-width:640px){.fn-row{grid-template-columns:76px 1fr 30px 38px 40px;gap:6px}}
.web-fs{position:fixed;inset:0;z-index:80;background:#F4F6FB;display:flex;flex-direction:column;padding:16px 20px;animation:pop .16s ease}
.web-fs .web-legend{flex:none;margin-bottom:8px}
.web-fs .web-trace{flex:none}
.web-fs-stage{flex:1;min-height:0;background:#fff;border:1px solid #EAEBF2;border-radius:14px;overflow:hidden;margin-top:8px}
@media(max-width:640px){.web-fs{padding:10px 12px}}
.web-legend{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:10px;font-size:11.5px;color:#8b88a0;font-weight:600}
.web-legend span{display:inline-flex;align-items:center;gap:5px}
.web-legend i{width:9px;height:9px;border-radius:3px;display:inline-block}
.web-tip{color:#c0bdd0!important;font-weight:500}
.web-trace{font-size:12.5px;color:#56527a;background:#F7F8FC;border:1px solid #EDEEF5;border-radius:9px;padding:8px 12px;margin-bottom:10px;line-height:1.5}
.web-trace b{color:${INK}}
.web-trace span{color:#5b3fa6;font-weight:600;cursor:pointer}
.web-trace span:hover{text-decoration:underline}
.web-scroll{overflow:auto;max-height:66vh;border:1px solid #F0F1F6;border-radius:10px;background:linear-gradient(#FCFCFE,#FCFCFE)}
.web-svg{display:block}
.web-you{fill:${INK}}
.web-youtxt{fill:#fff;font-size:12px;font-weight:700;font-family:'Space Grotesk',sans-serif}
.web-link{fill:none;stroke:#DCDEEA;stroke-width:1.5}
.web-link.you{stroke:#C9CBDA;stroke-dasharray:4 3}
.web-link.on{stroke:${COBALT};stroke-width:2.5}
.web-node{cursor:pointer}
.web-node rect{transition:.12s}
.web-node.dim{opacity:.32}
.web-node:hover rect:first-child{filter:drop-shadow(0 3px 8px rgba(0,0,0,.13))}
.web-name{font-size:12px;font-weight:700;fill:${INK};font-family:'Inter',sans-serif}
.web-co{font-size:9.5px;fill:#9b98ad;font-family:'Inter',sans-serif}
.web-kids{font-size:9.5px;font-weight:700;fill:#56527a}
.scope-seg{flex:none}
.scope-seg button{display:inline-flex;align-items:center;gap:6px}
.scope-seg button i{font-style:normal;font-size:10px;font-weight:800;padding:1px 6px;border-radius:20px;background:#DFE2EE;color:#56527a;min-width:16px;text-align:center}
.scope-seg button.on i{background:${COBALT};color:#fff}
.claim-btn{display:inline-flex;align-items:center;gap:5px;border:1px solid ${COBALT};background:${alpha(COBALT,.06)};color:${COBALT};font-size:11.5px;font-weight:700;padding:5px 11px;border-radius:20px;cursor:pointer;white-space:nowrap}
.claim-btn:hover{background:${COBALT};color:#fff}
.pool-note{display:flex;align-items:center;gap:7px;font-size:12.5px;color:#56527a;background:#F4F5FA;border:1px solid #E5E6F0;border-radius:9px;padding:9px 12px;margin-bottom:12px}
.own-badge{font-size:11px;font-weight:700;padding:2px 9px;border-radius:20px;background:#EEF0F7;color:#4a4763}
.fu-scope{margin-bottom:14px}
.fu-owner{margin-top:8px}
.team-list{display:flex;flex-direction:column;gap:8px}
.team-row{display:flex;align-items:center;gap:11px;padding:10px 12px;border:1px solid #EDEEF5;border-radius:10px;background:#FAFAFE}
.team-av{width:28px;height:28px;border-radius:50%;background:${INK};color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;flex:none}
.team-name{font-weight:700;color:${INK};font-size:13.5px;flex:1;min-width:0}
.team-seg{flex:none}
.team-seg button{font-size:11.5px;padding:5px 11px}
@media(max-width:640px){.team-row{flex-wrap:wrap}.team-seg{width:100%}.team-seg button{flex:1}}
.imp-sub{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#8b88a0;margin-bottom:8px}
.imp-map{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.imp-row{display:flex;align-items:center;gap:7px;background:#F7F8FC;border:1px solid #EDEEF5;border-radius:9px;padding:7px 10px}
.imp-h{flex:1;min-width:0;font-size:12.5px;font-weight:600;color:${INK};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.imp-row select{border:1px solid #E1E2EC;border-radius:7px;padding:5px 7px;font-size:12px;color:${INK};background:#fff;max-width:130px}
.imp-warn{display:flex;align-items:center;gap:6px;font-size:12px;color:#9a5a16;background:#FFF7ED;border:1px solid #FCD9B6;border-radius:8px;padding:8px 11px;margin-top:10px}
@media(max-width:640px){.imp-map{grid-template-columns:1fr}}
.act-types{display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap}
.act-t{font-size:12px;font-weight:600;padding:6px 10px;border-radius:9px;border:1px solid #DEDFEA;background:#fff;color:#56527a;cursor:pointer;display:flex;align-items:center;gap:5px}
.act-t.on{border-color:${COBALT};background:${alpha(COBALT,.08)};color:${COBALT}}
.act-input{width:100%;padding:11px 12px;border:1px solid #DEDFEA;border-radius:10px;font-size:13.5px;font-family:'Inter';resize:vertical;min-height:52px}
.act-input:focus{outline:none;border-color:${COBALT};box-shadow:0 0 0 3px ${alpha(COBALT,.13)}}
.act-t.pay.on{border-color:${GREEN};background:color-mix(in srgb,${GREEN} 10%,#fff);color:#1a7d46}
.pay-compose-row{display:flex;gap:8px}
.pc-amt{display:flex;align-items:center;border:1px solid #DEDFEA;border-radius:10px;padding:0 10px;background:#fff;flex:none;width:120px}
.pc-amt:focus-within{border-color:${GREEN};box-shadow:0 0 0 3px color-mix(in srgb,${GREEN} 18%,#fff)}
.pc-amt span{color:#8E89A8;font-weight:700;font-size:14px}
.pc-amt input{border:none;outline:none;padding:11px 6px;font-size:14px;width:100%;font-weight:700;color:${INK}}
.pc-note{flex:1;border:1px solid #DEDFEA;border-radius:10px;padding:11px 12px;font-size:13.5px;font-family:'Inter'}
.pc-note:focus{outline:none;border-color:${GREEN};box-shadow:0 0 0 3px color-mix(in srgb,${GREEN} 18%,#fff)}
.rep-pay-toggle{display:flex;gap:12px;align-items:flex-start;margin-top:16px;padding-top:16px;border-top:1px solid #EFEFF6;cursor:pointer}
.rep-pay-toggle .sw{margin-top:2px}
.feed{margin-top:14px;display:flex;flex-direction:column;overflow-y:auto}
.fitem{display:flex;gap:11px;padding:11px 0;border-bottom:1px solid #F0F0F6}.fitem:last-child{border:none}
.fic{width:30px;height:30px;border-radius:8px;background:${alpha(COBALT,.09)};color:${COBALT};display:flex;align-items:center;justify-content:center;flex:none}
.fitem.note .fic{background:${alpha(GOLD,.16)};color:#9A7B22}
.fitem .ftxt{font-size:13px;color:#3a3658;line-height:1.45}.fitem .fmeta{font-size:11px;color:#A6A2BC;margin-top:3px;font-weight:600}
.fitem .fdel{margin-left:auto;background:none;border:none;color:#C9C5D9;cursor:pointer;padding:3px;flex:none}.fitem .fdel:hover{color:${RED}}
/* settings */
.set-row{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid #F0F0F6}.set-row:last-child{border:none}
.opt-chip{display:inline-flex;align-items:center;gap:7px;background:#F1F2F8;border-radius:8px;padding:6px 8px 6px 11px;font-size:13px;color:#3a3658;margin:0 7px 7px 0}
.opt-chip button{background:none;border:none;color:#A6A2BC;cursor:pointer;display:flex}.opt-chip button:hover{color:${RED}}
.addrow{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
.addrow input,.addrow select{padding:9px 11px;border:1px solid #DEDFEA;border-radius:9px;font-size:13.5px;font-family:'Inter'}
.swatch{width:26px;height:26px;border-radius:7px;border:1px solid #E0E0EC;flex:none;cursor:pointer;padding:0}
.logo-drop{border:2px dashed #DEDFEA;border-radius:14px;padding:26px;text-align:center;cursor:pointer;color:#8E89A8;transition:.15s}.logo-drop:hover{border-color:${COBALT};color:${COBALT};background:${alpha(COBALT,.03)}}
.logosize{margin-top:14px;max-width:340px}
.logosize-h{display:flex;justify-content:space-between;align-items:center;margin-bottom:7px}
.logosize-h span{font-size:10.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#928DAD}
.logosize-h b{font-family:'Space Grotesk';font-size:13px;color:${INK}}
.logosize input[type=range]{width:100%;-webkit-appearance:none;appearance:none;height:6px;border-radius:6px;background:#E4E5EF;outline:none}
.logosize input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:20px;height:20px;border-radius:50%;background:${COBALT};cursor:pointer;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.2)}
.logosize input[type=range]::-moz-range-thumb{width:20px;height:20px;border-radius:50%;background:${COBALT};cursor:pointer;border:3px solid #fff}
.note{background:#FBF6E9;border:1px solid #EBDCB5;border-radius:12px;padding:14px 16px;font-size:13px;color:#7a6320;line-height:1.5}.note b{color:#5e4c12}
.convert-banner.fix{background:color-mix(in srgb,#FFA500 7%,#fff);border-color:#FFD59E}
.convert-banner{display:flex;align-items:center;justify-content:space-between;gap:12px;background:linear-gradient(135deg,${alpha(COBALT,.08)},${alpha(INDIGO,.08)});border:1px solid #D9DCF2;border-radius:14px;padding:14px 16px;margin-bottom:18px}
.convert-banner b{font-family:'Space Grotesk';font-size:15px;color:${INK}}
.deliv{background:#fff;border:1px solid #E8E9F2;border-radius:14px;padding:16px 18px;margin-bottom:18px}
.track{padding:12px 0;border-bottom:1px solid #F0F0F6}.track:last-of-type{border-bottom:none}
.track-h{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
.track-h b{font-family:'Space Grotesk';font-size:14px;color:${INK}}
.track-h .phase{font-size:11.5px;font-weight:600;color:${COBALT};background:${alpha(COBALT,.09)};padding:3px 9px;border-radius:20px}
.pbar{height:7px;background:#ECECF4;border-radius:6px;overflow:hidden;margin-bottom:10px}
.pbar>div{height:100%;border-radius:6px;background:linear-gradient(90deg,${COBALT},${GREEN});transition:width .4s}
.mslist{display:flex;flex-direction:column;gap:2px}
.ms{display:flex;align-items:center;gap:9px;padding:7px 6px;border-radius:8px;font-size:13.5px;color:#3a3658}
.ms:hover{background:#FAFAFD}
.ms .mcheck{display:flex;align-items:center;gap:9px;flex:1;cursor:pointer;min-width:0}
.ms .mtxt{flex:1}.ms.on .mtxt{color:#8E89A8;text-decoration:line-through}
.ms.over .mtxt{color:${RED}}
.ms .mdate{font-size:11px;color:#A6A2BC;font-weight:600;white-space:nowrap}
.ms .mdate.done{color:${GREEN}}
.msdue-w{display:flex;align-items:center;gap:6px}
.msdue-l{font-size:9.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#A6A2BC}
.ms.over .msdue-l{color:${RED}}
.msdue{font-size:11.5px;font-weight:600;color:#56527a;border:1px solid #E0E1EE;border-radius:7px;padding:3px 6px;background:#fff;font-family:inherit;cursor:pointer}
.msdue:hover{border-color:#C9CBE0}
.msdue.over{border-color:${RED};color:${RED};background:${alpha(RED,.05)}}
.track-h .phase.od{color:${RED};background:${alpha(RED,.1)}}
.rdot.over{background:${RED};border-color:${RED}}
.od-tag{color:${RED};font-weight:700}.due-tag{color:${COBALT};font-weight:600}
.tbl-cap{padding:14px 16px;border-bottom:1px solid #E8E9F2;font-weight:600;color:${INK};font-family:'Space Grotesk'}
.badge{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:700;padding:3px 9px;border-radius:20px;white-space:nowrap}
.badge.done{color:${GREEN};background:${alpha(GREEN,.1)}}
.badge.over{color:${RED};background:${alpha(RED,.1)}}
.deliv-done{display:flex;align-items:center;gap:8px;margin-top:12px;padding:10px 12px;border-radius:10px;background:${alpha(GREEN,.08)};color:#157a41;font-size:12.5px;font-weight:600}
.rtag{display:inline-block;margin-left:8px;font-size:9.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:${GREEN};background:${alpha(GREEN,.1)};padding:2px 7px;border-radius:20px;vertical-align:middle}
.btn-s{background:#fff;color:${INK};border:1px solid #DEDFEA}.btn-s:hover{background:#F4F5FB;border-color:#CBCDDF}
.inv-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;flex-wrap:wrap}
.seg{display:inline-flex;background:#EEEFF6;border-radius:11px;padding:3px;gap:2px}
.seg-b{border:none;background:none;padding:7px 14px;border-radius:8px;font-size:13px;font-weight:600;color:#56527a;cursor:pointer;font-family:'Inter'}
.seg-b.on{background:#fff;color:${COBALT};box-shadow:0 1px 4px rgba(0,0,0,.08)}
.badge.inv-draft{color:#56527a;background:#EAEBF3}.badge.inv-sent{color:${COBALT};background:${alpha(COBALT,.1)}}
.badge.inv-paid{color:${GREEN};background:${alpha(GREEN,.1)}}.badge.inv-overdue{color:${RED};background:${alpha(RED,.1)}}
.inv-modal{width:1080px}
.inv-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.inv-body{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.05fr);gap:0;overflow:auto;flex:1}
.inv-edit{padding:20px 22px;overflow:auto;border-right:1px solid #E8E9F2}
.inv-preview-wrap{padding:24px;background:#ECEEF5;overflow:auto;display:flex;flex-direction:column;align-items:center}
.inv-design-stage{border:1px solid #E3E4EE;border-radius:14px;overflow:hidden;margin-top:4px}
.inv-design-stage .inv-preview-wrap{max-height:78vh}
.inv-page-tools{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;width:100%;max-width:660px;margin:0 auto 14px}
.sec-toolbar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;background:#fff;border:1px solid #DEDFEA;border-radius:10px;padding:6px 10px;box-shadow:0 4px 16px -8px rgba(0,0,0,.18)}
.sec-tl{font-size:11px;font-weight:800;color:${INK};letter-spacing:.01em}
.sec-grp{display:flex;align-items:center;gap:5px;font-size:10px;font-weight:700;color:#8b88a0;text-transform:uppercase;letter-spacing:.04em}
.sec-grp .stp{width:22px;height:22px;border-radius:6px;border:1px solid #DEDFEA;background:#F7F8FC;color:${COBALT};font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1}
.sec-grp .stp:hover{background:${COBALT};color:#fff;border-color:${COBALT}}
.sec-grp .val{min-width:30px;text-align:center;font-size:11px;font-weight:700;color:${INK};text-transform:none}
.sec-done{font-size:11px;font-weight:700;color:#fff;background:${COBALT};border:none;border-radius:7px;padding:6px 12px;cursor:pointer}
.sec-hint{font-size:11px;color:#9b98ad;font-weight:500}
.bk-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.bk-filters{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:0 0 16px}
.bk-chip{padding:7px 14px;border-radius:20px;border:1px solid #E1E2EC;background:#fff;font-size:13px;font-weight:600;color:#56527a;cursor:pointer}
.bk-chip.on{background:${INK};color:#fff;border-color:${INK}}
.bk-yr{margin-left:auto;display:flex;align-items:center;gap:8px}
.bk-yr select{padding:8px 10px;border:1px solid #E1E2EC;border-radius:9px;font-size:13px;font-weight:600;color:${INK};background:#fff}
.tx-type{display:inline-flex;align-items:center;gap:5px;font-weight:600;font-size:12.5px;color:${INK}}
.tx-amt{font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;font-size:14px}
.tx-in{color:#1f9d63}.tx-out{color:#b4322e}
.rc-btn{display:inline-flex;align-items:center;gap:4px;color:${COBALT};font-weight:600;font-size:12px;cursor:pointer}
.rc-none{color:#c7c5d4}
.ai-banner{display:flex;align-items:center;gap:8px;border-radius:10px;padding:9px 12px;font-size:12.5px;font-weight:600;margin-bottom:14px}
.ai-reading{background:#EEF2FF;color:#3949c9}
.ai-done{background:#E9F8EF;color:#1f8a55}
.ai-off{background:#FBEFEF;color:#a23b34}
.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
.rcfile{display:flex;align-items:center;gap:8px;background:#F4F5FA;border:1px solid #E5E6F0;border-radius:9px;padding:9px 11px;font-size:12.5px;color:${INK};margin-top:10px}
.act-ctrl{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:14px}
.seg{display:inline-flex;background:#EEF0F7;border-radius:9px;padding:3px}
.seg button{border:none;background:none;padding:6px 13px;border-radius:7px;font-size:12.5px;font-weight:600;color:#56527a;cursor:pointer}
.seg button.on{background:#fff;color:${INK};box-shadow:0 1px 3px rgba(0,0,0,.12)}
.act-nav{display:flex;align-items:center;gap:6px}
.act-nav b{min-width:150px;text-align:center;font-size:13.5px;color:${INK};font-weight:700}
.iconbtn{width:30px;height:30px;border-radius:8px;border:1px solid #E1E2EC;background:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#56527a}
.iconbtn:hover{border-color:${COBALT};color:${COBALT}}
.act-feedlist{display:flex;flex-direction:column}
.act-row{display:flex;align-items:flex-start;gap:11px;padding:11px 4px;border-bottom:1px solid #F1F1F6;cursor:pointer}
.act-row:hover{background:#FAFAFE}
.act-ic{width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;flex:none}
.act-body{flex:1;min-width:0}
.act-top{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.act-lead{font-weight:700;color:${INK};font-size:13.5px}
.act-txt{color:#56527a;font-size:13px;margin-top:2px;line-height:1.45}
.act-who{font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;background:#EEF0F7;color:#4a4763}
.act-time{margin-left:auto;font-size:11.5px;color:#9b98ad;white-space:nowrap}
.act-daysep{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#9b98ad;margin:14px 0 4px;padding-top:8px;border-top:1px dashed #E4E5EE}
.act-daysep:first-child{border-top:none;margin-top:0;padding-top:0}
.swapbtn{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:600;color:#56527a;background:#fff;border:1px solid #DEDFEA;border-radius:8px;padding:6px 11px;cursor:pointer}
.swapbtn:hover{border-color:${COBALT};color:${COBALT}}
.inv-items-edit{display:flex;flex-direction:column;gap:7px}
.iie-h,.iie-row{display:grid;grid-template-columns:1fr 56px 84px 76px 30px;gap:8px;align-items:center}
.iie-h{font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#928DAD;padding:0 2px}
.iie-row input{padding:8px 9px;border:1px solid #DEDFEA;border-radius:8px;font-size:13px;font-family:'Inter';color:${INK};background:#fff;width:100%}
.iie-row input:focus{outline:none;border-color:${COBALT};box-shadow:0 0 0 3px ${alpha(COBALT,.13)}}
.iie-amt{font-size:13px;font-weight:600;color:${INK};text-align:right}
.inv-preview{background:#fff;border-radius:3px;padding:6.5% 7%;box-shadow:0 14px 50px -16px rgba(0,0,0,.34);color:#3a3850;width:100%;max-width:660px;aspect-ratio:8.5/11;box-sizing:border-box}
.ip-block{position:relative;margin-bottom:20px}
.ip-block:last-child{margin-bottom:0}
.ip-block.dragk{opacity:.4}
.ip-drag{position:absolute;left:-26px;top:1px;width:20px;height:20px;border-radius:6px;display:flex;align-items:center;justify-content:center;color:#C4C1D6;cursor:grab;opacity:0;transition:.13s}
.ip-block:hover .ip-drag{opacity:1}
.ip-drag:hover{color:${COBALT};background:#F1F2F8}
.ip-sec{cursor:pointer;border-radius:5px;transition:box-shadow .12s;outline-offset:3px}
.ip-sec:hover{box-shadow:0 0 0 1px #DCDEEE}
.ip-sec.sel{box-shadow:0 0 0 2px ${COBALT}}
.ip-top{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;margin-bottom:14px}
.ip-top .ip-sec{padding:4px 6px;margin:-4px -6px}
.ip-logo{max-height:42px;max-width:190px;object-fit:contain;display:block;margin-bottom:.7em}
.ip-name{font-family:'Space Grotesk';font-size:1.65em;font-weight:600;color:${INK};margin-bottom:.45em;letter-spacing:-.01em}
.ip-bizmeta{font-size:.95em;color:#8b88a0}
.ip-meta{text-align:right;flex:none}
.ip-meta.left{text-align:left}
.ip-title{font-family:'Space Grotesk';font-size:1.4em;font-weight:700;letter-spacing:.16em;color:${COBALT};line-height:1}
.ip-num{font-size:.95em;font-weight:600;color:#8b88a0;margin-top:.3em;letter-spacing:.03em}
.ip-dates{margin-top:.9em;font-size:.95em;color:${INK}}.ip-dates div{display:flex;gap:1.3em;justify-content:flex-end;margin-top:.25em}.ip-meta.left .ip-dates div{justify-content:flex-start}.ip-dates span{color:#aaa6bd;text-transform:uppercase;letter-spacing:.05em;font-size:.82em;font-weight:600}
.ip-stamp{display:inline-block;margin-top:.8em;font-size:.82em;font-weight:700;text-transform:uppercase;letter-spacing:.08em;padding:.25em 1em;border-radius:20px}
.ip-rule{height:1.5px;width:100%;border-radius:2px;margin:0 0 16px;opacity:.9}
.ip-billto{color:#6a6788}
.ip-billto .ip-lbl{font-size:.8em;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#aaa6bd;margin-bottom:.35em}
.ip-billto .ip-btname{font-weight:700;font-size:1.15em;color:${INK};letter-spacing:-.01em}
.ip-table{width:100%;border-collapse:collapse}
.ip-table th{text-align:left;font-size:.78em;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#aaa6bd;border-bottom:1.5px solid ${INK};padding:0 0 .6em}
.ip-table th:nth-child(2),.ip-table th:nth-child(3),.ip-table th:nth-child(4){text-align:right}
.ip-table td{padding:.65em 0;border-bottom:1px solid #F2F2F6;font-variant-numeric:tabular-nums}
.ip-table td:nth-child(2),.ip-table td:nth-child(3),.ip-table td:nth-child(4){text-align:right;white-space:nowrap}
.ip-table td:first-child{padding-right:1.3em;color:${INK}}
.ip-totals{margin-left:auto;width:56%;min-width:200px}
.ip-tr{display:flex;justify-content:space-between;padding:.35em 0;color:#6a6788;font-variant-numeric:tabular-nums}.ip-tr span{color:#9b98ad}.ip-tr b{font-weight:600;color:${INK}}
.ip-grand{border-top:1.5px solid ${INK};margin-top:.45em;padding-top:.7em}.ip-grand span{color:${INK};font-weight:700;font-family:'Space Grotesk';letter-spacing:.01em}.ip-grand b{font-family:'Space Grotesk';font-size:1.32em;color:${COBALT}}
.ip-pay{color:#6a6788;word-break:break-all}.ip-pay a{color:${COBALT};font-weight:600}
.ip-notes{padding-top:12px;border-top:1px solid #F2F2F6;color:#9b98ad;white-space:pre-wrap}
.acc-row{display:flex;gap:8px;align-items:center}
.acc-row input[type=color]{width:42px;height:38px;padding:2px;border:1px solid #DEDFEA;border-radius:9px;background:#fff;cursor:pointer;flex:none}
.acc-row input:not([type=color]){flex:1}
.invrange{width:100%;-webkit-appearance:none;appearance:none;height:6px;border-radius:6px;background:#E4E5EF;outline:none;margin-top:8px}
.invrange::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;background:${COBALT};cursor:pointer;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.2)}
.invrange::-moz-range-thumb{width:18px;height:18px;border-radius:50%;background:${COBALT};cursor:pointer;border:3px solid #fff}
.inv-toggles{display:flex;flex-wrap:wrap;gap:18px;margin-top:14px}
.invtog{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:500;color:${INK};cursor:pointer}
.invtog input{width:16px;height:16px;accent-color:${COBALT};cursor:pointer}
@media print{
  body *{visibility:hidden!important}
  #invprint,#invprint *{visibility:visible!important}
  #invprint{position:absolute!important;left:0;top:0;width:100%;box-shadow:none!important;border-radius:0!important;padding:0!important}
  .scrim2{position:static!important;background:none!important;padding:0!important}
  .ip-drag,.inv-page-tools{display:none!important}
  .ip-sec{box-shadow:none!important;cursor:default!important}
  #invprint{box-shadow:none!important;min-height:0!important;padding:0!important}
}
.fu-hero{display:flex;align-items:center;gap:22px;background:linear-gradient(120deg,${INDIGO} 0%,${COBALT} 100%);border-radius:18px;padding:22px 26px;margin-bottom:22px;color:#fff;box-shadow:0 14px 40px -20px ${COBALT}}
.fu-hero-l{flex:none}.fu-hero-n{font-family:'Space Grotesk';font-size:46px;font-weight:600;line-height:1}
.fu-hero-lbl{font-size:13px;color:rgba(255,255,255,.78);margin-top:2px}
.fu-hero-stats{display:flex;flex-wrap:wrap;gap:9px;flex:1}
.fu-stat{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;background:rgba(255,255,255,.14);padding:6px 12px;border-radius:20px;color:#fff}
.fu-stat b{font-weight:700}.fu-stat.od{background:rgba(255,255,255,.16)}.fu-stat.od svg{color:#FFC9C9}.fu-stat.done svg{color:#9DEFC0}
.fu-ring{width:70px;height:70px;border-radius:50%;background:conic-gradient(#fff calc(var(--p,0)*1%),rgba(255,255,255,.22) 0);display:flex;align-items:center;justify-content:center;flex:none}
.fu-ring span{width:54px;height:54px;border-radius:50%;background:${INDIGO};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;font-family:'Space Grotesk';color:#fff}
.fu-band{display:flex;align-items:center;gap:8px;font-family:'Space Grotesk';font-weight:600;font-size:13px;color:${INK};margin:18px 0 12px;text-transform:uppercase;letter-spacing:.04em}
.fu-band.od{color:${RED}}
.fu-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}
.fu-card{background:#fff;border:1px solid #E8E9F2;border-radius:14px;padding:16px;cursor:pointer;transition:transform .18s,box-shadow .18s,opacity .42s,scale .42s;display:flex;flex-direction:column;gap:11px}
.fu-card:hover{transform:translateY(-3px);box-shadow:0 14px 30px -18px rgba(24,21,48,.4);border-color:#D9DBEC}
.fu-card.od{border-left:4px solid ${RED}}
.fu-card.leaving{opacity:0;scale:.88;transform:translateX(60px);pointer-events:none}
.fu-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.fu-name{font-family:'Space Grotesk';font-weight:600;font-size:15px;color:${INK};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fu-meta{font-size:12.5px;color:#6a6788}
.fu-act{display:flex;flex-direction:column;gap:10px;border-top:1px solid #F0F0F6;padding-top:11px}
.fu-quick{display:flex;gap:8px}
.fu-ic{width:34px;height:34px;border-radius:9px;background:#F4F5FB;color:${COBALT};display:flex;align-items:center;justify-content:center;text-decoration:none;transition:.14s}
.fu-ic:hover{background:${COBALT};color:#fff}
.fu-chips{display:flex;flex-wrap:wrap;gap:7px}
.fu-chip{position:relative;border:1px solid #DEDFEA;background:#fff;color:${INK};font-size:12px;font-weight:600;font-family:'Inter';padding:7px 11px;border-radius:9px;cursor:pointer;display:inline-flex;align-items:center;gap:5px;transition:.14s}
.fu-chip:hover{border-color:${COBALT};background:${alpha(COBALT,.06)};color:${COBALT}}
.fu-date{padding:7px 10px;color:#56527a}
.fu-date input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%}
.fu-done{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:70px 20px}
.fu-done-burst{position:relative;margin-bottom:10px}
.fu-done-ring{width:108px;height:108px;border-radius:50%;background:${alpha(GREEN,.1)};display:flex;align-items:center;justify-content:center}
.fu-done-burst .s1,.fu-done-burst .s2,.fu-done-burst .s3{position:absolute;color:${GOLD};animation:twk 1.8s ease-in-out infinite}
.fu-done-burst .s1{top:-4px;right:6px;animation-delay:0s}.fu-done-burst .s2{bottom:6px;left:-2px;color:${COBALT};animation-delay:.5s}.fu-done-burst .s3{top:18px;right:-8px;color:${GREEN};animation-delay:1s}
@keyframes twk{0%,100%{opacity:.3;transform:scale(.8)}50%{opacity:1;transform:scale(1.15)}}
.fu-done h2{font-family:'Space Grotesk';font-size:24px;color:${INK};margin:14px 0 6px}
.fu-done p{font-size:14px;color:#6a6788;max-width:420px;line-height:1.5}
.linkbtn{background:none;border:none;color:#A6A2BC;font-size:12px;font-weight:600;cursor:pointer;padding:8px 0 0;margin-top:6px}.linkbtn:hover{color:${RED}}
.linkbtn.q:hover{color:${COBALT}}
.cli-prog{display:flex;align-items:center;gap:10px;min-width:160px}
.cli-prog .pbar{flex:1;margin-bottom:0}.cli-prog .pp{font-size:12px;font-weight:600;color:${INK};min-width:34px}
.rmap-board{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(152px,1fr);gap:10px;overflow-x:auto;padding-bottom:6px;margin-bottom:18px}
.rmap-col{background:#F6F7FB;border-radius:12px;padding:8px;min-height:60px}
.rmap-colh{display:flex;justify-content:space-between;font-size:11px;font-weight:700;color:#56527a;padding:4px 6px 10px;text-transform:uppercase;letter-spacing:.04em}
.rmap-colh span{color:#928DAD}
.rmap-card{background:#fff;border:1px solid #E8E9F2;border-radius:10px;padding:10px;margin-bottom:8px;cursor:pointer}
.rmap-card:hover{border-color:#D9DBEC}
.rc-n{font-weight:600;font-size:13px;color:${INK}}.rc-ph{font-size:11px;color:#777296;margin-top:4px}
.rmap-empty{text-align:center;color:#C9C5D9;font-size:12px;padding:6px}
.rmap-rows{border-top:1px solid #F0F0F6}
.rmap-row{display:flex;align-items:center;gap:16px;padding:12px 4px;border-bottom:1px solid #F0F0F6;cursor:pointer}
.rmap-row:last-child{border-bottom:none}.rmap-row:hover{background:#FAFAFD}
.rr-name{width:180px;flex:none}
.rr-tracks{display:flex;gap:22px;flex-wrap:wrap}
.rr-track{display:flex;align-items:center;gap:9px}
.rr-tl{font-size:10.5px;font-weight:700;color:#928DAD;text-transform:uppercase;letter-spacing:.04em;min-width:64px}
.rr-dots{display:flex;gap:6px}
.rdot{width:11px;height:11px;border-radius:50%;background:#E4E4EE;border:1px solid #D2D2E0}
.rdot.on{background:${GREEN};border-color:${GREEN}}
.iconbtn{background:#F1F2F8;border:none;border-radius:7px;width:30px;height:30px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#56527a;flex:none}.iconbtn:hover{background:#E6E7F1}.iconbtn:disabled{opacity:.35;cursor:default}
@media(max-width:820px){
  /* top is INHERITED from the base .sb rule (var(--topbar)), not pinned to 0.
     Pinning it to 0 put the drawer under the demo bar and hid the client's
     logo — which is the first thing anyone opening this on a phone looks at. */
  .sb{position:fixed;left:0;transform:translateX(-100%);transition:transform .25s;box-shadow:0 0 60px rgba(0,0,0,.4)}.sb.open{transform:none}.hamb{display:block}
  .m-grid{grid-template-columns:1fr;overflow-y:auto}
  .m-left,.m-right{overflow:visible}
  .m-right{border-left:none;border-top:1px solid #E8E9F2}
  .modal{max-height:94vh}
  .m-foot{padding:11px 16px;flex-wrap:wrap}
  .m-foot-n{width:100%;margin-left:0;white-space:normal}
  .scrim{display:block;position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:25}.body{padding:18px}.top{padding:14px 18px}.fgrid{grid-template-columns:1fr}
}
/* ---- touch devices: stop iOS from zooming ----
   Safari auto-zooms whenever you focus a field whose font-size is under 16px.
   Forcing every control to 16px on touch screens removes the trigger entirely.
   !important because many controls set their size inline. */
@media (pointer:coarse){
  input,select,textarea{font-size:16px !important}
  .onb-due input,.day-date input{width:auto;max-width:160px}
  .tier-pick select{padding:5px 10px}
}
/* never auto-resize text, and kill the double-tap-to-zoom gesture */
html{-webkit-text-size-adjust:100%;text-size-adjust:100%;touch-action:manipulation}
button,a,label,select,input,textarea,.kcard,.fu-card,.cli-card,.rt-person,.msec-h,.rel-tier,.web-node{touch-action:manipulation}

/* ============================================================
   ROLES · COMMISSION · LEADERBOARD · the premium bits
   ============================================================ */
/* the rep's hero: two numbers, calm, gold for pending, green for earned */
.cmsn-hero{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;margin-bottom:22px}
.cmsn-main{background:linear-gradient(135deg,${INK},#241f47);border-radius:18px;padding:22px 24px;color:#fff;position:relative;overflow:hidden;box-shadow:0 22px 50px -34px rgba(24,21,48,.9)}
.cmsn-main.earned{background:linear-gradient(135deg,${GREEN},#12613a)}
.cmsn-main:after{content:'';position:absolute;inset:0;background:radial-gradient(120% 90% at 100% 0%,rgba(255,255,255,.16),transparent 60%);pointer-events:none}
.cmsn-l{font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:rgba(255,255,255,.66)}
.cmsn-v{font-family:'Space Grotesk';font-size:40px;font-weight:600;line-height:1.05;margin:10px 0 6px;font-variant-numeric:tabular-nums}
.cmsn-d{font-size:12.5px;font-weight:600;color:rgba(255,255,255,.72)}
.cmsn-box{background:#F7F8FC;border:1px solid #E8E9F2;border-radius:12px;padding:14px}
.cmsn-row{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:13px;color:#56527a;padding:5px 0}
.cmsn-row b{font-weight:700;color:${INK}}
.cmsn-row.big{border-top:1px solid #E8E9F2;margin-top:8px;padding-top:10px;font-size:14px}
.cmsn-row.big b{font-family:'Space Grotesk';font-size:20px}
.rank-big{font-family:'Space Grotesk';font-size:38px;font-weight:600;color:${INK};line-height:1}
.rank-big span{font-size:15px;color:#8E89A8;margin-left:6px}
/* owner queue: newly converted clients waiting to be onboarded */
.onb-q{background:#fff;border:1px solid #D9DCF2;border-left:3px solid ${COBALT};border-radius:14px;padding:14px 16px;margin-bottom:20px}
.onb-h{display:flex;align-items:center;gap:8px;color:${INK};font-size:14px}
.onb-h b{font-family:'Space Grotesk';font-weight:600}
.onb-h span{font-size:12px;color:#8E89A8;margin-left:auto}
.onb-row{display:flex;align-items:center;gap:12px;padding:10px 0;border-top:1px solid #F0F0F6}
.onb-assign{flex:none;border:1px dashed #D8DAE6;background:#fff;border-radius:16px;padding:4px 9px;font-size:11px;font-weight:700;color:#a6a2bc;cursor:pointer;max-width:120px}
.onb-assign.set{border-style:solid;border-color:#7A5CC8;background:color-mix(in srgb,#7A5CC8 8%,#fff);color:#6A4CB8}
@media(max-width:640px){.onb-assign{max-width:92px}}
.onb-m{min-width:0;flex:1}
/* leaderboard */
.lb-top{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:14px}
.lb{background:#fff;border:1px solid #E8E9F2;border-radius:16px;overflow:hidden;box-shadow:0 12px 30px -28px rgba(24,21,48,.5)}
.lb-row{display:flex;align-items:center;gap:14px;padding:14px 18px;border-bottom:1px solid #F2F3F8}
.lb-row:last-child{border-bottom:none}
.lb-row.me{background:linear-gradient(90deg,${alpha(COBALT,.07)},${alpha(COBALT,0)})}
.lb-rank{width:30px;height:30px;border-radius:50%;background:#F0F1F7;color:#56527a;font-weight:800;font-size:13px;display:flex;align-items:center;justify-content:center;flex:none}
.lb-row:first-child .lb-rank{background:${alpha(GOLD,.16)};color:${GOLD}}
.lb-mid{flex:1;min-width:0}
.lb-name{font-weight:600;color:${INK};font-size:14px;display:flex;align-items:center;gap:7px}
.lb-name i{font-style:normal;font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:${COBALT};background:${alpha(COBALT,.1)};padding:2px 6px;border-radius:20px}
.lb-bar{height:6px;border-radius:20px;background:#F0F1F7;overflow:hidden;margin-top:7px}
.lb-bar div{height:100%;border-radius:20px;background:linear-gradient(90deg,${COBALT},#5C76EE);transition:width .5s cubic-bezier(.22,1,.36,1)}
.lb-n{text-align:right;flex:none;font-size:11px;color:#8E89A8;font-weight:600;display:flex;flex-direction:column;line-height:1.2}
.lb-n b{font-family:'Space Grotesk';font-size:19px;color:${INK};font-weight:600;font-variant-numeric:tabular-nums}
/* team card */
.tm-list{display:flex;flex-direction:column;gap:10px}
.tm-row{border:1px solid #E8E9F2;border-radius:12px;overflow:hidden}
.tm-row.off{opacity:.62}
.tm-head{display:flex;align-items:center;gap:10px;padding:11px 13px;cursor:pointer;background:#FAFBFE}
.tm-name{display:flex;flex-direction:column;min-width:0;flex:1;font-weight:600;color:${INK};font-size:14px}
.tm-name i{font-style:normal;font-size:10px;font-weight:800;color:${COBALT};margin-left:6px}
.tm-role{font-size:10.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;padding:3px 8px;border-radius:20px;background:#F0F1F7;color:#56527a}
.tm-role.owner{background:${alpha(COBALT,.12)};color:${COBALT}}
.tm-pct{font-size:12px;font-weight:700;color:${GOLD}}
.tm-off{font-size:10.5px;font-weight:800;text-transform:uppercase;color:#B0606A}
.tm-body{padding:14px 13px;border-top:1px solid #EFF0F6}
.tm-sub{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#a6a2bc;margin:14px 0 8px}
.tm-acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.tm-add{border:1px dashed #D9DCF2;border-radius:12px;padding:14px;margin-top:12px;background:#FAFBFE}
.chip.warn{border-color:#E8C9A0}
.note.bad{border-color:#EBC3C3;background:#FDF6F6;color:#8a3b3b}
/* the one celebration — under a second of motion, never blocks a click */
.cel{position:fixed;right:22px;bottom:22px;z-index:90;display:flex;align-items:center;gap:12px;padding:14px 18px;border-radius:14px;background:linear-gradient(135deg,${INK},#241f47);color:#fff;box-shadow:0 26px 60px -28px rgba(24,21,48,.85);cursor:pointer;max-width:min(92vw,340px);animation:celIn .42s cubic-bezier(.22,1,.36,1)}
.cel:after{content:'';position:absolute;inset:0;border-radius:14px;background:linear-gradient(105deg,transparent 30%,rgba(255,255,255,.22) 50%,transparent 70%);transform:translateX(-120%);animation:celSweep .9s .16s ease-out;pointer-events:none}
.cel.still{animation:none}.cel.still:after{display:none}
.cel-ic{width:34px;height:34px;border-radius:50%;background:${alpha(GOLD,.22)};color:${GOLD};display:flex;align-items:center;justify-content:center;flex:none}
.cel b{display:block;font-family:'Space Grotesk';font-size:16px;font-weight:600}
.cel span{display:block;font-size:12.5px;color:rgba(255,255,255,.72);margin-top:2px}
@keyframes celIn{from{opacity:0;transform:translateY(10px) scale(.97)}to{opacity:1;transform:none}}
@keyframes celSweep{to{transform:translateX(120%)}}
/* gentle lift — only where a card is genuinely a target, never on forms */
@media (hover:hover){
  .lift{transition:transform .16s cubic-bezier(.22,1,.36,1),box-shadow .16s}
  .lift:hover{transform:translateY(-3px);box-shadow:0 18px 34px -24px rgba(24,21,48,.55)}
  .lb-row.lift:hover{background:#FBFBFE}
}
/* the OS setting wins. No motion, final values, nothing delayed. */
@media (prefers-reduced-motion:reduce){
  *,*:before,*:after{animation-duration:.001ms !important;animation-iteration-count:1 !important;transition-duration:.001ms !important;scroll-behavior:auto !important}
  .lift:hover{transform:none}
}
.onb-q.cmsn{border-left-color:${GOLD}}
.onb-q.done{border-left-color:#C9C5D9;background:#FAFBFE}
.onb-q.done .onb-h b{color:#56527a}
.tm-reassign{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:14px;padding-top:12px;border-top:1px solid #EFF0F6;font-size:12.5px;color:#56527a;font-weight:600}
.tm-reassign select{padding:7px 10px;border:1px solid #E2E3EE;border-radius:9px;font-size:12.5px;background:#fff;color:${INK}}
.tbl.sc td,.tbl.sc th{white-space:nowrap}
.tbl.sc tbody tr{cursor:default}
@media (max-width:640px){ .cmsn-v{font-size:32px} .cel{left:14px;right:14px;bottom:14px;max-width:none} }

/* ==================== realtor build additions ==================== */
/* ---- the product wordmark: ours, at the top of every screen ---- */
.suite-bar{display:flex;align-items:center;gap:11px;padding:7px 30px;background:linear-gradient(90deg,${INK},#1c2247 60%,#243056);
  color:#EDEBFF;position:sticky;top:var(--topbar,0px);z-index:21;border-bottom:1px solid rgba(255,255,255,.08)}
/* the chip is #000110 because the logo file's own background is #000110 —
   they meet invisibly, so the mark floats rather than sitting in a box */
.suite-logo{flex:none;display:inline-flex;align-items:center;background:#000110;border-radius:9px;
  padding:5px 11px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.08),0 6px 16px -10px rgba(0,0,0,.9)}
.suite-logo img{display:block;height:26px;width:auto}
.suite-name{font-family:'Space Grotesk',sans-serif;font-size:14px;font-weight:700;letter-spacing:.02em;white-space:nowrap}
.suite-for{font-size:12px;color:#A9A4CC;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.suite-for::before{content:'·';margin-right:9px;color:#5B5685}
@media (max-width:640px){ .pt{--suitebar:45px} .suite-bar{padding:6px 16px;gap:9px} .suite-for{display:none} .suite-logo img{height:22px} }

/* ---- the books: category picker ---- */
.bk-catpick{display:flex;align-items:center;gap:9px}
.bk-catpick label{font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#928DAD}
.bk-catpick select{padding:9px 12px;border:1px solid #DEDFEA;border-radius:10px;font-size:13.5px;font-family:'Inter';
  background:#fff;color:${INK};cursor:pointer;min-width:210px}
.bk-catpick select:focus{outline:none;border-color:${COBALT};box-shadow:0 0 0 3px ${alpha(COBALT,.13)}}

/* ---- dashboard: the "N more deadlines" box ---- */
.cd-more{display:flex;align-items:center;gap:13px;width:100%;margin-top:10px;padding:13px 15px;cursor:pointer;
  background:linear-gradient(180deg,#FBFCFE,#F4F6FB);border:1px solid #E3E5F0;border-radius:14px;
  font-family:'Inter';text-align:left;transition:.16s}
.cd-more:hover{border-color:${COBALT};background:#fff;box-shadow:0 10px 26px -20px ${alpha(COBALT,.55)};transform:translateY(-1px)}
.cd-more-n{flex:none;min-width:44px;height:38px;padding:0 10px;border-radius:11px;background:${COBALT};color:#fff;
  font-family:'Space Grotesk';font-size:15px;font-weight:700;display:flex;align-items:center;justify-content:center}
.cd-more-t{flex:1;min-width:0}
.cd-more-t b{display:block;font-family:'Space Grotesk';font-size:14.5px;font-weight:600;color:${INK}}
.cd-more-t span{display:block;font-size:12.5px;color:#7B76A0;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cd-more-p{display:flex;gap:6px;flex-wrap:wrap;flex:none}
.cd-more-a{flex:none;color:#A6A2BC;transition:.16s}
.cd-more:hover .cd-more-a{color:${COBALT};transform:translateX(3px)}
@media (max-width:560px){ .cd-more-p{display:none} }

/* ---- sidebar: nav scrolls, account + sign out stay pinned ---- */
.sb-nav{flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;margin:0 -4px;padding:0 4px 4px;
  scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.22) transparent}
.sb-nav::-webkit-scrollbar{width:6px}
.sb-nav::-webkit-scrollbar-thumb{background:rgba(255,255,255,.18);border-radius:6px}
.sb-nav::-webkit-scrollbar-track{background:transparent}
.sb-foot{flex:none;margin-top:10px;padding:12px 6px 2px;border-top:1px solid rgba(255,255,255,.1)}
.sb-me{display:flex;align-items:center;gap:10px;margin-bottom:10px;min-width:0}
.sb-av{flex:none;width:38px;height:38px;border-radius:50%;background:${COBALT};color:#fff;font-family:'Space Grotesk';
  font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;overflow:hidden;
  box-shadow:0 0 0 3px ${alpha(COBALT,.22)}}
/* a real headshot: no cobalt disc behind it, a soft ring instead, and the
   image cropped to the circle rather than squashed into it */
.sb-av.has-photo{background:#0B0F26;box-shadow:0 0 0 2px rgba(255,255,255,.22),0 6px 16px -8px rgba(0,0,0,.9)}
.sb-av img{width:100%;height:100%;object-fit:cover;object-position:center;border-radius:50%;display:block}
.sb-me b{display:block;font-size:13px;color:#EDEBFF;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sb-me span{display:block;font-size:11px;color:#A9A4CC;letter-spacing:.03em}
.sb-out{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:9px 12px;border-radius:10px;
  border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:#EDEBFF;font-family:'Inter';
  font-size:13px;font-weight:600;cursor:pointer;transition:.16s}
.sb-out:hover{background:rgba(255,255,255,.14);border-color:rgba(255,255,255,.3)}
/* the standing line at the bottom of the sidebar (BRAND.tagline). It was in the
   config and styled here from the start, but nothing ever rendered it. */
.sb-tag{font-size:11px;color:#888;padding:12px 8px 2px;line-height:1.5}
.sb-tag b{display:block;color:#B9B5D8;font-weight:600}

/* demo banner */
.btn:disabled{opacity:.45;cursor:not-allowed;box-shadow:none}
.btn:disabled:hover{transform:none}
.demo-bar{position:sticky;top:0;z-index:60;display:flex;align-items:center;gap:12px;flex-wrap:wrap;
  background:linear-gradient(90deg,${INK},#1f2547);color:#EDEBFF;font-size:12.5px;font-weight:600;
  padding:8px 16px;border-bottom:1px solid rgba(255,255,255,.12)}
.demo-bar .dbdot{width:8px;height:8px;border-radius:50%;background:#FFA500;box-shadow:0 0 0 4px rgba(255,165,0,.18);flex:none}
.demo-bar .dbsp{flex:1}
.viewas{display:flex;align-items:center;gap:6px}
.viewas span{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#A8A3D6}
.viewas button{font-size:12px;font-weight:600;padding:5px 11px;border-radius:8px;cursor:pointer;
  border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.07);color:#EDEBFF}
.viewas button.on{background:#fff;color:${INK};border-color:#fff}

/* side chips */
.side-b,.side-s,.side-x{font-size:10.5px;font-weight:800;padding:3px 8px;border-radius:6px;letter-spacing:.03em}
.side-b{background:#E8EEFF;color:#1F3FAE}
.side-s{background:#FFF3E0;color:#9A6212}
.side-x{background:#EDE9FE;color:#5B3FBF}

/* critical dates */
.cd-list{display:flex;flex-direction:column;gap:10px}
.cd{border:1px solid #E8E9F2;border-radius:14px;padding:12px 14px;background:#fff;position:relative}
.cd.urgent{border-color:#F0B6B6;background:linear-gradient(180deg,#FFF7F7,#fff)}
.cd.overdue{border-color:${RED};box-shadow:0 0 0 1px ${alpha(RED,.25)}}
.cd.met{opacity:.62}
.cd.met .cd-name{text-decoration:line-through}
.cd-top{display:flex;align-items:flex-start;gap:10px;flex-wrap:wrap}
.cd-name{font-family:'Space Grotesk';font-weight:600;font-size:14.5px;color:${INK};flex:1;min-width:150px}
.cd-date{font-family:'Space Grotesk';font-weight:700;font-size:14.5px;white-space:nowrap}
.cd-when{font-size:11.5px;font-weight:700;padding:3px 9px;border-radius:20px;white-space:nowrap}
.cd-rule{font-size:11.5px;color:#7B76A0;margin-top:5px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.cd-quote{font-size:12px;color:#56527a;background:#F6F7FC;border-left:3px solid #CDD3EA;border-radius:0 8px 8px 0;
  padding:7px 10px;margin-top:7px;font-style:italic}
.cd-acts{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}
.cd-flag{font-size:10.5px;font-weight:800;padding:2px 7px;border-radius:5px;background:#FFF0E0;color:#A85B10}
.cd-stamp{font-size:11px;color:#8E89A8;margin-top:6px}
.cd-count{font-size:10px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;padding:2px 6px;border-radius:5px;background:#EEF0FA;color:#5A5680}

/* extraction review table */
.ex-tbl{width:100%;border-collapse:collapse;font-size:13px}
.ex-tbl th{text-align:left;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:#8E89A8;
  padding:8px 10px;border-bottom:1px solid #E8E9F2;font-weight:700}
.ex-tbl td{padding:9px 10px;border-bottom:1px solid #F1F2F8;vertical-align:top}
.ex-tbl tr.low{background:#FFFBF2}
.ex-tbl input[type=date],.ex-tbl input[type=text]{padding:6px 8px;border:1px solid #DEDFEA;border-radius:8px;font-size:13px;font-family:'Inter'}
.conf{font-size:10.5px;font-weight:800;padding:2px 7px;border-radius:5px}
.conf.hi{background:#E6F6EC;color:#1a7d46}
.conf.md{background:#FFF4E0;color:#A06A10}
.conf.lo{background:#FDECEC;color:#B03030}
.eyes{font-size:11px;font-weight:800;color:#B03030;background:#FDECEC;padding:2px 7px;border-radius:5px}

/* cap meter */
.cap-wrap{margin-top:10px}
.cap-bar{height:12px;border-radius:20px;background:#EEF0FA;overflow:hidden;position:relative}
.cap-fill{height:100%;border-radius:20px;background:linear-gradient(90deg,${COBALT},#5C76EE)}
.cap-fill.done{background:linear-gradient(90deg,${GREEN},#3FBF74)}
.cap-legend{display:flex;justify-content:space-between;font-size:11.5px;color:#7B76A0;margin-top:6px}

/* money waterfall */
.wf{display:flex;flex-direction:column;gap:0}
.wf-row{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px dashed #EDEEF6;font-size:13.5px}
.wf-row.tot{border-bottom:none;border-top:2px solid ${INK};margin-top:4px;padding-top:10px;font-weight:800;font-size:15px}
.wf-row .wl{color:#56527a}
.wf-row .wv{font-family:'Space Grotesk';font-weight:600;white-space:nowrap}
.wf-row.neg .wv{color:#B03030}
.wf-note{font-size:11.5px;color:#8E89A8;margin-top:8px;line-height:1.5}

/* mini board (transactions) */
.tx-phase{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}
.tx-phase button{font-size:12px;font-weight:600;padding:6px 11px;border-radius:8px;border:1px solid #DEDFEA;background:#fff;color:#56527a;cursor:pointer}
.tx-phase button.on{background:${COBALT};border-color:${COBALT};color:#fff}
.ai-out{white-space:pre-wrap;font-size:13.5px;line-height:1.6;background:#F8F9FD;border:1px solid #E8E9F2;border-radius:12px;padding:14px;max-height:420px;overflow:auto}
.ai-note{font-size:11.5px;color:#8E89A8;margin-top:8px}
.legal-note{font-size:11.5px;color:#8E89A8;background:#F6F7FC;border-radius:10px;padding:9px 12px;margin-top:10px;line-height:1.5}
.pool-chip{font-size:10.5px;font-weight:700;padding:3px 8px;border-radius:6px;background:#EDE9FE;color:#5B3FBF}
.cold{background:#FDECEC !important;color:#B03030 !important}
.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px}
.grid3{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}
.seat-note{font-size:12.5px;color:#56527a;background:#F6F7FC;border-radius:10px;padding:10px 12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.perm-tbl{width:100%;border-collapse:collapse;font-size:13px}
.perm-tbl th{text-align:left;font-size:10.5px;letter-spacing:.05em;text-transform:uppercase;color:#8E89A8;padding:7px 8px;font-weight:700}
.perm-tbl td{padding:7px 8px;border-top:1px solid #F1F2F8}
.perm-tbl td.c{text-align:center}
/* Reorder() borrows .nav-mv, which is styled for the dark sidebar. Inside a
   settings card the arrows sit on white, so give them the light treatment. */
.set-row .nav-mv button{border-color:#E1E2EC;background:#F1F2F8;color:#56527a}
.set-row .nav-mv button:hover:not(:disabled){border-color:${COBALT};color:${COBALT}}

/* ---------------------------------------------------------------- tasks --- */
.tk-add{display:grid;grid-template-columns:1fr 170px auto;gap:9px;align-items:center}
@media(max-width:640px){.tk-add{grid-template-columns:1fr}}
.tk-grp{margin-top:14px}
.tk-grp:first-child{margin-top:2px}
.tk-grp-h{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:800;
  letter-spacing:.06em;text-transform:uppercase;color:#8E89A8;margin-bottom:7px}
.tk-grp-h.late{color:#B03030}
.tk-grp-n{background:#EEF0F7;color:#56527a;border-radius:20px;padding:0 7px;font-size:11px}
.tk-grp-h.late .tk-grp-n{background:#F7DED9;color:#8E2B22}
.tk-row{display:flex;align-items:flex-start;gap:10px;padding:9px 10px;border-radius:10px;
  border:1px solid #EEEFF6;background:#fff;margin-bottom:6px}
.tk-row:hover{border-color:#D8D9E6}
.tk-check{border:0;background:none;cursor:pointer;color:#C9C5D9;padding:0;margin-top:1px;flex:none}
.tk-check:hover{color:${COBALT}}
.tk-mid{flex:1;min-width:0}
.tk-title{font-size:13.5px;font-weight:600;color:${INK};line-height:1.35}
.tk-title.done{text-decoration:line-through;color:#9B98AD;font-weight:500}
.tk-meta{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-top:4px;font-size:11.5px}
.tk-due{font-weight:650;color:#6B6885}
.tk-due.late{color:#B03030}
.tk-due.none{color:#A6A2BC;font-style:italic}
.tk-origin{display:inline-flex;align-items:center;gap:4px;border:1px solid #E4E5EF;background:#F7F8FC;
  color:#56527a;border-radius:20px;padding:1px 8px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit}
.tk-origin:hover{border-color:${COBALT};color:${COBALT}}
.tk-note{color:#8E89A8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:340px}
.tk-del{border:0;background:none;color:#C9C5D9;cursor:pointer;padding:2px;flex:none}
.tk-del:hover{color:#B03030}

/* ------------------------------------------------------------- activity --- */
.ac-range{font-size:11.5px;color:#8E89A8;margin-bottom:10px}
.ac-day{margin-top:14px}
.ac-day:first-of-type{margin-top:2px}
.ac-day-h{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:800;
  letter-spacing:.06em;text-transform:uppercase;color:#8E89A8;margin-bottom:7px}
.ac-day-n{background:#EEF0F7;color:#56527a;border-radius:20px;padding:0 7px;font-size:11px}
.ac-row{display:flex;gap:10px;padding:8px 10px;border-radius:10px;border:1px solid #EEEFF6;
  background:#fff;margin-bottom:6px}
.ac-row.machine{background:#FAFAFD;border-style:dashed}
.ac-ic{flex:none;display:grid;place-items:center;width:26px;height:26px;border-radius:8px;
  background:#F1F2F8;color:${COBALT}}
.ac-row.machine .ac-ic{color:#A6A2BC}
.ac-mid{flex:1;min-width:0}
.ac-note{font-size:13.5px;color:${INK};line-height:1.4}
.ac-row.machine .ac-note{color:#6B6885}
.ac-meta{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-top:3px;font-size:11.5px}
.ac-kind{font-weight:700;color:#8E89A8}
.ac-link{border:0;background:none;padding:0;font:inherit;font-size:11.5px;font-weight:650;
  color:${COBALT};cursor:pointer}
.ac-link:hover{text-decoration:underline}
.ac-by{color:#8E89A8}

.tbl.sc .sc-sub{font-size:10.5px;color:#9b98ad;margin-top:1px;font-weight:500}
.tbl.sc .sc-none{color:#C9C5D9}
.tbl.sc .sc-bad{color:#B03030;font-weight:700}
`;
