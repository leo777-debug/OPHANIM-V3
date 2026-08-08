'use client';

import { useEffect, useState } from 'react';

export default function EntityDetail({ id }: { id: string }) {
  const [entity, setEntity] = useState<any>(null);
  const [message, setMessage] = useState('Loading entity...');
  useEffect(() => { void fetch(`/api/platform/entities/${id}`, { cache: 'no-store' }).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error ?? 'Entity unavailable.'); setEntity(body.entity); setMessage(''); }).catch((error) => setMessage(error.message)); }, [id]);
  if (!entity) return <div className="platform-content"><p className="platform-notice">{message}</p></div>;
  return <div className="platform-content"><section className="platform-section platform-detail"><p>{entity.entityType}</p><h2>{entity.canonicalName}</h2><dl><div><dt>Visibility</dt><dd>{entity.visibility}</dd></div><div><dt>Confidence</dt><dd>{entity.confidence ?? 'Unscored'}</dd></div><div><dt>Identifiers</dt><dd>{entity.identifiers?.length ?? 0}</dd></div><div><dt>Last verified</dt><dd>{entity.lastVerifiedAt ? new Date(entity.lastVerifiedAt).toLocaleString() : 'Not verified'}</dd></div></dl>{entity.identifiers?.length ? <div className="platform-detail__block"><h3>Identifiers</h3>{entity.identifiers.map((identifier: any) => <p key={`${identifier.namespace}:${identifier.value}`}><strong>{identifier.namespace}</strong> {identifier.value}</p>)}</div> : null}<div className="platform-detail__block"><h3>Attributes</h3><pre>{JSON.stringify(entity.attributes, null, 2)}</pre></div></section></div>;
}
