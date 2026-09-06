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
import {
  QrCode,
  Send,
  Camera,
  Paperclip,
  FileText,
  Trash2,
  CheckCircle2,
  RotateCcw,
  Info,
  Package,
} from 'lucide-react-native';
import MaterialHeader from '../components/MaterialHeader';
import BarcodeScannerModal from '../components/BarcodeScannerModal';
import GeoCameraModal from '../components/GeoCameraModal';
import materialApi from '../api/materialApi';

const ExchangeBarcodeScreen = ({ route, navigation }) => {
  const initialBarcode = route.params?.barcode || '';

  // Material summary card data
  const [barcodeDetail, setBarcodeDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(Boolean(initialBarcode));

  // Form state matching MMS Exchange specifications
  const [warrantyReason, setWarrantyReason] = useState('');
  const [hasNewBarcode, setHasNewBarcode] = useState(false);
  const [newBarcode, setNewBarcode] = useState('');
  const [geoPayload, setGeoPayload] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [geoCameraVisible, setGeoCameraVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

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
      console.warn('Failed loading exchange barcode detail:', err.message);
    } finally {
      setLoadingDetail(false);
    }
  };

  const bc = barcodeDetail || {};
  const ownerName =
    (bc.owner && typeof bc.owner === 'object' && (bc.owner.fullName || bc.owner.name)) ||
    (bc.currentCustodian && typeof bc.currentCustodian === 'object' && (bc.currentCustodian.fullName || bc.currentCustodian.name)) ||
    'Active Custodian';

  const handlePickDocument = () => {
    Alert.alert(
      'Attach Warranty / RMA Document',
      'Select document type to attach (optional):',
      [
        {
          text: 'Warranty Slip (.pdf)',
          onPress: () => {
            setDocuments((prev) => [
              ...prev,
              {
                url: `https://mms-documents.example.com/warranty_${Date.now()}.pdf`,
                name: `WarrantySlip_${Date.now()}.pdf`,
                type: 'pdf',
                mime: 'application/pdf',
                uploadedAt: new Date().toISOString(),
              },
            ]);
          },
        },
        {
          text: 'Vendor RMA Sheet (.pdf)',
          onPress: () => {
            setDocuments((prev) => [
              ...prev,
              {
                url: `https://mms-documents.example.com/rma_${Date.now()}.pdf`,
                name: `VendorRMA_${Date.now()}.pdf`,
                type: 'pdf',
                mime: 'application/pdf',
                uploadedAt: new Date().toISOString(),
              },
            ]);
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const handleExchangeSubmit = async () => {
    if (submitting || isSubmitted) return;
    if (!initialBarcode.trim()) {
      Alert.alert('Validation Error', 'Defective old barcode serial is required.');
      return;
    }
    if (!warrantyReason.trim()) {
      Alert.alert('Validation Error', 'Please describe the warranty defect, breakdown or replacement reason.');
      return;
    }
    // When employee chooses YES (they have the replacement barcode), they must scan it
    if (hasNewBarcode && !newBarcode.trim()) {
      Alert.alert('Validation Error', 'Please scan the replacement barcode.');
      return;
    }
    if (!geoPayload) {
      Alert.alert('Validation Error', 'A live geo-tagged photo of the defective unit is mandatory.');
      return;
    }

    try {
      setSubmitting(true);
      const gps = geoPayload.gps || {};
      const payload = {
        oldBarcode: initialBarcode.trim().toUpperCase(),
        warrantyReason: warrantyReason.trim(),
        ...(hasNewBarcode && newBarcode.trim() ? { newBarcode: newBarcode.trim().toUpperCase() } : {}),
        gps: {
          lat: gps.latitude || gps.lat || 18.5204,
          lng: gps.longitude || gps.lng || 73.8567,
          address: gps.address || 'Address unavailable',
        },
        photos: [{ url: geoPayload.photoUrl, capturedAt: new Date().toISOString() }],
        documents,
      };

      const res = await materialApi.exchangeBarcode(payload);
      if (res && (res.success !== false && (res.data || res.message || res._id))) {
        setIsSubmitted(true);
        // Reset form state so back button doesn't reveal filled data
        setWarrantyReason('');
        setNewBarcode('');
        setGeoPayload(null);
        setDocuments([]);

        Alert.alert(
          'Exchange Request Submitted',
          hasNewBarcode
            ? 'Exchange request sent to designated Store Approver with your scanned replacement serial. Store approver will use this for the transaction & Tally voucher.'
            : 'Exchange request sent to designated Store Approver. Store approver will scan the replacement serial during approval.',
          [
            {
              text: 'OK',
              onPress: () => {
                navigation.replace('BarcodeDetailScreen', { barcode: initialBarcode });
              },
            },
          ]
        );
      } else {
        Alert.alert('Error', res?.message || 'Barcode exchange request failed.');
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
        title="Exchange Defective Barcode"
        subtitle="Warranty replacement request to Store"
        navigation={navigation}
      />

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Step 1: Material Summary Card */}
        <Text style={styles.sectionLabel}>1. DEFECTIVE MATERIAL SUMMARY</Text>
        <View style={[styles.card, loadingDetail && { opacity: 0.6 }]}>
          <View style={styles.summaryHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabelText}>DEFECTIVE BARCODE</Text>
              <Text style={styles.infoValueMain}>{initialBarcode || 'N/A'}</Text>
            </View>
            <View style={styles.statusBadge}>
              <Text style={styles.statusBadgeText}>{(bc.status || 'Active').toUpperCase()}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.summaryGrid}>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabelText}>MATERIAL NAME</Text>
              <Text style={styles.infoValue}>{bc.materialName || 'Serialized Inventory Unit'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabelText}>TRANSACTION ID</Text>
              <Text style={styles.infoValue}>{bc.transactionId || 'N/A'}</Text>
            </View>
          </View>

          <View style={styles.summaryGrid}>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabelText}>CURRENT CUSTODIAN</Text>
              <Text style={styles.infoValue}>{ownerName}</Text>
            </View>
          </View>
        </View>

        {/* Step 2: Failure Reason */}
        <Text style={styles.sectionLabel}>2. REMARKS / DEFECT REASON *</Text>
        <TextInput
          style={styles.textArea}
          multiline
          numberOfLines={3}
          placeholder="Describe warranty defect, physical breakdown, or replacement reason..."
          placeholderTextColor="#94a3b8"
          value={warrantyReason}
          onChangeText={setWarrantyReason}
        />

        {/* Step 3: New Barcode Availability Toggle */}
        <Text style={styles.sectionLabel}>3. DO YOU HAVE THE NEW REPLACEMENT BARCODE?</Text>
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[styles.toggleBtn, hasNewBarcode && styles.toggleBtnActiveYes]}
            onPress={() => setHasNewBarcode(true)}
          >
            <Text style={[styles.toggleBtnText, hasNewBarcode && styles.toggleBtnTextActive]}>YES</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, !hasNewBarcode && styles.toggleBtnActiveNo]}
            onPress={() => {
              setHasNewBarcode(false);
              setNewBarcode('');
            }}
          >
            <Text style={[styles.toggleBtnText, !hasNewBarcode && styles.toggleBtnTextActive]}>NO</Text>
          </TouchableOpacity>
        </View>

        {hasNewBarcode ? (
          <View style={styles.barcodeSectionBox}>
            <Text style={styles.fieldLabel}>SCAN REPLACEMENT BARCODE (SCAN ONLY) *</Text>
            {newBarcode ? (
              <View style={styles.scannedBarcodeCard}>
                <View style={styles.scannedLeft}>
                  <CheckCircle2 size={18} color="#16a34a" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.scannedBarcodeLabel}>Scanned Barcode Number:</Text>
                    <Text style={styles.scannedBarcodeValue}>{newBarcode}</Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => setScannerVisible(true)}
                  style={styles.rescanBtn}
                >
                  <RotateCcw size={14} color="#2563eb" />
                  <Text style={styles.rescanBtnText}>Re-scan</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => setScannerVisible(true)}
                style={styles.scanBtnMain}
                activeOpacity={0.8}
              >
                <QrCode size={20} color="#ffffff" />
                <Text style={styles.scanBtnMainText}>Scan Replacement Barcode</Text>
              </TouchableOpacity>
            )}
            <Text style={styles.hintText}>
              Scan the physical replacement barcode using camera. Manual typing is disabled for accuracy.
            </Text>
          </View>
        ) : (
          <View style={styles.infoNoticeBox}>
            <Info size={16} color="#0284c7" />
            <Text style={styles.infoNoticeText}>
              Store Approver will inspect the defective unit and scan a new replacement barcode during physical approval.
            </Text>
          </View>
        )}

        {/* Step 4: Live Proof Photo */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionLabel}>4. LIVE EVIDENCE PHOTO *</Text>
          {geoPayload && (
            <TouchableOpacity onPress={() => setGeoCameraVisible(true)} style={styles.retakeTopBtn}>
              <RotateCcw size={12} color="#2563eb" />
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
                {geoPayload.gps?.address || 'Defect location recorded'}
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
            <Camera size={22} color="#2563eb" />
            <Text style={styles.geoBtnText}>Capture Geo-Tagged Photo of Defective Unit</Text>
          </TouchableOpacity>
        )}

        {/* Step 5: Optional Documents */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionLabel}>5. ATTACH DOCUMENTS (OPTIONAL)</Text>
          <TouchableOpacity onPress={handlePickDocument} style={styles.attachBtn}>
            <Paperclip size={13} color="#2563eb" />
            <Text style={styles.attachBtnText}>Attach Slip</Text>
          </TouchableOpacity>
        </View>

        {documents.length === 0 ? (
          <Text style={styles.hintText}>Optional: attach warranty slip or vendor RMA invoice.</Text>
        ) : (
          documents.map((doc, idx) => (
            <View key={idx} style={styles.docItem}>
              <FileText size={16} color="#2563eb" />
              <Text style={styles.docName} numberOfLines={1}>
                {doc.name}
              </Text>
              <TouchableOpacity onPress={() => setDocuments(documents.filter((_, i) => i !== idx))}>
                <Trash2 size={15} color="#dc2626" />
              </TouchableOpacity>
            </View>
          ))
        )}

        {/* Submit */}
        <TouchableOpacity
          onPress={handleExchangeSubmit}
          disabled={submitting || isSubmitted}
          style={[styles.submitBtn, (submitting || isSubmitted) && { opacity: 0.7 }]}
          activeOpacity={0.8}
        >
          {submitting ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <>
              <Send size={18} color="#ffffff" />
              <Text style={styles.submitBtnText}>Submit Exchange Request</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={styles.footerNote}>
          Upon store approval, the defective barcode is exchanged and the replacement serial is activated into inventory.
        </Text>
      </ScrollView>

      {/* Barcode Scanner Modal */}
      <BarcodeScannerModal
        visible={scannerVisible}
        onClose={() => setScannerVisible(false)}
        onScanSuccess={(code) => {
          setNewBarcode(code);
          setScannerVisible(false);
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
        title="Exchange Evidence Checkpoint"
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
    paddingBottom: 40,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 0.6,
    marginTop: 18,
    marginBottom: 8,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 18,
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginVertical: 4,
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  infoLabelText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 0.5,
  },
  infoValueMain: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 2,
  },
  infoValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginTop: 2,
  },
  statusBadge: {
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#059669',
  },
  textArea: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    padding: 12,
    fontSize: 13,
    color: '#0f172a',
    minHeight: 80,
    textAlignVertical: 'top',
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    marginBottom: 6,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  toggleBtnActiveYes: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  toggleBtnActiveNo: {
    backgroundColor: '#64748b',
    borderColor: '#64748b',
  },
  toggleBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#475569',
  },
  toggleBtnTextActive: {
    color: '#ffffff',
  },
  barcodeSectionBox: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginTop: 4,
    marginBottom: 8,
  },
  scanBtnMain: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2563eb',
    paddingVertical: 13,
    borderRadius: 10,
  },
  scanBtnMainText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  scannedBarcodeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 10,
    padding: 12,
  },
  scannedLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  scannedBarcodeLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#166534',
    letterSpacing: 0.5,
  },
  scannedBarcodeValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#15803d',
    marginTop: 2,
  },
  rescanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  rescanBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563eb',
  },
  infoNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  infoNoticeText: {
    fontSize: 12,
    color: '#0369a1',
    fontWeight: '600',
    flex: 1,
    lineHeight: 17,
  },
  hintText: {
    fontSize: 11,
    color: '#94a3b8',
    fontStyle: 'italic',
    marginTop: 6,
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
    color: '#2563eb',
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
  retakeTopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  retakeTopBtnText: {
    fontSize: 11,
    color: '#2563eb',
    fontWeight: '700',
  },
  attachBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  attachBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563eb',
  },
  docItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 8,
    marginBottom: 6,
  },
  docName: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  submitBtn: {
    height: 50,
    backgroundColor: '#2563eb',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 24,
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
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

export default ExchangeBarcodeScreen;
