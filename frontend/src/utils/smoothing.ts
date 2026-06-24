export class OneEuroFilter {
  private minCutoff: number;
  private beta: number;
  private dCutoff: number;
  
  private xPrev: number | null = null;
  private dxPrev: number = 0;
  private tPrev: number | null = null;

  constructor(minCutoff = 1.0, beta = 0.007, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }

  private alpha(cutoff: number, rate: number): number {
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau * rate);
  }

  public filter(value: number, timestamp: number): number {
    if (this.xPrev === null || this.tPrev === null) {
      this.xPrev = value;
      this.tPrev = timestamp;
      this.dxPrev = 0;
      return value;
    }

    const dt = (timestamp - this.tPrev) / 1000.0; // convert to seconds
    if (dt <= 0) return this.xPrev;

    const rate = 1.0 / dt;
    
    // Calculate derivative and smooth it
    const dx = (value - this.xPrev) * rate;
    const dAlpha = this.alpha(this.dCutoff, rate);
    const dxSmoothed = this.dxPrev + dAlpha * (dx - this.dxPrev);
    
    // Calculate adaptive cutoff based on speed (absolute value of smoothed velocity)
    const cutoff = this.minCutoff + this.beta * Math.abs(dxSmoothed);
    
    // Smooth the value
    const valAlpha = this.alpha(cutoff, rate);
    const xSmoothed = this.xPrev + valAlpha * (value - this.xPrev);

    // Save history
    this.xPrev = xSmoothed;
    this.dxPrev = dxSmoothed;
    this.tPrev = timestamp;

    return xSmoothed;
  }

  public reset(): void {
    this.xPrev = null;
    this.dxPrev = 0;
    this.tPrev = null;
  }
}

export class PointSmoother {
  private filterX: OneEuroFilter;
  private filterY: OneEuroFilter;

  constructor(minCutoff = 0.5, beta = 0.05) {
    this.filterX = new OneEuroFilter(minCutoff, beta);
    this.filterY = new OneEuroFilter(minCutoff, beta);
  }

  public smooth(x: number, y: number, timestamp = Date.now()): { x: number; y: number } {
    return {
      x: this.filterX.filter(x, timestamp),
      y: this.filterY.filter(y, timestamp)
    };
  }

  public reset(): void {
    this.filterX.reset();
    this.filterY.reset();
  }
}

/**
 * Standard 1D Kalman Filter for position tracking.
 */
export class KalmanFilter1D {
  private Q: number; // Process noise covariance
  private R: number; // Measurement noise covariance
  private x: number = 0; // State estimate
  private P: number = 1; // Estimate covariance
  private isInitialized = false;

  constructor(Q = 0.05, R = 0.5) {
    this.Q = Q;
    this.R = R;
  }

  public filter(measurement: number): number {
    if (!this.isInitialized) {
      this.x = measurement;
      this.P = 1.0;
      this.isInitialized = true;
      return measurement;
    }

    // Prediction update
    this.P = this.P + this.Q;

    // Measurement update
    const K = this.P / (this.P + this.R); // Kalman gain
    this.x = this.x + K * (measurement - this.x);
    this.P = (1 - K) * this.P;

    return this.x;
  }

  public reset(): void {
    this.isInitialized = false;
  }
}
