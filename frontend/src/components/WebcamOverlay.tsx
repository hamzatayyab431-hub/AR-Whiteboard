import React, { useEffect, useRef, useState } from 'react';
import { useWhiteboardStore } from '../store/useWhiteboardStore';
import { useHandPose } from '../hooks/useHandPose';
import { classifyGesture, distance, getGestureDetails, GestureStabilizer } from '../utils/gestures';
import type { Landmark } from '../utils/gestures';
import { Camera, CameraOff, Sparkles, AlertCircle } from 'lucide-react';
import confetti from 'canvas-confetti';

export const WebcamOverlay: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameId = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [camError, setCamError] = useState<string | null>(null);
  
  // Temporal gesture stabilizer instance
  const stabilizerRef = useRef(new GestureStabilizer(5));

  const {
    gesture,
    setGesture,
    setPointerPos,
    calibrationState,
    setCalibrationState,
    calibrationData,
    setCalibrationData,
    showCamera,
    trackingEnabled,
    setPerformanceMetrics,
    undo,
    redo,
    clearCanvas,
    gestureFps
  } = useWhiteboardStore();

  const { isLoading: modelLoading, error: modelError, detectHands } = useHandPose();

  // Gesture holding states
  const lastGestureRef = useRef<string>('Idle');
  const gestureTimerRef = useRef<number | null>(null);
  const gestureDebounceRef = useRef<{ [key: string]: number }>({});

  // Setup Webcam Stream
  useEffect(() => {
    if (!showCamera) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        setStream(null);
      }
      return;
    }

    const startCamera = async () => {
      try {
        setCamError(null);
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: 'user'
          },
          audio: false
        });
        streamRef.current = mediaStream;
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      } catch (err: any) {
        console.error("Camera access failed:", err);
        setCamError("Camera permission denied or camera in use");
      }
    };

    startCamera();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    };
  }, [showCamera]);

  // Main processing loop
  useEffect(() => {
    let lastTime = performance.now();
    let frameCount = 0;
    let fpsInterval = setInterval(() => {
      const now = performance.now();
      const currentFps = Math.round((frameCount * 1000) / (now - lastTime));
      setPerformanceMetrics({ gestureFps: currentFps });
      frameCount = 0;
      lastTime = now;
    }, 1000);

    const processFrame = () => {
      if (!trackingEnabled || modelLoading || !videoRef.current || !canvasRef.current || videoRef.current.readyState < 2) {
        animationFrameId.current = requestAnimationFrame(processFrame);
        return;
      }

      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Sync canvas dimensions
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Run MediaPipe WASM Detection
      const timestamp = performance.now();
      const detection = detectHands(video, timestamp);
      frameCount++;

      if (detection && detection.landmarks && detection.landmarks.length > 0) {
        // We track the first hand detected
        const handLandmarks = detection.landmarks[0] as Landmark[];
        
        // 1. Draw Hand skeleton onto mirrored overlay canvas
        drawSkeleton(ctx, handLandmarks);

        // 2. Classify gesture
        const classification = classifyGesture(handLandmarks, calibrationData);
        // Stabilize the raw gesture using the temporal stabilizer
        const stabilizedGesture = stabilizerRef.current.addFrame(classification.gesture);
        setGesture(stabilizedGesture, classification.confidence);

        // 3. Process pointer position (Index finger tip is landmark 8)
        const indexTip = handLandmarks[8];
        // Mirror the X coordinate since webcam is mirrored
        const pointerX = (1 - indexTip.x);
        const pointerY = indexTip.y;
        
        if (pointerX === 0 && pointerY === 0) {
          stabilizerRef.current.reset();
          setPointerPos({ x: 0, y: 0 });
        } else {
          setPointerPos({ x: pointerX, y: pointerY });
        }

        // 4. Handle state machine (Calibration & Debounced Actions)
        handleStateEvents(stabilizedGesture, handLandmarks);
      } else {
        stabilizerRef.current.reset();
        setGesture('Idle', 0);
        setPointerPos({ x: 0, y: 0 });
      }

      animationFrameId.current = requestAnimationFrame(processFrame);
    };

    if (stream && trackingEnabled && !modelLoading) {
      animationFrameId.current = requestAnimationFrame(processFrame);
    }

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
      clearInterval(fpsInterval);
    };
  }, [stream, trackingEnabled, modelLoading, calibrationData, calibrationState]);

  // Renders joint points and connectors
  const drawSkeleton = (ctx: CanvasRenderingContext2D, landmarks: Landmark[]) => {
    const connections = [
      [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
      [0, 5], [5, 6], [6, 7], [7, 8], // Index
      [9, 10], [10, 11], [11, 12],     // Middle
      [13, 14], [14, 15], [15, 16],    // Ring
      [0, 17], [17, 18], [18, 19], [19, 20], // Pinky
      [5, 9], [9, 13], [13, 17]        // Knuckles connect
    ];

    const w = ctx.canvas.width;
    const h = ctx.canvas.height;

    // Draw lines
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.6)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    
    for (const [start, end] of connections) {
      const p1 = landmarks[start];
      const p2 = landmarks[end];
      ctx.beginPath();
      ctx.moveTo(p1.x * w, p1.y * h);
      ctx.lineTo(p2.x * w, p2.y * h);
      ctx.stroke();
    }

    // Draw dots
    for (let i = 0; i < landmarks.length; i++) {
      const p = landmarks[i];
      // Highlight tip of index finger (8) and thumb tip (4)
      if (i === 8) {
        ctx.fillStyle = '#ef4444'; // Red pointer
        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, 7, 0, 2 * Math.PI);
        ctx.fill();
      } else if (i === 4) {
        ctx.fillStyle = '#10b981'; // Green thumb
        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, 6, 0, 2 * Math.PI);
        ctx.fill();
      } else {
        ctx.fillStyle = '#3b82f6';
        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, 4, 0, 2 * Math.PI);
        ctx.fill();
      }
    }
  };

  // Handles time-based gesture triggers (Clear/Save) and single event debounces (Undo/Redo)
  const handleStateEvents = (currentGesture: string, landmarks: Landmark[]) => {
    const now = Date.now();
    const prevGesture = lastGestureRef.current;

    // A. Calibration State Machine
    if (calibrationState === 'calibrating_palm') {
      // Look for extended open palm (Eraser gesture)
      if (currentGesture === 'Eraser') {
        const wrist = landmarks[0];
        const middleTip = landmarks[12];
        const size = distance(wrist, middleTip, true) * 1000; // virtual scale
        
        // Save intermediate palm calibration
        setCalibrationData({
          handSize: size,
          pinchThreshold: 35 // default start
        });
        setCalibrationState('calibrating_pinch');
        // Vibrate or beep if possible
      }
      return;
    }

    if (calibrationState === 'calibrating_pinch') {
      // Look for pinch gesture
      if (currentGesture === 'Pinch') {
        const thumbTip = landmarks[4];
        const indexTip = landmarks[8];
        const dist = distance(thumbTip, indexTip, true) * 1000;
        
        setCalibrationData({
          handSize: calibrationData.handSize,
          pinchThreshold: Math.max(15, Math.min(80, dist * 1.3)) // add padding
        });
        setCalibrationState('calibrated');
        
        // Celebrate!
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.8, x: 0.15 }
        });
      }
      return;
    }

    // B. Gesture Transition Actions (Undo/Redo)
    if (currentGesture !== prevGesture) {
      lastGestureRef.current = currentGesture;
      
      // Debounce trigger: must have elapsed 800ms since last execution of this type
      const canTrigger = (actionKey: string) => {
        const lastExec = gestureDebounceRef.current[actionKey] || 0;
        if (now - lastExec > 1000) {
          gestureDebounceRef.current[actionKey] = now;
          return true;
        }
        return false;
      };

      if (currentGesture === 'Undo' && canTrigger('undo')) {
        undo();
      } else if (currentGesture === 'Redo' && canTrigger('redo')) {
        redo();
      }

      // Reset the 2-second hold timer if gesture changed
      if (gestureTimerRef.current) {
        gestureTimerRef.current = null;
      }
    }

    // C. Hold Gestures (Clear Canvas & Save)
    // Both need to be held for 2 seconds
    if (currentGesture === 'Clear' || currentGesture === 'Save') {
      if (!gestureTimerRef.current) {
        gestureTimerRef.current = now;
      } else {
        const heldDuration = now - gestureTimerRef.current;
        if (heldDuration >= 2000) {
          // Trigger clear/save
          if (currentGesture === 'Clear') {
            clearCanvas();
          } else if (currentGesture === 'Save') {
            // Save event is handled by parent App.tsx listening to Zustand save triggers
            // We dispatch a custom window event for simplicity
            window.dispatchEvent(new Event('trigger-session-save'));
          }
          gestureTimerRef.current = null; // reset
        }
      }
    } else {
      gestureTimerRef.current = null;
    }
  };

  if (!showCamera) return null;

  return (
    <div className="absolute bottom-4 left-4 z-40 glass-panel rounded-2xl overflow-hidden w-64 shadow-2xl border border-white/10 flex flex-col group">
      {/* Video stream viewport */}
      <div className="relative aspect-video w-full bg-black/45 overflow-hidden">
        {/* Mirror Webcam feed */}
        {stream ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover scale-x-[-1]"
          />
        ) : camError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-3 text-red-400 bg-red-950/20">
            <CameraOff size={24} className="mb-1" />
            <span className="text-[10px] font-semibold leading-normal">{camError}</span>
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-gray-500">
            <Camera size={24} className="animate-pulse mb-1" />
            <span className="text-[10px] font-semibold">Webcam Starting...</span>
          </div>
        )}

        {/* Skeleton Canvas Overlay */}
        {stream && trackingEnabled && (
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full scale-x-[-1] pointer-events-none"
          />
        )}

        {/* Loading overlay for WASM Model */}
        {modelLoading && (
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center text-center p-3 text-blue-400">
            <Sparkles className="animate-spin mb-1.5" size={24} />
            <span className="text-[10px] font-bold tracking-wider uppercase">Loading WASM Hand Tracker</span>
          </div>
        )}

        {modelError && (
          <div className="absolute inset-0 bg-red-950/80 backdrop-blur-sm flex flex-col items-center justify-center text-center p-3 text-red-300">
            <AlertCircle size={24} className="mb-1.5" />
            <span className="text-[10px] font-semibold">{modelError}</span>
          </div>
        )}
      </div>

      {/* Stats bar */}
      <div className="bg-black/40 px-3 py-2 flex items-center justify-between border-t border-white/5 text-[10px]">
        <div className="flex flex-col">
          <span className="text-gray-500 font-bold uppercase">Active Gesture</span>
          <span className="text-blue-400 font-semibold flex items-center gap-1">
            {getGestureDetails(gesture).emoji} {getGestureDetails(gesture).name}
          </span>
        </div>
        <div className="text-right">
          <span className="text-gray-500 font-bold uppercase block">FPS</span>
          <span className="text-green-400 font-semibold">{gestureFps} FPS</span>
        </div>
      </div>
    </div>
  );
};
export default WebcamOverlay;
