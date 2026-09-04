import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { api, ApiError, type AdminRoll, type AdminStatus } from '../lib/api.js';
import { Card, Screen, Spinner } from '../components/Layout.js';

export function AdminPage() {
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await api.adminStatus());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the dashboard.');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const oauthError = params.get('error');
    if (oauthError) {
      setError(describeOauthError(oauthError));
    } else if (params.get('connected')) {
      setBanner('Google Drive connected.');
    }
    if (oauthError || params.get('connected')) {
      setParams(new URLSearchParams(), { replace: true });
    }
  }, [params, setParams]);

  if (!status) {
    return (
      <Screen>
        {error ? <p className="max-w-sm text-center text-sm text-red-300">{error}</p> : <Spinner />}
      </Screen>
    );
  }

  if (!status.authenticated) {
    return <LoginForm onSuccess={refresh} />;
  }

  return (
    <div className="mx-auto min-h-full w-full max-w-2xl px-5 py-8">
      <header className="flex items-start justify-between">
        <div>
          <p className="font-stamp text-xs uppercase tracking-[0.25em] text-film-amber">
            ota-cam
          </p>
          <h1 className="mt-1 text-2xl font-semibold">Host dashboard</h1>
        </div>
        <button
          type="button"
          onClick={() => void api.logout().then(refresh)}
          className="text-xs uppercase tracking-widest text-film-cream/50 hover:text-film-cream"
        >
          Sign out
        </button>
      </header>

      {banner && (
        <p className="mt-5 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
          {banner}
        </p>
      )}
      {error && (
        <p className="mt-5 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      )}

      <DriveSection status={status} onChange={refresh} onError={setError} />

      {status.host && (
        <>
          <NewRollForm
            defaultCap={status.defaultPhotoCap ?? 500}
            onCreated={refresh}
            onError={setError}
          />
          <RollList rolls={status.rolls ?? []} onChange={refresh} onError={setError} />
        </>
      )}
    </div>
  );
}

function DriveSection({
  status,
  onChange,
  onError,
}: {
  status: AdminStatus;
  onChange: () => Promise<void>;
  onError: (message: string) => void;
}) {
  if (!status.googleConfigured) {
    return (
      <Card className="mt-6 border-amber-400/30">
        <h2 className="font-semibold text-amber-200">Google credentials missing</h2>
        <p className="mt-2 text-sm leading-relaxed text-film-cream/70">
          Set <code className="font-stamp text-film-amber">GOOGLE_CLIENT_ID</code> and{' '}
          <code className="font-stamp text-film-amber">GOOGLE_CLIENT_SECRET</code> in your{' '}
          <code className="font-stamp text-film-amber">.env</code>, then restart the server. The
          README walks through creating them in the Google Cloud console.
        </p>
      </Card>
    );
  }

  if (!status.host) {
    return (
      <Card className="mt-6">
        <h2 className="font-semibold">Connect Google Drive</h2>
        <p className="mt-2 text-sm leading-relaxed text-film-cream/70">
          Photos from every guest land in a folder in your Drive. Only files this app creates are
          accessible — the rest of your Drive stays private.
        </p>
        <a
          href="/api/auth/google"
          className="mt-4 inline-block rounded-xl bg-film-amber px-5 py-3 text-sm font-semibold text-film-black"
        >
          Connect Drive
        </a>
      </Card>
    );
  }

  return (
    <Card className="mt-6 flex items-center justify-between gap-4">
      <div>
        <p className="text-sm text-film-cream/60">Uploading to</p>
        <p className="font-medium">{status.host.email}</p>
      </div>
      <button
        type="button"
        onClick={() => {
          if (!confirm('Disconnect Drive? Existing photos stay in your Drive.')) return;
          api
            .disconnectDrive()
            .then(onChange)
            .catch((err: unknown) =>
              onError(err instanceof Error ? err.message : 'Could not disconnect.'),
            );
        }}
        className="rounded-lg border border-white/15 px-3 py-2 text-xs uppercase tracking-widest text-film-cream/60"
      >
        Disconnect
      </button>
    </Card>
  );
}

function NewRollForm({
  defaultCap,
  onCreated,
  onError,
}: {
  defaultCap: number;
  onCreated: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState('');
  const [hours, setHours] = useState('');
  const [cap, setCap] = useState('');
  const [saving, setSaving] = useState(false);

  return (
    <Card className="mt-4">
      <h2 className="font-semibold">New camera roll</h2>
      <form
        className="mt-4 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          setSaving(true);
          api
            .createRoll({
              name,
              expiresInHours: hours ? Number(hours) : null,
              photoCap: cap.trim() ? Number(cap) : null,
            })
            .then(() => {
              setName('');
              setHours('');
              setCap('');
              return onCreated();
            })
            .catch((err: unknown) =>
              onError(err instanceof Error ? err.message : 'Could not create the roll.'),
            )
            .finally(() => setSaving(false));
        }}
      >
        <Field label="Event name">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={80}
            placeholder="Rooftop party"
            className="w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 outline-none focus:border-film-amber"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Expires in (hours)" hint="blank = never">
            <input
              value={hours}
              onChange={(event) => setHours(event.target.value)}
              type="number"
              min={1}
              max={720}
              placeholder="12"
              className="w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 outline-none focus:border-film-amber"
            />
          </Field>
          <Field label="Photo cap" hint="blank = uncapped">
            <input
              value={cap}
              onChange={(event) => setCap(event.target.value)}
              type="number"
              min={1}
              max={10000}
              placeholder={String(defaultCap)}
              className="w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 outline-none focus:border-film-amber"
            />
          </Field>
        </div>
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="w-full rounded-xl bg-film-amber py-3 font-semibold text-film-black disabled:opacity-40"
        >
          {saving ? 'Loading film…' : 'Create camera'}
        </button>
      </form>
    </Card>
  );
}

function RollList({
  rolls,
  onChange,
  onError,
}: {
  rolls: AdminRoll[];
  onChange: () => Promise<void>;
  onError: (message: string) => void;
}) {
  if (rolls.length === 0) {
    return (
      <p className="mt-6 text-center text-sm text-film-cream/50">
        No cameras yet. Create one above and share the link.
      </p>
    );
  }
  return (
    <section className="mt-6 space-y-3">
      <h2 className="text-xs uppercase tracking-widest text-film-cream/45">Cameras</h2>
      {rolls.map((roll) => (
        <RollCard key={roll.id} roll={roll} onChange={onChange} onError={onError} />
      ))}
    </section>
  );
}

function RollCard({
  roll,
  onChange,
  onError,
}: {
  roll: AdminRoll;
  onChange: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const toggleQr = async () => {
    if (qr) {
      setQr(null);
      return;
    }
    try {
      setQr(
        await QRCode.toDataURL(roll.shareUrl, {
          margin: 1,
          width: 320,
          color: { dark: '#0b0a09', light: '#f6ead6' },
        }),
      );
    } catch {
      onError('Could not render the QR code.');
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(roll.shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      onError('Clipboard is blocked. Copy the link manually.');
    }
  };

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-medium">{roll.name}</h3>
          <p className="mt-1 text-xs text-film-cream/50">
            {roll.photoCap === null
              ? `${roll.photoCount} exposures · uncapped · ${statusLabel(roll)}`
              : `${roll.photoCount} of ${roll.photoCap} exposures · ${statusLabel(roll)}`}
          </p>
        </div>
        <span className="font-stamp shrink-0 text-lg text-film-amber">{roll.code}</span>
      </div>

      <p className="mt-3 break-all rounded-lg bg-black/40 px-3 py-2 font-stamp text-xs text-film-cream/70">
        {roll.shareUrl}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <SmallButton onClick={() => void copyLink()}>{copied ? 'Copied' : 'Copy link'}</SmallButton>
        <SmallButton onClick={() => void toggleQr()}>{qr ? 'Hide QR' : 'Show QR'}</SmallButton>
        <SmallButton href={roll.driveFolderUrl}>Open in Drive</SmallButton>
        <SmallButton
          onClick={() =>
            api
              .updateRoll(roll.id, { closed: !roll.closed })
              .then(onChange)
              .catch((err: unknown) =>
                onError(err instanceof Error ? err.message : 'Could not update the roll.'),
              )
          }
        >
          {roll.closed ? 'Reopen' : 'Wind up roll'}
        </SmallButton>
      </div>

      {qr && (
        <div className="mt-4 flex flex-col items-center gap-2">
          <img src={qr} alt={`QR code linking to ${roll.name}`} className="w-44 rounded-xl" />
          <p className="text-[11px] text-film-cream/45">Guests scan this to start shooting</p>
        </div>
      )}
    </Card>
  );
}

function statusLabel(roll: AdminRoll): string {
  switch (roll.status) {
    case 'open':
      return roll.expiresAt
        ? `open until ${new Date(roll.expiresAt).toLocaleString()}`
        : 'open';
    case 'closed':
      return 'wound up';
    case 'expired':
      return 'expired';
    case 'full':
      return 'roll finished';
  }
}

function SmallButton({
  children,
  onClick,
  href,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
}) {
  const className =
    'rounded-lg border border-white/15 px-3 py-2 text-xs text-film-cream/75 hover:border-film-amber hover:text-film-amber';
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {children}
    </button>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-widest text-film-cream/50">
        {label}
        {hint && <span className="ml-1 normal-case tracking-normal text-film-cream/30">({hint})</span>}
      </span>
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}

function LoginForm({ onSuccess }: { onSuccess: () => Promise<void> }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <Screen>
      <Card className="w-full max-w-sm">
        <p className="font-stamp text-xs uppercase tracking-[0.25em] text-film-amber">ota-cam</p>
        <h1 className="mt-2 text-xl font-semibold">Host sign-in</h1>
        <form
          className="mt-5"
          onSubmit={(event) => {
            event.preventDefault();
            setBusy(true);
            setError(null);
            api
              .login(password)
              .then(onSuccess)
              .catch((err: unknown) =>
                setError(
                  err instanceof ApiError ? err.message : 'Could not sign in. Try again.',
                ),
              )
              .finally(() => setBusy(false));
          }}
        >
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            placeholder="Admin password"
            className="w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 outline-none focus:border-film-amber"
          />
          {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
          <button
            type="submit"
            disabled={busy || !password}
            className="mt-4 w-full rounded-xl bg-film-amber py-3 font-semibold text-film-black disabled:opacity-40"
          >
            {busy ? 'Checking…' : 'Sign in'}
          </button>
        </form>
        <p className="mt-4 text-xs leading-relaxed text-film-cream/45">
          This is the <code className="font-stamp">ADMIN_PASSWORD</code> from your{' '}
          <code className="font-stamp">.env</code> file.
        </p>
      </Card>
    </Screen>
  );
}

function describeOauthError(code: string): string {
  switch (code) {
    case 'state_mismatch':
      return 'The sign-in attempt could not be verified. Please try connecting again.';
    case 'missing_code':
      return 'Google did not return an authorisation code. Try again.';
    case 'exchange_failed':
      return 'Could not complete the Google sign-in. Check the server logs for details.';
    case 'access_denied':
      return 'You declined the Google permission request.';
    default:
      return `Google sign-in failed (${code}).`;
  }
}
