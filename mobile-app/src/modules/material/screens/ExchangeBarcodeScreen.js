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
import { QrCode, RefreshCw, Send, Camera as CameraIcon, Paperclip, FileText, Trash2 } from 'lucide-react-native';
import MaterialHeader from '../components/MaterialHeader';
import BarcodeScannerModal from '../components/BarcodeScannerModal';
import GeoCameraModal from '../components/GeoCameraModal';
import materialApi from '../api/materialApi';

const ExchangeBarcodeScreen = ({ route, navigation }) => {
  const initialBarcode = route.params?.barcode || '';

  // Material summary card data
  const [barcodeDetail, setBarcodeDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(Boolean(initialBarcode));

  // Form state matching Screen 9 spec
  const [warrantyReason, setWarrantyReason] = useState('');
  const [hasNewBarcode, setHasNewBarcode] = useState(true);
  const [newBarcode, setNewBarcode] = useState('');
  const [geoPayload, setGeoPayload] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [scannerVisible, setScannerVisible] = useState(false);
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
    if (!initialBarcode.trim()) {
      Alert.alert('Validation Error', 'Defective old barcode serial is required.');
      return;
    }
    if (!warrantyReason.trim()) {
      Alert.alert('Validation Error', 'Please describe the warranty defect, breakdown or replacement reason.');
      return;
    }
    // When hasNewBarcode is false (employee chose NO), they must enter/scan the new barcode
    if (!hasNewBarcode && !newBarcode.trim()) {
      Alert.alert('Validation Error', 'Please enter or scan the replacement new barcode ID.');
      return;
    }
    if (!hasNewBarcode && !/^\d+$/.test(newBarcode.trim())) {
      Alert.alert('Validation Error', 'Barcode serials must be numeric only (no alphabetic prefixes).');
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
        ...(!hasNewBarcode ? { newBarcode: newBarcode.trim().toUpperCase() } : {}),
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
        Alert.alert(
          'Exchange Request Submitted',
          !hasNewBarcode
            ? 'Exchange request sent to designated Store Approver with your proposed replacement serial.'
            : 'Exchange request sent to designated Store Approver. They will assign the replacement serial during approval.',
          [{ text: 'OK', onPress: () => navigation.navigate('BarcodeDetailScreen', { barcode: initialBarcode }) }]
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

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Step 1: Material Summary Card */}
        <Text style={styles.sectionLabel}>1. MATERIAL SUMMARY</Text>
        <View style={[styles.card, loadingDetail && { opacity: 0.6 }]}>
          <View style={styles.summaryGrid}>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabelText}>MATERIAL NAME</Text>
              <Text style={styles.infoValueMain}>{bc.materialName || 'Loading...'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabelText}>CURRENT STATUS</Text>
              <Text style={styles.infoValue}>{(bc.status || 'Active').toUpperCase()}</Text>
            </View>
          </View>
          <View style={styles.summaryGrid}>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabelText}>TRANSACTION</Text>
              <Text style={styles.infoValue}>{bc.transactionId || 'N/A'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabelText}>OWNER</Text>
              <Text style={styles.infoValue}>{ownerName}</Text>
            </View>
          </View>
        </View>

        {/* Step 2: Failure Reason */}
        <Text style={styles.sectionLabel}>2. REMARKS / FAILURE REASON *</Text>
        <TextInput
          style={styles.textArea}
          multiline
          numberOfLines={3}
          placeholder="Describe warranty defect, breakdown or replacement reason..."
          placeholderTextColor="#94a3b8"
          value={warrantyReason}
          onChangeText={setWarrantyReason}
        />

        {/* Step 3: New Barcode Availability Toggle */}
        <Text style={styles.sectionLabel}>3. DO YOU HAVE THE NEW BARCODE ID?</Text>
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[styles.toggleBtn, hasNewBarcode && styles.toggleBtnActiveYes]}
            onPress={() => { setHasNewBarcode(true); setNewBarcode(''); }}
          >
            <Text style={[styles.toggleBtnText, hasNewBarcode && styles.toggleBtnTextActive]}>YES</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, !hasNewBarcode && styles.toggleBtnActiveNo]}
            onPress={() => setHasNewBarcode(false)}
          >
            <Text style={[styles.toggleBtnText, !hasNewBarcode && styles.toggleBtnTextActive]}>NO</Text>
          </TouchableOpacity>
        </View>

        {hasNewBarcode ? (
          <Text style={styles.hintText}>Selected Store Member will assign and add the new replacement barcode during approval.</Text>
        ) : (
          <View style={{ marginBottom: 8 }}>
            <Text style={styles.fieldLabel}>NEW BARCODE SERIAL ID *</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder="e.g. 100452 (numeric only)"
                placeholderTextColor="#94a3b8"
                keyboardType="numeric"
                value={newBarcode}
                onChangeText={setNewBarcode}
              />
              <TouchableOpacity onPress={() => setScannerVisible(true)} style={styles.scanBtn}>
                <QrCode size={20} color="#ffffff" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Step 4: Live Proof Photo */}
        <Text style={styles.sectionLabel}>4. LIVE PROOF PHOTO *</Text>
        <TouchableOpacity
          style={[styles.photoBtn, geoPayload && styles.photoBtnSuccess]}
          onPress={() => setGeoCameraVisible(true)}
        >
          <CameraIcon size={20} color={geoPayload ? '#ffffff' : '#d97706'} />
          <Text style={[styles.photoBtnText, geoPayload && { color: '#ffffff' }]}>
            {geoPayload ? 'Evidence Recorded ✓' : 'Capture Geo-Tagged Photo of Defective Unit'}
          </Text>
        </TouchableOpacity>

        {/* Step 5: Optional Documents */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionLabel}>5. DOCUMENT ATTACHMENT (OPTIONAL)</Text>
          <TouchableOpacity onPress={handlePickDocument} style={styles.attachBtn}>
            <Paperclip size={13} color="#2563eb" />
            <Text style={styles.attachBtnText}>Attach</Text>
          </TouchableOpacity>
        </View>

        {documents.length === 0 ? (
          <Text style={styles.hintText}>Optional: attach a warranty slip or vendor RMA sheet.</Text>
        ) : (
          documents.map((doc, idx) => (
            <View key={idx} style={styles.docItem}>
              <FileText size={15} color="#2563eb" />
              <Text style={styles.docName} numberOfLines={1}>{doc.name}</Text>
              <TouchableOpacity onPress={() => setDocuments(documents.filter((_, i) => i !== idx))}>
                <Trash2 size={15} color="#dc2626" />
              </TouchableOpacity>
            </View>
          ))
        )}

        {/* Submit */}
        <TouchableOpacity
          onPress={handleExchangeSubmit}
          disabled={submitting}
          style={[styles.submitBtn, submitting && { opacity: 0.7 }]}
        >
          {submitting ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <>
              <RefreshCw size={18} color="#ffffff" />
              <Send size={16} color="#ffffff" />
              <Text style={styles.submitBtnText}>Submit Exchange Request to Store</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={styles.footerNote}>
          Upon store approval the old barcode is marked Exchanged and the replacement serial is activated with direct lineage.
        </Text>
      </ScrollView>

      {/* Barcode Scanner Modal */}
      <BarcodeScannerModal
        visible={scannerVisible}
        onClose={() => setScannerVisible(false)}
        onScanSuccess={(code) => setNewBarcode(code)}
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
  summaryGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  infoLabelText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 0.5,
  },
  infoValueMain: {
    fontSize: 14,
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
  fieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    marginTop: 8,
    marginBottom: 6,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 11,
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  toggleBtnActiveYes: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  toggleBtnActiveNo: {
    backgroundColor: '#d97706',
    borderColor: '#d97706',
  },
  toggleBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#475569',
  },
  toggleBtnTextActive: {
    color: '#ffffff',
  },
  hintText: {
    fontSize: 11,
    color: '#94a3b8',
    fontStyle: 'italic',
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 10,
  },
  input: {
    flex: 1,
    height: 46,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 14,
    fontSize: 14,
    color: '#0f172a',
  },
  scanBtn: {
    width: 46,
    height: 46,
    borderRadius: 10,
    backgroundColor: '#4f46e5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
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
    color: '#92400e',
    textAlign: 'center',
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
    height: 52,
    backgroundColor: '#d97706',
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

export default ExchangeBarcodeScreen;
