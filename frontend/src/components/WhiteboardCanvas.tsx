import React, { useRef, useEffect, useState } from 'react';
import { useWhiteboardStore } from '../store/useWhiteboardStore';
import type { Point, CanvasObject, StrokeObject, ShapeObject, TextObject } from '../store/useWhiteboardStore';
import { PointSmoother } from '../utils/smoothing';
import { detectAndFitShape, getDistance } from '../utils/shapes';
import { Maximize, ZoomIn, ZoomOut } from 'lucide-react';

export const WhiteboardCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  
  const {
    objects,
    addObject,
    updateObject,
    deleteObject,
    tool,
    color,
    brushSize,
    opacity,
    selectedShapeType,
    zoom,
    setZoom,
    pan,
    setPan,
    gridVisible,
    selectedObjectId,
    pointerPos,
    gesture,
    smoothingMinCutoff,
    smoothingBeta
  } = useWhiteboardStore();

  // Local drawing/dragging states
  const [activePoints, setActivePoints] = useState<Point[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const [dragStart, setDragStart] = useState<Point>({ x: 0, y: 0 });
  const [selectedOffset, setSelectedOffset] = useState<Point>({ x: 0, y: 0 });
  const [isDraggingObject, setIsDraggingObject] = useState(false);
  const [textInput, setTextInput] = useState<{ x: number; y: number; val: string } | null>(null);
  
  // Laser Pointer fading points
  const [laserPoints, setLaserPoints] = useState<{ p: Point; age: number }[]>([]);

  // Coordinate smoother instance
  const smootherRef = useRef(new PointSmoother(0.5, 0.04));

  // Handle pointer transformations (convert 0-1 hand coordinates to screen pixels)
  const getScreenCoords = (normPos: Point) => {
    return {
      x: normPos.x * window.innerWidth,
      y: normPos.y * window.innerHeight
    };
  };

  // Convert screen coordinates to virtual infinite canvas coordinates
  const screenToCanvas = (screenX: number, screenY: number) => {
    return {
      x: (screenX - pan.x) / zoom,
      y: (screenY - pan.y) / zoom
    };
  };

  // Draws a path of points using smooth quadratic Bezier curves
  const drawBezierPath = (ctx: CanvasRenderingContext2D, points: Point[]) => {
    if (points.length < 2) return;
    ctx.moveTo(points[0].x, points[0].y);
    if (points.length === 2) {
      ctx.lineTo(points[1].x, points[1].y);
      return;
    }
    for (let i = 1; i < points.length - 1; i++) {
      const xc = (points[i].x + points[i + 1].x) / 2;
      const yc = (points[i].y + points[i + 1].y) / 2;
      ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
    }
    ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
  };

  // Sync references to state to prevent stale closure bugs in point tracking effects
  const activePointsRef = useRef<Point[]>([]);
  const isDrawingRef = useRef(false);
  const toolRef = useRef(tool);
  const colorRef = useRef(color);
  const brushSizeRef = useRef(brushSize);
  const opacityRef = useRef(opacity);
  const selectedShapeTypeRef = useRef(selectedShapeType);
  const graceTimerRef = useRef<any | null>(null);

  useEffect(() => { activePointsRef.current = activePoints; }, [activePoints]);
  useEffect(() => { isDrawingRef.current = isDrawing; }, [isDrawing]);
  useEffect(() => { toolRef.current = tool; }, [tool]);
  useEffect(() => { colorRef.current = color; }, [color]);
  useEffect(() => { brushSizeRef.current = brushSize; }, [brushSize]);
  useEffect(() => { opacityRef.current = opacity; }, [opacity]);
  useEffect(() => { selectedShapeTypeRef.current = selectedShapeType; }, [selectedShapeType]);

  // Sync PointSmoother parameters dynamically
  useEffect(() => {
    smootherRef.current.updateParams(smoothingMinCutoff, smoothingBeta);
  }, [smoothingMinCutoff, smoothingBeta]);

  // Clears any active hand-drawing grace timer on unmount
  useEffect(() => {
    return () => {
      if (graceTimerRef.current) {
        clearTimeout(graceTimerRef.current);
      }
    };
  }, []);

  // Helper to finalize the current active stroke and persist it
  const finalizeActiveStroke = () => {
    if (!isDrawingRef.current) return;
    setIsDrawing(false);
    
    const pts = activePointsRef.current;
    if (pts.length > 2) {
      const boundingBox = detectAndFitShape(pts);
      const enableShapeSnapping = useWhiteboardStore.getState().featureFlags.ai_shapes;
      
      if (toolRef.current === 'shape') {
        const shapeObj: ShapeObject = {
          id: crypto.randomUUID(),
          type: 'shape',
          ...boundingBox,
          shapeType: selectedShapeTypeRef.current,
          color: colorRef.current,
          strokeWidth: brushSizeRef.current
        };
        addObject(shapeObj);
      } else if (toolRef.current === 'brush' && enableShapeSnapping && boundingBox.shapeType !== 'line') {
        const shapeObj: ShapeObject = {
          id: crypto.randomUUID(),
          type: 'shape',
          ...boundingBox,
          color: colorRef.current,
          strokeWidth: brushSizeRef.current
        };
        addObject(shapeObj);
      } else {
        const strokeObj: StrokeObject = {
          id: crypto.randomUUID(),
          type: 'stroke',
          points: pts,
          color: colorRef.current,
          width: brushSizeRef.current,
          opacity: opacityRef.current
        };
        addObject(strokeObj);
      }
    }
    setActivePoints([]);
  };

  // 1. Core Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle resizing
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Save current transform state
    ctx.save();
    
    // Apply pan and zoom
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    // Draw Infinite grid
    if (gridVisible) {
      drawGrid(ctx, canvas.width, canvas.height);
    }

    // Draw all completed whiteboard objects
    drawObjects(ctx);

    // Draw active drawing stroke in progress
    if (isDrawing && activePoints.length > 0) {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = brushSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = opacity;
      
      drawBezierPath(ctx, activePoints);
      ctx.stroke();
    }

    // Restore context
    ctx.restore();

    // Draw Laser trails (drawn in screen space so they don't scale/pan)
    drawLaserTrail(ctx);

    // Draw Hand Pointer Cursor Overlay
    drawPointerCursor(ctx);

  }, [objects, pan, zoom, gridVisible, activePoints, isDrawing, pointerPos, laserPoints, color, brushSize, opacity]);

  // Renders the dot grid background
  const drawGrid = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.beginPath();
    ctx.fillStyle = '#262626';

    const gridSpacing = 40;
    
    // Calculate visible bounds in canvas coordinates
    const startX = Math.floor(-pan.x / zoom / gridSpacing) * gridSpacing;
    const endX = startX + Math.ceil(width / zoom / gridSpacing) * gridSpacing + gridSpacing;
    
    const startY = Math.floor(-pan.y / zoom / gridSpacing) * gridSpacing;
    const endY = startY + Math.ceil(height / zoom / gridSpacing) * gridSpacing + gridSpacing;

    for (let x = startX; x < endX; x += gridSpacing) {
      for (let y = startY; y < endY; y += gridSpacing) {
        ctx.fillRect(x - 1, y - 1, 2, 2);
      }
    }
  };

  // Draws all canvas objects
  const drawObjects = (ctx: CanvasRenderingContext2D) => {
    ctx.shadowBlur = 0; // reset shadow

    for (const obj of objects) {
      const isSelected = obj.id === selectedObjectId;
      ctx.globalAlpha = obj.type === 'stroke' ? obj.opacity : 1.0;
      ctx.strokeStyle = obj.color;
      ctx.fillStyle = obj.color;

      // Active selection highlighting glow
      if (isSelected) {
        ctx.shadowColor = 'rgba(59, 130, 246, 0.6)';
        ctx.shadowBlur = 8;
        ctx.strokeStyle = '#3b82f6';
      } else {
        ctx.shadowBlur = 0;
      }

      if (obj.type === 'stroke') {
        const points = obj.points;
        if (points.length < 2) continue;
        ctx.beginPath();
        ctx.lineWidth = obj.width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        drawBezierPath(ctx, points);
        ctx.stroke();
      } 
      
      else if (obj.type === 'shape') {
        ctx.lineWidth = obj.strokeWidth;
        const { shapeType, x, y, width: w, height: h } = obj;

        if (shapeType === 'rect') {
          ctx.beginPath();
          // Draw rect with slightly rounded corners
          ctx.roundRect(x, y, w, h, 4);
          ctx.stroke();
        } else if (shapeType === 'circle') {
          ctx.beginPath();
          const r = Math.max(Math.abs(w), Math.abs(h)) / 2;
          ctx.arc(x + w/2, y + h/2, r, 0, 2 * Math.PI);
          ctx.stroke();
        } else if (shapeType === 'triangle') {
          ctx.beginPath();
          ctx.moveTo(x + w/2, y);
          ctx.lineTo(x, y + h);
          ctx.lineTo(x + w, y + h);
          ctx.closePath();
          ctx.stroke();
        } else if (shapeType === 'line') {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + w, y + h);
          ctx.stroke();
        } else if (shapeType === 'arrow') {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + w, y + h);
          ctx.stroke();
          
          // Draw Arrowhead
          const angle = Math.atan2(h, w);
          ctx.beginPath();
          ctx.moveTo(x + w, y + h);
          ctx.lineTo(
            x + w - 15 * Math.cos(angle - Math.PI / 6),
            y + h - 15 * Math.sin(angle - Math.PI / 6)
          );
          ctx.lineTo(
            x + w - 15 * Math.cos(angle + Math.PI / 6),
            y + h - 15 * Math.sin(angle + Math.PI / 6)
          );
          ctx.closePath();
          ctx.fill();
        }
      } 
      
      else if (obj.type === 'text') {
        ctx.font = `semibold ${obj.fontSize}px Inter, sans-serif`;
        ctx.textBaseline = 'top';
        ctx.fillText(obj.content, obj.x, obj.y);
      }
    }
    
    // Reset shadow
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1.0;
  };

  // Draws laser pointer fading trails
  const drawLaserTrail = (ctx: CanvasRenderingContext2D) => {
    if (laserPoints.length === 0) return;
    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    
    for (let i = 0; i < laserPoints.length; i++) {
      const { p, age } = laserPoints[i];
      ctx.globalAlpha = Math.max(0, 1 - age / 30);
      const scr = getScreenCoords(p);
      if (i === 0) {
        ctx.moveTo(scr.x, scr.y);
      } else {
        ctx.lineTo(scr.x, scr.y);
      }
    }
    ctx.stroke();
    ctx.restore();
  };

  // Draws pointer visual indicator at index finger location
  const drawPointerCursor = (ctx: CanvasRenderingContext2D) => {
    if (pointerPos.x === 0 && pointerPos.y === 0) return;
    const scr = getScreenCoords(pointerPos);

    ctx.save();
    ctx.shadowColor = 'rgba(59, 130, 246, 0.4)';
    ctx.shadowBlur = 10;
    
    // Outer circle
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(scr.x, scr.y, 12, 0, 2 * Math.PI);
    ctx.stroke();

    // Inner dot
    ctx.fillStyle = gesture === 'Draw' ? '#ef4444' : '#3b82f6';
    ctx.beginPath();
    ctx.arc(scr.x, scr.y, 4, 0, 2 * Math.PI);
    ctx.fill();
    
    ctx.restore();
  };

  // 2. Gesture Drawing Logic (runs whenever hand pointer position changes)
  useEffect(() => {
    if (pointerPos.x === 0 && pointerPos.y === 0) {
      if (isDrawing && !graceTimerRef.current) {
        graceTimerRef.current = setTimeout(() => {
          finalizeActiveStroke();
          graceTimerRef.current = null;
        }, 250);
      }
      return;
    }
    const scr = getScreenCoords(pointerPos);
    const canvasPt = screenToCanvas(scr.x, scr.y);

    // A. Handle Drawing Mode
    if (gesture === 'Draw') {
      if (graceTimerRef.current) {
        clearTimeout(graceTimerRef.current);
        graceTimerRef.current = null;
      }

      if (!isDrawing) {
        smootherRef.current.reset();
        const smoothed = smootherRef.current.smooth(canvasPt.x, canvasPt.y);
        setIsDrawing(true);
        setActivePoints([smoothed]);
      } else {
        const smoothed = smootherRef.current.smooth(canvasPt.x, canvasPt.y);
        const lastPt = activePoints[activePoints.length - 1];
        if (lastPt && getDistance(lastPt, smoothed) > 150) {
          // Hand tracking resumed far away; finalize the previous stroke and start a new one
          finalizeActiveStroke();
          setIsDrawing(true);
          setActivePoints([smoothed]);
        } else {
          setActivePoints(prev => [...prev, smoothed]);
        }
      }
    } 
    
    // Draw gesture ended (finger lifted) - wait for grace period
    else if (isDrawing && gesture !== 'Draw') {
      if (!graceTimerRef.current) {
        graceTimerRef.current = setTimeout(() => {
          finalizeActiveStroke();
          graceTimerRef.current = null;
        }, 250);
      }
    }

    // B. Handle Eraser Gesture
    if (gesture === 'Eraser' || tool === 'eraser') {
      // Find objects near coordinates and delete them
      const eraseRadius = 30; // pixels
      const hitObj = findObjectAt(canvasPt.x, canvasPt.y, eraseRadius);
      if (hitObj) {
        deleteObject(hitObj.id);
      }
    }

    // C. Handle Laser Pointer
    if (gesture === 'Idle' && tool === 'laser') {
      setLaserPoints(prev => [...prev, { p: pointerPos, age: 0 }]);
    }

    // D. Selection Moving Mode
    if (tool === 'select' && gesture === 'Pinch') {
      if (!isDraggingObject) {
        const hit = findObjectAt(canvasPt.x, canvasPt.y, 25);
        if (hit) {
          useWhiteboardStore.setState({ selectedObjectId: hit.id });
          setIsDraggingObject(true);
          
          const objX = hit.type === 'stroke' ? hit.points[0].x : hit.x;
          const objY = hit.type === 'stroke' ? hit.points[0].y : hit.y;
          setSelectedOffset({ x: canvasPt.x - objX, y: canvasPt.y - objY });
        }
      } else if (selectedObjectId) {
        const obj = objects.find(o => o.id === selectedObjectId);
        if (obj) {
          if (obj.type === 'stroke') {
            const firstPt = obj.points[0];
            const dx = canvasPt.x - selectedOffset.x - firstPt.x;
            const dy = canvasPt.y - selectedOffset.y - firstPt.y;
            const updatedPoints = obj.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
            updateObject(selectedObjectId, { points: updatedPoints });
          } else {
            updateObject(selectedObjectId, {
              x: canvasPt.x - selectedOffset.x,
              y: canvasPt.y - selectedOffset.y
            });
          }
        }
      }
    } else if (isDraggingObject && gesture !== 'Pinch') {
      setIsDraggingObject(false);
    }

    // Text Tool Trigger
    if (tool === 'text' && gesture === 'Pinch' && !textInput) {
      setTextInput({
        x: canvasPt.x,
        y: canvasPt.y,
        val: ''
      });
    }

  }, [pointerPos, gesture]);

  // Laser Pointer decay tick
  useEffect(() => {
    const interval = setInterval(() => {
      setLaserPoints(prev => 
        prev
          .map(pt => ({ ...pt, age: pt.age + 1 }))
          .filter(pt => pt.age < 30)
      );
    }, 30);
    return () => clearInterval(interval);
  }, []);

  // Helper: Find object closest to coords
  const findObjectAt = (x: number, y: number, radius: number): CanvasObject | null => {
    // Traverse in reverse to hit the top layer first
    for (let i = objects.length - 1; i >= 0; i--) {
      const obj = objects[i];
      if (obj.type === 'stroke') {
        // Check if any point is within radius
        const hit = obj.points.some(p => getDistance(p, { x, y }) < radius + obj.width / 2);
        if (hit) return obj;
      } else if (obj.type === 'shape') {
        const { x: sx, y: sy, width: sw, height: sh } = obj;
        // Bounding box hit check with radius margin
        if (
          x >= sx - radius &&
          x <= sx + sw + radius &&
          y >= sy - radius &&
          y <= sy + sh + radius
        ) {
          return obj;
        }
      } else if (obj.type === 'text') {
        // Text box check
        const textWidth = obj.content.length * (obj.fontSize * 0.6);
        if (
          x >= obj.x - radius &&
          x <= obj.x + textWidth + radius &&
          y >= obj.y - radius &&
          y <= obj.y + obj.fontSize + radius
        ) {
          return obj;
        }
      }
    }
    return null;
  };

  // 3. Mouse drawing fallbacks & Pan-Zoom events
  const handleMouseDown = (e: React.MouseEvent) => {
    const canvasPt = screenToCanvas(e.clientX, e.clientY);
    
    // Space key drag or middle mouse click pans canvas
    if (e.button === 1 || e.shiftKey) {
      setIsDraggingCanvas(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      return;
    }

    if (graceTimerRef.current) {
      clearTimeout(graceTimerRef.current);
      graceTimerRef.current = null;
    }

    if (tool === 'select') {
      const hit = findObjectAt(canvasPt.x, canvasPt.y, 15);
      if (hit) {
        useWhiteboardStore.setState({ selectedObjectId: hit.id });
        setIsDraggingObject(true);
        const objX = hit.type === 'stroke' ? hit.points[0].x : hit.x;
        const objY = hit.type === 'stroke' ? hit.points[0].y : hit.y;
        setSelectedOffset({ x: canvasPt.x - objX, y: canvasPt.y - objY });
      } else {
        useWhiteboardStore.setState({ selectedObjectId: null });
      }
      return;
    }

    if (tool === 'text') {
      setTextInput({
        x: canvasPt.x,
        y: canvasPt.y,
        val: ''
      });
      return;
    }

    smootherRef.current.reset();
    setIsDrawing(true);
    const smoothed = smootherRef.current.smooth(canvasPt.x, canvasPt.y);
    setActivePoints([smoothed]);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const canvasPt = screenToCanvas(e.clientX, e.clientY);

    if (isDraggingCanvas) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
      return;
    }

    if (isDraggingObject && selectedObjectId) {
      const obj = objects.find(o => o.id === selectedObjectId);
      if (obj) {
        if (obj.type === 'stroke') {
          const firstPt = obj.points[0];
          const dx = canvasPt.x - selectedOffset.x - firstPt.x;
          const dy = canvasPt.y - selectedOffset.y - firstPt.y;
          const updatedPoints = obj.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
          updateObject(selectedObjectId, { points: updatedPoints });
        } else {
          updateObject(selectedObjectId, {
            x: canvasPt.x - selectedOffset.x,
            y: canvasPt.y - selectedOffset.y
          });
        }
      }
      return;
    }

    if (isDrawing) {
      const smoothed = smootherRef.current.smooth(canvasPt.x, canvasPt.y);
      setActivePoints(prev => [...prev, smoothed]);
    }

    if (tool === 'eraser' && e.buttons === 1) {
      const hit = findObjectAt(canvasPt.x, canvasPt.y, 25);
      if (hit) deleteObject(hit.id);
    }
  };

  const handleMouseUp = () => {
    setIsDraggingCanvas(false);
    setIsDraggingObject(false);
    
    if (isDrawing) {
      finalizeActiveStroke();
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomIntensity = 0.1;
    const mouseX = e.clientX;
    const mouseY = e.clientY;
    
    // Zoom centering calculations
    const canvasMouseX = (mouseX - pan.x) / zoom;
    const canvasMouseY = (mouseY - pan.y) / zoom;
    
    const nextZoom = e.deltaY < 0 
      ? zoom * (1 + zoomIntensity) 
      : zoom / (1 + zoomIntensity);
      
    const clampedZoom = Math.max(0.1, Math.min(10, nextZoom));
    
    setZoom(clampedZoom);
    setPan({
      x: mouseX - canvasMouseX * clampedZoom,
      y: mouseY - canvasMouseY * clampedZoom
    });
  };

  const handleTextSubmit = () => {
    if (textInput && textInput.val.trim().length > 0) {
      const textObj: TextObject = {
        id: crypto.randomUUID(),
        type: 'text',
        content: textInput.val,
        x: textInput.x,
        y: textInput.y,
        color,
        fontSize: brushSize * 3 + 12
      };
      addObject(textObj);
    }
    setTextInput(null);
  };

  return (
    <div 
      ref={containerRef}
      className="w-full h-full relative cursor-crosshair overflow-hidden"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
    >
      <canvas 
        ref={canvasRef}
        className="w-full h-full block"
      />

      {/* Floating Canvas Controls (Zoom/Pan shortcuts) */}
      <div className="absolute bottom-4 right-4 z-40 flex items-center gap-1.5 glass-panel p-1.5 rounded-xl shadow-lg">
        <button 
          onClick={() => setZoom(z => z * 1.2)}
          className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-all hover-scale"
          title="Zoom In"
        >
          <ZoomIn size={16} />
        </button>
        <button
          onClick={() => setZoom(z => z / 1.2)}
          className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-all hover-scale"
          title="Zoom Out"
        >
          <ZoomOut size={16} />
        </button>
        <button
          onClick={() => { setZoom(1.0); setPan({ x: 0, y: 0 }); }}
          className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-all hover-scale"
          title="Recenter Canvas"
        >
          <Maximize size={16} />
        </button>
        <span className="text-[10px] px-2 text-gray-500 font-mono font-bold">
          {Math.round(zoom * 100)}%
        </span>
      </div>

      {/* Floating text input editor */}
      {textInput && (
        <div 
          className="absolute z-50 p-2 bg-darkCard border border-darkBorder rounded-lg shadow-2xl"
          style={{ 
            left: `${textInput.x * zoom + pan.x}px`,
            top: `${textInput.y * zoom + pan.y}px`
          }}
        >
          <input 
            type="text" 
            autoFocus
            value={textInput.val}
            placeholder="Type and press Enter..."
            onChange={(e) => setTextInput({ ...textInput, val: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleTextSubmit();
              if (e.key === 'Escape') setTextInput(null);
            }}
            onBlur={handleTextSubmit}
            className="bg-transparent border-b border-blue-500/50 outline-none text-white text-sm py-1 font-semibold px-0.5"
            style={{ fontSize: `${(brushSize * 3 + 12) * zoom}px` }}
          />
        </div>
      )}
    </div>
  );
};
export default WhiteboardCanvas;
