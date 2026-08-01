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
import { QrCode, Scissors, Send, Layers } from 'lucide-react-native';
import MaterialHeader from '../components/MaterialHeader';
import BarcodeScannerModal from '../components/BarcodeScannerModal';
import materialApi from '../api/materialApi';

const SplitMaterialScreen = ({ route, navigation }) => {
  const initialBarcode = route.params?.barcode || '';
  const [parentBarcode, setParentBarcode] = useState(initialBarcode);
  const [totalParentQuantity, setTotalParentQuantity] = useState('100');
  const [newQuantity, setNewQuantity] = useState('');
  const [scannerVisible, setScannerVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const splitQtyNum = Number(newQuantity) || 0;
  const parentQtyNum = Number(totalParentQuantity) || 0;
  const remainingQty = parentQtyNum - splitQtyNum;

  const handleSplitSubmit = async () => {
    if (!parentBarcode.trim()) {
      Alert.alert('Validation Error', 'Please enter or scan the parent barcode string.');
      return;
    }
    if (splitQtyNum <= 0 || splitQtyNum >= parentQtyNum) {
      Alert.alert(
        'Validation Error',
        `Split quantity must be greater than 0 and less than total parent quantity (${parentQtyNum}).`
      );
      return;
    }

    try {
      setSubmitting(true);
      const generatedChildBarcode = `${parentBarcode.trim()}-SPLIT-${Math.floor(1000 + Math.random() * 9000)}`;
      const payload = {
        barcode: parentBarcode.trim(),
        newBarcode: generatedChildBarcode,
        newQuantity: splitQtyNum,
        remainingQuantity: remainingQty,
      };

      const res = await materialApi.splitBarcode(payload);
      if (res && (res.success || res._id)) {
        Alert.alert(
          'Split Success',
          `New child barcode created: ${generatedChildBarcode}\nRemaining parent balance: ${remainingQty}`
        );
        navigation.navigate('BarcodeViewAllScreen');
      } else {
        Alert.alert('Error', res?.message || 'Reel split request failed.');
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
        title="Reel / Bulk Material Split"
        subtitle="Divide parent barcode into child reel"
        navigation={navigation}
      />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Parent Barcode Input & Scanner */}
        <Text style={styles.label}>PARENT BARCODE (SOURCE REEL)</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="e.g. REEL-3CORE-2026"
            placeholderTextColor="#94a3b8"
            value={parentBarcode}
            onChangeText={setParentBarcode}
            autoCapitalize="characters"
          />
          <TouchableOpacity onPress={() => setScannerVisible(true)} style={styles.scanBtn}>
            <QrCode size={20} color="#ffffff" />
          </TouchableOpacity>
        </View>

        {/* Parent Total Stock Quantity */}
        <Text style={styles.label}>TOTAL CURRENT PARENT QUANTITY</Text>
        <TextInput
          style={styles.fullInput}
          placeholder="e.g. 100"
          placeholderTextColor="#94a3b8"
          keyboardType="numeric"
          value={totalParentQuantity}
          onChangeText={setTotalParentQuantity}
        />

        {/* New Quantity To Split */}
        <Text style={styles.label}>QUANTITY TO SPLIT OUT (CHILD REEL)</Text>
        <TextInput
          style={styles.fullInput}
          placeholder="e.g. 25"
          placeholderTextColor="#94a3b8"
          keyboardType="numeric"
          value={newQuantity}
          onChangeText={setNewQuantity}
        />

        {/* Live Calculation Box */}
        <View style={styles.calcBox}>
          <View style={styles.calcRow}>
            <Layers size={18} color="#059669" />
            <Text style={styles.calcLabel}>Remaining Parent Reel Balance:</Text>
            <Text style={[styles.calcVal, remainingQty < 0 && { color: '#dc2626' }]}>
              {remainingQty >= 0 ? remainingQty : 'Invalid'}
            </Text>
          </View>
        </View>

        {/* Submit */}
        <TouchableOpacity
          onPress={handleSplitSubmit}
          disabled={submitting}
          style={styles.submitBtn}
        >
          {submitting ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <>
              <Scissors size={18} color="#ffffff" />
              <Text style={styles.submitBtnText}>Generate Child Barcode & Split</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Barcode Scanner Modal */}
      <BarcodeScannerModal
        visible={scannerVisible}
        onClose={() => setScannerVisible(false)}
        onScanSuccess={(scannedCode) => setParentBarcode(scannedCode)}
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
  fullInput: {
    height: 48,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#0f172a',
    marginBottom: 8,
  },
  scanBtn: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: '#4f46e5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  calcBox: {
    backgroundColor: '#ecfdf5',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#a7f3d0',
    marginVertical: 14,
  },
  calcRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  calcLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#065f46',
    flex: 1,
  },
  calcVal: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#047857',
  },
  submitBtn: {
    height: 52,
    backgroundColor: '#059669',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
    marginBottom: 30,
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default SplitMaterialScreen;
