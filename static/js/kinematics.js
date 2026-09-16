/**
 * RehabOpt AR — Deterministic Biomechanical Kinematic Core
 * All 13 formulas: C1-C6, E1-E6, S1-S3
 * Coordinates from MediaPipe are normalized (x, y, z) ∈ [0, 1]
 */
const Kinematics = {
  /**
   * C1: Joint Goniometry (Elbow Flexion/Extension)
   * Interior angle formed by Shoulder (p1), Elbow (p2), Wrist (p3)
   */
  calculateJointAngle(shoulder, elbow, wrist) {
    // Defensive: missing or non-finite coordinates must never yield NaN
    if (!shoulder || !elbow || !wrist) return 0;
    const nums = [shoulder.x, shoulder.y, elbow.x, elbow.y, wrist.x, wrist.y];
    if (nums.some((n) => typeof n !== "number" || !Number.isFinite(n))) return 0;
    const v1 = { x: shoulder.x - elbow.x, y: shoulder.y - elbow.y };
    const v2 = { x: wrist.x - elbow.x, y: wrist.y - elbow.y };
    const dot = v1.x * v2.x + v1.y * v2.y;
    const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
    const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
    if (mag1 * mag2 === 0) return 0;
    const cosine = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
    return (Math.acos(cosine) * 180) / Math.PI;
  },

  /**
   * C2: Target Interception Radius (Planar Euclidean Distance)
   */
  isTargetIntercepted(currentPoint, targetPoint, thresholdRadius) {
    const dx = currentPoint.x - targetPoint.x;
    const dy = currentPoint.y - targetPoint.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return { intercepted: distance <= thresholdRadius, distance };
  },

  /**
   * C3: Hand Open/Close Dispersion
   * Average Euclidean distance from 5 fingertips to wrist (Landmark 0)
   */
  calculateHandDispersion(landmarks) {
    const wrist = landmarks[0];
    const fingerTips = [4, 8, 12, 16, 20];
    let totalDist = 0;
    fingerTips.forEach((idx) => {
      const tip = landmarks[idx];
      const dx = tip.x - wrist.x;
      const dy = tip.y - wrist.y;
      totalDist += Math.sqrt(dx * dx + dy * dy);
    });
    return totalDist / 5.0;
  },

  /**
   * C4: Planar Reach Distance
   * Normalized shoulder-to-wrist reach against patient arm length
   */
  calculatePlanarReach(shoulder, wrist, maxReach) {
    if (!maxReach || maxReach === 0) return 0;
    const dx = wrist.x - shoulder.x;
    const dy = wrist.y - shoulder.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    return Math.min(100, Math.round((dist / maxReach) * 100));
  },

  /**
   * C5: Radial Deviation Angle
   * Lateral wrist bending relative to forearm axis
   */
  calculateRadialDeviation(elbow, wrist, middleMCP) {
    const forearm = { x: wrist.x - elbow.x, y: wrist.y - elbow.y };
    const hand = { x: middleMCP.x - wrist.x, y: middleMCP.y - wrist.y };
    const dot = forearm.x * hand.x + forearm.y * hand.y;
    const det = forearm.x * hand.y - forearm.y * hand.x;
    return (Math.atan2(det, dot) * 180) / Math.PI;
  },

  /**
   * C6: Bimanual Coordination Index
   * Compares impaired arm motion against unaffected arm baseline
   */
  calculateBimanualCoordination(impairedROM, unaffectedROM) {
    if (unaffectedROM === 0) return 0;
    return Math.min(100, Math.round((impairedROM / unaffectedROM) * 100));
  },

  /**
   * E1: Anti-Cheat Trunk Lateral Tilt Angle
   * Angle of inter-shoulder line relative to horizontal axis
   */
  calculateTrunkTilt(leftShoulder, rightShoulder) {
    if (!leftShoulder || !rightShoulder) return { tiltDegrees: 0, isCompensating: false };
    const nums = [leftShoulder.x, leftShoulder.y, rightShoulder.x, rightShoulder.y];
    if (nums.some((n) => typeof n !== "number" || !Number.isFinite(n))) {
      return { tiltDegrees: 0, isCompensating: false };
    }
    const dy = rightShoulder.y - leftShoulder.y;
    const dx = rightShoulder.x - leftShoulder.x;
    const radians = Math.atan2(dy, dx);
    const degrees = Math.abs((radians * 180) / Math.PI);
    const tiltDeviation = Math.min(degrees, Math.abs(180 - degrees));
    return {
      tiltDegrees: tiltDeviation,
      isCompensating: tiltDeviation > 10.0,
    };
  },

  /**
   * E2: Thumb-Index Pincer Grip Distance
   */
  calculatePincerGrip(thumbTip, indexTip) {
    const dx = thumbTip.x - indexTip.x;
    const dy = thumbTip.y - indexTip.y;
    return Math.sqrt(dx * dx + dy * dy);
  },

  /**
   * E3: Signed Wrist Deviation (Wrist Drop Detection)
   * Vector alignment between forearm and hand
   */
  calculateWristDeviation(elbow, wrist, middleMCP) {
    const forearm = { x: wrist.x - elbow.x, y: wrist.y - elbow.y };
    const hand = { x: middleMCP.x - wrist.x, y: middleMCP.y - wrist.y };
    const dot = forearm.x * hand.x + forearm.y * hand.y;
    const det = forearm.x * hand.y - forearm.y * hand.x;
    const angleRad = Math.atan2(det, dot);
    return (angleRad * 180) / Math.PI;
  },

  /**
   * E4: Orthogonal Path Error
   * Distance from active point to nearest segment between A and B
   */
  calculateOrthogonalPathError(p, a, b) {
    const ab = { x: b.x - a.x, y: b.y - a.y };
    const ap = { x: p.x - a.x, y: p.y - a.y };
    const abLenSq = ab.x * ab.x + ab.y * ab.y;
    if (abLenSq === 0) return Math.sqrt(ap.x * ap.x + ap.y * ap.y);
    const t = Math.max(0, Math.min(1, (ap.x * ab.x + ap.y * ab.y) / abLenSq));
    const projection = { x: a.x + t * ab.x, y: a.y + t * ab.y };
    const dx = p.x - projection.x;
    const dy = p.y - projection.y;
    return Math.sqrt(dx * dx + dy * dy);
  },

  /**
   * E5: Knuckle Aspect Ratio (Forearm Supination/Pronation)
   * Horizontal vs vertical ratio between index MCP and pinky MCP
   */
  calculateKnuckleAspectRatio(indexMCP, pinkyMCP, wrist) {
    const width = Math.abs(indexMCP.x - pinkyMCP.x);
    const height = Math.abs((indexMCP.y + pinkyMCP.y) / 2.0 - wrist.y);
    return width / (height || 0.001);
  },

  /**
   * E6: Intention Tremor Frequency Extraction
   * Zero-crossing frequency of acceleration spikes
   */
  calculateTremorFrequency(posBuffer, timestamps) {
    if (posBuffer.length < 10) return 0;
    let zeroCrossings = 0;
    const accelerations = [];
    for (let i = 2; i < posBuffer.length; i++) {
      const dt1 = (timestamps[i - 1] - timestamps[i - 2]) / 1000;
      const dt2 = (timestamps[i] - timestamps[i - 1]) / 1000;
      if (dt1 <= 0 || dt2 <= 0) continue;
      const v1 = (posBuffer[i - 1] - posBuffer[i - 2]) / dt1;
      const v2 = (posBuffer[i] - posBuffer[i - 1]) / dt2;
      const a = (v2 - v1) / dt2;
      accelerations.push(a);
    }
    for (let i = 1; i < accelerations.length; i++) {
      if (
        (accelerations[i] >= 0 && accelerations[i - 1] < 0) ||
        (accelerations[i] < 0 && accelerations[i - 1] >= 0)
      ) {
        zeroCrossings++;
      }
    }
    const totalDurationSec =
      (timestamps[timestamps.length - 1] - timestamps[0]) / 1000;
    return totalDurationSec > 0
      ? (zeroCrossings / 2.0) / totalDurationSec
      : 0;
  },

  /**
   * S1: Normalized Movement Smoothness (Bounded Dimensionless Jerk Index)
   */
  calculateSmoothness(jerkSum, trajectoryDuration, totalPathLength) {
    if (totalPathLength <= 0 || trajectoryDuration <= 0) return 100;
    const rawJerkIndex =
      (0.5 * jerkSum * Math.pow(trajectoryDuration, 5)) /
      Math.pow(totalPathLength, 2);
    const score =
      100 - Math.min(100, Math.log10(Math.max(1, rawJerkIndex)) * 20);
    return Math.max(0, Math.round(score));
  },

  /**
   * S2: Instantaneous Tangential Velocity
   */
  calculateVelocity(posA, posB, dtSeconds) {
    if (dtSeconds <= 0) return 0;
    const dist = Math.sqrt(
      Math.pow(posB.x - posA.x, 2) + Math.pow(posB.y - posA.y, 2)
    );
    return dist / dtSeconds;
  },

  /**
   * S3: Motor Reaction Latency
   * Milliseconds between stimulus and movement initiation
   */
  calculateReactionLatency(stimulusTime, movementInitiationTime) {
    return Math.max(0, movementInitiationTime - stimulusTime);
  },
};

// Freeze the object to prevent accidental mutation
Object.freeze(Kinematics);

if (typeof module !== "undefined" && module.exports) {
  module.exports = Kinematics;
}
