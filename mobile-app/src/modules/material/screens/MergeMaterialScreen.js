import React, { useState, useEffect } from 'react';
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
import { Layers, Camera, Send, CheckSquare, Square, QrCode } from 'lucide-react-native';
import MaterialHeader from '../components/MaterialHeader';
import GeoCameraModal from '../components/GeoCameraModal';
import TallyMaterialSelectModal from '../components/TallyMaterialSelectModal';
import materialApi from '../api/materialApi';

const MergeMaterialScreen = ({ route, navigation }) => {
  const initialBarcode = route.params?.barcode || '';
  const filterTxnId = route.params?.transactionId || '';

  const [activeBarcodes, setActiveBarcodes] = useState([]);
  const [loadingBarcodes, setLoadingBarcodes] = useState(true);
  const [selectedBarcodes, setSelectedBarcodes] = useState(initialBarcode ? [initialBarcode] : []);
  const [parentBarcodeMode, setParentBarcodeMode] = useState('existing'); // 'existing' | 'new'
  const [selectedParentBarcode, setSelectedParentBarcode] = useState(initialBarcode || '');
  const [newParentBarcode, setNewParentBarcode] = useState('');
  const [requestedMaterialName, setRequestedMaterialName] = useState('');
  const [reason, setReason] = useState('');
  const [tallyModalVisible, setTallyModalVisible] = useState(false);
  const [geoCameraVisible, setGeoCameraVisible] = useState(false);
  const [geoPayload, setGeoPayload] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchActiveBarcodes();
  }, []);

  const fetchActiveBarcodes = async () => {
    try {
      setLoadingBarcodes(true);
      const res = await materialApi.getMyActiveBarcodes();
      let list = res?.data || res || [];
      if (!Array.isArray(list)) list = [];
      setActiveBarcodes(list);

      if (filterTxnId && list.length > 0 && selectedBarcodes.length === 0) {
        const matching = list.filter((b) => b.transactionId === filterTxnId).map((b) => b.barcode);
        if (matching.length > 0) {
          setSelectedBarcodes(matching);
          setSelectedParentBarcode(matching[0]);
        }
      }
    } catch (err) {
      console.warn('Error fetching active barcodes:', err);
    } finally {
      setLoadingBarcodes(false);
    }
  };

  const toggleBarcodeSelection = (bCode) => {
    if (selectedBarcodes.includes(bCode)) {
      const updated = selectedBarcodes.filter((b) => b !== bCode);
      setSelectedBarcodes(updated);
      if (selectedParentBarcode === bCode) {
        setSelectedParentBarcode(updated[0] || '');
      }
    } else {
      const updated = [...selectedBarcodes, bCode];
      setSelectedBarcodes(updated);
      if (!selectedParentBarcode) {
        setSelectedParentBarcode(bCode);
      }
    }
  };

  const handleMergeSubmit = async () => {
    if (selectedBarcodes.length < 2) {
      Alert.alert('Validation Error', 'Please select at least 2 barcodes to merge into a single reel.');
      return;
    }
    const targetParent = parentBarcodeMode === 'existing' ? selectedParentBarcode : newParentBarcode.trim();
    if (!targetParent) {
      Alert.alert('Validation Error', 'Target parent barcode string is required.');
      return;
    }
    if (!requestedMaterialName.trim()) {
      Alert.alert('Validation Error', 'Material name is required.');
      return;
    }
    if (!reason.trim()) {
      Alert.alert('Validation Error', 'Reason / remarks for merging is required.');
      return;
    }
    if (!geoPayload) {
      Alert.alert('Validation Error', 'Photo proof & location checkpoint is mandatory for barcode merge.');
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        barcodesToMerge: selectedBarcodes,
        targetParentBarcode: targetParent,
        requestedMaterialName: requestedMaterialName.trim(),
        reason: reason.trim(),
        photoUrl: geoPayload.photoUrl,
        coordinates: geoPayload.coordinates,
      };

      const res = await materialApi.mergeBarcode(payload);
      if (res && (res.success || res._id)) {
        Alert.alert('Merge Success', `Barcode merge request submitted for target ${targetParent}!`);
        navigation.navigate('BarcodeViewAllScreen');
      } else {
        Alert.alert('Error', res?.message || 'Merge request failed.');
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
        title="Merge Barcode Reels"
        subtitle="Combine active reel barcodes into one master lot"
        navigation={navigation}
      />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Step 1: Select Active Barcodes */}
        <Text style={styles.sectionLabel}>1. SELECT BARCODES TO MERGE (MINIMUM 2)</Text>

        {loadingBarcodes ? (
          <ActivityIndicator size="small" color="#4f46e5" style={{ marginVertical: 15 }} />
        ) : activeBarcodes.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>No active barcodes found in your custody.</Text>
          </View>
        ) : (
          <View style={styles.barcodeListContainer}>
            {activeBarcodes.map((item) => {
              const isSelected = selectedBarcodes.includes(item.barcode);
              return (
                <TouchableOpacity
                  key={item._id || item.barcode}
                  style={[styles.barcodeChip, isSelected && styles.barcodeChipSelected]}
                  onPress={() => toggleBarcodeSelection(item.barcode)}
                >
                  {isSelected ? (
                    <CheckSquare size={18} color="#4f46e5" />
                  ) : (
                    <Square size={18} color="#94a3b8" />
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.chipTitle}>{item.barcode}</Text>
                    <Text style={styles.chipSub}>{item.materialName}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Step 2: Parent Barcode Selection */}
        <Text style={styles.sectionLabel}>2. TARGET PARENT BARCODE</Text>
        <View style={styles.tabToggleRow}>
          <TouchableOpacity
            style={[styles.toggleBtn, parentBarcodeMode === 'existing' && styles.toggleBtnActive]}
            onPress={() => setParentBarcodeMode('existing')}
          >
            <Text style={[styles.toggleBtnText, parentBarcodeMode === 'existing' && styles.toggleBtnTextActive]}>
              Use Existing Selected
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, parentBarcodeMode === 'new' && styles.toggleBtnActive]}
            onPress={() => setParentBarcodeMode('new')}
          >
            <Text style={[styles.toggleBtnText, parentBarcodeMode === 'new' && styles.toggleBtnTextActive]}>
              Create New Barcode String
            </Text>
          </TouchableOpacity>
        </View>

        {parentBarcodeMode === 'existing' ? (
          <View style={styles.inputBox}>
            <QrCode size={18} color="#64748b" />
            <Text style={styles.readOnlyText}>
              {selectedParentBarcode || 'Select a barcode above...'}
            </Text>
          </View>
        ) : (
          <View style={styles.inputBox}>
            <TextInput
              style={styles.input}
              placeholder="Enter new master barcode string (e.g. MERGED-REEL-99)"
              placeholderTextColor="#94a3b8"
              value={newParentBarcode}
              onChangeText={setNewParentBarcode}
              autoCapitalize="characters"
            />
          </View>
        )}

        {/* Step 3: Material Name */}
        <Text style={styles.sectionLabel}>3. TARGET MATERIAL NAME</Text>
        <TouchableOpacity
          style={styles.tallyPickerBtn}
          onPress={() => setTallyModalVisible(true)}
        >
          <Text style={styles.tallyPickerText}>
            {requestedMaterialName || 'Tap to Select Tally Inventory Item...'}
          </Text>
        </TouchableOpacity>

        {/* Step 4: Reason / Remarks */}
        <Text style={styles.sectionLabel}>4. REASON / REMARKS *</Text>
        <View style={styles.textAreaBox}>
          <TextInput
            style={styles.textAreaInput}
            placeholder="State reason for merging lots..."
            placeholderTextColor="#94a3b8"
            multiline
            numberOfLines={3}
            value={reason}
            onChangeText={setReason}
          />
        </View>

        {/* Step 5: Geo Photo Checkpoint */}
        <Text style={styles.sectionLabel}>5. PHOTO PROOF CHECKPOINT *</Text>
        <TouchableOpacity
          style={[styles.photoBtn, geoPayload && styles.photoBtnSuccess]}
          onPress={() => setGeoCameraVisible(true)}
        >
          <Camera size={20} color={geoPayload ? '#ffffff' : '#4f46e5'} />
          <Text style={[styles.photoBtnText, geoPayload && { color: '#ffffff' }]}>
            {geoPayload ? 'Photo Evidence Recorded ✓' : 'Take Geo-Tagged Photo Proof'}
          </Text>
        </TouchableOpacity>

        {/* Submit Button */}
        {submitting ? (
          <ActivityIndicator size="large" color="#4f46e5" style={{ marginTop: 24 }} />
        ) : (
          <TouchableOpacity style={styles.submitBtn} onPress={handleMergeSubmit}>
            <Send size={18} color="#ffffff" />
            <Text style={styles.submitBtnText}>Submit Barcode Merge Request</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Modals */}
      <TallyMaterialSelectModal
        visible={tallyModalVisible}
        onClose={() => setTallyModalVisible(false)}
        onSelect={(selected) => setRequestedMaterialName(selected.name || selected.materialName || '')}
      />

      <GeoCameraModal
        visible={geoCameraVisible}
        onClose={() => setGeoCameraVisible(false)}
        onCaptureSuccess={(data) => {
          setGeoPayload(data);
          Alert.alert('Verified', 'Photo proof & GPS location captured!');
        }}
        title="Merge Photo Evidence"
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
    borderColor: '#4f46e5',
    backgroundColor: '#eef2ff',
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
    backgroundColor: '#4f46e5',
  },
  toggleBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#475569',
  },
  toggleBtnTextActive: {
    color: '#ffffff',
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: '#0f172a',
  },
  readOnlyText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#334155',
  },
  tallyPickerBtn: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  tallyPickerText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4f46e5',
  },
  textAreaBox: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    padding: 10,
  },
  textAreaInput: {
    fontSize: 13,
    color: '#0f172a',
    minHeight: 60,
    textAlignVertical: 'top',
  },
  photoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#eef2ff',
    borderWidth: 1,
    borderColor: '#818cf8',
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
    color: '#4f46e5',
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#4f46e5',
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

export default MergeMaterialScreen;
