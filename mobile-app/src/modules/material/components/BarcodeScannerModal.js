import { CameraView, useCameraPermissions } from 'expo-camera';
import { Edit3, Flashlight, QrCode, X } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Linking,
  Modal,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SCAN_BOX_SIZE = Math.min(Math.round(SCREEN_WIDTH * 0.72), 270);

const BarcodeScannerModal = ({ visible, onClose, onScanSuccess, title = 'Scan Barcode' }) => {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);
  const [torch, setTorch] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);
  const [modalReady, setModalReady] = useState(false);

  // Web camera stream refs
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
          } catch (_) { }
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
          } catch (_) { }
        });
      } catch (_) { }
      webStreamRef.current = null;
    }
    setWebStreamAvailable(false);
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
    } catch (err) {
      console.warn('Camera permission request error:', err);
    }
  };

  const handleGrantPermission = async () => {
    if (Platform.OS === 'web') {
      await startWebCamera();
    } else {
      await requestPermissionsOnMount();
    }
  };

  useEffect(() => {
    if (visible) {
      setScanned(false);
      setIsCameraReady(false);
      setTorch(false);
      setManualCode('');
      setShowManualInput(false);

      if (Platform.OS === 'web') {
        startWebCamera();
      } else {
        requestPermissionsOnMount();
      }
    } else {
      setModalReady(false);
      setTorch(false);
      if (Platform.OS === 'web') {
        stopWebCamera();
      }
    }
    return () => {
      setModalReady(false);
      setTorch(false);
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
      el.play().catch(() => { });
    }
  };

  const handleBarcodeScanned = (result) => {
    if (scanned) return;
    const rawData = result?.data || (typeof result === 'string' ? result : null);
    if (!rawData) return;
    setScanned(true);
    const cleanCode = String(rawData).trim().replace(/[\r\n\t"']/g, '');
    if (Platform.OS === 'web') stopWebCamera();
    if (onScanSuccess) {
      onScanSuccess(cleanCode);
    }
    onClose();
  };

  const handleManualSubmit = () => {
    if (!manualCode.trim()) {
      Alert.alert('Validation Error', 'Please enter a barcode number.');
      return;
    }
    const cleanCode = manualCode.trim().replace(/[\r\n\t"']/g, '');
    if (Platform.OS === 'web') stopWebCamera();
    if (onScanSuccess) {
      onScanSuccess(cleanCode);
    }
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
    <Modal
      visible={visible}
      animationType="fade"
      hardwareAccelerated={true}
      statusBarTranslucent={true}
      transparent={true}
      onShow={() => setModalReady(true)}
      onRequestClose={handleClose}
    >
      <View style={styles.container} pointerEvents="box-none">
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

        {/* Top Header Bar */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{title}</Text>
          <TouchableOpacity onPress={handleClose} style={styles.closeBtn} activeOpacity={0.7}>
            <X size={24} color="#ffffff" />
          </TouchableOpacity>
        </View>

        {/* Camera Viewport Area */}
        <View style={styles.cameraContainer} pointerEvents="box-none">
          {isWeb ? (
            <View style={styles.webWrapper}>
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
                <View style={[StyleSheet.absoluteFill, styles.permissionBox, { backgroundColor: 'rgba(15, 23, 42, 0.95)' }]}>
                  <QrCode size={48} color="#94a3b8" />
                  <Text style={styles.permissionText}>Camera permission required for live scanner.</Text>
                  <TouchableOpacity onPress={handleGrantPermission} activeOpacity={0.7} style={styles.grantBtn}>
                    <Text style={styles.grantBtnText}>Grant Camera Permission</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ) : !hasNativePermission ? (
            permission === null ? (
              <View style={styles.permissionBox}>
                <ActivityIndicator size="large" color="#4f46e5" />
                <Text style={styles.permissionText}>Initializing camera scanner...</Text>
              </View>
            ) : (
              <View style={styles.permissionBox}>
                <QrCode size={48} color="#94a3b8" />
                <Text style={styles.permissionText}>Camera permission is required for live scanner.</Text>
                <TouchableOpacity
                  onPress={() => {
                    if (permission && !permission.canAskAgain) {
                      Linking.openSettings().catch(() => { });
                    } else {
                      handleGrantPermission();
                    }
                  }}
                  style={styles.grantBtn}
                  activeOpacity={0.8}
                >
                  <Text style={styles.grantBtnText}>
                    {permission && !permission.canAskAgain ? 'Open System Settings' : 'Grant Camera Permission'}
                  </Text>
                </TouchableOpacity>
              </View>
            )
          ) : (
            (Platform.OS === 'web' || modalReady) && (
              <CameraView
                key={modalReady ? 'camera-ready' : 'camera-init'}
                ref={cameraRef}
                facing="back"
                style={styles.cameraViewStyle}
                enableTorch={torch}
                onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
                barcodeScannerSettings={{
                  barcodeTypes: [
                    'qr',
                    'code128',
                    'code39',
                    'code93',
                    'ean13',
                    'ean8',
                    'upc_a',
                    'upc_e',
                    'pdf417',
                    'aztec',
                    'datamatrix',
                    'itf14',
                    'codabar',
                  ],
                }}
                onCameraReady={() => {
                  setIsCameraReady(true);
                }}
                onMountError={(error) => {
                  console.warn('[BarcodeScannerModal] CameraView onMountError:', error);
                }}
              />
            )
          )}

          {/* Viewfinder Overlays & Controls (Only active when permission is granted) */}
          {(isWeb ? webStreamAvailable : hasNativePermission) && (
            <View style={styles.overlayContainer} pointerEvents="box-none">
              {/* Top translucent mask */}
              <View style={styles.maskTop} pointerEvents="none" />

              {/* Middle row: Left mask + Transparent Center Cutout Box + Right mask */}
              <View style={styles.maskMiddleRow} pointerEvents="box-none">
                <View style={styles.maskSide} pointerEvents="none" />

                {/* Centered Clear Cutout Viewfinder Box */}
                <View style={styles.scanBox} pointerEvents="none">
                  {!isCameraReady && !isWeb && (
                    <View style={styles.loadingSpinner}>
                      <ActivityIndicator size="small" color="#60a5fa" />
                    </View>
                  )}
                  <View style={[styles.corner, styles.topLeft]} />
                  <View style={[styles.corner, styles.topRight]} />
                  <View style={[styles.corner, styles.bottomLeft]} />
                  <View style={[styles.corner, styles.bottomRight]} />
                  <View style={styles.laserLine} />
                </View>

                <View style={styles.maskSide} pointerEvents="none" />
              </View>

              {/* Bottom translucent mask */}
              <View style={styles.maskBottom} pointerEvents="box-none">
                <Text style={styles.scanHintText}>Align barcode inside frame to scan</Text>

                {/* Bottom Controls Bar */}
                <View style={styles.bottomControls} pointerEvents="box-none">
                  <TouchableOpacity
                    onPress={() => setTorch(!torch)}
                    style={[styles.torchBtn, torch && styles.torchBtnActive]}
                    activeOpacity={0.8}
                  >
                    <Flashlight size={20} color={torch ? '#2563eb' : '#ffffff'} />
                    <Text style={[styles.torchBtnLabel, torch && { color: '#2563eb' }]}>
                      {torch ? 'Torch ON' : 'Torch'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setShowManualInput(!showManualInput)}
                    style={[styles.manualToggleBtn, showManualInput && styles.manualToggleBtnActive]}
                    activeOpacity={0.8}
                  >
                    <Edit3 size={18} color="#ffffff" />
                    <Text style={styles.manualToggleBtnText}>
                      {showManualInput ? 'Hide Input' : 'Type Barcode'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Manual Code Input Bar (Collapsible) */}
                {showManualInput && (
                  <View style={styles.manualInputCard}>
                    <TextInput
                      style={styles.manualTextInput}
                      placeholder="Enter barcode number..."
                      placeholderTextColor="#94a3b8"
                      value={manualCode}
                      onChangeText={setManualCode}
                      autoCapitalize="characters"
                      autoFocus
                    />
                    <TouchableOpacity
                      style={styles.manualSubmitBtn}
                      onPress={handleManualSubmit}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.manualSubmitBtnText}>Use Code</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
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
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 40,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 28) + 10 : 46,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.3,
  },
  closeBtn: {
    padding: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 20,
  },
  cameraContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent',
    position: 'relative',
    overflow: 'hidden',
  },
  cameraViewStyle: {
    ...StyleSheet.absoluteFillObject,
  },
  webWrapper: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
  },
  permissionBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 12,
    backgroundColor: '#0f172a',
  },
  permissionText: {
    color: '#94a3b8',
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
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
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
  },
  maskTop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  maskMiddleRow: {
    flexDirection: 'row',
    height: SCAN_BOX_SIZE,
    alignItems: 'center',
  },
  maskSide: {
    flex: 1,
    height: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  scanBox: {
    width: SCAN_BOX_SIZE,
    height: SCAN_BOX_SIZE,
    borderRadius: 18,
    position: 'relative',
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingSpinner: {
    position: 'absolute',
    alignSelf: 'center',
  },
  corner: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderColor: '#2563eb',
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 16,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 16,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 16,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 16,
  },
  laserLine: {
    width: '90%',
    height: 2,
    backgroundColor: '#3b82f6',
    shadowColor: '#60a5fa',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 4,
  },
  maskBottom: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    paddingTop: 16,
    position: 'relative',
  },
  scanHintText: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    overflow: 'hidden',
  },
  bottomControls: {
    position: 'absolute',
    bottom: Platform.OS === 'android' ? 36 : 48,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  torchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
  torchBtnActive: {
    backgroundColor: '#ffffff',
  },
  torchBtnLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
  manualToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: 'rgba(37, 99, 235, 0.85)',
  },
  manualToggleBtnActive: {
    backgroundColor: '#1d4ed8',
  },
  manualToggleBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
  manualInputCard: {
    position: 'absolute',
    bottom: Platform.OS === 'android' ? 98 : 112,
    left: 20,
    right: 20,
    flexDirection: 'row',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 8,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
  },
  manualTextInput: {
    flex: 1,
    height: 44,
    backgroundColor: '#0f172a',
    borderRadius: 8,
    paddingHorizontal: 12,
    color: '#ffffff',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#475569',
  },
  manualSubmitBtn: {
    backgroundColor: '#16a34a',
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  manualSubmitBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
});

export default BarcodeScannerModal;
