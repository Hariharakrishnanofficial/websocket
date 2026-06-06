import { useSettingsStore }   from '../stores/settingsStore.js';
import { useConnectionStore } from '../stores/connectionStore.js';
import { Card, Field, TextInput, Toggle, Slider, Select, Button } from '@shared/ui';
import robotClient   from '../services/RobotClient.js';
import {
  HEARTBEAT_MS, DEDUPE_MS, COMMAND_TIMEOUT_MS,
} from '../services/protocol.js';

export default function SettingsScreen() {
  const { serverURL, reconnect, controller, ui,
          setServerURL, setReconnect, setController, setUI } = useSettingsStore();
  const status = useConnectionStore((s) => s.status);

  const applyServerURL = (url) => {
    setServerURL(url);
    robotClient.setServerURL(url);
  };

  return (
    <section className="flex flex-col gap-4 p-4 max-w-xl mx-auto w-full">
      <h1 className="text-lg font-semibold">Settings</h1>

      <Card className="p-4">
        <h2 className="text-sm font-semibold mb-2">Connection</h2>
        <Field label="WebSocket URL" hint={`status: ${status}`}>
          <TextInput
            value={serverURL}
            onChange={(e) => setServerURL(e.target.value)}
            onBlur={(e) => applyServerURL(e.target.value)}
            placeholder="wss://relay.example.com/ws"
          />
        </Field>
        <Toggle
          checked={reconnect.enabled}
          onChange={(v) => setReconnect({ enabled: v })}
          label="Auto-reconnect"
          hint="Re-establish on socket close with exponential backoff."
        />
        <Slider
          value={reconnect.maxBackoffMs}
          min={1000} max={30000} step={500}
          onChange={(v) => setReconnect({ maxBackoffMs: v })}
          label="Max backoff"
          format={(v) => `${(v / 1000).toFixed(1)} s`}
        />
        <div className="pt-1">
          <Button variant="ghost" onClick={() => robotClient.reconnect()}>
            Reconnect now
          </Button>
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="text-sm font-semibold mb-2">Controller</h2>
        <Slider
          value={controller.sensitivity}
          min={0} max={1} step={0.05}
          onChange={(v) => setController({ sensitivity: v })}
          label="Sensitivity (deadzone)"
          format={(v) => v.toFixed(2)}
        />
        <p className="text-[11px] text-muted mt-1">
          Reserved for future analog/gamepad input. Has no effect on
          digital direction buttons.
        </p>
      </Card>

      <Card className="p-4">
        <h2 className="text-sm font-semibold mb-2">Feedback</h2>
        <Toggle
          checked={ui.vibration}
          onChange={(v) => setUI({ vibration: v })}
          label="Vibration"
          hint="Brief haptic on press / release (Android only)."
        />
        <Toggle
          checked={ui.sound}
          onChange={(v) => setUI({ sound: v })}
          label="Click sound"
          hint="Soft WebAudio click on every press."
        />
      </Card>

      <Card className="p-4">
        <h2 className="text-sm font-semibold mb-2">Appearance</h2>
        <Select
          label="Theme"
          value={ui.theme}
          onChange={(v) => setUI({ theme: v })}
          options={[
            { value: 'dark', label: 'Dark (recommended)' },
            { value: 'auto', label: 'Follow system' },
          ]}
        />
        <Toggle
          checked={ui.debugMode}
          onChange={(v) => setUI({ debugMode: v })}
          label="Debug mode"
          hint="Show extra diagnostic overlays."
        />
      </Card>

      <Card className="p-4">
        <h2 className="text-sm font-semibold mb-2">Protocol (read-only)</h2>
        <p className="text-xs text-muted mb-2">
          Timing constants are part of the cross-layer contract with the AppSail
          relay and ESP32 firmware. Changing them at runtime would break the
          watchdog invariant.
        </p>
        <ul className="text-xs font-mono space-y-1">
          <li className="flex justify-between"><span className="text-muted">heartbeat</span><span>{HEARTBEAT_MS} ms</span></li>
          <li className="flex justify-between"><span className="text-muted">dedupe window</span><span>{DEDUPE_MS} ms</span></li>
          <li className="flex justify-between"><span className="text-muted">firmware watchdog</span><span>{COMMAND_TIMEOUT_MS} ms</span></li>
        </ul>
      </Card>
    </section>
  );
}
