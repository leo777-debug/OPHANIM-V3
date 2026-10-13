import sharp from 'sharp';
import type { SharedResult } from './store';

function escape(text: string) { return text.replace(/[<>&"']/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[char]!)); }
function wrap(text: string, width = 90) {
  const lines: string[] = []; let current = '';
  for (const word of text.split(/\s+/)) {
    if (current.length + word.length > width) { if (current) lines.push(current); current = ''; }
    for (let start = 0; start < word.length; start += width) {
      const part = word.slice(start, start + width); if (part.length === width) { if (current) lines.push(current); lines.push(part); current = ''; } else current += `${current ? ' ' : ''}${part}`;
    }
  }
  if (current) lines.push(current); return lines;
}
export async function resultImage(result: SharedResult) {
  const lines = [
    'OPHANIM VERIFY', result.verdict, `Check time: ${result.checkedAt}`,
    ...(result.replay ? [`SYNTHETIC REPLAY at ${result.replay.recordedAt} - NOT LIVE`] : []),
    ...wrap(result.claim.text), '', ...wrap(result.summary), '', 'EVIDENCE',
    ...result.evidence.flatMap((item) => [ ...wrap(`${item.stance.toUpperCase()} | ${item.source} | ${item.trust}`), ...wrap(item.statement), `Observed: ${item.observedAt} | Retrieved: ${item.fetchedAt}`, ...wrap(item.sourceUrl), '' ]),
    'WHAT WE CHECKED', ...result.checked.flatMap((item) => wrap(item)), '', 'COULD NOT CHECK',
    ...result.couldNotCheck.flatMap((item) => wrap(`${item.source}: ${item.reason}`)), '', 'Results can change as new evidence arrives.',
  ];
  const height = Math.max(450, lines.length * 25 + 70);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="${height}"><rect width="1100" height="${height}" fill="#11161a"/>${lines.map((line, index) => `<text x="35" y="${45 + index * 25}" font-family="sans-serif" font-size="${index < 2 ? 22 : 17}" fill="${index < 2 ? '#65d9c3' : '#e3e9ed'}">${escape(line)}</text>`).join('')}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
