import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Camera, CircleCheck, MapPin, QrCode } from 'lucide-react-native';
import MaterialHeader from '../components/MaterialHeader';
import GeoCameraModal from '../components/GeoCameraModal';
import BarcodeScannerModal from '../components/BarcodeScannerModal';
import materialApi from '../api/materialApi';

const ReceivingFormScreen = ({ route, navigation }) => {
  const { id } = route.params;
  const [cameraModalVisible, setCameraModalVisible] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [scannedBarcodes, setScannedBarcodes] = useState([]);
  const [geoPayload, setGeoPayload] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleScanSuccess = (code) => {
    if (!code) return;
    if (!scannedBarcodes.includes(code)) {
      setScannedBarcodes([...scannedBarcodes, code]);
      Alert.alert('Barcode Scanned', `Barcode ${code} verified on receipt.`);
    } else {
      Alert.alert('Info', `Barcode ${code} is already added.`);
    }
  };

  const handleConfirmReceipt = async () => {
    if (!geoPayload) {
      Alert.alert('Validation Error', 'Mandatory Geo Photo & Location required for receipt confirmation.');
      return;
    }

    try {
      setSubmitting(true);
      const res = await materialApi.receiveTransaction(id, {
        photoUrl: geoPayload.photoUrl,
        coordinates: geoPayload.coordinates,
        gps: geoPayload.gps,
        scannedBarcodes,
      });

      if (res && res.success) {
        Alert.alert('Success', 'Material receipt confirmed and barcodes moved to active inventory!');
        navigation.navigate('MaterialDetailScreen', { id });
      } else {
        Alert.alert('Error', res?.message || 'Receipt confirmation failed.');
      }
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <MaterialHeader
        title="Confirm Material Receipt"
        subtitle="Verification & Mandatory Custody Photo"
        navigation={navigation}
      />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Step 1: Scan Received Barcodes */}
        <Text style={styles.label}>STEP 1: SCAN RECEIVED BARCODES</Text>
        <TouchableOpacity
          style={styles.scanBtn}
          onPress={() => setScannerVisible(true)}
        >
          <QrCode size={20} color="#4f46e5" />
          <Text style={styles.scanBtnText}>Scan Received Barcode</Text>
        </TouchableOpacity>

        {scannedBarcodes.length > 0 && (
          <View style={styles.barcodesBox}>
            <Text style={styles.barcodesTitle}>Scanned Barcodes ({scannedBarcodes.length}):</Text>
            {scannedBarcodes.map((b, i) => (
              <Text key={i} style={styles.barcodeChip}>• {b}</Text>
            ))}
          </View>
        )}

        {/* Step 2: Geo Photo */}
        <Text style={styles.label}>STEP 2: MANDATORY CUSTODY GEO-PHOTO</Text>
        <View style={styles.card}>
          {geoPayload ? (
            <View style={styles.capturedBox}>
              <CircleCheck size={32} color="#16a34a" />
              <Text style={styles.capturedTitle}>Custody Photo & GPS Captured!</Text>
              <Text style={styles.gpsText}>
                <MapPin size={12} color="#64748b" /> Lat: {geoPayload.gps?.lat?.toFixed(5)}, Lng: {geoPayload.gps?.lng?.toFixed(5)}
              </Text>
              <TouchableOpacity
                onPress={() => setCameraModalVisible(true)}
                style={styles.retakeBtn}
              >
                <Text style={styles.retakeText}>Retake Photo</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.emptyPhotoBox}>
              <Camera size={40} color="#94a3b8" />
              <Text style={styles.photoInstructions}>
                Take a mandatory photo of delivered materials at project site. GPS location will be embedded.
              </Text>
              <TouchableOpacity
                onPress={() => setCameraModalVisible(true)}
                style={styles.captureBtn}
              >
                <Camera size={18} color="#ffffff" />
                <Text style={styles.captureBtnText}>Capture Geo Photo</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Submit */}
        <TouchableOpacity
          onPress={handleConfirmReceipt}
          disabled={submitting}
          style={styles.submitBtn}
        >
          {submitting ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <>
              <CircleCheck size={18} color="#ffffff" />
              <Text style={styles.submitBtnText}>Accept Materials & Activate Barcodes</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Barcode Scanner Modal */}
      <BarcodeScannerModal
        visible={scannerVisible}
        onClose={() => setScannerVisible(false)}
        onScanSuccess={handleScanSuccess}
        title="Scan Received Barcode"
      />

      {/* Camera Modal */}
      <GeoCameraModal
        visible={cameraModalVisible}
        onClose={() => setCameraModalVisible(false)}
        onCapture={(payload) => setGeoPayload(payload)}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scrollContent: {
    padding: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#64748b',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 14,
  },
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#eef2ff',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#c7d2fe',
  },
  scanBtnText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#4f46e5',
  },
  barcodesBox: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  barcodesTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#16a34a',
    marginBottom: 6,
  },
  barcodeChip: {
    fontSize: 13,
    color: '#334155',
    marginVertical: 2,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  emptyPhotoBox: {
    alignItems: 'center',
    gap: 12,
  },
  photoInstructions: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
  },
  captureBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#4f46e5',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  captureBtnText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  capturedBox: {
    alignItems: 'center',
    gap: 8,
  },
  capturedTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#16a34a',
  },
  gpsText: {
    fontSize: 12,
    color: '#64748b',
  },
  retakeBtn: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
  },
  retakeText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16a34a',
    padding: 16,
    borderRadius: 12,
    marginTop: 24,
    gap: 8,
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: 'bold',
  },
});

export default ReceivingFormScreen;
