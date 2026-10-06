'use client';

import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { motion, useReducedMotion, useScroll, useSpring } from 'motion/react';
import { ArrowDown, ArrowRight, Check, ChevronRight, CircleAlert, CloudRain, Fingerprint, Globe2, Mail, Menu, Network, Radar, Search, ShieldCheck, Ship, X } from 'lucide-react';
import { Link000, Link001 } from '@/components/ui/skiper-ui/skiper40';
import styles from './OphanimLanding.module.css';

const FunnelChart = dynamic(() => import('@/components/charts/funnel-chart').then((module) => module.FunnelChart), { ssr: false });

const packs = [
  { title: 'Maritime', icon: Ship, items: ['AIS', 'Vessels', 'Ports', 'Chokepoints', 'Maritime incidents'] },
  { title: 'Environmental', icon: CloudRain, items: ['Weather', 'Cyclones', 'Floods', 'Earthquakes', 'Wildfires'] },
  { title: 'Cyber', icon: Fingerprint, items: ['Port incidents', 'Carrier incidents', 'Infrastructure outages', 'Known vulnerabilities'] },
  { title: 'Threat Intelligence', icon: Radar, items: ['Ransomware intelligence', 'Breach signals', 'Credential exposure', 'Approved dark-web intelligence'] },
  { title: 'OSINT', icon: Globe2, items: ['Official notices', 'Government advisories', 'News', 'Public maritime sources', 'Open-source intelligence'] },
];

const questions = ['Anything affecting our Mumbai shipments?', 'Investigate vessel ABC STAR.', 'Any cyber incidents affecting our ports?', 'What changed today?', 'Search our suppliers for threat-intelligence signals.'];
const funnelData = [{ label: 'World events', value: 2417, displayValue: '2,417' }, { label: 'Shipments', value: 143, displayValue: '143' }, { label: 'Findings', value: 3, displayValue: '3' }, { label: 'Action', value: 1, displayValue: '1' }];
type SubmitState = 'idle' | 'sending' | 'success' | 'error';

function Reveal({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const reduceMotion = useReducedMotion();
  return <motion.div className={className} initial={reduceMotion ? false : { opacity: 0, y: 18 }} whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.15 }} transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}>{children}</motion.div>;
}

function SectionHeading({ eyebrow, title, copy }: { eyebrow: string; title: string; copy?: string }) {
  return <Reveal className={styles.sectionHeading}><span className={styles.sectionEyebrow}>{eyebrow}</span><h2>{title}</h2>{copy ? <p>{copy}</p> : null}</Reveal>;
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
  const [askValue, setAskValue] = useState('');
  const [accessState, setAccessState] = useState<SubmitState>('idle');
  const [feedbackState, setFeedbackState] = useState<SubmitState>('idle');

  async function submitForm(event: FormEvent<HTMLFormElement>, endpoint: string, setState: (state: SubmitState) => void) {
    event.preventDefault();
    setState('sending');
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!response.ok) throw new Error('Submission failed');
      form.reset();
      setState('success');
    } catch {
      setState('error');
    }
  }

  return (
    <main className={styles.site} ref={siteRef}>
      <motion.div className={styles.scrollProgress} style={{ scaleX: reduceMotion ? 1 : scrollScale }} aria-hidden="true" />
      <header className={styles.nav}>
        <Link href="/" className={styles.brandLockup}><span className={styles.wordmark}>Shrafim</span><small>Product 01 · Ophanim</small></Link>
        <nav aria-label="Primary navigation" className={styles.navLinks}>
          <Link000 href="#product">Product</Link000><Link000 href="#intelligence">Intelligence</Link000><Link000 href="#how-it-works">How It Works</Link000><Link000 href="#extension">Extension</Link000><Link000 href="/login">Sign In</Link000><a href="#request-access" className={styles.buttonSmall}>Request Access</a>
        </nav>
        <button className={styles.menuButton} type="button" aria-label={menuOpen ? 'Close menu' : 'Open menu'} onClick={() => setMenuOpen((open) => !open)}>{menuOpen ? <X size={19} /> : <Menu size={19} />}</button>
        {menuOpen ? <nav className={styles.mobileMenu} aria-label="Mobile navigation">{['Product', 'Intelligence', 'How It Works', 'Security', 'Extension'].map((label) => <a key={label} href={`#${label.toLowerCase().replaceAll(' ', '-')}`} onClick={() => setMenuOpen(false)}>{label}</a>)}<Link href="/login">Sign In</Link><a href="#request-access" className={styles.buttonPrimary} onClick={() => setMenuOpen(false)}>Request Access</a></nav> : null}
      </header>

      <section className={styles.hero} id="product">
        <div className={styles.heroField} aria-hidden="true"><span /><span /><span /><span /><i /><i /><i /></div>
        <motion.div className={styles.heroCopy} initial={reduceMotion ? false : { opacity: 0, y: 24, clipPath: 'inset(0 0 18% 0)' }} animate={{ opacity: 1, y: 0, clipPath: 'inset(0 0 0% 0)' }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}>
          <div className={styles.heroBrand} aria-label="Shrafim product portfolio: Ophanim, logistics intelligence"><strong>Shrafim</strong><span /><div><small>Product 01</small><b>Ophanim</b><em>Logistics intelligence</em></div></div>
          <h1>See which world events could delay your shipments.</h1>
          <p className={styles.lede}>Shrafim builds focused intelligence products for complex operations. Ophanim is its logistics product: it watches weather, ports, vessels, cyber incidents and other disruptions, compares them with your shipment data and tells you what may be affected and why.</p>
          <div className={styles.heroActions}><a href="#request-access" className={styles.buttonPrimary}>Request Access <ArrowRight size={16} /></a><a href="#how-it-works" className={styles.buttonSecondary}>See How It Works</a></div>
          <div className={styles.plainSteps} aria-label="Ophanim in three simple steps">
            <div><span>1</span><p><strong>You share your operation</strong><small>Shipment lists, emails, spreadsheets or connected systems.</small></p></div>
            <div><span>2</span><p><strong>Ophanim watches for problems</strong><small>Port closures, storms, vessel issues, cyber incidents and more.</small></p></div>
            <div><span>3</span><p><strong>Your team gets a clear answer</strong><small>What happened, which shipments are exposed and what needs attention.</small></p></div>
          </div>
        </motion.div>

        <Reveal className={styles.productFrame} delay={0.12}>
          <aside className={styles.sidebar}><strong>Ophanim</strong><span className={styles.active}>Overview</span><span>Operations</span><span>Investigations</span><span>Intelligence</span><span>Ask Ophanim</span><span>Reports</span></aside>
          <div className={styles.dashboard}>
            <div className={styles.dashboardHeader}><div><span>OPERATIONS OVERVIEW</span><strong>Tuesday, 06:42 UTC</strong></div><span className={styles.liveStatus}><i /> Monitoring</span></div>
            <div className={styles.dashboardTop}><div><small>ACTIVE SHIPMENTS</small><strong>184</strong></div><div><small>ACT NOW</small><strong>2</strong></div><div><small>WATCH</small><strong>4</strong></div></div>
            <div className={styles.signalLabel}><CircleAlert size={13} /> ACT NOW</div>
            <article className={styles.signalRow}><div><strong>Mumbai Port Disruption</strong><p>3 active shipments potentially affected.</p></div><div className={styles.signalMeta}><span>Sources 4</span><span><Check size={12} /> High confidence</span></div><button type="button">Open Investigation <ArrowRight size={14} /></button></article>
            <div className={styles.signalLabelMuted}>WATCH</div>
            <article className={styles.signalRow}><div><strong>XYZ Terminal</strong><p>Ransomware-related intelligence detected. 4 shipments depend on this terminal.</p></div><div className={styles.signalMeta}><span>No confirmed outage</span><span>Moderate confidence</span></div><button type="button">View Evidence <ArrowRight size={14} /></button></article>
          </div>
        </Reveal>
        <p className={styles.heroFootnote}>Ophanim does not replace your logistics software. It adds an early-warning layer around it.</p>
      </section>

      <section className={styles.companySection} aria-labelledby="shrafim-company-title">
        <Reveal className={styles.companyLockup}>
          <div className={styles.companyLogo}><Image src="/shrafim-logo.png" width={768} height={576} alt="Shrafim" /></div>
          <div className={styles.companyCopy}>
            <span>Shrafim / Product company</span>
            <h2 id="shrafim-company-title">One company. A portfolio of intelligence products.</h2>
            <p>Shrafim is the company behind Ophanim. It builds focused products that turn fragmented operational data into clear decisions. Ophanim is the product dedicated to logistics.</p>
            <div className={styles.portfolioGrid}>
              <article className={styles.portfolioProduct}><span>01 / Current product</span><strong>Ophanim</strong><small>Logistics intelligence</small></article>
              <article className={styles.portfolioFuture}><span>Shrafim portfolio</span><strong>More products follow.</strong><small>Each one focused on a distinct operational domain.</small></article>
            </div>
          </div>
        </Reveal>
      </section>

      <section className={styles.section}>
        <SectionHeading eyebrow="Why Ophanim exists" title="A disruption is only useful to know about when it affects your operation." copy="Your team should not have to read thousands of alerts and manually check every shipment. Ophanim makes that connection for you." />
        <Reveal className={styles.correlationDiagram}>
          <div className={styles.sourceColumn}><span>YOUR COMPANY</span>{['Gmail', 'Excel', 'TMS', 'Shipment documents', 'Contracts'].map((item) => <b key={item}>{item}</b>)}</div>
          <div className={styles.flowLine}><span /><ArrowRight size={18} /></div>
          <div className={styles.correlationCore}><Network size={20} /><strong>Ophanim</strong><small>What actually affects us?</small></div>
          <div className={styles.flowLineReverse}><ArrowRight size={18} /><span /></div>
          <div className={styles.sourceColumn}><span>THE WORLD</span>{['Weather', 'Maritime activity', 'Port disruptions', 'Cyber incidents', 'Sanctions + OSINT'].map((item) => <b key={item}>{item}</b>)}</div>
        </Reveal>
      </section>

      <section className={`${styles.section} ${styles.tintSection}`} id="how-it-works">
        <SectionHeading eyebrow="How Ophanim works" title="Ophanim checks outside events against your real shipments." copy="It gathers disruption information, verifies important details, checks whether your company is exposed and gives your team a short, prioritized answer." />
        <Reveal className={styles.pipeline}>{['Your shipments', 'World events', 'Facts checked', 'Connections found', 'Impact explained', 'ACT NOW / WATCH'].map((stage, index) => <div className={styles.pipelineStage} key={stage}><span>{String(index + 1).padStart(2, '0')}</span><strong>{stage}</strong>{index < 5 ? <ChevronRight size={15} /> : null}</div>)}</Reveal>
        <div className={styles.explainGrid}><Reveal><span>01</span><h3>Connect your operation</h3><p>Start with shipment lists, email, spreadsheets and documents. Add deeper system connections later.</p></Reveal><Reveal delay={0.06}><span>02</span><h3>Monitor disruptions</h3><p>Ophanim watches maritime activity, weather, port problems, cyber incidents and trusted public sources.</p></Reveal><Reveal delay={0.12}><span>03</span><h3>Check what is relevant</h3><p>Each event is verified and compared with your vessels, ports, suppliers and active shipments.</p></Reveal><Reveal delay={0.18}><span>04</span><h3>Tell your team clearly</h3><p>You see what happened, what may be affected, the supporting evidence and how urgently it needs attention.</p></Reveal></div>
      </section>

      <section className={`${styles.section} ${styles.extensionSection}`} id="extension">
        <SectionHeading eyebrow="Ophanim browser extension" title="See what matters about the page in front of you." copy="The extension works beside Gmail, carrier pages, vessel trackers and other logistics websites. It recognizes what you are viewing and gives you the related Ophanim intelligence without leaving that page." />
        <Reveal className={styles.extensionSteps}>
          <div><span>01</span><strong>Detects the page context</strong><p>Shipment references, containers, vessels, ports and carriers are identified on your device.</p></div>
          <div><span>02</span><strong>Checks your existing Ophanim account</strong><p>Detected entities are matched with the same shipments, disruptions and evidence used by the main platform.</p></div>
          <div><span>03</span><strong>Shows a compact answer</strong><p>A side panel explains what needs attention and links directly to the full shipment or investigation.</p></div>
        </Reveal>
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
              <div className={styles.extensionClear}><b>✓</b><p><span>VESSEL</span><strong>No relevant stored alert</strong></p></div>
            </div>
            <footer><p><strong>2</strong> developments worth reviewing</p><button type="button">Open shipment <ArrowRight size={13} /></button></footer>
          </Reveal>
        </div>
        <Reveal className={styles.extensionPrinciple}><span>Ophanim Home <small>What should I know?</small></span><ArrowRight size={14} /><span>Ask Ophanim <small>What do I want to know?</small></span><ArrowRight size={14} /><span>EXTENSION <small>What matters about this?</small></span></Reveal>
      </section>

      <section className={styles.section} id="intelligence">
        <SectionHeading eyebrow="What Ophanim monitors" title="The disruptions that can affect moving goods." copy="Choose the areas relevant to your operation. Ophanim brings them into one place and checks them against your company data." />
        <div className={styles.packGrid}>{packs.map(({ title, icon: Icon, items }, index) => <Reveal className={styles.pack} key={title} delay={index * 0.045}><div className={styles.packTitle}><Icon size={18} /><h3>{title}</h3></div><ul>{items.map((item) => <li key={item}>{item}</li>)}</ul></Reveal>)}</div>
      </section>

      <section className={`${styles.section} ${styles.darkSection}`}>
        <SectionHeading eyebrow="The key difference" title="The world generates thousands of alerts. Ophanim tells you which few affect your shipments." copy="Instead of another news feed, you get a short list tied to your routes, vessels, ports, suppliers and cargo." />
        <Reveal className={styles.reductionGrid}>
          <div className={styles.reductionNumbers}>{[['2,417', 'global events'], ['143', 'shipments checked'], ['3', 'relevant findings'], ['1', 'requires action']].map(([number, label], index) => <div key={label}><span>{number}</span><small>{label}</small>{index < 3 ? <ArrowDown size={15} /> : null}</div>)}</div>
          <div className={styles.funnelWrap} aria-label="Signal reduction from global events to one required action">
            <div className={styles.funnelChartArea}><div className={styles.funnelLabels}><span>WORLD</span><span>RELEVANT</span></div><FunnelChart data={funnelData} color="#91a79e" edges="straight" gap={8} layers={1} showLabels={false} showPercentage={false} showValues={false} /></div>
            <article className={styles.actionOutcome}>
              <header><span><CircleAlert size={13} /> ACT NOW</span><small>1 OF 3 FINDINGS</small></header>
              <h3>Mumbai port disruption</h3>
              <p>Port restrictions may affect three active shipments arriving within the disruption window.</p>
              <div className={styles.outcomeMeta}><span><small>AFFECTED</small><strong>3 shipments</strong></span><span><small>CONFIDENCE</small><strong>High</strong></span></div>
              <button type="button">Open investigation <ArrowRight size={13} /></button>
            </article>
            <small className={styles.funnelCredit}>Signal-reduction visualization powered by Bklit UI.</small>
          </div>
        </Reveal>
      </section>

      <section className={styles.section}>
        <SectionHeading eyebrow="A simple example" title="A storm near Mumbai becomes a useful shipment alert." copy="Ophanim confirms the port restriction, checks all active shipments and shows that three may be affected. Your team sees the evidence behind the result." />
        <Reveal className={styles.investigation}><div className={styles.investigationRail}>{[['SEVERE WEATHER', 'Mumbai'], ['VERIFIED', 'Port restrictions confirmed'], ['CORRELATION', '143 active shipments checked'], ['IMPACT', '3 shipments potentially affected'], ['ASSESSMENT', 'High confidence']].map(([label, value], index) => <div key={label}><span>{index + 1}</span><small>{label}</small><strong>{value}</strong></div>)}</div><aside className={styles.evidencePanel}><span>RELEVANT EVIDENCE</span>{['Official weather warning', 'Port authority advisory', 'Shipment ETA', 'Destination data'].map((item) => <p key={item}><Check size={13} />{item}</p>)}</aside></Reveal>
      </section>

      <section className={`${styles.section} ${styles.threatSection}`} id="security">
        <div className={styles.threatCopy}><SectionHeading eyebrow="Cyber and security risks" title="Know when a cyber warning could affect a real shipment." copy="If a terminal, carrier or supplier appears in a cyber or security report, Ophanim checks whether your operation depends on that company and shows the connection." /><div className={styles.securityNote}><ShieldCheck size={18} /><p>A warning is not presented as a confirmed shutdown. Ophanim keeps the source, status and confidence visible so your team can judge it properly.</p></div></div>
        <Reveal className={styles.threatCard}><div className={styles.threatHeader}><span>THREAT SIGNAL</span><b>WATCH</b></div><h3>XYZ Terminal</h3><p>Ransomware-related mention detected</p><div className={styles.threatChain}><span>11 active shipments depend on XYZ Terminal</span><ArrowDown size={14} /><span>Official status: Normal</span><span>Port operations: Normal</span><span>Cyber sources: 1 additional signal</span></div><footer><div><small>CONFIDENCE</small><strong>Moderate</strong></div><button type="button">View evidence <ArrowRight size={13} /></button></footer></Reveal>
      </section>

      <section className={styles.section}>
        <SectionHeading eyebrow="Ask Ophanim" title="Ask a direct question and get an operation-specific answer." copy="For example: ‘Is anything affecting our Mumbai shipments?’ Ophanim searches your connected company data and the disruption information it monitors." />
        <Reveal className={styles.askPanel}><div className={styles.askInput}><Search size={23} /><input aria-label="Ask Ophanim" value={askValue} onChange={(event) => setAskValue(event.target.value)} placeholder="Ask Ophanim…" /><button type="button" aria-label="Submit question"><ArrowRight size={18} /></button></div><div className={styles.queryList}>{questions.map((question) => <button key={question} type="button" onClick={() => setAskValue(question)}>{question}</button>)}</div></Reveal>
      </section>

      <section className={`${styles.section} ${styles.tintSection}`}>
        <SectionHeading eyebrow="Start simple" title="No replacement project required." copy="Start with the data your team already has. Connect deeper systems only when they become useful." />
        <div className={styles.startGrid}><Reveal className={styles.startColumn}><span>TODAY</span><div>{['Gmail', 'Excel / CSV', 'Documents'].map((item) => <b key={item}>{item}</b>)}</div><ArrowDown size={17} /><strong>Ophanim</strong></Reveal><Reveal className={styles.startColumn} delay={0.08}><span>LATER</span><div>{['TMS', 'ERP', 'Premium maritime feeds', 'Premium cyber intelligence', 'Internal data systems'].map((item) => <b key={item}>{item}</b>)}</div><ArrowDown size={17} /><strong>Same Ophanim</strong></Reveal></div>
      </section>

      <section className={styles.section}>
        <SectionHeading eyebrow="Designed to grow" title="Built for small teams, extensible for enterprises." />
        <div className={styles.audienceGrid}><Reveal><span>SMALL LOGISTICS TEAMS</span><h3>Get an intelligence capability without building an intelligence department.</h3><p>Start with Gmail, spreadsheets, open intelligence and lightweight deployment.</p></Reveal><Reveal delay={0.08}><span>LARGER ORGANIZATIONS</span><h3>Bring the operational systems and intelligence sources you already use.</h3><p>Connect TMS, ERP, internal databases, premium maritime feeds and commercial threat intelligence as the architecture expands.</p></Reveal></div>
      </section>

      <section className={`${styles.section} ${styles.briefSection}`}>
        <SectionHeading eyebrow="Daily brief" title="Start the day knowing what needs attention." copy="One short view separates urgent problems, situations to watch and areas where nothing relevant has changed." />
        <Reveal className={styles.dailyBrief}><header><div><span>Ophanim</span><strong>DAILY BRIEF</strong></div><small>06:00 UTC · 15 AUG 2026</small></header><div className={styles.briefStats}><div><span>184</span><small>ACTIVE SHIPMENTS</small></div><div><span>2</span><small>ACT NOW</small></div><div><span>4</span><small>WATCH</small></div></div><div className={styles.briefItems}><p><b>ACT NOW</b><strong>Mumbai disruption</strong><span>3 shipments affected</span></p><p><b>WATCH</b><strong>XYZ Terminal cyber signal</strong><span>4 shipments under watch</span></p><p><b>CLEAR</b><strong>No relevant sanctions changes.</strong><span>No vessel incidents affecting tracked operations.</span></p></div></Reveal>
      </section>

      <section className={styles.finalSection} id="request-access">
        <div className={styles.finalCopy}><span>REQUEST ACCESS</span><h2>Know which disruptions affect your shipments.</h2><p>Ophanim watches the outside world, checks it against your operation and gives your team a clear, prioritized answer.</p><div className={styles.contactPlaceholder}><Mail size={16} /><span>Contact email coming soon</span></div></div>
        <form className={styles.accessForm} onSubmit={(event) => submitForm(event, '/api/public/signup', setAccessState)}><div className={styles.formHeader}><span>EARLY ACCESS</span><p>Tell us where to reach you.</p></div><label>Full name<input name="name" autoComplete="name" required maxLength={120} /></label><label>Email<input name="email" type="email" autoComplete="email" required maxLength={254} /></label><label>Company or private name <small>Optional</small><input name="companyName" autoComplete="organization" maxLength={160} /></label><label>Phone number<input name="phone" type="tel" autoComplete="tel" required maxLength={40} /></label><input className={styles.honeypot} name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" /><button className={styles.buttonPrimary} type="submit" disabled={accessState === 'sending'}>{accessState === 'sending' ? 'Sending…' : 'Request Access'} <ArrowRight size={15} /></button><StatusMessage state={accessState} success="Request received. We’ll be in touch." error="We couldn’t send that yet. Please try again." /><small className={styles.formLegal}>By submitting, you agree to the <Link href="/privacy">privacy policy</Link>.</small></form>
      </section>

      <section className={styles.feedbackSection}>
        <div><span>FEEDBACK</span><h2>Help shape Ophanim.</h2><p>Tell us what you need from an operational intelligence product.</p></div>
        <form className={styles.feedbackForm} onSubmit={(event) => submitForm(event, '/api/public/feedback', setFeedbackState)}><div className={styles.formRow}><label>Name <small>Optional</small><input name="name" autoComplete="name" maxLength={120} /></label><label>Email <small>Optional</small><input name="email" type="email" autoComplete="email" maxLength={254} /></label></div><label>Feedback<textarea name="message" required maxLength={3000} rows={5} placeholder="What should we know?" /></label><input className={styles.honeypot} name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" /><div className={styles.feedbackActions}><StatusMessage state={feedbackState} success="Thank you. Your feedback was received." error="We couldn’t send that yet. Please try again." /><button className={styles.buttonSecondary} type="submit" disabled={feedbackState === 'sending'}>{feedbackState === 'sending' ? 'Sending…' : 'Send Feedback'} <ArrowRight size={15} /></button></div></form>
      </section>

      <footer className={styles.footer}><div><Link href="/" className={styles.wordmark}>Shrafim</Link><p>Products / Ophanim · Logistics intelligence.</p></div><div className={styles.footerLinks}><Link000 href="/privacy">Privacy Policy</Link000><span>Contact · Coming soon</span><span>Instagram · Coming soon</span><span>TikTok · Coming soon</span><Link001 href="https://skiper-ui.com/">Interaction detail by Skiper UI</Link001></div><small>© 2026 Shrafim. Ophanim is a Shrafim product.</small></footer>
    </main>
  );
}
