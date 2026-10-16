export const PROVIDER_KEYS=['AIS_API_KEY','OPENSKY_CLIENT_ID','OPENSKY_CLIENT_SECRET','THREATFOX_AUTH_KEY'];
export function publicProviderEnvironment(input) {
  return Object.fromEntries(PROVIDER_KEYS.filter(key=>typeof input[key]==='string' && input[key]).map(key=>[key,input[key]]));
}
