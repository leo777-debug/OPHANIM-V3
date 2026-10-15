export function demoReplayStatus() {
  const value=process.env.OPHANIM_DEMO_REPLAY_CREATED_AT;
  if(!value || !Number.isFinite(Date.parse(value)))return {enabled:false as const};
  return {enabled:true as const,createdAt:new Date(value).toISOString(),provenance:'synthetic_fixture' as const};
}
