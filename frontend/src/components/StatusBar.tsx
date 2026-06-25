import React from 'react';
import { useWhiteboardStore } from '../store/useWhiteboardStore';
import { 
  Keyboard, 
  Compass 
} from 'lucide-react';

export const StatusBar: React.FC = () => {
  const {
    tool,
    calibrationState,
    calibrationData,
    objects
  } = useWhiteboardStore();

  const getToolDescription = () => {
    switch (tool) {
      case 'select':
        return 'Selection Mode: Point and Pinch to select/drag objects around the canvas';
      case 'brush':
        return 'Brush Mode: Point your index finger to write or draw in the air';
      case 'highlighter':
        return 'Highlighter Mode: Draw thick, semi-transparent strokes to emphasize content';
      case 'eraser':
        return 'Vector Eraser: Point or spread your palm over drawings to erase them';
      case 'shape':
        return 'Shape Snapping: Draw a rough sketch and AI will snap it to a perfect geometry';
      case 'text':
        return 'Text tool: Pinch anywhere on the board to overlay text boxes and type';
      case 'laser':
        return 'Laser Pointer: Move your hand to present with a fading particle trail';
    }
  };

  return (
    <div className="absolute bottom-4 left-4 right-4 z-40 glass-panel px-4 py-2 rounded-xl flex items-center justify-between text-[11px] text-gray-400 font-medium shadow-xl border border-white/5">
      {/* Active tool guide */}
      <div className="flex items-center gap-2">
        <Compass size={14} className="text-blue-500 animate-spin duration-1000" style={{ animationDuration: '8s' }} />
        <span className="text-gray-300 font-semibold">{getToolDescription()}</span>
      </div>

      {/* Info status indicators */}
      <div className="flex items-center gap-4">
        {/* Objects count */}
        <div className="flex items-center gap-1.5 bg-white/5 px-2.5 py-1 rounded-lg border border-white/5">
          <span className="text-gray-500">Elements:</span>
          <span className="text-blue-400 font-bold font-mono">{objects.length}</span>
        </div>

        {/* Calibration indicator */}
        <div className="flex items-center gap-1.5 bg-white/5 px-2.5 py-1 rounded-lg border border-white/5">
          <span className="text-gray-500">Hand Calibration:</span>
          <span className={`font-bold ${calibrationState === 'calibrated' ? 'text-green-400' : 'text-orange-400'}`}>
            {calibrationState === 'calibrated' 
              ? `CALIBRATED (${calibrationData.handSize.toFixed(0)}px)` 
              : 'DEFAULT MODEL'}
          </span>
        </div>

        {/* Shortcuts notice */}
        <div className="flex items-center gap-1.5 text-gray-500">
          <Keyboard size={13} />
          <span>Pan: Shift + Drag | Zoom: Scroll Wheel</span>
        </div>
      </div>
    </div>
  );
};
export default StatusBar;
