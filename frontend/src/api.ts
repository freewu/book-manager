// Thin wrappers over the generated wails bindings + shared helpers.
import * as App from '../wailsjs/go/main/App';
import {EventsOn, EventsOff} from '../wailsjs/runtime/runtime';
import type {ScanProgress} from './types';

export {App};

export function humanSize(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let f = n;
  for (const u of units) {
    f /= 1024;
    if (f < 1024) return `${f.toFixed(1)} ${u}`;
  }
  return `${(f / 1024).toFixed(1)} PB`;
}

export function humanDuration(seconds: number): string {
  if (seconds <= 0) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  let out = '';
  if (h > 0) out += `${h}h`;
  if (m > 0 || h > 0) out += `${m}m`;
  if (h === 0 && m === 0) out += `${s}s`;
  return out;
}

const coverCache = new Map<number, {data: string; ts: number}>();
const coverTTL = 5 * 60 * 1000;

export async function getCoverDataUrl(bookId: number, force = false): Promise<string | null> {
  const hit = coverCache.get(bookId);
  if (!force && hit && Date.now() - hit.ts < coverTTL) {
    return hit.data || null;
  }
  try {
    const b64 = await App.GetCoverData(bookId);
    if (!b64) {
      coverCache.set(bookId, {data: '', ts: Date.now()});
      return null;
    }
    const dataUrl = `data:image/jpeg;base64,${b64}`;
    coverCache.set(bookId, {data: dataUrl, ts: Date.now()});
    return dataUrl;
  } catch {
    return null;
  }
}

export function invalidateCover(bookId: number) {
  coverCache.delete(bookId);
}

export function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// ---- event subscription helper for scan progress ----
export function onScanProgress(cb: (p: ScanProgress) => void): () => void {
  EventsOn('scan:progress', (p: ScanProgress) => cb(p));
  return () => EventsOff('scan:progress');
}

export function fmtDate(s: string): string {
  if (!s) return '';
  const d = new Date(s.replace(' ', 'T'));
  if (isNaN(d.getTime())) return s;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtDateTime(s: string): string {
  if (!s) return '';
  const d = new Date(s.replace(' ', 'T'));
  if (isNaN(d.getTime())) return s;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
