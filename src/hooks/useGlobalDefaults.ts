import { useEffect, useRef, useState } from 'react';

export interface GlobalDefaults {
  hiddenMarkers: string[];
  hiddenMarkerTypes: string[];
  startupFocusMarkerId?: string;
  stopMarkerThreshold?: number;
  movementMarkerThreshold?: number;
  warpMarkerThreshold?: number;
}

/**
 * Owns the global-defaults ref (created externally so it can be shared with
 * useRoute) and loads `global_defaults.json` once on mount. After load, the
 * ref is updated and the supplied `onLoad` callback fires so the host can
 * push the new defaults into the route.
 *
 * Returns a `loaded` boolean that flips to `true` once the JSON fetch
 * resolves (success or failure). Consumers that need to react to the loaded
 * `startupFocusMarkerId` should depend on `loaded` rather than reading the
 * ref directly — refs do not trigger re-renders, so reading the ref inside
 * an effect that doesn't list `loaded` in its deps will miss the update
 * when the markers finish loading before the defaults.
 */
export function useGlobalDefaults(
  ref: React.MutableRefObject<GlobalDefaults>,
  onLoad?: (defaults: GlobalDefaults) => void
) {
  const onLoadRef = useRef(onLoad);
  onLoadRef.current = onLoad;
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`${import.meta.env.BASE_URL}global_defaults.json`)
      .then(r => r.ok ? r.json() : null)
      .then((gd: GlobalDefaults | null) => {
        if (cancelled) {
          setLoaded(true);
          return;
        }
        if (gd) {
          const normalized: GlobalDefaults = {
            hiddenMarkers: gd.hiddenMarkers || [],
            hiddenMarkerTypes: gd.hiddenMarkerTypes || [],
            startupFocusMarkerId: gd.startupFocusMarkerId,
            stopMarkerThreshold: gd.stopMarkerThreshold,
            movementMarkerThreshold: gd.movementMarkerThreshold,
            warpMarkerThreshold: gd.warpMarkerThreshold
          };
          ref.current = normalized;
          if (onLoadRef.current) onLoadRef.current(normalized);
        }
        setLoaded(true);
      })
      .catch(err => {
        console.error('Failed to load global defaults:', err);
        if (!cancelled) setLoaded(true);
      });
    return () => { cancelled = true; };
  }, [ref]);

  const setStartupFocusMarkerId = (id: string | null) => {
    ref.current = { ...ref.current, startupFocusMarkerId: id || undefined };
  };

  const setHidden = (hiddenMarkers: string[], hiddenMarkerTypes: string[]) => {
    ref.current = { ...ref.current, hiddenMarkers, hiddenMarkerTypes };
  };

  return { setStartupFocusMarkerId, setHidden, loaded } as const;
}
