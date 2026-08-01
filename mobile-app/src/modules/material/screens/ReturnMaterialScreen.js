import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { QrCode, Camera, Send, RotateCcw } from 'lucide-react-native';
import MaterialHeader from '../components/MaterialHeader';
import BarcodeScannerModal from '../components/BarcodeScannerModal';
import GeoCameraModal from '../components/GeoCameraModal';
import materialApi from '../api/materialApi';

const ReturnMaterialScreen = ({ route, navigation }) => {
  const initialBarcode = route.params?.barcode || '';
  const [barcode, setBarcode] = useState(initialBarcode);
  const [condition, setCondition] = useState('good');
  const [scannerVisible, setScannerVisible] = useState(false);
  const [cameraModalVisible, setCameraModalVisible] = useState(false);
  const [geoPayload, setGeoPayload] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleReturnSubmit = async () => {
    if (!barcode.trim()) {
      Alert.alert('Validation Error', 'Please enter or scan a valid barcode.');
      return;
    }
    if (!geoPayload) {
      Alert.alert('Validation Error', 'Mandatory Photo & GPS location checkpoint required for returns.');
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        barcode: barcode.trim(),
        condition,
        photoUrl: geoPayload.photoUrl,
        coordinates: geoPayload.coordinates,
      };

      const res = await materialApi.returnBarcode(payload);
      if (res && (res.success || res._id)) {
        Alert.alert('Success', 'Material return request logged for store warehouse acceptance!');
        navigation.navigate('BarcodeViewAllScreen');
      } else {
        Alert.alert('Error', res?.message || 'Return request failed.');
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
        title="Store Warehouse Return"
        subtitle="Return barcode item to central warehouse"
        navigation={navigation}
      />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Barcode Input & Scanner */}
        <Text style={styles.label}>ITEM BARCODE</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="e.g. BAR-2026-9812"
            placeholderTextColor="#94a3b8"
            value={barcode}
            onChangeText={setBarcode}
            autoCapitalize="characters"
          />
          <TouchableOpacity onPress={() => setScannerVisible(true)} style={styles.scanBtn}>
            <QrCode size={20} color="#ffffff" />
          </TouchableOpacity>
        </View>

        {/* Condition Picker */}
        <Text style={styles.label}>INSPECTED ITEM CONDITION</Text>
        <View style={styles.condRow}>
          {[
            { key: 'good', label: 'Good / Ready', bg: '#f0fdf4', border: '#86efac', text: '#16a34a' },
            { key: 'damaged', label: 'Damaged', bg: '#fff7ed', border: '#fdba74', text: '#ea580c' },
            { key: 'defective', label: 'Defective', bg: '#fef2f2', border: '#fca5a5', text: '#dc2626' },
          ].map((item) => {
            const isSelected = condition === item.key;
            return (
              <TouchableOpacity
                key={item.key}
                style={[
                  styles.condChip,
                  { backgroundColor: item.bg, borderColor: isSelected ? item.text : item.border },
                  isSelected && styles.condChipActive,
                ]}
                onPress={() => setCondition(item.key)}
              >
                <Text style={[styles.condText, { color: item.text }]}>{item.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Mandatory Photo & GPS Checkpoint */}
        <Text style={styles.label}>MANDATORY RETURN CHECKPOINT</Text>
        <TouchableOpacity
          onPress={() => setCameraModalVisible(true)}
          style={[styles.geoBtn, geoPayload && styles.geoBtnSuccess]}
        >
          <Camera size={20} color={geoPayload ? '#ffffff' : '#4f46e5'} />
          <Text style={[styles.geoBtnText, geoPayload && styles.geoBtnTextSuccess]}>
            {geoPayload ? 'Photo & GPS Checkpoint Logged ✓' : 'Capture Return Inspection Photo & GPS'}
          </Text>
        </TouchableOpacity>

        {/* Submit */}
        <TouchableOpacity
          onPress={handleReturnSubmit}
          disabled={submitting}
          style={styles.submitBtn}
        >
          {submitting ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <>
              <Send size={18} color="#ffffff" />
              <Text style={styles.submitBtnText}>Submit Return Request</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Barcode Scanner Modal */}
      <BarcodeScannerModal
        visible={scannerVisible}
        onClose={() => setScannerVisible(false)}
        onScanSuccess={(scannedCode) => setBarcode(scannedCode)}
      />

      {/* Geo Camera Checkpoint Modal */}
      <GeoCameraModal
        visible={cameraModalVisible}
        onClose={() => setCameraModalVisible(false)}
        onCaptureSuccess={(geoData) => setGeoPayload(geoData)}
        title="Return Inspection Checkpoint"
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
    marginTop: 12,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  input: {
    flex: 1,
    height: 48,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#0f172a',
  },
  scanBtn: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: '#4f46e5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  condRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  condChip: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
  },
  condChipActive: {
    borderWidth: 2,
  },
  condText: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  geoBtn: {
    height: 52,
    backgroundColor: '#eef2ff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#c7d2fe',
    borderStyle: 'dashed',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginVertical: 10,
  },
  geoBtnSuccess: {
    backgroundColor: '#10b981',
    borderColor: '#10b981',
    borderStyle: 'solid',
  },
  geoBtnText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#4f46e5',
  },
  geoBtnTextSuccess: {
    color: '#ffffff',
  },
  submitBtn: {
    height: 52,
    backgroundColor: '#dc2626',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
    marginBottom: 30,
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default ReturnMaterialScreen;
