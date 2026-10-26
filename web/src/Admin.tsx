import { useState } from 'react';
import { ApiError, DEMO, api, config, type AdminAccount } from './api';

const CREDIT_VALUE = 0.1;

/** Your control room: create access codes for customers and top them up after they pay. */
export function Admin() {
  const [key, setKey] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [credits, setCredits] = useState(100);
  const [created, setCreated] = useState<AdminAccount | null>(null);
  const [topUp, setTopUp] = useState<Record<string, number>>({});

  async function load(k = key) {
    try {
      setAccounts(await api.admin.list(k));
      setUnlocked(true);
      setError('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load codes.');
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    try {
      const acc = await api.admin.save(key, { name, credits });
      setCreated(acc);
      setName('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the code.');
    }
  }

  async function addCredits(code: string) {
    const amount = topUp[code] || 0;
    if (amount <= 0) return;
    try {
      await api.admin.save(key, { code, credits: amount });
      setTopUp((t) => ({ ...t, [code]: 0 }));
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add credits.');
    }
  }

  const site = location.href.split('?')[0];
  const message = created
    ? `Hi ${created.name}! Your ${config.brand} access code is ${created.code}. You have ${created.credits} credits. Open ${site}, tap Sign in and enter your code. Enjoy creating!`
    : '';

  return (
    <main className="admin">
      <header className="admin-head">
        <h1>Admin</h1>
        <a href={location.pathname}>Back to the studio</a>
      </header>

      {DEMO && <p className="banner">Demo mode. Add your server address in config.js to manage real access codes.</p>}

      {!unlocked ? (
        <form
          className="panel"
          onSubmit={(e) => {
            e.preventDefault();
            void load();
          }}
        >
          <label htmlFor="admin-key" className="field-label">
            Admin key
          </label>
          <input id="admin-key" type="password" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="current-password" />
          <button className="btn btn-primary" type="submit">
            Unlock
          </button>
          {error && <p className="hint-error">{error}</p>}
        </form>
      ) : (
        <>
          <form className="panel" onSubmit={create}>
            <h2>New customer</h2>
            <div className="row-2">
              <div>
                <label htmlFor="cust-name" className="field-label">
                  Customer name
                </label>
                <input id="cust-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Tendai Moyo" required />
              </div>
              <div>
                <label htmlFor="cust-credits" className="field-label">
                  Credits
                </label>
                <input id="cust-credits" type="number" min={0} value={credits} onChange={(e) => setCredits(Number(e.target.value))} />
                <p className="muted small">Worth US${(credits * CREDIT_VALUE).toFixed(2)} at your prices</p>
              </div>
            </div>
            <button className="btn btn-primary" type="submit">
              Create access code
            </button>
            {created && (
              <div className="created">
                <p>
                  Code for {created.name}: <strong className="code">{created.code}</strong>
                </p>
                <textarea readOnly value={message} rows={3} aria-label="Message to send" />
                <button type="button" className="btn btn-ghost" onClick={() => navigator.clipboard?.writeText(message).catch(() => {})}>
                  Copy message
                </button>
              </div>
            )}
            {error && <p className="hint-error">{error}</p>}
          </form>

          <section className="panel">
            <h2>Customers</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Code</th>
                    <th className="num">Credits left</th>
                    <th className="num">Used</th>
                    <th>Add credits</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((a) => (
                    <tr key={a.code}>
                      <td>{a.name}</td>
                      <td className="code">{a.code}</td>
                      <td className="num">{a.credits}</td>
                      <td className="num">{a.used ?? 0}</td>
                      <td>
                        <div className="topup">
                          <input
                            type="number"
                            min={0}
                            aria-label={`Credits to add for ${a.name}`}
                            value={topUp[a.code] || ''}
                            onChange={(e) => setTopUp((t) => ({ ...t, [a.code]: Number(e.target.value) }))}
                          />
                          <button className="btn btn-ghost btn-small" onClick={() => addCredits(a.code)}>
                            Add
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {accounts.length === 0 && (
                    <tr>
                      <td colSpan={5} className="muted">
                        No customers yet. Create the first access code above.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
