import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Camera,
  FileText,
  Paperclip,
  AlertTriangle,
  Trash2,
  Building2,
  UserCheck,
  Layers,
  DollarSign,
  CheckCircle2,
  QrCode,
  Send,
} from 'lucide-react-native';
import MaterialHeader from '../components/MaterialHeader';
import GeoCameraModal from '../components/GeoCameraModal';
import materialApi from '../api/materialApi';

const ConvertMaterialScreen = ({ route, navigation }) => {
  const initialBarcode = route.params?.barcode || '';
  const defaultType = route.params?.defaultType || 'DC FOC';

  const [barcode, setBarcode] = useState(initialBarcode);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Lists
  const [tallyCustomers, setTallyCustomers] = useState([]);
  const [managementUsers, setManagementUsers] = useState([]);

  // Form states matching ConvertBarcodePage.jsx
  const [docType, setDocType] = useState(defaultType === 'Invoice' ? 'Invoice' : 'DC FOC');
  const [remarks, setRemarks] = useState('');
  const [selectedManagementId, setSelectedManagementId] = useState('');
  const [selectedCustomerName, setSelectedCustomerName] = useState('');
  const [closePhotos, setClosePhotos] = useState([]); // array of { url, capturedAt, gps }
  const [cameraModalVisible, setCameraModalVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (barcode) {
      loadBarcodeDetail();
    } else {
      setLoading(false);
    }
    loadTallyCustomers();
    loadManagementUsers();
  }, [barcode]);

  const loadBarcodeDetail = async () => {
    try {
      setLoading(true);
      const res = await materialApi.getBarcodeDetails(barcode);
      if (res) {
        setData(res.data || res);
      }
    } catch (err) {
      console.warn('Failed to fetch barcode convert detail', err);
    } finally {
      setLoading(false);
    }
  };

  const loadTallyCustomers = async () => {
    try {
      const res = await materialApi.getTallyCustomers();
      if (res && (res.customers || res.data?.customers || Array.isArray(res.data))) {
        setTallyCustomers(res.customers || res.data?.customers || res.data || []);
      }
    } catch (err) {
      console.warn('Could not load Tally customers', err);
    }
  };

  const loadManagementUsers = async () => {
    try {
      const res = await materialApi.getUsers();
      const empList = res.employees || res.data?.employees || res.data || (Array.isArray(res) ? res : []);
      // Filter for management users or department admins
      const mgtList = empList.filter(
        (e) =>
          e.role === 'department_admin' ||
          e.departmentAdminType === 'management' ||
          e.role === 'super_admin' ||
          e.designation?.toLowerCase().includes('manager')
      );
      setManagementUsers(mgtList.length > 0 ? mgtList : empList);
    } catch (err) {
      console.warn('Could not load management users', err);
    }
  };

  // Pending Actions Check matching ConvertBarcodePage.jsx
  const bc = data?.barcode || data?.data?.barcode || data;
  const splits = data?.splits || [];
  const exchanges = data?.exchanges || [];
  const transfers = data?.transfers || [];
  const returns = data?.returns || [];

  const isSplitPending = splits.some((s) => s.status === 'pending');
  const isExchangePending = exchanges.some((e) => e.status === 'pending');
  const isTransferPending = transfers.some((t) => t.status === 'pending');
  const isReturnPending = returns.some((r) =>
    ['pending', 'handler_assigned', 'collected', 'store_received'].includes(r.status)
  );
  const isClosePending =
    bc?.closeRequest &&
    bc.closeRequest.documentNumber &&
    ['pending', 'pending_accounts_approval', 'pending_store_acceptance'].includes(
      bc.closeRequest.status
    );

  const hasPendingAction =
    isSplitPending || isExchangePending || isTransferPending || isReturnPending || isClosePending;

  // Extract Material Details for Invoice Mode
  const material = bc?.transaction?.materials?.find((m) =>
    m.barcodes?.some((b) => (typeof b === 'string' ? b : b.barcode) === barcode)
  );
  const matName = material?.name || bc?.materialName || 'N/A';
  const matDesc = material?.description || bc?.description || '';
  const matQty = material?.quantity || bc?.quantity || 1;
  const matUnit = material?.unit || bc?.unit || 'pcs';
  const matPrice = material?.price || bc?.price || 0;
  const totalValuation = matQty * matPrice;

  // Photo captured callback
  const handlePhotoCaptured = (geoData) => {
    const newPhoto = {
      url: geoData.photoUrl,
      capturedAt: new Date().toISOString(),
      gps: geoData.coordinates || geoData.gps || { lat: 18.5204, lng: 73.8567 },
    };
    setClosePhotos((prev) => [...prev, newPhoto]);
  };

  const handleRemovePhoto = (index) => {
    setClosePhotos((prev) => prev.filter((_, i) => i !== index));
  };

  // Submit Handler matching ConvertBarcodePage.jsx
  const handleSubmit = async () => {
    if (!barcode.trim()) {
      Alert.alert('Validation Error', 'Please enter or scan a barcode.');
      return;
    }
    if (['DC FOC', 'Invoice'].includes(docType) && !selectedManagementId) {
      Alert.alert('Validation Error', 'Please select a management approver.');
      return;
    }
    if (docType === 'DC FOC' && !selectedCustomerName) {
      Alert.alert('Validation Error', 'Please select a customer.');
      return;
    }
    if (!remarks.trim()) {
      Alert.alert('Validation Error', 'Please enter a remark or conversion justification.');
      return;
    }
    if (closePhotos.length === 0) {
      Alert.alert('Validation Error', 'Please capture at least one live verification photo.');
      return;
    }

    try {
      setSubmitting(true);
      const latestGps = closePhotos[0]?.gps || { lat: 18.5204, lng: 73.8567, address: 'MIDC Pune' };

      const payload = {
        barcode: barcode.trim(),
        documentType: docType,
        documentNumber: 'N/A',
        remarks: remarks.trim(),
        managementApprover: ['DC FOC', 'Invoice'].includes(docType) ? selectedManagementId : undefined,
        customerName: docType === 'DC FOC' ? selectedCustomerName : undefined,
        photos: closePhotos.map((p) => ({ url: p.url, capturedAt: p.capturedAt })),
        gps: latestGps,
        documents: [],
      };

      const res = await materialApi.convertBarcode(payload);
      if (res && (res.success || res._id || res.data)) {
        Alert.alert(
          'Conversion Requested',
          `RDC closed and conversion request to ${docType} submitted successfully!`
        );
        navigation.navigate('BarcodeViewAllScreen', { barcode: barcode.trim() });
      } else {
        Alert.alert('Error', res?.message || 'Conversion request failed.');
      }
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <MaterialHeader title="Convert Barcode" navigation={navigation} />
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>Loading Barcode Data...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Blocked Action Card matching ConvertBarcodePage.jsx
  if (hasPendingAction) {
    return (
      <SafeAreaView style={styles.container}>
        <MaterialHeader title="Convert Barcode" navigation={navigation} />
        <View style={styles.blockedCard}>
          <View style={styles.blockedIconBox}>
            <AlertTriangle size={32} color="#f59e0b" />
          </View>
          <Text style={styles.blockedTitle}>Action Blocked</Text>
          <Text style={styles.blockedText}>
            This barcode has a pending request (split, return, transfer, exchange, or close) in
            progress. No other actions can be initiated until it is resolved.
          </Text>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.navigate('BarcodeDetailScreen', { barcode })}
          >
            <Text style={styles.backBtnText}>Back to Barcode Details</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const isInvoiceMode = docType === 'Invoice';

  return (
    <SafeAreaView style={styles.container}>
      <MaterialHeader
        title={isInvoiceMode ? 'Convert Barcode to Invoice' : 'Convert DC Challan Type'}
        subtitle={`Barcode loop • ${barcode || 'Selected'}`}
        navigation={navigation}
      />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Document Mode Selector Bar */}
        <Text style={styles.fieldLabel}>TARGET DOCUMENT CONVERSION TYPE *</Text>
        <View style={styles.docTypeRow}>
          {[
            { key: 'DC FOC', label: 'DC FOC', color: '#4f46e5' },
            { key: 'DC Internal', label: 'DC Internal', color: '#0284c7' },
            { key: 'Invoice', label: 'Invoice', color: '#16a34a' },
          ].map((item) => {
            const isSelected = docType === item.key;
            return (
              <TouchableOpacity
                key={item.key}
                style={[
                  styles.docChip,
                  isSelected && { backgroundColor: item.color, borderColor: item.color },
                ]}
                onPress={() => {
                  setDocType(item.key);
                  setSelectedManagementId('');
                  setSelectedCustomerName('');
                }}
              >
                <Text style={[styles.docChipText, isSelected && { color: '#ffffff' }]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {isInvoiceMode ? (
          /* ================= INVOICE MODE: MATERIAL DETAILS CARD + INVOICE FORM ================= */
          <>
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <FileText size={18} color="#2563eb" />
                <Text style={styles.cardHeaderTitle}>Material & Sourcing Details</Text>
              </View>

              <View style={styles.detailBox}>
                <Text style={styles.detailLabel}>MATERIAL NAME</Text>
                <Text style={styles.detailValBold}>{matName}</Text>
              </View>

              {matDesc ? (
                <View style={styles.detailBox}>
                  <Text style={styles.detailLabel}>DESCRIPTION</Text>
                  <Text style={styles.detailValSub}>{matDesc}</Text>
                </View>
              ) : null}

              <View style={styles.grid2Row}>
                <View style={[styles.detailBox, { flex: 1 }]}>
                  <Text style={styles.detailLabel}>QUANTITY</Text>
                  <Text style={styles.detailValBold}>
                    {matQty} {matUnit}
                  </Text>
                </View>
                <View style={[styles.detailBox, { flex: 1 }]}>
                  <Text style={styles.detailLabel}>UNIT PRICE</Text>
                  <Text style={styles.detailValBold}>₹{matPrice}</Text>
                </View>
              </View>

              <View style={[styles.detailBox, { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' }]}>
                <Text style={[styles.detailLabel, { color: '#1d4ed8' }]}>TOTAL VALUATION</Text>
                <Text style={[styles.detailValBold, { color: '#1e40af', fontSize: 16 }]}>
                  ₹{totalValuation}
                </Text>
              </View>

              <View style={styles.grid2Row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.detailLabel}>CURRENT STATUS</Text>
                  <Text style={styles.detailValSub}>{bc?.status || 'Active'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.detailLabel}>OWNER</Text>
                  <Text style={styles.detailValSub}>{bc?.owner?.fullName || 'Store Warehouse'}</Text>
                </View>
              </View>
            </View>

            {/* Invoice Form */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Invoice Approval Form</Text>

              {/* Management Approver Picker */}
              <Text style={styles.fieldLabel}>CHOOSE MANAGEMENT APPROVER *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hScroll}>
                {managementUsers.map((u) => {
                  const uid = u._id || u.id;
                  const name = u.fullName || u.name || 'Admin';
                  const isSelected = selectedManagementId === uid;

                  return (
                    <TouchableOpacity
                      key={uid}
                      style={[styles.pickerChip, isSelected && styles.pickerChipActive]}
                      onPress={() => setSelectedManagementId(uid)}
                    >
                      <UserCheck size={14} color={isSelected ? '#ffffff' : '#64748b'} />
                      <Text style={[styles.pickerChipText, isSelected && styles.pickerChipTextActive]}>
                        {name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Justification Remarks */}
              <Text style={styles.fieldLabel}>REMARKS / CONVERSION REASON *</Text>
              <TextInput
                style={styles.textArea}
                multiline
                numberOfLines={3}
                placeholder="Provide conversion justification for accounts approval..."
                placeholderTextColor="#94a3b8"
                value={remarks}
                onChangeText={setRemarks}
              />
            </View>
          </>
        ) : (
          /* ================= DC CONVERSION MODE (DC FOC vs DC Internal) ================= */
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>
              {docType === 'DC FOC' ? 'DC FOC Conversion Form' : 'DC Internal Conversion Form'}
            </Text>

            {docType === 'DC FOC' && (
              <>
                {/* Management Approver Picker for DC FOC */}
                <Text style={styles.fieldLabel}>CHOOSE MANAGEMENT APPROVER *</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hScroll}>
                  {managementUsers.map((u) => {
                    const uid = u._id || u.id;
                    const name = u.fullName || u.name || 'Admin';
                    const isSelected = selectedManagementId === uid;

                    return (
                      <TouchableOpacity
                        key={uid}
                        style={[styles.pickerChip, isSelected && styles.pickerChipActive]}
                        onPress={() => setSelectedManagementId(uid)}
                      >
                        <UserCheck size={14} color={isSelected ? '#ffffff' : '#64748b'} />
                        <Text style={[styles.pickerChipText, isSelected && styles.pickerChipTextActive]}>
                          {name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* Tally Customer Picker */}
                <Text style={styles.fieldLabel}>SELECT TALLY CUSTOMER *</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Type or select customer name..."
                  placeholderTextColor="#94a3b8"
                  value={selectedCustomerName}
                  onChangeText={setSelectedCustomerName}
                />
                {tallyCustomers.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hScroll}>
                    {tallyCustomers.map((cust, idx) => {
                      const cName = typeof cust === 'string' ? cust : cust.name || cust;
                      const isSelected = selectedCustomerName === cName;

                      return (
                        <TouchableOpacity
                          key={idx}
                          style={[styles.pickerChip, isSelected && styles.pickerChipActive]}
                          onPress={() => setSelectedCustomerName(cName)}
                        >
                          <Building2 size={14} color={isSelected ? '#ffffff' : '#64748b'} />
                          <Text style={[styles.pickerChipText, isSelected && styles.pickerChipTextActive]}>
                            {cName}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                )}
              </>
            )}

            {/* Remarks */}
            <Text style={styles.fieldLabel}>REMARKS / REASON *</Text>
            <TextInput
              style={styles.textArea}
              multiline
              numberOfLines={3}
              placeholder="Provide migration reason details..."
              placeholderTextColor="#94a3b8"
              value={remarks}
              onChangeText={setRemarks}
            />
          </View>
        )}

        {/* Live Photo Verification Section */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Verification Live Photos *</Text>
          <TouchableOpacity
            style={styles.captureBtn}
            onPress={() => setCameraModalVisible(true)}
          >
            <Camera size={18} color="#2563eb" />
            <Text style={styles.captureBtnText}>
              Capture Live Verification Photo ({closePhotos.length} captured)
            </Text>
          </TouchableOpacity>

          {closePhotos.length > 0 && (
            <View style={styles.photoThumbGrid}>
              {closePhotos.map((photo, idx) => (
                <View key={idx} style={styles.photoThumbCard}>
                  <Image source={{ uri: photo.url }} style={styles.photoThumbImg} />
                  <TouchableOpacity
                    style={styles.thumbDeleteBtn}
                    onPress={() => handleRemovePhoto(idx)}
                  >
                    <Trash2 size={12} color="#ffffff" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Submit Conversion Request */}
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={submitting}
          style={[styles.submitBtn, isInvoiceMode ? { backgroundColor: '#16a34a' } : { backgroundColor: '#4f46e5' }]}
        >
          {submitting ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <>
              <Send size={18} color="#ffffff" />
              <Text style={styles.submitBtnText}>
                {isInvoiceMode ? 'Convert to Invoice' : 'Submit Conversion Request'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Geo Camera Checkpoint Modal */}
      <GeoCameraModal
        visible={cameraModalVisible}
        onClose={() => setCameraModalVisible(false)}
        onCaptureSuccess={handlePhotoCaptured}
        title="Conversion Verification Photo"
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '600',
  },
  scrollContent: {
    padding: 16,
    gap: 14,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 4,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 0.5,
    marginTop: 4,
  },
  docTypeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  docChip: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  docChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingBottom: 8,
  },
  cardHeaderTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
  },
  detailBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  detailLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94a3b8',
    letterSpacing: 0.5,
  },
  detailValBold: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
    marginTop: 2,
  },
  detailValSub: {
    fontSize: 12,
    color: '#475569',
    marginTop: 2,
  },
  grid2Row: {
    flexDirection: 'row',
    gap: 10,
  },
  hScroll: {
    flexDirection: 'row',
    marginVertical: 4,
  },
  pickerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    gap: 6,
  },
  pickerChipActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  pickerChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  pickerChipTextActive: {
    color: '#ffffff',
  },
  textInput: {
    height: 46,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#0f172a',
  },
  textArea: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    padding: 12,
    fontSize: 14,
    color: '#0f172a',
    textAlignVertical: 'top',
  },
  captureBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    gap: 8,
  },
  captureBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2563eb',
  },
  photoThumbGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  photoThumbCard: {
    position: 'relative',
    width: 64,
    height: 64,
    borderRadius: 8,
    overflow: 'hidden',
  },
  photoThumbImg: {
    width: '100%',
    height: '100%',
  },
  thumbDeleteBtn: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: '#dc2626',
    borderRadius: 10,
    padding: 4,
  },
  submitBtn: {
    height: 52,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
    marginBottom: 30,
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  blockedCard: {
    margin: 20,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fde68a',
    gap: 12,
  },
  blockedIconBox: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fef3c7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  blockedTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#92400e',
  },
  blockedText: {
    fontSize: 13,
    color: '#78350f',
    textAlign: 'center',
    lineHeight: 18,
  },
  backBtn: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 8,
  },
  backBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});

export default ConvertMaterialScreen;
