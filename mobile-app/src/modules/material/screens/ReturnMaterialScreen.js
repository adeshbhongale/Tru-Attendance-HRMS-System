import { Camera, Check, ChevronDown, FileText, Package, Paperclip, Tag, Trash2, User, X } from 'lucide-react-native';
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

const ReturnMaterialScreen = ({ route, navigation }) => {
  const initialBarcode = route.params?.barcode || '';
  const [barcode, setBarcode] = useState(initialBarcode);
  const [barcodeDetail, setBarcodeDetail] = useState(null);
  const [qty, setQty] = useState('1');
  const [returnReasonCategory, setReturnReasonCategory] = useState('Project Completed');
  const [materialCondition, setMaterialCondition] = useState('good');
  const [remarks, setRemarks] = useState('');
  const [documents, setDocuments] = useState([]);

  // Return logistics method state matching ReturnMaterial.jsx web form
  const [returnMethod, setReturnMethod] = useState('direct'); // 'direct' | 'handler'
  const [handlers, setHandlers] = useState([]);
  const [selectedHandlerId, setSelectedHandlerId] = useState('');
  const [handlerSearchQuery, setHandlerSearchQuery] = useState('');

  // Modal Picker States
  const [reasonPickerVisible, setReasonPickerVisible] = useState(false);
  const [conditionPickerVisible, setConditionPickerVisible] = useState(false);
  const [handlerPickerVisible, setHandlerPickerVisible] = useState(false);

  const [cameraModalVisible, setCameraModalVisible] = useState(false);
  const [photosList, setPhotosList] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (barcode) {
      materialApi.getBarcodeDetails(barcode).then(res => {
        const bcData = res && (res.barcode || res.data || res);
        if (bcData) {
          setBarcodeDetail(bcData);
          if (bcData.quantity) setQty(String(bcData.quantity));
        }
      }).catch(() => { });
    }
    loadHandlers();
  }, [barcode]);

  const loadHandlers = async () => {
    try {
      const res = await materialApi.getUsers();
      let list = res.employees || res.data?.employees || res.data || (Array.isArray(res) ? res : []);
      if (!Array.isArray(list)) list = [];
      let curUserId = '';
      try {
        const uStr = await AsyncStorage.getItem('user');
        if (uStr) {
          const uObj = JSON.parse(uStr);
          curUserId = String(uObj._id || uObj.id || uObj.user?._id || uObj.user?.id || '');
        }
      } catch (e) {}
      const filtered = list.filter((e) => {
        if (!e) return false;
        const uid = String(e._id || e.id || '');
        if (!uid) return false;
        if (curUserId && uid === curUserId) return false;
        if (e.role === 'super_admin') return false;
        return true;
      });
      setHandlers(filtered);
      if (filtered.length > 0 && !selectedHandlerId) {
        setSelectedHandlerId(filtered[0]._id || filtered[0].id);
      }
    } catch (err) {
      console.warn('Failed loading return handlers:', err.message);
    }
  };

  const handleCapturePhotoSuccess = (geoData) => {
    if (!geoData || !geoData.photoUrl) return;
    setPhotosList((prev) => [
      ...prev,
      {
        url: geoData.photoUrl,
        capturedAt: new Date().toISOString(),
        coordinates: geoData.coordinates,
        gps: geoData.gps || null,
      },
    ]);
    setCameraModalVisible(false);
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
    if (!barcode.trim()) {
      Alert.alert('Validation Error', 'Please enter or scan a valid barcode.');
      return;
    }
    if (returnMethod === 'handler' && !selectedHandlerId) {
      Alert.alert('Validation Error', 'Please select a sourcing handler to collect this item from the field.');
      return;
    }
    if (photosList.length === 0) {
      Alert.alert('Validation Error', 'Please capture at least one live geo-tagged physical photo of the material.');
      return;
    }

    try {
      setSubmitting(true);
      const firstGps = photosList[0]?.gps || {};
      const fullReason = `${returnReasonCategory}${remarks.trim() ? ` — ${remarks.trim()}` : ''}`;
      const payload = {
        // Backend contract: POST /api/barcodes/return
        barcode: barcode.trim().toUpperCase(),
        reason: fullReason,
        condition: materialCondition,
        remarks: remarks.trim() || returnReasonCategory,
        gps: {
          lat: firstGps.latitude || firstGps.lat || photosList[0]?.coordinates?.[1] || 18.5204,
          lng: firstGps.longitude || firstGps.lng || photosList[0]?.coordinates?.[0] || 73.8567,
          address: firstGps.address || 'Address unavailable',
        },
        photos: photosList.map((p) => ({ url: p.url, capturedAt: p.capturedAt })),
        documents,
        // Presence of returnHandler switches backend routing to "Via Handler"
        ...(returnMethod === 'handler' ? { returnHandler: selectedHandlerId } : {}),
      };

      const res = await materialApi.returnBarcode(payload);
      if (res && (res.success !== false && (res.return || res.message || res._id))) {
        Alert.alert(
          'Success',
          res.message || (returnMethod === 'handler'
            ? 'Return request logged. The assigned handler will collect the item and deliver it to Store for physical inspection.'
            : 'Return request logged. Please hand over the material at Store for physical inspection.')
        );
        navigation.navigate('BarcodeViewAllScreen');
      } else {
        Alert.alert('Error', res?.message || 'Return request failed.');
      }
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const rawPrice = barcodeDetail
    ? (barcodeDetail.unitPrice || barcodeDetail.price || barcodeDetail.rate || (barcodeDetail.transaction && barcodeDetail.transaction.totalCost) || 1250)
    : 1250;
  const formattedPrice = typeof rawPrice === 'number' ? `₹${rawPrice.toLocaleString('en-IN')}` : `₹${rawPrice}`;
  const displayQty = qty || (barcodeDetail ? (barcodeDetail.quantity || 1) : 1);

  return (
    <SafeAreaView style={styles.container}>
      <MaterialHeader
        title="Return to Store"
        subtitle={`Barcode: ${barcode || 'N/A'}`}
        navigation={navigation}
      />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Item Info & Price / Quantity Badges Card */}
        <View style={styles.infoCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.infoTitle}>
              {(barcodeDetail && (barcodeDetail.materialName || barcodeDetail.name)) || 'Serialized Inventory Unit'}
            </Text>
            <Text style={styles.infoSubtitle}>BARCODE: {barcode || 'UNSPECIFIED'}</Text>
          </View>

          <View style={styles.badgesCol}>
            <View style={styles.priceBadge}>
              <Tag size={12} color="#2563eb" />
              <Text style={styles.priceLabel}>PRICE:</Text>
              <Text style={styles.priceValue}>{formattedPrice}</Text>
            </View>

            <View style={styles.qtyBadge}>
              <Package size={12} color="#059669" />
              <Text style={styles.qtyLabel}>QTY:</Text>
              <Text style={styles.qtyValue}>{displayQty} Unit(s)</Text>
            </View>
          </View>
        </View>

        {/* 1. WHY RETURN (REASON CATEGORY) - DROPDOWN */}
        <Text style={styles.label}>1. WHY RETURN (REASON CATEGORY) *</Text>
        <TouchableOpacity
          style={styles.dropdownBtn}
          onPress={() => setReasonPickerVisible(true)}
        >
          <Text style={styles.dropdownBtnText}>{returnReasonCategory}</Text>
          <ChevronDown size={18} color="#64748b" />
        </TouchableOpacity>

        {/* 2. MATERIAL CONDITION - DROPDOWN */}
        <Text style={styles.label}>2. CONDITION OF MATERIAL *</Text>
        <TouchableOpacity
          style={styles.dropdownBtn}
          onPress={() => setConditionPickerVisible(true)}
        >
          <Text style={styles.dropdownBtnText}>
            {(CONDITION_OPTIONS.find((o) => o.value === materialCondition) || CONDITION_OPTIONS[0]).label}
          </Text>
          <ChevronDown size={18} color="#64748b" />
        </TouchableOpacity>

        {/* 3. RETURN LOGISTICS METHOD */}
        <Text style={styles.label}>3. RETURN LOGISTICS METHOD *</Text>
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
            <Text style={styles.label}>SELECT RETURN HANDLER *</Text>
            
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

        {/* Additional Remarks Input Box */}
        <Text style={styles.label}>REMARKS / DETAILS</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Type specific remarks or details for this return..."
          placeholderTextColor="#94a3b8"
          multiline
          numberOfLines={2}
          value={remarks}
          onChangeText={setRemarks}
        />

        {/* Geo-tagged physical material photos */}
        <View style={styles.docHeaderRow}>
          <Text style={styles.label}>CAPTURE LIVE MATERIAL PHOTOS *</Text>
          <TouchableOpacity
            onPress={() => setCameraModalVisible(true)}
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
                <View style={styles.photoInfoOverlay}>
                  <Text style={styles.photoGpsText}>
                    GPS: {pObj.gps?.latitude ?? pObj.coordinates?.[1] ?? '18.5204'}, {pObj.gps?.longitude ?? pObj.coordinates?.[0] ?? '73.8567'}
                  </Text>
                  <Text style={styles.photoAddressText} numberOfLines={1}>
                    {pObj.gps?.address || 'Address unavailable'}
                  </Text>
                </View>
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
            onPress={() => setCameraModalVisible(true)}
            style={styles.geoBtn}
          >
            <Camera size={22} color="#64748b" />
            <Text style={styles.geoBtnText}>Upload/Capture Geo-Tagged Photo</Text>
          </TouchableOpacity>
        )}

        {/* Attach / Upload Documents */}
        <View style={styles.docHeaderRow}>
          <Text style={styles.label}>ATTACH / UPLOAD DOCUMENTS</Text>
          <TouchableOpacity onPress={handlePickDocument} style={styles.attachBtn}>
            <Paperclip size={14} color="#2563eb" />
            <Text style={styles.attachBtnText}>Attach Document</Text>
          </TouchableOpacity>
        </View>

        {documents.length > 0 ? (
          <View style={styles.docList}>
            {documents.map((doc, idx) => (
              <View key={idx} style={styles.docItem}>
                <FileText size={16} color="#2563eb" />
                <Text style={styles.docName} numberOfLines={1}>{doc.name}</Text>
                <TouchableOpacity onPress={() => handleRemoveDocument(idx)}>
                  <Trash2 size={16} color="#dc2626" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.docEmptyText}>No extra documents attached (Optional)</Text>
        )}

        {/* Action Buttons */}
        <View style={styles.actionBtnRow}>
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => navigation.goBack()}
            disabled={submitting}
          >
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleReturnSubmit}
            disabled={submitting}
            style={styles.submitBtn}
          >
            {submitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.submitBtnText}>Submit Return request</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Geo Camera Checkpoint Modal */}
      <GeoCameraModal
        visible={cameraModalVisible}
        onClose={() => setCameraModalVisible(false)}
        onCaptureSuccess={(geoData) => handleCapturePhotoSuccess(geoData)}
        title="Return Inspection Checkpoint"
      />

      {/* 1st Choice Dropdown Modal (Why Return) */}
      <Modal
        visible={reasonPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setReasonPickerVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setReasonPickerVisible(false)}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Reason for Return</Text>
              <TouchableOpacity onPress={() => setReasonPickerVisible(false)}>
                <X size={18} color="#64748b" />
              </TouchableOpacity>
            </View>
            {REASON_OPTIONS.map((opt) => {
              const isSelected = returnReasonCategory === opt;
              return (
                <TouchableOpacity
                  key={opt}
                  style={[styles.modalOption, isSelected && styles.modalOptionActive]}
                  onPress={() => {
                    setReturnReasonCategory(opt);
                    setReasonPickerVisible(false);
                  }}
                >
                  <Text style={[styles.modalOptionText, isSelected && styles.modalOptionTextActive]}>
                    {opt}
                  </Text>
                  {isSelected && <Check size={16} color="#2563eb" />}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 2nd Choice Dropdown Modal (Material Condition) */}
      <Modal
        visible={conditionPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setConditionPickerVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setConditionPickerVisible(false)}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Condition of Material</Text>
              <TouchableOpacity onPress={() => setConditionPickerVisible(false)}>
                <X size={18} color="#64748b" />
              </TouchableOpacity>
            </View>
            {CONDITION_OPTIONS.map((opt) => {
              const isSelected = materialCondition === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.modalOption, isSelected && styles.modalOptionActive]}
                  onPress={() => {
                    setMaterialCondition(opt.value);
                    setConditionPickerVisible(false);
                  }}
                >
                  <Text style={[styles.modalOptionText, isSelected && styles.modalOptionTextActive]}>
                    {opt.label}
                  </Text>
                  {isSelected && <Check size={16} color="#2563eb" />}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 3rd Choice Dropdown Modal (Return Handler) */}
      <Modal
        visible={handlerPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setHandlerPickerVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setHandlerPickerVisible(false)}
        >
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
                      onPress={() => {
                        setSelectedHandlerId(hid);
                        setHandlerPickerVisible(false);
                      }}
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
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    gap: 12,
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  infoSubtitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748b',
    marginTop: 2,
    letterSpacing: 0.5,
  },
  badgesCol: {
    gap: 6,
    alignItems: 'flex-end',
  },
  priceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  priceLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1e40af',
  },
  priceValue: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1d4ed8',
  },
  qtyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  qtyLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#065f46',
  },
  qtyValue: {
    fontSize: 11,
    fontWeight: '800',
    color: '#047857',
  },
  label: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 0.8,
    marginTop: 6,
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
  input: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 14,
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },
  textArea: {
    height: 64,
    paddingTop: 10,
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
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  attachBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563eb',
  },
  docList: {
    gap: 6,
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
    height: 100,
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
    gap: 10,
  },
  photoPreviewCard: {
    height: 140,
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
  retakeBadgeBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  retakeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#ffffff',
  },
  actionBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: '#e2e8f0',
  },
  cancelBtn: {
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  submitBtn: {
    height: 44,
    paddingHorizontal: 20,
    backgroundColor: '#2563eb',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    gap: 6,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderColor: '#f1f5f9',
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  modalOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  modalOptionActive: {
    backgroundColor: '#eff6ff',
  },
  modalOptionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  modalOptionTextActive: {
    color: '#2563eb',
    fontWeight: '800',
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

export default ReturnMaterialScreen;
