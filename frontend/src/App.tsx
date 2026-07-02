import React, { useEffect, useCallback } from 'react';
import { useWhiteboardStore } from './store/useWhiteboardStore';
import Toolbar from './components/Toolbar';
import Sidebar from './components/Sidebar';
import SettingsPanel from './components/SettingsPanel';
import PerformanceOverlay from './components/PerformanceOverlay';
import WebcamOverlay from './components/WebcamOverlay';
import WhiteboardCanvas from './components/WhiteboardCanvas';
import StatusBar from './components/StatusBar';
import ToastProvider from './components/Toast';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { Hand, Sparkles } from 'lucide-react';

// Centralised backend URL — change once here to switch environments
const API_BASE_URL = 'http://localhost:8000';

export const App: React.FC = () => {
  const {
    calibrationState,
    setBackendStatus,
    setPerformanceMetrics,
    setFeatureFlags
  } = useWhiteboardStore();

  // Activate global keyboard shortcuts
  useKeyboardShortcuts();

  // 1. Measure Rendering Loop FPS
  useEffect(() => {
    let frameCount = 0;
    let lastTime = performance.now();
    let animId: number;

    const tick = () => {
      frameCount++;
      const now = performance.now();
      if (now - lastTime >= 1000) {
        setPerformanceMetrics({ fps: frameCount });
        frameCount = 0;
        lastTime = now;
      }
      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, []);

  // 2. Poll Backend API for System Health & Feature Flags
  const checkBackend = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/status`);
      if (response.ok) {
        const data = await response.json();
        setBackendStatus('online', data.cpu_usage_percent, data.memory_usage_percent);
        
        if (data.features) {
          setFeatureFlags({
            ai_shapes: data.features.ai_shapes,
            equation_solver: data.features.equation_solver
          });
        }
      } else {
        setBackendStatus('offline');
      }
    } catch (err) {
      setBackendStatus('offline');
    }
  }, [setBackendStatus, setFeatureFlags]);

  useEffect(() => {
    checkBackend();
    const interval = setInterval(checkBackend, 5000);
    return () => clearInterval(interval);
  }, [checkBackend]);

  return (
    <ToastProvider>
      <div className="relative w-screen h-screen bg-darkBg text-gray-100 overflow-hidden font-sans select-none">
        {/* Background Whiteboard Canvas (Spans full viewport) */}
        <WhiteboardCanvas />

        {/* Main Top Header Toolbar */}
        <Toolbar />

        {/* Developer Statistics Overlay */}
        <PerformanceOverlay />

        {/* Left Tool Panel Selector */}
        <Sidebar />

        {/* Right Settings Configuration Panel */}
        <SettingsPanel />

        {/* Mirrored Webcam Box (overlaid over canvas) */}
        <WebcamOverlay />

        {/* Bottom Status bar */}
        <StatusBar />

        {/* Interactive Calibration Guide Banner (Appears at top-center during calibration sequence) */}
        {calibrationState !== 'uncalibrated' && calibrationState !== 'calibrated' && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4">
            <div className="glass-panel p-4 rounded-2xl border border-yellow-500/30 flex items-center gap-3.5 shadow-2xl animate-bounce">
              <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center text-yellow-400">
                {calibrationState === 'calibrating_palm' ? <Hand size={20} /> : <Sparkles size={20} />}
              </div>
              <div className="flex-1 text-left">
                <span className="text-[10px] text-yellow-500 font-bold uppercase tracking-wider block">
                  {calibrationState === 'calibrating_palm' ? 'Calibration Step 1 of 2' : 'Calibration Step 2 of 2'}
                </span>
                <span className="text-xs font-semibold text-gray-200 block mt-0.5">
                  {calibrationState === 'calibrating_palm' 
                    ? 'Hold your flat palm open (✋) in front of the camera.' 
                    : 'Pinch your index finger and thumb tip together (🤏).'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </ToastProvider>
  );
};
export default App;
