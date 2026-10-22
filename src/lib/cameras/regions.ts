export const GCC_COUNTRIES = ['AE', 'SA', 'QA', 'KW', 'BH', 'OM'];
export const MENA_COUNTRIES = [...GCC_COUNTRIES, 'DZ', 'EG', 'IR', 'IQ', 'IL', 'JO', 'LB', 'LY', 'MA', 'PS', 'SY', 'TN', 'YE', 'TR', 'SD', 'MR'];

export const CAMERA_REGIONS = {
  worldwide: { label: 'Worldwide', countries: [] as string[] },
  gcc: { label: 'GCC / Gulf', countries: GCC_COUNTRIES },
  mena: { label: 'Middle East & North Africa', countries: MENA_COUNTRIES },
  'north-africa': { label: 'North Africa', countries: ['DZ', 'EG', 'LY', 'MA', 'TN', 'SD', 'MR'] },
} as const;
export type CameraRegion = keyof typeof CAMERA_REGIONS;

export function cameraRegionsAt(lat: number, lng: number, radius: number): string[] {
  const intersects = (south: number, west: number, north: number, east: number) =>
    lat + radius >= south && lat - radius <= north && lng + radius >= west && lng - radius <= east;
  const regions: string[] = [];
  if (intersects(12, 34, 33, 60)) regions.push('gcc');
  if (intersects(10, -18, 38, 36)) regions.push('north-africa');
  if (intersects(12, 25, 43, 64)) regions.push('mena');
  return regions;
}
