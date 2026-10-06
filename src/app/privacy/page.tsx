import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import styles from './privacy.module.css';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How Ophanim handles information submitted through its website.',
};

export default function PrivacyPage() {
  return (
    <main className={styles.page}>
      <header><Link href="/" className={styles.wordmark}>Shrafim</Link><Link href="/"><ArrowLeft size={14} /> Back to site</Link></header>
      <article>
        <div className={styles.kicker}>LEGAL</div>
        <h1>Privacy Policy</h1>
        <p className={styles.updated}>Effective 15 August 2026</p>
        <p className={styles.intro}>This policy explains how Shrafim handles information submitted through the Ophanim website. It covers early-access requests and feedback; product-specific data practices may be described separately before product access begins.</p>

        <section><h2>Information we collect</h2><p>When you request access, we collect your name, email address, phone number and, if you choose to provide it, a company or private name. When you send feedback, we collect the message and any optional name or email address you provide. Standard hosting logs may also contain technical information such as IP address, browser type and request time.</p></section>
        <section><h2>How we use information</h2><p>We use submitted information to respond to access requests, contact you about Ophanim, understand product requirements, review feedback, protect the website from abuse and meet applicable legal obligations. We do not sell personal information.</p></section>
        <section><h2>Storage and service providers</h2><p>Form submissions are stored in Supabase-hosted Postgres. Website hosting and operational service providers may process limited information on our behalf under their own security and data-processing commitments.</p></section>
        <section><h2>Retention</h2><p>We keep access requests and feedback only for as long as reasonably needed for the purposes described above, to maintain business records or to comply with legal requirements. Records that are no longer needed will be deleted or anonymized.</p></section>
        <section><h2>Your choices and rights</h2><p>You may ask to access, correct or delete information you submitted, or object to certain uses where applicable. Rights vary by location. We may need to verify your identity before completing a request.</p></section>
        <section><h2>Security</h2><p>We use reasonable technical and organizational safeguards designed to protect submitted information. No online system can guarantee absolute security.</p></section>
        <section><h2>International processing</h2><p>Information may be processed in countries other than your own. Where required, we use appropriate safeguards for international transfers.</p></section>
        <section><h2>Changes to this policy</h2><p>We may update this policy as Ophanim develops. The effective date at the top of this page will change when a revision is published.</p></section>
        <section><h2>Contact</h2><p>The privacy contact email will be added here before public launch. Until then, please do not submit sensitive personal, financial, health or confidential operational information through the feedback form.</p></section>
      </article>
      <footer><span>Contact email · Coming soon</span><span>Instagram · Coming soon</span><span>TikTok · Coming soon</span></footer>
    </main>
  );
}
