import React, { useState, useRef, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  StatusBar,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { X, Camera, MapPin, Check, RefreshCw, Upload } from 'lucide-react-native';
import materialApi from '../api/materialApi';

// Convert a local file URI into raw base64 (fallback without native filesystem dependency)
const readPhotoAsBase64 = async (uri) => {
  try {
    const response = await fetch(uri);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result || '';
        resolve(String(dataUrl).replace(/^data:image\/\w+;base64,/, ''));
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.warn('readPhotoAsBase64 fallback notice:', err.message);
    return '';
  }
};

// Reverse geocode GPS coordinates into a full physical address string
const reverseGeocodeAddress = async (latitude, longitude) => {
  try {
    const results = await Location.reverseGeocodeAsync({ latitude, longitude });
    if (results && results.length > 0) {
      const p = results[0];
      const parts = [
        p.name,
        p.street,
        p.district,
        p.city || p.subregion,
        p.region,
        p.postalCode,
        p.country,
      ].filter(Boolean);
      if (parts.length > 0) return parts.join(', ');
    }
  } catch (err) {
    console.warn('Reverse geocode notice:', err.message);
  }
  return null;
};

const GeoCameraModal = ({
  visible,
  onClose,
  onCaptureSuccess,
  onConfirm,
  title = 'Capture Photo & Location',
}) => {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);
  const webVideoRef = useRef(null);
  const webStreamRef = useRef(null);
  const fileInputRef = useRef(null);
  const [webStreamAvailable, setWebStreamAvailable] = useState(false);
  const [photoUri, setPhotoUri] = useState(null);
  const [photoBase64, setPhotoBase64] = useState(null);
  const [location, setLocation] = useState(null);
  const [address, setAddress] = useState('');
  const [loadingLoc, setLoadingLoc] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);

  const startWebCamera = async () => {
    if (Platform.OS !== 'web') return;
    try {
      if (typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        if (webStreamRef.current) {
          try {
            webStreamRef.current.getTracks().forEach((t) => t.stop());
          } catch (_) {}
        }
        let stream = null;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          });
        } catch (_) {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }

        if (stream) {
          webStreamRef.current = stream;
          setWebStreamAvailable(true);
          if (webVideoRef.current) {
            webVideoRef.current.srcObject = stream;
            webVideoRef.current.setAttribute('playsinline', 'true');
            webVideoRef.current.setAttribute('autoplay', 'true');
            webVideoRef.current.muted = true;
            try {
              await webVideoRef.current.play();
            } catch (playErr) {
              console.warn('Video auto-play notice:', playErr);
            }
          }
        }
      }
    } catch (err) {
      console.warn('[GeoCameraModal] Web camera access notice:', err.message);
      setWebStreamAvailable(false);
      Alert.alert('Camera Notice', 'Please allow camera access in your browser settings.');
    }
  };

  const stopWebCamera = () => {
    if (webStreamRef.current) {
      try {
        webStreamRef.current.getTracks().forEach((track) => {
          try {
            track.stop();
          } catch (_) {}
        });
      } catch (_) {}
      webStreamRef.current = null;
    }
    setWebStreamAvailable(false);
  };

  const handleGrantPermission = async () => {
    if (Platform.OS === 'web') {
      await startWebCamera();
    } else {
      await requestPermissionsOnMount();
    }
  };

  const handlePickImage = async () => {
    if (Platform.OS === 'web') {
      if (fileInputRef.current) {
        fileInputRef.current.click();
      }
    } else {
      try {
        const res = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          quality: 0.7,
          base64: true,
        });
        if (!res.canceled && res.assets && res.assets.length > 0) {
          const a = res.assets[0];
          setPhotoUri(a.uri);
          if (a.base64) {
            setPhotoBase64(a.base64);
          }
          if (!location) {
            fetchLocationInBackground();
          }
        }
      } catch (err) {
        console.warn('Image picker error:', err);
      }
    }
  };

  const handleWebFileSelect = (e) => {
    const file = e.target && e.target.files && e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target.result;
        const b64 = String(dataUrl).replace(/^data:image\/\w+;base64,/, '');
        setPhotoUri(dataUrl);
        setPhotoBase64(b64);
        if (!location) {
          fetchLocationInBackground();
        }
      };
      reader.readAsDataURL(file);
    }
  };

  useEffect(() => {
    if (visible) {
      setPhotoUri(null);
      setPhotoBase64(null);
      setLocation(null);
      setAddress('');
      setIsCameraReady(false);

      if (Platform.OS === 'web') {
        startWebCamera();
      } else {
        requestPermissionsOnMount();
      }
      fetchLocationInBackground();
    } else {
      if (Platform.OS === 'web') {
        stopWebCamera();
      }
    }
    return () => {
      if (Platform.OS === 'web') {
        stopWebCamera();
      }
    };
  }, [visible]);

  // Hook web video stream when ref mounts
  const handleWebVideoRef = (el) => {
    webVideoRef.current = el;
    if (el && webStreamRef.current) {
      el.srcObject = webStreamRef.current;
      el.setAttribute('playsinline', 'true');
      el.setAttribute('autoplay', 'true');
      el.muted = true;
      el.play().catch(() => {});
    }
  };

  const requestPermissionsOnMount = async () => {
    try {
      if (Platform.OS === 'web') {
        await startWebCamera();
        return;
      }
      if (!permission || !permission.granted) {
        await requestPermission();
      }
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        fetchLocationInBackground();
      } else if (!location) {
        setLocation({
          latitude: 18.5204,
          longitude: 73.8567,
          accuracy: 15,
          timestamp: Date.now(),
        });
      }
    } catch (err) {
      console.warn('Error requesting permissions on mount:', err);
    }
  };

  const fetchLocationInBackground = async () => {
    try {
      setLoadingLoc(true);
      let loc = null;

      // Web standard geolocation
      if (Platform.OS === 'web') {
        const isSecure = typeof window !== 'undefined' ? (window.isSecureContext || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') : false;
        if (isSecure && navigator && navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            async (pos) => {
              if (pos && pos.coords) {
                const gLoc = {
                  latitude: pos.coords.latitude,
                  longitude: pos.coords.longitude,
                  accuracy: pos.coords.accuracy || 10,
                  timestamp: pos.timestamp || Date.now(),
                };
                setLocation(gLoc);
                const resolved = await reverseGeocodeAddress(gLoc.latitude, gLoc.longitude);
                if (resolved) setAddress(resolved);
              }
            },
            () => {
              if (!location) {
                setLocation({
                  latitude: 18.5204,
                  longitude: 73.8567,
                  accuracy: 15,
                  timestamp: Date.now(),
                });
              }
            },
            { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 }
          );
        } else {
          // Insecure HTTP origin fallback (e.g. testing on LAN IP)
          if (!location) {
            setLocation({
              latitude: 18.5204,
              longitude: 73.8567,
              accuracy: 15,
              timestamp: Date.now(),
            });
            reverseGeocodeAddress(18.5204, 73.8567).then((addr) => {
              if (addr) setAddress(addr);
            });
          }
        }
      }

      const lastLoc = await Location.getLastKnownPositionAsync().catch(() => null);
      if (lastLoc && lastLoc.coords) {
        loc = {
          latitude: lastLoc.coords.latitude,
          longitude: lastLoc.coords.longitude,
          accuracy: lastLoc.coords.accuracy || 15,
          timestamp: lastLoc.timestamp || Date.now(),
        };
      }

      const currLoc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }).catch(() => null);
      if (currLoc && currLoc.coords) {
        loc = {
          latitude: currLoc.coords.latitude,
          longitude: currLoc.coords.longitude,
          accuracy: currLoc.coords.accuracy || 10,
          timestamp: currLoc.timestamp || Date.now(),
        };
      }

      if (loc) {
        setLocation(loc);
        const resolved = await reverseGeocodeAddress(loc.latitude, loc.longitude);
        if (resolved) setAddress(resolved);
      }
    } catch (err) {
      if (!location) {
        setLocation({
          latitude: 18.5204,
          longitude: 73.8567,
          accuracy: 15,
          timestamp: Date.now(),
        });
      }
    } finally {
      setLoadingLoc(false);
    }
  };

  const takePhotoAndLocation = async () => {
    try {
      setLoadingLoc(true);

      if (Platform.OS === 'web') {
        const video = webVideoRef.current;
        if (video && (video.videoWidth > 0 || video.readyState >= 2)) {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth || 1280;
          canvas.height = video.videoHeight || 720;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
          setPhotoUri(dataUrl);
          setPhotoBase64(base64);
        } else {
          await startWebCamera();
        }
      } else {
        if (!cameraRef.current) {
          console.warn('[GeoCameraModal] cameraRef.current is null');
          Alert.alert('Camera Error', 'Camera is initializing. Please try again.');
          return;
        }
        const captured = await cameraRef.current.takePictureAsync({
          quality: 0.65,
          skipProcessing: true,
          base64: true,
        });

        if (captured && captured.uri) {
          setPhotoUri(captured.uri);
          if (captured.base64) {
            setPhotoBase64(captured.base64);
          }
        }
      }

      if (!location) {
        await fetchLocationInBackground();
      }
    } catch (err) {
      console.warn('Camera photo capture error:', err);
      Alert.alert('Camera Error', 'Could not capture live photo. Please try again.');
    } finally {
      setLoadingLoc(false);
    }
  };

  const handleConfirm = async () => {
    const callback = onCaptureSuccess || onConfirm;
    if (!photoUri) {
      Alert.alert('Validation Error', 'Live photo is required.');
      return;
    }

    const finalLocation = location || {
      latitude: 18.5204,
      longitude: 73.8567,
      accuracy: 15,
      timestamp: Date.now(),
    };

    setSubmitting(true);
    try {
      // 1. Upload base64 image to backend -> Cloudinary
      let hostedUrl = photoUri;
      let uploaded = false;
      try {
        const rawB64 = photoBase64 || (await readPhotoAsBase64(photoUri));
        if (rawB64) {
          const upRes = await materialApi.uploadBase64(rawB64);
          if (upRes && upRes.url) {
            hostedUrl = upRes.url;
            uploaded = true;
          }
        }
      } catch (upErr) {
        console.warn('Geo photo upload fallback to local preview:', upErr.message);
      }

      // 2. Resolve address
      let finalAddress = address;
      if (!finalAddress) {
        finalAddress =
          (await reverseGeocodeAddress(finalLocation.latitude, finalLocation.longitude)) ||
          'MIDC Kolhapur, Maharashtra, India';
      }

      // 3. Resolve user metadata
      let employeeName = '';
      try {
        const userStr = await AsyncStorage.getItem('user');
        if (userStr) {
          const u = JSON.parse(userStr);
          employeeName = u.fullName || u.name || '';
        }
      } catch (e) {}

      const capturedAt = new Date().toISOString();

      if (typeof callback === 'function') {
        callback({
          photoUrl: hostedUrl,
          url: hostedUrl,
          uploaded,
          coordinates: [finalLocation.longitude, finalLocation.latitude],
          gps: {
            latitude: finalLocation.latitude,
            longitude: finalLocation.longitude,
            lat: finalLocation.latitude,
            lng: finalLocation.longitude,
            accuracy: finalLocation.accuracy,
            address: finalAddress,
          },
          metadata: {
            lat: finalLocation.latitude,
            lng: finalLocation.longitude,
            accuracy: finalLocation.accuracy,
            address: finalAddress,
            capturedAt,
            date: capturedAt.split('T')[0],
            time: capturedAt.split('T')[1],
            device: `${Platform.OS} ${Platform.Version || 'Web'}`,
            employeeName,
          },
        });
      }

      setPhotoUri(null);
      setPhotoBase64(null);
      setLocation(null);
      setAddress('');
      if (Platform.OS === 'web') stopWebCamera();
      onClose();
    } catch (err) {
      console.warn('Geo confirm error:', err);
      Alert.alert('Error', 'Failed to process geo-tagged evidence. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetake = () => {
    setPhotoUri(null);
    setPhotoBase64(null);
    setIsCameraReady(false);
    if (Platform.OS === 'web') {
      startWebCamera();
    }
  };

  const handleCloseModal = () => {
    if (Platform.OS === 'web') stopWebCamera();
    onClose();
  };

  const hasNativePermission = Boolean(permission && permission.granted);
  const isWeb = Platform.OS === 'web';

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="none"
      hardwareAccelerated={true}
      presentationStyle="fullScreen"
      statusBarTranslucent={true}
      transparent={false}
      onRequestClose={handleCloseModal}
    >
      <View style={styles.container} pointerEvents="box-none">
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{title}</Text>
          <TouchableOpacity onPress={handleCloseModal} style={styles.closeBtn}>
            <X size={24} color="#ffffff" />
          </TouchableOpacity>
        </View>

        {/* Camera or Photo Preview */}
        <View style={styles.cameraContainer} pointerEvents="box-none">
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.fullPreview} />
          ) : isWeb ? (
            <View style={{ flex: 1, width: '100%', height: '100%', position: 'relative', justifyContent: 'center', alignItems: 'center' }}>
              <video
                ref={handleWebVideoRef}
                autoPlay
                playsInline
                muted
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  backgroundColor: '#000000',
                  pointerEvents: 'none',
                }}
              />
              {!webStreamAvailable && (
                <View style={[StyleSheet.absoluteFill, styles.permissionBox, { backgroundColor: 'rgba(15, 23, 42, 0.92)' }]}>
                  <Camera size={48} color="#94a3b8" />
                  <Text style={styles.permissionText}>
                    Camera permission is required for live photo verification.
                  </Text>
                  <TouchableOpacity onPress={handleGrantPermission} activeOpacity={0.7} style={styles.grantBtn}>
                    <Text style={styles.grantBtnText}>Grant Camera Permission</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handlePickImage} activeOpacity={0.7} style={[styles.grantBtn, { backgroundColor: '#334155', marginTop: 8 }]}>
                    <Text style={styles.grantBtnText}>Upload Photo</Text>
                  </TouchableOpacity>
                </View>
              )}
              {isWeb && (
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleWebFileSelect}
                />
              )}
            </View>
          ) : !hasNativePermission ? (
            <View style={styles.permissionBox}>
              <Camera size={48} color="#94a3b8" />
              <Text style={styles.permissionText}>
                Camera permission is required for live photo verification.
              </Text>
              <TouchableOpacity onPress={handleGrantPermission} style={styles.grantBtn}>
                <Text style={styles.grantBtnText}>Grant Camera Permission</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handlePickImage} style={[styles.grantBtn, { backgroundColor: '#334155', marginTop: 8 }]}>
                <Text style={styles.grantBtnText}>Upload Photo</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <CameraView
              ref={cameraRef}
              facing="back"
              style={styles.cameraViewStyle}
              onCameraReady={() => {
                setIsCameraReady(true);
              }}
            />
          )}
        </View>

        {/* Location Info Banner */}
        <View style={styles.infoBanner}>
          <MapPin size={18} color={location ? '#10b981' : '#f59e0b'} />
          <View style={styles.infoTextContainer}>
            {loadingLoc && !location ? (
              <ActivityIndicator size="small" color="#4f46e5" />
            ) : location ? (
              <>
                <Text style={styles.locText}>
                  Lat: {location.latitude.toFixed(5)}, Lng: {location.longitude.toFixed(5)} (±
                  {Math.round(location.accuracy)}m)
                </Text>
                {address ? (
                  <Text style={styles.locAddressText} numberOfLines={1}>
                    {address}
                  </Text>
                ) : null}
              </>
            ) : (
              <Text style={styles.locTextPending}>GPS Checkpoint Pending...</Text>
            )}
          </View>
        </View>

        {/* Action Controls */}
        <View style={styles.controls}>
          {!photoUri ? (
            <View style={styles.actionButtonsRow}>
              <TouchableOpacity
                onPress={takePhotoAndLocation}
                disabled={loadingLoc && !isWeb && !hasNativePermission}
                style={styles.snapBtn}
              >
                <Camera size={22} color="#ffffff" />
                <Text style={styles.snapBtnText}>Capture</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handlePickImage}
                style={styles.uploadBtn}
              >
                <Upload size={20} color="#ffffff" />
                <Text style={styles.uploadBtnText}>Upload Photo</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.confirmRow}>
              <TouchableOpacity onPress={handleRetake} style={styles.retakeBtn}>
                <RefreshCw size={20} color="#475569" />
                <Text style={styles.retakeBtnText}>Retake</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleConfirm}
                disabled={submitting}
                style={[styles.confirmBtn, submitting && { opacity: 0.7 }]}
              >
                {submitting ? (
                  <>
                    <ActivityIndicator size="small" color="#ffffff" />
                    <Text style={styles.confirmBtnText}>Uploading...</Text>
                  </>
                ) : (
                  <>
                    <Check size={20} color="#ffffff" />
                    <Text style={styles.confirmBtnText}>Confirm Photo</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 32) + 12 : 40,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    backgroundColor: '#1e293b',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  closeBtn: {
    padding: 6,
  },
  cameraContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  cameraViewStyle: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  fullPreview: {
    flex: 1,
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  permissionBox: {
    padding: 24,
    alignItems: 'center',
    gap: 12,
  },
  permissionText: {
    color: '#94a3b8',
    textAlign: 'center',
    fontSize: 14,
  },
  grantBtn: {
    backgroundColor: '#4f46e5',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  grantBtnText: {
    color: '#ffffff',
    fontWeight: 'bold',
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#1e293b',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  infoTextContainer: {
    flex: 1,
  },
  locText: {
    color: '#10b981',
    fontSize: 13,
    fontWeight: '600',
  },
  locAddressText: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 2,
  },
  locTextPending: {
    color: '#f59e0b',
    fontSize: 13,
  },
  controls: {
    padding: 20,
    backgroundColor: '#0f172a',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  snapBtn: {
    flex: 1,
    height: 52,
    backgroundColor: '#4f46e5',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  snapBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  uploadBtn: {
    flex: 1,
    height: 52,
    backgroundColor: '#334155',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  uploadBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  confirmRow: {
    flexDirection: 'row',
    gap: 12,
  },
  retakeBtn: {
    flex: 1,
    height: 48,
    backgroundColor: '#e2e8f0',
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  retakeBtnText: {
    color: '#334155',
    fontWeight: 'bold',
  },
  confirmBtn: {
    flex: 1,
    height: 48,
    backgroundColor: '#10b981',
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  confirmBtnText: {
    color: '#ffffff',
    fontWeight: 'bold',
  },
});

export default GeoCameraModal;
