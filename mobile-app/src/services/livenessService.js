// 100% On-Device Attendance Liveness & GPS Input Validation

export const MOBILE_CODES = Object.freeze({
  LIVENESS_VERIFIED: 'LIVENESS_VERIFIED',
  LIVENESS_CANCELLED: 'LIVENESS_CANCELLED',
  LIVENESS_ALREADY_OPEN: 'LIVENESS_ALREADY_OPEN',
  CAMERA_PERMISSION_DENIED: 'CAMERA_PERMISSION_DENIED',
  CAMERA_UNAVAILABLE: 'CAMERA_UNAVAILABLE',
  LIVENESS_TIMEOUT: 'LIVENESS_TIMEOUT',
  LIVENESS_NO_FACE: 'LIVENESS_NO_FACE',
  LIVENESS_MULTIPLE_FACES: 'LIVENESS_MULTIPLE_FACES',
  LIVENESS_FACE_OUT_OF_POSITION: 'LIVENESS_FACE_OUT_OF_POSITION',
  LIVENESS_FACE_CHANGED: 'LIVENESS_FACE_CHANGED',
  LIVENESS_TOO_DARK: 'LIVENESS_TOO_DARK',
  LIVENESS_TOO_BRIGHT: 'LIVENESS_TOO_BRIGHT',
  LIVENESS_UNSUPPORTED_BUILD: 'LIVENESS_UNSUPPORTED_BUILD',
  SELFIE_CAPTURE_FAILED: 'SELFIE_CAPTURE_FAILED',
  SELFIE_EXPIRED: 'SELFIE_EXPIRED',
  SELFIE_READ_FAILED: 'SELFIE_READ_FAILED',
  MOCK_LOCATION_DETECTED: 'MOCK_LOCATION_DETECTED',
  GPS_FIX_STALE: 'GPS_FIX_STALE',
  GPS_ACCURACY_TOO_LOW: 'GPS_ACCURACY_TOO_LOW',
  TELEPORTATION_DETECTED: 'TELEPORTATION_DETECTED',
  COORD_INVALID: 'COORD_INVALID',
  COORD_OUT_OF_RANGE: 'COORD_OUT_OF_RANGE',
  COORD_NULL_ISLAND: 'COORD_NULL_ISLAND',
  GPS_SIGNAL_WEAK: 'GPS_SIGNAL_WEAK',
  POINT_VALID: 'POINT_VALID',
});

export const SELFIE_MAX_AGE_MS = 3 * 60 * 1000; // 3 minutes

const PUNCH_MAX_FIX_AGE_MS = 90 * 1000;
const PUNCH_MAX_ACCURACY_M = 250;
const TRACKING_WEAK_ACCURACY_M = 100;
const TRACKING_MAX_FIX_AGE_MS = 120 * 1000;
const TRACKING_MAX_SPEED_KMH = 150;
const TRACKING_MIN_TELEPORT_DIST_M = 200;

export const haversineDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export const validatePunchLocationInput = (loc, now = Date.now()) => {
  if (
    !loc ||
    typeof loc.latitude !== 'number' ||
    typeof loc.longitude !== 'number' ||
    Number.isNaN(loc.latitude) ||
    Number.isNaN(loc.longitude)
  ) {
    return {
      valid: false,
      code: MOBILE_CODES.COORD_INVALID,
      message: 'Could not detect valid GPS coordinates. Please try again.',
    };
  }

  if (Math.abs(loc.latitude) > 90 || Math.abs(loc.longitude) > 180) {
    return {
      valid: false,
      code: MOBILE_CODES.COORD_OUT_OF_RANGE,
      message: 'Detected GPS coordinates are out of range.',
    };
  }

  if (loc.latitude === 0 && loc.longitude === 0) {
    return {
      valid: false,
      code: MOBILE_CODES.COORD_NULL_ISLAND,
      message: 'Waiting for real GPS lock. Please try again.',
    };
  }

  if (loc.mocked === true || loc.isMock === true) {
    return {
      valid: false,
      code: MOBILE_CODES.MOCK_LOCATION_DETECTED,
      message: 'Mock GPS / fake location app detected. Please disable mock location to mark attendance.',
    };
  }

  if (loc.timestamp && now - Number(loc.timestamp) > PUNCH_MAX_FIX_AGE_MS) {
    return {
      valid: false,
      code: MOBILE_CODES.GPS_FIX_STALE,
      message: 'GPS location is stale. Please refresh GPS and try again.',
    };
  }

  if (typeof loc.accuracy === 'number' && loc.accuracy > PUNCH_MAX_ACCURACY_M) {
    return {
      valid: false,
      code: MOBILE_CODES.GPS_ACCURACY_TOO_LOW,
      message: 'GPS signal accuracy is too weak (>250m). Please step near an open area and retry.',
    };
  }

  return { valid: true, code: MOBILE_CODES.POINT_VALID, message: null };
};

export const validateTrackingPoint = (point, prevPoint = null, now = Date.now()) => {
  if (
    !point ||
    typeof point.latitude !== 'number' ||
    typeof point.longitude !== 'number' ||
    Number.isNaN(point.latitude) ||
    Number.isNaN(point.longitude)
  ) {
    return {
      valid: false,
      status: 'rejected',
      code: MOBILE_CODES.COORD_INVALID,
      reason: 'Null or invalid coordinates',
    };
  }

  if (Math.abs(point.latitude) > 90 || Math.abs(point.longitude) > 180) {
    return {
      valid: false,
      status: 'rejected',
      code: MOBILE_CODES.COORD_OUT_OF_RANGE,
      reason: 'Coordinates out of range',
    };
  }

  if (point.latitude === 0 && point.longitude === 0) {
    return {
      valid: false,
      status: 'rejected',
      code: MOBILE_CODES.COORD_NULL_ISLAND,
      reason: 'Null island coordinate',
    };
  }

  if (point.isMock === true || point.mocked === true) {
    return {
      valid: false,
      status: 'rejected',
      code: MOBILE_CODES.MOCK_LOCATION_DETECTED,
      reason: 'Mock GPS location rejected',
    };
  }

  if (point.timestamp && now - Number(point.timestamp) > TRACKING_MAX_FIX_AGE_MS) {
    return {
      valid: false,
      status: 'rejected',
      code: MOBILE_CODES.GPS_FIX_STALE,
      reason: 'Stale GPS fix (>120s)',
    };
  }

  if (
    prevPoint &&
    prevPoint.tripId &&
    prevPoint.tripId === point.tripId &&
    prevPoint.timestamp &&
    point.timestamp
  ) {
    const dtSec = (Number(point.timestamp) - Number(prevPoint.timestamp)) / 1000;
    const distM = haversineDistance(
      prevPoint.latitude,
      prevPoint.longitude,
      point.latitude,
      point.longitude
    );
    if (dtSec > 0 && distM > TRACKING_MIN_TELEPORT_DIST_M) {
      const speedKmh = (distM / dtSec) * 3.6;
      if (speedKmh > TRACKING_MAX_SPEED_KMH) {
        return {
          valid: false,
          status: 'rejected',
          code: MOBILE_CODES.TELEPORTATION_DETECTED,
          reason: `Impossible GPS jump (${Math.round(speedKmh)} km/h)`,
        };
      }
    }
  }

  if (point.accuracy && point.accuracy > TRACKING_WEAK_ACCURACY_M) {
    return {
      valid: true,
      status: 'weak',
      code: MOBILE_CODES.GPS_SIGNAL_WEAK,
      reason: `Weak GPS signal (accuracy: ${point.accuracy}m)`,
    };
  }

  return {
    valid: true,
    status: 'valid',
    code: MOBILE_CODES.POINT_VALID,
    reason: null,
  };
};

export const ensureLivenessCameraPermission = async () => {
  const { Camera } = require('expo-camera');
  const currentPerm = await Camera.getCameraPermissionsAsync();
  let status = currentPerm?.status;
  if (status !== 'granted') {
    const requested = await Camera.requestCameraPermissionsAsync();
    status = requested?.status;
  }
  return status === 'granted';
};

export const hasNativeLivenessModule = () => {
  const { NativeModules, Platform } = require('react-native');
  return Platform.OS === 'android' && typeof NativeModules?.TrackFlowLiveness?.startLivenessCheck === 'function';
};

export const startLivenessVerification = async (purpose = 'punchIn') => {
  const granted = await ensureLivenessCameraPermission();
  if (!granted) {
    return {
      verified: false,
      code: MOBILE_CODES.CAMERA_PERMISSION_DENIED,
      message: 'Camera access is required to verify live attendance.',
      photo: null,
      capturedAt: null,
      stepsCompleted: [],
      durationMs: 0,
    };
  }

  if (!hasNativeLivenessModule()) {
    return {
      verified: false,
      useWebModal: true,
      code: MOBILE_CODES.LIVENESS_UNSUPPORTED_BUILD,
      message: 'Using in-app WebView liveness verifier.',
      photo: null,
      capturedAt: null,
      stepsCompleted: [],
      durationMs: 0,
    };
  }

  const { NativeModules } = require('react-native');
  const nativeLiveness = NativeModules.TrackFlowLiveness;

  const raw = await nativeLiveness.startLivenessCheck(purpose === 'punchOut' ? 'punchOut' : 'punchIn');
  const verified = Boolean(raw?.verified && (raw?.uri || raw?.base64));

  return {
    verified,
    code: raw?.code || (verified ? MOBILE_CODES.LIVENESS_VERIFIED : MOBILE_CODES.SELFIE_CAPTURE_FAILED),
    message: raw?.message || (verified ? 'Live presence verified.' : 'Live verification did not complete.'),
    photo: verified ? { uri: raw.uri || null, base64: raw.base64 || null } : null,
    capturedAt: raw?.capturedAt ? Number(raw.capturedAt) : Date.now(),
    stepsCompleted: Array.isArray(raw?.stepsCompleted) ? raw.stepsCompleted : [],
    durationMs: raw?.durationMs ? Number(raw.durationMs) : 0,
  };
};

