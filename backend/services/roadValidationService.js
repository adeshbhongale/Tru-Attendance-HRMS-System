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

    // Find previous accepted point reference
    const lastAccepted = activeHistory.length > 0 
      ? activeHistory[activeHistory.length - 1] 
      : null;

    // --- STAGE 2: GPS QUALITY ENGINE ---
    const gpsConfidence = calculateGPSConfidence(curr, lastAccepted);
    curr.gpsConfidence = gpsConfidence;

    // Time gap calculation
    const timeDiffSec = lastAccepted
      ? (new Date(curr.timestamp) - new Date(lastAccepted.timestamp)) / 1000
      : 0;
    curr.gpsGap = timeDiffSec;

    const isRecovery = lastAccepted && timeDiffSec >= 20;
    curr.isRecoveryPoint = isRecovery;

    // --- STAGE 3: ROAD CANDIDATE ENGINE ---
    const candidates = curr.candidateRoads || [];

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
        if (cand.placeId === lastAccepted.acceptedRoadId) {
          confidence += 15; // Staying on the same road
        } else {
          // 4. Connected Road Topology (names match or similar)
          const name1 = (cand.roadName || '').toLowerCase();
          const name2 = (lastAccepted.roadName || '').toLowerCase();
          if (name1 && name2 && (name1 === name2 || name1.includes(name2) || name2.includes(name1))) {
            confidence += 15;
          }
        }
      }

      // 5. Heading Alignment Check (Stage 7)
      if (curr.heading !== undefined && curr.heading !== null && lastAccepted && lastAccepted.heading !== null) {
        // Calculate bearing between the points as a proxy segment heading
        const pathBearing = calculateBearing(
          lastAccepted.latitude, lastAccepted.longitude,
          curr.latitude, curr.longitude
        );

        const hDiff = Math.abs(curr.heading - pathBearing) % 360;
        const absDiff = hDiff > 180 ? 360 - hDiff : hDiff;

        if (absDiff < 30) {
          confidence += 15; // Heading aligns with travel path
        } else if (absDiff > 140 && absDiff < 220) {
          // Instant 180° flip at speed is penalized (opposite lane drift / jitter)
          if ((curr.speed || 0) * 3.6 > 15) {
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

    // --- STAGE 6: THREE-POINT CONSENSUS ENGINE ---
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
      // Re-initialize from the best candidate directly due to the long gap
      finalAcceptedRoadId = proposedRoadId || lastAccepted.acceptedRoadId;
      finalAcceptedRoadName = proposedRoadName || lastAccepted.roadName;
      if (bestCandidate) {
        finalLat = bestCandidate.latitude;
        finalLng = bestCandidate.longitude;
      }
      decisionReason = 'Recovery mode after GPS signal loss';
      transitionType = 'recovery';
      
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
        // Enforce Road Confidence Engine: Only switch if the new road's confidence is >= 80% (Stage 9)
        if (maxConfidence < 80) {
          finalAcceptedRoadId = lastAccepted.acceptedRoadId;
          finalAcceptedRoadName = lastAccepted.roadName;
          finalLat = lastAccepted.snappedLatitude || lastAccepted.latitude;
          finalLng = lastAccepted.snappedLongitude || lastAccepted.longitude;
          decisionReason = `New road proposed but confidence too low (${maxConfidence}% < 80%); locked to previous road`;
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

              const cleanName1 = (lastCand?.roadName || '').replace(/\s*\(.*\)\s*/g, '').trim().toLowerCase();
              const cleanName2 = (currCand?.roadName || '').replace(/\s*\(.*\)\s*/g, '').trim().toLowerCase();

              if (cleanName1 && cleanName2 && cleanName1 !== 'unknown road' && cleanName1 === cleanName2) {
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

          // Trigger switch only if we have 3 consecutive confirmations (Stage 6)
          if (consensusPointsQueue.length >= 3) {
            // Consensus achieved! Retroactively update queue points to the new road
            consensusPointsQueue.forEach((pt, qIdx) => {
              pt.acceptedRoadId = proposedRoadId;
              pt.acceptedSegmentId = proposedRoadId;
              pt.roadName = proposedRoadName;
              pt.snappedLatitude = bestCandidate ? bestCandidate.latitude : pt.latitude;
              pt.snappedLongitude = bestCandidate ? bestCandidate.longitude : pt.longitude;
              pt.roadTransitionType = 'consensus_switch';
              pt.decisionReason = `Road switch consensus achieved at point ${qIdx + 1}/3`;
              pt.status = 'valid';
            });

            // Update current point details
            finalAcceptedRoadId = proposedRoadId;
            finalAcceptedRoadName = proposedRoadName;
            if (bestCandidate) {
              finalLat = bestCandidate.latitude;
              finalLng = bestCandidate.longitude;
            }
            decisionReason = 'Road switch consensus achieved';
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
            decisionReason = `Consensus pending for new road ${proposedRoadName} (${consensusPointsQueue.length}/3)`;
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

    // --- STAGE 7: DIRECTION ENGINE / U-TURN VALIDATION ---
    if (curr.heading !== undefined && curr.heading !== null) {
      headingHistory.push(curr.heading);
      if (headingHistory.length > 5) headingHistory.shift();

      // Check if U-turn occurred
      if (activeHistory.length >= 3) {
        const prevHeading = activeHistory[activeHistory.length - 1].heading;
        if (prevHeading !== null && prevHeading !== undefined) {
          const delta = Math.abs(curr.heading - prevHeading) % 360;
          const absDelta = delta > 180 ? 360 - delta : delta;

          // Sudden 180° flip at speed
          if (absDelta > 150 && (curr.speed || 0) * 3.6 > 25) {
            // Check if there was gradual steering in heading history
            let gradualChange = false;
            for (let k = 1; k < headingHistory.length; k++) {
              const diff = Math.abs(headingHistory[k] - headingHistory[k - 1]) % 360;
              const absDiff = diff > 180 ? 360 - diff : diff;
              if (absDiff > 15 && absDiff < 80) {
                gradualChange = true;
                break;
              }
            }

            if (!gradualChange) {
              // instantaneous flip: reject as glitch, clamp to previous heading
              curr.heading = prevHeading;
              decisionReason += ' (Instant U-turn heading spike rejected)';
            }
          }
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
  if (consensusPointsQueue.length > 0 && consensusPointsQueue.length < 3) {
    // These points keep drawing the last accepted road since consensus was never achieved
    consensusPointsQueue.forEach(pt => {
      pt.acceptedRoadId = pt.previousAcceptedRoad;
      pt.acceptedSegmentId = pt.previousAcceptedRoad;
      pt.roadTransitionType = 'failed_consensus';
      pt.decisionReason = 'Failed to achieve 3-point consensus for road switch';
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
