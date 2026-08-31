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
import { Camera, Scissors, Send, Plus, Trash2, Database, User, Package, AlertCircle } from 'lucide-react-native';
import MaterialHeader from '../components/MaterialHeader';
import GeoCameraModal from '../components/GeoCameraModal';
import TallyMaterialSelectModal from '../components/TallyMaterialSelectModal';
import materialApi from '../api/materialApi';

const SplitMaterialScreen = ({ route, navigation }) => {
  const initialBarcode = route.params?.barcode || '';

  // Parent barcode detail (read-only card)
  const [barcodeDetail, setBarcodeDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(Boolean(initialBarcode));

  // Form state matching SplitMaterial.jsx / Screen 6 spec
  const [useOtherMaterial, setUseOtherMaterial] = useState(false);
  const [splitMaterialName, setSplitMaterialName] = useState('');
  const [otherMaterialName, setOtherMaterialName] = useState('');
  const [additionalItems, setAdditionalItems] = useState([]);
  const [activeAdditionalIndex, setActiveAdditionalIndex] = useState(null);
  const [reason, setReason] = useState('');
  const [geoPayload, setGeoPayload] = useState(null);
  const [tallyModalVisible, setTallyModalVisible] = useState(false);
  const [geoCameraVisible, setGeoCameraVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (initialBarcode) {
      loadBarcodeDetail();
    }
  }, [initialBarcode]);

  const loadBarcodeDetail = async () => {
    try {
      setLoadingDetail(true);
      const res = await materialApi.getBarcodeDetails(initialBarcode);
      if (res) {
        setBarcodeDetail(res.barcode || res.data || res);
      }
    } catch (err) {
      console.warn('Failed loading split parent detail:', err.message);
    } finally {
      setLoadingDetail(false);
    }
  };

  const bc = barcodeDetail || {};
  const ownerName =
    (bc.owner && typeof bc.owner === 'object' && (bc.owner.fullName || bc.owner.name)) ||
    (bc.currentCustodian && typeof bc.currentCustodian === 'object' && (bc.currentCustodian.fullName || bc.currentCustodian.name)) ||
    'Active Custodian';

  const handleAddAdditionalItem = () => {
    setAdditionalItems([...additionalItems, { name: '', otherName: '', isOther: false }]);
  };

  const handleRemoveAdditionalItem = (index) => {
    setAdditionalItems(additionalItems.filter((_, idx) => idx !== index));
  };

  const handleAdditionalItemChange = (index, patch) => {
    const updated = [...additionalItems];
    updated[index] = { ...updated[index], ...patch };
    setAdditionalItems(updated);
  };

  const resolvedSplitName = useOtherMaterial ? otherMaterialName.trim() : splitMaterialName.trim();

  const handleSubmitSplitRequest = async () => {
    if (!initialBarcode.trim()) {
      Alert.alert('Validation Error', 'Parent barcode serial is required.');
      return;
    }
    if (!resolvedSplitName) {
      Alert.alert('Validation Error', 'Please select the split material name from Tally or enter custom material name.');
      return;
    }
    for (let i = 0; i < additionalItems.length; i++) {
      const item = additionalItems[i];
      const itemName = item.isOther ? (item.otherName || '').trim() : (item.name || '').trim();
      if (!itemName) {
        Alert.alert('Validation Error', `Additional split item #${i + 1} needs a material name.`);
        return;
      }
    }
    if (!reason.trim()) {
      Alert.alert('Validation Error', 'Reason / remarks explaining the technical or operational need for splitting is required.');
      return;
    }
    if (!geoPayload) {
      Alert.alert('Validation Error', 'A live geo-tagged proof photo of the physical material being split is mandatory.');
      return;
    }

    try {
      setSubmitting(true);

      // Build requested material name proposal
      let requestedName = resolvedSplitName;
      const extraNames = additionalItems
        .map((it) => (it.isOther ? (it.otherName || '').trim() : (it.name || '').trim()))
        .filter(Boolean);
      if (extraNames.length > 0) {
        requestedName = `${requestedName} + ${extraNames.join(', ')}`;
      }

      const gps = geoPayload.gps || {};
      const payload = {
        barcode: initialBarcode.trim().toUpperCase(),
        requestedMaterialName: requestedName,
        reason: reason.trim(),
        gps: {
          lat: gps.latitude || gps.lat || 18.5204,
          lng: gps.longitude || gps.lng || 73.8567,
          address: gps.address || 'Address unavailable',
        },
        photos: [{ url: geoPayload.photoUrl, capturedAt: new Date().toISOString() }],
      };

      const res = await materialApi.splitBarcode(payload);
      if (res && (res.success !== false && (res.data || res.message || res._id))) {
        Alert.alert(
          'Split Request Submitted',
          `Your split request for barcode ${initialBarcode} was sent to Store Admin for approval. The original barcode stays locked until a decision is made.`,
          [
            { text: 'OK', onPress: () => navigation.navigate('BarcodeDetailScreen', { barcode: initialBarcode }) },
          ]
        );
      } else {
        Alert.alert('Error', res?.message || 'Failed to submit split request.');
      }
    } catch (err) {
      Alert.alert('Error', (err.response?.data?.message) || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <MaterialHeader
        title="Split Material Serial"
        subtitle="Propose dividing a serialized unit into child lots"
        navigation={navigation}
      />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Step 1: Primary Barcode Details (Read-only) */}
        <Text style={styles.sectionLabel}>1. PRIMARY BARCODE DETAILS</Text>
        <View style={[styles.card, loadingDetail && { opacity: 0.6 }]}>
          <View style={styles.detailRow}>
            <Package size={18} color="#7c3aed" />
            <Text style={styles.barcodeTitle}>{initialBarcode || 'NO BARCODE'}</Text>
          </View>
          <View style={styles.infoGridRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabelText}>MATERIAL NAME</Text>
              <Text style={styles.infoValue}>{bc.materialName || 'Loading...'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabelText}>CURRENT OWNER</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <User size={12} color="#64748b" />
                <Text style={styles.infoValue}>{ownerName}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Step 2: Primary Split Item Specification */}
        <Text style={styles.sectionLabel}>2. SPLIT MATERIAL NAME *</Text>
        {!useOtherMaterial ? (
          <>
            <TouchableOpacity style={styles.tallyPickerBtn} onPress={() => setTallyModalVisible(true)}>
              <Database size={16} color="#4f46e5" />
              <Text style={[styles.tallyPickerText, !splitMaterialName && { color: '#94a3b8' }]} numberOfLines={1}>
                {splitMaterialName || 'Search Tally inventory item...'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setUseOtherMaterial(true); setSplitMaterialName(''); }}>
              <Text style={styles.otherLinkText}>Material not in Tally? Choose Other Material ➔</Text>
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

        {/* Step 3: Additional Split Items */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionLabel}>3. ADDITIONAL SPLIT ITEMS (OPTIONAL)</Text>
          <TouchableOpacity onPress={handleAddAdditionalItem} style={styles.addRowBtn}>
            <Plus size={14} color="#2563eb" />
            <Text style={styles.addRowBtnText}>Add Row</Text>
          </TouchableOpacity>
        </View>

        {additionalItems.length === 0 ? (
          <Text style={styles.hintText}>No additional items. Tap "Add Row" to include extra materials produced by this split.</Text>
        ) : (
          additionalItems.map((item, idx) => (
            <View key={idx} style={styles.additionalCard}>
              <View style={styles.additionalHeader}>
                <Text style={styles.additionalIndex}>#{idx + 1}</Text>
                <TouchableOpacity
                  onPress={() => handleAdditionalItemChange(idx, { isOther: !item.isOther })}
                  style={styles.miniToggle}
                >
                  <Text style={styles.miniToggleText}>{item.isOther ? 'Use Tally' : 'Other'}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleRemoveAdditionalItem(idx)}>
                  <Trash2 size={16} color="#ef4444" />
                </TouchableOpacity>
              </View>

              {item.isOther ? (
                <TextInput
                  style={styles.itemInput}
                  placeholder="Custom material name..."
                  placeholderTextColor="#94a3b8"
                  value={item.otherName}
                  onChangeText={(v) => handleAdditionalItemChange(idx, { otherName: v })}
                />
              ) : (
                <TouchableOpacity
                  style={styles.tallyPickerSmall}
                  onPress={() => {
                    setActiveAdditionalIndex(idx);
                    setTallyModalVisible(true);
                  }}
                >
                  <Database size={14} color="#4f46e5" />
                  <Text style={[styles.tallyPickerSmallText, !item.name && { color: '#94a3b8' }]} numberOfLines={1}>
                    {item.name || 'Select Tally item...'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ))
        )}

        {/* Step 4: Reason / Remarks */}
        <Text style={styles.sectionLabel}>4. REASON / REMARKS FOR SPLIT *</Text>
        <TextInput
          style={styles.textArea}
          multiline
          numberOfLines={3}
          placeholder="e.g., Spooling 100m cable into two 50m segments for separate site installs..."
          placeholderTextColor="#94a3b8"
          value={reason}
          onChangeText={setReason}
        />

        {/* Step 5: Live Proof Photo */}
        <Text style={styles.sectionLabel}>5. LIVE PROOF PHOTO *</Text>
        <TouchableOpacity
          style={[styles.photoBtn, geoPayload && styles.photoBtnSuccess]}
          onPress={() => setGeoCameraVisible(true)}
        >
          <Camera size={20} color={geoPayload ? '#ffffff' : '#7c3aed'} />
          <Text style={[styles.photoBtnText, geoPayload && { color: '#ffffff' }]}>
            {geoPayload
              ? `Proof Recorded${geoPayload.gps?.address ? ` • ${geoPayload.gps.address}` : ''}`
              : 'Capture Geo-Tagged Photo of Physical Material'}
          </Text>
        </TouchableOpacity>

        {/* Submit */}
        <TouchableOpacity
          onPress={handleSubmitSplitRequest}
          disabled={submitting}
          style={styles.submitBtn}
        >
          {submitting ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <>
              <Scissors size={18} color="#ffffff" />
              <Send size={16} color="#ffffff" />
              <Text style={styles.submitBtnText}>Submit Split Request to Store</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={styles.footerNote}>
          The original barcode is locked from further actions until Store Admin approves or rejects this request.
        </Text>
      </ScrollView>

      {/* Tally Inventory Picker */}
      <TallyMaterialSelectModal
        visible={tallyModalVisible}
        onClose={() => {
          setTallyModalVisible(false);
          setActiveAdditionalIndex(null);
        }}
        onSelect={(selected) => {
          const name = selected.materialName || selected.name || '';
          if (activeAdditionalIndex !== null) {
            handleAdditionalItemChange(activeAdditionalIndex, { name });
            setActiveAdditionalIndex(null);
          } else {
            setSplitMaterialName(name);
          }
        }}
      />

      {/* GeoCamera Modal */}
      <GeoCameraModal
        visible={geoCameraVisible}
        onClose={() => setGeoCameraVisible(false)}
        onCaptureSuccess={(data) => {
          setGeoPayload(data);
          Alert.alert('Verified', 'Photo proof & GPS location captured!');
        }}
        title="Split Proof Checkpoint"
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
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 10,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  barcodeTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  infoGridRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 8,
    gap: 8,
  },
  infoLabelText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 0.5,
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginTop: 2,
  },
  tallyPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 46,
    gap: 8,
  },
  tallyPickerText: {
    flex: 1,
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  tallyPickerSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 42,
    gap: 6,
    flex: 1,
  },
  tallyPickerSmallText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#1e293b',
  },
  otherLinkText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4f46e5',
    marginTop: 8,
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
  addRowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addRowBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#2563eb',
  },
  hintText: {
    fontSize: 11,
    color: '#94a3b8',
    fontStyle: 'italic',
  },
  additionalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 8,
    gap: 8,
  },
  additionalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  additionalIndex: {
    fontSize: 12,
    fontWeight: '800',
    color: '#7c3aed',
    flex: 1,
  },
  miniToggle: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  miniToggleText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  itemInput: {
    height: 42,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 10,
    fontSize: 13,
    color: '#0f172a',
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
  photoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#f3e8ff',
    borderWidth: 1,
    borderColor: '#d8b4fe',
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 14,
  },
  photoBtnSuccess: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
    borderStyle: 'solid',
  },
  photoBtnText: {
    flex: 1,
    fontSize: 13,
    fontWeight: 'bold',
    color: '#7c3aed',
    textAlign: 'center',
  },
  submitBtn: {
    height: 52,
    backgroundColor: '#7c3aed',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: 'bold',
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

export default SplitMaterialScreen;
