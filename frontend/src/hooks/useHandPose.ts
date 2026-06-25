import { useEffect, useRef, useState } from 'react';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { useWhiteboardStore } from '../store/useWhiteboardStore';

export const useHandPose = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const setPerformanceMetrics = useWhiteboardStore((s) => s.setPerformanceMetrics);

  useEffect(() => {
    let active = true;

    const initLandmarker = async () => {
      try {
        setIsLoading(true);
        // Load WebAssembly fileset resolver from CDN
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm"
        );

        if (!active) return;

        // Initialize hand landmarker with float16 model
        const landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numHands: 2,
        });

        if (!active) {
          landmarker.close();
          return;
        }

        landmarkerRef.current = landmarker;
        setIsLoading(false);
      } catch (err: any) {
        console.error("Failed to load MediaPipe Hand Landmarker WASM:", err);
        if (active) {
          setError(err?.message || "WebAssembly model initialization failed");
          setIsLoading(false);
        }
      }
    };

    initLandmarker();

    return () => {
      active = false;
      if (landmarkerRef.current) {
        landmarkerRef.current.close();
        landmarkerRef.current = null;
      }
    };
  }, []);

  const detectHands = (video: HTMLVideoElement, timestamp: number) => {
    if (!landmarkerRef.current) return null;
    
    const startTime = performance.now();
    const result = landmarkerRef.current.detectForVideo(video, timestamp);
    const latency = performance.now() - startTime;
    
    // Log latency to state store
    setPerformanceMetrics({ wasmLatency: latency });
    
    return result;
  };

  return {
    isLoading,
    error,
    detectHands,
  };
};
