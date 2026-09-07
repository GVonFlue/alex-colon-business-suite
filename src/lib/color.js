/* ============================================================================
   color.js — one definition of each brand colour, at any opacity.

   Brand colours arrive from the environment as hex. Anything that needed one at
   partial opacity used to be a raw rgba() triple, which no variable reaches —
   so a re-branded install rendered the new colour in its solid fills and the
   TEMPLATE's colour in every glow, focus ring, gradient and shadow. A brass app
   with blue halos. It reads as a rendering bug, and the client finds it first.

   alpha() derives the channels from whichever hex the token currently holds, so
   opacity is a parameter rather than a second, silent definition of the colour.
   ========================================================================== */

/** '#RGB' or '#RRGGBB' -> [r,g,b]. Falls back to black rather than throwing: a
 *  bad variable should render wrong, not take the whole stylesheet down. */
export const rgbOf = hex => {
  const h = String(hex || '').replace('#', '').trim();
  const v = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const n = parseInt(v, 16);
  return (v.length === 6 && Number.isFinite(n)) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [0, 0, 0];
};

/** alpha('#C2832A', .13) -> 'rgba(194,131,42,.13)' */
export const alpha = (hex, a) => `rgba(${rgbOf(hex).join(',')},${a})`;
