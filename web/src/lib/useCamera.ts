import { useCallback, useEffect, useRef, useState } from 'react';

export type Facing = 'environment' | 'user';

export interface CameraError {
  title: string;
  detail: string;
  recoverable: boolean;
}

/**
 * getUserMedia is only exposed in a secure context. Phones on a LAN address
 * hit this constantly, so it is worth detecting up front and explaining.
 */
function secureContextProblem(): CameraError | null {
  if (window.isSecureContext) return null;
  return {
    title: 'Camera needs a secure connection',
    detail:
      `This page is on ${window.location.protocol}//${window.location.host}, and browsers only ` +
      'allow camera access over HTTPS (or on localhost). Open the app over HTTPS and try again.',
    recoverable: false,
  };
}

function describeError(err: unknown): CameraError {
  const name = err instanceof DOMException ? err.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return {
        title: 'Camera permission denied',
        detail:
          'Allow camera access for this site in your browser settings, then tap retry. ' +
          'On iOS Safari: AA menu → Website Settings → Camera → Allow.',
        recoverable: true,
      };
    case 'NotFoundError':
    case 'OverconstrainedError':
      return {
        title: 'No camera found',
        detail: 'This device did not report a usable camera.',
        recoverable: true,
      };
    case 'NotReadableError':
    case 'AbortError':
      return {
        title: 'Camera is busy',
        detail: 'Another app or tab is using the camera. Close it and tap retry.',
        recoverable: true,
      };
    default:
      return {
        title: 'Could not start the camera',
        detail: err instanceof Error ? err.message : 'Unknown error.',
        recoverable: true,
      };
  }
}

function detachSizeListeners(video: HTMLVideoElement | null, sync: (() => void) | null) {
  if (!video || !sync) return;
  video.removeEventListener('loadedmetadata', sync);
  video.removeEventListener('resize', sync);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function facingFromLabel(label: string): Facing | null {
  const value = label.toLowerCase();
  if (/front|user|face|selfie/.test(value)) return 'user';
  if (/back|rear|environment|world|facing back/.test(value)) return 'environment';
  return null;
}

/**
 * Pick a concrete deviceId when labels are available. facingMode alone is
 * unreliable on the first open on some Android/iOS browsers (black preview
 * until the next getUserMedia after a flip).
 */
async function deviceIdForFacing(facing: Facing): Promise<string | undefined> {
  if (!navigator.mediaDevices?.enumerateDevices) return undefined;
  const devices = await navigator.mediaDevices.enumerateDevices();
  const cameras = devices.filter((device) => device.kind === 'videoinput' && device.deviceId);
  if (cameras.length === 0) return undefined;

  // Labels are blank until after the first permission grant — only trust a
  // match when the OS actually named the camera, otherwise facingMode is safer
  // than guessing by index.
  return cameras.find((device) => facingFromLabel(device.label) === facing)?.deviceId;
}

async function openCameraStream(facing: Facing): Promise<MediaStream> {
  const deviceId = await deviceIdForFacing(facing);
  const attempts: MediaTrackConstraints[] = [];

  if (deviceId) {
    attempts.push({
      deviceId: { exact: deviceId },
      width: { ideal: 1920 },
      height: { ideal: 1440 },
    });
  }

  attempts.push(
    {
      facingMode: { exact: facing },
      width: { ideal: 1920 },
      height: { ideal: 1440 },
    },
    {
      facingMode: { ideal: facing },
      width: { ideal: 1920 },
      height: { ideal: 1440 },
    },
    { facingMode: facing },
    true,
  );

  let lastError: unknown;
  for (const video of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia({ video, audio: false });
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Could not open the camera.');
}

/** Resolve once the element has decoded at least one frame we can paint. */
async function waitForLivePreview(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
    return;
  }

  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      video.removeEventListener('loadeddata', finish);
      video.removeEventListener('playing', finish);
      resolve();
    };
    video.addEventListener('loadeddata', finish);
    video.addEventListener('playing', finish);
    window.setTimeout(finish, 1500);
  });

  // A few phones report metadata before the track actually unmutes; give the
  // hardware a beat so the first paint is not a black frame.
  for (let i = 0; i < 8; i += 1) {
    if (video.videoWidth > 0 && !video.paused && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      return;
    }
    await sleep(50);
  }
}

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const syncVideoSizeRef = useRef<(() => void) | null>(null);
  const startIdRef = useRef(0);
  const [facing, setFacing] = useState<Facing>('environment');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<CameraError | null>(null);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [videoSize, setVideoSize] = useState<{ width: number; height: number } | null>(
    null,
  );

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const attachStream = useCallback(async (video: HTMLVideoElement, stream: MediaStream) => {
    detachSizeListeners(video, syncVideoSizeRef.current);
    const syncVideoSize = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        setVideoSize({
          width: video.videoWidth,
          height: video.videoHeight,
        });
      }
    };
    syncVideoSizeRef.current = syncVideoSize;

    // iOS Safari is picky about attribute order: muted/playsInline before
    // srcObject, and a null clear before assigning a new stream.
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.srcObject = null;
    video.srcObject = stream;
    video.addEventListener('loadedmetadata', syncVideoSize);
    video.addEventListener('resize', syncVideoSize);
    syncVideoSize();

    try {
      if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
        await new Promise<void>((resolve) => {
          const onMeta = () => {
            video.removeEventListener('loadedmetadata', onMeta);
            resolve();
          };
          video.addEventListener('loadedmetadata', onMeta);
          window.setTimeout(resolve, 2000);
        });
      }
      await video.play();
    } catch {
      // Autoplay can be refused until the next user gesture; pointerdown below
      // retries play(), and flipping restarts the stream under a tap.
    }

    await waitForLivePreview(video);
    syncVideoSize();
  }, []);

  // Bind whenever the <video> appears so a stream that resolved during layout
  // still lands on the live element.
  const bindVideo = useCallback(
    (node: HTMLVideoElement | null) => {
      const previous = videoRef.current;
      if (previous && previous !== node) {
        detachSizeListeners(previous, syncVideoSizeRef.current);
        previous.srcObject = null;
      }
      videoRef.current = node;
      if (node && streamRef.current) {
        void attachStream(node, streamRef.current);
      }
    },
    [attachStream],
  );

  useEffect(() => {
    const startId = ++startIdRef.current;
    let cancelled = false;

    async function start() {
      const insecure = secureContextProblem();
      if (insecure) {
        setError(insecure);
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setError({
          title: 'Camera not supported',
          detail: 'This browser does not expose a camera API. Try Chrome or Safari.',
          recoverable: false,
        });
        return;
      }

      setError(null);
      setReady(false);
      setTorchOn(false);
      setTorchAvailable(false);
      setVideoSize(null);

      // Release the previous camera before opening another. Leaving the old
      // track live while requesting a second one is a common source of a black
      // first preview that only recovers after a flip.
      stopTracks();
      const activeVideo = videoRef.current;
      if (activeVideo) activeVideo.srcObject = null;

      try {
        const stream = await openCameraStream(facing);
        if (cancelled || startId !== startIdRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          await attachStream(video, stream);
        }
        if (cancelled || startId !== startIdRef.current) return;

        const track = stream.getVideoTracks()[0];
        setTorchAvailable(Boolean(track?.getCapabilities?.().torch));
        setReady(true);
      } catch (err) {
        if (!cancelled && startId === startIdRef.current) setError(describeError(err));
      }
    }

    void start();
    return () => {
      cancelled = true;
      detachSizeListeners(videoRef.current, syncVideoSizeRef.current);
      syncVideoSizeRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      stopTracks();
      setReady(false);
      setTorchOn(false);
      setVideoSize(null);
    };
  }, [facing, attempt, stopTracks, attachStream]);

  // Retry play on the first tap — some mobile browsers accept getUserMedia
  // without a gesture but still refuse the initial play().
  useEffect(() => {
    function resumePlayback() {
      const video = videoRef.current;
      if (!video || !streamRef.current) return;
      if (video.paused || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        void video.play().catch(() => undefined);
      }
    }
    window.addEventListener('pointerdown', resumePlayback);
    return () => window.removeEventListener('pointerdown', resumePlayback);
  }, []);

  // A backgrounded tab has its camera track muted by the OS on some phones;
  // re-acquiring on return avoids a permanently frozen viewfinder.
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === 'visible' && !streamRef.current) {
        setAttempt((n) => n + 1);
      }
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next }] });
      setTorchOn(next);
    } catch {
      setTorchAvailable(false);
    }
  }, [torchOn]);

  return {
    videoRef,
    bindVideo,
    videoSize,
    facing,
    ready,
    error,
    torchAvailable,
    torchOn,
    toggleTorch,
    flipCamera: () => setFacing((f) => (f === 'environment' ? 'user' : 'environment')),
    retry: () => setAttempt((n) => n + 1),
  };
}
