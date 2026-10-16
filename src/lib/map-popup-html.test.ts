// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { bindPopupActions, sanitizePopupHtml } from './map-popup-html';
describe('feed popup HTML boundary', () => {
  it.each([
    '<img src=x onerror="window.syntheticAttack=1">',
    '<svg onload="window.syntheticAttack=1"></svg>',
    '<script>window.syntheticAttack=1</script>',
    '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
    '<span onclick="window.syntheticAttack=1">Feed title</span>',
    '<a href="javascript:alert(1)">Record</a>',
  ])('removes executable feed markup %s', (attack) => {
    const div = document.createElement('div'); div.innerHTML = sanitizePopupHtml(attack);
    expect(div.querySelector('img,svg,script,iframe,[onclick],[onerror],[onload],a[href^="javascript:"]')).toBeNull();
  });
  it('preserves layout, safe links and the explicit deep-dive action without eval', () => {
    const div = document.createElement('div');
    div.innerHTML = sanitizePopupHtml('<div style="color:#fff"><a href="https://example.com" target="_blank">Source</a><button data-ophanim-intel="true" onclick="evil()">Deep dive</button></div>');
    const action = vi.fn(); bindPopupActions(div, action);
    expect(div.querySelector('div')?.getAttribute('style')).toBe('color:#fff');
    expect(div.querySelector('a')?.getAttribute('rel')).toBe('noopener noreferrer');
    const button = div.querySelector('button')!;
    expect(button.hasAttribute('onclick')).toBe(false); button.click();
    expect(action).toHaveBeenCalledOnce();
  });
});
