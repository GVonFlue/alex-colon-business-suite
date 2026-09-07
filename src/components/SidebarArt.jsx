/* ============================================================================
   SidebarArt.jsx — the circuit backdrop behind the sidebar.

   Ported verbatim from GVonFlue/proytech-crm so the two products' sidebars are
   the same object, not two people's impressions of the same reference image.

   Why an inline SVG and not the reference JPG:
     - It scales to any sidebar height without cropping. A raster at cover-size
       in a 236px-wide column throws away the left and right edges, which is
       exactly where the trace detail lives.
     - The trace colours are the brand's, so a palette change is a find-replace
       rather than a new export.
     - It is ~3 KB of markup against ~108 KB of JPEG, and there is no second
       network request before the panel looks right.
     - Three nodes can breathe. A flat image cannot.

   preserveAspectRatio="none" is deliberate: the art is abstract and stretching
   it vertically to fill a tall sidebar is invisible, whereas letterboxing or
   cropping is not.
   ========================================================================== */

import React from 'react';

export default function SidebarArt() {
  return (
    <svg className="sb-art" viewBox="0 0 236 900" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="dw-tr" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#38BDF8" stopOpacity=".55" />
          <stop offset="55%" stopColor="#2B4DE0" stopOpacity=".30" />
          <stop offset="100%" stopColor="#2B4DE0" stopOpacity=".08" />
        </linearGradient>
        <radialGradient id="dw-nd">
          <stop offset="0%" stopColor="#7FD8FF" />
          <stop offset="100%" stopColor="#38BDF8" stopOpacity="0" />
        </radialGradient>
        <pattern id="dw-gr" width="26" height="26" patternUnits="userSpaceOnUse">
          <path d="M26 0H0V26" fill="none" stroke="#5B8DEF" strokeOpacity=".055" strokeWidth="1" />
        </pattern>
      </defs>

      <rect width="236" height="900" fill="url(#dw-gr)" />

      {/* traces — right angles only, the way real ones run */}
      <g fill="none" stroke="url(#dw-tr)" strokeWidth="1" strokeLinecap="square">
        <path d="M14 60 L14 150 L30 166 L30 300 L18 312 L18 470" />
        <path d="M30 190 L52 190 L60 198 L60 268" />
        <path d="M14 520 L14 610 L28 624 L28 760 L16 772 L16 880" />
        <path d="M28 660 L48 660 L56 668 L56 726" />
        <path d="M222 40 L222 130 L206 146 L206 250 L218 262 L218 430" />
        <path d="M206 180 L184 180 L176 188 L176 240" />
        <path d="M222 500 L222 590 L208 604 L208 742 L220 754 L220 872" />
        <path d="M208 640 L188 640 L180 648 L180 700" />
        <path d="M176 300 L176 340 L190 354 L190 400" />
      </g>

      {/* concentric arcs, echoing the reference's corner rings */}
      <g fill="none" stroke="#38BDF8" strokeOpacity=".16" strokeWidth="1">
        <path d="M236 806 A118 118 0 0 0 118 900" />
        <path d="M236 838 A86 86 0 0 0 150 900" />
        <path d="M0 148 A96 96 0 0 1 96 52" />
      </g>
      <g stroke="#38BDF8" strokeOpacity=".13" strokeWidth="1" strokeDasharray="2 5" fill="none">
        <path d="M236 770 A152 152 0 0 0 84 900" />
        <path d="M0 190 A132 132 0 0 1 132 58" />
      </g>

      {/* hex cluster, bottom right — the reference's densest corner */}
      <g fill="none" stroke="#5B8DEF" strokeOpacity=".2" strokeWidth="1">
        <path d="M196 690l9 5v10l-9 5-9-5v-10z" />
        <path d="M214 700l9 5v10l-9 5-9-5v-10z" />
        <path d="M196 710l9 5v10l-9 5-9-5v-10z" />
        <path d="M34 268l7 4v8l-7 4-7-4v-8z" />
        <path d="M200 268l7 4v8l-7 4-7-4v-8z" />
      </g>

      {/* nodes — a few carry current */}
      <g fill="#7FD8FF">
        <circle cx="14" cy="150" r="1.9" /><circle cx="30" cy="300" r="1.6" />
        <circle cx="60" cy="268" r="1.6" /><circle cx="222" cy="130" r="1.9" />
        <circle cx="176" cy="240" r="1.6" /><circle cx="208" cy="742" r="1.6" />
        <circle cx="28" cy="760" r="1.9" /><circle cx="180" cy="700" r="1.6" />
      </g>
      <g className="sb-pulse">
        <circle cx="14" cy="150" r="7" fill="url(#dw-nd)" />
        <circle cx="222" cy="130" r="7" fill="url(#dw-nd)" />
        <circle cx="28" cy="760" r="7" fill="url(#dw-nd)" />
      </g>
    </svg>
  );
}
