export const appUrl = () => (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
export const mapLink = (lat?: number, lng?: number, zoom = 7) => lat == null || lng == null ? appUrl() : `${appUrl()}/?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}&zoom=${zoom}`;
