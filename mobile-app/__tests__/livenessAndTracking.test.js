const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const MOBILE_ROOT = path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.resolve(MOBILE_ROOT, rel), "utf8");

test("100% on-device liveness strictly accepts ONLY eye_blink & smile and auto-captures photo", () => {
  const analyzer = read("android/app/src/main/java/com/adesh/trackflow/liveness/LivenessAnalyzer.kt");
  const enumMatch = analyzer.match(/enum class LivenessStep[\s\S]*?\}/);
  assert.ok(enumMatch, "LivenessStep enum must exist in LivenessAnalyzer.kt");
  assert.ok(enumMatch[0].includes('EYE_BLINK("eye_blink")'), "Must support eye_blink");
  assert.ok(enumMatch[0].includes('SMILE("smile")'), "Must support smile");

  for (const forbidden of ["TURN_LEFT", "TURN_RIGHT", "NOD", "LOOK_UP", "LOOK_DOWN", "MOUTH_OPEN"]) {
    assert.ok(!enumMatch[0].includes(forbidden), `LivenessStep must not include ${forbidden}`);
  }

  const dialog = read("android/app/src/main/java/com/adesh/trackflow/liveness/LivenessDialog.kt");
  assert.ok(analyzer.includes('"Verified ✓"'), "Analyzer must emit 'Verified ✓' on completion");
  assert.ok(dialog.includes("captureVerifiedEmployeePhoto"), "Dialog must auto-capture employee photo after verification");

  const mainApp = read("android/app/src/main/java/com/adesh/trackflow/MainApplication.kt");
  assert.ok(mainApp.includes("LivenessPackage()"), "MainApplication.kt must register LivenessPackage()");

  const pkg = JSON.parse(read("package.json"));
  assert.ok(!pkg.dependencies["@rbayuokt/expo-face-vision"], "Must not depend on Sakshi face-vision package");
  assert.ok(!pkg.dependencies["expo-dev-client"], "Must not add expo-dev-client");
});

test("AttendanceScreen wires on-device liveness (Native + Expo Go WebView), Reopen Camera button, and fresh selfie check", () => {
  const attendance = read("src/screens/AttendanceScreen.js");
  assert.ok(attendance.includes("startLivenessVerification"), "Must invoke startLivenessVerification");
  assert.ok(attendance.includes("LivenessCameraModal"), "Must mount LivenessCameraModal for Expo Go support");
  assert.ok(attendance.includes("Liveness Verified ✓"), "Must display Liveness Verified ✓ badge");
  assert.ok(attendance.includes("Reopen Camera"), "Must display Reopen Camera button to recapture liveness photo");
  assert.ok(attendance.includes("clearExpiredSelfie"), "Must guard against expired selfies before punch");
  assert.ok(!attendance.includes("<CameraView"), "Manual shutter CameraView modal must be removed");
  assert.ok(!attendance.includes("return 'skipped'"), "Unreadable selfie must not silently submit 'skipped'");

  const webModal = read("src/components/LivenessCameraModal.js");
  assert.ok(webModal.includes('["eye_blink", "smile"]') && webModal.includes('["smile", "eye_blink"]'), "Expo Go modal must randomize ONLY eye_blink and smile");
  assert.ok(webModal.includes('"Verified ✓"'), "Expo Go modal must show 'Verified ✓'");
  assert.ok(webModal.includes("snapEmployeePhoto"), "Expo Go modal must auto-capture employee photo");
});

test("Punch GPS & route tracking validation enforce mock-GPS, stale-fix, accuracy, teleport, and offline sync", async () => {
  const { MOBILE_CODES, validatePunchLocationInput, validateTrackingPoint } = await import(
    "../src/services/livenessService.js"
  );

  const now = 1_700_000_000_000;

  assert.equal(
    validatePunchLocationInput({ latitude: 19.076, longitude: 72.8777, mocked: true, timestamp: now }, now).code,
    MOBILE_CODES.MOCK_LOCATION_DETECTED
  );
  assert.equal(
    validatePunchLocationInput({ latitude: 19.076, longitude: 72.8777, timestamp: now - 95_000 }, now).code,
    MOBILE_CODES.GPS_FIX_STALE
  );
  assert.equal(
    validatePunchLocationInput({ latitude: 19.076, longitude: 72.8777, accuracy: 310, timestamp: now }, now).code,
    MOBILE_CODES.GPS_ACCURACY_TOO_LOW
  );
  assert.equal(
    validatePunchLocationInput({ latitude: 19.076, longitude: 72.8777, accuracy: 18, timestamp: now }, now).valid,
    true
  );

  // Tracking point checks
  assert.equal(
    validateTrackingPoint({ latitude: 19.076, longitude: 72.8777, isMock: true, timestamp: now }, null, now).code,
    MOBILE_CODES.MOCK_LOCATION_DETECTED
  );
  assert.equal(
    validateTrackingPoint({ latitude: 19.076, longitude: 72.8777, timestamp: now - 130_000 }, null, now).code,
    MOBILE_CODES.GPS_FIX_STALE
  );

  const prev = { tripId: "trip-1", latitude: 19.076, longitude: 72.8777, timestamp: now - 5_000 };
  const jump = { tripId: "trip-1", latitude: 19.126, longitude: 72.8777, timestamp: now }; // ~5.5km in 5s
  assert.equal(validateTrackingPoint(jump, prev, now).code, MOBILE_CODES.TELEPORTATION_DETECTED);

  const weak = validateTrackingPoint({ tripId: "trip-1", latitude: 19.0761, longitude: 72.8778, accuracy: 140, timestamp: now }, prev, now);
  assert.equal(weak.valid, true);
  assert.equal(weak.code, MOBILE_CODES.GPS_SIGNAL_WEAK);

  const syncService = read("src/services/sync.service.js");
  assert.ok(syncService.includes("isOffline: row.isOffline === 1"), "sync.service.js must include isOffline in batch payload");

  const trackingService = read("src/services/tracking.service.js");
  assert.ok(trackingService.includes("isOffline"), "tracking.service.js must record offline state per point");
});

