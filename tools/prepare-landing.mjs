import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destination = path.join(root, 'output', 'ophanim-landing');
const write = (name, contents) => {
  const target = path.join(destination, name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
};
const copy = (name) => write(name, fs.readFileSync(path.join(root, name)));

for (const name of [
  'src/app/page.tsx',
  'src/app/privacy/page.tsx',
  'src/app/privacy/privacy.module.css',
  'src/app/api/public/signup/route.ts',
  'src/app/api/public/feedback/route.ts',
  'src/components/landing/OphanimLanding.tsx',
  'src/components/landing/OphanimLanding.module.css',
  'src/components/landing/ShipmentFlow.tsx',
  'src/components/ui/skiper-ui/skiper40.tsx',
  'src/lib/utils.ts',
  'src/lib/marketing/supabase.ts',
  'src/lib/marketing/validation.ts',
  'public/og.png',
  'public/favicon.svg',
]) copy(name);

const version = (name) => JSON.parse(fs.readFileSync(path.join(root, 'node_modules', name, 'package.json'), 'utf8')).version;
write('package.json', JSON.stringify({
  name: 'ophanim-landing',
  version: '1.0.0',
  private: true,
  scripts: { dev: 'next dev', build: 'next build', start: 'next start' },
  dependencies: Object.fromEntries(['next', 'react', 'react-dom', 'motion', 'lucide-react', 'clsx', 'tailwind-merge'].map(name => [name, version(name)])),
  devDependencies: Object.fromEntries(['typescript', '@types/react', '@types/react-dom', '@types/node', 'tailwindcss', '@tailwindcss/postcss'].map(name => [name, version(name)])),
}, null, 2) + '\n');

write('tsconfig.json', JSON.stringify({
  compilerOptions: {
    target: 'ES2017', lib: ['dom', 'dom.iterable', 'esnext'], strict: true,
    noEmit: true, skipLibCheck: true, esModuleInterop: true, module: 'esnext',
    moduleResolution: 'bundler', resolveJsonModule: true, isolatedModules: true,
    jsx: 'react-jsx', incremental: true, plugins: [{ name: 'next' }],
    paths: { '@/*': ['./src/*'] },
  },
  include: ['next-env.d.ts', 'src/**/*.ts', 'src/**/*.tsx', '.next/types/**/*.ts'],
  exclude: ['node_modules'],
}, null, 2) + '\n');
write('next.config.mjs', 'export default {};\n');
write('postcss.config.mjs', 'export default { plugins: { "@tailwindcss/postcss": {} } };\n');
write('.gitignore', 'node_modules/\n.next/\n.vercel/\n.env*\n!.env.example\nnext-env.d.ts\n*.tsbuildinfo\n');
write('.vercelignore', 'node_modules\n.next\n.env*\n');
write('.env.example', [
  'NEXT_PUBLIC_SITE_URL=https://ophanim.live',
  'SUPABASE_URL=',
  'SUPABASE_PUBLISHABLE_KEY=',
  '',
].join('\n'));

write('src/app/globals.css', `@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Space+Grotesk:wght@400;500;600;700&display=swap');
@import "tailwindcss";
@source "../";
html, body { margin: 0; min-height: 100%; background: #f4f2ec; }
body { font-family: Manrope, Arial, sans-serif; }
`);
write('src/app/layout.tsx', `import type { Metadata } from 'next';
import './globals.css';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL : 'https://ophanim.live');
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'Ophanim — Know what could delay your shipments',
  description: 'Ophanim helps shipping teams see which storms, port closures, and other problems could delay their shipments. Join the waitlist.',
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
`);
write('src/app/robots.ts', `import type { MetadataRoute } from 'next';
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', allow: '/', disallow: '/api/' }, sitemap: new URL('/sitemap.xml', process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL : 'https://ophanim.live')).href };
}
`);
write('src/app/sitemap.ts', `import type { MetadataRoute } from 'next';
export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL : 'https://ophanim.live');
  return ['/', '/privacy'].map(route => ({ url: new URL(route, base).href }));
}
`);
write('README.md', `# Ophanim landing deployment

Generated from the reviewed landing sources by running node tools/prepare-landing.mjs at the repository root.
Deploy this directory alone. It contains the homepage, privacy policy, form handlers, and their assets.
It excludes application pages, application authentication, service workers, and private environment files.
The two existing form handlers require the Supabase environment variables in .env.example.
Database configuration is a separate step; this preparation does not create tables or change any remote service.
`);
console.log(`Prepared Ophanim-only deployment: ${destination}`);
