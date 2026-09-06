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
  Image,
} from 'react-native';
import { Layers, Camera, Send, CheckSquare, Square, QrCode, Database, Check, Trash2, RotateCcw } from 'lucide-react-native';
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
  const [requestedMaterialName, setRequestedMaterialName] = useState('');
  const [useOtherMaterial, setUseOtherMaterial] = useState(false);
  const [otherMaterialName, setOtherMaterialName] = useState('');
  const [reason, setReason] = useState('');
  const [tallyModalVisible, setTallyModalVisible] = useState(false);
  const [geoCameraVisible, setGeoCameraVisible] = useState(false);
  const [geoPayload, setGeoPayload] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  useEffect(() => {
    fetchActiveBarcodes();
  }, []);

  const fetchActiveBarcodes = async () => {
    try {
      setLoadingBarcodes(true);
      let list = [];
      if (Array.isArray(route.params?.availableBarcodes) && route.params.availableBarcodes.length > 0) {
        list = route.params.availableBarcodes;
      } else if (filterTxnId) {
        const bcRes = await materialApi.getBarcodesByTransaction(filterTxnId);
        list = bcRes?.barcodes || bcRes?.data || bcRes || [];
      } else {
        const res = await materialApi.getMyActiveBarcodes();
        list = res?.data || res || [];
      }
      if (!Array.isArray(list)) list = [];

      // Strictly filter to Active-only barcodes, excluding closed, merged, returned, and any pending barcodes
      const filtered = list.filter((b) => {
        if (!b) return false;
        const bStatus = String(typeof b === 'object' ? (b.status || 'Active') : 'Active').toLowerCase().trim();
        if (['closed', 'returned', 'merged', 'exchanged', 'split', 'in_transit', 'dispatched', 'pending_acceptance'].includes(bStatus)) {
          return false;
        }
        if (bStatus.includes('pending') || bStatus.includes('close') || bStatus.includes('return') || bStatus.includes('merge')) {
          return false;
        }
        return bStatus === 'active' || bStatus === 'issued';
      });

      setActiveBarcodes(filtered);

      if (filterTxnId && filtered.length > 0 && selectedBarcodes.length === 0) {
        const matching = filtered
          .filter((b) => (b.transactionId === filterTxnId || String(b.transaction || '') === String(filterTxnId)))
          .map((b) => (typeof b === 'string' ? b : b.barcode));
        if (matching.length > 0) {
          setSelectedBarcodes(matching);
          setSelectedParentBarcode(matching[0]);
        }
      }
    } catch (err) {
      console.warn('Error fetching active barcodes for merge:', err);
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

  const resolvedMaterialName = useOtherMaterial ? otherMaterialName.trim() : requestedMaterialName.trim();

  const handleMergeSubmit = async () => {
    if (submitting || isSubmitted) return;
    if (selectedBarcodes.length < 2) {
      Alert.alert('Validation Error', 'Please select at least 2 active barcodes to merge into a master lot.');
      return;
    }
    if (parentBarcodeMode === 'existing') {
      if (!selectedParentBarcode || !selectedBarcodes.includes(selectedParentBarcode)) {
        Alert.alert('Validation Error', 'Please choose which of the selected barcodes to keep as parent.');
        return;
      }
    } else if (parentBarcodeMode === 'new') {
      if (!resolvedMaterialName) {
        Alert.alert('Validation Error', 'Please specify or select the new merged material name.');
        return;
      }
    }
    if (!reason.trim()) {
      Alert.alert('Validation Error', 'Reason / remarks for merging barcodes is required.');
      return;
    }
    if (!geoPayload) {
      Alert.alert('Validation Error', 'Live photo proof & GPS location checkpoint is mandatory for barcode merge.');
      return;
    }

    try {
      setSubmitting(true);
      const gps = geoPayload.gps || {};
      const payload = {
        mergeBarcodes: selectedBarcodes,
        parentBarcodeMode,
        selectedParentBarcode: parentBarcodeMode === 'existing' ? selectedParentBarcode : undefined,
        requestedMaterialName: parentBarcodeMode === 'new' ? resolvedMaterialName : undefined,
        reason: reason.trim(),
        gps: {
          lat: gps.latitude || gps.lat || 18.5204,
          lng: gps.longitude || gps.lng || 73.8567,
          address: gps.address || 'Address unavailable',
        },
        photos: [{ url: geoPayload.photoUrl, capturedAt: new Date().toISOString() }],
      };

      const res = await materialApi.mergeBarcode(payload);
      if (res && (res.success !== false && (res.data || res.message || res._id))) {
        setIsSubmitted(true);
        const targetBc = selectedParentBarcode || (selectedBarcodes && selectedBarcodes[0]);
        // Reset form state so back button never reveals submitted form
        setSelectedBarcodes([]);
        setSelectedParentBarcode('');
        setReason('');
        setGeoPayload(null);
        setRequestedMaterialName('');
        setOtherMaterialName('');

        Alert.alert(
          'Merge Request Submitted',
          'Barcode merge request submitted to Store Admin for approval. The original barcodes stay locked until Store approval.',
          [
            {
              text: 'OK',
              onPress: () => {
                if (targetBc) {
                  navigation.replace('BarcodeDetailScreen', { barcode: targetBc });
                } else {
                  navigation.replace('BarcodeViewAllScreen');
                }
              },
            },
          ]
        );
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
        title="Merge Material Serials"
        subtitle="Unify multiple active barcodes into a master lot"
        navigation={navigation}
      />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Step 1: Select Active Barcodes */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionLabel}>1. SELECT ACTIVE BARCODES TO MERGE (MIN. 2) *</Text>
          {activeBarcodes.length > 0 && (
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity
                onPress={() => {
                  const allCodes = activeBarcodes.map((b) => b.barcode);
                  setSelectedBarcodes(allCodes);
                  if (!selectedParentBarcode && allCodes.length > 0) {
                    setSelectedParentBarcode(allCodes[0]);
                  }
                }}
              >
                <Text style={styles.selectAllText}>Select All</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setSelectedBarcodes([]);
                  setSelectedParentBarcode('');
                }}
              >
                <Text style={[styles.selectAllText, { color: '#dc2626' }]}>Clear All</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

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
                  {isSelected && (
                    <View style={styles.selectedBadge}>
                      <Text style={styles.selectedBadgeText}>Selected</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Step 2: Parent Barcode Mode */}
        <Text style={styles.sectionLabel}>2. PARENT BARCODE SETTINGS *</Text>
        <View style={styles.tabToggleRow}>
          <TouchableOpacity
            style={[styles.toggleBtn, parentBarcodeMode === 'existing' && styles.toggleBtnActive]}
            onPress={() => setParentBarcodeMode('existing')}
          >
            <Text style={[styles.toggleBtnText, parentBarcodeMode === 'existing' && styles.toggleBtnTextActive]}>
              Keep Existing as Parent
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, parentBarcodeMode === 'new' && styles.toggleBtnActive]}
            onPress={() => setParentBarcodeMode('new')}
          >
            <Text style={[styles.toggleBtnText, parentBarcodeMode === 'new' && styles.toggleBtnTextActive]}>
              Create New Barcode
            </Text>
          </TouchableOpacity>
        </View>

        {parentBarcodeMode === 'existing' ? (
          <View style={{ gap: 6, marginBottom: 8 }}>
            <Text style={styles.hintText}>Select which of the chosen barcodes will become the master parent:</Text>
            {selectedBarcodes.length === 0 ? (
              <View style={styles.inputBox}>
                <Text style={{ color: '#94a3b8', fontSize: 13 }}>Select barcodes above first...</Text>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {selectedBarcodes.map((code) => {
                  const isParent = selectedParentBarcode === code;
                  return (
                    <TouchableOpacity
                      key={code}
                      style={[styles.parentChip, isParent && styles.parentChipActive]}
                      onPress={() => setSelectedParentBarcode(code)}
                    >
                      <QrCode size={14} color={isParent ? '#ffffff' : '#4f46e5'} />
                      <Text style={[styles.parentChipText, isParent && { color: '#ffffff' }]}>{code}</Text>
                      {isParent && <Check size={14} color="#ffffff" />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        ) : (
          <View style={{ gap: 6, marginBottom: 8 }}>
            <Text style={styles.hintText}>Store Admin will issue the final replacement serial upon approval. Select target product name:</Text>
            {!useOtherMaterial ? (
              <>
                <TouchableOpacity
                  style={styles.tallyPickerBtn}
                  onPress={() => setTallyModalVisible(true)}
                >
                  <Database size={16} color="#4f46e5" />
                  <Text style={[styles.tallyPickerText, !requestedMaterialName && { color: '#94a3b8' }]}>
                    {requestedMaterialName || 'Select Tally Inventory Item...'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setUseOtherMaterial(true); setRequestedMaterialName(''); }}>
                  <Text style={styles.otherLinkText}>Material not in Tally? Choose Custom Material ➔</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TextInput
                  style={styles.input}
                  placeholder="Enter custom material name..."
                  placeholderTextColor="#94a3b8"
                  value={otherMaterialName}
                  onChangeText={setOtherMaterialName}
                />
                <TouchableOpacity onPress={() => { setUseOtherMaterial(false); setOtherMaterialName(''); }}>
                  <Text style={styles.otherLinkText}>⬅ Back to Tally Inventory Search</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {/* Step 3: Reason / Remarks */}
        <Text style={styles.sectionLabel}>3. REASON / REMARKS FOR MERGE *</Text>
        <TextInput
          style={styles.textArea}
          placeholder="State technical or operational justification for merging lots..."
          placeholderTextColor="#94a3b8"
          multiline
          numberOfLines={3}
          value={reason}
          onChangeText={setReason}
        />

        {/* Step 4: Geo Photo Checkpoint */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionLabel}>4. LIVE PROOF PHOTO *</Text>
          {geoPayload && (
            <TouchableOpacity onPress={() => setGeoCameraVisible(true)} style={styles.retakeTopBtn}>
              <RotateCcw size={12} color="#4f46e5" />
              <Text style={styles.retakeTopBtnText}>Retake Photo</Text>
            </TouchableOpacity>
          )}
        </View>

        {geoPayload ? (
          <View style={styles.photoPreviewCard}>
            <Image source={{ uri: geoPayload.photoUrl }} style={styles.previewImage} />
            <View style={styles.photoInfoOverlay}>
              <Text style={styles.photoGpsText}>
                GPS: {geoPayload.gps?.latitude || geoPayload.coordinates?.[1] || 18.5204},{' '}
                {geoPayload.gps?.longitude || geoPayload.coordinates?.[0] || 73.8567}
              </Text>
              <Text style={styles.photoAddressText} numberOfLines={1}>
                {geoPayload.gps?.address || 'Verification location recorded'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.deletePhotoBadgeBtn}
              onPress={() => setGeoPayload(null)}
            >
              <Trash2 size={14} color="#ffffff" />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.geoBtn}
            onPress={() => setGeoCameraVisible(true)}
            activeOpacity={0.8}
          >
            <Camera size={22} color="#4f46e5" />
            <Text style={styles.geoBtnText}>Take Geo-Tagged Photo of Materials Together</Text>
          </TouchableOpacity>
        )}

        {/* Submit Button - Only displayed if active barcodes are present */}
        {activeBarcodes.length > 0 && (
          <TouchableOpacity
            style={[styles.submitBtn, (submitting || isSubmitted) && { opacity: 0.7 }]}
            onPress={handleMergeSubmit}
            disabled={submitting || isSubmitted}
          >
            {submitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <>
                <Layers size={18} color="#ffffff" />
                <Send size={16} color="#ffffff" />
                <Text style={styles.submitBtnText}>Submit Barcode Merge Request</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        <Text style={styles.footerNote}>
          Upon Store approval child barcodes are marked Merged and the parent barcode holds the combined lot.
        </Text>
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
        title="Merge Photo Evidence Checkpoint"
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
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectAllText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#4f46e5',
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
  selectedBadge: {
    backgroundColor: '#dbeafe',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  selectedBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1e40af',
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
  hintText: {
    fontSize: 11,
    color: '#64748b',
    marginBottom: 6,
  },
  parentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  parentChipActive: {
    backgroundColor: '#4f46e5',
    borderColor: '#4f46e5',
  },
  parentChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
  },
  input: {
    height: 46,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 14,
    fontSize: 14,
    color: '#0f172a',
  },
  tallyPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 14,
    height: 46,
  },
  tallyPickerText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4f46e5',
  },
  otherLinkText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4f46e5',
    marginTop: 6,
  },
  textArea: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    padding: 12,
    fontSize: 13,
    color: '#0f172a',
    minHeight: 70,
    textAlignVertical: 'top',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  retakeTopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  retakeTopBtnText: {
    fontSize: 11,
    color: '#4f46e5',
    fontWeight: '700',
  },
  geoBtn: {
    borderWidth: 2,
    borderColor: '#cbd5e1',
    borderStyle: 'dashed',
    borderRadius: 12,
    backgroundColor: '#ffffff',
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  geoBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4f46e5',
  },
  photoPreviewCard: {
    height: 150,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    position: 'relative',
    backgroundColor: '#0f172a',
  },
  previewImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  photoInfoOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    padding: 8,
  },
  photoGpsText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#ffffff',
  },
  photoAddressText: {
    fontSize: 10,
    color: '#cbd5e1',
    marginTop: 2,
  },
  deletePhotoBadgeBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#dc2626',
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#4f46e5',
    borderRadius: 12,
    paddingVertical: 15,
    marginTop: 20,
  },
  submitBtnText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  footerNote: {
    fontSize: 11,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 30,
    fontStyle: 'italic',
  },
});

export default MergeMaterialScreen;
