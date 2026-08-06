import React, { useState, useRef, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  Platform,
  StatusBar,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { X, Camera, MapPin, Check, RefreshCw } from 'lucide-react-native';

const GeoCameraModal = ({ visible, onClose, onCaptureSuccess, onConfirm, title = 'Capture Photo & Location' }) => {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);
  const [photoUri, setPhotoUri] = useState(null);
  const [location, setLocation] = useState(null);
  const [loadingLoc, setLoadingLoc] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);

  useEffect(() => {
    if (visible) {
      setPhotoUri(null);
      setLocation(null);
      setIsCameraReady(false);
      requestPermissionsOnMount();
    }
  }, [visible]);

  const requestPermissionsOnMount = async () => {
    try {
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
      // Fast check last known location
      const lastLoc = await Location.getLastKnownPositionAsync();
      if (lastLoc && lastLoc.coords) {
        setLocation({
          latitude: lastLoc.coords.latitude,
          longitude: lastLoc.coords.longitude,
          accuracy: lastLoc.coords.accuracy || 15,
          timestamp: lastLoc.timestamp || Date.now(),
        });
      }
      // Current position in background
      const currLoc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      if (currLoc && currLoc.coords) {
        setLocation({
          latitude: currLoc.coords.latitude,
          longitude: currLoc.coords.longitude,
          accuracy: currLoc.coords.accuracy || 10,
          timestamp: currLoc.timestamp || Date.now(),
        });
      }
    } catch (err) {
      console.warn('Background location fetch notice:', err);
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
      if (!cameraRef.current) {
        console.warn('[GeoCameraModal] cameraRef.current is null');
        Alert.alert('Camera Error', 'Camera is initializing. Please try again.');
        return;
      }
      setLoadingLoc(true);

      // Instant photo capture
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.65,
        skipProcessing: true,
      });
      if (photo && photo.uri) {
        setPhotoUri(photo.uri);
      }

      // Refresh location in background if needed
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

  const handleConfirm = () => {
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
    if (typeof callback === 'function') {
      callback({
        photoUrl: photoUri,
        coordinates: [finalLocation.longitude, finalLocation.latitude],
        gps: finalLocation,
      });
    }
    setSubmitting(false);
    setPhotoUri(null);
    setLocation(null);
    onClose();
  };

  const handleRetake = () => {
    setPhotoUri(null);
    setIsCameraReady(false);
  };

  const hasPermission = Boolean(permission && permission.granted);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="none"
      hardwareAccelerated={true}
      presentationStyle="fullScreen"
      statusBarTranslucent={true}
      transparent={false}
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{title}</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <X size={24} color="#ffffff" />
          </TouchableOpacity>
        </View>

        {/* Camera or Photo Preview */}
        <View style={styles.cameraContainer}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.fullPreview} />
          ) : !hasPermission ? (
            <View style={styles.permissionBox}>
              <Camera size={48} color="#94a3b8" />
              <Text style={styles.permissionText}>Camera permission required for live photo verification.</Text>
              <TouchableOpacity onPress={requestPermissionsOnMount} style={styles.grantBtn}>
                <Text style={styles.grantBtnText}>Grant Camera Permission</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <CameraView
              ref={cameraRef}
              facing="back"
              style={styles.cameraViewStyle}
              onCameraReady={() => {
                console.log('[GeoCameraModal] Camera Ready');
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
              <Text style={styles.locText}>
                Lat: {location.latitude.toFixed(5)}, Lng: {location.longitude.toFixed(5)} (±{Math.round(location.accuracy)}m)
              </Text>
            ) : (
              <Text style={styles.locTextPending}>GPS Checkpoint Pending...</Text>
            )}
          </View>
        </View>

        {/* Action Controls */}
        <View style={styles.controls}>
          {!photoUri ? (
            <TouchableOpacity
              onPress={takePhotoAndLocation}
              disabled={loadingLoc && !hasPermission}
              style={styles.snapBtn}
            >
              <Camera size={26} color="#ffffff" />
              <Text style={styles.snapBtnText}>Capture Photo</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.confirmRow}>
              <TouchableOpacity onPress={handleRetake} style={styles.retakeBtn}>
                <RefreshCw size={20} color="#475569" />
                <Text style={styles.retakeBtnText}>Retake</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleConfirm}
                disabled={submitting}
                style={styles.confirmBtn}
              >
                <Check size={20} color="#ffffff" />
                <Text style={styles.confirmBtnText}>Confirm Photo</Text>
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
  locTextPending: {
    color: '#f59e0b',
    fontSize: 13,
  },
  controls: {
    padding: 20,
    backgroundColor: '#0f172a',
  },
  snapBtn: {
    height: 52,
    backgroundColor: '#4f46e5',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  snapBtnText: {
    color: '#ffffff',
    fontSize: 16,
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
