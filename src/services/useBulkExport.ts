/**
 * useBulkExport.ts
 *
 * Hook that owns the bulk export fetch/stream/progress logic.
 *
 * CHANGES FROM PREVIOUS VERSION
 * ──────────────────────────────
 * All fetch calls now use API_BASE (from VITE_API_URL env var, default
 * http://localhost:3001) instead of relative paths. Relative paths hit
 * the Vite dev server (port 5174) instead of the Express backend (port 3001),
 * causing 404 errors on every bulk export attempt.
 *
 * Also fixed: async job download link now uses full API_BASE URL.
 */

import { useState, useCallback, useRef } from 'react';
import type { CanonicalDocument } from '../types/dataSource';

import { API_BASE, authHeaders } from './config';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type BulkStatus = 'idle' | 'running' | 'done' | 'error';

export interface BulkProgress {
  current: number;
  total:   number;
}

export interface BulkExportParams {
  ir:                      CanonicalDocument;
  pages:                   Array<{
    pageId?:                 string;
    templateElements:        any[];
    header?:                 any;
    footer?:                 any;
    fieldMapping:            Record<string, string>;
    tableCollectionBindings: Record<string, string>;
    collectionMappings:      Record<string, Record<string, string>>;
  }>;
  bulk: {
    driverCollectionKey:  string;
    fileNameTemplate:     string;
    relatedCollections:   Record<string, { filterColumn: string; driverRowField: string }>;
    zipFileName:          string;
    format?:              'pdf' | 'zpl' | 'png' | 'jpeg';
  };
  totalRows: number;
  pageSize?: any;
  format?: 'pdf' | 'zpl' | 'png' | 'jpeg';
  dpi?:         number;   // image formats only
  jpegQuality?: number;   // 0..1, jpeg only
}

export interface UseBulkExportReturn {
  run:          (params: BulkExportParams) => Promise<void>;
  progress:     BulkProgress | null;
  status:       BulkStatus;
  errorMessage: string | null;
  cancel:       () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const ASYNC_THRESHOLD  = 300;
const POLL_INTERVAL_MS = 1500;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

// ─────────────────────────────────────────────────────────────────────────────
// Streaming export  (≤ ASYNC_THRESHOLD rows)
// ─────────────────────────────────────────────────────────────────────────────

async function streamingExport(
  params:     BulkExportParams,
  onProgress: (p: BulkProgress) => void,
  signal:     AbortSignal,
): Promise<void> {
  const { bulk, totalRows } = params;

  const response = await fetch(`${API_BASE}/generate-bulk-documents`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body:    JSON.stringify({
      ir:       params.ir,
      pages:    params.pages,
      bulk,
      pageSize: params.pageSize ?? null,
      format:   params.bulk.format || params.format || 'pdf',
      dpi:         params.dpi,
      jpegQuality: params.jpegQuality,
    }),
    signal,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => 'Unknown error');
    throw new Error(`Server error ${response.status}: ${text}`);
  }

  const serverTotal         = parseInt(response.headers.get('X-Bulk-Total') || String(totalRows), 10);
  const estimatedTotalBytes = serverTotal * 100_000;

  const reader = response.body!.getReader();
  const chunks: BlobPart[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;

    const estimated = Math.min(
      serverTotal - 1,
      Math.floor((received / estimatedTotalBytes) * serverTotal),
    );
    onProgress({ current: estimated, total: serverTotal });
  }

  const blob = new Blob(chunks, { type: 'application/zip' });
  onProgress({ current: serverTotal, total: serverTotal });
  downloadBlob(blob, bulk.zipFileName);
}

// ─────────────────────────────────────────────────────────────────────────────
// Async export  (> ASYNC_THRESHOLD rows)
// ─────────────────────────────────────────────────────────────────────────────

async function asyncExport(
  params:     BulkExportParams,
  onProgress: (p: BulkProgress) => void,
  signal:     AbortSignal,
): Promise<void> {
  const { bulk, totalRows } = params;

  // 1. Submit job
  const submitResp = await fetch(`${API_BASE}/generate-bulk-documents/async`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body:    JSON.stringify({
      ir:       params.ir,
      pages:    params.pages,
      bulk,
      pageSize: params.pageSize ?? null,
      format:   params.bulk.format || params.format || 'pdf',
      dpi:         params.dpi,
      jpegQuality: params.jpegQuality,
    }),
    signal,
  });

  if (!submitResp.ok) {
    const text = await submitResp.text().catch(() => '');
    throw new Error(`Failed to submit bulk job: ${submitResp.status} ${text}`);
  }

  const { jobId } = await submitResp.json();
  if (!jobId) throw new Error('Server did not return a jobId');

  // 2. Poll until done
  while (true) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

    await sleep(POLL_INTERVAL_MS);

    const pollResp = await fetch(`${API_BASE}/bulk-jobs/${jobId}/status`, { signal });
    if (!pollResp.ok) continue;

    const statusData = await pollResp.json();

    if (statusData.status === 'running') {
      onProgress({ current: statusData.current ?? 0, total: statusData.total ?? totalRows });
      continue;
    }

    if (statusData.status === 'done') {
      onProgress({ current: totalRows, total: totalRows });
      // Trigger download — must use full URL so browser hits backend not dev server
      const a   = document.createElement('a');
      a.href     = `${API_BASE}/bulk-jobs/${jobId}/download`;
      a.download = bulk.zipFileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }

    if (statusData.status === 'error') {
      throw new Error(statusData.message || 'Async job failed on server');
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useBulkExport(): UseBulkExportReturn {
  const [status,       setStatus]       = useState<BulkStatus>('idle');
  const [progress,     setProgress]     = useState<BulkProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setStatus('idle');
    setProgress(null);
  }, []);

  const run = useCallback(async (params: BulkExportParams) => {
    abortRef.current?.abort();
    const controller  = new AbortController();
    abortRef.current  = controller;

    setStatus('running');
    setProgress({ current: 0, total: params.totalRows });
    setErrorMessage(null);

    try {
      if (params.totalRows > ASYNC_THRESHOLD) {
        await asyncExport(params, setProgress, controller.signal);
      } else {
        await streamingExport(params, setProgress, controller.signal);
      }
      setStatus('done');
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        setStatus('idle');
        setProgress(null);
      } else {
        setStatus('error');
        setErrorMessage(err?.message ?? 'Export failed');
      }
    }
  }, []);

  return { run, progress, status, errorMessage, cancel };
}