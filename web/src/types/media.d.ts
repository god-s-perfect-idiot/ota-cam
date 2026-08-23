/**
 * The camera torch (LED "flash") is widely implemented on Android Chrome but is
 * not in the standard MediaStream typings, so declare the extra members here
 * instead of casting through `unknown` at every call site.
 */
interface MediaTrackCapabilities {
  torch?: boolean;
}

interface MediaTrackConstraintSet {
  torch?: ConstrainBoolean;
}

interface MediaTrackSupportedConstraints {
  torch?: boolean;
}
