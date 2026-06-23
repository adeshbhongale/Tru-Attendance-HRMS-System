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
 * Helper: perpendicular distance from point B to line A->C in meters
 */
function perpDistanceMeters(a, b, c) {
  // use Haversine distances to form triangle and compute height (as in filterOutliers)
  const aDist = geoService.calculateDistance(a.latitude, a.longitude, b.latitude, b.longitude); // km
  const bDist = geoService.calculateDistance(b.latitude, b.longitude, c.latitude, c.longitude); // km
  const cDist = geoService.calculateDistance(a.latitude, a.longitude, c.latitude, c.longitude); // km
  if (cDist < 0.000001) return aDist * 1000;
  const s = (aDist + bDist + cDist) / 2;
  const areaSq = s * (s - aDist) * (s - bDist) * (s - cDist);
  if (areaSq <= 0) return 0;
  const area = Math.sqrt(areaSq);
  const h = (2 * area) / cDist;
  return h * 1000; // meters
}

/**
 * Helper: angular difference between two headings (0-180)
 */
function angularDiff(a, b) {
  if (a === undefined || b === undefined || a === null || b === null) return 180;
  let d = Math.abs(a - b) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

/**
 * Stage 2: GPS Quality Engine
 * Calculates GPS Confidence (0-100) based on accuracy, speed spikes, and gaps
 */
function calculateGPSConfidence(point, prevPoint) {
  let score = 100;

  // 1. Accuracy Penalty
  if (point.accuracy && point.accuracy > 20) {
    const accuracyPenalty = Math.min(60, (point.accuracy - 20) * 1.2);
    score -= accuracyPenalty;
  }

  // 2. Mock Location Penalty
  if (point.isMock) {
    score = 10;
    return score;
  }

  // 3. Teleportation / Extreme Speed Penalty
  if (prevPoint) {
    const distM = geoService.calculateDistance(
      prevPoint.latitude, prevPoint.longitude,
      point.latitude, point.longitude
    ) * 1000;

    const timeDiffSec = (new Date(point.timestamp) - new Date(prevPoint.timestamp)) / 1000;
    if (timeDiffSec > 0) {
      const speedKmh = (distM / timeDiffSec) * 3.6;
      if (speedKmh > 120) {
        score -= 40;
      } else if (speedKmh > 80) {
        score -= 20;
      }
    }
  }

  return Math.max(10, Math.min(100, Math.round(score)));
}

/**
 * Stage 5: Visits Tracker
 * Computes contiguous visits to each road segment in travel history
 */
function buildRoadVisitMap(history) {
  const visitMap = new Map(); // placeId -> visitCount
  let lastRoadId = null;

  history.forEach(p => {
    const roadId = p.acceptedRoadId || p.roadId;
    if (roadId) {
      if (roadId !== lastRoadId) {
        const count = visitMap.get(roadId) || 0;
        visitMap.set(roadId, count + 1);
        lastRoadId = roadId;
      }
    }
  });

  return visitMap;
}

/**
 * Helper to check if two roads are connected by name comparison
 */
function isRoadConnected(name1, name2) {
  if (!name1 || !name2) return false;
  const clean1 = name1.replace(/\s*\(.*\)\s*/g, '').trim().toLowerCase();
  const clean2 = name2.replace(/\s*\(.*\)\s*/g, '').trim().toLowerCase();
  if (clean1 === 'unknown road' || clean2 === 'unknown road') return false;
  return clean1 === clean2 || clean1.includes(clean2) || clean2.includes(clean1);
}

/**
 * Calculates the maximum angular difference between any pair of headings
 */
function calculateMaxHeadingDifference(headings) {
  let maxDiff = 0;
  for (let i = 0; i < headings.length; i++) {
    for (let j = i + 1; j < headings.length; j++) {
      let diff = Math.abs(headings[i] - headings[j]) % 360;
      if (diff > 180) diff = 360 - diff;
      if (diff > maxDiff) maxDiff = diff;
    }
  }
  return maxDiff;
}

/**
 * Validates road continuity and heading transitions for a batch of points
 * @param {Array} batch - Array of raw GPS points with candidateRoads populated
 * @param {Array} history - Array of previously accepted RawTrackingPoints
 * @returns {Array} Validated points with enterprise metadata
 */
function validateTransitions(batch, history = []) {
  if (!batch || batch.length === 0) return [];

  const points = batch.map(p => ({ ...p }));
  const validated = [];

  // Keep track of the active history sequence (cloned)
  const activeHistory = history.map(h => ({
    ...h,
    acceptedRoadId: h.acceptedRoadId || h.roadId || 'none'
  }));

  // Build the contiguous road visits tracker
  const roadVisitMap = buildRoadVisitMap(activeHistory);
  let lastContiguousRoad = activeHistory.length > 0
    ? activeHistory[activeHistory.length - 1].acceptedRoadId
    : null;

  // Consensus buffer for road switches
  let consensusRoadId = null;
  let consensusPointsQueue = [];

  // Track gradual heading list for U-turn validation (keeps last 5 headings)
  const headingHistory = activeHistory
    .map(h => h.heading)
    .filter(h => h !== undefined && h !== null);

  for (let i = 0; i < points.length; i++) {
    const curr = points[i];
    const currSpeedKmh = (curr.speed || 0) * 3.6;

    // Find previous accepted point reference
    const lastAccepted = activeHistory.length > 0
      ? activeHistory[activeHistory.length - 1]
      : null;

    // --- PROBLEM 9: HEADING STABILITY BONUS ---
    if (curr.heading !== undefined && curr.heading !== null) {
      headingHistory.push(curr.heading);
      if (headingHistory.length > 5) headingHistory.shift();
    }

    let isHeadingStable = false;
    if (headingHistory.length >= 3) {
      const maxDiff = calculateMaxHeadingDifference(headingHistory);
      if (maxDiff < 10) {
        isHeadingStable = true;
      }
    }

    // --- STAGE 2: GPS QUALITY ENGINE ---
    let gpsConfidence = calculateGPSConfidence(curr, lastAccepted);
    if (isHeadingStable) {
      gpsConfidence = Math.min(100, gpsConfidence + 20);
    }
    curr.gpsConfidence = gpsConfidence;

    // Time gap calculation
    const timeDiffSec = lastAccepted
      ? (new Date(curr.timestamp) - new Date(lastAccepted.timestamp)) / 1000
      : 0;
    curr.gpsGap = timeDiffSec;

    const isRecovery = lastAccepted && timeDiffSec >= 20;
    curr.isRecoveryPoint = isRecovery;

    // --- STAGE 3: ROAD CANDIDATE ENGINE ---
    let candidates = curr.candidateRoads || [];

    // Calculate travel direction/bearing changes to resist opposite-lane jumps during straight line movement
    let prevTravelHeading = null;
    let currentBearing = null;
    let isGoingStraight = false;

    if (lastAccepted) {
      currentBearing = calculateBearing(
        lastAccepted.latitude, lastAccepted.longitude,
        curr.latitude, curr.longitude
      );

      if (activeHistory.length >= 2) {
        const pPrev = activeHistory[activeHistory.length - 2];
        prevTravelHeading = calculateBearing(
          pPrev.latitude, pPrev.longitude,
          lastAccepted.latitude, lastAccepted.longitude
        );
      } else if (lastAccepted.heading !== undefined && lastAccepted.heading !== null) {
        prevTravelHeading = lastAccepted.heading;
      } else {
        prevTravelHeading = currentBearing;
      }

      const bearingDiff = Math.abs(currentBearing - prevTravelHeading) % 360;
      const absBearingDiff = bearingDiff > 180 ? 360 - bearingDiff : bearingDiff;
      isGoingStraight = absBearingDiff < 30;
    }

    // --- PROBLEM 3: CANDIDATE SORTING ---
    if (lastAccepted && candidates.length > 0) {
      candidates.sort((a, b) => {
        // 1. Previous Road Match (true first)
        const aIsPrev = a.placeId === lastAccepted.acceptedRoadId ? 1 : 0;
        const bIsPrev = b.placeId === lastAccepted.acceptedRoadId ? 1 : 0;
        if (aIsPrev !== bIsPrev) return bIsPrev - aIsPrev;

        // 2. Connected Roads Match (true first)
        const aIsConn = isRoadConnected(a.roadName, lastAccepted.roadName) ? 1 : 0;
        const bIsConn = isRoadConnected(b.roadName, lastAccepted.roadName) ? 1 : 0;
        if (aIsConn !== bIsConn) return bIsConn - aIsConn;

        // 3. Heading Match (lower diff first)
        if (currentBearing !== null) {
          const aBearing = calculateBearing(lastAccepted.latitude, lastAccepted.longitude, a.latitude, a.longitude);
          const bBearing = calculateBearing(lastAccepted.latitude, lastAccepted.longitude, b.latitude, b.longitude);

          let aDiff = Math.abs(aBearing - currentBearing) % 360;
          if (aDiff > 180) aDiff = 360 - aDiff;
          let bDiff = Math.abs(bBearing - currentBearing) % 360;
          if (bDiff > 180) bDiff = 360 - bDiff;

          const aHeadingMatch = aDiff < 30 ? 1 : 0;
          const bHeadingMatch = bDiff < 30 ? 1 : 0;
          if (aHeadingMatch !== bHeadingMatch) return bHeadingMatch - aHeadingMatch;
        }

        // 4. Distance (closer first)
        if (a.distance !== b.distance) {
          return a.distance - b.distance;
        }

        // 5. Base confidence placeholder
        return (b.roadConfidence || 0) - (a.roadConfidence || 0);
      });
    }

    // --- STAGE 4: ROAD CONTINUITY & CONFIDENCE ENGINE ---
    let bestCandidate = null;
    let maxConfidence = -1;

    candidates.forEach(cand => {
      let confidence = 50; // Base score

      // 1. GPS Accuracy Weight (up to +30)
      confidence += (gpsConfidence * 0.3);

      // 2. Proximity Distance Penalty (closer = better, up to -40)
      if (cand.distance !== undefined) {
        confidence -= Math.min(40, cand.distance * 1.5);
      }

      // 3. Previous Accepted Road (Continuity Bonus)
      if (lastAccepted) {
        const isPrevRoad = cand.placeId === lastAccepted.acceptedRoadId;
        const isConnRoad = isRoadConnected(cand.roadName, lastAccepted.roadName);

        if (isPrevRoad) {
          confidence += 15; // Staying on the same road

          // 3a. Straight-line lock bonus to prevent side-switching/lane-drifting
          if (isGoingStraight) {
            confidence += 35; // Strong lock bonus if moving straight
          }
        } else {
          // 4. Connected Road Topology (names match or similar)
          if (isConnRoad) {
            confidence += 15;
          }

          // --- PROBLEM 6: PARALLEL ROADS & LATERAL JUMP PREVENTION ---
          if (isGoingStraight && prevTravelHeading !== null) {
            const snappedLat = lastAccepted.snappedLatitude || lastAccepted.latitude;
            const snappedLng = lastAccepted.snappedLongitude || lastAccepted.longitude;

            const candBearing = calculateBearing(
              snappedLat, snappedLng,
              cand.latitude, cand.longitude
            );

            const candDist = geoService.calculateDistance(
              snappedLat, snappedLng,
              cand.latitude, cand.longitude
            ) * 1000; // in meters

            let candAngleDiff = Math.abs(candBearing - prevTravelHeading) % 360;
            if (candAngleDiff > 180) candAngleDiff = 360 - candAngleDiff;

            const lateralOffset = candDist * Math.abs(Math.sin(candAngleDiff * Math.PI / 180));

            // If the user is moving straight and candidate has a significant lateral offset (> 5m),
            // penalize it heavily to prevent drawing lane change lines / switching to opposite lanes.
            if (lateralOffset > 5) {
              const lateralPenalty = Math.min(60, (lateralOffset - 5) * 5);
              confidence -= lateralPenalty;
            }

            // High-speed parallel road switch protection
            if (currSpeedKmh > 50 && !isConnRoad) {
              const bearingDiff = Math.abs(currentBearing - prevTravelHeading) % 360;
              const absBearingDiff = bearingDiff > 180 ? 360 - bearingDiff : bearingDiff;
              if (absBearingDiff < 20) {
                // Moving straight at high speed on a different, non-connected road
                confidence -= 30; // Extra parallel road protection penalty
              }
            }
          }
        }
      }

      // 5. Heading Alignment Check (Stage 7)
      if (curr.heading !== undefined && curr.heading !== null && lastAccepted && lastAccepted.heading !== null) {
        // Calculate bearing between the points as a proxy segment heading
        const pathBearing = currentBearing !== null ? currentBearing : calculateBearing(
          lastAccepted.latitude, lastAccepted.longitude,
          curr.latitude, curr.longitude
        );

        const hDiff = Math.abs(curr.heading - pathBearing) % 360;
        const absDiff = hDiff > 180 ? 360 - hDiff : hDiff;

        if (absDiff < 30) {
          confidence += 15; // Heading aligns with travel path
        } else if (absDiff > 140 && absDiff < 220) {
          // Instant 180° flip at speed is penalized (opposite lane drift / jitter)
          if (currSpeedKmh > 15) {
            confidence -= 35;
          }
        }
      }

      // 6. Speed Consistency
      if (lastAccepted && lastAccepted.speed !== undefined) {
        const speedDiffKmh = Math.abs((curr.speed || 0) - (lastAccepted.speed || 0)) * 3.6;
        if (speedDiffKmh > 40) {
          confidence -= 15; // sudden speed spike penalizes confidence
        }
      }

      // 7. Time Gap Continuity
      if (timeDiffSec > 0) {
        if (timeDiffSec < 10) {
          confidence += 5; // frequent updates = more confidence
        } else if (timeDiffSec > 40) {
          confidence -= 10; // sparse updates = less confidence
        }
      }

      // 8. Distance Feasibility (physically reachable check)
      if (lastAccepted && timeDiffSec > 0) {
        const distM = geoService.calculateDistance(
          lastAccepted.latitude, lastAccepted.longitude,
          curr.latitude, curr.longitude
        ) * 1000;
        const maxFeasibleDist = Math.max(50, (lastAccepted.speed || 15) * timeDiffSec * 1.8);
        if (distM > maxFeasibleDist) {
          confidence -= 30; // physically unreachable at speed = likely GPS jump
        }
      }

      // --- PROBLEM 4: RECOVERY MODE PATH VERIFICATION ---
      if (isRecovery && lastAccepted) {
        const distM = geoService.calculateDistance(
          lastAccepted.latitude, lastAccepted.longitude,
          cand.latitude, cand.longitude
        ) * 1000;
        const maxFeasibleDist = Math.max(100, (lastAccepted.speed || 20) * timeDiffSec * 1.5);
        if (distM > maxFeasibleDist) {
          confidence -= 50; // Heavily penalize unreachable roads in recovery (never search whole city)
        }
      }

      // --- PROBLEM 10: MOTION SENSORS VALIDATION ---
      if (lastAccepted && curr.heading !== undefined && lastAccepted.heading !== null) {
        const headingDiff = Math.abs(curr.heading - lastAccepted.heading) % 360;
        const absHeadingDiff = headingDiff > 180 ? 360 - headingDiff : headingDiff;

        if (absHeadingDiff > 45) { // GPS indicates a turn
          let sensorSaysStraight = false;
          if (curr.sensors) {
            if (curr.sensors.motionState === 'straight') {
              sensorSaysStraight = true;
            } else if (curr.sensors.gyroscope && Math.abs(curr.sensors.gyroscope.z) < 0.05) {
              sensorSaysStraight = true;
            }
          } else if (curr.gyroscope && Math.abs(curr.gyroscope.z) < 0.05) {
            sensorSaysStraight = true;
          } else if (curr.accelerometer && curr.accelerometer.isGoingStraight) {
            sensorSaysStraight = true;
          }

          if (sensorSaysStraight) {
            confidence -= 40; // Reject turn
          }
        }
      }

      // 9. Number of Candidate Roads
      if (candidates.length >= 4) {
        confidence -= 5; // complex junction/dense area
      }

      // 10. Consensus queue boost (if this road has already started building consensus)
      if (consensusRoadId === cand.placeId) {
        confidence += (consensusPointsQueue.length * 10);
      }

      cand.roadConfidence = Math.max(0, Math.min(100, Math.round(confidence)));

      if (cand.roadConfidence > maxConfidence) {
        maxConfidence = cand.roadConfidence;
        bestCandidate = cand;
      }
    });

    // Determine the proposed road segment
    const proposedRoadId = bestCandidate ? bestCandidate.placeId : null;
    const proposedRoadName = bestCandidate ? bestCandidate.roadName : 'Unknown Road';

    // --- PROBLEM 2: ADAPTIVE CONFIDENCE THRESHOLD ---
    let adaptiveConfidenceThreshold = 80; // default: City
    let situation = 'City';

    if (isRecovery) {
      adaptiveConfidenceThreshold = 65;
      situation = 'Recovery Mode';
    } else if (currSpeedKmh > 70) {
      adaptiveConfidenceThreshold = 90;
      situation = 'Highway';
    } else if (candidates.length <= 1) {
      adaptiveConfidenceThreshold = 70;
      situation = 'Village';
    }

    // --- PROBLEM 5: ROAD LOCK TIMER (15 seconds) ---
    let isRoadLocked = false;
    let roadFirstAcceptedTime = null;

    if (lastAccepted) {
      roadFirstAcceptedTime = lastAccepted.timestamp;
      for (let hIdx = activeHistory.length - 1; hIdx >= 0; hIdx--) {
        if (activeHistory[hIdx].acceptedRoadId === lastAccepted.acceptedRoadId) {
          roadFirstAcceptedTime = activeHistory[hIdx].timestamp;
        } else {
          break;
        }
      }

      const elapsedLockSec = (new Date(curr.timestamp) - new Date(roadFirstAcceptedTime)) / 1000;
      if (elapsedLockSec < 15) {
        isRoadLocked = true;
      }
    }

    // --- PROBLEM 7: TURN DETECTION ---
    let isTurnDetected = false;
    if (lastAccepted && candidates.length >= 2) {
      const prevSpeedKmh = (lastAccepted.speed || 0) * 3.6;
      const speedReduced = currSpeedKmh < prevSpeedKmh * 0.8 || currSpeedKmh < 25;

      let headingChanged = false;
      if (currentBearing !== null && prevTravelHeading !== null) {
        const bearingDiff = Math.abs(currentBearing - prevTravelHeading) % 360;
        const absBearingDiff = bearingDiff > 180 ? 360 - bearingDiff : bearingDiff;
        headingChanged = absBearingDiff > 45 && absBearingDiff < 135;
      }

      const roadConnected = bestCandidate && isRoadConnected(bestCandidate.roadName, lastAccepted.roadName);

      if (speedReduced && headingChanged && roadConnected) {
        isTurnDetected = true;
      }
    }

    // --- PROBLEM 1: ADAPTIVE CONSENSUS LIMIT ---
    let requiredPoints = 3; // Default
    if (isTurnDetected) {
      requiredPoints = 1; // Instant transition on validated turn
    } else {
      if (currSpeedKmh < 15) requiredPoints = 4;
      else if (currSpeedKmh < 40) requiredPoints = 3;
      else requiredPoints = 2; // 40-70 or >70
    }

    // --- STAGE 6: CONSENSUS ENGINE ---
    let finalAcceptedRoadId = null;
    let finalAcceptedRoadName = '';
    let finalLat = curr.latitude;
    let finalLng = curr.longitude;
    let decisionReason = '';
    let transitionType = 'same_road';

    if (!lastAccepted) {
      // First point of session, initialize directly
      finalAcceptedRoadId = proposedRoadId || 'initial';
      finalAcceptedRoadName = proposedRoadName;
      if (bestCandidate) {
        finalLat = bestCandidate.latitude;
        finalLng = bestCandidate.longitude;
      }
      decisionReason = 'Initial road segment';
      transitionType = 'initial';
    }
    // Recovery Mode (Stage 8)
    else if (isRecovery) {
      // Apply adaptive confidence in recovery
      if (maxConfidence >= adaptiveConfidenceThreshold) {
        finalAcceptedRoadId = proposedRoadId || lastAccepted.acceptedRoadId;
        finalAcceptedRoadName = proposedRoadName || lastAccepted.roadName;
        if (bestCandidate) {
          finalLat = bestCandidate.latitude;
          finalLng = bestCandidate.longitude;
        }
        decisionReason = `Recovery mode; switched to road with confidence ${maxConfidence}% >= ${adaptiveConfidenceThreshold}%`;
        transitionType = 'recovery';
      } else {
        finalAcceptedRoadId = lastAccepted.acceptedRoadId;
        finalAcceptedRoadName = lastAccepted.roadName;
        finalLat = lastAccepted.snappedLatitude || lastAccepted.latitude;
        finalLng = lastAccepted.snappedLongitude || lastAccepted.longitude;
        decisionReason = `Recovery mode; confidence too low (${maxConfidence}% < ${adaptiveConfidenceThreshold}%); kept previous road`;
        transitionType = 'recovery_lock';
      }

      // Reset consensus queue
      consensusRoadId = null;
      consensusPointsQueue = [];
    }
    // Regular Points Processing
    else {
      // If proposed road matches the currently accepted road, continue
      if (proposedRoadId === lastAccepted.acceptedRoadId) {
        finalAcceptedRoadId = lastAccepted.acceptedRoadId;
        finalAcceptedRoadName = lastAccepted.roadName;
        if (bestCandidate) {
          finalLat = bestCandidate.latitude;
          finalLng = bestCandidate.longitude;
        }
        decisionReason = 'Same road continuation';
        transitionType = 'same_road';

        // Proposed road matches, reset consensus queue
        consensusRoadId = null;
        consensusPointsQueue = [];
      }
      // Proposing a new road segment (needs confidence threshold and consensus)
      else {
        // Enforce Road Lock & Adaptive Confidence
        // --- NEW STRICT CONNECTIVITY & PHYSICAL-REACH CHECKS ---
        // If the best candidate is not connected to the previous road, apply hard rejects
        if (lastAccepted && bestCandidate) {
          const isConnRoad = isRoadConnected(bestCandidate.roadName, lastAccepted.roadName);

          // Compute lateral (cross-track) distance from previous->current path to candidate
          const lateral = perpDistanceMeters(lastAccepted, curr, { latitude: bestCandidate.latitude, longitude: bestCandidate.longitude });

          // Candidate bearing from last accepted to candidate
          const candBearing = calculateBearing(lastAccepted.latitude, lastAccepted.longitude, bestCandidate.latitude, bestCandidate.longitude);
          const lastHeadingForCompare = lastAccepted.heading !== undefined && lastAccepted.heading !== null
            ? lastAccepted.heading
            : calculateBearing(lastAccepted.latitude, lastAccepted.longitude, curr.latitude, curr.longitude);
          const bearingDiff = angularDiff(candBearing, lastHeadingForCompare);

          // Distance between last accepted and current point
          const distLastToCurrM = geoService.calculateDistance(lastAccepted.latitude, lastAccepted.longitude, curr.latitude, curr.longitude) * 1000;

          // Intersection allowance: allow switch only if within 20m of intersection/turn
          const isAtIntersection = distLastToCurrM <= 20 && (isTurnDetected || Math.abs(currentBearing - (prevTravelHeading || currentBearing || 0)) > 30);

          // Road width incompatibility (if metadata provided)
          if (lastAccepted.roadWidth && bestCandidate.roadWidth) {
            const widthDiff = Math.abs((lastAccepted.roadWidth || 0) - (bestCandidate.roadWidth || 0));
            if (widthDiff > 10 && currSpeedKmh > 30) {
              // Reject obvious impossible width transition at speed
              finalAcceptedRoadId = lastAccepted.acceptedRoadId;
              finalAcceptedRoadName = lastAccepted.roadName;
              finalLat = lastAccepted.snappedLatitude || lastAccepted.latitude;
              finalLng = lastAccepted.snappedLongitude || lastAccepted.longitude;
              decisionReason = `Rejected switch: road width mismatch (${widthDiff}m) at speed ${currSpeedKmh.toFixed(1)} km/h`;
              transitionType = 'rejected_width_mismatch';

              // Clear consensus queue and continue
              consensusRoadId = null;
              consensusPointsQueue = [];
              // push validated point below as locked
              curr.acceptedRoadId = finalAcceptedRoadId;
              curr.acceptedSegmentId = finalAcceptedRoadId;
              curr.roadName = finalAcceptedRoadName;
              curr.snappedLatitude = finalLat;
              curr.snappedLongitude = finalLng;
              curr.roadTransitionType = transitionType;
              curr.decisionReason = decisionReason;
              curr.status = 'suspicious';
              validated.push(curr);
              // Add to active history and continue to next point
              activeHistory.push({ ...curr, acceptedRoadId: finalAcceptedRoadId });
              continue;
            }
          }

          // Opposite bearing check: immediate reject
          if (bearingDiff > 150 && !isAtIntersection) {
            finalAcceptedRoadId = lastAccepted.acceptedRoadId;
            finalAcceptedRoadName = lastAccepted.roadName;
            finalLat = lastAccepted.snappedLatitude || lastAccepted.latitude;
            finalLng = lastAccepted.snappedLongitude || lastAccepted.longitude;
            decisionReason = `Rejected switch: candidate bearing opposite (${bearingDiff}°)`;
            transitionType = 'rejected_opposite_bearing';

            consensusRoadId = null;
            consensusPointsQueue = [];
            curr.acceptedRoadId = finalAcceptedRoadId;
            curr.acceptedSegmentId = finalAcceptedRoadId;
            curr.roadName = finalAcceptedRoadName;
            curr.snappedLatitude = finalLat;
            curr.snappedLongitude = finalLng;
            curr.roadTransitionType = transitionType;
            curr.decisionReason = decisionReason;
            curr.status = 'suspicious';
            validated.push(curr);
            activeHistory.push({ ...curr, acceptedRoadId: finalAcceptedRoadId });
            continue;
          }

          // Lateral offset check: reject if significant and not at intersection
          if (lateral > 5 && !isAtIntersection) {
            finalAcceptedRoadId = lastAccepted.acceptedRoadId;
            finalAcceptedRoadName = lastAccepted.roadName;
            finalLat = lastAccepted.snappedLatitude || lastAccepted.latitude;
            finalLng = lastAccepted.snappedLongitude || lastAccepted.longitude;
            decisionReason = `Rejected switch: lateral offset ${lateral.toFixed(1)}m exceeds threshold and not at intersection`;
            transitionType = 'rejected_lateral_offset';

            consensusRoadId = null;
            consensusPointsQueue = [];
            curr.acceptedRoadId = finalAcceptedRoadId;
            curr.acceptedSegmentId = finalAcceptedRoadId;
            curr.roadName = finalAcceptedRoadName;
            curr.snappedLatitude = finalLat;
            curr.snappedLongitude = finalLng;
            curr.roadTransitionType = transitionType;
            curr.decisionReason = decisionReason;
            curr.status = 'suspicious';
            validated.push(curr);
            activeHistory.push({ ...curr, acceptedRoadId: finalAcceptedRoadId });
            continue;
          }

          // High-speed max lateral jump check (example: at 80 km/h, allow max 3m)
          if (currSpeedKmh >= 80 && lateral > 3) {
            finalAcceptedRoadId = lastAccepted.acceptedRoadId;
            finalAcceptedRoadName = lastAccepted.roadName;
            finalLat = lastAccepted.snappedLatitude || lastAccepted.latitude;
            finalLng = lastAccepted.snappedLongitude || lastAccepted.longitude;
            decisionReason = `Rejected switch: high-speed lateral jump (${lateral.toFixed(1)}m) impossible at ${currSpeedKmh.toFixed(1)} km/h`;
            transitionType = 'rejected_lateral_jump';

            consensusRoadId = null;
            consensusPointsQueue = [];
            curr.acceptedRoadId = finalAcceptedRoadId;
            curr.acceptedSegmentId = finalAcceptedRoadId;
            curr.roadName = finalAcceptedRoadName;
            curr.snappedLatitude = finalLat;
            curr.snappedLongitude = finalLng;
            curr.roadTransitionType = transitionType;
            curr.decisionReason = decisionReason;
            curr.status = 'suspicious';
            validated.push(curr);
            activeHistory.push({ ...curr, acceptedRoadId: finalAcceptedRoadId });
            continue;
          }

          // If candidate is not connected and none of the above allow conditions matched, disallow switching
          if (!isConnRoad && !isAtIntersection) {
            finalAcceptedRoadId = lastAccepted.acceptedRoadId;
            finalAcceptedRoadName = lastAccepted.roadName;
            finalLat = lastAccepted.snappedLatitude || lastAccepted.latitude;
            finalLng = lastAccepted.snappedLongitude || lastAccepted.longitude;
            decisionReason = 'Rejected switch: proposed road not connected to previous road and not at intersection';
            transitionType = 'rejected_not_connected';

            consensusRoadId = null;
            consensusPointsQueue = [];
            curr.acceptedRoadId = finalAcceptedRoadId;
            curr.acceptedSegmentId = finalAcceptedRoadId;
            curr.roadName = finalAcceptedRoadName;
            curr.snappedLatitude = finalLat;
            curr.snappedLongitude = finalLng;
            curr.roadTransitionType = transitionType;
            curr.decisionReason = decisionReason;
            curr.status = 'suspicious';
            validated.push(curr);
            activeHistory.push({ ...curr, acceptedRoadId: finalAcceptedRoadId });
            continue;
          }
        }

        const neededThreshold = isRoadLocked ? 95 : adaptiveConfidenceThreshold;
        const lockText = isRoadLocked ? ' (ROAD LOCKED)' : '';

        if (maxConfidence < neededThreshold) {
          finalAcceptedRoadId = lastAccepted.acceptedRoadId;
          finalAcceptedRoadName = lastAccepted.roadName;
          finalLat = lastAccepted.snappedLatitude || lastAccepted.latitude;
          finalLng = lastAccepted.snappedLongitude || lastAccepted.longitude;
          decisionReason = `New road proposed but confidence too low${lockText} (${maxConfidence}% < ${neededThreshold}%); locked to previous road`;
          transitionType = 'lock_previous';

          // Clear consensus queue
          consensusRoadId = null;
          consensusPointsQueue = [];
        } else {
          // Check consensus queue with segment-jitter resistance
          let isCompatible = false;
          if (consensusRoadId && consensusPointsQueue.length > 0) {
            if (consensusRoadId === proposedRoadId) {
              isCompatible = true;
            } else {
              const lastQueuedPoint = consensusPointsQueue[consensusPointsQueue.length - 1];
              // Retrieve candidate metadata
              const lastCand = lastQueuedPoint.candidateRoads?.find(c => c.placeId === consensusRoadId) ||
                (lastQueuedPoint.candidateRoads && lastQueuedPoint.candidateRoads[0]);
              const currCand = bestCandidate;

              if (lastCand && currCand && isRoadConnected(currCand.roadName, lastCand.roadName)) {
                isCompatible = true;
              } else {
                const lastLat = lastCand ? lastCand.latitude : (lastQueuedPoint.snappedLatitude || lastQueuedPoint.latitude);
                const lastLng = lastCand ? lastCand.longitude : (lastQueuedPoint.snappedLongitude || lastQueuedPoint.longitude);
                const currLat = currCand ? currCand.latitude : (curr.snappedLatitude || curr.latitude);
                const currLng = currCand ? currCand.longitude : (curr.snappedLongitude || curr.longitude);

                const distBetween = geoService.calculateDistance(lastLat, lastLng, currLat, currLng) * 1000;
                if (distBetween < 50) { // 50m tolerance for contiguous segments
                  isCompatible = true;
                }
              }
            }
          }

          if (isCompatible) {
            consensusPointsQueue.push(curr);
          } else {
            consensusRoadId = proposedRoadId;
            consensusPointsQueue = [curr];
          }

          // --- PROBLEM 8: GPS FREQUENCY / TIME-BASED CONSENSUS ---
          const firstQueuedTime = consensusPointsQueue[0] ? new Date(consensusPointsQueue[0].timestamp) : new Date(curr.timestamp);
          const timeOnNewRoadSec = (new Date(curr.timestamp) - firstQueuedTime) / 1000;
          const meetsTimeConsensus = (consensusPointsQueue.length >= 2 && timeOnNewRoadSec >= 8);

          // Trigger switch only if we have achieved point-based or time-based consensus
          if (consensusPointsQueue.length >= requiredPoints || meetsTimeConsensus) {
            const consensusReason = isTurnDetected
              ? 'Instant turn switch'
              : (meetsTimeConsensus ? `Time-based consensus achieved (${timeOnNewRoadSec.toFixed(1)}s)` : `Point-based consensus achieved (${consensusPointsQueue.length}/${requiredPoints})`);

            // Consensus achieved! Retroactively update queue points to the new road
            consensusPointsQueue.forEach((pt, qIdx) => {
              pt.acceptedRoadId = proposedRoadId;
              pt.acceptedSegmentId = proposedRoadId;
              pt.roadName = proposedRoadName;
              pt.snappedLatitude = bestCandidate ? bestCandidate.latitude : pt.latitude;
              pt.snappedLongitude = bestCandidate ? bestCandidate.longitude : pt.longitude;
              pt.roadTransitionType = 'consensus_switch';
              pt.decisionReason = `${consensusReason} at point ${qIdx + 1}/${consensusPointsQueue.length}`;
              pt.status = 'valid';
            });

            // Update current point details
            finalAcceptedRoadId = proposedRoadId;
            finalAcceptedRoadName = proposedRoadName;
            if (bestCandidate) {
              finalLat = bestCandidate.latitude;
              finalLng = bestCandidate.longitude;
            }
            decisionReason = consensusReason;
            transitionType = 'consensus_switch';

            // Clear consensus queue
            consensusRoadId = null;
            consensusPointsQueue = [];
          } else {
            // Consensus pending: keep drawing previously accepted road
            finalAcceptedRoadId = lastAccepted.acceptedRoadId;
            finalAcceptedRoadName = lastAccepted.roadName;
            finalLat = lastAccepted.snappedLatitude || lastAccepted.latitude;
            finalLng = lastAccepted.snappedLongitude || lastAccepted.longitude;
            decisionReason = `Consensus pending for new road ${proposedRoadName} (points: ${consensusPointsQueue.length}/${requiredPoints}, time: ${timeOnNewRoadSec.toFixed(1)}s/8s)`;
            transitionType = 'pending_consensus';
          }
        }
      }
    }

    // --- STAGE 5: ROAD VISIT COUNTER ---
    let visitNumber = 1;
    if (finalAcceptedRoadId) {
      if (finalAcceptedRoadId !== lastContiguousRoad) {
        const count = roadVisitMap.get(finalAcceptedRoadId) || 0;
        visitNumber = count + 1;
        roadVisitMap.set(finalAcceptedRoadId, visitNumber);
        lastContiguousRoad = finalAcceptedRoadId;
      } else {
        visitNumber = roadVisitMap.get(finalAcceptedRoadId) || 1;
      }
    }

    // --- PROBLEM 12: ROUNDABOUT & U-TURN DETECTION ---
    if (curr.heading !== undefined && curr.heading !== null && lastAccepted && lastAccepted.heading !== null) {
      const delta = Math.abs(curr.heading - lastAccepted.heading) % 360;
      const absDelta = delta > 180 ? 360 - delta : delta;

      if (absDelta > 150 && absDelta < 210) { // U-turn angle range
        const isRoundabout = candidates.length >= 3;

        if (isRoundabout) {
          // It's a roundabout, not a U-turn; do not reject, just log or let it pass
        } else if (currSpeedKmh > 20) {
          // Instant 180° flip at speed is rejected as GPS jitter
          curr.heading = lastAccepted.heading;
          decisionReason += ' (Instant U-turn heading spike rejected)';
        } else {
          decisionReason += ' (Valid U-turn detected)';
        }
      }
    }

    // Populate validated point attributes
    curr.acceptedRoadId = finalAcceptedRoadId;
    curr.acceptedSegmentId = finalAcceptedRoadId;
    curr.roadId = finalAcceptedRoadId;
    curr.roadSegmentId = finalAcceptedRoadId;
    curr.roadName = finalAcceptedRoadName;
    curr.snappedLatitude = finalLat;
    curr.snappedLongitude = finalLng;
    curr.visitNumber = visitNumber;
    curr.previousAcceptedRoad = lastAccepted ? lastAccepted.acceptedRoadId : null;
    curr.roadTransitionType = transitionType;
    curr.roadConfidence = maxConfidence >= 0 ? maxConfidence : 50;
    curr.qualityScore = gpsConfidence;
    curr.decisionReason = decisionReason;

    // Status resolution
    if (gpsConfidence < 30) {
      curr.status = 'suspicious';
      curr.routeStatus = 'failed';
    } else if (gpsConfidence < 50) {
      curr.status = 'weak';
      curr.routeStatus = 'raw';
    } else {
      curr.status = 'valid';
      curr.routeStatus = finalAcceptedRoadId && finalAcceptedRoadId !== 'initial' ? 'snapped' : 'raw';
    }

    validated.push(curr);

    // Add to active history for next point evaluations
    activeHistory.push({
      ...curr,
      acceptedRoadId: finalAcceptedRoadId
    });
  }

  // Handle flushing of unresolved pending consensus queue
  if (consensusPointsQueue.length > 0) {
    // If consensus was never achieved, these points keep drawing the last accepted road
    consensusPointsQueue.forEach(pt => {
      pt.acceptedRoadId = pt.previousAcceptedRoad;
      pt.acceptedSegmentId = pt.previousAcceptedRoad;
      pt.roadTransitionType = 'failed_consensus';
      pt.decisionReason = 'Failed to achieve consensus for road switch before batch end';
      pt.status = 'suspicious';
    });
  }

  return validated;
}

module.exports = {
  getTravelDirection,
  calculateBearing,
  validateTransitions
};
