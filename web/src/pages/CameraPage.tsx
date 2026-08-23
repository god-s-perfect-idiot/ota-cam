import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, ApiError, type PublicRoll } from '../lib/api.js';
import { captureFrame } from '../lib/capture.js';
import { uploadQueue, type QueueStats } from '../lib/uploadQueue.js';
import { useCamera } from '../lib/useCamera.js';
import { ShutterButton } from '../components/ShutterButton.js';
import { QueueIndicator } from '../components/QueueIndicator.js';
import { ShooterNamePrompt } from '../components/ShooterNamePrompt.js';
import { Screen, Spinner } from '../components/Layout.js';

const SHOOTER_KEY = 'ota-cam:shooter';

export function CameraPage() {
  const { code = '' } = useParams();
  const [roll, setRoll] = useState<PublicRoll | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [shooter, setShooter] = useState<string | null>(() =>
    localStorage.getItem(SHOOTER_KEY),
  );
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [flashing, setFlashing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [dateStamp, setDateStamp] = useState(true);
  const [filmLook, setFilmLook] = useState(true);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const camera = useCamera();

  useEffect(() => {
    let active = true;
    api
      .getRoll(code)
      .then((data) => active && setRoll(data))
      .catch((err: unknown) =>
        active
          ? setLoadError(
              err instanceof ApiError && err.status === 404
                ? 'This camera link is not valid. Ask the host for a new one.'
                : err instanceof Error
                  ? err.message
                  : 'Could not load this camera.',
            )
          : undefined,
      );
    return () => {
      active = false;
    };
  }, [code]);

  useEffect(() => {
    if (!code) return;
    void uploadQueue.attach(code);
    const unsubscribe = uploadQueue.subscribe(setStats);
    return () => {
      unsubscribe();
      uploadQueue.detach();
    };
  }, [code]);

  const flashNotice = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 3200);
  }, []);

  const takePhoto = useCallback(async () => {
    const video = camera.videoRef.current;
    if (!video || !camera.ready || busy) return;

    setBusy(true);
    setFlashing(true);
    // Restarting the animation needs the class removed for a frame.
    setTimeout(() => setFlashing(false), 430);

    try {
      const blob = await captureFrame(video, { dateStamp, filmLook });
      await uploadQueue.enqueue(blob, shooter);
      if (navigator.vibrate) navigator.vibrate(18);
    } catch (err) {
      flashNotice(err instanceof Error ? err.message : 'Could not take the photo.');
    } finally {
      // Brief lockout so a double tap does not fire two frames of the same moment.
      setTimeout(() => setBusy(false), 350);
    }
  }, [busy, camera, dateStamp, filmLook, flashNotice, shooter]);

  // Volume-style shortcut: space or enter fires the shutter on desktop.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.code === 'Space' || event.code === 'Enter') {
        event.preventDefault();
        void takePhoto();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [takePhoto]);

  if (loadError) {
    return (
      <Screen>
        <div className="max-w-sm text-center">
          <p className="text-5xl">📷</p>
          <h1 className="mt-4 text-xl font-semibold">Camera not found</h1>
          <p className="mt-2 text-sm text-film-cream/70">{loadError}</p>
        </div>
      </Screen>
    );
  }

  if (!roll) {
    return (
      <Screen>
        <Spinner label="Loading the camera…" />
      </Screen>
    );
  }

  if (!roll.acceptingPhotos) {
    const copy: Record<string, string> = {
      closed: 'The host has wound this roll up. No more photos.',
      expired: 'This camera has expired.',
      full: 'This roll is completely used up.',
    };
    return (
      <Screen>
        <div className="max-w-sm text-center">
          <p className="text-5xl">🎞️</p>
          <h1 className="mt-4 text-xl font-semibold">{roll.name}</h1>
          <p className="mt-2 text-sm text-film-cream/70">
            {copy[roll.status] ?? 'This camera is closed.'}
          </p>
          <p className="mt-6 font-stamp text-sm text-film-amber">
            {roll.photoCount} photo{roll.photoCount === 1 ? '' : 's'} developed
          </p>
        </div>
      </Screen>
    );
  }

  if (!shooter) {
    return (
      <ShooterNamePrompt
        rollName={roll.name}
        onSubmit={(name) => {
          const trimmed = name.trim();
          if (trimmed) localStorage.setItem(SHOOTER_KEY, trimmed);
          setShooter(trimmed || 'anonymous');
        }}
      />
    );
  }

  return (
    <div className="relative flex h-full w-full flex-col bg-film-black">
      <div className="relative flex-1 overflow-hidden">
        <video
          ref={camera.videoRef}
          className="h-full w-full object-cover"
          playsInline
          muted
          autoPlay
        />

        {camera.error && (
          <div className="absolute inset-0 flex items-center justify-center bg-film-black/95 p-6">
            <div className="max-w-sm text-center">
              <h2 className="text-lg font-semibold text-film-amber">{camera.error.title}</h2>
              <p className="mt-2 text-sm text-film-cream/75">{camera.error.detail}</p>
              {camera.error.recoverable && (
                <button
                  type="button"
                  onClick={camera.retry}
                  className="mt-5 rounded-full bg-film-amber px-6 py-2.5 text-sm font-semibold text-film-black"
                >
                  Retry
                </button>
              )}
            </div>
          </div>
        )}

        {!camera.error && !camera.ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-film-black/80">
            <Spinner label="Opening the shutter…" />
          </div>
        )}

        {/* Viewfinder framing marks, purely cosmetic. */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-6 rounded-sm border border-white/15" />
          <div className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/25" />
        </div>

        {flashing && (
          <div className="animate-flash pointer-events-none absolute inset-0 bg-white" />
        )}

        <div className="absolute left-0 right-0 top-0 flex items-start justify-between p-4">
          <div className="rounded-full bg-black/45 px-3 py-1.5 backdrop-blur-sm">
            <p className="font-stamp text-xs tracking-wide text-film-amber">{roll.name}</p>
          </div>
          <QueueIndicator stats={stats} onRetry={() => void uploadQueue.retryFailed()} />
        </div>

        {notice && (
          <div className="absolute bottom-4 left-4 right-4 rounded-xl bg-black/70 p-3 text-center text-sm backdrop-blur-sm">
            {notice}
          </div>
        )}
      </div>

      <div className="shrink-0 bg-film-shell px-6 pb-4 pt-5">
        <div className="mb-4 flex items-center justify-center gap-2">
          <Toggle active={filmLook} onClick={() => setFilmLook((v) => !v)} label="Film look" />
          <Toggle active={dateStamp} onClick={() => setDateStamp((v) => !v)} label="Date stamp" />
          {camera.torchAvailable && (
            <Toggle
              active={camera.torchOn}
              onClick={() => void camera.toggleTorch()}
              label="Flash"
            />
          )}
        </div>

        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={camera.flipCamera}
            className="h-12 w-12 rounded-full border border-white/15 text-lg text-film-cream/80 active:scale-95"
            aria-label="Switch camera"
          >
            ⟳
          </button>

          <ShutterButton disabled={!camera.ready || busy} onPress={() => void takePhoto()} />

          <div className="w-12 text-right">
            <p className="font-stamp text-2xl leading-none text-film-amber">
              {String(stats?.shot ?? 0).padStart(2, '0')}
            </p>
            <p className="mt-1 text-[10px] uppercase tracking-widest text-film-cream/45">shot</p>
          </div>
        </div>

        <p className="mt-4 text-center text-[11px] leading-relaxed text-film-cream/40">
          No previews, no deleting. You'll see them when {roll.name} gets developed.
        </p>
      </div>
    </div>
  );
}

function Toggle({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider transition ${
        active
          ? 'bg-film-amber text-film-black'
          : 'border border-white/15 text-film-cream/55'
      }`}
    >
      {label}
    </button>
  );
}
