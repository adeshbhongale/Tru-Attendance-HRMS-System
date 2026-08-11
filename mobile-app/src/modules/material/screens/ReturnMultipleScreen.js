import {
  Camera,
  CheckSquare,
  FileText,
  Paperclip,
  RotateCcw,
  Square,
  Trash2,
  User,
  X,
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import materialApi from '../api/materialApi';
import GeoCameraModal from '../components/GeoCameraModal';
import MaterialHeader from '../components/MaterialHeader';

const ReturnMultipleScreen = ({ route, navigation }) => {
  const transactionId = route.params?.id || route.params?.transactionId || '';
  const [barcodes, setBarcodes] = useState([]);
  const [loadingBarcodes, setLoadingBarcodes] = useState(true);
  const [selectedBarcodes, setSelectedBarcodes] = useState([]);

  // Return Reason & Physical Condition & Remarks
  const [returnReason, setReturnReason] = useState('Job Completed');
  const [returnCondition, setReturnCondition] = useState('good');
  const [remarks, setRemarks] = useState('');

  // Handover Method & Transporter
  const [returnMethod, setReturnMethod] = useState('direct'); // 'direct' | 'handler'
  const [handlers, setHandlers] = useState([]);
  const [selectedHandlerId, setSelectedHandlerId] = useState('');

  // Photos & Documents State for multiple photo capture and document upload
  const [photosList, setPhotosList] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [geoCameraVisible, setGeoCameraVisible] = useState(false);
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

      // Fallback: If barcodes array is empty and transactionId is present, fetch transaction details
      if (bcList.length === 0 && transactionId) {
        try {
          const txnRes = await materialApi.getTransactionById(transactionId);
          const txnObj = txnRes?.transaction || txnRes?.data || txnRes;
          if (txnObj && Array.isArray(txnObj.materials)) {
            const extracted = [];
            txnObj.materials.forEach((m) => {
              if (Array.isArray(m.barcodes)) {
                m.barcodes.forEach((b) => {
                  const bStr = typeof b === 'string' ? b : (b?.barcode || b?.code);
                  if (bStr) {
                    extracted.push({
                      _id: bStr,
                      barcode: bStr,
                      materialName: m.materialName || m.name || 'Material',
                    });
                  }
                });
              }
            });
            bcList = extracted;
          }
        } catch (txnErr) {
          console.warn('Fallback transaction barcodes fetch warning:', txnErr.message);
        }
      }

      setBarcodes(bcList);
      // Pre-select all active barcodes by default
      setSelectedBarcodes(bcList.map((b) => typeof b === 'string' ? b : (b.barcode || b)).filter(Boolean));

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

  const handleSelectAllBarcodes = () => {
    const allCodes = barcodes.map((b) => typeof b === 'string' ? b : b.barcode).filter(Boolean);
    if (selectedBarcodes.length === allCodes.length) {
      setSelectedBarcodes([]);
    } else {
      setSelectedBarcodes(allCodes);
    }
  };

  const handleCapturePhotoSuccess = (data) => {
    if (!data || !data.photoUrl) return;
    setPhotosList((prev) => [
      ...prev,
      {
        url: data.photoUrl,
        capturedAt: new Date().toISOString(),
        coordinates: data.coordinates || data.gps,
      },
    ]);
    setGeoCameraVisible(false);
  };

  const handleRemovePhoto = (index) => {
    setPhotosList((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePickDocument = () => {
    Alert.alert(
      'Upload Return Attachment',
      'Select document type to attach:',
      [
        {
          text: 'PDF Document (.pdf)',
          onPress: () => {
            const fileName = `ReturnChallan_${Date.now()}.pdf`;
            setDocuments((prev) => [
              ...prev,
              {
                url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
                name: fileName,
                type: 'pdf',
                mime: 'application/pdf',
                uploadedAt: new Date().toISOString(),
              },
            ]);
          },
        },
        {
          text: 'Word Document (.docx)',
          onPress: () => {
            const fileName = `ReturnNote_${Date.now()}.docx`;
            setDocuments((prev) => [
              ...prev,
              {
                url: 'https://example.com/note.docx',
                name: fileName,
                type: 'word',
                mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                uploadedAt: new Date().toISOString(),
              },
            ]);
          },
        },
        {
          text: 'Photo Attachment (.jpg)',
          onPress: () => {
            const fileName = `ReturnPhoto_${Date.now()}.jpg`;
            setDocuments((prev) => [
              ...prev,
              {
                url: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=600&q=80',
                name: fileName,
                type: 'image',
                mime: 'image/jpeg',
                uploadedAt: new Date().toISOString(),
              },
            ]);
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const handleRemoveDocument = (index) => {
    setDocuments((prev) => prev.filter((_, i) => i !== index));
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
    if (photosList.length === 0) {
      Alert.alert('Validation Error', 'Please capture at least one live geo-tagged photo proof.');
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        transactionId,
        barcodesToReturn: selectedBarcodes,
        reason: returnReason,
        condition: returnCondition,
        remarks: remarks.trim() || returnReason,
        returnMethod,
        handlerId: returnMethod === 'handler' ? selectedHandlerId : undefined,
        returnHandler: returnMethod === 'handler' ? selectedHandlerId : undefined,
        photos: photosList,
        photoUrl: photosList[0]?.url,
        coordinates: photosList[0]?.coordinates || photosList[0]?.gps,
        documents,
      };

      console.log('📌 [ReturnMultipleScreen] Submitting bulk return request payload:', payload);

      const res = await materialApi.returnMultipleBarcodes(payload);

      console.log('✅ [ReturnMultipleScreen] Bulk return response received:', res);

      if (res && (res.success || res._id || Array.isArray(res.returns) || (res.message && res.message.toLowerCase().includes('success')))) {
        Alert.alert('Success', `${selectedBarcodes.length} barcode(s) submitted for store warehouse return!`);
        navigation.navigate('ReturnListScreen');
      } else {
        console.warn('⚠️ [ReturnMultipleScreen] Bulk return API error response:', res);
        Alert.alert('Error', res?.message || 'Bulk return request failed.');
      }
    } catch (err) {
      console.error('❌ [ReturnMultipleScreen] Exception during bulk return submission:', err?.response?.data || err?.message || err);
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
        {/* Step 1: Barcodes Multi-Select Checklist with Select All */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionLabel}>1. SELECT BARCODES ({selectedBarcodes.length}/{barcodes.length}) *</Text>
          {barcodes.length > 0 && (
            <TouchableOpacity onPress={handleSelectAllBarcodes}>
              <Text style={styles.selectAllText}>
                {selectedBarcodes.length === barcodes.length ? 'Deselect All' : 'Select All'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {loadingBarcodes ? (
          <ActivityIndicator size="small" color="#4f46e5" style={{ marginVertical: 15 }} />
        ) : barcodes.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>No barcodes available for return.</Text>
          </View>
        ) : (
          <View style={styles.barcodeListContainer}>
            {barcodes.map((item) => {
              const bStr = typeof item === 'string' ? item : item.barcode;
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

        {/* Step 2: Reason for Return */}
        <Text style={styles.sectionLabel}>2. REASON FOR RETURN *</Text>
        <View style={styles.pickerRow}>
          {['Job Completed', 'Defective/Damaged', 'Incorrect Material', 'Excess Stock', 'Project Closed'].map((rOpt) => (
            <TouchableOpacity
              key={rOpt}
              style={[styles.pickerChip, returnReason === rOpt && styles.pickerChipActive]}
              onPress={() => setReturnReason(rOpt)}
            >
              <Text style={[styles.pickerChipText, returnReason === rOpt && styles.pickerChipTextActive]}>
                {rOpt}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Step 3: Material Physical Condition */}
        <Text style={styles.sectionLabel}>3. MATERIAL PHYSICAL CONDITION *</Text>
        <View style={styles.pickerRow}>
          {[
            { label: 'Good (Usable)', val: 'good' },
            { label: 'Damaged', val: 'damaged' },
            { label: 'Defective', val: 'defective' },
          ].map((cOpt) => (
            <TouchableOpacity
              key={cOpt.val}
              style={[styles.pickerChip, returnCondition === cOpt.val && styles.pickerChipActive]}
              onPress={() => setReturnCondition(cOpt.val)}
            >
              <Text style={[styles.pickerChipText, returnCondition === cOpt.val && styles.pickerChipTextActive]}>
                {cOpt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Step 4: Remarks / Reason Details */}
        <Text style={styles.sectionLabel}>4. REMARKS / REASON DETAILS</Text>
        <TextInput
          style={styles.textArea}
          multiline
          numberOfLines={3}
          placeholder="Enter detailed reason / notes for returning these materials..."
          placeholderTextColor="#94a3b8"
          value={remarks}
          onChangeText={setRemarks}
        />

        {/* Step 5: Return Handover Method */}
        <Text style={styles.sectionLabel}>5. RETURN HANDOVER METHOD</Text>
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

        {/* Transporter / Handler selection */}
        {returnMethod === 'handler' && (
          <>
            <Text style={styles.sectionLabel}>SELECT TRANSPORTER / HANDLER *</Text>
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

        {/* Step 6: Photo & Location Proof */}
        <Text style={styles.sectionLabel}>6. MANDATORY PHOTO & LOCATION PROOF ({photosList.length} CAPTURED) *</Text>

        {/* Photo Gallery Grid */}
        {photosList.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoGalleryRow}>
            {photosList.map((photo, idx) => (
              <View key={idx} style={styles.photoThumbnailCard}>
                <Image source={{ uri: photo.url }} style={styles.photoThumbnail} />
                <TouchableOpacity
                  style={styles.photoRemoveBadge}
                  onPress={() => handleRemovePhoto(idx)}
                >
                  <X size={12} color="#ffffff" />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}

        <TouchableOpacity
          style={styles.photoBtn}
          onPress={() => setGeoCameraVisible(true)}
        >
          <Camera size={20} color="#dc2626" />
          <Text style={styles.photoBtnText}>
            {photosList.length > 0 ? '+ Capture Another Geo Photo' : 'Take Geo-Tagged Return Photo'}
          </Text>
        </TouchableOpacity>

        {/* Step 7: Document Upload */}
        <Text style={styles.sectionLabel}>7. ATTACH / UPLOAD RETURN DOCUMENTS</Text>

        {documents.length > 0 && (
          <View style={styles.docListContainer}>
            {documents.map((doc, idx) => (
              <View key={idx} style={styles.docCard}>
                <FileText size={18} color="#2563eb" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.docName} numberOfLines={1}>{doc.name}</Text>
                  <Text style={styles.docSub}>{doc.type ? doc.type.toUpperCase() : 'DOCUMENT'}</Text>
                </View>
                <TouchableOpacity onPress={() => handleRemoveDocument(idx)}>
                  <Trash2 size={16} color="#ef4444" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        <TouchableOpacity style={styles.docBtn} onPress={handlePickDocument}>
          <Paperclip size={18} color="#2563eb" />
          <Text style={styles.docBtnText}>+ Upload Return Document (PDF / Word / Image)</Text>
        </TouchableOpacity>

        {/* Submit Button */}
        {submitting ? (
          <ActivityIndicator size="large" color="#dc2626" style={{ marginTop: 24 }} />
        ) : (
          <TouchableOpacity style={styles.submitBtn} onPress={handleReturnSubmit}>
            <RotateCcw size={18} color="#ffffff" />
            <Text style={styles.submitBtnText}>Submit Bulk Return ({selectedBarcodes.length} items)</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Geo Camera Modal */}
      <GeoCameraModal
        visible={geoCameraVisible}
        onClose={() => setGeoCameraVisible(false)}
        onCaptureSuccess={handleCapturePhotoSuccess}
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
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 6,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#64748b',
    letterSpacing: 0.8,
  },
  selectAllText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#2563eb',
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
  pickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
    marginBottom: 8,
  },
  pickerChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  pickerChipActive: {
    backgroundColor: '#dc2626',
    borderColor: '#dc2626',
  },
  pickerChipText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  pickerChipTextActive: {
    color: '#ffffff',
  },
  textArea: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    padding: 12,
    fontSize: 13,
    color: '#0f172a',
    textAlignVertical: 'top',
    minHeight: 70,
    marginTop: 6,
    marginBottom: 8,
  },
  tabToggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
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
    marginTop: 6,
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
  photoGalleryRow: {
    flexDirection: 'row',
    marginTop: 6,
    marginBottom: 10,
  },
  photoThumbnailCard: {
    position: 'relative',
    width: 90,
    height: 90,
    borderRadius: 10,
    overflow: 'hidden',
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  photoThumbnail: {
    width: '100%',
    height: '100%',
  },
  photoRemoveBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(239, 68, 68, 0.9)',
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
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
    marginTop: 4,
    marginBottom: 8,
  },
  photoBtnText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#dc2626',
  },
  docListContainer: {
    gap: 8,
    marginTop: 6,
    marginBottom: 10,
  },
  docCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#ffffff',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  docName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e293b',
  },
  docSub: {
    fontSize: 11,
    color: '#64748b',
  },
  docBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 10,
    paddingVertical: 12,
    marginTop: 4,
    marginBottom: 10,
  },
  docBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#2563eb',
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#dc2626',
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 20,
    marginBottom: 30,
  },
  submitBtnText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffffff',
  },
});

export default ReturnMultipleScreen;
