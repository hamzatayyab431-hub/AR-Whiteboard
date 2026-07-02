import React, { useState } from 'react';
import { useWhiteboardStore } from '../store/useWhiteboardStore';
import { useToast } from './Toast';
import { 
  Undo, 
  Redo, 
  Trash2, 
  Save, 
  Sparkles, 
  Download, 
  FileText, 
  PenTool, 
  Edit3,
  Check,
  X,
  Plus
} from 'lucide-react';
import confetti from 'canvas-confetti';

const API_BASE_URL = 'http://localhost:8000';

export const Toolbar: React.FC = () => {
  const {
    objects,
    undo,
    redo,
    clearCanvas,
    addObject,
    activeSessionId,
    activeSessionName,
    setSessionMeta
  } = useWhiteboardStore();

  const { toast } = useToast();

  const [isEditingName, setIsEditingName] = useState(false);
  const [sessionNameInput, setSessionNameInput] = useState(activeSessionName);
  
  // OCR Dialog States
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrResult, setOcrResult] = useState<{ text: string; math?: { success: boolean; latex: string; result: string } } | null>(null);
  
  // Export states
  const [exportOpen, setExportOpen] = useState(false);

  const handleSaveName = () => {
    if (sessionNameInput.trim()) {
      setSessionMeta(activeSessionId || crypto.randomUUID(), sessionNameInput);
    }
    setIsEditingName(false);
  };

  // 1. Save Whiteboard Session to SQLite Backend
  const handleSaveSession = async () => {
    const sessId = activeSessionId || crypto.randomUUID();
    const name = activeSessionName || "Untitled Session";
    
    // Save to Zustand meta
    setSessionMeta(sessId, name);

    try {
      const startTime = performance.now();
      const response = await fetch(`${API_BASE_URL}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessId,
          name: name,
          objects: objects
        })
      });
      const data = await response.json();
      const duration = performance.now() - startTime;
      useWhiteboardStore.getState().setPerformanceMetrics({ backendLatency: duration });

      if (data.status === 'success') {
        confetti({
          particleCount: 100,
          spread: 60,
          origin: { y: 0.1, x: 0.5 }
        });
        toast('Session saved successfully!', 'success');
      } else {
        toast('Failed to save session: ' + (data.message ?? 'Unknown error'), 'error');
      }
    } catch (err) {
      console.error('Save failed:', err);
      toast('Backend offline. Setup connection to save session.', 'error');
    }
  };

  // Listen to gesture save triggers - use store.getState() to avoid stale closures
  React.useEffect(() => {
    const handleGestureSave = () => {
      // Always read latest state to avoid stale closure
      const store = useWhiteboardStore.getState();
      const sessId = store.activeSessionId || crypto.randomUUID();
      const name = store.activeSessionName || 'Untitled Session';
      store.setSessionMeta(sessId, name);

      fetch(`${API_BASE_URL}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessId, name, objects: store.objects })
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.status === 'success') {
            confetti({ particleCount: 100, spread: 60, origin: { y: 0.1, x: 0.5 } });
          }
        })
        .catch((err) => console.error('Gesture save failed:', err));
    };
    window.addEventListener('trigger-session-save', handleGestureSave);
    return () => window.removeEventListener('trigger-session-save', handleGestureSave);
  }, []);

  // 2. Trigger Canvas OCR & Math Solver
  const handleTriggerOCR = async () => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    if (!canvas) return;

    setOcrLoading(true);
    setOcrResult(null);

    try {
      // Export canvas containing strokes as raw transparent PNG image mask
      const imgBase64 = canvas.toDataURL('image/png');
      const startTime = performance.now();
      
      const response = await fetch(`${API_BASE_URL}/ocr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imgBase64 })
      });
      const data = await response.json();
      const duration = performance.now() - startTime;
      useWhiteboardStore.getState().setPerformanceMetrics({ backendLatency: duration });

      if (response.ok) {
        setOcrResult(data);
        toast('Handwriting recognized!', 'success');
      } else {
        toast('OCR failed: ' + data.detail, 'error');
      }
    } catch (err) {
      console.error('OCR execution failed:', err);
      toast('OCR failed. Check backend connection.', 'error');
    } finally {
      setOcrLoading(false);
    }
  };

  // 3. Export Whiteboard Canvas to File Downloads
  const handleExport = async (format: 'png' | 'jpeg' | 'svg' | 'pdf') => {
    setExportOpen(false);
    try {
      const response = await fetch(`${API_BASE_URL}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          objects: objects,
          format: format
        })
      });

      if (!response.ok) {
        throw new Error("Export request rejected");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `whiteboard.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export generation failed:', err);
      toast('Failed to export. Verify backend is running.', 'error');
    }
  };

  // Inserts OCR text onto the board
  const handleInsertOCRText = () => {
    if (!ocrResult) return;
    const txt = ocrResult.math?.success 
      ? `${ocrResult.text} = ${ocrResult.math.result}` 
      : ocrResult.text;
      
    addObject({
      id: crypto.randomUUID(),
      type: 'text',
      content: txt,
      x: window.innerWidth / 2 - 100,
      y: window.innerHeight / 2 - 20,
      color: '#3b82f6',
      fontSize: 28
    });
    setOcrResult(null);
  };

  return (
    <div className="absolute top-4 left-4 right-4 z-50 glass-panel px-4 py-2.5 rounded-2xl flex items-center justify-between shadow-2xl border border-white/10">
      {/* Brand logo & Edit Session Name */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center shadow-[0_0_12px_rgba(59,130,246,0.5)]">
            <PenTool size={16} className="text-white" />
          </div>
          <span className="font-bold tracking-tight heading-font text-white text-base">
            AR<span className="text-blue-500 font-normal">Whiteboard</span>
          </span>
        </div>

        <div className="h-5 w-[1px] bg-darkBorder" />

        {/* Editable Name */}
        {isEditingName ? (
          <div className="flex items-center gap-1.5 bg-black/35 rounded-lg border border-white/10 px-2 py-0.5">
            <input
              type="text"
              value={sessionNameInput}
              onChange={(e) => setSessionNameInput(e.target.value)}
              className="bg-transparent border-none text-sm text-gray-200 outline-none w-44 font-semibold"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveName();
                if (e.key === 'Escape') setIsEditingName(false);
              }}
            />
            <button onClick={handleSaveName} className="text-green-500 hover:text-green-400">
              <Check size={14} />
            </button>
            <button onClick={() => setIsEditingName(false)} className="text-red-500 hover:text-red-400">
              <X size={14} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 group">
            <span className="text-sm font-semibold text-gray-300">{activeSessionName}</span>
            <button
              onClick={() => { setSessionNameInput(activeSessionName); setIsEditingName(true); }}
              className="text-gray-500 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Edit3 size={13} />
            </button>
          </div>
        )}
      </div>

      {/* History Controls */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={undo}
          className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 transition-all hover-scale"
          title="Undo (Thumb + Pinky)"
        >
          <Undo size={16} />
        </button>
        <button
          onClick={redo}
          className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 transition-all hover-scale"
          title="Redo (Thumb + Index + Middle)"
        >
          <Redo size={16} />
        </button>
        <button
          onClick={clearCanvas}
          className="p-2 rounded-xl text-red-500/70 hover:text-red-400 hover:bg-red-500/10 transition-all hover-scale"
          title="Clear Canvas (Hold Fist 2s)"
        >
          <Trash2 size={16} />
        </button>
      </div>

      {/* Action Buttons (OCR, Save, Export) */}
      <div className="flex items-center gap-3">
        {/* OCR Trigger */}
        <button
          onClick={handleTriggerOCR}
          disabled={ocrLoading}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold text-xs transition-all hover-scale border ${
            ocrLoading 
              ? 'bg-blue-600/30 text-blue-300 border-blue-500/20' 
              : 'bg-blue-600 hover:bg-blue-500 text-white border-blue-500 shadow-lg shadow-blue-500/20'
          }`}
          title="Extract Text / Solve Equations (OK Gesture)"
        >
          <Sparkles size={13} className={ocrLoading ? "animate-spin" : ""} />
          <span>{ocrLoading ? "Solving..." : "OCR & Math"}</span>
        </button>

        {/* Database Save */}
        <button
          onClick={handleSaveSession}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 border border-darkBorder hover:bg-white/10 text-gray-300 font-semibold text-xs transition-all hover-scale"
          title="Save Session to Database (Victory Gesture)"
        >
          <Save size={13} />
          <span>Save Session</span>
        </button>

        {/* Export Dropdown */}
        <div className="relative">
          <button
            onClick={() => setExportOpen(!exportOpen)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 border border-darkBorder hover:bg-white/10 text-gray-300 font-semibold text-xs transition-all hover-scale"
          >
            <Download size={13} />
            <span>Export</span>
          </button>
          
          {exportOpen && (
            <div className="absolute right-0 mt-2 w-36 glass-panel rounded-xl py-1 shadow-2xl z-50 border border-white/5 animate-in fade-in duration-100">
              {['PNG', 'JPEG', 'SVG', 'PDF'].map((f) => (
                <button
                  key={f}
                  onClick={() => handleExport(f.toLowerCase() as any)}
                  className="w-full text-left px-3.5 py-1.5 text-xs text-gray-300 hover:text-white hover:bg-white/5 font-medium"
                >
                  Download .{f}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* OCR & Math Solver Results Modal */}
      {ocrResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md">
          <div className="glass-panel p-5 rounded-2xl max-w-md w-full shadow-2xl border border-white/15 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-darkBorder pb-3 mb-4">
              <span className="font-bold text-gray-200 flex items-center gap-2">
                <FileText size={18} className="text-blue-500" /> AI HANDWRITING ANALYSIS
              </span>
              <button onClick={() => setOcrResult(null)} className="text-gray-500 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Raw Text */}
              <div className="space-y-1">
                <label className="text-[10px] text-gray-500 font-bold uppercase">Recognized Text</label>
                <div className="bg-black/30 border border-white/5 p-3 rounded-lg text-sm text-gray-200 font-mono">
                  {ocrResult.text || <span className="text-gray-600 italic">No text recognized</span>}
                </div>
              </div>

              {/* Math results */}
              {ocrResult.math && (
                <div className="space-y-3 bg-blue-500/5 border border-blue-500/10 p-3 rounded-lg">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-blue-400 font-bold uppercase">Math Parser</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${ocrResult.math.success ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                      {ocrResult.math.success ? 'SOLVED' : 'PARSED'}
                    </span>
                  </div>

                  {/* LaTeX representation */}
                  <div className="space-y-1">
                    <span className="text-[10px] text-gray-500 font-semibold">LaTeX Formula:</span>
                    <div className="bg-black/40 px-2.5 py-1.5 rounded font-mono text-xs text-blue-300">
                      $${ocrResult.math.latex}$$
                    </div>
                  </div>

                  {/* Result value */}
                  {ocrResult.math.success && (
                    <div className="space-y-1">
                      <span className="text-[10px] text-gray-500 font-semibold">Evaluated Result:</span>
                      <div className="text-lg font-bold text-green-400 font-mono">
                        {ocrResult.math.result}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-5 justify-end">
              <button
                onClick={() => setOcrResult(null)}
                className="px-4 py-2 bg-white/5 border border-darkBorder hover:bg-white/10 text-gray-400 hover:text-white rounded-xl text-xs font-semibold"
              >
                Close
              </button>
              {ocrResult.text && (
                <button
                  onClick={handleInsertOCRText}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5"
                >
                  <Plus size={13} />
                  <span>Insert onto Board</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default Toolbar;
