/* ============================================================================
   assets.js — hard-coded brand artwork for THIS install (Dwell Real Estate
   Group).

   Everything here lives in /public/brand and is served from the site root, so
   these are plain URLs, not imports. That keeps them out of the JS bundle and
   lets the browser cache them like any other image.

   This file is deliberately separate from brand.js. brand.js is the ENV-driven
   tenant config; this file pins the artwork PATHS, and reads brand.js for the
   ones a deployment is allowed to override.

   The client mark now comes from VITE_LOGO_URL when it is set, so swapping a
   client no longer requires editing this file at all — set the variable, or drop
   the file in /public/brand and leave the fallback to find it.
   ========================================================================== */

import { BRAND } from './brand';

export const ASSETS = {
  /* The client's own mark. White artwork — it must sit on a dark band.

     VITE_LOGO_URL FIRST, THE BUNDLED FILE AS FALLBACK.

     This used to be the bundled path alone, and the note in brand.js recorded
     the consequence honestly: VITE_LOGO_URL was "kept so the shared template
     still works, but nothing in the UI reads it". So the one asset that changes
     for every single install was the one thing that could not be configured,
     and swapping a client meant editing this file by hand.

     Order matters. The hosted URL wins when set, because that is the whole
     point of setting it. The bundled file stays as the fallback rather than
     being deleted, because this mark renders on every page load — a slow or
     dead URL is visible at exactly the moment there is nothing to handle it. */
  clientLogo:     BRAND.logo || '/brand/dwell-logo.png',
  clientLogoAlt:  BRAND.short || 'dwellWICHITA',

  /* NOTE: there is no sidebar image. The circuit backdrop is an inline SVG in
     src/components/SidebarArt.jsx, ported from the ProyTech CRM so both
     products draw the same panel. See that file for why it is not a raster. */

  /* ours, at the top of every screen. The artwork's own background is #000110,
     which is why .suite-logo paints a #000110 chip behind it — they match
     exactly, so the image reads as a wordmark and not as a pasted rectangle. */
  productLogo:    '/brand/proytech-logo.png',
  productLogoAlt: 'ProyTech',
};

export default ASSETS;
