/**
 * usePWAInstall — captures the `beforeinstallprompt` event so we can offer
 * an in-app install button on Android Chrome. iOS has no such event; we
 * detect standalone mode and surface a hint instead.
 */
import { useEffect, useState, useCallback } from 'react';

function isStandalone() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

export function usePWAInstall() {
  const [deferred, setDeferred] = useState(null);
  const [installed, setInstalled] = useState(isStandalone());

  useEffect(() => {
    const onPrompt = (e) => {
      e.preventDefault();
      setDeferred(e);
    };
    const onInstalled = () => { setInstalled(true); setDeferred(null); };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return false;
    deferred.prompt();
    try {
      const { outcome } = await deferred.userChoice;
      setDeferred(null);
      return outcome === 'accepted';
    } catch {
      setDeferred(null);
      return false;
    }
  }, [deferred]);

  return {
    canInstall: !!deferred,
    installed,
    install,
    isStandalone: installed,
  };
}

export default usePWAInstall;
