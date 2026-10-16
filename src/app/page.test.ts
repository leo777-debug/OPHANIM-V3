import { expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }),
}));

import HomePage from './page';

it('opens the operational app instead of marketing at the homepage', () => {
  expect(() => HomePage()).toThrow('redirect:/logistics/map');
});
