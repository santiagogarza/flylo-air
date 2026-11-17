'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SendIcon } from '@/components/icons';

export function CaseActions({ ticketId, draft, status }: { ticketId: string; draft: string; status: string }) {
  const router = useRouter();
  const [text, setText] = useState(draft);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const saved = window.sessionStorage.getItem('intake-reviewer');
    if (saved) setName(saved);
  }, []);

  useEffect(() => {
    setText(draft);
  }, [draft]);

  const dirty = text.trim() !== draft.trim();

  async function act(action: string) {
    if (pending) return;
    setPending(true);
    setMessage('');
    setFailed(false);
    window.sessionStorage.setItem('intake-reviewer', name);
    try {
      const response = await fetch(`/api/cases/${encodeURIComponent(ticketId)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, by: name, draft: text }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string; idempotent?: boolean };
      if (!response.ok) {
        setFailed(true);
        setMessage(body.error || 'The case was not updated.');
        return;
      }
      setMessage(body.idempotent ? 'Already recorded. Nothing was emailed.' : 'Recorded in the demo queue. Nothing was emailed.');
      router.refresh();
    } catch {
      setFailed(true);
      setMessage('The case was not updated. Try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="card actions-card" aria-labelledby="case-actions" aria-busy={pending || undefined}>
      <div className="card-head">
        <h2 id="case-actions">Actions</h2>
        <span className="status-chip" data-status={status}>
          Current status: {status.replaceAll('_', ' ')}
        </span>
      </div>
      <p className="mock-note">Send only marks this case in the demo queue. It does not email the customer.</p>
      <div className="field">
        <label htmlFor="reviewer-name">Your name</label>
        <input id="reviewer-name" value={name} autoComplete="name" onChange={(event) => setName(event.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="case-draft">
          Draft reply
          {dirty && <span className="edited-tag">Edited</span>}
        </label>
        <textarea id="case-draft" rows={8} value={text} aria-describedby="case-draft-hint" onChange={(event) => setText(event.target.value)} />
        <p className="hint" id="case-draft-hint">
          Edit the text to send your version. Send becomes Edit &amp; send.
        </p>
      </div>
      <div role="status" className="actions-status">
        {message && <p className={`alert ${failed ? 'alert-error' : 'alert-success'}`}>{message}</p>}
      </div>
      <div className="case-buttons">
        <button type="button" className="btn" disabled={pending} onClick={() => act(dirty ? 'edit_send' : 'send')}>
          <SendIcon className="btn-icon" />
          {dirty ? 'Edit & send' : 'Send'}
        </button>
        <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => act('escalate')}>
          Escalate
        </button>
        <button type="button" className="btn btn-ghost btn-reject" disabled={pending} onClick={() => act('reject')}>
          Reject
        </button>
        <button type="button" className="btn btn-ghost btn-quiet" disabled={pending} onClick={() => act('request_changes')}>
          Request changes
        </button>
      </div>
    </section>
  );
}
