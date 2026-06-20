const geoService = require('./geoTrackingService');

/**
 * Calculates the cardinal travel direction from bearing/heading (0 to 360)
 */
function getTravelDirection(heading) {
  if (heading === undefined || heading === null || isNaN(heading)) return 'Unknown';
  const directions = ['North', 'North-East', 'East', 'South-East', 'South', 'South-West', 'West', 'North-West'];
  const index = Math.round(((heading % 360) / 45)) % 8;
  return directions[index];
}

/**
 * Calculates the bearing between two coordinates
 */
function calculateBearing(lat1, lon1, lat2, lon2) {
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const lat1Rad = lat1 * Math.PI / 180;
  const lat2Rad = lat2 * Math.PI / 180;

  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
    Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);

  let brng = Math.atan2(y, x) * 180 / Math.PI;
  return (brng + 360) % 360;
}

/**
 * Helper to flush pending points as rejected/raw
 */
function flushPendingAsRejected(pendingPoints, lastAccepted, validated, acceptedHistory) {
  pendingPoints.forEach(p => {
    if (lastAccepted) {
      p.snappedLatitude = lastAccepted.snappedLatitude || lastAccepted.latitude;
      p.snappedLongitude = lastAccepted.snappedLongitude || lastAccepted.longitude;
      p.roadId = lastAccepted.roadId;
      p.roadSegmentId = lastAccepted.roadSegmentId;
      p.roadName = lastAccepted.roadName;
      p.travelDirection = lastAccepted.travelDirection;
      p.previousRoadId = lastAccepted.previousRoadId;
      p.previousSegmentId = lastAccepted.previousSegmentId;
    } else {
      p.snappedLatitude = null;
      p.snappedLongitude = null;
    }
    p.matchedRoadConfidence = 0.2;
    p.transitionReason = p.transitionReason
      ? p.transitionReason.replace('pending_', 'failed_')
      : 'failed_transition_consensus';
    p.routeStatus = 'raw';
    p.status = 'suspicious';
    validated.push(p);
    acceptedHistory.push(p);
  });
}

/**
 * Validates road continuity and heading transitions for a batch of points
 * @param {Array} batch - Array of snapped/raw tracking points
 * @param {Array} history - Last 3-5 accepted raw tracking points
 * @returns {Array} Validated points with schema metadata populated
 */
function validateTransitions(batch, history = []) {
  if (!batch || batch.length === 0) return [];

  const points = batch.map(p => ({ ...p }));
  const validated = [];
  const acceptedHistory = [...history];

  let pendingRoadId = null;
  let pendingPoints = [];
  let isPendingUTurn = false;

  for (let i = 0; i < points.length; i++) {
    const curr = points[i];

    const candidateRoadId = curr.placeId || curr.roadId || null;
    const candidateRoadName = curr.roadName || curr.address || 'Unknown Road';
    const candidateLat = curr.snappedLatitude || curr.latitude;
    const candidateLng = curr.snappedLongitude || curr.longitude;

    // Use the last element in pendingPoints if we are building a transition,
    // otherwise fallback to the last element in acceptedHistory
    const lastAccepted = pendingPoints.length > 0
      ? pendingPoints[pendingPoints.length - 1]
      : (acceptedHistory.length > 0 ? acceptedHistory[acceptedHistory.length - 1] : null);

    if (!lastAccepted) {
      // 1. Initial Point of Session
      curr.snappedLatitude = candidateLat;
      curr.snappedLongitude = candidateLng;
      curr.roadId = candidateRoadId || 'initial';
      curr.roadSegmentId = candidateRoadId || 'initial';
      curr.roadName = candidateRoadName;
      curr.travelDirection = getTravelDirection(curr.heading);
      curr.previousRoadId = null;
      curr.previousSegmentId = null;
      curr.matchedRoadConfidence = candidateRoadId ? 0.95 : 0.5;
      curr.transitionReason = 'initial_road';
      curr.routeStatus = candidateRoadId ? 'snapped' : 'raw';
      curr.status = 'valid';

      validated.push(curr);
      acceptedHistory.push(curr);
      continue;
    }

    // Calculate metadata comparisons
    const distanceM = geoService.calculateDistance(
      lastAccepted.snappedLatitude || lastAccepted.latitude,
      lastAccepted.snappedLongitude || lastAccepted.longitude,
      candidateLat,
      candidateLng
    ) * 1000; // in meters

    const timeDiffSec = (new Date(curr.timestamp) - new Date(lastAccepted.timestamp)) / 1000;

    // Recovery Mode after signal/connection loss (gap >= 20 seconds)
    const isRecovery = !isNaN(timeDiffSec) && timeDiffSec >= 20;
    if (isRecovery) {
      curr.snappedLatitude = candidateLat;
      curr.snappedLongitude = candidateLng;
      curr.roadId = candidateRoadId || lastAccepted.roadId || 'recovery';
      curr.roadSegmentId = candidateRoadId || lastAccepted.roadSegmentId || 'recovery';
      curr.roadName = candidateRoadName;
      curr.travelDirection = getTravelDirection(curr.heading);
      curr.previousRoadId = lastAccepted.roadId;
      curr.previousSegmentId = lastAccepted.roadSegmentId;
      curr.matchedRoadConfidence = 0.90;
      curr.transitionReason = 'recovery_road';
      curr.routeStatus = candidateRoadId ? 'snapped' : 'raw';
      curr.status = 'valid';

      validated.push(curr);
      acceptedHistory.push(curr);
      continue;
    }

    // Compute effective speed to prevent spoofed/zero telemetry issues
    const calculatedSpeedMs = timeDiffSec > 0 ? (distanceM / timeDiffSec) : 0;
    const effectiveSpeed = Math.max(curr.speed || 0, calculatedSpeedMs);

    // Reject snap if it is too far from the raw GPS coordinate (false snapping to side streets)
    const snapDriftM = curr.snappedLatitude && curr.snappedLongitude
      ? geoService.calculateDistance(curr.latitude, curr.longitude, curr.snappedLatitude, curr.snappedLongitude) * 1000
      : 0;

    const isExcessiveSnapDrift = snapDriftM > 35;

    if (isExcessiveSnapDrift) {
      curr.snappedLatitude = lastAccepted.snappedLatitude || lastAccepted.latitude;
      curr.snappedLongitude = lastAccepted.snappedLongitude || lastAccepted.longitude;
      curr.roadId = lastAccepted.roadId;
      curr.roadSegmentId = lastAccepted.roadSegmentId;
      curr.roadName = lastAccepted.roadName;
      curr.travelDirection = lastAccepted.travelDirection;
      curr.previousRoadId = lastAccepted.previousRoadId;
      curr.previousSegmentId = lastAccepted.previousSegmentId;
      curr.matchedRoadConfidence = 0.15;
      curr.transitionReason = 'excessive_snap_drift_rejected';
      curr.routeStatus = 'raw';
      curr.status = 'suspicious';

      validated.push(curr);
      acceptedHistory.push(curr);
      continue;
    }

    // Check if vehicle heading is opposite to previous accepted direction
    let isHeadingOpposite = false;
    let isHeadingChangeSmall = false;
    if (curr.heading !== undefined && curr.heading !== null && lastAccepted.heading !== undefined && lastAccepted.heading !== null) {
      const hDiff = Math.abs(curr.heading - lastAccepted.heading) % 360;
      const absDiff = hDiff > 180 ? 360 - hDiff : hDiff;
      if (absDiff > 140 && absDiff < 220) {
        isHeadingOpposite = true;
      }
      isHeadingChangeSmall = absDiff < 40;
    }

    // Check if candidate road is opposite direction
    let isOppositeRoad = false;
    if (candidateRoadId && lastAccepted.roadId) {
      const isOpp1 = candidateRoadId.includes('opposite') || lastAccepted.roadId.includes('opposite');
      const isOpp2 = (candidateRoadId.includes('west') && lastAccepted.roadId.includes('east')) ||
        (candidateRoadId.includes('east') && lastAccepted.roadId.includes('west'));
      isOppositeRoad = isOpp1 || isOpp2;
    }

    // Reject opposite lane drift on undivided/2-lane roads if vehicle is still traveling straight
    const isHeadingStraight = !isHeadingOpposite && isHeadingChangeSmall;
    if (isOppositeRoad && isHeadingStraight) {
      curr.snappedLatitude = lastAccepted.snappedLatitude || lastAccepted.latitude;
      curr.snappedLongitude = lastAccepted.snappedLongitude || lastAccepted.longitude;
      curr.roadId = lastAccepted.roadId;
      curr.roadSegmentId = lastAccepted.roadSegmentId;
      curr.roadName = lastAccepted.roadName;
      curr.travelDirection = lastAccepted.travelDirection;
      curr.previousRoadId = lastAccepted.previousRoadId;
      curr.previousSegmentId = lastAccepted.previousSegmentId;
      curr.matchedRoadConfidence = 0.4;
      curr.transitionReason = 'opposite_lane_drift_rejected';
      curr.routeStatus = 'raw';
      curr.status = 'suspicious';

      validated.push(curr);
      acceptedHistory.push(curr);
      continue;
    }

    // 2. SAME ROAD (only if we are NOT in the middle of a pending transition consensus)
    const lastAcceptedBase = acceptedHistory.length > 0 ? acceptedHistory[acceptedHistory.length - 1] : null;
    if (pendingPoints.length === 0 && candidateRoadId && lastAcceptedBase && candidateRoadId === lastAcceptedBase.roadId) {
      if (isHeadingOpposite && effectiveSpeed * 3.6 > 20) {
        // Sudden heading flip in the middle of same road at speed is suspicious (drift to opposite carriageway)
        curr.snappedLatitude = lastAcceptedBase.snappedLatitude || lastAcceptedBase.latitude;
        curr.snappedLongitude = lastAcceptedBase.snappedLongitude || lastAcceptedBase.longitude;
        curr.roadId = lastAcceptedBase.roadId;
        curr.roadSegmentId = lastAcceptedBase.roadSegmentId;
        curr.roadName = lastAcceptedBase.roadName;
        curr.travelDirection = lastAcceptedBase.travelDirection;
        curr.previousRoadId = lastAcceptedBase.previousRoadId;
        curr.previousSegmentId = lastAcceptedBase.previousSegmentId;
        curr.matchedRoadConfidence = 0.3;
        curr.transitionReason = 'opposite_direction_rejected';
        curr.routeStatus = 'raw';
        curr.status = 'suspicious';
      } else {
        // Accept snap
        curr.snappedLatitude = candidateLat;
        curr.snappedLongitude = candidateLng;
        curr.roadId = candidateRoadId;
        curr.roadSegmentId = candidateRoadId;
        curr.roadName = candidateRoadName;
        curr.travelDirection = getTravelDirection(curr.heading);
        curr.previousRoadId = lastAcceptedBase.roadId;
        curr.previousSegmentId = lastAcceptedBase.roadSegmentId;
        curr.matchedRoadConfidence = 0.98;
        curr.transitionReason = 'same_road_continuation';
        curr.routeStatus = 'snapped';
        curr.status = 'valid';
      }

      validated.push(curr);
      acceptedHistory.push(curr);
      continue;
    }

    // 3. ROAD TRANSITION PROPOSED (either candidateRoadId !== lastAcceptedBase.roadId OR pendingPoints.length > 0)

    // Check Connectivity (Speed-Distance feasibility)
    // At slow speed / navigation, allow a baseline feasibility of at least 80m
    const maxFeasibleDistance = Math.max(80, (effectiveSpeed || 15) * Math.max(timeDiffSec, 2) * 1.5 + (curr.accuracy || 20));
    const isConnected = distanceM <= maxFeasibleDistance && distanceM < 150; // hard-cap jumps > 150m

    // High-Speed Parallel Road Jump Rejection
    const isParallelJump = pendingPoints.length === 0 &&
      candidateRoadId !== lastAccepted.roadId &&
      distanceM > 20 &&
      effectiveSpeed > 8 &&
      isHeadingChangeSmall;

    if (isParallelJump) {
      curr.snappedLatitude = lastAccepted.snappedLatitude || lastAccepted.latitude;
      curr.snappedLongitude = lastAccepted.snappedLongitude || lastAccepted.longitude;
      curr.roadId = lastAccepted.roadId;
      curr.roadSegmentId = lastAccepted.roadSegmentId;
      curr.roadName = lastAccepted.roadName;
      curr.travelDirection = lastAccepted.travelDirection;
      curr.previousRoadId = lastAccepted.previousRoadId;
      curr.previousSegmentId = lastAccepted.previousSegmentId;
      curr.matchedRoadConfidence = 0.2;
      curr.transitionReason = 'parallel_road_jump_rejected';
      curr.routeStatus = 'raw';
      curr.status = 'suspicious';

      validated.push(curr);
      acceptedHistory.push(curr);
      continue;
    }

    // If it's a jump to an opposite heading/road without speed reduction or connection
    if ((isHeadingOpposite || isOppositeRoad) && !isConnected) {
      // Reject opposite carriageway jump
      curr.snappedLatitude = lastAccepted.snappedLatitude || lastAccepted.latitude;
      curr.snappedLongitude = lastAccepted.snappedLongitude || lastAccepted.longitude;
      curr.roadId = lastAccepted.roadId;
      curr.roadSegmentId = lastAccepted.roadSegmentId;
      curr.roadName = lastAccepted.roadName;
      curr.travelDirection = lastAccepted.travelDirection;
      curr.previousRoadId = lastAccepted.previousRoadId;
      curr.previousSegmentId = lastAccepted.previousSegmentId;
      curr.matchedRoadConfidence = 0.1;
      curr.transitionReason = 'opposite_direction_jump_rejected';
      curr.routeStatus = 'raw';
      curr.status = 'suspicious';

      validated.push(curr);
      acceptedHistory.push(curr);
      continue;
    }

    // 4. TRANSITION CONSENSUS (U-turn / Road Switch)
    const isUTurnSeq = isHeadingOpposite || isOppositeRoad;

    if (isUTurnSeq || isPendingUTurn) {
      // Possible U-turn: We require 3 confirmations (sliding window consensus)
      if (pendingRoadId && pendingRoadId === candidateRoadId) {
        curr.roadId = candidateRoadId;
        curr.roadSegmentId = candidateRoadId;
        curr.roadName = candidateRoadName;
        curr.travelDirection = getTravelDirection(curr.heading);
        pendingPoints.push(curr);
      } else {
        // If we had pending points on a different road, flush them
        if (pendingPoints.length > 0) {
          const lastAcceptedBaseVal = acceptedHistory.length > 0 ? acceptedHistory[acceptedHistory.length - 1] : null;
          flushPendingAsRejected(pendingPoints, lastAcceptedBaseVal, validated, acceptedHistory);
        }
        pendingRoadId = candidateRoadId || 'u-turn-pending';
        isPendingUTurn = true;
        curr.roadId = pendingRoadId;
        curr.roadSegmentId = pendingRoadId;
        curr.roadName = candidateRoadName;
        curr.travelDirection = getTravelDirection(curr.heading);
        pendingPoints = [curr];
      }

      curr.transitionReason = `pending_opposite_direction_u_turn_consensus_${pendingPoints.length}`;

      if (pendingPoints.length >= 3) {
        // Consensus achieved! Retroactively accept the U-turn
        const lastAcceptedBaseVal = acceptedHistory.length > 0 ? acceptedHistory[acceptedHistory.length - 1] : null;
        pendingPoints.forEach((p, idx) => {
          p.snappedLatitude = p.latitude; // Snap to the new road
          p.snappedLongitude = p.longitude;
          p.roadId = pendingRoadId;
          p.roadSegmentId = pendingRoadId;
          p.roadName = candidateRoadName;
          p.travelDirection = getTravelDirection(p.heading);
          p.previousRoadId = lastAcceptedBaseVal ? lastAcceptedBaseVal.roadId : null;
          p.previousSegmentId = lastAcceptedBaseVal ? lastAcceptedBaseVal.roadSegmentId : null;
          p.matchedRoadConfidence = 0.9;
          p.transitionReason = `consensus_u_turn_confirmed_${idx + 1}`;
          p.routeStatus = 'snapped';
          p.status = 'valid';

          validated.push(p);
          acceptedHistory.push(p);
        });

        pendingRoadId = null;
        pendingPoints = [];
        isPendingUTurn = false;
      }
    } else {
      // Normal Connected Switch (e.g. turning onto a village road or crossroads)
      if (pendingRoadId && candidateRoadId === pendingRoadId) {
        curr.roadId = candidateRoadId;
        curr.roadSegmentId = candidateRoadId;
        curr.roadName = candidateRoadName;
        curr.travelDirection = getTravelDirection(curr.heading);
        pendingPoints.push(curr);
      } else {
        if (pendingPoints.length > 0) {
          const lastAcceptedBaseVal = acceptedHistory.length > 0 ? acceptedHistory[acceptedHistory.length - 1] : null;
          flushPendingAsRejected(pendingPoints, lastAcceptedBaseVal, validated, acceptedHistory);
        }
        pendingRoadId = candidateRoadId;
        isPendingUTurn = false;
        curr.roadId = pendingRoadId;
        curr.roadSegmentId = pendingRoadId;
        curr.roadName = candidateRoadName;
        curr.travelDirection = getTravelDirection(curr.heading);
        pendingPoints = [curr];
      }

      curr.transitionReason = `pending_road_switch_consensus_${pendingPoints.length}`;

      if (pendingPoints.length >= 2 || (effectiveSpeed * 3.6 < 15)) {
        // Fast transition for slow speeds (village roads) or after 2 points confirm the new road
        const lastAcceptedBaseVal = acceptedHistory.length > 0 ? acceptedHistory[acceptedHistory.length - 1] : null;
        pendingPoints.forEach((p, idx) => {
          p.snappedLatitude = p.snappedLatitude || p.latitude;
          p.snappedLongitude = p.snappedLongitude || p.longitude;
          p.roadId = pendingRoadId;
          p.roadSegmentId = pendingRoadId;
          p.roadName = candidateRoadName;
          p.travelDirection = getTravelDirection(p.heading);
          p.previousRoadId = lastAcceptedBaseVal ? lastAcceptedBaseVal.roadId : null;
          p.previousSegmentId = lastAcceptedBaseVal ? lastAcceptedBaseVal.roadSegmentId : null;
          p.matchedRoadConfidence = 0.85;
          p.transitionReason = `road_transition_accepted_${idx + 1}`;
          p.routeStatus = 'snapped';
          p.status = 'valid';

          validated.push(p);
          acceptedHistory.push(p);
        });
        pendingRoadId = null;
        pendingPoints = [];
      }
    }
  }

  // Flush any remaining pending points if the batch ends before consensus
  if (pendingPoints.length > 0) {
    const lastAcceptedBase = acceptedHistory.length > 0 ? acceptedHistory[acceptedHistory.length - 1] : null;
    flushPendingAsRejected(pendingPoints, lastAcceptedBase, validated, acceptedHistory);
  }

  return validated;
}

module.exports = {
  getTravelDirection,
  calculateBearing,
  validateTransitions
};
