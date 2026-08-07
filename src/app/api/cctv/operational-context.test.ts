import { describe, expect, it } from 'vitest';
import { classifyOperationalCamera, filterCamerasByFocus } from './operational-context';

const baseCamera = {
  id: 'cam-1', lat: 33.74, lng: -118.24, city: 'Los Angeles', country: 'US',
  feed_url: 'https://example.test/camera.jpg', source: 'Caltrans',
};

describe('operational camera context', () => {
  it('classifies an official public camera near a logistics hub', () => {
    const camera = classifyOperationalCamera({ ...baseCamera, name: 'Harbor Freeway camera' });
    expect(camera.operational_category).toBe('port_approach');
    expect(camera.operational_scope).toBe('logistics');
    expect(camera.official_public_source).toBe(true);
  });

  it('does not assign operational classifications to non-official sources', () => {
    const camera = classifyOperationalCamera({ ...baseCamera, name: 'Port webcam', source: 'Community webcam' });
    expect(camera.operational_category).toBe('general_traffic');
    expect(camera.operational_scope).toBe('general');
    expect(camera.official_public_source).toBe(false);
  });

  it('filters logistics and official transport camera views independently', () => {
    const logistics = classifyOperationalCamera({ ...baseCamera, name: 'Harbor Freeway camera' });
    const transport = classifyOperationalCamera({ ...baseCamera, id: 'cam-2', lat: 35, lng: -120, name: 'Route 1', source: 'Caltrans' });
    const general = classifyOperationalCamera({ ...baseCamera, id: 'cam-3', name: 'Community camera', source: 'Community webcam' });

    expect(filterCamerasByFocus([logistics, transport, general], 'logistics')).toEqual([logistics]);
    expect(filterCamerasByFocus([logistics, transport, general], 'transport')).toEqual([logistics, transport]);
  });
});
