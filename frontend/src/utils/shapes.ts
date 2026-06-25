import type { Point, ShapeType } from '../store/useWhiteboardStore';


// Helper to calculate Euclidean distance between two 2D points
export function getDistance(p1: Point, p2: Point): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// Helper to find the perpendicular distance from a point to a line segment
function getPerpendicularDistance(p: Point, lineStart: Point, lineEnd: Point): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  
  if (dx === 0 && dy === 0) {
    return getDistance(p, lineStart);
  }
  
  const num = Math.abs(dy * p.x - dx * p.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x);
  const den = Math.sqrt(dy * dy + dx * dx);
  return num / den;
}

/**
 * Ramer-Douglas-Peucker (RDP) algorithm to simplify a path of points.
 */
export function ramerDouglasPeucker(points: Point[], epsilon: number): Point[] {
  if (points.length < 3) {
    return points;
  }
  
  let maxDistance = 0;
  let index = 0;
  const end = points.length - 1;
  
  for (let i = 1; i < end; i++) {
    const d = getPerpendicularDistance(points[i], points[0], points[end]);
    if (d > maxDistance) {
      maxDistance = d;
      index = i;
    }
  }
  
  if (maxDistance > epsilon) {
    const results1 = ramerDouglasPeucker(points.slice(0, index + 1), epsilon);
    const results2 = ramerDouglasPeucker(points.slice(index), epsilon);
    return results1.slice(0, results1.length - 1).concat(results2);
  } else {
    return [points[0], points[end]];
  }
}

/**
 * Detects if a hand-drawn stroke is a Circle, Rectangle, Triangle, Line, or Arrow.
 * Returns the detected ShapeType and its aligned bounding box.
 */
export function detectAndFitShape(points: Point[]): {
  shapeType: ShapeType;
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const defaultResult = { shapeType: 'line' as ShapeType, x: 0, y: 0, width: 0, height: 0 };
  if (points.length < 3) return defaultResult;

  // 1. Calculate Bounding Box
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  
  let sumX = 0;
  let sumY = 0;
  
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
    sumX += p.x;
    sumY += p.y;
  }
  
  const w = maxX - minX;
  const h = maxY - minY;
  const cx = sumX / points.length;
  const cy = sumY / points.length;
  const centroid = { x: cx, y: cy };
  
  // If the drawing is extremely small, return a small line
  if (w < 15 && h < 15) {
    return { shapeType: 'line', x: minX, y: minY, width: w, height: h };
  }

  // 2. Check if closed (start and end points are close relative to bounding box size)
  const start = points[0];
  const end = points[points.length - 1];
  const startEndDist = getDistance(start, end);
  const maxDimension = Math.max(w, h);
  const isClosed = startEndDist < maxDimension * 0.35;

  // 3. Simplify path to count vertices
  const epsilon = maxDimension * 0.04;
  const simplified = ramerDouglasPeucker(points, epsilon);
  
  // Count vertices (subtract 1 if closed since last point is close to first point)
  let vertexCount = simplified.length;
  if (isClosed && vertexCount > 2) {
    vertexCount -= 1;
  }

  // 4. Circle detection (low variance in distance from centroid to all points)
  let sumRadius = 0;
  for (const p of points) {
    sumRadius += getDistance(p, centroid);
  }
  const avgRadius = sumRadius / points.length;
  
  let sumRadiusSqDiff = 0;
  for (const p of points) {
    const r = getDistance(p, centroid);
    sumRadiusSqDiff += Math.pow(r - avgRadius, 2);
  }
  const stdRadius = Math.sqrt(sumRadiusSqDiff / points.length);
  const radiusVariance = stdRadius / avgRadius; // Coeff of variation

  // --- Classification ---
  
  if (isClosed) {
    // Circle: low radius variance (e.g., standard deviation is < 15% of radius)
    if (radiusVariance < 0.18) {
      return { shapeType: 'circle', x: minX, y: minY, width: w, height: h };
    }
    
    // Triangle: 3 main vertices
    if (vertexCount === 3) {
      return { shapeType: 'triangle', x: minX, y: minY, width: w, height: h };
    }
    
    // Rectangle: 4 main vertices or high aspect bounding box coverage
    if (vertexCount === 4) {
      return { shapeType: 'rect', x: minX, y: minY, width: w, height: h };
    }
    
    // Fallback closed shape: Rect or Circle
    return radiusVariance < 0.25 
      ? { shapeType: 'circle', x: minX, y: minY, width: w, height: h }
      : { shapeType: 'rect', x: minX, y: minY, width: w, height: h };
  } else {
    // Open Shape: Line or Arrow
    // Arrow detection: checks if there is a sharp corner / hook at the end of the stroke
    // We analyze the last 20% of points. If there is a sharp turnaround or angle change
    // we assume it is an arrow pointing in the direction of the stroke's end.
    let isArrow = false;
    if (points.length >= 15 && maxDimension > 50) {
      const lastIdx = points.length - 1;
      const midIdx = Math.floor(points.length * 0.75);
      
      // Direction of main stroke
      const mainDx = points[midIdx].x - points[0].x;
      const mainDy = points[midIdx].y - points[0].y;
      const mainAngle = Math.atan2(mainDy, mainDx);
      
      // Direction of the end tail
      const tailDx = points[lastIdx].x - points[midIdx].x;
      const tailDy = points[lastIdx].y - points[midIdx].y;
      const tailAngle = Math.atan2(tailDy, tailDx);
      
      // Calculate angular difference
      let angleDiff = Math.abs(mainAngle - tailAngle);
      if (angleDiff > Math.PI) {
        angleDiff = 2 * Math.PI - angleDiff;
      }
      
      // If the tail curls back sharply to form an arrowhead (tight range 2.0 to 3.0 rad)
      if (angleDiff > 2.0 && angleDiff < 3.0) {
        isArrow = true;
      }
    }
    
    if (isArrow) {
      return { shapeType: 'arrow', x: minX, y: minY, width: w, height: h };
    }
    
    // Otherwise it's a Line
    return { shapeType: 'line', x: minX, y: minY, width: w, height: h };
  }
}
