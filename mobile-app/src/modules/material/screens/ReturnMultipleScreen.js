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
import { RotateCcw, Camera, Send, CheckSquare, Square, User } from 'lucide-react-native';
import MaterialHeader from '../components/MaterialHeader';
import GeoCameraModal from '../components/GeoCameraModal';
import materialApi from '../api/materialApi';

const ReturnMultipleScreen = ({ route, navigation }) => {
  const transactionId = route.params?.id || route.params?.transactionId || '';
  const [barcodes, setBarcodes] = useState([]);
  const [loadingBarcodes, setLoadingBarcodes] = useState(true);
  const [selectedBarcodes, setSelectedBarcodes] = useState([]);

  const [returnMethod, setReturnMethod] = useState('direct'); // 'direct' | 'handler'
  const [handlers, setHandlers] = useState([]);
  const [selectedHandlerId, setSelectedHandlerId] = useState('');
  const [geoCameraVisible, setGeoCameraVisible] = useState(false);
  const [geoPayload, setGeoPayload] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchInitialData();
  }, [transactionId]);

  const fetchInitialData = async () => {
    try {
      setLoadingBarcodes(true);
      const [bcRes, uRes] = await Promise.all([
        transactionId
          ? materialApi.getBarcodesByTransaction(transactionId)
          : materialApi.getMyActiveBarcodes(),
        materialApi.getUsers(),
      ]);

      let bcList = bcRes?.barcodes || bcRes?.data || bcRes || [];
      if (!Array.isArray(bcList)) bcList = [];
      setBarcodes(bcList);
      // Pre-select all barcodes by default
      setSelectedBarcodes(bcList.map((b) => b.barcode || b));

      let uList = uRes?.data || uRes || [];
      if (!Array.isArray(uList)) uList = [];
      setHandlers(uList);
      if (uList.length > 0) setSelectedHandlerId(uList[0]._id || uList[0].id);
    } catch (err) {
      console.warn('Error fetching return multiple data:', err);
    } finally {
      setLoadingBarcodes(false);
    }
  };

  const toggleBarcodeSelection = (bCode) => {
    if (selectedBarcodes.includes(bCode)) {
      setSelectedBarcodes(selectedBarcodes.filter((b) => b !== bCode));
    } else {
      setSelectedBarcodes([...selectedBarcodes, bCode]);
    }
  };

  const handleReturnSubmit = async () => {
    if (selectedBarcodes.length === 0) {
      Alert.alert('Validation Error', 'Please select at least 1 barcode to return.');
      return;
    }
    if (returnMethod === 'handler' && !selectedHandlerId) {
      Alert.alert('Validation Error', 'Please select a delivery handler/transporter.');
      return;
    }
    if (!geoPayload) {
      Alert.alert('Validation Error', 'Photo proof & GPS location is required for store return.');
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        transactionId,
        barcodesToReturn: selectedBarcodes,
        returnMethod,
        handlerId: returnMethod === 'handler' ? selectedHandlerId : undefined,
        photoUrl: geoPayload.photoUrl,
        coordinates: geoPayload.coordinates,
      };

      const res = await materialApi.returnMultipleBarcodes(payload);
      if (res && (res.success || res._id)) {
        Alert.alert('Success', `${selectedBarcodes.length} barcode(s) submitted for store warehouse return!`);
        navigation.navigate('ReturnListScreen');
      } else {
        Alert.alert('Error', res?.message || 'Bulk return request failed.');
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
        title="Return Multiple Barcodes"
        subtitle={`Bulk warehouse return for TXN: ${transactionId || 'Active Inventory'}`}
        navigation={navigation}
      />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Step 1: Barcodes Multi-Select */}
        <Text style={styles.sectionLabel}>1. SELECT BARCODES TO RETURN ({selectedBarcodes.length} SELECTED)</Text>

        {loadingBarcodes ? (
          <ActivityIndicator size="small" color="#4f46e5" style={{ marginVertical: 15 }} />
        ) : barcodes.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>No barcodes available for return.</Text>
          </View>
        ) : (
          <View style={styles.barcodeListContainer}>
            {barcodes.map((item) => {
              const bStr = item.barcode || item;
              const isSelected = selectedBarcodes.includes(bStr);
              return (
                <TouchableOpacity
                  key={item._id || bStr}
                  style={[styles.barcodeChip, isSelected && styles.barcodeChipSelected]}
                  onPress={() => toggleBarcodeSelection(bStr)}
                >
                  {isSelected ? (
                    <CheckSquare size={18} color="#dc2626" />
                  ) : (
                    <Square size={18} color="#94a3b8" />
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.chipTitle}>{bStr}</Text>
                    {item.materialName && <Text style={styles.chipSub}>{item.materialName}</Text>}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Step 2: Return Method */}
        <Text style={styles.sectionLabel}>2. RETURN HANDOVER METHOD</Text>
        <View style={styles.tabToggleRow}>
          <TouchableOpacity
            style={[styles.toggleBtn, returnMethod === 'direct' && styles.toggleBtnActive]}
            onPress={() => setReturnMethod('direct')}
          >
            <Text style={[styles.toggleBtnText, returnMethod === 'direct' && styles.toggleBtnTextActive]}>
              Direct Store Handover
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, returnMethod === 'handler' && styles.toggleBtnActive]}
            onPress={() => setReturnMethod('handler')}
          >
            <Text style={[styles.toggleBtnText, returnMethod === 'handler' && styles.toggleBtnTextActive]}>
              Via Delivery Transporter
            </Text>
          </TouchableOpacity>
        </View>

        {/* Step 3: Handler selection if method is handler */}
        {returnMethod === 'handler' && (
          <>
            <Text style={styles.sectionLabel}>3. SELECT TRANSPORTER / HANDLER *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
              {handlers.map((h) => {
                const hId = h._id || h.id;
                const isSelected = selectedHandlerId === hId;
                return (
                  <TouchableOpacity
                    key={hId}
                    style={[styles.handlerChip, isSelected && styles.handlerChipActive]}
                    onPress={() => setSelectedHandlerId(hId)}
                  >
                    <User size={16} color={isSelected ? '#ffffff' : '#64748b'} />
                    <Text style={[styles.handlerChipText, isSelected && styles.handlerChipTextActive]}>
                      {h.fullName || h.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </>
        )}

        {/* Step 4: Photo & Location Proof */}
        <Text style={styles.sectionLabel}>4. MANDATORY PHOTO & LOCATION PROOF *</Text>
        <TouchableOpacity
          style={[styles.photoBtn, geoPayload && styles.photoBtnSuccess]}
          onPress={() => setGeoCameraVisible(true)}
        >
          <Camera size={20} color={geoPayload ? '#ffffff' : '#dc2626'} />
          <Text style={[styles.photoBtnText, geoPayload && { color: '#ffffff' }]}>
            {geoPayload ? 'Evidence Recorded ✓' : 'Take Geo-Tagged Return Photo'}
          </Text>
        </TouchableOpacity>

        {/* Submit Button */}
        {submitting ? (
          <ActivityIndicator size="large" color="#dc2626" style={{ marginTop: 24 }} />
        ) : (
          <TouchableOpacity style={styles.submitBtn} onPress={handleReturnSubmit}>
            <RotateCcw size={18} color="#ffffff" />
            <Text style={styles.submitBtnText}>Submit Bulk Warehouse Return</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Geo Camera Modal */}
      <GeoCameraModal
        visible={geoCameraVisible}
        onClose={() => setGeoCameraVisible(false)}
        onCaptureSuccess={(data) => {
          setGeoPayload(data);
          Alert.alert('Verified', 'Photo evidence & GPS location captured!');
        }}
        title="Return Photo Evidence"
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
  sectionLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#64748b',
    letterSpacing: 0.8,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyBox: {
    padding: 16,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 13,
  },
  barcodeListContainer: {
    gap: 8,
  },
  barcodeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#ffffff',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  barcodeChipSelected: {
    borderColor: '#dc2626',
    backgroundColor: '#fef2f2',
  },
  chipTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  chipSub: {
    fontSize: 12,
    color: '#64748b',
  },
  tabToggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#e2e8f0',
    borderRadius: 8,
  },
  toggleBtnActive: {
    backgroundColor: '#dc2626',
  },
  toggleBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#475569',
  },
  toggleBtnTextActive: {
    color: '#ffffff',
  },
  chipScroll: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  handlerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    marginRight: 8,
  },
  handlerChipActive: {
    backgroundColor: '#dc2626',
  },
  handlerChipText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  handlerChipTextActive: {
    color: '#ffffff',
  },
  photoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    borderRadius: 12,
    paddingVertical: 14,
  },
  photoBtnSuccess: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
  },
  photoBtnText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#dc2626',
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#dc2626',
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 24,
    marginBottom: 30,
  },
  submitBtnText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffffff',
  },
});

export default ReturnMultipleScreen;
