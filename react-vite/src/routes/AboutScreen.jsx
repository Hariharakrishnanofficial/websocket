import { Card, Button } from '@shared/ui';
import { usePWAInstall } from '@shared/hooks';

const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
const BUILD_TIME  = typeof __BUILD_TIME__  !== 'undefined' ? __BUILD_TIME__  : '';

export default function AboutScreen() {
  const { canInstall, install, isStandalone } = usePWAInstall();
  return (
    <section className="flex flex-col gap-4 p-4 max-w-xl mx-auto w-full">
      <h1 className="text-lg font-semibold">About</h1>

      <Card className="p-4">
        <h2 className="text-sm font-semibold">Robot Controller</h2>
        <p className="text-xs text-muted mt-1">
          Realtime PWA for ESP32 robots via Catalyst AppSail WebSocket relay.
          One ASCII byte per command, 300 ms heartbeat, fail-safe STOP on
          release / blur / hide.
        </p>
        <ul className="text-xs font-mono mt-3 space-y-1">
          <li className="flex justify-between"><span className="text-muted">version</span><span>{APP_VERSION}</span></li>
          <li className="flex justify-between"><span className="text-muted">built</span><span>{BUILD_TIME || 'dev'}</span></li>
          <li className="flex justify-between"><span className="text-muted">standalone</span><span>{isStandalone ? 'yes' : 'no'}</span></li>
        </ul>
      </Card>

      <Card className="p-4">
        <h2 className="text-sm font-semibold mb-2">Install</h2>
        {isStandalone ? (
          <p className="text-xs text-muted">App is already installed.</p>
        ) : canInstall ? (
          <Button onClick={install}>Install on this device</Button>
        ) : (
          <p className="text-xs text-muted">
            On iOS: tap the share button in Safari, then “Add to Home Screen”.
            On Android: use the browser menu’s “Install app” option.
          </p>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="text-sm font-semibold mb-2">Protocol</h2>
        <p className="text-xs text-muted">
          F / B / L / R / S commands. Heartbeat 300 ms, dedupe 250 ms (STOP never
          deduped), firmware watchdog 750 ms. See <code>CORE_LOGIC.md</code> in
          the repository for the full contract.
        </p>
      </Card>
    </section>
  );
}
