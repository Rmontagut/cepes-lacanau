'use client';
import { useState } from 'react';

export default function Login() {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }) });
    setBusy(false);
    if (r.ok) window.location.href = '/';
    else setErr('Mot de passe incorrect.');
  }
  return (
    <main className="login">
      <form onSubmit={submit}>
        <span className="label">Carnet de cueillette</span>
        <h1>Cèpes Lacanau</h1>
        <label className="f" htmlFor="pw">Mot de passe
          <input id="pw" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required />
        </label>
        {err && <p className="banner">{err}</p>}
        <button className="btn" disabled={busy}>Entrer</button>
      </form>
    </main>
  );
}
