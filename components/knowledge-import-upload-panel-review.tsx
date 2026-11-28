'use client';

import { useEffect, useRef, useState } from 'react';
import { createKnowledgeUploadFlowReview, validKnowledgeImportFile, type KnowledgeUploadFlowState } from '@/lib/knowledge-import-upload-flow-review';
import styles from './knowledge-import-centre-review.module.css';

type Flow = ReturnType<typeof createKnowledgeUploadFlowReview>;
const messages: Record<KnowledgeUploadFlowState, string> = {
  ready: 'Ready to upload.',
  reserving: 'Preparing the import…',
  uploading: 'Uploading the selected file…',
  interrupted: 'Upload interrupted. Resume to retry the same file.',
  registered: 'Upload received. Follow its progress in Recent imports.',
  reconciliation_required: 'The upload outcome is uncertain. Check its receipt before retrying.',
  cancelled: 'Import cancelled.',
  rejected: 'This file could not be imported.',
};

export function KnowledgeImportUploadPanelReview({ scopeKey, disabled, onChanged }: {
  scopeKey: string;
  disabled: boolean;
  onChanged: () => void;
}) {
  const flow = useRef<Flow | null>(null);
  const running = useRef(false);
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<ReturnType<Flow['snapshot']> | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => () => {
    flow.current?.stop();
    flow.current = null;
  }, []);

  const status = state?.state ?? 'ready';
  const validFile = file !== null && validKnowledgeImportFile(file);
  const fileLocked = flow.current !== null && !['registered', 'cancelled', 'rejected'].includes(status);
  const canCancel = state !== null && !['ready', 'cancelled', 'rejected'].includes(status) &&
    !['completed', 'cancelled', 'expired'].includes(state.jobStatus ?? '');

  async function act(operation: 'start' | 'check' | 'cancel') {
    if (disabled || running.current) return;
    if (!flow.current) {
      if (operation !== 'start' || !file || !validFile) return;
      flow.current = createKnowledgeUploadFlowReview({
        origin: window.location.origin, file, jobId: crypto.randomUUID(), scopeKey, emit: setState,
      });
    }
    const current = flow.current;
    running.current = true;
    setBusy(true);
    try {
      await current[operation]();
    } finally {
      running.current = false;
      if (flow.current === current) {
        setBusy(false);
        onChanged();
      }
    }
  }

  return <fieldset className={styles.upload} disabled={disabled || busy}>
    <legend>Import a JSON file</legend>
    <label className="kn-field">Choose JSON file
      <input type="file" accept=".json,application/json" disabled={fileLocked} onChange={(event) => {
        flow.current?.stop();
        flow.current = null;
        setState(null);
        setFile(event.target.files?.[0] ?? null);
      }}/>
    </label>
    {file && !validFile ? <p role="alert">Choose a non-empty JSON file up to 50 MiB.</p> : null}
    {state ? <>
      <p role="status">{messages[status]}</p>
      <progress className={styles.progress} aria-label="Confirmed uploaded bytes" max={state.totalBytes} value={state.confirmedBytes}/>
    </> : null}
    <div className="kn-create-actions">
      <button type="button" className="kn-primary" disabled={!validFile || !['ready', 'interrupted'].includes(status)}
        onClick={() => void act('start')}>{status === 'interrupted' ? 'Resume upload' : 'Start import'}</button>
      {status === 'reconciliation_required' ? <button type="button" className="kn-secondary" onClick={() => void act('check')}>Check upload receipt</button> : null}
      {canCancel ? <button type="button" className="kn-secondary" onClick={() => void act('cancel')}>Cancel import</button> : null}
    </div>
  </fieldset>;
}
