import { useState } from 'react';
import { Card, Screen } from './Layout.js';

interface Props {
  rollName: string;
  onSubmit: (name: string) => void;
}

/**
 * Asked once per device. The name is only used to label filenames in Drive so
 * the host can tell who shot what; there is no account of any kind.
 */
export function ShooterNamePrompt({ rollName, onSubmit }: Props) {
  const [name, setName] = useState('');

  return (
    <Screen>
      <Card className="w-full max-w-sm">
        <p className="font-stamp text-xs uppercase tracking-[0.2em] text-film-amber">
          disposable camera
        </p>
        <h1 className="mt-2 text-2xl font-semibold">{rollName}</h1>
        <p className="mt-3 text-sm leading-relaxed text-film-cream/70">
          Point, shoot, and the photo goes straight to the host's Google Drive. You won't see
          the shots afterwards — that's the whole idea.
        </p>

        <form
          className="mt-6"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit(name);
          }}
        >
          <label
            htmlFor="shooter"
            className="text-[11px] uppercase tracking-widest text-film-cream/50"
          >
            Your name (optional)
          </label>
          <input
            id="shooter"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={24}
            autoComplete="given-name"
            placeholder="e.g. Samar"
            className="mt-2 w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-base outline-none placeholder:text-film-cream/30 focus:border-film-amber"
          />
          <button
            type="submit"
            className="mt-4 w-full rounded-xl bg-film-amber py-3.5 text-base font-semibold text-film-black active:scale-[0.99]"
          >
            Pick up the camera
          </button>
        </form>
      </Card>
    </Screen>
  );
}
