import type { CalibrationData } from '../store/useWhiteboardStore';

export interface Landmark {
  x: number;
  y: number;
  z: number;
}

// Helper to calculate Euclidean distance in 2D or 3D
export function distance(p1: Landmark, p2: Landmark, use3D = false): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  const dz = use3D ? p1.z - p2.z : 0;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Classifies a set of 21 hand landmarks into a specific gesture.
 * Uses 2D normalized coordinate projections to prevent webcam Z-depth noise.
 */
export function classifyGesture(
  rawLandmarks: Landmark[],
  calibration: CalibrationData
): { gesture: string; confidence: number } {
  if (!rawLandmarks || rawLandmarks.length < 21) {
    return { gesture: 'Idle', confidence: 0 };
  }

  // Work with scaled 2D landmarks (mapping to a 1000x1000 virtual space)
  const l = rawLandmarks.map((pt) => ({
    x: pt.x * 1000,
    y: pt.y * 1000,
    z: (pt.z || 0) * 1000,
  }));

  // Define key joints
  const wrist = l[0];
  const thumbMCP = l[2];
  const thumbIP = l[3];
  const thumbTip = l[4];

  // Finger MCPs (Knuckles)
  const indexMCP = l[5];
  const middleMCP = l[9];
  const ringMCP = l[13];
  const pinkyMCP = l[17];

  // Finger PIPs
  const indexPIP = l[6];
  const middlePIP = l[10];
  const ringPIP = l[14];
  const pinkyPIP = l[18];

  // Finger Tips
  const indexTip = l[8];
  const middleTip = l[12];
  const ringTip = l[16];
  const pinkyTip = l[20];

  // Calculate hand scale baseline (wrist to middle MCP)
  const handScale = Math.max(20, distance(wrist, middleMCP, false));
  
  // Adjust thresholds based on calibration ratio
  const scaleRatio = handScale / (calibration.handSize || 150);
  const calibratedPinchThreshold = (calibration.pinchThreshold || 30) * scaleRatio;

  // Finger extension is calculated using 2D tip-to-knuckle vs PIP-to-knuckle ratio
  // Using 2D prevents Z-depth estimation noise from single webcam feed
  const indexRatio = distance(indexMCP, indexTip, false) / Math.max(1, distance(indexMCP, indexPIP, false));
  const middleRatio = distance(middleMCP, middleTip, false) / Math.max(1, distance(middleMCP, middlePIP, false));
  const ringRatio = distance(ringMCP, ringTip, false) / Math.max(1, distance(ringMCP, ringPIP, false));
  const pinkyRatio = distance(pinkyMCP, pinkyTip, false) / Math.max(1, distance(pinkyMCP, pinkyPIP, false));

  const isIndexExtended = indexRatio > 1.25;
  const isMiddleExtended = middleRatio > 1.25;
  const isRingExtended = ringRatio > 1.25;
  const isPinkyExtended = pinkyRatio > 1.25;

  // Thumb extension using 2D distance ratio from wrist
  const thumbTipDist = distance(thumbTip, wrist, false);
  const thumbMCPDist = distance(thumbMCP, wrist, false);
  const isThumbExtended = thumbTipDist > thumbMCPDist * 1.15;

  // Distances between Tips for Pinches/OK gestures
  const thumbIndexDist = distance(thumbTip, indexTip, false);
  const isPinching = thumbIndexDist < Math.max(25, calibratedPinchThreshold);

  // --- GESTURE CLASSIFICATION RULES ---

  // A. OCR (OK Gesture: Thumb + Index pinching with middle + ring + pinky extended)
  if (isPinching && isMiddleExtended && isRingExtended) {
    return { gesture: 'OCR', confidence: 0.95 };
  }

  // B. Pinch / Select Tool / Size control
  if (isPinching) {
    return { gesture: 'Pinch', confidence: 0.90 };
  }

  // C. Save (Victory sign: index + middle extended, ring + pinky closed)
  if (isIndexExtended && isMiddleExtended && !isRingExtended && !isPinkyExtended) {
    return { gesture: 'Save', confidence: 0.95 };
  }

  // D. Undo (Thumb + Pinky extended, index + middle + ring closed)
  if (isThumbExtended && isPinkyExtended && !isIndexExtended && !isMiddleExtended && !isRingExtended) {
    return { gesture: 'Undo', confidence: 0.90 };
  }

  // E. Redo (Thumb + Index + Middle extended, ring + pinky closed)
  if (isThumbExtended && isIndexExtended && isMiddleExtended && !isRingExtended && !isPinkyExtended) {
    return { gesture: 'Redo', confidence: 0.90 };
  }

  // F. Eraser (Open Palm: index + middle + ring + pinky extended)
  if (isIndexExtended && isMiddleExtended && isRingExtended && isPinkyExtended) {
    return { gesture: 'Eraser', confidence: 0.98 };
  }

  // G. Clear Canvas (Fist: all fingers curled)
  if (!isIndexExtended && !isMiddleExtended && !isRingExtended && !isPinkyExtended) {
    return { gesture: 'Clear', confidence: 0.95 };
  }

  // H. Draw (Index extended, middle + ring curled; robust against thumb/pinky position)
  if (isIndexExtended && !isMiddleExtended && !isRingExtended) {
    return { gesture: 'Draw', confidence: 0.96 };
  }

  // Fallback
  return { gesture: 'Idle', confidence: 0.5 };
}

/**
 * Returns a human-readable description and emoji for a gesture name.
 */
export function getGestureDetails(gesture: string): { name: string; emoji: string; desc: string } {
  switch (gesture) {
    case 'Draw':
      return { name: 'Draw', emoji: '☝️', desc: 'Point index finger to draw in the air' };
    case 'Eraser':
      return { name: 'Eraser', emoji: '✋', desc: 'Open palm over strokes to erase them' };
    case 'Undo':
      return { name: 'Undo', emoji: '🤙', desc: 'Extend thumb + pinky to undo last stroke' };
    case 'Redo':
      return { name: 'Redo', emoji: '🤟', desc: 'Extend thumb + index + middle to redo' };
    case 'Clear':
      return { name: 'Clear Canvas', emoji: '✊', desc: 'Hold closed fist for 2s to clear canvas' };
    case 'Save':
      return { name: 'Save Session', emoji: '✌️', desc: 'Hold victory sign for 2s to save' };
    case 'OCR':
      return { name: 'OCR / Math Solver', emoji: '👌', desc: 'Perform OK sign to solve handwriting' };
    case 'Pinch':
      return { name: 'Pinch / Select', emoji: '🤏', desc: 'Pinch thumb + index to resize brush or select tools' };
    default:
      return { name: 'Idle', emoji: '💤', desc: 'Hand idle. Curl index finger to pause drawing' };
  }
}

/**
 * Weighted Temporal Gesture Stabilizer to prevent flickering state changes
 * while retaining immediate response when starting/stopping drawing strokes.
 */
export class GestureStabilizer {
  private history: string[] = [];
  private windowSize: number;

  constructor(windowSize = 3) {
    this.windowSize = windowSize;
  }

  public addFrame(rawGesture: string): string {
    // Immediate lock-in for Draw or Pinch to reduce input latency
    if (rawGesture === 'Draw' || rawGesture === 'Pinch') {
      this.history.push(rawGesture);
      if (this.history.length > this.windowSize) {
        this.history.shift();
      }
      const drawCount = this.history.filter(g => g === rawGesture).length;
      if (drawCount >= 1) return rawGesture;
    }

    this.history.push(rawGesture);
    if (this.history.length > this.windowSize) {
      this.history.shift();
    }
    return this.getConsensus();
  }

  private getConsensus(): string {
    if (this.history.length === 0) return 'Idle';
    const counts: Record<string, number> = {};
    let maxCount = 0;
    let consensus = 'Idle';

    for (const gesture of this.history) {
      counts[gesture] = (counts[gesture] || 0) + 1;
      if (counts[gesture] > maxCount) {
        maxCount = counts[gesture];
        consensus = gesture;
      }
    }
    return consensus;
  }

  public reset(): void {
    this.history = [];
  }
}

