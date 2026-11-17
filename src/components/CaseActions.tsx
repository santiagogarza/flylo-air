'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export function CaseActions({ ticketId, draft, status }: { ticketId: string; draft: string; status: string }) {
  const router = useRouter();
  const [text, setText] = useState(draft);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
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
    window.sessionStorage.setItem('intake-reviewer', name);
    try {
      const response = await fetch(`/api/cases/${encodeURIComponent(ticketId)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, by: name, draft: text }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string; idempotent?: boolean };
      if (!response.ok) {
        setMessage(body.error || 'The case was not updated.');
        return;
      }
      setMessage(body.idempotent ? 'Already recorded. Nothing was emailed.' : 'Recorded in the demo queue. Nothing was emailed.');
      router.refresh();
    } catch {
      setMessage('The case was not updated. Try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="card" aria-labelledby="case-actions">
      <h2 id="case-actions">Actions</h2>
      <p className="hint">Send only marks this case in the demo queue. It does not email the customer.</p>
      <div className="field">
        <label htmlFor="reviewer-name">Your name</label>
        <input id="reviewer-name" value={name} autoComplete="name" onChange={(event) => setName(event.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="case-draft">Draft reply</label>
        <textarea id="case-draft" rows={8} value={text} onChange={(event) => setText(event.target.value)} />
      </div>
      <p className="hint">Current status: {status.replaceAll('_', ' ')}</p>
      {message && <p role="status">{message}</p>}
      <div className="inline-actions" style={{ justifyContent: 'flex-start' }}>
        <button type="button" className="btn" disabled={pending} onClick={() => act(dirty ? 'edit_send' : 'send')}>
          {dirty ? 'Edit & send' : 'Send'}
        </button>
        <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => act('escalate')}>
          Escalate
        </button>
        <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => act('reject')}>
          Reject
        </button>
        <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => act('request_changes')}>
          Request changes
        </button>
      </div>
    </section>
  );
}
