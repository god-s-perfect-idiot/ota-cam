import type { Facing } from '../lib/useCamera.js';
import { ChromeDialSwitch } from './ChromeDialSwitch.js';

interface Props {
  facing: Facing;
  onClick: () => void;
}

/**
 * Front/back camera control using the shared chrome dial switch.
 */
export function FlipCameraButton({ facing, onClick }: Props) {
  const front = facing === 'user';

  return (
    <ChromeDialSwitch
      label="flip"
      active={front}
      onClick={onClick}
      ariaLabel={front ? 'Switch to rear camera' : 'Switch to front camera'}
    />
  );
}
