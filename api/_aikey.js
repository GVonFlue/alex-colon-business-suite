/* ============================================================================
   _aikey.js — one place that answers "is the AI key usable", out loud.

   Four endpoints each had `if (!key) return not_configured`, which cannot tell
   apart:

     * the variable was never set on this project
     * it was set to an empty string (a paste that did not take)
     * it is present but Anthropic refuses it — rotated, revoked, wrong project

   From the browser all three look identical, and the third does not even reach
   the not_configured path: it comes back as a generic upstream error. So the
   caller's answer is unchanged and the SERVER says which one it was.

   Nothing here logs the key. Presence and length only — length is enough to
   spot a truncated paste and useless to anyone reading a log.
   ========================================================================== */

/** Log the shape of the key, once per request that needs one.
 *  Returns the key when it looks usable, '' when it does not. */
export function aiKey(where) {
  const raw = process.env.ANTHROPIC_API_KEY;
  if (raw === undefined) {
    console.error(`[ai] ${where}: ANTHROPIC_API_KEY is NOT SET on this deployment.`);
    return '';
  }
  const key = String(raw).trim();
  if (!key) {
    console.error(`[ai] ${where}: ANTHROPIC_API_KEY is set but EMPTY (${String(raw).length} chars, all whitespace).`);
    return '';
  }
  if (key.length < 20) {
    console.error(`[ai] ${where}: ANTHROPIC_API_KEY looks truncated — ${key.length} chars. A real key is much longer.`);
  }
  return key;
}

/** Call this when Anthropic itself refuses. Turns "the assistant is
 *  unavailable" into a line that says whether the key was the problem. */
export function logAiFailure(where, status, body) {
  const msg = (body && body.error && body.error.message) || '';
  if (status === 401 || status === 403) {
    console.error(`[ai] ${where}: Anthropic REJECTED the key with HTTP ${status}. `
      + `The variable is present, so this is the key itself — rotated, revoked, or from another account. ${msg}`);
    return;
  }
  if (status === 429) { console.error(`[ai] ${where}: Anthropic rate-limited this account (429). ${msg}`); return; }
  console.error(`[ai] ${where}: Anthropic answered HTTP ${status}. ${msg}`);
}
