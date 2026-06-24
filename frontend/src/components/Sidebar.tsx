import React from 'react';
import { useWhiteboardStore } from '../store/useWhiteboardStore';
import type { ToolType, ShapeType } from '../store/useWhiteboardStore';
import { 
  Pencil, 
  Highlighter, 
  Eraser, 
  Square, 
  Circle as CircleIcon, 
  Triangle as TriangleIcon, 
  MoveRight, 
  Minus,
  Type, 
  Sparkles, 
  MousePointer, 
  Shapes 
} from 'lucide-react';

const COLORS = [
  '#ffffff', // White
  '#ef4444', // Red
  '#22c55e', // Green
  '#3b82f6', // Blue
  '#eab308', // Yellow
  '#a855f7', // Purple
  '#f97316', // Orange
];

export const Sidebar: React.FC = () => {
  const { 
    tool, 
    setTool, 
    color, 
    setColor, 
    selectedShapeType, 
    setShapeType 
  } = useWhiteboardStore();

  const handleToolClick = (newTool: ToolType) => {
    setTool(newTool);
  };

  const getToolIcon = (type: ToolType) => {
    switch (type) {
      case 'brush': return <Pencil size={20} />;
      case 'highlighter': return <Highlighter size={20} />;
      case 'eraser': return <Eraser size={20} />;
      case 'shape': return <Shapes size={20} />;
      case 'text': return <Type size={20} />;
      case 'laser': return <Sparkles size={20} />;
      case 'select': return <MousePointer size={20} />;
    }
  };

  const getShapeIcon = (shape: ShapeType) => {
    switch (shape) {
      case 'rect': return <Square size={16} />;
      case 'circle': return <CircleIcon size={16} />;
      case 'triangle': return <TriangleIcon size={16} />;
      case 'arrow': return <MoveRight size={16} />;
      case 'line': return <Minus size={16} />;
    }
  };

  const toolsList: ToolType[] = ['select', 'brush', 'highlighter', 'shape', 'text', 'laser', 'eraser'];
  const shapesList: ShapeType[] = ['rect', 'circle', 'triangle', 'arrow', 'line'];

  return (
    <div className="absolute top-24 left-4 bottom-24 z-50 flex flex-col gap-4 pointer-events-none">
      {/* Tools Sidebar Panel */}
      <div className="glass-panel p-2.5 rounded-2xl flex flex-col gap-1.5 shadow-2xl pointer-events-auto">
        {toolsList.map((t) => {
          const isActive = tool === t;
          return (
            <button
              key={t}
              onClick={() => handleToolClick(t)}
              className={`p-3 rounded-xl hover-scale flex items-center justify-center transition-all ${
                isActive 
                  ? 'bg-blue-600 text-white shadow-[0_0_15px_rgba(59,130,246,0.5)] border border-blue-400/20' 
                  : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
              }`}
              title={t.charAt(0).toUpperCase() + t.slice(1) + ' Tool'}
            >
              {getToolIcon(t)}
            </button>
          );
        })}
      </div>

      {/* Submenu for Shapes (Renders only when shape tool is active) */}
      {tool === 'shape' && (
        <div className="glass-panel p-2 rounded-2xl flex flex-col gap-1.5 shadow-xl animate-in slide-in-from-left duration-200 pointer-events-auto">
          <div className="text-[10px] text-gray-500 font-bold px-1.5 pb-1 uppercase border-b border-darkBorder mb-1">
            Shapes
          </div>
          {shapesList.map((s) => {
            const isShapeActive = selectedShapeType === s;
            return (
              <button
                key={s}
                onClick={() => setShapeType(s)}
                className={`p-2.5 rounded-lg hover-scale flex items-center gap-2 transition-all text-xs font-semibold ${
                  isShapeActive 
                    ? 'bg-blue-600/30 text-blue-400 border border-blue-500/30 shadow-[0_0_10px_rgba(59,130,246,0.15)]' 
                    : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
                }`}
                title={s.charAt(0).toUpperCase() + s.slice(1)}
              >
                {getShapeIcon(s)}
                <span className="capitalize">{s}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Quick Color Palette */}
      <div className="glass-panel p-2.5 rounded-2xl flex flex-col gap-2.5 shadow-2xl items-center pointer-events-auto">
        <div className="text-[10px] text-gray-500 font-bold uppercase border-b border-darkBorder w-full text-center pb-1 mb-0.5">
          Color
        </div>
        {COLORS.map((c) => {
          const isSelected = color.toLowerCase() === c.toLowerCase();
          return (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`w-6 h-6 rounded-full hover-scale border-2 transition-all relative ${
                isSelected 
                  ? 'border-white scale-110 shadow-[0_0_8px_var(--color-shadow)]' 
                  : 'border-transparent hover:border-white/40'
              }`}
              style={{ 
                backgroundColor: c,
                '--color-shadow': c 
              } as React.CSSProperties}
              title={c}
            >
              {isSelected && (
                <span className="absolute inset-1 rounded-full border border-black/45 bg-transparent" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
export default Sidebar;
