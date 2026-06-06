import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppShell }            from './components/layout/AppShell.jsx';
import ControllerScreen        from './routes/ControllerScreen.jsx';
import { useRobotSocketBridge } from './hooks/useRobotSocket.js';

// Code-split the non-critical routes so the controller boots fastest.
const SettingsScreen    = lazy(() => import('./routes/SettingsScreen.jsx'));
const TelemetryScreen   = lazy(() => import('./routes/TelemetryScreen.jsx'));
const DiagnosticsScreen = lazy(() => import('./routes/DiagnosticsScreen.jsx'));
const AboutScreen       = lazy(() => import('./routes/AboutScreen.jsx'));

function ScreenFallback() {
  return (
    <div className="p-6 text-sm text-muted">Loading…</div>
  );
}

export default function App() {
  // Single bridge instance — wires RobotClient → stores for the whole app.
  useRobotSocketBridge();

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<ControllerScreen />} />
          <Route
            path="/settings"
            element={<Suspense fallback={<ScreenFallback />}><SettingsScreen /></Suspense>}
          />
          <Route
            path="/telemetry"
            element={<Suspense fallback={<ScreenFallback />}><TelemetryScreen /></Suspense>}
          />
          <Route
            path="/diagnostics"
            element={<Suspense fallback={<ScreenFallback />}><DiagnosticsScreen /></Suspense>}
          />
          <Route
            path="/about"
            element={<Suspense fallback={<ScreenFallback />}><AboutScreen /></Suspense>}
          />
          <Route path="*" element={<ControllerScreen />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
