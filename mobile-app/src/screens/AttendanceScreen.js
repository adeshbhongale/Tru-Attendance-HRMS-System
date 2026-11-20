import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Location from 'expo-location';
import {
  Camera,
  CheckCircle,
  ChevronRight,
  Coffee,
  Eye,
  MapPin,
  PlayCircle,
  RotateCcw,
  ShieldAlert,
  X
} from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import api from '../api/axios';
// import { useSidebar } from '../context/SidebarContext'; // SIDEBAR COMMENTED OUT
import HRModuleFooter from '../components/HRModuleFooter';
import LivenessCameraModal from '../components/LivenessCameraModal';
import {
  haversineDistance,
  MOBILE_CODES,
  SELFIE_MAX_AGE_MS,
  startLivenessVerification,
  validatePunchLocationInput,
} from '../services/livenessService';
import socket from '../socket';
import { formatWorkingHours } from '../utils/timeFormat';

const LOCATION_TRACKING_TASK = 'background-location-tracking';

const getISTDateString = (date) => {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  // Shift by 5.5 hours to represent it in IST (UTC +5:30)
  const istTime = new Date(d.getTime() + (5.5 * 60 * 60 * 1000));
  const year = istTime.getUTCFullYear();
  const month = String(istTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(istTime.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getSelfieUri = (s) => {
  if (!s || s === 'skipped') return null;
  if (typeof s === 'object') {
    if (s.uri) return s.uri;
    if (s.assets && s.assets[0]?.uri) return s.assets[0].uri;
    if (s.assets && s.assets[0]?.base64) {
      const b = s.assets[0].base64;
      return b.startsWith('data:') ? b : `data:image/jpeg;base64,${b}`;
    }
    if (s.base64) {
      const b = s.base64;
      return b.startsWith('data:') ? b : `data:image/jpeg;base64,${b}`;
    }
  }
  if (typeof s === 'string') {
    const str = s.trim();
    if (str.startsWith('http://') || str.startsWith('https://') || str.startsWith('file://') || str.startsWith('data:image/')) {
      const upgraded = str.replace(/^http:\/\/res\.cloudinary\.com\//, 'https://res.cloudinary.com/');
      if (!__DEV__ && upgraded.startsWith('http://')) {
        return upgraded.replace(/^http:\/\//i, 'https://');
      }
      return upgraded;
    }
    if (str.length > 30) {
      return str.startsWith('data:') ? str : `data:image/jpeg;base64,${str}`;
    }
    return str;
  }
  return null;
};

const AttendanceScreen = ({ navigation }) => {
  // const { openSidebar } = useSidebar(); // SIDEBAR COMMENTED OUT

  useEffect(() => {
    const fetchData = () => {
      verifyBackgroundPermission();
      getLocation(true);
      fetchUser();
      fetchOfficeSettings();
    };

    fetchData();

    // Re-check permissions and location when app returns from Settings
    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        verifyBackgroundPermission();
        getLocation(true);
      }
    });

    const unsubscribe = navigation.addListener('focus', () => {
      fetchData();
    });

    return () => {
      appStateSub.remove();
      unsubscribe();
    };
  }, [navigation]);

  const [user, setUser] = useState(null);

  const [selfie, setSelfie] = useState(null);
  const [selfieCapturedAt, setSelfieCapturedAt] = useState(null);
  const [livenessVerified, setLivenessVerified] = useState(false);
  const [livenessBusy, setLivenessBusy] = useState(false);
  const [webLivenessVisible, setWebLivenessVisible] = useState(false);
  const [location, setLocation] = useState(null);
  const [locationLoading, setLocationLoading] = useState(true);
  const [punchLoading, setPunchLoading] = useState(false);
  const [punchLoadingMessage, setPunchLoadingMessage] = useState('');

  const [todayAttendance, setTodayAttendance] = useState(null);
  const [office, setOffice] = useState(null);
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [mapFull, setMapFull] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const [apiError, setApiError] = useState(null);

  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
  const [backendShiftStatus, setBackendShiftStatus] = useState(null);
  const [hasBackgroundPermission, setHasBackgroundPermission] = useState(Platform.OS !== 'android');
  const [earlyPunchOutModal, setEarlyPunchOutModal] = useState(false);
  const [earlyPunchOutReason, setEarlyPunchOutReason] = useState('');
  const [earlyShiftEndLabel, setEarlyShiftEndLabel] = useState('');

  const verifyBackgroundPermission = async () => {
    if (Platform.OS === 'android') {
      try {
        const bg = await Location.getBackgroundPermissionsAsync();
        const granted = bg?.status === 'granted';
        setHasBackgroundPermission(granted);
        return granted;
      } catch (_) {
        setHasBackgroundPermission(false);
        return false;
      }
    }
    return true;
  };

  const alreadyPunchedIn = !!todayAttendance?.punchIn?.time;
  const alreadyPunchedOut = !!todayAttendance?.punchOut?.time;

  const fetchUser = async () => {
    try {
      const res = await api.get('/auth/me');
      const userData = res.data?.data;
      setUser(userData);
      setTodayAttendance(res.data?.todayAttendance || null);
      setBackendShiftStatus(res.data?.shiftStatus || null);
      if (userData?._id) {
        try {
          socket.emit('join', userData._id);
          await AsyncStorage.setItem('userId', userData._id);
        } catch (_) { }
      }
      setApiError(null);
    } catch (err) {
      console.warn('[AttendanceScreen] fetchUser error:', err.message);
      if (err?.response?.status === 401) {
        return; // Session expired or employee removed — global auth interceptor handles redirect
      }
      setApiError(err?.response?.data?.message || 'Unable to connect to server. Please tap retry.');
    }
  };

  const fetchOfficeSettings = async () => {
    try {
      const res = await api.get('/settings/office');
      setOffice(res.data?.data || null);
    } catch (err) {
      console.warn('[AttendanceScreen] fetchOfficeSettings error:', err.message);
    }
  };

  const calculateDistance = haversineDistance;

  const extractLocationFix = (locObj) => {
    if (!locObj?.coords || typeof locObj.coords.latitude !== 'number') return null;
    return {
      ...locObj.coords,
      mocked: Boolean(locObj.mocked || locObj.coords.mocked),
      timestamp: locObj.timestamp || Date.now(),
    };
  };

  useEffect(() => {
    if (location && office) {
      const d = calculateDistance(
        location.latitude,
        location.longitude,
        office.latitude,
        office.longitude
      );
      setDistance(d);
    }
  }, [location, office]);

  // Re-fetch location when office settings change so geofence check updates fast
  const prevOfficeRef = useRef(null);
  useEffect(() => {
    if (office && prevOfficeRef.current) {
      const prev = prevOfficeRef.current;
      if (prev.latitude !== office.latitude || prev.longitude !== office.longitude || prev.radius !== office.radius) {
        getLocation();
      }
    }
    prevOfficeRef.current = office;
  }, [office]);

  // Ref to prevent geocode race conditions
  const geocodeRef = useRef(0);

  // Fast fused location resolver (fused watcher + low + balanced parallel race)
  const fetchFastLocationFix = () => {
    return new Promise(async (resolve) => {
      let resolved = false;
      let watchSub = null;

      const finish = (coords, source) => {
        if (!resolved && coords && typeof coords.latitude === 'number') {
          resolved = true;
          if (watchSub) {
            try { watchSub.remove(); } catch (e) { }
          }
          resolve(coords);
        }
      };

      // 1. One-shot watchPosition (GPS / Fused provider fires in 100-300ms on Android)
      try {
        watchSub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 300,
            distanceInterval: 0,
          },
          (loc) => {
            const fix = extractLocationFix(loc);
            if (fix) finish(fix, 'watchPositionAsync');
          }
        );
      } catch (watchErr) {
        // silent
      }

      // 2. Parallel Fast High Accuracy (Direct GPS / Mock GPS hardware fix)
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
        .then(res => { const fix = extractLocationFix(res); if (fix) finish(fix, 'getCurrentPosition(High)'); })
        .catch(() => { });

      // 3. Parallel Balanced accuracy (Fast Network fix, silently handled)
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        .then(res => { const fix = extractLocationFix(res); if (fix) finish(fix, 'getCurrentPosition(Balanced)'); })
        .catch(() => { });

      // 4. Safety timeout: if nothing resolved in 4 seconds, finish
      setTimeout(() => {
        if (!resolved) {
          if (watchSub) {
            try { watchSub.remove(); } catch (e) { }
          }
          console.warn('[AttendanceScreen] Fast location resolver reached safety timeout');
          resolve(null);
        }
      }, 4000);
    });
  };

  // Dedicated Actual Address Resolver (Native OS Reverse Geocoding primary; optional env key fallback)
  const resolveActualAddress = async (coords) => {
    if (!coords || typeof coords.latitude !== 'number' || typeof coords.longitude !== 'number') return null;
    let addr = null;

    // Native OS reverse geocoding (zero API key exposure)
    try {
      const geocode = await Location.reverseGeocodeAsync({
        latitude: coords.latitude,
        longitude: coords.longitude,
      });
      if (geocode && geocode[0]) {
        const g = geocode[0];
        const parts = [g.name, g.street, g.city || g.subregion, g.region].filter(Boolean);
        if (parts.length > 0) {
          addr = parts.join(', ');
        }
      }
    } catch (geoErr) { }
    return addr;
  };

  const getLocation = async (silentOnMount = false) => {
    console.log('[AttendanceScreen] getLocation called');
    try {
      setLocationLoading(true);

      // 1. Check if location services are enabled on the phone
      try {
        const hasServices = await Location.hasServicesEnabledAsync();
        if (!hasServices) {
          if (!silentOnMount) {
            try {
              await Location.enableNetworkProviderAsync();
            } catch (enableErr) { }
          }

          const recheck = await Location.hasServicesEnabledAsync();
          if (!recheck) {
            if (!silentOnMount) {
              setToast({ show: true, message: 'Please turn on GPS/Location on your device.', type: 'error' });
              setTimeout(() => setToast(prev => ({ ...prev, show: false })), 3000);
            }
            setLocationLoading(false);
            return null;
          }
        }
      } catch (svcErr) { }

      // 2. Check and request foreground permissions with Prominent Disclosure if not yet granted
      let { status: fgStatus } = await Location.getForegroundPermissionsAsync();
      if (fgStatus !== 'granted') {
        if (silentOnMount) {
          setLocationLoading(false);
          return null;
        }
        const userAcceptedDisclosure = await new Promise((resolve) => {
          Alert.alert(
            'Location Access Disclosure',
            'Gatimaan collects your location to verify workplace geofence compliance during attendance punch-in and punch-out.',
            [
              { text: 'Not Now', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Continue', onPress: () => resolve(true) },
            ],
            { cancelable: false }
          );
        });
        if (userAcceptedDisclosure) {
          const req = await Location.requestForegroundPermissionsAsync();
          fgStatus = req.status;
        }
      }

      if (fgStatus !== 'granted') {
        setToast({ show: true, message: 'Location permission is required to mark attendance.', type: 'error' });
        setTimeout(() => setToast(prev => ({ ...prev, show: false })), 3000);
        setLocationLoading(false);
        return null;
      }

      let resolvedCoords = null;

      // 3. STEP 0: Check OS / Hardware Last Known Position (0ms) & Immediately Update Range
      try {
        const lastKnown = await Location.getLastKnownPositionAsync({ maxAge: 60000 });
        const lastFix = extractLocationFix(lastKnown);
        if (lastFix) {
          resolvedCoords = {
            ...lastFix,
            address: 'Detecting address...',
          };
          setLocation(resolvedCoords);
          if (office && office.latitude && office.longitude) {
            const d = calculateDistance(lastFix.latitude, lastFix.longitude, office.latitude, office.longitude);
            setDistance(d);
          }
          setLocationLoading(false);
        }
      } catch (lastErr) { }

      // 4. STEP 1: Fast Fused Location Resolver & Instant Range Calculation
      const fastCoords = await fetchFastLocationFix();

      if (fastCoords) {
        resolvedCoords = {
          ...fastCoords,
          address: resolvedCoords?.address && resolvedCoords.address !== 'Detecting address...' ? resolvedCoords.address : 'Detecting address...',
        };
        setLocation(prev => ({
          ...fastCoords,
          address: prev?.address && prev.address !== 'Detecting address...' ? prev.address : 'Detecting address...',
        }));
        if (office && office.latitude && office.longitude) {
          const d = calculateDistance(fastCoords.latitude, fastCoords.longitude, office.latitude, office.longitude);
          setDistance(d);
        }
        setLocationLoading(false);
      } else if (!resolvedCoords && !location) {
        // Fallback: try High accuracy as reliable GPS fix
        try {
          const fallbackLoc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
          const fbFix = extractLocationFix(fallbackLoc);
          if (fbFix) {
            resolvedCoords = {
              ...fbFix,
              address: 'Detecting address...',
            };
            setLocation(resolvedCoords);
            if (office && office.latitude && office.longitude) {
              const d = calculateDistance(fbFix.latitude, fbFix.longitude, office.latitude, office.longitude);
              setDistance(d);
            }
          }
        } catch (e) { }
      }

      setLocationLoading(false);

      // 5. STEP 2: Background Reverse Geocoding for clean actual address
      const targetLoc = resolvedCoords || fastCoords || location;
      if (targetLoc && targetLoc.latitude && targetLoc.longitude) {
        const geocodeId = ++geocodeRef.current;
        (async () => {
          const addr = await resolveActualAddress(targetLoc);
          if (addr && geocodeRef.current === geocodeId) {
            console.log('[AttendanceScreen] Reverse geocode resolved actual address:', addr);
            setLocation(prev => prev ? ({ ...prev, address: addr }) : prev);
          }
        })();
      }
      return targetLoc || null;
    } catch (err) {
      console.error('[AttendanceScreen] getLocation top-level error:', err);
      setLocationLoading(false);
      setToast({ show: true, message: 'Could not detect location. Please tap retry.', type: 'error' });
      setTimeout(() => setToast(prev => ({ ...prev, show: false })), 2500);
      return null;
    } finally {
      setLocationLoading(false);
    }
  };

  // Ensure attendance/complete day status is based on the current date
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  // Use todayStr for filtering/comparing attendance records
  // Example usage:
  // const isDayComplete = attendanceRecords.some(record => record.date === todayStr && record.status === 'Present');
  const getShiftStatus = () => {
    if (alreadyPunchedIn && alreadyPunchedOut) {
      return { allowed: false, status: 'Completed', message: 'Attendance Complete' };
    }
    return { allowed: true };
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([verifyBackgroundPermission(), getLocation(), fetchUser(), fetchOfficeSettings()]);
    setRefreshing(false);
  };

  // Enterprise Tracking Controller
  useEffect(() => {
    const punchedIn = !!todayAttendance?.punchIn?.time;
    const punchedOut = !!todayAttendance?.punchOut?.time;
    if (punchedIn && !punchedOut && todayAttendance?._id) {
      const { startTrackingSession } = require('../services/trackingManager');
      startTrackingSession(todayAttendance._id);
    }
  }, [todayAttendance]);

  const clearSelfieState = () => {
    setSelfie(null);
    setSelfieCapturedAt(null);
    setLivenessVerified(false);
  };

  const applyLivenessResult = (result) => {
    if (
      !result ||
      result.code === MOBILE_CODES.LIVENESS_CANCELLED ||
      result.code === MOBILE_CODES.LIVENESS_ALREADY_OPEN
    ) {
      return;
    }

    if (!result.verified || !result.photo) {
      setToast({ show: true, message: result.message || 'Live verification failed. Please try again.', type: 'error' });
      setTimeout(() => setToast(prev => ({ ...prev, show: false })), 2500);
      return;
    }

    setSelfie(result.photo);
    setSelfieCapturedAt(result.capturedAt || Date.now());
    setLivenessVerified(true);
    setToast({ show: true, message: 'Verified ✓ Photo captured!', type: 'success' });
    setTimeout(() => setToast(prev => ({ ...prev, show: false })), 2000);
  };

  const takeSelfie = async () => {
    if (livenessBusy || webLivenessVisible || punchLoading) return;
    let openedWebModal = false;
    try {
      setLivenessBusy(true);
      clearSelfieState();
      const result = await startLivenessVerification(alreadyPunchedIn ? 'punchOut' : 'punchIn');

      if (result.code === MOBILE_CODES.CAMERA_PERMISSION_DENIED) {
        Alert.alert(
          'Camera Permission Required',
          'Camera access is required to verify live attendance.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings().catch(() => {}) },
          ]
        );
        return;
      }

      if (result.useWebModal) {
        openedWebModal = true;
        setWebLivenessVisible(true);
        return;
      }

      applyLivenessResult(result);
    } catch (err) {
      console.warn('[AttendanceScreen] takeSelfie error:', err);
      setToast({ show: true, message: `Camera error: ${err.message || 'Could not open camera'}`, type: 'error' });
      setTimeout(() => setToast(prev => ({ ...prev, show: false })), 2000);
    } finally {
      if (!openedWebModal) {
        setLivenessBusy(false);
      }
    }
  };

  const clearExpiredSelfie = () => {
    if (selfie && (!livenessVerified || !selfieCapturedAt || Date.now() - selfieCapturedAt > SELFIE_MAX_AGE_MS)) {
      clearSelfieState();
      setToast({ show: true, message: 'Verified photo expired — reopening live check...', type: 'error' });
      setTimeout(() => setToast(prev => ({ ...prev, show: false })), 2500);
      takeSelfie();
      return true;
    }
    return false;
  };

  // Helper: get current location quickly (for use when punching without pre-loaded location)
  const getQuickLocation = async () => {
    try {
      const existingPerm = await Location.getForegroundPermissionsAsync();
      if (existingPerm.status !== 'granted') {
        return await getLocation();
      }

      // 1. Instantaneous cached OS position (<=60s)
      try {
        const lastKnown = await Location.getLastKnownPositionAsync({ maxAge: 60000 });
        const lastFix = extractLocationFix(lastKnown);
        if (lastFix) {
          const quickLoc = { ...lastFix, address: location?.address || 'Detecting address...' };
          setLocation(quickLoc);
          return quickLoc;
        }
      } catch (e) { }

      // 2. Fast fused resolver
      const fastCoords = await fetchFastLocationFix();
      if (fastCoords) {
        const quickLoc = { ...fastCoords, address: location?.address || 'Detecting address...' };
        setLocation(quickLoc);
        return quickLoc;
      }
    } catch (e) {
      console.warn('[AttendanceScreen] Quick location failed:', e.message);
    }
    return null;
  };

  const ensureValidatedPunchLocation = async () => {
    let candidate = location;
    if (!candidate || typeof candidate.latitude !== 'number') {
      setPunchLoading(true);
      candidate = await getQuickLocation();
    }

    let check = validatePunchLocationInput(candidate);
    if (
      !check.valid &&
      (check.code === MOBILE_CODES.GPS_FIX_STALE ||
        check.code === MOBILE_CODES.GPS_ACCURACY_TOO_LOW ||
        check.code === MOBILE_CODES.COORD_INVALID)
    ) {
      setPunchLoading(true);
      const freshFix = await fetchFastLocationFix();
      if (freshFix) {
        candidate = {
          ...freshFix,
          address: candidate?.address || location?.address || 'Detecting address...',
        };
        setLocation(candidate);
        check = validatePunchLocationInput(candidate);
      }
    }

    if (!check.valid) {
      setPunchLoading(false);
      if (check.code === MOBILE_CODES.MOCK_LOCATION_DETECTED) {
        Alert.alert('Mock Location Detected', check.message);
      } else {
        setToast({ show: true, message: check.message, type: 'error' });
        setTimeout(() => setToast(prev => ({ ...prev, show: false })), 2500);
      }
      return null;
    }

    let actualAddress = candidate.address;
    if (!actualAddress || actualAddress === 'Detecting address...' || actualAddress.includes('Detecting')) {
      actualAddress = office?.name || `GPS: ${candidate.latitude.toFixed(5)}, ${candidate.longitude.toFixed(5)}`;
      candidate = { ...candidate, address: actualAddress };
    }
    return candidate;
  };

  // Helper: Extract selfie payload for API submission
  const getSelfiePayload = async (selfieObj) => {
    if (!selfieObj) return null;
    if (selfieObj.base64) {
      return selfieObj.base64.startsWith('data:') ? selfieObj.base64 : `data:image/jpeg;base64,${selfieObj.base64}`;
    }
    // Safe fallback: if base64 was dropped by camera memory, read from local URI
    if (selfieObj.uri) {
      try {
        const base64Data = await FileSystem.readAsStringAsync(selfieObj.uri, {
          encoding: FileSystem.EncodingType ? FileSystem.EncodingType.Base64 : 'base64',
        });
        if (base64Data) {
          return `data:image/jpeg;base64,${base64Data}`;
        }
      } catch (e) {
        console.warn('[AttendanceScreen] FileSystem readAsStringAsync error:', e.message);
      }
    }
    return null;
  };

  // Helper: Extract selfie URI for local preview
  const getSelfieUriForPreview = (selfieObj) => {
    if (!selfieObj) return null;
    return selfieObj.uri || (selfieObj.base64 ? (selfieObj.base64.startsWith('data:') ? selfieObj.base64 : `data:image/jpeg;base64,${selfieObj.base64}`) : null);
  };

  const handlePunchIn = async (bypassBgCheck = false) => {
    if (clearExpiredSelfie()) return;
    // 1. Verify Foreground Location permission FIRST (Android 11-16 requires foreground location to be granted before requesting background location)
    try {
      let fgPerm = await Location.getForegroundPermissionsAsync();
      if (fgPerm?.status !== 'granted') {
        setPunchLoading(false);
        const acceptedFg = await new Promise((resolve) => {
          Alert.alert(
            'Location Access Disclosure',
            'Gatimaan collects your location to verify workplace geofence compliance during attendance punch-in and punch-out.',
            [
              { text: 'Not Now', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Continue', onPress: () => resolve(true) },
            ],
            { cancelable: false }
          );
        });
        if (!acceptedFg) {
          return;
        }
        fgPerm = await Location.requestForegroundPermissionsAsync();
        if (fgPerm?.status !== 'granted') {
          Alert.alert(
            'Location Permission Required',
            'Location permission is required to mark attendance within your office geofence.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: () => Linking.openSettings().catch(() => {}) },
            ]
          );
          return;
        }
      }
    } catch (fgErr) {
      console.warn('[AttendanceScreen] Foreground permission check error:', fgErr?.message);
    }

    // 2. Check background location permission on Android ONLY after foreground location is granted and employee has live route tracking enabled
    const requiresBackgroundTracking = user?.trackingEnabled !== false;
    if (Platform.OS === 'android' && requiresBackgroundTracking && !bypassBgCheck) {
      try {
        const bgPerm = await Location.getBackgroundPermissionsAsync();
        if (bgPerm?.status !== 'granted') {
          setHasBackgroundPermission(false);
          setPunchLoading(false);
          Alert.alert(
            'Background Location Disclosure',
            'Gatimaan collects location data in the background to enable live field route tracking and attendance geofence compliance while you are punched in, even when the app is closed or not in use.\n\nPlease enable "Allow all the time" location access to punch in.',
            [
              {
                text: 'Not Now',
                style: 'cancel',
              },
              {
                text: 'Grant Background Access',
                onPress: async () => {
                  try {
                    const reqBg = await Location.requestBackgroundPermissionsAsync();
                    if (reqBg?.status === 'granted') {
                      setHasBackgroundPermission(true);
                    } else {
                      Alert.alert(
                        'Background Location Permission',
                        'Select "Allow all the time" in App Settings to unlock Punch In.',
                        [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Open Settings', onPress: () => Linking.openSettings() },
                        ]
                      );
                    }
                  } catch (_) {
                    Alert.alert(
                      'Background Location Permission',
                      'Select "Allow all the time" in App Settings to unlock Punch In.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Open Settings', onPress: () => Linking.openSettings() },
                      ]
                    );
                  }
                }
              },
            ]
          );
          return;
        }
        setHasBackgroundPermission(true);
      } catch (permErr) {
        console.warn('[AttendanceScreen] Background permission check error:', permErr?.message);
        setHasBackgroundPermission(false);
        return;
      }
    }

    if (!selfie || !livenessVerified) {
      setToast({ show: true, message: 'Live face verification is required before punching in.', type: 'error' });
      setTimeout(() => setToast(prev => ({ ...prev, show: false })), 2000);
      return;
    }

    // 3. Ensure live, unspoofed GPS coordinates are ready
    const punchLocation = await ensureValidatedPunchLocation();
    if (!punchLocation) return;

    // Background location permission verified at top of handlePunchIn

    setPunchLoading(true);
    setPunchLoadingMessage('Verifying & Punching in...');
    setToast({ show: true, message: 'Verifying & Punching in...', type: 'info' });

    const capturedSelfiePayload = await getSelfiePayload(selfie);
    if (!capturedSelfiePayload) {
      setPunchLoading(false);
      setPunchLoadingMessage('');
      clearSelfieState();
      setToast({ show: true, message: 'Could not read verified photo. Please reopen camera.', type: 'error' });
      setTimeout(() => setToast(prev => ({ ...prev, show: false })), 2500);
      return;
    }
    const capturedSelfieUri = getSelfieUriForPreview(selfie);

    try {
      // 1. Record punch-in session (Sends selfie directly; backend uploads to Cloudinary asynchronously in background)
      const res = await api.post('/attendance/punch-in', {
        latitude: punchLocation.latitude,
        longitude: punchLocation.longitude,
        address: punchLocation.address,
        selfie: capturedSelfiePayload,
      });

      const updated = res.data?.data;
      if (updated) {
        if (updated.punchIn && !updated.punchIn.selfie && capturedSelfieUri) {
          updated.punchIn.selfie = capturedSelfieUri;
        }
        setTodayAttendance(updated);
      }
      clearSelfieState(); // Clear selfie after punch
      setToast({ show: true, message: 'Punched In successfully!', type: 'success' });
      setTimeout(() => {
        setToast(prev => ({ ...prev, show: false }));
      }, 2000);
    } catch (err) {
      setToast({ show: true, message: err.response?.data?.message || 'Could not punch in. Please try again.', type: 'error' });
      setTimeout(() => setToast(prev => ({ ...prev, show: false })), 2000);
    } finally {
      setPunchLoading(false);
      setPunchLoadingMessage('');
    }
  };

  const getEarlyPunchOutInfo = () => {
    const liveShift = (user?.shift && typeof user.shift === 'object' && user.shift.startTime && user.shift.endTime) ? user.shift : null;
    const shift = liveShift || todayAttendance?.shiftInfo;
    if (!shift || typeof shift !== 'object' || !shift.startTime || !shift.endTime) {
      return { isEarly: false, endLabel: '' };
    }
    const halfDaySession = todayAttendance?.halfDaySession || null;
    let startStr = shift.startTime;
    let endStr = shift.endTime;
    if (halfDaySession === 'Session 1') {
      startStr = shift.secondSession?.startTime || '14:00';
      endStr = shift.secondSession?.endTime || shift.endTime || '18:00';
    } else if (halfDaySession === 'Session 2') {
      startStr = shift.firstSession?.startTime || shift.startTime || '09:30';
      endStr = shift.firstSession?.endTime || '14:00';
    }
    const [sH, sM] = String(startStr).split(':').map(Number);
    const [eH, eM] = String(endStr).split(':').map(Number);
    if (isNaN(sH) || isNaN(eH)) return { isEarly: false, endLabel: '' };

    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
    const refDate = todayAttendance?.date ? new Date(todayAttendance.date) : new Date();
    const refIST = new Date(refDate.getTime() + IST_OFFSET_MS);
    const y = refIST.getUTCFullYear();
    const m = refIST.getUTCMonth();
    const d = refIST.getUTCDate();

    const makeISTDate = (yr, mo, dy, hr, mi) => new Date(Date.UTC(yr, mo, dy, hr, mi, 0, 0) - IST_OFFSET_MS);
    let shiftEnd = makeISTDate(y, m, d, eH, eM || 0);
    if (eH < sH || (eH === sH && (eM || 0) < (sM || 0))) {
      shiftEnd = makeISTDate(y, m, d + 1, eH, eM || 0);
    }
    const isEarly = Date.now() < shiftEnd.getTime();
    return { isEarly, endLabel: endStr };
  };

  const executePunchOut = async (earlyReason = '') => {
    if (clearExpiredSelfie()) return;
    if (!selfie || !livenessVerified) {
      setToast({ show: true, message: 'Live face verification is required before punching out.', type: 'error' });
      setTimeout(() => setToast(prev => ({ ...prev, show: false })), 2000);
      return;
    }

    const punchLocation = await ensureValidatedPunchLocation();
    if (!punchLocation) return;

    setPunchLoading(true);
    setPunchLoadingMessage('Verifying & Punching out...');
    setToast({ show: true, message: 'Verifying & Punching out...', type: 'info' });

    const capturedSelfiePayload = await getSelfiePayload(selfie);
    if (!capturedSelfiePayload) {
      setPunchLoading(false);
      setPunchLoadingMessage('');
      clearSelfieState();
      setToast({ show: true, message: 'Could not read verified photo. Please reopen camera.', type: 'error' });
      setTimeout(() => setToast(prev => ({ ...prev, show: false })), 2500);
      return;
    }
    const capturedSelfieUri = getSelfieUriForPreview(selfie);

    try {
      const payload = {
        latitude: punchLocation.latitude,
        longitude: punchLocation.longitude,
        address: punchLocation.address,
        selfie: capturedSelfiePayload,
      };
      if (earlyReason && earlyReason.trim()) {
        payload.earlyPunchOutReason = earlyReason.trim();
      }
      // 1. Record punch-out session (Sends selfie directly; backend uploads to Cloudinary asynchronously in background)
      const res = await api.post('/attendance/punch-out', payload);

      const updated = res.data?.data;
      if (updated) {
        if (updated.punchOut && !updated.punchOut.selfie && capturedSelfieUri) {
          updated.punchOut.selfie = capturedSelfieUri;
        }
        setTodayAttendance(updated);
      }
      setEarlyPunchOutModal(false);
      setEarlyPunchOutReason('');
      clearSelfieState(); // Clear selfie after punch
      // Clear persistent tracking session upon punch out
      try {
        const { clearTrackingSession } = require('../services/trackingManager');
        await clearTrackingSession();
      } catch (clearErr) {
        console.warn('Failed to clear tracking session:', clearErr);
      }

      const sentForApproval = updated?.earlyPunchOutRequest?.status === 'PENDING';
      setToast({
        show: true,
        message: sentForApproval
          ? 'Punched Out! Early punch-out request sent to Reporting Manager.'
          : 'Punched Out successfully!',
        type: 'success',
      });
      setTimeout(() => {
        setToast(prev => ({ ...prev, show: false }));
      }, 2500);
    } catch (err) {
      if (err.response?.data?.requireEarlyReason) {
        setEarlyShiftEndLabel(err.response?.data?.shiftEndLabel || '');
        setEarlyPunchOutModal(true);
      }
      setToast({ show: true, message: err.response?.data?.message || 'Could not punch out. Please try again.', type: 'error' });
      setTimeout(() => setToast(prev => ({ ...prev, show: false })), 2500);
    } finally {
      setPunchLoading(false);
      setPunchLoadingMessage('');
    }
  };

  const handlePunchOut = async () => {
    if (clearExpiredSelfie()) return;
    if (!selfie || !livenessVerified) {
      setToast({ show: true, message: 'Live face verification is required before punching out.', type: 'error' });
      setTimeout(() => setToast(prev => ({ ...prev, show: false })), 2000);
      return;
    }

    const earlyInfo = getEarlyPunchOutInfo();
    if (earlyInfo.isEarly) {
      setEarlyShiftEndLabel(earlyInfo.endLabel);
      setEarlyPunchOutReason('');
      setEarlyPunchOutModal(true);
      return;
    }

    Alert.alert('Confirm Punch Out', 'Are you sure you want to end your shift?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Punch Out',
        style: 'destructive',
        onPress: () => executePunchOut(''),
      },
    ]);
  };

  const handleSubmitEarlyPunchOut = () => {
    const trimmed = earlyPunchOutReason.trim();
    if (trimmed.length < 3) {
      Alert.alert('Reason Required', 'Please enter a valid reason for punching out before shift end time (at least 3 characters).');
      return;
    }
    executePunchOut(trimmed);
  };

  const executeToggleBreak = async () => {
    try {
      setPunchLoading(true);
      const res = await api.post('/attendance/break');
      setTodayAttendance(res.data.data);
      setToast({ show: true, message: res.data.message || 'Break updated', type: 'success' });
      setTimeout(() => setToast(prev => ({ ...prev, show: false })), 2000);
    } catch (err) {
      setToast({ show: true, message: err.response?.data?.message || 'Could not toggle break.', type: 'error' });
      setTimeout(() => setToast(prev => ({ ...prev, show: false })), 2000);
    } finally {
      setPunchLoading(false);
    }
  };

  const handleToggleBreak = () => {
    const isEnding = todayAttendance?.breaks?.some(b => !b.endTime);
    Alert.alert(
      isEnding ? 'End Break' : 'Start Break',
      isEnding
        ? 'Are you sure you want to end your break session and resume work?'
        : 'Are you sure you want to start a break session?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isEnding ? 'End Break' : 'Start Break',
          onPress: executeToggleBreak,
        },
      ]
    );
  };

  return (
    <View className="flex-1 bg-slate-50">
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View className="pt-14 px-6 pb-5 bg-blue-600 border-b border-slate-100 flex-row justify-between items-center">
        <View className="flex-row items-center">
          {/* SIDEBAR BUTTON COMMENTED OUT
          <TouchableOpacity
            className="w-10 h-10 rounded-xl bg-slate-50 justify-center items-center border border-slate-100 mr-4"
            onPress={openSidebar}
          >
            <Menu size={20} color="#64748b" />
          </TouchableOpacity>
          */}
          <View>
            <Text className="text-2xl font-extrabold text-white tracking-tight">Attendance</Text>
            <Text className="text-white font-bold text-xs">Verify location to mark</Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={onRefresh}
          className="w-10 h-10 rounded-xl bg-slate-50 justify-center items-center border border-slate-100"
        >
          <RotateCcw size={18} color="#64748b" />
        </TouchableOpacity>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 24, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4f46e5']} />
        }
      >
        {/* Connection Error Banner with Instant Retry */}
        {apiError && (
          <View className="bg-rose-50 border border-rose-200 rounded-2xl p-4 mb-4 flex-row items-center justify-between shadow-sm">
            <View className="flex-1 mr-3">
              <Text className="text-xs font-extrabold text-rose-800">Connection Error</Text>
              <Text className="text-[11px] text-rose-600 font-semibold mt-0.5">{apiError}</Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                setApiError(null);
                getLocation();
                fetchUser();
                fetchOfficeSettings();
              }}
              className="bg-rose-600 px-3.5 py-2 rounded-xl flex-row items-center shadow-sm"
              activeOpacity={0.8}
            >
              <RotateCcw size={13} color="#ffffff" />
              <Text className="text-xs font-bold text-white ml-1.5">Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Location Card */}
        <View className="bg-white rounded-3xl p-5 border border-slate-100 mb-5 shadow-sm">
          <View className="flex-row items-center">
            <View className="w-12 h-12 rounded-2xl bg-indigo-50 justify-center items-center">
              <MapPin size={22} color="#4f46e5" />
            </View>
            <View className="ml-4 flex-1">
              <Text className="text-[10px] font-bold text-slate-400 tracking-widest">YOUR LOCATION</Text>
              {locationLoading && !location ? (
                <View className="flex-row items-center mt-1">
                  <ActivityIndicator size="small" color="#4f46e5" />
                  <Text className="text-xs font-bold text-indigo-600 ml-2">Detecting location...</Text>
                </View>
              ) : location ? (
                <>
                  <Text className="text-sm font-bold text-slate-800 mt-0.5">{location.address || 'Detecting address...'}</Text>
                  <View className="flex-row items-center mt-1">
                    {office && distance <= office.radius ? (
                      <>
                        <CheckCircle size={12} color="#10b981" />
                        <Text className="text-xs font-bold text-emerald-600 ml-1">In Office Range</Text>
                      </>
                    ) : office ? (
                      <>
                        <X size={12} color="#f43f5e" />
                        <Text className="text-xs font-bold text-rose-500 ml-1">Outside Office · {Math.round(distance - office.radius)}m away</Text>
                      </>
                    ) : (
                      <>
                        <CheckCircle size={12} color="#10b981" />
                        <Text className="text-xs font-bold text-emerald-600 ml-1">Location Detected</Text>
                      </>
                    )}
                  </View>
                  {/* Subtle Outstation Indicator */}
                  {(todayAttendance?.isOutstation || (office && distance >= (office.outstationThreshold || 150000))) && (
                    <View className="mt-2.5 pt-2 border-t border-slate-100 flex-row items-center justify-between">
                      <View className="flex-row items-center flex-1 mr-5">
                        <View className="w-1.5 h-1.5 rounded-full bg-purple-600 mr-1.5" />
                        <Text className="text-[11px] font-bold text-purple-800">Outstation Duty</Text>
                        <Text className="text-[10px] text-slate-400 font-medium ml-1" numberOfLines={1}>
                          · {todayAttendance?.outstationDistanceKm || Math.round(distance / 1000)} km from office
                        </Text>
                      </View>
                      {/* <View className="bg-purple-50 border border-purple-200/60 px-1.5 py-0.5 rounded">
                        <Text className="text-[9px] font-bold text-purple-700 ml-2">150+ km</Text>
                      </View> */}
                    </View>
                  )}
                </>
              ) : (
                <View className="mt-1">
                  <Text className="text-sm font-bold text-rose-500">Location not detected</Text>
                  <TouchableOpacity
                    onPress={getLocation}
                    className="mt-1.5 bg-indigo-50 border border-indigo-200 rounded-xl px-2.5 py-1 flex-row items-center self-start"
                    activeOpacity={0.8}
                  >
                    <RotateCcw size={11} color="#4f46e5" />
                    <Text className="text-[11px] font-bold text-indigo-600 ml-1">Retry GPS Fix</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
            <View className="flex-row items-center gap-2">
              <TouchableOpacity onPress={getLocation} className="p-2 bg-indigo-50 rounded-xl">
                <RotateCcw size={16} color="#4f46e5" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Selfie Section - only if punch action is pending */}
        {!alreadyPunchedOut && selfie && (() => {
          const selfieUri = selfie?.uri || (selfie?.base64 ? (selfie.base64.startsWith('data:') ? selfie.base64 : `data:image/jpeg;base64,${selfie.base64}`) : (typeof selfie === 'string' ? selfie : null));
          return (
            <View className="mb-5 items-center">
              <View className="w-48 h-48 rounded-3xl bg-slate-100 border-2 border-emerald-500 overflow-hidden shadow-sm relative">
                {selfieUri ? (
                  <Image
                    source={{ uri: selfieUri }}
                    style={{ width: '100%', height: '100%' }}
                    resizeMode="cover"
                    onError={(e) => {
                      console.warn('[AttendanceScreen] Selfie preview render error:', e.nativeEvent?.error);
                    }}
                  />
                ) : null}

                {/* Top Left Eye (Preview) & Top Right Reopen Liveness Camera */}
                <TouchableOpacity
                  onPress={() => setPreviewImage(selfieUri)}
                  className="absolute top-2.5 left-2.5 w-8 h-8 rounded-full bg-black/60 justify-center items-center shadow-sm"
                  activeOpacity={0.7}
                >
                  <Eye size={16} color="white" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={takeSelfie}
                  disabled={punchLoading || livenessBusy}
                  className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-indigo-600 justify-center items-center shadow-sm"
                  activeOpacity={0.7}
                >
                  <RotateCcw size={15} color="white" />
                </TouchableOpacity>
              </View>

              <View className="flex-row items-center mt-2.5 gap-2">
                <View className="flex-row items-center bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-full">
                  <CheckCircle size={13} color="#059669" />
                  <Text className="text-[11px] font-extrabold text-emerald-700 ml-1.5">Liveness Verified ✓</Text>
                </View>
                <TouchableOpacity
                  onPress={takeSelfie}
                  disabled={punchLoading || livenessBusy}
                  className="flex-row items-center bg-indigo-50 border border-indigo-200 px-3 py-1.5 rounded-full"
                  activeOpacity={0.8}
                >
                  <RotateCcw size={12} color="#4f46e5" />
                  <Text className="text-[11px] font-extrabold text-indigo-600 ml-1.5">Reopen Camera</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })()}

        {/* Background Location Disclosure Notice (shown if background location is revoked while punched in) */}
        {Platform.OS === 'android' && user?.trackingEnabled !== false && !hasBackgroundPermission && alreadyPunchedIn && !alreadyPunchedOut && (
          <View className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4 flex-row items-center justify-between">
            <View className="flex-1 mr-3">
              <View className="flex-row items-center mb-1">
                <ShieldAlert size={16} color="#d97706" />
                <Text className="text-amber-800 font-bold text-xs ml-1.5 tracking-wide">
                  Background Location Disclosure
                </Text>
              </View>
              <Text className="text-amber-700 text-xs">
                Gatimaan collects location data in the background for live field route tracking while punched in, even when the app is closed or not in use.
              </Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={async () => {
                try {
                  let fg = await Location.getForegroundPermissionsAsync();
                  if (fg?.status !== 'granted') {
                    Alert.alert(
                      'Location Access Disclosure',
                      'Gatimaan requires foreground location access first to verify your attendance punch-in/out location.',
                      [
                        { text: 'Not Now', style: 'cancel' },
                        {
                          text: 'Continue',
                          onPress: async () => {
                            const reqFg = await Location.requestForegroundPermissionsAsync();
                            if (reqFg?.status === 'granted') {
                              getLocation(true);
                            } else {
                              Alert.alert(
                                'Location Permission Required',
                                'Please enable Location permission in App Settings to continue.',
                                [
                                  { text: 'Cancel', style: 'cancel' },
                                  { text: 'Open Settings', onPress: () => Linking.openSettings() },
                                ]
                              );
                            }
                          },
                        },
                      ]
                    );
                    return;
                  }
                  Alert.alert(
                    'Background Location Disclosure',
                    'Gatimaan collects location data in the background to enable live field route tracking and attendance geofence compliance while you are punched in, even when the app is closed or not in use.',
                    [
                      { text: 'Not Now', style: 'cancel' },
                      {
                        text: 'Continue',
                        onPress: async () => {
                          const reqBg = await Location.requestBackgroundPermissionsAsync();
                          if (reqBg?.status === 'granted') {
                            setHasBackgroundPermission(true);
                          } else {
                            Alert.alert(
                              'Background Location Permission',
                              'Select "Allow all the time" in App Settings to enable background route tracking while on duty.',
                              [
                                { text: 'Cancel', style: 'cancel' },
                                { text: 'Open Settings', onPress: () => Linking.openSettings() },
                              ]
                            );
                          }
                        },
                      },
                    ]
                  );
                } catch (_) { }
              }}
              className="bg-amber-600 px-3 py-2 rounded-xl"
            >
              <Text className="text-white font-bold text-xs">Allow</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Action Button */}
        {(() => {
          const activeShiftStatus = (backendShiftStatus && !backendShiftStatus.allowed) ? backendShiftStatus : getShiftStatus();
          // Shift being 'Upcoming' should not block employee from punching in early on a new day
          const isShiftBlocked = activeShiftStatus && !activeShiftStatus.allowed && activeShiftStatus.status !== 'Upcoming';
          if (alreadyPunchedOut || isShiftBlocked) {
            return (
              <View className="rounded-3xl p-8 items-center border bg-slate-100 border-slate-200">
                <View className="w-16 h-16 rounded-full justify-center items-center mb-4 bg-emerald-100">
                  <CheckCircle size={32} color="#10b981" />
                </View>
                <Text className="font-extrabold text-lg text-slate-800">
                  {alreadyPunchedOut ? 'Attendance Complete' : activeShiftStatus.message}
                </Text>
                <Text className="text-slate-500 font-bold text-sm mt-1 text-center">
                  {alreadyPunchedOut
                    ? 'You have finished your shift for today.'
                    : (activeShiftStatus.detail || 'Attendance is currently unavailable.')}
                </Text>
              </View>
            );
          }

          // Hide Punch In button until "Allow all the time" background location is enabled for tracked employees
          if (!alreadyPunchedIn && Platform.OS === 'android' && user?.trackingEnabled !== false && hasBackgroundPermission !== true) {
            return (
              <View className="rounded-3xl p-6 items-center border bg-amber-50/70 border-amber-200">
                <View className="w-14 h-14 rounded-2xl justify-center items-center mb-3 bg-amber-100">
                  <ShieldAlert size={28} color="#d97706" />
                </View>
                <Text className="font-extrabold text-base text-slate-800 text-center">
                  Enable "Allow all the time" Location
                </Text>
                <Text className="text-slate-600 font-semibold text-xs mt-1.5 text-center leading-relaxed">
                  Punch In becomes available once Location permission is set to "Allow all the time" for active duty route tracking.
                </Text>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={async () => {
                    try {
                      let fg = await Location.getForegroundPermissionsAsync();
                      if (fg?.status !== 'granted') {
                        Alert.alert(
                          'Location Access Disclosure',
                          'Gatimaan requires foreground location access first to verify your attendance punch-in/out location.',
                          [
                            { text: 'Not Now', style: 'cancel' },
                            {
                              text: 'Continue',
                              onPress: async () => {
                                const reqFg = await Location.requestForegroundPermissionsAsync();
                                if (reqFg?.status === 'granted') {
                                  getLocation(true);
                                } else {
                                  Alert.alert(
                                    'Location Permission Required',
                                    'Please enable Location permission in App Settings to continue.',
                                    [
                                      { text: 'Cancel', style: 'cancel' },
                                      { text: 'Open Settings', onPress: () => Linking.openSettings() },
                                    ]
                                  );
                                }
                              },
                            },
                          ]
                        );
                        return;
                      }
                      Alert.alert(
                        'Background Location Disclosure',
                        'Gatimaan collects location data in the background to enable live field route tracking and attendance geofence compliance while you are punched in, even when the app is closed or not in use.',
                        [
                          { text: 'Not Now', style: 'cancel' },
                          {
                            text: 'Continue',
                            onPress: async () => {
                              const reqBg = await Location.requestBackgroundPermissionsAsync();
                              if (reqBg?.status === 'granted') {
                                setHasBackgroundPermission(true);
                              } else {
                                Alert.alert(
                                  'Background Location Permission',
                                  'Select "Allow all the time" in App Settings to unlock Punch In.',
                                  [
                                    { text: 'Cancel', style: 'cancel' },
                                    { text: 'Open Settings', onPress: () => Linking.openSettings() },
                                  ]
                                );
                              }
                            },
                          },
                        ]
                      );
                    } catch (_) { }
                  }}
                  className="mt-4 w-full bg-amber-600 rounded-2xl py-3.5 px-5 flex-row justify-center items-center shadow-sm"
                >
                  <Text className="text-white font-bold text-sm">Enable Background Location</Text>
                  <ChevronRight size={18} color="white" className="ml-1.5" />
                </TouchableOpacity>
              </View>
            );
          }

          return (
            <TouchableOpacity
              className={`h-18 rounded-2xl justify-center items-center shadow-lg ${alreadyPunchedIn
                ? 'bg-rose-500 shadow-rose-200'
                : 'bg-indigo-600 shadow-indigo-200'
                }`}
              style={{ height: 64 }}
              onPress={async () => {
                if (!selfie) {
                  takeSelfie();
                } else {
                  if (alreadyPunchedIn) {
                    handlePunchOut();
                  } else {
                    handlePunchIn(false);
                  }
                }
              }}
              disabled={punchLoading || livenessBusy}
              activeOpacity={0.85}
            >
              {punchLoading || livenessBusy ? (
                <View className="flex-row items-center justify-center">
                  <ActivityIndicator color="white" className="mr-2" />
                  <Text className="text-white font-bold text-base">
                    {livenessBusy
                      ? 'Opening Live Check...'
                      : punchLoadingMessage || (alreadyPunchedIn ? 'Verifying & Punching out...' : 'Verifying & Punching in...')}
                  </Text>
                </View>
              ) : (
                <View className="flex-row items-center">
                  <Text className="text-white font-bold text-lg">
                    {alreadyPunchedIn ? (selfie ? 'Save & Punch Out' : 'Punch Out Now') : (selfie ? 'Save & Punch In' : 'Punch In Now')}
                  </Text>
                  <ChevronRight size={20} color="white" className="ml-2" />
                </View>
              )}
            </TouchableOpacity>
          );
        })()}

        {/* Recent Attendance / Today's Record Card (Shown below action button after punch-in) */}
        {alreadyPunchedIn && todayAttendance && (() => {
          const punchInSelfieUri = getSelfieUri(todayAttendance.punchIn?.selfie) || getSelfieUri(todayAttendance.selfie) || getSelfieUri(user?.profileImage);
          const punchOutSelfieUri = getSelfieUri(todayAttendance.punchOut?.selfie) || getSelfieUri(user?.profileImage);
          const punchInAddress = todayAttendance.punchIn?.location?.address ||
            (todayAttendance.punchIn?.location?.latitude ? `${todayAttendance.punchIn.location.latitude.toFixed(6)}, ${todayAttendance.punchIn.location.longitude.toFixed(6)}` : 'Location verified');
          const punchOutAddress = todayAttendance.punchOut?.location?.address ||
            (todayAttendance.punchOut?.location?.latitude ? `${todayAttendance.punchOut.location.latitude.toFixed(6)}, ${todayAttendance.punchOut.location.longitude.toFixed(6)}` : 'Location verified');

          return (
            <View className="bg-white w-full rounded-3xl p-5 border border-slate-100 mt-5 shadow-sm">
              <View className="flex-row justify-between items-center mb-3">
                <Text className="text-[10px] font-bold text-slate-400 tracking-widest">RECENT ATTENDANCE</Text>
                {todayAttendance.status && (
                  <View className={`px-2 py-0.5 rounded-md ${todayAttendance.status === 'Late' ? 'bg-amber-50' : todayAttendance.status === 'Half Day' ? 'bg-orange-50' : 'bg-emerald-50'}`}>
                    <Text className={`text-[8px] font-bold ${todayAttendance.status === 'Late' ? 'text-amber-600' : todayAttendance.status === 'Half Day' ? 'text-orange-600' : 'text-emerald-600'}`}>{todayAttendance.status}</Text>
                  </View>
                )}
              </View>

              {/* Time Metrics Grid */}
              <View className="flex-row justify-between items-center py-2 border-t border-slate-50">
                <View className="items-start flex-1">
                  <Text className="text-[8px] font-bold text-slate-400">In</Text>
                  <Text className="text-sm font-bold text-slate-800">{todayAttendance.punchIn?.time ? new Date(todayAttendance.punchIn.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</Text>
                </View>
                <View className="items-center flex-1">
                  <Text className="text-[8px] font-bold text-slate-400">Worked</Text>
                  <Text className="text-sm font-bold text-slate-800">
                    {formatWorkingHours(
                      todayAttendance.punchOut?.time
                        ? todayAttendance.workingHours
                        : (new Date() - new Date(todayAttendance.punchIn?.time) - (todayAttendance.breaks?.reduce((acc, b) => acc + (b.duration || 0), 0) * 60000)) / 3600000
                    )}
                  </Text>
                </View>
                <View className="items-center flex-1">
                  <View className="flex-row items-center">
                    <Text className="text-[8px] font-bold text-slate-400">Break</Text>
                    <View className="ml-1 px-1 bg-amber-50 rounded">
                      <Text className="text-[6px] font-bold text-amber-600">{todayAttendance.breaks?.length || 0}</Text>
                    </View>
                  </View>
                  <Text className="text-sm font-bold text-amber-600">
                    {Math.floor((todayAttendance.breaks?.reduce((acc, b) => acc + (b.duration || 0), 0) || 0) / 60)}h {(todayAttendance.breaks?.reduce((acc, b) => acc + (b.duration || 0), 0) || 0) % 60}m
                  </Text>
                </View>
                <View className="items-end flex-1">
                  <Text className="text-[8px] font-bold text-slate-400">Out</Text>
                  <Text className="text-sm font-bold text-slate-800">{todayAttendance.punchOut?.time ? new Date(todayAttendance.punchOut.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</Text>
                </View>
              </View>

              {/* Punch In Details: Selfie + Full Untruncated Location */}
              <View className="mt-3 pt-3 border-t border-slate-100 bg-slate-50/70 p-3 rounded-2xl">
                <View className="flex-row items-center justify-between mb-2">
                  <View className="flex-row items-center">
                    <View className="w-2 h-2 rounded-full bg-emerald-500 mr-2" />
                    <Text className="text-[10px] font-extrabold text-slate-700 tracking-wide">PUNCH IN DETAILS</Text>
                  </View>
                </View>

                <View className="flex-row items-start">
                  {punchInSelfieUri ? (
                    <TouchableOpacity
                      onPress={() => setPreviewImage(punchInSelfieUri)}
                      activeOpacity={0.8}
                      className="w-16 h-16 rounded-xl overflow-hidden bg-slate-200 border border-slate-200 mr-3 relative shadow-sm"
                    >
                      <Image
                        source={{ uri: punchInSelfieUri }}
                        style={{ width: '100%', height: '100%' }}
                        resizeMode="cover"
                      />
                      <View className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-black/60 justify-center items-center">
                        <Eye size={10} color="white" />
                      </View>
                    </TouchableOpacity>
                  ) : (
                    <View className="w-16 h-16 rounded-xl bg-slate-200/80 border border-slate-300 mr-3 justify-center items-center">
                      <Camera size={20} color="#64748b" />
                      <Text className="text-[8px] font-bold text-slate-500 mt-0.5">Selfie</Text>
                    </View>
                  )}

                  <View className="flex-1 justify-center">
                    <View className="flex-row items-start">
                      <MapPin size={13} color="#4f46e5" style={{ marginTop: 2, marginRight: 4 }} />
                      <Text className="text-sm font-semibold text-slate-700 leading-snug flex-1 flex-wrap">
                        {punchInAddress}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>

              {/* Punch Out Details: Selfie + Full Untruncated Location (if punched out) */}
              {todayAttendance.punchOut?.time && (
                <View className="mt-2.5 bg-rose-50/50 p-3 rounded-2xl border border-rose-100/60">
                  <View className="flex-row items-center justify-between mb-2">
                    <View className="flex-row items-center">
                      <View className="w-2 h-2 rounded-full bg-rose-500 mr-2" />
                      <Text className="text-[10px] font-extrabold text-slate-700 tracking-wide">PUNCH OUT DETAILS</Text>
                    </View>
                  </View>

                  <View className="flex-row items-start">
                    {punchOutSelfieUri ? (
                      <TouchableOpacity
                        onPress={() => setPreviewImage(punchOutSelfieUri)}
                        activeOpacity={0.8}
                        className="w-16 h-16 rounded-xl overflow-hidden bg-slate-200 border border-slate-200 mr-3 relative shadow-sm"
                      >
                        <Image
                          source={{ uri: punchOutSelfieUri }}
                          style={{ width: '100%', height: '100%' }}
                          resizeMode="cover"
                        />
                        <View className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-black/60 justify-center items-center">
                          <Eye size={10} color="white" />
                        </View>
                      </TouchableOpacity>
                    ) : (
                      <View className="w-16 h-16 rounded-xl bg-rose-100/80 border border-rose-200 mr-3 justify-center items-center">
                        <Camera size={20} color="#e11d48" />
                        <Text className="text-[8px] font-bold text-rose-500 mt-0.5">Selfie</Text>
                      </View>
                    )}

                    <View className="flex-1 justify-center">
                      <View className="flex-row items-start">
                        <MapPin size={13} color="#e11d48" style={{ marginTop: 2, marginRight: 4 }} />
                        <Text className="text-sm font-semibold text-slate-700 leading-snug flex-1 flex-wrap">
                          {punchOutAddress}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              )}

              {!alreadyPunchedOut && (
                <TouchableOpacity
                  onPress={handleToggleBreak}
                  activeOpacity={0.8}
                  className={`mt-4 h-14 rounded-2xl flex-row justify-center items-center border ${todayAttendance.breaks?.some(b => !b.endTime) ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}
                >
                  {todayAttendance.breaks?.some(b => !b.endTime) ? (
                    <>
                      <PlayCircle size={20} color="#10b981" />
                      <Text className="ml-3 font-bold text-emerald-600">END BREAK SESSION</Text>
                    </>
                  ) : (
                    <>
                      <Coffee size={20} color="#f59e0b" />
                      <Text className="ml-3 font-bold text-amber-600">START BREAK SESSION</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
          );
        })()}


      </ScrollView>

      {/* Expo Go / Cross-Platform On-Device Live Verification Camera Modal */}
      <LivenessCameraModal
        visible={webLivenessVisible}
        purpose={alreadyPunchedIn ? 'punchOut' : 'punchIn'}
        onComplete={(res) => {
          setWebLivenessVisible(false);
          setLivenessBusy(false);
          applyLivenessResult(res);
        }}
      />

      {/* Early Punch-Out Reason Modal (shown when punching out before shift end time) */}
      <Modal
        visible={earlyPunchOutModal}
        transparent
        animationType="fade"
        onRequestClose={() => !punchLoading && setEarlyPunchOutModal(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'center', alignItems: 'center', padding: 20 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={{ width: '100%', maxWidth: 420, backgroundColor: '#ffffff', borderRadius: 22, padding: 20 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#0f172a' }}>Early Punch-Out Request</Text>
              <TouchableOpacity
                disabled={punchLoading}
                onPress={() => setEarlyPunchOutModal(false)}
              >
                <X size={20} color="#64748b" />
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 12, color: '#64748b', lineHeight: 18, marginBottom: 12 }}>
              You are punching out before your shift end time{earlyShiftEndLabel ? ` (${earlyShiftEndLabel})` : ''}. Your request will be sent to your Reporting Manager — if approved, your attendance will be marked Present; if rejected, it will be marked Half Day.
            </Text>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#334155', marginBottom: 6 }}>
              Reason for Early Punch-Out *
            </Text>
            <TextInput
              value={earlyPunchOutReason}
              onChangeText={setEarlyPunchOutReason}
              placeholder="Enter reason for leaving early (required)"
              placeholderTextColor="#94a3b8"
              multiline
              maxLength={500}
              style={{
                borderWidth: 1,
                borderColor: '#cbd5e1',
                borderRadius: 12,
                padding: 12,
                minHeight: 84,
                fontSize: 13,
                color: '#0f172a',
                backgroundColor: '#f8fafc',
                textAlignVertical: 'top',
              }}
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity
                disabled={punchLoading}
                onPress={() => setEarlyPunchOutModal(false)}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: '#f1f5f9', alignItems: 'center' }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#475569' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={punchLoading}
                onPress={handleSubmitEarlyPunchOut}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: '#ea580c', alignItems: 'center' }}
              >
                {punchLoading ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#ffffff' }}>Submit & Punch Out</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Full Screen Image Preview Modal */}
      <Modal visible={!!previewImage} transparent={true} animationType="fade">
        <View className="flex-1 bg-black/90 justify-center items-center">
          <TouchableOpacity
            onPress={() => setPreviewImage(null)}
            className="absolute top-14 right-6 w-12 h-12 bg-white/10 rounded-2xl justify-center items-center border border-white/20"
          >
            <X size={24} color="white" />
          </TouchableOpacity>
          <Image
            source={{ uri: previewImage }}
            style={{ width: '100%', height: '70%', borderRadius: 24 }}
            resizeMode="contain"
          />
          <View className="absolute bottom-14 bg-white/10 px-6 py-3 rounded-2xl border border-white/20">
            <Text className="text-white font-bold text-sm">Selfie Verification Proof</Text>
          </View>
        </View>
      </Modal>

      {/* Bottom Toast Notification */}
      {toast.show && (
        <View className={`absolute bottom-20 left-6 right-6 p-4 rounded-2xl shadow-2xl flex-row items-center border ${toast.type === 'success'
          ? 'bg-emerald-500 border-emerald-400'
          : toast.type === 'info'
            ? 'bg-indigo-600 border-indigo-500'
            : 'bg-rose-500 border-rose-400'
          }`}>
          {toast.type === 'info' && <ActivityIndicator color="white" size="small" style={{ marginRight: 8 }} />}
          <Text className="text-white font-bold text-sm text-center flex-1">{toast.message}</Text>
        </View>
      )}

      {/* HR Module Footer */}
      <HRModuleFooter navigation={navigation} currentScreen="attendance" />
    </View>
  );
};

export default AttendanceScreen;
