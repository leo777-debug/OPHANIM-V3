'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Camera, ExternalLink, Power, Save } from 'lucide-react';
import { DEFAULT_PRESENTATION, type PresentationSettings } from '@/lib/presentation/types';
import styles from './presentation.module.css';

type Snapshot = { id:string;recordedAt:string;count:number };
export default function PresentationAdmin() {
  const [settings,setSettings] = useState<PresentationSettings | null>(null);
  const [draft,setDraft] = useState(DEFAULT_PRESENTATION);
  const [snapshots,setSnapshots] = useState<Snapshot[]>([]);
  const [pin,setPin] = useState('');
  const [clearPin,setClearPin] = useState(false);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const [confirm,setConfirm] = useState<boolean | null>(null);
  async function load() {
    const response = await fetch('/api/presentation/admin',{cache:'no-store'});
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Settings unavailable.');
    setSettings(body.settings); setDraft(body.settings); setSnapshots(body.snapshots);
  }
  useEffect(()=>{void Promise.resolve().then(load).catch(()=>setMessage('Settings unavailable. Sign in as the owner and ensure the database migration has run.'));},[]);
  async function save(enabled=draft.enabled) {
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/presentation/settings',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({...draft,enabled,revision:settings?.revision,pin:clearPin?null:pin||undefined,pinRequired:undefined,updatedAt:undefined})});
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Settings were not saved.');
      setSettings(body.settings);setDraft(body.settings);setPin('');setClearPin(false);setConfirm(null);
      window.dispatchEvent(new Event('presentation-settings-changed'));
      setMessage('Saved. Open browsers pick this up within 30 seconds; new requests within a few seconds.');
    } catch(error) { setMessage(error instanceof Error?error.message:'Could not save settings.'); }
    finally {setBusy(false);}
  }
  async function record() {
    setBusy(true);setMessage('Recording public feeds independently. This can take up to 20 seconds.');
    try {
      const response=await fetch('/api/presentation/snapshot',{method:'POST'});
      const body=await response.json();
      if (!response.ok) throw new Error(body.error || 'Snapshot failed.');
      await load();setMessage(`Recorded ${body.saved.length} feeds. ${body.unavailable.length} unavailable; their previous snapshots were kept.`);
    } catch(error) {setMessage(error instanceof Error?error.message:'Snapshot failed.');}
    finally {setBusy(false);}
  }
  return <main className={styles.adminPage}><div className={styles.admin}>
    <header><div><Link href="/operations">Ophanim / Admin</Link><h1>Presentation mode</h1></div>{settings?.enabled && <span className={styles.pill}>Presentation mode is ON</span>}</header>
    <p>Switch between the public intelligence map and the full platform without deploying again.</p>
    <form className={styles.adminForm} onSubmit={event=>{event.preventDefault();void save();}}>
      <div className={styles.setting}><div><h2>Presentation mode</h2><p>OFF keeps the normal Ophanim site. ON opens the public map for visitors.</p></div><button type="button" role="switch" aria-label="Presentation mode" aria-checked={settings?.enabled ?? false} className={styles.power} disabled={!settings||busy} onClick={()=>setConfirm(!settings?.enabled)}><Power size={21} />{settings?.enabled?'ON':'OFF'}</button></div>
      <div className={styles.setting}><div><h2>Default view</h2><p>Used when a visitor has not chosen a view in this browser.</p></div><select aria-label="Default view" value={draft.defaultView} onChange={event=>setDraft({...draft,defaultView:event.target.value as 'map'|'full'})}><option value="map">Map view</option><option value="full">Full platform</option></select></div>
      <div className={styles.setting}><div><h2>Replay</h2><p>Auto uses live feeds with a per-source snapshot fallback. Replay is always labelled.</p></div><select aria-label="Replay" value={draft.replay} onChange={event=>setDraft({...draft,replay:event.target.value as 'auto'|'on'|'off'})}><option value="auto">Auto</option><option value="on">On - recorded feeds only</option><option value="off">Off - live feeds only</option></select></div>
      <div className={styles.setting}><div><h2>Is this true?</h2><p>Verify is not present in the default branch yet. Its map button stays hidden until that feature is available.</p></div><label><input type="checkbox" disabled checked={false} readOnly />Show Verify button (not available)</label></div>
      <div className={styles.setting}><div><h2>Switch PIN</h2><p>{settings?.pinRequired?'A PIN is set.':'No switch PIN is set.'} This prevents accidental switching, not access to private data. The normal login still applies.</p></div><div className={styles.pinRow}><input type="password" inputMode="numeric" autoComplete="new-password" aria-label="New switch PIN" placeholder="Set or replace: 4-12 digits" pattern="[0-9]{4,12}" value={pin} onChange={event=>{setPin(event.target.value);setClearPin(false);}} /><label><input type="checkbox" checked={clearPin} onChange={event=>{setClearPin(event.target.checked);setPin('');}} />Clear existing PIN</label></div></div>
      <div className={styles.adminActions}><button className={styles.primary} disabled={!settings||busy}><Save size={16} />Save settings</button><a href="/presentation/preview" target="_blank" rel="noopener noreferrer">Preview map view <ExternalLink size={13} style={{display:'inline'}} /></a></div>
    </form>
    {message && <p role="status" className={styles.adminNotice}>{message}</p>}
    <section><div className={styles.adminActions}><h2 style={{fontSize:20,marginRight:'auto'}}>Public feed snapshots</h2><button type="button" disabled={!settings||busy} onClick={()=>void record()}><Camera size={17} />Record snapshot now</button></div>
      {!snapshots.length ? <p>No snapshots recorded yet. Record one before presenting.</p> : <table className={styles.snapshotTable}><thead><tr><th>Feed</th><th>Recorded (UTC)</th><th>Items</th></tr></thead><tbody>{snapshots.map(snapshot=><tr key={snapshot.id}><td>{snapshot.id}</td><td>{new Date(snapshot.recordedAt).toISOString().replace('T',' ').slice(0,19)}</td><td>{snapshot.count}</td></tr>)}</tbody></table>}
    </section>
    {confirm!==null && <div className={styles.scrim}><div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="presentation-confirm"><h2 id="presentation-confirm">Turn presentation mode {confirm?'ON':'OFF'}?</h2><p>{confirm?'Visitors will see the live map by default.':'The normal Ophanim site returns.'}</p><div className={styles.adminActions}><button disabled={busy} className={styles.primary} onClick={()=>void save(confirm)}>Confirm {confirm?'ON':'OFF'}</button><button disabled={busy} onClick={()=>setConfirm(null)}>Cancel</button></div></div></div>}
  </div></main>;
}
