import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const rss = `<rss><channel><item><title>Red earthquake (Magnitude 7M) in China, 10 thousand (in MMI&gt;=VII) &amp; more</title>
<link>http://www.gdacs.org/report.aspx?eventtype=EQ&amp;eventid=1573141</link>
<description><![CDATA[Population &lt;script&gt;alert(1)&lt;/script&gt; affected]]></description>
<geo:lat>32.38</geo:lat><geo:long>93.77</geo:long><gdacs:eventtype>EQ</gdacs:eventtype></item></channel></rss>`;

describe('GDACS incidents', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('decodes XML entities in names and links but escapes the html snippet', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(rss)));
    const [event] = (await (await GET()).json()).events;
    expect(event.name).toBe('Red earthquake (Magnitude 7M) in China, 10 thousand (in MMI>=VII) & more');
    expect(event.url).toBe('http://www.gdacs.org/report.aspx?eventtype=EQ&eventid=1573141');
    expect(event.type).toBe('earthquake');
    expect(event.html).not.toContain('<script>');
    expect(event.html).toContain('MMI&gt;=VII');
  });
});
