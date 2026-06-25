import React from 'react';
import { useWhiteboardStore } from '../store/useWhiteboardStore';
import { 
  Settings, 
  Eye, 
  EyeOff, 
  Hand, 
  Video, 
  ToggleLeft, 
  ToggleRight, 
  HelpCircle,
  TrendingUp
} from 'lucide-react';
import confetti from 'canvas-confetti';

export const SettingsPanel: React.FC = () => {
  const {
    brushSize,
    setBrushSize,
    opacity,
    setOpacity,
    calibrationState,
    setCalibrationState,
    calibrationData,
    setCalibrationData,
    showCamera,
    setShowCamera,
    trackingEnabled,
    setTrackingEnabled,
    featureFlags,
    setFeatureFlags,
    smoothingMinCutoff,
    setSmoothingMinCutoff,
    smoothingBeta,
    setSmoothingBeta
  } = useWhiteboardStore();

  const handleCalibrationStart = () => {
    setCalibrationState('calibrating_palm');
  };

  const handleCalibrateMockSuccess = () => {
    // Allows user to simulate calibration if they don't have a camera or just want to try it
    setCalibrationData({
      handSize: 220,
      pinchThreshold: 35
    });
    setCalibrationState('calibrated');
    confetti({
      particleCount: 80,
      spread: 60,
      origin: { y: 0.8, x: 0.85 }
    });
  };

  const toggleFeature = (key: 'ai_shapes' | 'equation_solver') => {
    setFeatureFlags({
      ...featureFlags,
      [key]: !featureFlags[key]
    });
  };

  return (
    <div className="absolute top-20 right-4 z-50 glass-panel w-72 rounded-2xl p-4 shadow-2xl flex flex-col gap-4 text-sm max-h-[85vh] overflow-y-auto">
      {/* Title */}
      <div className="flex items-center gap-2 border-b border-darkBorder pb-2.5">
        <Settings size={18} className="text-blue-500" />
        <span className="font-bold heading-font text-gray-200">SETTINGS & CONTROLS</span>
      </div>

      {/* Brush Customization */}
      <div className="flex flex-col gap-3">
        <span className="text-xs text-gray-500 font-bold uppercase tracking-wider">Brush properties</span>
        
        {/* Brush Size */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-gray-400">
            <span>Brush Size</span>
            <span className="font-bold text-blue-400">{brushSize}px</span>
          </div>
          <input 
            type="range" 
            min="1" 
            max="50" 
            value={brushSize}
            onChange={(e) => setBrushSize(parseInt(e.target.value))}
            className="w-full h-1 bg-darkBorder rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
        </div>

        {/* Brush Opacity */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-gray-400">
            <span>Opacity</span>
            <span className="font-bold text-blue-400">{Math.round(opacity * 100)}%</span>
          </div>
          <input 
            type="range" 
            min="10" 
            max="100" 
            value={opacity * 100}
            onChange={(e) => setOpacity(parseFloat(e.target.value) / 100)}
            className="w-full h-1 bg-darkBorder rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
        </div>
      </div>

      {/* Feature Flags */}
      <div className="flex flex-col gap-2.5 border-t border-darkBorder pt-3">
        <span className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-0.5">AI Engine flags</span>
        
        {/* AI Shapes Snapping */}
        <div className="flex justify-between items-center">
          <div className="flex flex-col">
            <span className="text-xs text-gray-300 font-semibold">AI Shape Snapping</span>
            <span className="text-[10px] text-gray-500">Auto-aligns messy sketches</span>
          </div>
          <button 
            onClick={() => toggleFeature('ai_shapes')}
            className="text-gray-400 hover:text-white transition-colors"
          >
            {featureFlags.ai_shapes ? (
              <ToggleRight size={28} className="text-blue-500" />
            ) : (
              <ToggleLeft size={28} className="text-gray-500" />
            )}
          </button>
        </div>

        {/* Equation Solver */}
        <div className="flex justify-between items-center">
          <div className="flex flex-col">
            <span className="text-xs text-gray-300 font-semibold">Equation Solver</span>
            <span className="text-[10px] text-gray-500">Evaluates formulas to LaTeX</span>
          </div>
          <button 
            onClick={() => toggleFeature('equation_solver')}
            className="text-gray-400 hover:text-white transition-colors"
          >
            {featureFlags.equation_solver ? (
              <ToggleRight size={28} className="text-blue-500" />
            ) : (
              <ToggleLeft size={28} className="text-gray-500" />
            )}
          </button>
        </div>
      </div>

      {/* Tracking Smoothing Settings */}
      <div className="flex flex-col gap-3 border-t border-darkBorder pt-3">
        <span className="text-xs text-gray-500 font-bold uppercase tracking-wider flex items-center gap-1">
          <TrendingUp size={12} /> Tracking filter
        </span>
        
        {/* Min Cutoff (Jitter) */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-gray-400">
            <span className="flex items-center gap-1">
              Jitter Filter
              <span title="Lower values reduce hand tremor/jitter but increase lag.">
                <HelpCircle size={10} className="text-gray-500" />
              </span>
            </span>
            <span className="font-bold text-blue-400">{smoothingMinCutoff.toFixed(2)} Hz</span>
          </div>
          <input 
            type="range" 
            min="0.05" 
            max="2.00" 
            step="0.05"
            value={smoothingMinCutoff}
            onChange={(e) => setSmoothingMinCutoff(parseFloat(e.target.value))}
            className="w-full h-1 bg-darkBorder rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
        </div>

        {/* Beta (Lag Reduction) */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-gray-400">
            <span className="flex items-center gap-1">
              Lag Reduction
              <span title="Higher values reduce tracking delay/lag at high speeds.">
                <HelpCircle size={10} className="text-gray-500" />
              </span>
            </span>
            <span className="font-bold text-blue-400">{smoothingBeta.toFixed(3)}</span>
          </div>
          <input 
            type="range" 
            min="0.001" 
            max="0.200" 
            step="0.005"
            value={smoothingBeta}
            onChange={(e) => setSmoothingBeta(parseFloat(e.target.value))}
            className="w-full h-1 bg-darkBorder rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
        </div>
      </div>

      {/* Hand Gesture Calibration */}
      <div className="flex flex-col gap-2 border-t border-darkBorder pt-3">
        <span className="text-xs text-gray-500 font-bold uppercase tracking-wider flex items-center gap-1">
          <Hand size={12} /> Gesture calibration
        </span>
        
        {calibrationState === 'uncalibrated' ? (
          <div className="flex flex-col gap-1.5">
            <p className="text-[10px] text-gray-400 leading-normal">
              Calibrate hand bounds to improve tracking precision relative to camera distance.
            </p>
            <button
              onClick={handleCalibrationStart}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-1.5 rounded-lg hover-scale text-xs shadow-md transition-all"
            >
              Start Hand Calibration
            </button>
          </div>
        ) : calibrationState === 'calibrated' ? (
          <div className="space-y-2">
            <div className="flex justify-between text-[11px] bg-green-500/10 border border-green-500/20 text-green-400 p-2 rounded-lg">
              <span>Status: Calibrated</span>
              <span className="font-mono">({calibrationData.handSize}px scale)</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={handleCalibrationStart}
                className="bg-white/5 hover:bg-white/10 text-gray-300 py-1.5 rounded-lg text-[11px] border border-darkBorder"
              >
                Recalibrate
              </button>
              <button
                onClick={() => setCalibrationState('uncalibrated')}
                className="bg-red-950/20 hover:bg-red-950/40 text-red-400 py-1.5 rounded-lg text-[11px] border border-red-900/30"
              >
                Reset
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-yellow-500/15 border border-yellow-500/30 p-2.5 rounded-lg flex flex-col gap-1.5 animate-pulse text-yellow-400">
            <span className="text-xs font-bold uppercase">
              {calibrationState === 'calibrating_palm' ? 'Step 1: Palm (✋)' : 'Step 2: Pinch (🤏)'}
            </span>
            <p className="text-[10px] leading-normal text-yellow-300/80">
              {calibrationState === 'calibrating_palm' 
                ? 'Hold your flat palm fully open in front of the camera.' 
                : 'Pinch your index finger and thumb tip together.'}
            </p>
            <button 
              onClick={handleCalibrateMockSuccess}
              className="text-[10px] text-gray-400 underline self-end hover:text-white"
            >
              Skip / Auto-Calibrate
            </button>
          </div>
        )}
      </div>

      {/* Camera & Tracking System toggles */}
      <div className="flex flex-col gap-2.5 border-t border-darkBorder pt-3">
        <span className="text-xs text-gray-500 font-bold uppercase tracking-wider flex items-center gap-1">
          <Video size={12} /> Hardware toggles
        </span>

        {/* Hand Pose Tracking Switch */}
        <div className="flex justify-between items-center text-xs">
          <span className="text-gray-300">Touchless AI Tracking</span>
          <button 
            onClick={() => setTrackingEnabled(!trackingEnabled)}
            className="p-1 rounded bg-white/5 border border-darkBorder hover:bg-white/10 text-gray-300 transition-colors"
          >
            {trackingEnabled ? 'Tracking ON' : 'Tracking OFF'}
          </button>
        </div>

        {/* Camera Overlay Switch */}
        <div className="flex justify-between items-center text-xs">
          <span className="text-gray-300">Webcam Mirror Overlay</span>
          <button
            onClick={() => setShowCamera(!showCamera)}
            className="p-1 flex items-center gap-1 rounded bg-white/5 border border-darkBorder hover:bg-white/10 text-gray-300 transition-colors"
          >
            {showCamera ? (
              <>
                <Eye size={12} /> Show Feed
              </>
            ) : (
              <>
                <EyeOff size={12} /> Hide Feed
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
export default SettingsPanel;
