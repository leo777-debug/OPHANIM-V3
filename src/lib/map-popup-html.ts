'use client';
import DOMPurify from 'dompurify';

export function sanitizePopupHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['div', 'span', 'br', 'a', 'button', 'b', 'strong', 'p', 'small'],
    ALLOWED_ATTR: ['style', 'href', 'target', 'rel', 'class', 'title', 'data-ophanim-intel'],
    ALLOW_DATA_ATTR: false,
  });
}

export function bindPopupActions(element: HTMLElement, action?: () => void): void {
  for (const link of element.querySelectorAll('a[target="_blank"]')) link.setAttribute('rel', 'noopener noreferrer');
  if (action) for (const button of element.querySelectorAll('[data-ophanim-intel]')) button.addEventListener('click', action);
}
