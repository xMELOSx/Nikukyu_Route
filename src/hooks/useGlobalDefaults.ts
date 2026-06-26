import { useEffect, useRef } from 'react';

export interface GlobalDefaults {
  hiddenMarkers: string[];
  hiddenMarkerTypes: string[];
  startupFocusMarkerId?: string;
}

/**
 * Owns the global-defaults ref (created externally so it can be shared with
 * useRoute) and loads `global_defaults.json` once on mount. After load, the
 * ref is updated and the supplied `onLoad` callback fires so the host can
 * push the new defaults into the route.
 */
export function useGlobalDefaults(
  ref: React.MutableRefObject<GlobalDefaults>,
  onLoad?: (defaults: GlobalDefaults) => void
) {
  const onLoadRef = useRef(onLoad);
  onLoadRef.current = onLoad;

  useEffect(() => {
    let cancelled = false;
    fetch(`${import.meta.env.BASE_URL}global_defaults.json`)
      .then(r => r.ok ? r.json() : null)
      .then((gd: GlobalDefaults | null) => {
        if (cancelled || !gd) return;
        const normalized: GlobalDefaults = {
          hiddenMarkers: gd.hiddenMarkers || [],
          hiddenMarkerTypes: gd.hiddenMarkerTypes || [],
          startupFocusMarkerId: gd.startupFocusMarkerId
        };
        ref.current = normalized;
        if (onLoadRef.current) onLoadRef.current(normalized);
      })
      .catch(err => console.error('Failed to load global defaults:', err));
    return () => { cancelled = true; };
  }, [ref]);

  const setStartupFocusMarkerId = (id: string | null) => {
    ref.current = { ...ref.current, startupFocusMarkerId: id || undefined };
  };

  const setHidden = (hiddenMarkers: string[], hiddenMarkerTypes: string[]) => {
    ref.current = { ...ref.current, hiddenMarkers, hiddenMarkerTypes };
  };

  return { setStartupFocusMarkerId, setHidden } as const;
}
