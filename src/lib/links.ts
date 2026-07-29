const appUrl = () => (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
export const mapLink = (lat?: number, lng?: number, zoom = 8) => lat == null || lng == null ? appUrl() : `${appUrl()}/?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}&zoom=${zoom}`;
export const entityLink = (type: string, value: string) => `${appUrl()}/entities/${encodeURIComponent(type)}/${encodeURIComponent(value)}`;
export const incidentLink = (source: string, id: string) => `${appUrl()}/incidents/${encodeURIComponent(source)}/${encodeURIComponent(id)}`;
export const watchlistLink = (publicId: string) => `${appUrl()}/watchlists/${publicId}`;
