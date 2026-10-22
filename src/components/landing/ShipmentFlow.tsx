'use client';

import { useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Network, Users } from 'lucide-react';
import { useInView, useReducedMotion } from 'motion/react';
import styles from './OphanimLanding.module.css';

const companyInputs = ['Gmail', 'Excel', 'TMS', 'Shipment documents', 'Contracts'];
const worldInputs = ['Weather', 'Maritime activity', 'Port disruptions', 'Cyber incidents', 'Sanctions + OSINT'];
const humanInputs = [
  'Employees, drivers, partners and trusted contributors',
  'Submit on-the-ground observations, photos and reports',
  'Add time, location, entity and source context',
  'Ophanim verifies reports before using them as intelligence',
];

export default function ShipmentFlow() {
  const flowRef = useRef<HTMLElement>(null);
  const visible = useInView(flowRef, { amount: 0.15 });
  const reduceMotion = useReducedMotion();
  const [paused, setPaused] = useState(false);

  return (
    <figure ref={flowRef} className={styles.flowFigure} data-paused={paused || !visible || !!reduceMotion} aria-label="Company information, world events, and human reports connect to Ophanim">
      <div className={styles.flowBoard}>
        <div className={styles.flowSource}>
          <h3>Your company</h3>
          <ul>{companyInputs.map(label => <li key={label}>{label}</li>)}</ul>
        </div>
        <div className={styles.flowLink} aria-hidden="true"><i /><ArrowRight size={22} /></div>
        <div className={styles.flowCenter}>
          <button type="button" className={styles.flowCore} onClick={() => setPaused(value => !value)} aria-label={paused ? 'Resume workflow animation' : 'Pause workflow animation'} title={paused ? 'Resume animation' : 'Pause animation'}>
            <Network className={styles.flowCoreIcon} size={32} aria-hidden="true" />
            <strong>Ophanim</strong>
            <small>What actually affects us?</small>
            <span className={styles.flowCoreStatus}><i aria-hidden="true" />Verify · Correlate · Prioritize</span>
          </button>
        </div>
        <div className={styles.flowBranch} aria-hidden="true"><span /><b /><ArrowLeft size={22} /><i className={styles.flowWorldDot} /><i className={styles.flowHumanDot} /></div>
        <div className={styles.flowRight}>
          <div className={styles.flowSource}>
            <h3>The world</h3>
            <ul>{worldInputs.map(label => <li key={label}>{label}</li>)}</ul>
          </div>
          <div className={styles.flowTeam}>
            <h3><Users size={18} aria-hidden="true" />Human sensor network</h3>
            <ol>{humanInputs.map((label, index) => <li key={label}><span>{String(index + 1).padStart(2, '0')}</span><p>{label}</p>{index === 3 ? <i aria-hidden="true" /> : null}</li>)}</ol>
          </div>
        </div>
      </div>
    </figure>
  );
}
