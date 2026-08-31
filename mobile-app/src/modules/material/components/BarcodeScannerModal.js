import React, { useState, useRef, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
  Platform,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { X, Flashlight, QrCode } from 'lucide-react-native';

const BarcodeScannerModal = ({ visible, onClose, onScanSuccess, title = 'Scan Barcode' }) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [scanned, setScanned] = useState(false);
  const webVideoRef = useRef(null);
  const webStreamRef = useRef(null);
  const [webStreamAvailable, setWebStreamAvailable] = useState(false);

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
      console.warn('[BarcodeScannerModal] Web camera access notice:', err.message);
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
      await requestPermission();
    }
  };

  useEffect(() => {
    if (visible) {
      setScanned(false);
      if (Platform.OS === 'web') {
        startWebCamera();
      }
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

  const handleBarcodeScanned = ({ data }) => {
    if (scanned || !data) return;
    setScanned(true);
    const cleanCode = String(data).trim().replace(/[\r\n\t"']/g, '');
    onScanSuccess(cleanCode);
    setScanned(false);
    if (Platform.OS === 'web') stopWebCamera();
    onClose();
  };

  const handleClose = () => {
    if (Platform.OS === 'web') stopWebCamera();
    onClose();
  };

  const hasNativePermission = Boolean(permission && permission.granted);
  const isWeb = Platform.OS === 'web';

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <SafeAreaView style={styles.container} pointerEvents="box-none">
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{title}</Text>
          <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
            <X size={24} color="#ffffff" />
          </TouchableOpacity>
        </View>

        {/* Camera View */}
        <View style={styles.cameraContainer} pointerEvents="box-none">
          {isWeb ? (
            <View style={{ flex: 1, width: '100%', height: '100%', position: 'relative', justifyContent: 'center', alignItems: 'center' }}>
              <video
                ref={(el) => {
                  webVideoRef.current = el;
                  if (el && webStreamRef.current) {
                    el.srcObject = webStreamRef.current;
                    el.setAttribute('playsinline', 'true');
                    el.setAttribute('autoplay', 'true');
                    el.muted = true;
                    el.play().catch(() => {});
                  }
                }}
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
                  <QrCode size={48} color="#94a3b8" />
                  <Text style={styles.permissionText}>Camera permission required for live scanner.</Text>
                  <TouchableOpacity onPress={handleGrantPermission} activeOpacity={0.7} style={styles.grantBtn}>
                    <Text style={styles.grantBtnText}>Grant Camera Permission</Text>
                  </TouchableOpacity>
                </View>
              )}
              <View style={styles.overlay} pointerEvents="none">
                <View style={styles.scanBox}>
                  <View style={[styles.corner, styles.topLeft]} />
                  <View style={[styles.corner, styles.topRight]} />
                  <View style={[styles.corner, styles.bottomLeft]} />
                  <View style={[styles.corner, styles.bottomRight]} />
                </View>
              </View>
            </View>
          ) : !hasNativePermission ? (
            <View style={styles.permissionBox}>
              <QrCode size={48} color="#94a3b8" />
              <Text style={styles.permissionText}>Camera permission required for live scanner.</Text>
              <TouchableOpacity onPress={handleGrantPermission} style={styles.grantBtn}>
                <Text style={styles.grantBtnText}>Grant Camera Permission</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <CameraView
                style={StyleSheet.absoluteFillObject}
                enableTorch={torch}
                onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
                barcodeScannerSettings={{
                  barcodeTypes: ['qr', 'code128', 'code39', 'ean13', 'upc_a'],
                }}
              />
              <View style={styles.overlay}>
                <View style={styles.scanBox}>
                  <View style={[styles.corner, styles.topLeft]} />
                  <View style={[styles.corner, styles.topRight]} />
                  <View style={[styles.corner, styles.bottomLeft]} />
                  <View style={[styles.corner, styles.bottomRight]} />
                </View>
                <TouchableOpacity
                  onPress={() => setTorch(!torch)}
                  style={[styles.torchBtn, torch && styles.torchBtnActive]}
                >
                  <Flashlight size={20} color={torch ? '#4f46e5' : '#ffffff'} />
                </TouchableOpacity>
              </View>
            </>
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
    fontSize: 18,
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
    position: 'relative',
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
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanBox: {
    width: 240,
    height: 240,
    borderRadius: 16,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: '#4f46e5',
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 12,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 12,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 12,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 12,
  },
  torchBtn: {
    marginTop: 30,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  torchBtnActive: {
    backgroundColor: '#ffffff',
  },
});

export default BarcodeScannerModal;
