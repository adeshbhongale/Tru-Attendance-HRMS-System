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
import { QrCode, RefreshCw, Send } from 'lucide-react-native';
import MaterialHeader from '../components/MaterialHeader';
import BarcodeScannerModal from '../components/BarcodeScannerModal';
import materialApi from '../api/materialApi';

const ExchangeBarcodeScreen = ({ route, navigation }) => {
  const initialBarcode = route.params?.barcode || '';
  const [oldBarcode, setOldBarcode] = useState(initialBarcode);
  const [newBarcode, setNewBarcode] = useState('');
  const [reason, setReason] = useState('');
  const [scannerTarget, setScannerTarget] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleExchangeSubmit = async () => {
    if (!oldBarcode.trim()) {
      Alert.alert('Validation Error', 'Please enter or scan the defective old barcode.');
      return;
    }
    if (!newBarcode.trim()) {
      Alert.alert('Validation Error', 'Please enter or scan the replacement new barcode.');
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        oldBarcode: oldBarcode.trim(),
        newBarcode: newBarcode.trim(),
        reason: reason.trim() || 'Warranty Exchange',
      };

      const res = await materialApi.exchangeBarcode(payload);
      if (res && (res.success || res._id)) {
        Alert.alert('Exchange Complete', 'Defective barcode retired and replacement issued successfully!');
        navigation.navigate('BarcodeViewAllScreen');
      } else {
        Alert.alert('Error', res?.message || 'Barcode exchange failed.');
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
        title="Warranty Exchange Barcode"
        subtitle="Replace defective barcode item"
        navigation={navigation}
      />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Old Defective Barcode */}
        <Text style={styles.label}>DEFECTIVE OLD BARCODE</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="e.g. BAR-OLD-9012"
            placeholderTextColor="#94a3b8"
            value={oldBarcode}
            onChangeText={setOldBarcode}
            autoCapitalize="characters"
          />
          <TouchableOpacity onPress={() => setScannerTarget('old')} style={styles.scanBtn}>
            <QrCode size={20} color="#ffffff" />
          </TouchableOpacity>
        </View>

        {/* New Replacement Barcode */}
        <Text style={styles.label}>NEW REPLACEMENT BARCODE</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="e.g. BAR-NEW-9013"
            placeholderTextColor="#94a3b8"
            value={newBarcode}
            onChangeText={setNewBarcode}
            autoCapitalize="characters"
          />
          <TouchableOpacity onPress={() => setScannerTarget('new')} style={styles.scanBtn}>
            <QrCode size={20} color="#ffffff" />
          </TouchableOpacity>
        </View>

        {/* Reason / Remarks */}
        <Text style={styles.label}>REASON FOR WARRANTY REPLACEMENT</Text>
        <TextInput
          style={styles.fullInput}
          placeholder="e.g. Damaged during field installation / Defective insulation"
          placeholderTextColor="#94a3b8"
          value={reason}
          onChangeText={setReason}
        />

        {/* Submit */}
        <TouchableOpacity
          onPress={handleExchangeSubmit}
          disabled={submitting}
          style={styles.submitBtn}
        >
          {submitting ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <>
              <RefreshCw size={18} color="#ffffff" />
              <Text style={styles.submitBtnText}>Confirm Barcode Exchange</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Barcode Scanner Modal */}
      <BarcodeScannerModal
        visible={Boolean(scannerTarget)}
        onClose={() => setScannerTarget(null)}
        onScanSuccess={(code) => {
          if (scannerTarget === 'old') setOldBarcode(code);
          if (scannerTarget === 'new') setNewBarcode(code);
        }}
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
  submitBtn: {
    height: 52,
    backgroundColor: '#0284c7',
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

export default ExchangeBarcodeScreen;
