import React, { useState, useRef } from 'react';
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
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { X, Camera, MapPin, Check, RefreshCw } from 'lucide-react-native';

const GeoCameraModal = ({ visible, onClose, onCaptureSuccess, title = 'Capture Photo & Location' }) => {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);
  const [photoUri, setPhotoUri] = useState(null);
  const [location, setLocation] = useState(null);
  const [loadingLoc, setLoadingLoc] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const takePhotoAndLocation = async () => {
    try {
      if (!cameraRef.current) return;
      setLoadingLoc(true);

      // 1. Take photo
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.7 });
      setPhotoUri(photo.uri);

      // 2. Fetch high accuracy GPS location
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      if (loc.coords.accuracy > 100) {
        Alert.alert(
          'Location Warning',
          `GPS Accuracy (${Math.round(loc.coords.accuracy)}m) is low. Ensure you have clear sky visibility.`
        );
      }

      setLocation({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        accuracy: loc.coords.accuracy,
        timestamp: loc.timestamp,
      });
    } catch (err) {
      Alert.alert('Capture Failed', err.message || 'Could not capture photo or location.');
    } finally {
      setLoadingLoc(false);
    }
  };

  const handleConfirm = () => {
    if (!photoUri || !location) {
      Alert.alert('Validation Error', 'Photo and location are both mandatory.');
      return;
    }
    setSubmitting(true);
    onCaptureSuccess({
      photoUrl: photoUri,
      coordinates: [location.longitude, location.latitude],
      gps: location,
    });
    setSubmitting(false);
    setPhotoUri(null);
    setLocation(null);
    onClose();
  };

  const handleRetake = () => {
    setPhotoUri(null);
    setLocation(null);
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
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
            <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFillObject} />
          ) : !permission?.granted ? (
            <View style={styles.permissionBox}>
              <Camera size={48} color="#94a3b8" />
              <Text style={styles.permissionText}>Camera permission required for photo verification.</Text>
              <TouchableOpacity onPress={requestPermission} style={styles.grantBtn}>
                <Text style={styles.grantBtnText}>Grant Camera Permission</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <CameraView ref={cameraRef} style={StyleSheet.absoluteFillObject} />
          )}
        </View>

        {/* Location Info Banner */}
        <View style={styles.infoBanner}>
          <MapPin size={18} color={location ? '#10b981' : '#f59e0b'} />
          <View style={styles.infoTextContainer}>
            {loadingLoc ? (
              <ActivityIndicator size="small" color="#4f46e5" />
            ) : location ? (
              <Text style={styles.locText}>
                Lat: {location.latitude.toFixed(5)}, Lng: {location.longitude.toFixed(5)} (±{Math.round(location.accuracy)}m)
              </Text>
            ) : (
              <Text style={styles.locTextPending}>GPS Location Checkpoint Pending...</Text>
            )}
          </View>
        </View>

        {/* Action Controls */}
        <View style={styles.controls}>
          {!photoUri ? (
            <TouchableOpacity
              onPress={takePhotoAndLocation}
              disabled={loadingLoc}
              style={styles.snapBtn}
            >
              <Camera size={26} color="#ffffff" />
              <Text style={styles.snapBtnText}>Capture Photo & GPS</Text>
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
                <Text style={styles.confirmBtnText}>Confirm Hand-off</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    height: 56,
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
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
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
