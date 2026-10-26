import { useState } from 'react';
import { DEMO, config } from './api';
import { Admin } from './Admin';
import { Composer } from './Composer';
import { Gallery } from './Gallery';
import { SignIn, buyLink } from './SignIn';
import { Stage } from './Stage';
import { useStudio } from './useStudio';

export default function App() {
  if (new URLSearchParams(location.search).has('admin')) return <Admin />;
  return <Studio />;
}

function Studio() {
  const s = useStudio();
  const [signInOpen, setSignInOpen] = useState(false);
  const link = buyLink(
    s.account ? `Hi! I'd like to buy more ${config.brand} credits. My code is ${s.code}.` : undefined,
  );

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href={location.pathname}>
          <svg viewBox="0 0 32 32" aria-hidden="true">
            <rect x="5" y="8" width="22" height="16" rx="3.5" fill="none" stroke="currentColor" strokeWidth="2.4" />
            <path d="M14 12.5l6 3.5-6 3.5z" fill="currentColor" />
          </svg>
          {config.brand}
        </a>
        <div className="topbar-right">
          {s.account ? (
            <>
              <span className="credits" title="Credits left">
                <strong>{s.account.credits}</strong> credits
              </span>
              {link && (
                <a className="btn btn-ghost btn-small" href={link} target="_blank" rel="noopener">
                  Buy credits
                </a>
              )}
              <button className="btn btn-ghost btn-small" onClick={s.signOut}>
                Sign out
              </button>
            </>
          ) : (
            <button className="btn btn-primary btn-small" onClick={() => setSignInOpen(true)}>
              Sign in
            </button>
          )}
        </div>
      </header>

      {DEMO && (
        <p className="banner">
          Demo mode: you'll see a sample clip and no credits are charged. Connect your server in <code>config.js</code> to
          make real videos.
        </p>
      )}

      {s.error && (
        <p className="banner banner-error" role="alert">
          {s.error}{' '}
          <button className="link" onClick={() => s.setError('')}>
            Dismiss
          </button>
        </p>
      )}

      <main className="workspace">
        <Composer
          models={s.models}
          credits={s.account?.credits ?? null}
          signedIn={Boolean(s.account)}
          busy={s.busy}
          onGenerate={s.generate}
          onSignIn={() => setSignInOpen(true)}
        />
        <Stage video={s.active} status={s.activeStatus} onNew={() => s.setActiveId(null)} />
      </main>

      <Gallery videos={s.videos} activeId={s.active?.jobId ?? null} onOpen={s.setActiveId} onRemove={s.remove} />

      <footer className="foot">
        {config.brand} by <a href="https://hub.preciousmashawa.co.zw">Precious' Hub</a>. Videos are made with AI video
        models. Please don't create content that harms or impersonates real people.
      </footer>

      <SignIn open={signInOpen} onClose={() => setSignInOpen(false)} onSignIn={s.signIn} />
    </div>
  );
}
