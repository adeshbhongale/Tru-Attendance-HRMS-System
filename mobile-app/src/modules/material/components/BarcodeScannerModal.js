import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  SafeAreaView,
  Alert,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { X, Flashlight, QrCode, ArrowRight } from 'lucide-react-native';

const BarcodeScannerModal = ({ visible, onClose, onScanSuccess, title = 'Scan Barcode' }) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [scanned, setScanned] = useState(false);

  const handleBarcodeScanned = ({ data }) => {
    if (scanned || !data) return;
    setScanned(true);
    const cleanCode = String(data).trim().replace(/[\r\n\t"']/g, '');
    onScanSuccess(cleanCode);
    setScanned(false);
    onClose();
  };

  const handleManualSubmit = () => {
    if (!manualCode.trim()) {
      Alert.alert('Validation Error', 'Please enter a valid barcode number.');
      return;
    }
    const cleanCode = manualCode.trim().replace(/[\r\n\t"']/g, '');
    onScanSuccess(cleanCode);
    setManualCode('');
    onClose();
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

        {/* Camera View */}
        <View style={styles.cameraContainer}>
          {!permission?.granted ? (
            <View style={styles.permissionBox}>
              <QrCode size={48} color="#94a3b8" />
              <Text style={styles.permissionText}>Camera permission required for live scanner.</Text>
              <TouchableOpacity onPress={requestPermission} style={styles.grantBtn}>
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

        {/* Manual Fallback Input */}
        <View style={styles.manualContainer}>
          <Text style={styles.manualTitle}>Or Enter Barcode Manually</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="e.g. BAR-2026-9812"
              placeholderTextColor="#94a3b8"
              value={manualCode}
              onChangeText={setManualCode}
              autoCapitalize="characters"
            />
            <TouchableOpacity onPress={handleManualSubmit} style={styles.submitBtn}>
              <ArrowRight size={20} color="#ffffff" />
            </TouchableOpacity>
          </View>
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
  manualContainer: {
    padding: 20,
    backgroundColor: '#1e293b',
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  manualTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94a3b8',
    marginBottom: 10,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 10,
  },
  input: {
    flex: 1,
    height: 48,
    backgroundColor: '#0f172a',
    borderRadius: 8,
    paddingHorizontal: 14,
    color: '#ffffff',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#334155',
  },
  submitBtn: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#4f46e5',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default BarcodeScannerModal;
