import {
  Camera,
  CheckSquare,
  FileText,
  Package,
  Paperclip,
  RotateCcw,
  Square,
  Trash2,
  User,
  X,
  ChevronDown,
  Check,
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import materialApi from '../api/materialApi';
import GeoCameraModal from '../components/GeoCameraModal';
import MaterialHeader from '../components/MaterialHeader';

const REASON_OPTIONS = [
  'Project Completed',
  'Damaged / Needs Repair',
  'Defective Unit Replacement',
  'Incorrect Specification Sourced',
];

const CONDITION_OPTIONS = [
  { value: 'good', label: 'Good' },
  { value: 'damaged', label: 'Damaged' },
  { value: 'needs_repair', label: 'Needs Repair' },
  { value: 'defective', label: 'Defective' },
];

const ReturnMultipleScreen = ({ route, navigation }) => {
  const transactionId = route.params?.id || route.params?.transactionId || '';
  const [barcodes, setBarcodes] = useState([]);
  const [loadingBarcodes, setLoadingBarcodes] = useState(true);
  const [selectedBarcodes, setSelectedBarcodes] = useState([]);

  // Return Reason & Physical Condition & Remarks
  const [returnReason, setReturnReason] = useState('Project Completed');
  const [returnCondition, setReturnCondition] = useState('good');
  const [remarks, setRemarks] = useState('');

  // Handover Method & Transporter
  const [returnMethod, setReturnMethod] = useState('direct'); // 'direct' | 'handler'
  const [handlers, setHandlers] = useState([]);
  const [selectedHandlerId, setSelectedHandlerId] = useState('');
  const [handlerSearchQuery, setHandlerSearchQuery] = useState('');

  // Modals
  const [reasonPickerVisible, setReasonPickerVisible] = useState(false);
  const [conditionPickerVisible, setConditionPickerVisible] = useState(false);
  const [handlerPickerVisible, setHandlerPickerVisible] = useState(false);

  // Photos & Documents State
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
                  const bStatus = (typeof b === 'object' ? (b?.status || 'Active') : 'Active').toLowerCase();
                  if (bStr && (bStatus === 'active' || bStatus === 'issued')) {
                    extracted.push({
                      _id: bStr,
                      barcode: bStr,
                      status: 'Active',
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

      // Strictly filter out non-active barcodes (Merged, Exchanged, Split, Closed, Returned, etc.)
      const activeBarcodesOnly = bcList.filter((b) => {
        if (!b) return false;
        const bStatus = (typeof b === 'object' ? (b.status || 'Active') : 'Active').toLowerCase();
        return bStatus === 'active' || bStatus === 'issued';
      });

      setBarcodes(activeBarcodesOnly);
      setSelectedBarcodes(activeBarcodesOnly.map((b) => (typeof b === 'string' ? b : (b.barcode || b))).filter(Boolean));

      let uList = uRes?.employees || uRes?.data?.employees || uRes?.data || (Array.isArray(uRes) ? uRes : []);
      if (!Array.isArray(uList)) uList = [];

      let curUserId = '';
      try {
        const uStr = await AsyncStorage.getItem('user');
        if (uStr) {
          const uObj = JSON.parse(uStr);
          curUserId = String(uObj._id || uObj.id || uObj.user?._id || uObj.user?.id || '');
        }
      } catch (e) {}

      const eligibleHandlers = uList.filter((e) => {
        if (!e) return false;
        const uid = String(e._id || e.id || '');
        if (!uid) return false;
        if (curUserId && uid === curUserId) return false;
        if (e.role === 'super_admin') return false;
        return true;
      });

      setHandlers(eligibleHandlers);
      if (eligibleHandlers.length > 0) setSelectedHandlerId(eligibleHandlers[0]._id || eligibleHandlers[0].id);
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
        coordinates: data.coordinates,
        gps: data.gps,
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
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const handleReturnSubmit = async () => {
    if (selectedBarcodes.length === 0) {
      Alert.alert('Validation Error', 'Please select at least 1 barcode to return.');
      return;
    }
    if (returnMethod === 'handler' && !selectedHandlerId) {
      Alert.alert('Validation Error', 'Please select a sourcing handler to collect items from the field.');
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
        coordinates: photosList[0]?.coordinates || [73.8567, 18.5204],
        documents,
      };

      const res = await materialApi.returnMultipleBarcodes(payload);
      if (res && (res.success || res._id || Array.isArray(res.returns) || (res.message && res.message.toLowerCase().includes('success')))) {
        Alert.alert('Success', `${selectedBarcodes.length} barcode(s) submitted for Store warehouse return!`);
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
        <TouchableOpacity
          style={styles.dropdownBtn}
          onPress={() => setReasonPickerVisible(true)}
        >
          <Text style={styles.dropdownBtnText}>{returnReason}</Text>
          <ChevronDown size={18} color="#64748b" />
        </TouchableOpacity>

        {/* Step 3: Material Physical Condition */}
        <Text style={styles.sectionLabel}>3. MATERIAL PHYSICAL CONDITION *</Text>
        <TouchableOpacity
          style={styles.dropdownBtn}
          onPress={() => setConditionPickerVisible(true)}
        >
          <Text style={styles.dropdownBtnText}>
            {(CONDITION_OPTIONS.find((o) => o.value === returnCondition) || CONDITION_OPTIONS[0]).label}
          </Text>
          <ChevronDown size={18} color="#64748b" />
        </TouchableOpacity>

        {/* Step 4: Return Logistics Method */}
        <Text style={styles.sectionLabel}>4. RETURN LOGISTICS METHOD *</Text>
        <View style={styles.methodRow}>
          <TouchableOpacity
            style={[styles.methodBtn, returnMethod === 'direct' && styles.methodBtnActive]}
            onPress={() => setReturnMethod('direct')}
          >
            <Package size={16} color={returnMethod === 'direct' ? '#ffffff' : '#475569'} />
            <Text style={[styles.methodBtnText, returnMethod === 'direct' && { color: '#ffffff' }]}>
              Direct to Store
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.methodBtn, returnMethod === 'handler' && styles.methodBtnActive]}
            onPress={() => setReturnMethod('handler')}
          >
            <User size={16} color={returnMethod === 'handler' ? '#ffffff' : '#475569'} />
            <Text style={[styles.methodBtnText, returnMethod === 'handler' && { color: '#ffffff' }]}>
              Via Sourcing Handler
            </Text>
          </TouchableOpacity>
        </View>

        {returnMethod === 'handler' && (
          <View style={{ gap: 8 }}>
            <Text style={styles.sectionLabel}>SELECT RETURN HANDLER *</Text>
            
            {/* Dropdown Selector Box matching HandlerAssignmentScreen.js */}
            <TouchableOpacity
              style={styles.handlerSelectBox}
              onPress={() => setHandlerPickerVisible(true)}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                <User size={18} color="#2563eb" />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, color: '#0f172a', fontWeight: '700' }} numberOfLines={1}>
                    {(() => {
                      const h = handlers.find((x) => (x._id || x.id) === selectedHandlerId);
                      return h ? (h.fullName || h.name) : 'Select Return Handler...';
                    })()}
                  </Text>
                  {(() => {
                    const h = handlers.find((x) => (x._id || x.id) === selectedHandlerId);
                    return h ? (
                      <Text style={{ fontSize: 11, color: '#64748b' }}>
                        {h.department?.name || h.designation || `ID: ${h.employeeId || 'EMP'}`}
                      </Text>
                    ) : null;
                  })()}
                </View>
              </View>
              <ChevronDown size={18} color="#64748b" />
            </TouchableOpacity>

            {/* Horizontal Handler Quick Select Chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 4 }}>
              {handlers.map((h) => {
                const hid = h._id || h.id;
                const isSel = selectedHandlerId === hid;
                const hName = h.fullName || h.name || 'Staff Member';
                const deptName = h.department?.name || h.designation || 'Logistics';
                return (
                  <TouchableOpacity
                    key={hid}
                    style={[styles.handlerChip, isSel && styles.handlerChipActive]}
                    onPress={() => setSelectedHandlerId(hid)}
                  >
                    <User size={16} color={isSel ? '#ffffff' : '#64748b'} />
                    <View>
                      <Text style={[styles.chipTitle, isSel && styles.chipTitleActive]}>
                        {hName}
                      </Text>
                      <Text style={[styles.chipSub, isSel && styles.chipSubActive]}>
                        {deptName}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Step 5: Remarks / Reason Details */}
        <Text style={styles.sectionLabel}>5. REMARKS / RETURN DETAILS</Text>
        <TextInput
          style={styles.textArea}
          placeholder="Type specific remarks or details for this return..."
          placeholderTextColor="#94a3b8"
          multiline
          numberOfLines={3}
          value={remarks}
          onChangeText={setRemarks}
        />

        {/* Step 6: Live Geo Photo Checkpoint */}
        <View style={styles.docHeaderRow}>
          <Text style={styles.sectionLabel}>6. CAPTURE LIVE MATERIAL PHOTOS *</Text>
          <TouchableOpacity
            onPress={() => setGeoCameraVisible(true)}
            style={styles.attachBtn}
          >
            <Camera size={14} color="#2563eb" />
            <Text style={styles.attachBtnText}>+ Add Photo</Text>
          </TouchableOpacity>
        </View>

        {photosList.length > 0 ? (
          <View style={styles.photoGrid}>
            {photosList.map((pObj, idx) => (
              <View key={idx} style={styles.photoPreviewCard}>
                <Image source={{ uri: pObj.url }} style={styles.previewImage} />
                <TouchableOpacity
                  style={styles.deletePhotoBadgeBtn}
                  onPress={() => handleRemovePhoto(idx)}
                >
                  <Trash2 size={14} color="#ffffff" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : (
          <TouchableOpacity
            onPress={() => setGeoCameraVisible(true)}
            style={styles.geoBtn}
          >
            <Camera size={22} color="#64748b" />
            <Text style={styles.geoBtnText}>Upload/Capture Geo-Tagged Photo</Text>
          </TouchableOpacity>
        )}

        {/* Step 7: Documents */}
        <View style={styles.docHeaderRow}>
          <Text style={styles.sectionLabel}>7. ATTACH / UPLOAD DOCUMENTS</Text>
          <TouchableOpacity onPress={handlePickDocument} style={styles.attachBtn}>
            <Paperclip size={14} color="#2563eb" />
            <Text style={styles.attachBtnText}>Attach</Text>
          </TouchableOpacity>
        </View>

        {documents.length > 0 ? (
          <View style={{ gap: 6 }}>
            {documents.map((doc, idx) => (
              <View key={idx} style={styles.docItem}>
                <FileText size={16} color="#2563eb" />
                <Text style={styles.docName} numberOfLines={1}>{doc.name}</Text>
                <TouchableOpacity onPress={() => setDocuments(documents.filter((_, i) => i !== idx))}>
                  <Trash2 size={16} color="#dc2626" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.docEmptyText}>No extra documents attached (Optional)</Text>
        )}

        {/* Action Button */}
        <TouchableOpacity
          onPress={handleReturnSubmit}
          disabled={submitting}
          style={[styles.submitBtn, submitting && { opacity: 0.7 }]}
        >
          {submitting ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <>
              <RotateCcw size={18} color="#ffffff" />
              <Text style={styles.submitBtnText}>Submit Bulk Return Request ({selectedBarcodes.length})</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* GeoCamera Modal */}
      <GeoCameraModal
        visible={geoCameraVisible}
        onClose={() => setGeoCameraVisible(false)}
        onCaptureSuccess={handleCapturePhotoSuccess}
        title="Return Inspection Checkpoint"
      />

      {/* Reason Modal */}
      <Modal visible={reasonPickerVisible} transparent animationType="fade" onRequestClose={() => setReasonPickerVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setReasonPickerVisible(false)}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Reason for Return</Text>
              <TouchableOpacity onPress={() => setReasonPickerVisible(false)}>
                <X size={18} color="#64748b" />
              </TouchableOpacity>
            </View>
            {REASON_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt}
                style={[styles.modalOption, returnReason === opt && styles.modalOptionActive]}
                onPress={() => { setReturnReason(opt); setReasonPickerVisible(false); }}
              >
                <Text style={[styles.modalOptionText, returnReason === opt && styles.modalOptionTextActive]}>{opt}</Text>
                {returnReason === opt && <Check size={16} color="#2563eb" />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Condition Modal */}
      <Modal visible={conditionPickerVisible} transparent animationType="fade" onRequestClose={() => setConditionPickerVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setConditionPickerVisible(false)}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Condition of Material</Text>
              <TouchableOpacity onPress={() => setConditionPickerVisible(false)}>
                <X size={18} color="#64748b" />
              </TouchableOpacity>
            </View>
            {CONDITION_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.modalOption, returnCondition === opt.value && styles.modalOptionActive]}
                onPress={() => { setReturnCondition(opt.value); setConditionPickerVisible(false); }}
              >
                <Text style={[styles.modalOptionText, returnCondition === opt.value && styles.modalOptionTextActive]}>{opt.label}</Text>
                {returnCondition === opt.value && <Check size={16} color="#2563eb" />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Handler Modal */}
      <Modal visible={handlerPickerVisible} transparent animationType="fade" onRequestClose={() => setHandlerPickerVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setHandlerPickerVisible(false)}>
          <View style={[styles.modalCard, { maxHeight: 520, maxWidth: 360 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Return Handler</Text>
              <TouchableOpacity onPress={() => setHandlerPickerVisible(false)}>
                <X size={18} color="#64748b" />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.searchBar}
              value={handlerSearchQuery}
              onChangeText={setHandlerSearchQuery}
              placeholder="Search handler by name, ID or department..."
              placeholderTextColor="#94a3b8"
            />
            <ScrollView style={{ maxHeight: 340 }} nestedScrollEnabled>
              {handlers
                .filter((h) => {
                  if (!handlerSearchQuery.trim()) return true;
                  const q = handlerSearchQuery.toLowerCase();
                  return (
                    (h.fullName || h.name || '').toLowerCase().includes(q) ||
                    (h.employeeId || '').toLowerCase().includes(q) ||
                    (h.department?.name || h.designation || '').toLowerCase().includes(q)
                  );
                })
                .map((h) => {
                  const hid = h._id || h.id;
                  if (!hid) return null;
                  const isSelected = selectedHandlerId === hid;
                  return (
                    <TouchableOpacity
                      key={hid}
                      style={[styles.modalOption, isSelected && styles.modalOptionActive]}
                      onPress={() => { setSelectedHandlerId(hid); setHandlerPickerVisible(false); }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.modalOptionText, isSelected && styles.modalOptionTextActive]} numberOfLines={1}>
                          {h.fullName || h.name || 'Staff Member'}
                        </Text>
                        <Text style={{ fontSize: 11, color: '#64748b' }}>
                          {h.department?.name || h.designation || 'Logistics'} • ID: {h.employeeId || 'EMP'}
                        </Text>
                      </View>
                      {isSelected && <Check size={16} color="#2563eb" />}
                    </TouchableOpacity>
                  );
                })}
              {handlers.length === 0 && (
                <Text style={{ padding: 14, color: '#94a3b8', fontSize: 13 }}>No eligible return handlers available.</Text>
              )}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
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
    gap: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#64748b',
    letterSpacing: 0.8,
    marginTop: 6,
  },
  selectAllText: {
    fontSize: 12,
    fontWeight: '800',
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
    borderColor: '#cbd5e1',
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
  dropdownBtn: {
    height: 46,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },
  methodRow: {
    flexDirection: 'row',
    gap: 8,
  },
  methodBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  methodBtnActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  methodBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
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
  docHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
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
  },
  docName: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  docEmptyText: {
    fontSize: 11,
    color: '#94a3b8',
    fontStyle: 'italic',
  },
  geoBtn: {
    height: 90,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#cbd5e1',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  geoBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  photoPreviewCard: {
    width: 100,
    height: 100,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    position: 'relative',
  },
  previewImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  deletePhotoBadgeBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(220, 38, 38, 0.85)',
    borderRadius: 12,
    padding: 4,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#dc2626',
    borderRadius: 12,
    paddingVertical: 15,
    marginTop: 10,
    marginBottom: 30,
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  modalOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
  },
  modalOptionActive: {
    backgroundColor: '#eff6ff',
  },
  modalOptionText: {
    fontSize: 13,
    color: '#334155',
  },
  modalOptionTextActive: {
    fontWeight: 'bold',
    color: '#2563eb',
  },
  searchBar: {
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0f172a',
    marginVertical: 6,
  },
  handlerSelectBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#2563eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 6,
  },
  handlerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginRight: 8,
    gap: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  handlerChipActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  chipTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
  },
  chipTitleActive: {
    color: '#ffffff',
  },
  chipSub: {
    fontSize: 10,
    color: '#64748b',
  },
  chipSubActive: {
    color: '#bfdbfe',
  },
});

export default ReturnMultipleScreen;
