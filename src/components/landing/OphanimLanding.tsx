'use client';

import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion, useScroll, useSpring } from 'motion/react';
import { ArrowRight, Check, CircleAlert, Menu, X } from 'lucide-react';
import { Link000, Link001 } from '@/components/ui/skiper-ui/skiper40';
import styles from './OphanimLanding.module.css';
import ShipmentFlow from './ShipmentFlow';

const navigation = [
  { label: 'Product', href: '#product' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Features', href: '#features' },
  { label: 'Example', href: '#example' },
  { label: 'Extension', href: '#extension' },
];

const features = [
  { title: 'Explore the world', copy: 'View flights, ships, weather, hazards, and infrastructure on a map.' },
  { title: 'Follow the news', copy: 'Search and filter reports. Open the original story or export the results.' },
  { title: 'Check a claim', copy: 'Compare a public-event claim with available evidence. See the sources and what is still uncertain.' },
  { title: 'Save what matters', copy: 'Follow ships, ports, companies, or places. Get email updates when alerts are configured.' },
  { title: 'Manage shipment work', copy: 'Import shipment lists, review disruptions, and keep cases and supporting evidence together.' },
  { title: 'Search your documents', copy: 'Find relevant passages in uploaded files and open their citations. Add AI summaries when configured.' },
];

type SubmitState = 'idle' | 'sending' | 'success' | 'error';

function Reveal({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const reduceMotion = useReducedMotion();
  return <motion.div className={className} initial={reduceMotion ? false : { opacity: 0, y: 18 }} whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.15 }} transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}>{children}</motion.div>;
}

function SectionHeading({ eyebrow, title, copy }: { eyebrow?: string; title: string; copy?: string }) {
  return <Reveal className={styles.sectionHeading}>{eyebrow ? <span className={styles.sectionEyebrow}>{eyebrow}</span> : null}<h2>{title}</h2>{copy ? <p>{copy}</p> : null}</Reveal>;
}

function StatusMessage({ state, success, error }: { state: SubmitState; success: string; error: string }) {
  if (state === 'success') return <p className={styles.formSuccess} role="status"><Check size={14} /> {success}</p>;
  if (state === 'error') return <p className={styles.formError} role="alert"><CircleAlert size={14} /> {error}</p>;
  return null;
}

export default function OphanimLanding() {
  const siteRef = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({ container: siteRef });
  const scrollScale = useSpring(scrollYProgress, { stiffness: 120, damping: 28, mass: 0.25 });
  const [menuOpen, setMenuOpen] = useState(false);
  const [accessState, setAccessState] = useState<SubmitState>('idle');
  const [feedbackState, setFeedbackState] = useState<SubmitState>('idle');
  const [accessError, setAccessError] = useState('');
  const [feedbackError, setFeedbackError] = useState('');
  const pendingForms = useRef(new WeakSet<HTMLFormElement>());

  async function submitForm(event: FormEvent<HTMLFormElement>, endpoint: string, setState: (state: SubmitState) => void, setError: (message: string) => void) {
    event.preventDefault();
    const form = event.currentTarget;
    if (pendingForms.current.has(form)) return;
    pendingForms.current.add(form);
    setState('sending');
    setError('');
    const payload = Object.fromEntries(new FormData(form).entries());
    try {
      const response = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload), signal: AbortSignal.timeout(20_000),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.ok !== true) {
        throw new Error(typeof result?.error === 'string' ? result.error : 'Your submission was not saved. Please try again.');
      }
      form.reset();
      setState('success');
    } catch (error) {
      setError(error instanceof Error && error.name !== 'TimeoutError' && error.name !== 'TypeError'
        ? error.message : 'We could not connect. Your details are still here. Please try again.');
      setState('error');
    } finally {
      pendingForms.current.delete(form);
    }
  }

  return (
    <main className={styles.site} ref={siteRef}>
      <motion.div className={styles.scrollProgress} style={{ scaleX: reduceMotion ? 1 : scrollScale }} aria-hidden="true" />
      <header className={styles.nav}>
        <Link href="/" className={styles.brandLockup}><span className={styles.wordmark}>Ophanim</span><small>Shipment alerts for shipping teams</small></Link>
        <nav aria-label="Primary navigation" className={styles.navLinks}>
          {navigation.map(({ label, href }) => <a key={href} href={href}>{label}</a>)}<a href="#request-access" className={styles.buttonSmall}>Join the waitlist</a>
        </nav>
        <button className={styles.menuButton} type="button" aria-expanded={menuOpen} aria-controls="landing-mobile-menu" aria-label={menuOpen ? 'Close menu' : 'Open menu'} onClick={() => setMenuOpen((open) => !open)}>{menuOpen ? <X size={19} /> : <Menu size={19} />}</button>
        {menuOpen ? <nav id="landing-mobile-menu" className={styles.mobileMenu} aria-label="Mobile navigation">{navigation.map(({ label, href }) => <a key={href} href={href} onClick={() => setMenuOpen(false)}>{label}</a>)}<a href="#request-access" className={styles.buttonPrimary} onClick={() => setMenuOpen(false)}>Join the waitlist</a></nav> : null}
      </header>

      <section className={styles.hero} id="product">
        <div className={styles.heroField} aria-hidden="true"><span /><span /><span /><span /><i /><i /><i /></div>
        <motion.div className={styles.heroCopy} initial={reduceMotion ? false : { opacity: 0, y: 24, clipPath: 'inset(0 0 18% 0)' }} animate={{ opacity: 1, y: 0, clipPath: 'inset(0 0 0% 0)' }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}>
          <div className={styles.heroBrand} aria-label="Ophanim, shipment alerts for shipping teams"><strong>Ophanim</strong><em>Shipment alerts for shipping teams</em></div>
          <h1>Know what could delay your shipments.</h1>
          <p className={styles.lede}>Ophanim is a shipment monitoring tool for shipping teams. It checks weather, port updates, and security reports against your shipment list.</p>
          <div className={styles.heroActions}><a href="#request-access" className={styles.buttonPrimary}>Join the waitlist <ArrowRight size={16} /></a><a href="#how-it-works" className={styles.buttonSecondary}>See how it works</a></div>
        </motion.div>

      </section>

      <section className={`${styles.section} ${styles.howSection}`} id="how-it-works">
        <SectionHeading title="How it works" />
        <ShipmentFlow />
        <div className={styles.explainGrid}>
          <Reveal><span>01</span><h3>Add your shipment details.</h3></Reveal>
          <Reveal delay={0.06}><span>02</span><h3>Ophanim checks for problems along their routes.</h3></Reveal>
          <Reveal delay={0.12}><span>03</span><h3>Review affected shipments and the sources behind each alert.</h3></Reveal>
        </div>
        <div className={styles.features} id="features" aria-labelledby="features-heading">
          <Reveal><h3 id="features-heading" className={styles.featuresHeading}>What you can do</h3></Reveal>
          <div className={styles.featureGrid}>
            {features.map(({ title, copy }, index) => (
              <Reveal key={title} delay={(index % 3) * 0.04} className={styles.featureCard}>
                <h4>{title}</h4>
                <p>{copy}</p>
              </Reveal>
            ))}
          </div>
          <Reveal className={styles.plannedFeature}>
            <span>Planned feature</span>
            <h4>Confirm shipment details automatically</h4>
            <p>Ophanim will contact employees to confirm shipment details and ask for updates.</p>
          </Reveal>
          <p className={styles.featureNote}>Available data, email alerts, and AI features depend on connected sources and workspace setup.</p>
        </div>
      </section>

      <section className={styles.section} id="example">
        <p className={styles.exampleNotice}>Illustrative example — not a live alert</p>
        <SectionHeading title="A storm could delay your shipment." copy="A storm is forecast near Mumbai’s port. Your shipment arrives there tomorrow. Ophanim shows the warning beside your shipment details so you know what to check." />
        <Reveal className={styles.investigation}>
          <div className={styles.investigationRail}>
            {[['THE PROBLEM', 'A storm may disrupt Mumbai’s port.'], ['YOUR SHIPMENT', 'DXB-291 is due there tomorrow.'], ['YOUR NEXT STEP', 'Ask your carrier whether the arrival time has changed.']].map(([label, value], index) => <div key={label}><span>{index + 1}</span><small>{label}</small><strong>{value}</strong></div>)}
          </div>
          <aside className={styles.evidencePanel}><span>EXAMPLE SOURCES</span><p><Check size={13} />Weather report</p><p><Check size={13} />Your shipment schedule</p></aside>
        </Reveal>
      </section>

      <section className={`${styles.section} ${styles.extensionSection}`} id="extension">
        <SectionHeading title="Check from your browser." copy="View related alerts beside your emails and shipping websites." />
        <p className={styles.exampleLabel}>Extension preview</p>
        <div className={styles.extensionDemo}>
          <Reveal className={styles.browserContext}>
            <header><span /><span /><span /><p>mail.google.com</p></header>
            <div className={styles.emailMock}>
              <span>SHIPMENT UPDATE</span>
              <h3>DXB-291 remains on schedule for Mumbai.</h3>
              <p>Arrival is currently expected on 18 August. The shipment is moving through Jebel Ali as planned.</p>
              <div className={styles.detectedEntity}><i /> Ophanim detected <strong>DXB-291</strong> and <strong>Mumbai</strong></div>
            </div>
          </Reveal>
          <Reveal className={styles.extensionPanel} delay={0.1}>
            <header><div><i />Ophanim</div><small>GMAIL</small></header>
            <div className={styles.extensionShipment}><span>MATCHED SHIPMENT</span><h3>DXB-291</h3><p>Dubai → Mumbai</p><small>IN TRANSIT</small></div>
            <div className={styles.extensionSignals}>
              <div className={styles.extensionWarning}><b>▲</b><p><span>WEATHER</span><strong>Severe weather near arrival window</strong></p></div>
              <div className={styles.extensionWarning}><b>●</b><p><span>PORT</span><strong>Restrictions possible</strong></p></div>
              <div className={styles.extensionClear}><b>✓</b><p><span>VESSEL</span><strong>No saved alerts for this ship</strong></p></div>
            </div>
            <footer><p><strong>2</strong> updates to check</p><button type="button" disabled title="Illustrative preview">Preview only</button></footer>
          </Reveal>
        </div>
      </section>

      <section id="request-access">
        <div className={styles.finalSection}>
        <div className={styles.finalCopy}><h2>Join the waitlist.</h2><p>Sign up to hear when Ophanim is available.</p></div>
        <form aria-busy={accessState === 'sending'} className={styles.accessForm} onSubmit={(event) => submitForm(event, '/api/public/signup', setAccessState, setAccessError)}><label>Full name<input name="name" autoComplete="name" required minLength={2} maxLength={120} /></label><label>Email<input name="email" type="email" autoComplete="email" required maxLength={254} /></label><label>Company <small>Optional</small><input name="companyName" autoComplete="organization" maxLength={160} /></label><label>Phone number<input name="phone" type="tel" autoComplete="tel" required minLength={5} maxLength={40} /></label><input className={styles.honeypot} name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" /><button className={styles.buttonPrimary} type="submit" disabled={accessState === 'sending'}>{accessState === 'sending' ? 'Sending…' : "Join the waitlist"} <ArrowRight size={15} /></button><StatusMessage state={accessState} success="Thanks. You’re on the waitlist." error={accessError || "Your signup was not saved. Please try again."} /><small className={styles.formLegal}>By submitting, you agree to the <Link href="/privacy">privacy policy</Link>.</small></form>
        </div>
        <details className={styles.feedbackDisclosure}>
          <summary>Share feedback</summary>
          <div className={styles.feedbackSection}>
        <div><span>FEEDBACK</span><h3>Help shape Ophanim.</h3><p>What makes it hard to keep your shipments on track? Tell us what would help.</p></div>
        <form aria-busy={feedbackState === 'sending'} className={styles.feedbackForm} onSubmit={(event) => submitForm(event, '/api/public/feedback', setFeedbackState, setFeedbackError)}><div className={styles.formRow}><label>Name <small>Optional</small><input name="name" autoComplete="name" maxLength={120} /></label><label>Email <small>Optional</small><input name="email" type="email" autoComplete="email" maxLength={254} /></label></div><label>Feedback<textarea name="message" required minLength={3} maxLength={3000} rows={5} placeholder="What should we know?" /></label><input className={styles.honeypot} name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" /><div className={styles.feedbackActions}><StatusMessage state={feedbackState} success="Thank you. Your feedback was received." error={feedbackError || "Your feedback was not sent. Please try again."} /><button className={styles.buttonSecondary} type="submit" disabled={feedbackState === 'sending'}>{feedbackState === 'sending' ? 'Sending…' : 'Send Feedback'} <ArrowRight size={15} /></button></div></form>
          </div>
        </details>
      </section>

      <footer className={styles.footer}><div><Link href="/" className={styles.wordmark}>Ophanim</Link><p>Ophanim · Shipment alerts for shipping teams.</p></div><div className={styles.footerLinks}><Link000 href="/privacy">Privacy Policy</Link000><span>Contact · Coming soon</span><span>Instagram · Coming soon</span><span>TikTok · Coming soon</span><Link001 href="https://skiper-ui.com/">Interactions by Skiper UI</Link001></div><small>© 2026 Ophanim.</small></footer>
    </main>
  );
}
