'use client';
import type { CSSProperties } from 'react';
import styles from './jobfile.module.css';

type Box = { x: number; y: number; w: number; h: number } | null;
/** Shows the cropped part of the photo a value was read from (bbox is 0–1 page fractions). */
export default function FieldCrop({ url, mimeType, bbox, page }: { url: string | null; mimeType: string; bbox: Box; page: number }) {
  if (!url || !bbox || !mimeType.startsWith('image/')) return <span className={styles.muted}>{url ? <a href={url} target="_blank" rel="noreferrer">page {page}</a> : `page ${page}`}</span>;
  const pad = 0.02, x = Math.max(0, bbox.x - pad), y = Math.max(0, bbox.y - pad), w = Math.min(1 - x, bbox.w + pad * 2), h = Math.min(1 - y, bbox.h + pad * 2);
  const style: CSSProperties = { backgroundImage: `url("${url}")`, backgroundSize: `${100 / w}% ${100 / h}%`, backgroundPosition: `${w >= 1 ? 0 : (x / (1 - w)) * 100}% ${h >= 1 ? 0 : (y / (1 - h)) * 100}%` };
  return <div className={styles.crop} style={style} role="img" aria-label={`Crop of page ${page}`} />;
}
