/** Temporary shared access is the default. Set this server variable to true to restore sign-in. */
export function signInRequired(): boolean {
  return process.env.OPHANIM_REQUIRE_SIGN_IN?.trim().toLowerCase() === 'true';
}
