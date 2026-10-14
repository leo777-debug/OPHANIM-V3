import { Parser } from 'htmlparser2';
import { describe, expect, it } from 'vitest';
import { safePopupUrl } from './map-popup-safety';

function attributes(value: unknown) {
  let attributes: Record<string, string> = {};
  const parser = new Parser({ onopentag(name, attrs) { if (name === 'a') attributes = attrs; } });
  parser.write(`<a href="${safePopupUrl(value)}">Source</a>`); parser.end();
  return attributes;
}
describe('map popup source URLs are safe HTML attributes', () => {
  it('cannot add an event handler through a quoted URL', () => {
    const parsed = attributes('https://source.example.test/" onmouseover="alert(1)');
    expect(Object.keys(parsed)).toEqual(['href']);
    expect(parsed.href).toContain('%22');
  });
  it.each(['javascript:alert(1)', 'data:text/html,<script>1</script>', 'https://user:password@example.test/', null, 'not-a-url'])(
    'rejects unsafe or credential-bearing source %s', (value) => expect(safePopupUrl(value)).toBe('#'),
  );
  it('preserves normal source query parameters when HTML is parsed', () => {
    expect(attributes('https://source.example.test/?a=1&b=2')).toEqual({ href: 'https://source.example.test/?a=1&b=2' });
  });
});
