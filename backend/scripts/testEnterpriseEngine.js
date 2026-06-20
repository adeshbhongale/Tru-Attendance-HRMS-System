const roadValidationService = require('../services/roadValidationService');

// Stub out geoService calculations for isolation
const geoService = require('../services/geoTrackingService');

// Mock data generator for testing scenarios
const baseTime = new Date('2026-06-20T12:00:00.000Z');

const testCases = [
  {
    name: '1. Standard Road Continuity (Same Road Continuation)',
    points: [
      {
        latitude: 16.7010,
        longitude: 74.4490,
        heading: 92,
        speed: 10,
        timestamp: new Date(baseTime.getTime()),
        accuracy: 10,
        placeId: 'google_road_A',
        roadName: 'Highway 1'
      },
      {
        latitude: 16.7011,
        longitude: 74.4498,
        heading: 92,
        speed: 10,
        timestamp: new Date(baseTime.getTime() + 10000), // +10s
        accuracy: 10,
        placeId: 'google_road_A',
        roadName: 'Highway 1'
      }
    ],
    assertions: (results) => {
      const p1 = results[0];
      const p2 = results[1];
      console.log(`  P1 matched: ${p1.roadId} (${p1.transitionReason})`);
      console.log(`  P2 matched: ${p2.roadId} (${p2.transitionReason})`);
      if (p2.roadId === 'google_road_A' && p2.transitionReason === 'same_road_continuation') {
        console.log('  ✓ PASSED');
        return true;
      }
      console.log('  ❌ FAILED');
      return false;
    }
  },
  {
    name: '2. Opposite Direction Rejection (Opposite Carriageway Jump)',
    points: [
      {
        latitude: 16.7010,
        longitude: 74.4490,
        heading: 92,
        speed: 12,
        timestamp: new Date(baseTime.getTime()),
        accuracy: 10,
        placeId: 'google_road_A',
        roadName: 'Highway 1 Eastbound'
      },
      {
        latitude: 16.7012, // slightly north opposite carriageway
        longitude: 74.4495,
        heading: 270, // Sudden opposite heading (270 vs 92)
        speed: 12,
        timestamp: new Date(baseTime.getTime() + 10000),
        accuracy: 10,
        placeId: 'google_road_B_opposite', // snapped to opposite road
        roadName: 'Highway 1 Westbound'
      }
    ],
    assertions: (results) => {
      const p2 = results[1];
      console.log(`  P2 proposed road: google_road_B_opposite, accepted: ${p2.roadId}`);
      console.log(`  P2 status: ${p2.status}, reason: ${p2.transitionReason}`);
      if (p2.status === 'suspicious' && p2.transitionReason.includes('opposite_direction')) {
        console.log('  ✓ PASSED');
        return true;
      }
      console.log('  ❌ FAILED');
      return false;
    }
  },
  {
    name: '3. Parallel Road Drift Rejection (Service Road Jump)',
    points: [
      {
        latitude: 16.7010,
        longitude: 74.4490,
        heading: 92,
        speed: 15,
        timestamp: new Date(baseTime.getTime()),
        accuracy: 10,
        placeId: 'google_highway',
        roadName: 'Highway 1'
      },
      {
        latitude: 16.7012, // GPS drift moves 30m sideways
        longitude: 74.4492,
        heading: 92,
        speed: 15,
        timestamp: new Date(baseTime.getTime() + 5000), // +5s
        accuracy: 10,
        placeId: 'google_parallel_service_road', // snaps to service road
        roadName: 'Parallel Service Road'
      }
    ],
    assertions: (results) => {
      const p2 = results[1];
      console.log(`  P2 proposed road: google_parallel_service_road, accepted: ${p2.roadId}`);
      console.log(`  P2 status: ${p2.status}, reason: ${p2.transitionReason}`);
      if (p2.roadId === 'google_highway' && p2.transitionReason === 'parallel_road_jump_rejected') {
        console.log('  ✓ PASSED');
        return true;
      }
      console.log('  ❌ FAILED');
      return false;
    }
  },
  {
    name: '4. Sharp U-Turn Consensus Confirmation (3-Point Validation)',
    points: [
      {
        // P1: Heading East
        latitude: 16.7010,
        longitude: 74.4490,
        heading: 92,
        speed: 8,
        timestamp: new Date(baseTime.getTime()),
        accuracy: 8,
        placeId: 'highway_east',
        roadName: 'Highway 1 Eastbound'
      },
      {
        // P2: Sudden heading change, speed reduced
        latitude: 16.7010,
        longitude: 74.4489,
        heading: 160, // turn starts
        speed: 3,
        timestamp: new Date(baseTime.getTime() + 5000),
        accuracy: 8,
        placeId: 'highway_west',
        roadName: 'Highway 1 Westbound'
      },
      {
        // P3: Turning further
        latitude: 16.7009,
        longitude: 74.4485,
        heading: 210, // turning
        speed: 3,
        timestamp: new Date(baseTime.getTime() + 10000),
        accuracy: 8,
        placeId: 'highway_west',
        roadName: 'Highway 1 Westbound'
      },
      {
        // P4: Heading West confirmed
        latitude: 16.7008,
        longitude: 74.4480,
        heading: 270, // heading west
        speed: 6,
        timestamp: new Date(baseTime.getTime() + 15000),
        accuracy: 8,
        placeId: 'highway_west',
        roadName: 'Highway 1 Westbound'
      }
    ],
    assertions: (results) => {
      const p2 = results[1];
      const p3 = results[2];
      const p4 = results[3];
      console.log(`  P2 reason: ${p2.transitionReason}, roadId: ${p2.roadId}`);
      console.log(`  P3 reason: ${p3.transitionReason}, roadId: ${p3.roadId}`);
      console.log(`  P4 reason: ${p4.transitionReason}, roadId: ${p4.roadId}`);
      
      const p4Accepted = p4.roadId === 'highway_west' && p4.transitionReason.includes('consensus_u_turn_confirmed');
      if (p4Accepted) {
        console.log('  ✓ PASSED (U-turn confirmed by 3-point consensus)');
        return true;
      }
      console.log('  ❌ FAILED');
      return false;
    }
  },
  {
    name: '5. Small Village Road Transition (Connected Road + Reduced Speed)',
    points: [
      {
        latitude: 16.7010,
        longitude: 74.4490,
        heading: 92,
        speed: 15, // 54 km/h highway speed
        timestamp: new Date(baseTime.getTime()),
        accuracy: 10,
        placeId: 'highway',
        roadName: 'National Highway'
      },
      {
        latitude: 16.7011,
        longitude: 74.4492,
        heading: 10, // turned north onto village road
        speed: 3, // speed reduced to 10 km/h
        timestamp: new Date(baseTime.getTime() + 8000),
        accuracy: 10,
        placeId: 'village_road',
        roadName: 'Village Link Road'
      }
    ],
    assertions: (results) => {
      const p2 = results[1];
      console.log(`  P2 road: ${p2.roadId}, speed: ${p2.speed} m/s, reason: ${p2.transitionReason}`);
      if (p2.roadId === 'village_road' && p2.transitionReason.includes('road_transition_accepted')) {
        console.log('  ✓ PASSED (Village road accepted immediately due to low speed)');
        return true;
      }
      console.log('  ❌ FAILED');
      return false;
    }
  }
];

function runTests() {
  console.log('==================================================');
  console.log('RUNNING ENTERPRISE GPS ROAD VALIDATION ENGINE TESTS');
  console.log('==================================================\n');

  let passedCount = 0;

  testCases.forEach((tc) => {
    console.log(`Test: ${tc.name}`);
    const results = roadValidationService.validateTransitions(tc.points);
    const passed = tc.assertions(results);
    if (passed) passedCount++;
    console.log('--------------------------------------------------\n');
  });

  console.log(`Result: ${passedCount}/${testCases.length} tests passed.\n`);
  if (passedCount === testCases.length) {
    console.log('STATUS: ALL TESTS PASSED SUCCESSFULLY! 🚀');
    process.exit(0);
  } else {
    console.log('STATUS: SOME TESTS FAILED. CHECK ENGINE LOGIC.');
    process.exit(1);
  }
}

runTests();
