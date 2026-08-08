'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';

export default function CaseDetail({ id }: { id: string }) {
  const [caseRecord, setCaseRecord] = useState<any>(null);
  const [task, setTask] = useState('');
  const [message, setMessage] = useState('');
  const load = useCallback(async () => { const response = await fetch(`/api/platform/cases/${id}`, { cache: 'no-store' }); const body = await response.json(); if (!response.ok) throw new Error(body.error ?? 'Case unavailable.'); setCaseRecord(body.case); }, [id]);
  useEffect(() => { void load().catch((error) => setMessage(error.message)); }, [load]);
  const addTask = async (event: FormEvent) => { event.preventDefault(); try { const response = await fetch(`/api/platform/cases/${id}/tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: task }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error ?? 'Unable to add task.'); setTask(''); await load(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to add task.'); } };
  if (!caseRecord) return <div className="platform-content"><p className="platform-notice">{message || 'Loading case...'}</p></div>;
  return <div className="platform-content"><section className="platform-section platform-detail"><p>{caseRecord.case_status} · {caseRecord.priority} priority</p><h2>{caseRecord.title}</h2><p>{caseRecord.description || 'No case description.'}</p><div className="platform-detail__block"><h3>Tasks</h3><form className="platform-inline-form" onSubmit={(event) => void addTask(event)}><input value={task} onChange={(event) => setTask(event.target.value)} placeholder="Add follow-up task" /><button type="submit">Add task</button></form>{caseRecord.tasks?.length ? caseRecord.tasks.map((item: any) => <p key={item.id}><strong>{item.task_status}</strong> {item.title}</p>) : <p>No tasks yet.</p>}</div></section></div>;
}
