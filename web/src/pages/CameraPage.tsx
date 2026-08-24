import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, ApiError, type PublicRoll } from '../lib/api.js';
import { captureFrame } from '../lib/capture.js';
import { uploadQueue, type QueueStats } from '../lib/uploadQueue.js';
import { useCamera } from '../lib/useCamera.js';
import { ShutterButton } from '../components/ShutterButton.js';
import { FlipCameraButton } from '../components/FlipCameraButton.js';
import { VintageDial } from '../components/VintageDial.js';
import { FilmCounter } from '../components/FilmCounter.js';
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
    setTimeout(() => setFlashing(false), 430);

    try {
      const blob = await captureFrame(video, { dateStamp: true, filmLook });
      await uploadQueue.enqueue(blob, shooter);
      if (navigator.vibrate) navigator.vibrate(18);
    } catch (err) {
      flashNotice(err instanceof Error ? err.message : 'Could not take the photo.');
    } finally {
      setTimeout(() => setBusy(false), 350);
    }
  }, [busy, camera, filmLook, flashNotice, shooter]);

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
    <div className="texture-body relative flex h-full w-full flex-col">
      {/* Top metal strip — brand plate */}
      <div className="texture-metal relative z-10 shrink-0 px-4 py-2.5 shadow-[0_2px_8px_rgba(0,0,0,0.5)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {/* Viewfinder bump */}
            <div className="h-[18px] w-[28px] rounded-sm bg-gradient-to-b from-[#0a0806] to-[#1a1612] shadow-[inset_0_1px_3px_rgba(0,0,0,0.8)]" />
            <div>
              <p className="font-stamp text-[10px] uppercase tracking-[0.25em] text-film-cream/50">
                ota-cam
              </p>
              <p className="font-stamp text-xs tracking-wide text-film-amber">{roll.name}</p>
            </div>
          </div>
          <QueueIndicator stats={stats} onRetry={() => void uploadQueue.retryFailed()} />
        </div>
      </div>

      {/* Viewfinder housing */}
      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-3 pt-3">
        {/* Outer bezel — locked to camera sensor aspect ratio */}
        <div
          className="texture-metal relative flex w-full max-h-full flex-col rounded-lg p-[3px] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_4px_12px_rgba(0,0,0,0.5)]"
          style={
            camera.videoSize
              ? {
                  aspectRatio: `${camera.videoSize.width} / ${camera.videoSize.height}`,
                }
              : { flex: 1 }
          }
        >
          {/* Inner recess */}
          <div className="relative flex flex-1 overflow-hidden rounded-[5px] bg-[#0a0806] shadow-[inset_0_3px_10px_rgba(0,0,0,0.8)]">
            <video
              ref={camera.videoRef}
              className="h-full w-full object-contain"
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

            {/* Viewfinder overlays */}
            <div className="grain-overlay viewfinder-vignette pointer-events-none absolute inset-0">
              {/* Corner brackets */}
              <div className="absolute inset-4">
                <span className="absolute left-0 top-0 h-4 w-4 border-l-2 border-t-2 border-film-cream/20" />
                <span className="absolute right-0 top-0 h-4 w-4 border-r-2 border-t-2 border-film-cream/20" />
                <span className="absolute bottom-0 left-0 h-4 w-4 border-b-2 border-l-2 border-film-cream/20" />
                <span className="absolute bottom-0 right-0 h-4 w-4 border-b-2 border-r-2 border-film-cream/20" />
              </div>

              {/* Center focus circle */}
              <div className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-film-cream/15" />
              <div className="absolute left-1/2 top-1/2 h-[3px] w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-film-cream/20" />

              {/* Distance scale marks (left edge) */}
              <div className="absolute bottom-6 left-3 flex flex-col gap-[6px]">
                {[1, 2, 3].map((n) => (
                  <span
                    key={n}
                    className="block h-[1px] bg-film-cream/15"
                    style={{ width: `${6 + n * 3}px` }}
                  />
                ))}
              </div>
            </div>

            {flashing && (
              <div className="animate-flash pointer-events-none absolute inset-0 bg-white" />
            )}

            {notice && (
              <div className="absolute bottom-3 left-3 right-3 rounded-sm bg-black/75 p-2.5 text-center font-stamp text-xs backdrop-blur-sm">
                {notice}
              </div>
            )}
          </div>
        </div>

        {/* Lens ring label below viewfinder */}
        <div className="mt-1.5 flex items-center justify-center gap-3 pb-1">
          <span className="font-stamp text-[8px] uppercase tracking-[0.3em] text-film-cream/25">
            35mm
          </span>
          <span className="h-[3px] w-[3px] rounded-full bg-film-cream/15" />
          <span className="font-stamp text-[8px] uppercase tracking-[0.3em] text-film-cream/25">
            f/2.8
          </span>
        </div>
      </div>

      {/* Control panel — leather texture */}
      <div className="texture-leather relative shrink-0 px-5 pb-5 pt-4 shadow-[0_-4px_16px_rgba(0,0,0,0.4)]">
        {/* Stitching detail along top edge */}
        <div className="absolute left-4 right-4 top-2 flex justify-between">
          {Array.from({ length: 12 }).map((_, i) => (
            <span key={i} className="h-[3px] w-[3px] rounded-full bg-film-cream/[0.06]" />
          ))}
        </div>

        {/* Shutter row */}
        <div className="flex items-end justify-between px-2 pt-2">
          <div className="flex items-end gap-4">
            <FlipCameraButton onClick={camera.flipCamera} />
            {camera.torchAvailable && (
              <VintageDial
                label="flash"
                active={camera.torchOn}
                onClick={() => void camera.toggleTorch()}
              />
            )}
          </div>

          <ShutterButton disabled={!camera.ready || busy} onPress={() => void takePhoto()} />

          <div className="flex flex-col items-center gap-1">
            <VintageDial
              label="vintage"
              active={filmLook}
              onClick={() => setFilmLook((v) => !v)}
            />
            <FilmCounter count={stats?.shot ?? 0} />
          </div>
        </div>
      </div>
    </div>
  );
}
