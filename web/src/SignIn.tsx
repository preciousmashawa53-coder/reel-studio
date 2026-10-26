import { useEffect, useRef, useState } from 'react';
import { DEMO, config } from './api';

interface Props {
  open: boolean;
  onClose: () => void;
  onSignIn: (code: string) => Promise<string | null>;
}

export function buyLink(message = `Hi! I'd like to buy credits for ${config.brand}.`) {
  return config.whatsapp ? `https://wa.me/${config.whatsapp}?text=${encodeURIComponent(message)}` : '';
}

export function SignIn({ open, onClose, onSignIn }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [code, setCode] = useState(DEMO ? 'DEMO-2026' : '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const err = await onSignIn(code);
    setBusy(false);
    if (err) setError(err);
    else {
      setError('');
      onClose();
    }
  }

  const link = buyLink();
  return (
    <dialog ref={ref} className="dialog" onClose={onClose} aria-labelledby="signin-title">
      <form onSubmit={submit}>
        <h2 id="signin-title">Sign in</h2>
        <p className="muted">Enter the access code you received when you bought credits.</p>
        <label htmlFor="code" className="field-label">
          Access code
        </label>
        <input
          id="code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="ABCD-1234"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          required
        />
        {error && <p className="hint-error">{error}</p>}
        {DEMO && <p className="muted small">Demo mode: any code works and nothing is charged.</p>}
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || code.trim().length < 4}>
            {busy ? 'Checking…' : 'Sign in'}
          </button>
        </div>
        {link && (
          <p className="small">
            No code yet?{' '}
            <a href={link} target="_blank" rel="noopener">
              Buy credits on WhatsApp
            </a>
          </p>
        )}
      </form>
    </dialog>
  );
}
