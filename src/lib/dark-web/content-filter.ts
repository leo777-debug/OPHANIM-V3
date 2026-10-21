// Hard filter applied to every provider result BEFORE normalisation or storage.
// Ophanim never ingests child sexual abuse material or similar illegal content:
// a matching result is dropped whole (no text, no hash, no reference is kept) and
// only a counter is reported. Adapters must also apply their provider's own filters.
const PROHIBITED = /\b(csam|child\s*(sexual|porn\w*|abuse\s*material)|pthc|under\s*age\s*(sex|porn\w*)|minor\s*sexual)\b/i;
export function isProhibitedContent(...parts: Array<string | undefined>): boolean {
  return parts.some(part => Boolean(part && PROHIBITED.test(part)));
}
