/**
 * JSON from an external provider (directly or through one of our pass-through
 * routes) whose shape Ophanim does not model, typically rendered field by field
 * for an analyst. Treat every field as optional and possibly the wrong type.
 *
 * This is the single, searchable escape hatch for unmodelled payloads: prefer a
 * real interface wherever the fields are known.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- documented escape hatch, see above
export type ProviderJson = any;
