import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { notFound } from 'next/navigation';
import Link from 'next/link';
const guides: Record<string, { title: string; file: string }> = { 'research-setup': { title: 'Research service setup', file: 'RESEARCH_SETUP.md' }, 'sdk-setup': { title: 'Private SDK setup', file: 'SDK_SETUP.md' } };
export const dynamicParams = false;
export function generateStaticParams() { return Object.keys(guides).map(guide => ({ guide })); }
function inline(value: string) {
  return value.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((part, index) => part.startsWith('`') ? <code key={index}>{part.slice(1, -1)}</code> : part.startsWith('**') ? <strong key={index}>{part.slice(2, -2)}</strong> : part);
}
function GuideContent({ content }: { content: string }) {
  return content.split(/\r?\n\s*\r?\n/).map((block, index) => {
    if (block.startsWith('# ')) return null; // The surrounding page already renders its title.
    if (block.startsWith('## ')) return <h2 key={index} style={{ marginBlock: '28px 12px', fontSize: 20, fontWeight: 600 }}>{inline(block.slice(3))}</h2>;
    if (block.startsWith('```')) return <pre key={index} style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{block.replace(/^```[^\r\n]*\r?\n/, '').replace(/\r?\n```$/, '')}</pre>;
    if (/^\d+\. /.test(block)) return <ol key={index} start={Number(block.match(/^\d+/)?.[0] ?? 1)} style={{ listStyle: 'decimal', paddingInlineStart: 24 }}>{block.split(/\r?\n(?=\d+\. )/).map((item, ordinal) => <li key={ordinal} style={{ marginBlock: 12 }}>{inline(item.replace(/^\d+\. /, '').replace(/\s*\r?\n\s*/g, ' '))}</li>)}</ol>;
    return <p key={index} style={{ marginBlock: 16, overflowWrap: 'anywhere' }}>{inline(block.replace(/\s*\r?\n\s*/g, ' '))}</p>;
  });
}
export default async function GuidePage({ params }: { params: Promise<{ guide: string }> }) {
  const { guide } = await params, entry = Object.hasOwn(guides, guide) ? guides[guide] : null;
  if (!entry) notFound();
  const content = await readFile(join(process.cwd(), 'docs', entry.file), 'utf8');
  return <main style={{ padding: 24, marginInline: 'auto', maxWidth: 1000, lineHeight: 1.7 }}>
    <header><h1 style={{ fontSize: 26, fontWeight: 650, marginBlockEnd: 12 }}>{entry.title}</h1><nav aria-label="Setup guide navigation"><Link href="/admin/integrations">Open Admin → Integrations</Link> · <Link href="/">Open map</Link></nav></header>
    <article><GuideContent content={content} /></article>
  </main>;
}
