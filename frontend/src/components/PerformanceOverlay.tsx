import React, { useState } from 'react';
import { useWhiteboardStore } from '../store/useWhiteboardStore';
import { Cpu, Database, Activity, LayoutGrid, Zap, ChevronDown, ChevronUp } from 'lucide-react';

export const PerformanceOverlay: React.FC = () => {
  const {
    fps,
    gestureFps,
    wasmLatency,
    backendLatency,
    objects,
    calibrationState,
    backendStatus,
    backendCpu,
    backendMemory,
    activeSessionName
  } = useWhiteboardStore();

  const [collapsed, setCollapsed] = useState(false);

  const getStatusColor = (status: 'online' | 'offline') => {
    return status === 'online' ? 'bg-green-500' : 'bg-red-500';
  };

  return (
    <div className="absolute top-20 left-80 z-50 glass-panel rounded-xl shadow-2xl transition-all duration-300 overflow-hidden w-64">
      {/* Header — always visible, click to collapse/expand */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between px-4 py-2.5 border-b border-darkBorder hover:bg-white/5 transition-colors"
        title={collapsed ? 'Expand diagnostics' : 'Collapse diagnostics'}
      >
        <span className="text-gray-400 font-bold heading-font flex items-center gap-1.5 text-xs">
          <Activity size={14} className="text-blue-500" /> SYSTEM DIAGNOSTICS
        </span>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${getStatusColor(backendStatus)} pulse-dot`} />
            <span className="text-[10px] text-gray-500 font-semibold uppercase">{backendStatus}</span>
          </div>
          {collapsed
            ? <ChevronDown size={13} className="text-gray-500" />
            : <ChevronUp   size={13} className="text-gray-500" />
          }
        </div>
      </button>

      {/* Collapsible body */}
      {!collapsed && (
        <div className="p-4 space-y-2 text-xs font-mono text-gray-300">
          {/* Session details */}
          <div className="flex justify-between items-center bg-black/30 p-1.5 rounded border border-white/5">
            <span className="text-gray-500">Session:</span>
            <span className="text-blue-400 font-semibold truncate max-w-[120px]" title={activeSessionName}>
              {activeSessionName}
            </span>
          </div>

          {/* FPS Metrics */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-black/20 p-2 rounded border border-white/5">
              <div className="text-gray-500 text-[10px]">RENDER FPS</div>
              <div className="text-base font-bold text-green-400">{fps} <span className="text-[10px] font-normal text-gray-500">hz</span></div>
            </div>
            <div className="bg-black/20 p-2 rounded border border-white/5">
              <div className="text-gray-500 text-[10px]">GESTURE FPS</div>
              <div className="text-base font-bold text-yellow-500">{gestureFps} <span className="text-[10px] font-normal text-gray-500">hz</span></div>
            </div>
          </div>

          {/* Latency Metrics */}
          <div className="space-y-1 bg-black/20 p-2 rounded border border-white/5">
            <div className="flex justify-between items-center">
              <span className="text-gray-500 flex items-center gap-1"><Zap size={10} className="text-yellow-400" /> WASM Latency:</span>
              <span className={wasmLatency > 25 ? 'text-orange-400' : 'text-green-400'}>
                {wasmLatency.toFixed(1)} ms
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500 flex items-center gap-1"><Database size={10} className="text-blue-400" /> API Latency:</span>
              <span className={backendLatency > 150 ? 'text-red-400' : 'text-green-400'}>
                {backendLatency > 0 ? `${backendLatency.toFixed(0)} ms` : 'N/A'}
              </span>
            </div>
          </div>

          {/* Canvas & State Details */}
          <div className="space-y-1 bg-black/20 p-2 rounded border border-white/5">
            <div className="flex justify-between items-center">
              <span className="text-gray-500 flex items-center gap-1"><LayoutGrid size={10} /> Active Objects:</span>
              <span className="text-blue-400 font-bold">{objects.length}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500">Calibration:</span>
              <span className={`font-semibold ${calibrationState === 'calibrated' ? 'text-green-400' : 'text-orange-400'}`}>
                {calibrationState === 'calibrated' ? 'Active' : 'Default'}
              </span>
            </div>
          </div>

          {/* Backend Metrics */}
          {backendStatus === 'online' && (
            <div className="space-y-1 bg-black/20 p-2 rounded border border-white/5">
              <div className="flex justify-between items-center">
                <span className="text-gray-500 flex items-center gap-1"><Cpu size={10} /> Server CPU:</span>
                <span className={backendCpu > 80 ? 'text-red-400' : 'text-gray-300'}>{backendCpu.toFixed(0)}%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500 flex items-center gap-1"><Database size={10} /> Server Memory:</span>
                <span className={backendMemory > 80 ? 'text-red-400' : 'text-gray-300'}>{backendMemory.toFixed(0)}%</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
export default PerformanceOverlay;
