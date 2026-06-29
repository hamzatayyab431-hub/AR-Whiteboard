import { create } from 'zustand';

export type ToolType = 'brush' | 'highlighter' | 'eraser' | 'shape' | 'text' | 'laser' | 'select';
export type ShapeType = 'rect' | 'circle' | 'triangle' | 'arrow' | 'line';

export interface Point {
  x: number;
  y: number;
}

export interface StrokeObject {
  id: string;
  type: 'stroke';
  points: Point[];
  color: string;
  width: number;
  opacity: number;
}

export interface ShapeObject {
  id: string;
  type: 'shape';
  shapeType: ShapeType;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  strokeWidth: number;
}

export interface TextObject {
  id: string;
  type: 'text';
  content: string;
  x: number;
  y: number;
  color: string;
  fontSize: number;
}

export type CanvasObject = StrokeObject | ShapeObject | TextObject;

export interface CalibrationData {
  handSize: number;        // Wrist to middle finger tip length in pixels
  pinchThreshold: number;  // Calibrated tip distance for pinch trigger
}

interface WhiteboardState {
  // Whiteboard Canvas State
  objects: CanvasObject[];
  undoStack: CanvasObject[][];
  redoStack: CanvasObject[][];
  selectedObjectId: string | null;
  zoom: number;
  pan: Point;
  gridVisible: boolean;
  
  // Brush/Tool Configuration
  tool: ToolType;
  color: string;
  brushSize: number;
  opacity: number;
  selectedShapeType: ShapeType;
  
  // Tracking & Calibration State
  pointerPos: Point;
  gesture: string;
  confidence: number;
  calibrationState: 'uncalibrated' | 'calibrating_palm' | 'calibrating_pinch' | 'calibrated';
  calibrationData: CalibrationData;
  smoothingMinCutoff: number;
  smoothingBeta: number;
  
  // Performance Overlay Metrics
  fps: number;
  gestureFps: number;
  wasmLatency: number;
  backendLatency: number;
  
  // Backend & Session Meta
  activeSessionId: string;
  activeSessionName: string;
  backendStatus: 'online' | 'offline';
  backendCpu: number;
  backendMemory: number;
  showCamera: boolean;
  trackingEnabled: boolean;
  featureFlags: {
    ai_shapes: boolean;
    equation_solver: boolean;
  };
  
  // Actions
  setObjects: (objects: CanvasObject[]) => void;
  addObject: (object: CanvasObject) => void;
  updateObject: (id: string, updates: Partial<CanvasObject>) => void;
  deleteObject: (id: string) => void;
  undo: () => void;
  redo: () => void;
  clearCanvas: () => void;
  
  setTool: (tool: ToolType) => void;
  setColor: (color: string) => void;
  setBrushSize: (size: number) => void;
  setOpacity: (opacity: number) => void;
  setShapeType: (type: ShapeType) => void;
  setZoom: (zoom: number | ((z: number) => number)) => void;
  setPan: (pan: Point | ((p: Point) => Point)) => void;
  toggleGrid: () => void;
  
  setPointerPos: (pos: Point) => void;
  setGesture: (gesture: string, confidence: number) => void;
  setCalibrationState: (state: 'uncalibrated' | 'calibrating_palm' | 'calibrating_pinch' | 'calibrated') => void;
  setCalibrationData: (data: CalibrationData) => void;
  setSmoothingMinCutoff: (cutoff: number) => void;
  setSmoothingBeta: (beta: number) => void;
  
  setPerformanceMetrics: (metrics: Partial<{ fps: number; gestureFps: number; wasmLatency: number; backendLatency: number }>) => void;
  setSessionMeta: (id: string, name: string) => void;
  setBackendStatus: (status: 'online' | 'offline', cpu?: number, mem?: number) => void;
  setFeatureFlags: (flags: { ai_shapes: boolean; equation_solver: boolean }) => void;
  setShowCamera: (show: boolean) => void;
  setTrackingEnabled: (enabled: boolean) => void;
  resetSession: () => void;
}

const defaultState = {
  objects: [],
  undoStack: [],
  redoStack: [],
  selectedObjectId: null,
  zoom: 1.0,
  pan: { x: 0, y: 0 },
  gridVisible: true,
  tool: 'brush' as ToolType,
  color: '#ffffff',
  brushSize: 5,
  opacity: 1.0,
  selectedShapeType: 'rect' as ShapeType,
  pointerPos: { x: 0, y: 0 },
  gesture: 'Idle',
  confidence: 0,
  calibrationState: 'uncalibrated' as const,
  calibrationData: { handSize: 150, pinchThreshold: 30 },
  smoothingMinCutoff: 1.5,
  smoothingBeta: 0.05,
  fps: 0,
  gestureFps: 0,
  wasmLatency: 0,
  backendLatency: 0,
  activeSessionId: '',
  activeSessionName: 'Untitled Session',
  backendStatus: 'offline' as const,
  backendCpu: 0,
  backendMemory: 0,
  showCamera: true,
  trackingEnabled: true,
  featureFlags: { ai_shapes: true, equation_solver: true },
};

// Cap undo/redo history to prevent unbounded memory growth during long sessions
const MAX_HISTORY_SIZE = 50;

export const useWhiteboardStore = create<WhiteboardState>((set, get) => ({
  ...defaultState,
  
  setObjects: (objects) => set({ objects }),
  
  addObject: (object) => {
    const { objects, undoStack } = get();
    const newUndoStack = [...undoStack, objects];
    if (newUndoStack.length > MAX_HISTORY_SIZE) newUndoStack.shift();
    set({
      undoStack: newUndoStack,
      redoStack: [],
      objects: [...objects, object]
    });
  },
  
  updateObject: (id, updates) => {
    const { objects, undoStack } = get();
    // Save history prior to change
    const updatedObjects = objects.map((obj) => {
      if (obj.id === id) {
        return { ...obj, ...updates } as CanvasObject;
      }
      return obj;
    });
    const newUndoStack = [...undoStack, objects];
    if (newUndoStack.length > MAX_HISTORY_SIZE) newUndoStack.shift();
    set({
      undoStack: newUndoStack,
      redoStack: [],
      objects: updatedObjects
    });
  },
  
  deleteObject: (id) => {
    const { objects, undoStack } = get();
    const newUndoStack = [...undoStack, objects];
    if (newUndoStack.length > MAX_HISTORY_SIZE) newUndoStack.shift();
    set({
      undoStack: newUndoStack,
      redoStack: [],
      objects: objects.filter((obj) => obj.id !== id),
      selectedObjectId: null
    });
  },
  
  undo: () => {
    const { objects, undoStack, redoStack } = get();
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    const newUndo = undoStack.slice(0, -1);
    set({
      undoStack: newUndo,
      redoStack: [...redoStack, objects],
      objects: previous,
      selectedObjectId: null
    });
  },
  
  redo: () => {
    const { objects, undoStack, redoStack } = get();
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    const newRedo = redoStack.slice(0, -1);
    set({
      undoStack: [...undoStack, objects],
      redoStack: newRedo,
      objects: next,
      selectedObjectId: null
    });
  },
  
  clearCanvas: () => {
    const { objects, undoStack } = get();
    if (objects.length === 0) return;
    const newUndoStack = [...undoStack, objects];
    if (newUndoStack.length > MAX_HISTORY_SIZE) newUndoStack.shift();
    set({
      undoStack: newUndoStack,
      redoStack: [],
      objects: [],
      selectedObjectId: null
    });
  },
  
  setTool: (tool) => set({ tool, selectedObjectId: null }),
  setColor: (color) => set({ color }),
  setBrushSize: (brushSize) => set({ brushSize }),
  setOpacity: (opacity) => set({ opacity }),
  setShapeType: (selectedShapeType) => set({ selectedShapeType }),
  
  setZoom: (zoom) => {
    const nextZoom = typeof zoom === 'function' ? zoom(get().zoom) : zoom;
    // Limit zoom between 0.1 and 10
    set({ zoom: Math.max(0.1, Math.min(10, nextZoom)) });
  },
  
  setPan: (pan) => {
    const nextPan = typeof pan === 'function' ? pan(get().pan) : pan;
    set({ pan: nextPan });
  },
  
  toggleGrid: () => set((state) => ({ gridVisible: !state.gridVisible })),
  
  setPointerPos: (pointerPos) => set({ pointerPos }),
  setGesture: (gesture, confidence) => set({ gesture, confidence }),
  setCalibrationState: (calibrationState) => set({ calibrationState }),
  setCalibrationData: (calibrationData) => set({ calibrationData }),
  setSmoothingMinCutoff: (smoothingMinCutoff) => set({ smoothingMinCutoff }),
  setSmoothingBeta: (smoothingBeta) => set({ smoothingBeta }),
  
  setPerformanceMetrics: (metrics) => set((state) => ({ ...state, ...metrics })),
  
  setSessionMeta: (activeSessionId, activeSessionName) => set({ activeSessionId, activeSessionName }),
  
  setBackendStatus: (backendStatus, cpu = 0, mem = 0) => set({ 
    backendStatus, 
    backendCpu: cpu, 
    backendMemory: mem 
  }),
  
  setFeatureFlags: (featureFlags) => set({ featureFlags }),
  setShowCamera: (showCamera) => set({ showCamera }),
  setTrackingEnabled: (trackingEnabled) => set({ trackingEnabled }),
  
  resetSession: () => set({
    objects: [],
    undoStack: [],
    redoStack: [],
    activeSessionId: '',
    activeSessionName: 'Untitled Session',
    selectedObjectId: null,
    zoom: 1.0,
    pan: { x: 0, y: 0 }
  })
}));
