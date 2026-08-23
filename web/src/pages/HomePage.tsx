import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, Screen } from '../components/Layout.js';

export function HomePage() {
  const [code, setCode] = useState('');
  const navigate = useNavigate();

  return (
    <Screen>
      <Card className="w-full max-w-sm text-center">
        <p className="font-stamp text-xs uppercase tracking-[0.3em] text-film-amber">ota-cam</p>
        <h1 className="mt-3 text-2xl font-semibold">Digital disposable camera</h1>
        <p className="mt-3 text-sm leading-relaxed text-film-cream/70">
          Shoot from your phone. Every photo goes straight to the host's Google Drive. Nobody sees
          the roll until it's developed.
        </p>

        <form
          className="mt-6"
          onSubmit={(event) => {
            event.preventDefault();
            const clean = code.trim().toUpperCase();
            if (clean) navigate(`/c/${clean}`);
          }}
        >
          <input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="CAMERA CODE"
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={16}
            className="w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-center font-stamp text-lg tracking-[0.2em] outline-none placeholder:tracking-normal placeholder:text-film-cream/25 focus:border-film-amber"
          />
          <button
            type="submit"
            disabled={!code.trim()}
            className="mt-3 w-full rounded-xl bg-film-amber py-3 font-semibold text-film-black disabled:opacity-40"
          >
            Open camera
          </button>
        </form>

        <Link
          to="/admin"
          className="mt-6 inline-block text-xs uppercase tracking-widest text-film-cream/45 hover:text-film-amber"
        >
          I'm the host
        </Link>
      </Card>
    </Screen>
  );
}
