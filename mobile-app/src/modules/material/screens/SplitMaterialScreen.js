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
import { Camera, Scissors, Send, Plus, Trash2, Database, User, Package, AlertCircle, CheckCircle2, MapPin, X } from 'lucide-react-native';
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
  const [capturedPhotos, setCapturedPhotos] = useState([]);
  const [isSubmitted, setIsSubmitted] = useState(false);
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

  const handleRemovePhoto = (index) => {
    setCapturedPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmitSplitRequest = async () => {
    if (submitting || isSubmitted) return;
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
    if (capturedPhotos.length === 0) {
      Alert.alert('Validation Error', 'At least one live geo-tagged photo proof of the physical material being split is mandatory.');
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

      const childItemsList = [
        { materialName: resolvedSplitName, quantity: 1, unit: bc.unit || 'Nos', price: bc.price || 0 },
        ...additionalItems.map((it) => ({
          materialName: (it.isOther ? (it.otherName || '').trim() : (it.name || '').trim()),
          quantity: 1,
          unit: bc.unit || 'Nos',
          price: bc.price || 0,
        })).filter((it) => Boolean(it.materialName)),
      ];

      const firstGps = capturedPhotos[0]?.gps || {};
      const payload = {
        barcode: initialBarcode.trim().toUpperCase(),
        requestedMaterialName: requestedName,
        childItems: childItemsList,
        reason: reason.trim(),
        gps: {
          lat: firstGps.latitude || firstGps.lat || 18.5204,
          lng: firstGps.longitude || firstGps.lng || 73.8567,
          address: firstGps.address || 'Address unavailable',
        },
        photos: capturedPhotos.map((p) => ({
          url: p.url,
          capturedAt: p.capturedAt || new Date().toISOString(),
        })),
      };

      const res = await materialApi.splitBarcode(payload);
      if (res && (res.success !== false && (res.data || res.message || res._id))) {
        setIsSubmitted(true);
        // Clear inputs so back button never reveals stale form
        setReason('');
        setSplitMaterialName('');
        setOtherMaterialName('');
        setAdditionalItems([]);
        setCapturedPhotos([]);

        Alert.alert(
          'Split Request Submitted',
          `Your split request for barcode ${initialBarcode} was sent to Store Admin for approval. The original barcode stays locked until a decision is made.`,
          [
            {
              text: 'OK',
              onPress: () => navigation.replace('BarcodeDetailScreen', { barcode: initialBarcode }),
            },
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

        {/* Step 5: Live Proof Photos */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionLabel}>
            5. LIVE PROOF PHOTOS {capturedPhotos.length > 0 ? `(${capturedPhotos.length})` : ''} *
          </Text>
          {capturedPhotos.length > 0 && (
            <TouchableOpacity
              style={styles.addPhotoTopBtn}
              onPress={() => setGeoCameraVisible(true)}
              activeOpacity={0.7}
            >
              <Plus size={14} color="#7c3aed" />
              <Text style={styles.addPhotoTopBtnText}>Add More</Text>
            </TouchableOpacity>
          )}
        </View>

        {capturedPhotos.length === 0 ? (
          /* Compact initial capture button */
          <TouchableOpacity
            style={styles.initialCaptureBtn}
            onPress={() => setGeoCameraVisible(true)}
            activeOpacity={0.7}
          >
            <Camera size={20} color="#7c3aed" />
            <Text style={styles.initialCaptureBtnText}>+ Capture Live Photo Proof</Text>
          </TouchableOpacity>
        ) : (
          /* Photo Tray with Thumbnails, Remove Badges, and Add More Tile */
          <View style={styles.photosTrayWrapper}>
            <View style={styles.photosTrayGrid}>
              {capturedPhotos.map((photo, pIdx) => (
                <View key={pIdx} style={styles.photoThumbCard}>
                  <Image source={{ uri: photo.url }} style={styles.photoThumbImage} />
                  <TouchableOpacity
                    style={styles.photoRemoveBadge}
                    onPress={() => handleRemovePhoto(pIdx)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    activeOpacity={0.8}
                  >
                    <X size={12} color="#ffffff" />
                  </TouchableOpacity>
                  <View style={styles.photoIndexBadge}>
                    <Text style={styles.photoIndexBadgeText}>#{pIdx + 1}</Text>
                  </View>
                </View>
              ))}

              {/* Add More Tile right beside the captured thumbnails */}
              <TouchableOpacity
                style={styles.addPhotoTile}
                onPress={() => setGeoCameraVisible(true)}
                activeOpacity={0.7}
              >
                <Camera size={22} color="#7c3aed" />
                <Text style={styles.addPhotoTileText}>+ Add Photo</Text>
              </TouchableOpacity>
            </View>

            {/* GPS checkpoint info line */}
            <View style={styles.gpsSummaryRow}>
              <MapPin size={12} color="#16a34a" />
              <Text style={styles.gpsSummaryText} numberOfLines={1}>
                {capturedPhotos[capturedPhotos.length - 1]?.gps?.address ||
                  `GPS: ${capturedPhotos[capturedPhotos.length - 1]?.gps?.lat || 18.52}°N, ${capturedPhotos[capturedPhotos.length - 1]?.gps?.lng || 73.85}°E`}
              </Text>
            </View>
          </View>
        )}

        {/* Submit */}
        <TouchableOpacity
          onPress={handleSubmitSplitRequest}
          disabled={submitting || isSubmitted}
          style={[styles.submitBtn, (submitting || isSubmitted) && { opacity: 0.6 }]}
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
          const photoUrl = data.photoUrl || data.url || data.uri;
          if (!photoUrl) return;
          setCapturedPhotos((prev) => [
            ...prev,
            {
              url: photoUrl,
              gps: data.gps || data.coordinates || {},
              capturedAt: new Date().toISOString(),
            },
          ]);
          setGeoCameraVisible(false);
          Alert.alert('Verified', `Photo proof #${capturedPhotos.length + 1} & GPS location captured!`);
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
  addPhotoTopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f3e8ff',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  addPhotoTopBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7c3aed',
  },
  initialCaptureBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#f5f3ff',
    borderWidth: 1.5,
    borderColor: '#c4b5fd',
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 14,
  },
  initialCaptureBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#7c3aed',
  },
  photosTrayWrapper: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  photosTrayGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    alignItems: 'center',
  },
  photoThumbCard: {
    width: 72,
    height: 72,
    borderRadius: 10,
    position: 'relative',
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  photoThumbImage: {
    width: '100%',
    height: '100%',
    borderRadius: 9,
  },
  photoRemoveBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
    zIndex: 10,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
  },
  photoIndexBadge: {
    position: 'absolute',
    bottom: 3,
    left: 3,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  photoIndexBadgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '800',
  },
  addPhotoTile: {
    width: 72,
    height: 72,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#c4b5fd',
    borderStyle: 'dashed',
    backgroundColor: '#faf5ff',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  addPhotoTileText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#7c3aed',
  },
  gpsSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  gpsSummaryText: {
    fontSize: 11,
    color: '#64748b',
    flex: 1,
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
