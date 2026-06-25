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
 * Landmarks are expected in the standard MediaPipe format (normalized coordinates 0-1).
 * We scale them by a standard factor to make pixel math readable.
 */
export function classifyGesture(
  rawLandmarks: Landmark[],
  calibration: CalibrationData
): { gesture: string; confidence: number } {
  if (!rawLandmarks || rawLandmarks.length < 21) {
    return { gesture: 'Idle', confidence: 0 };
  }

  // Work with scaled landmarks to make distances more human-readable (mapping to a 1000x1000 virtual space)
  const l = rawLandmarks.map((pt) => ({
    x: pt.x * 1000,
    y: pt.y * 1000,
    z: pt.z * 1000,
  }));

  // Define key joints
  const wrist = l[0];
  
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
  const thumbTip = l[4];
  const indexTip = l[8];
  const middleTip = l[12];
  const ringTip = l[16];
  const pinkyTip = l[20];

  // Calculate current hand size: wrist to middle finger MCP + MCP to middle finger tip
  const currentHandSize = distance(wrist, middleMCP, true) + distance(middleMCP, middleTip, true);
  
  // Adjust thresholds based on calibration ratio
  // If the user's hand is closer/further, we scale thresholds relative to calibration
  const scaleRatio = currentHandSize / calibration.handSize;
  const calibratedPinchThreshold = calibration.pinchThreshold * scaleRatio;

  // A finger is extended if the distance from knuckles to tip is significantly
  // larger than the distance from knuckles to joint PIP.
  const isIndexExtended = distance(indexMCP, indexTip, true) > distance(indexMCP, indexPIP, true) * 1.65;
  const isMiddleExtended = distance(middleMCP, middleTip, true) > distance(middleMCP, middlePIP, true) * 1.65;
  const isRingExtended = distance(ringMCP, ringTip, true) > distance(ringMCP, ringPIP, true) * 1.65;
  const isPinkyExtended = distance(pinkyMCP, pinkyTip, true) > distance(pinkyMCP, pinkyPIP, true) * 1.65;
  
  // Thumb extension is calculated by its distance from the index finger MCP knuckle and wrist
  const isThumbExtended = distance(thumbTip, indexMCP, true) > 100 * scaleRatio;

  // 2. Calculate Distances between Tips for Pinches/OK gestures
  const thumbIndexDist = distance(thumbTip, indexTip, true);

  // Check if Thumb and Index are pinching
  const isPinching = thumbIndexDist < calibratedPinchThreshold;

  // --- GESTURE CLASSIFICATION RULES ---
  
  // A. OCR (OK Gesture)
  // Thumb and index finger are pinching, and other fingers (middle, ring, pinky) are straight/extended
  if (isPinching && isMiddleExtended && isRingExtended && isPinkyExtended) {
    return { gesture: 'OCR', confidence: 0.95 };
  }

  // B. Brush Size (Pinch with middle, ring, pinky extended)
  // If we pinch, but other fingers are not fully straight or we're explicitly calibrating,
  // we return "Pinch" which translates to either Color Picker or Brush Size depending on cursor location.
  if (isPinching) {
    // If middle, ring, pinky are curled, it's a tight pinch (select tool / size control)
    if (!isMiddleExtended && !isRingExtended && !isPinkyExtended) {
      return { gesture: 'Pinch', confidence: 0.90 };
    }
    // General pinch fallback
    return { gesture: 'Pinch', confidence: 0.85 };
  }

  // C. Save (Victory sign: index + middle extended, others closed)
  if (isIndexExtended && isMiddleExtended && !isRingExtended && !isPinkyExtended && !isThumbExtended) {
    return { gesture: 'Save', confidence: 0.95 };
  }

  // D. Undo (Thumb + Pinky extended, index, middle, ring curled)
  if (isThumbExtended && isPinkyExtended && !isIndexExtended && !isMiddleExtended && !isRingExtended) {
    return { gesture: 'Undo', confidence: 0.90 };
  }

  // E. Redo (Thumb + Index + Middle extended, ring + pinky curled)
  if (isThumbExtended && isIndexExtended && isMiddleExtended && !isRingExtended && !isPinkyExtended) {
    return { gesture: 'Redo', confidence: 0.90 };
  }

  // F. Eraser (Open Palm: all 5 fingers extended)
  if (isThumbExtended && isIndexExtended && isMiddleExtended && isRingExtended && isPinkyExtended) {
    return { gesture: 'Eraser', confidence: 0.98 };
  }

  // G. Clear Canvas (Fist: all fingers curled)
  if (!isThumbExtended && !isIndexExtended && !isMiddleExtended && !isRingExtended && !isPinkyExtended) {
    return { gesture: 'Clear', confidence: 0.95 };
  }

  // H. Draw (Index extended, middle, ring, pinky curled)
  // We allow thumb to be in any state, but middle, ring, and pinky must be curled.
  if (isIndexExtended && !isMiddleExtended && !isRingExtended && !isPinkyExtended) {
    return { gesture: 'Draw', confidence: 0.95 };
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
