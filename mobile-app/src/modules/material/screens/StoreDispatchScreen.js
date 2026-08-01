import React, { useState, useEffect } from 'react';
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
import { Truck, User, QrCode } from 'lucide-react-native';
import MaterialHeader from '../components/MaterialHeader';
import BarcodeScannerModal from '../components/BarcodeScannerModal';
import materialApi from '../api/materialApi';

const StoreDispatchScreen = ({ route, navigation }) => {
  const { id } = route.params;
  const [txn, setTxn] = useState(null);
  const [handlers, setHandlers] = useState([]);
  const [selectedHandlerId, setSelectedHandlerId] = useState('');
  const [scannedBarcodes, setScannedBarcodes] = useState([]);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchData();
  }, [id]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [tRes, uRes] = await Promise.all([
        materialApi.getTransactionById(id),
        materialApi.getUsers(),
      ]);

      if (tRes && (tRes.success || tRes._id)) {
        setTxn(tRes.data || tRes);
      }
      if (uRes && (uRes.data || Array.isArray(uRes))) {
        const list = uRes.data || uRes;
        setHandlers(list);
        if (list.length > 0) setSelectedHandlerId(list[0]._id || list[0].id);
      }
    } catch (e) {
      Alert.alert('Error', 'Failed loading store dispatch data.');
    } finally {
      setLoading(false);
    }
  };

  const handleScanSuccess = (code) => {
    if (!code) return;
    if (!scannedBarcodes.includes(code)) {
      setScannedBarcodes([...scannedBarcodes, code]);
      Alert.alert('Barcode Verified', `Barcode ${code} verified for dispatch.`);
    } else {
      Alert.alert('Info', `Barcode ${code} is already added.`);
    }
  };

  const handleConfirmDispatch = async () => {
    if (!selectedHandlerId) {
      Alert.alert('Validation Error', 'Please select a handler / transporter.');
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        handler: selectedHandlerId,
        scannedBarcodes,
      };

      const res = await materialApi.dispatchTransaction(id, payload);
      if (res && res.success) {
        Alert.alert('Dispatched', 'Materials dispatched with assigned transporter!');
        navigation.navigate('MaterialDetailScreen', { id });
      } else {
        Alert.alert('Error', res?.message || 'Dispatch failed.');
      }
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !txn) {
    return (
      <SafeAreaView style={styles.container}>
        <MaterialHeader title="Store Dispatch" navigation={navigation} />
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#4f46e5" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <MaterialHeader
        title="Store Dispatch & Handler"
        subtitle={`Voucher: ${txn.transactionId}`}
        navigation={navigation}
      />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Request Items */}
        <Text style={styles.label}>DISPATCHING MATERIAL ITEMS</Text>
        <View style={styles.card}>
          {txn.materials?.map((m, idx) => (
            <View key={idx} style={[styles.itemRow, idx > 0 && styles.borderTop]}>
              <Text style={styles.itemName}>{m.materialName}</Text>
              <Text style={styles.itemQty}>{m.quantity} {m.unit}</Text>
            </View>
          ))}
        </View>

        {/* Scan Barcode Button */}
        <Text style={styles.label}>DISPATCH BARCODE VERIFICATION</Text>
        <TouchableOpacity
          style={styles.scanBtn}
          onPress={() => setScannerVisible(true)}
        >
          <QrCode size={20} color="#4f46e5" />
          <Text style={styles.scanBtnText}>Scan Dispatch Barcode</Text>
        </TouchableOpacity>

        {scannedBarcodes.length > 0 && (
          <View style={styles.barcodesBox}>
            <Text style={styles.barcodesTitle}>Verified Barcodes ({scannedBarcodes.length}):</Text>
            {scannedBarcodes.map((b, i) => (
              <Text key={i} style={styles.barcodeChip}>• {b}</Text>
            ))}
          </View>
        )}

        {/* Select Transporter */}
        <Text style={styles.label}>ASSIGN TRANSPORTER / HANDLER</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.userScroll}>
          {handlers.map((h) => {
            const hid = h._id || h.id;
            const hName = h.fullName || h.name || 'Staff';
            const isSelected = selectedHandlerId === hid;

            return (
              <TouchableOpacity
                key={hid}
                style={[styles.userChip, isSelected && styles.userChipActive]}
                onPress={() => setSelectedHandlerId(hid)}
              >
                <User size={16} color={isSelected ? '#ffffff' : '#64748b'} />
                <Text style={[styles.userChipText, isSelected && styles.userChipTextActive]}>
                  {hName}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Submit */}
        <TouchableOpacity
          onPress={handleConfirmDispatch}
          disabled={submitting}
          style={styles.submitBtn}
        >
          {submitting ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <>
              <Truck size={18} color="#ffffff" />
              <Text style={styles.submitBtnText}>Confirm Store Dispatch</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Barcode Scanner Modal */}
      <BarcodeScannerModal
        visible={scannerVisible}
        onClose={() => setScannerVisible(false)}
        onScanSuccess={handleScanSuccess}
        title="Scan Dispatch Barcode"
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  borderTop: {
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  itemName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },
  itemQty: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#4f46e5',
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
  userScroll: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  userChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  userChipActive: {
    backgroundColor: '#4f46e5',
    borderColor: '#4f46e5',
  },
  userChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  userChipTextActive: {
    color: '#ffffff',
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
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default StoreDispatchScreen;
