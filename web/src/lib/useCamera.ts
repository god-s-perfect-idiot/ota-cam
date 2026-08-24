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

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const syncVideoSizeRef = useRef<(() => void) | null>(null);
  const [facing, setFacing] = useState<Facing>('environment');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<CameraError | null>(null);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [videoSize, setVideoSize] = useState<{ width: number; height: number } | null>(
    null,
  );

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setReady(false);
    setTorchOn(false);
    setVideoSize(null);
  }, []);

  useEffect(() => {
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
      setVideoSize(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facing },
            width: { ideal: 2560 },
            height: { ideal: 1920 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const activeVideo = videoRef.current;
        if (activeVideo) {
          activeVideo.srcObject = stream;
          const syncVideoSize = () => {
            if (activeVideo.videoWidth > 0 && activeVideo.videoHeight > 0) {
              setVideoSize({
                width: activeVideo.videoWidth,
                height: activeVideo.videoHeight,
              });
            }
          };
          syncVideoSizeRef.current = syncVideoSize;
          activeVideo.addEventListener('loadedmetadata', syncVideoSize);
          activeVideo.addEventListener('resize', syncVideoSize);
          await activeVideo.play().catch(() => {
            // Autoplay can be refused until the next user gesture; the
            // viewfinder recovers as soon as the shutter is tapped.
          });
          syncVideoSize();
        }
        const track = stream.getVideoTracks()[0];
        setTorchAvailable(Boolean(track?.getCapabilities?.().torch));
        setReady(true);
      } catch (err) {
        if (!cancelled) setError(describeError(err));
      }
    }

    void start();
    return () => {
      cancelled = true;
      const video = videoRef.current;
      const syncVideoSize = syncVideoSizeRef.current;
      if (video && syncVideoSize) {
        video.removeEventListener('loadedmetadata', syncVideoSize);
        video.removeEventListener('resize', syncVideoSize);
      }
      syncVideoSizeRef.current = null;
      stop();
    };
  }, [facing, attempt, stop]);

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
