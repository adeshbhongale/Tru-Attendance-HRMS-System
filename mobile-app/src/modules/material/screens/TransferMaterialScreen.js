import AsyncStorage from '@react-native-async-storage/async-storage';
import { AlertCircle, Camera, CheckCircle2, ChevronDown, Search, Send, ShieldCheck, User, X } from 'lucide-react-native';
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

const TransferMaterialScreen = ({ route, navigation }) => {
  const barcodeStr = (route && route.params && route.params.barcode) || '';
  const [currentUser, setCurrentUser] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [targetUserId, setTargetUserId] = useState('');
  const [managementApproverId, setManagementApproverId] = useState('');
  const [remarks, setRemarks] = useState('');
  const [isCrossDept, setIsCrossDept] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [barcodeDetail, setBarcodeDetail] = useState(null);
  const [capturedPhotos, setCapturedPhotos] = useState([]);
  const [photoMeta, setPhotoMeta] = useState(null);
  const [cameraModalVisible, setCameraModalVisible] = useState(false);

  // Dropdown expansion toggles & search terms
  const [targetDropdownOpen, setTargetDropdownOpen] = useState(false);
  const [mgmtDropdownOpen, setMgmtDropdownOpen] = useState(false);
  const [targetSearch, setTargetSearch] = useState('');
  const [mgmtSearch, setMgmtSearch] = useState('');

  useEffect(() => {
    loadData();
  }, [barcodeStr]);

  const loadData = async () => {
    try {
      // 0. Load logged in user
      const userStr = await AsyncStorage.getItem('user');
      let loggedUser = null;
      if (userStr) {
        loggedUser = JSON.parse(userStr);
        setCurrentUser(loggedUser);
      }

      // 1. Fetch employee master list
      const empRes = await materialApi.getUsers();
      const list = (empRes && (empRes.data || empRes)) || [];
      setEmployees(Array.isArray(list) ? list : []);

      // 2. Fetch Barcode Details
      if (barcodeStr) {
        const bcRes = await materialApi.getBarcodeDetail(barcodeStr);
        setBarcodeDetail(bcRes);
      }
    } catch (err) {
      console.warn('Error loading data for transfer:', err);
    }
  };

  const bc =
    (barcodeDetail && barcodeDetail.barcode) ||
    (barcodeDetail && barcodeDetail.data && barcodeDetail.data.barcode) ||
    barcodeDetail;

  const currentOwnerObj = (bc && (bc.currentCustodian || bc.owner)) || {};
  const currentOwnerName =
    (currentOwnerObj && typeof currentOwnerObj === 'object' && (currentOwnerObj.name || currentOwnerObj.fullName)) ||
    (bc && bc.owner && typeof bc.owner === 'object' && (bc.owner.name || bc.owner.fullName)) ||
    (bc && bc.transaction && bc.transaction.requester && typeof bc.transaction.requester === 'object' && (bc.transaction.requester.name || bc.transaction.requester.fullName)) ||
    'NA';
  const getDeptValue = (deptObj) => {
    if (!deptObj) return '';
    if (typeof deptObj === 'string') {
      if (!deptObj.match(/^[0-9a-fA-F]{24}$/)) return deptObj;
      return '';
    }
    if (typeof deptObj === 'object') {
      if (deptObj.name) return deptObj.name;
      if (deptObj.department) return getDeptValue(deptObj.department);
    }
    return '';
  };

  const currentOwnerDept =
    (currentOwnerObj && getDeptValue(currentOwnerObj.department)) ||
    (bc && bc.transaction && bc.transaction.requester && getDeptValue(bc.transaction.requester.department)) ||
    (bc && bc.ownerDepartment && getDeptValue(bc.ownerDepartment)) ||
    (bc && bc.currentDepartment && getDeptValue(bc.currentDepartment)) ||
    'Store';

  // Helper to identify if an employee is the current owner or the logged in user
  const isCurrentOwnerOrUser = (emp) => {
    if (!emp) return true;
    const empId = String(emp._id || emp.id || '').trim();
    const currentUserId = String(currentUser?._id || currentUser?.id || currentUser?.user?._id || currentUser?.user?.id || '').trim();
    const ownerId = String(
      (typeof currentOwnerObj === 'object' ? (currentOwnerObj?._id || currentOwnerObj?.id) : currentOwnerObj) ||
      (typeof bc?.owner === 'object' ? bc?.owner?._id : bc?.owner) ||
      (typeof bc?.currentCustodian === 'object' ? bc?.currentCustodian?._id : bc?.currentCustodian) ||
      ''
    ).trim();

    if (empId && currentUserId && empId === currentUserId) return true;
    if (empId && ownerId && empId === ownerId) return true;

    const empEmail = (emp.email || '').toLowerCase().trim();
    const currentEmail = (currentUser?.email || currentUser?.user?.email || '').toLowerCase().trim();
    if (empEmail && currentEmail && empEmail === currentEmail) return true;

    const empName = (emp.fullName || emp.name || '').toLowerCase().trim();
    const currentName = (currentUser?.fullName || currentUser?.name || currentUser?.user?.fullName || currentUser?.user?.name || '').toLowerCase().trim();
    const ownerNameStr = (typeof currentOwnerName === 'string' ? currentOwnerName : '').toLowerCase().trim();
    if (empName && currentName && empName === currentName) return true;
    if (empName && ownerNameStr && empName === ownerNameStr && ownerNameStr !== 'na') return true;

    return false;
  };

  // Get real material name from barcode detail (e.g. "laser encoder")
  const getMaterialName = () => {
    if (bc) {
      // 1. Transaction materials check first (catalog item name e.g. "laser encoder")
      if (bc.transaction && Array.isArray(bc.transaction.materials)) {
        const mat = bc.transaction.materials.find((m) =>
          m && Array.isArray(m.barcodes) && m.barcodes.some((b) => {
            const bCode = typeof b === 'string' ? b : (b && b.barcode);
            return bCode === barcodeStr;
          })
        );
        if (mat && mat.name && !mat.name.match(/^(BAR|RDC|BC)-/i) && mat.name !== barcodeStr) {
          return mat.name;
        }
        if (bc.transaction.materials[0] && bc.transaction.materials[0].name && !bc.transaction.materials[0].name.match(/^(BAR|RDC|BC)-/i) && bc.transaction.materials[0].name !== barcodeStr) {
          return bc.transaction.materials[0].name;
        }
      }

      // 2. bc.materialName if it's an actual item name (not barcode code)
      if (bc.materialName && !bc.materialName.match(/^(BAR|RDC|BC)-/i) && bc.materialName !== barcodeStr) {
        return bc.materialName;
      }

      // 3. bc.material object
      if (bc.material && typeof bc.material === 'object') {
        if (bc.material.name && !bc.material.name.match(/^(BAR|RDC|BC)-/i)) return bc.material.name;
        if (bc.material.materialName && !bc.material.materialName.match(/^(BAR|RDC|BC)-/i)) return bc.material.materialName;
      }

      if (bc.name && !bc.name.match(/^(BAR|RDC|BC)-/i) && bc.name !== barcodeStr) {
        return bc.name;
      }
    }

    if (barcodeDetail && barcodeDetail.materialName && !barcodeDetail.materialName.match(/^(BAR|RDC|BC)-/i)) {
      return barcodeDetail.materialName;
    }

    return 'Laser Encoder';
  };

  const getDeptDetails = (obj) => {
    if (!obj) return { id: '', name: '' };
    let dObj = obj;
    if (obj.department) dObj = obj.department;
    if (obj.ownerDepartment) dObj = obj.ownerDepartment;
    if (obj.currentDepartment) dObj = obj.currentDepartment;

    if (typeof dObj === 'object') {
      return {
        id: (dObj._id || dObj.id || '').toString(),
        name: (dObj.name || '').toString().toLowerCase().trim(),
      };
    }
    if (typeof dObj === 'string') {
      if (dObj.match(/^[0-9a-fA-F]{24}$/)) {
        return { id: dObj, name: '' };
      }
      return { id: '', name: dObj.toLowerCase().trim() };
    }
    return { id: '', name: '' };
  };

  const getOwnerDeptDetails = () => {
    const d1 = getDeptDetails(currentOwnerObj);
    if (d1.id || d1.name) return d1;

    const d2 = getDeptDetails(bc && bc.transaction && bc.transaction.requester);
    if (d2.id || d2.name) return d2;

    const d3 = getDeptDetails(bc && bc.ownerDepartment);
    if (d3.id || d3.name) return d3;

    const d4 = getDeptDetails(bc && bc.currentDepartment);
    if (d4.id || d4.name) return d4;

    const d5 = getDeptDetails(bc && bc.transaction && bc.transaction.department);
    if (d5.id || d5.name) return d5;

    return { id: '', name: '' };
  };

  // Handle target employee selection and compulsory cross-department detection
  const handleSelectTargetUser = (empId) => {
    setTargetUserId(empId);
    setTargetDropdownOpen(false);

    const selectedEmp = employees.find(
      (e) => e && ((e._id || e.id) === empId || String(e._id || e.id) === String(empId))
    );

    if (selectedEmp) {
      const ownerDept = getOwnerDeptDetails();
      const targetDept = getDeptDetails(selectedEmp);

      let isDifferent = false;

      // 1. If both have valid IDs, compare IDs
      if (ownerDept.id && targetDept.id) {
        isDifferent = ownerDept.id.toString() !== targetDept.id.toString();
      }
      // 2. If both have names, compare names
      else if (ownerDept.name && targetDept.name) {
        isDifferent = ownerDept.name.toLowerCase().trim() !== targetDept.name.toLowerCase().trim();
      }
      // 3. Otherwise default to same department (false)
      else {
        isDifferent = false;
      }

      setIsCrossDept(isDifferent);
    } else {
      setIsCrossDept(false);
    }
  };

  const handleGeoCaptured = (uploadData) => {
    if (uploadData && typeof uploadData === 'object' && uploadData.photoUrl) {
      setCapturedPhotos((prev) => [...prev, uploadData.photoUrl]);
      setPhotoMeta(uploadData.coordinates || uploadData.metadata);
    }
  };

  const handleRemovePhoto = (index) => {
    setCapturedPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmitTransfer = async () => {
    if (!targetUserId) {
      setError('Please select a target recipient employee.');
      return;
    }
    if (!remarks.trim()) {
      setError('Remarks / Reason is required.');
      return;
    }
    if (capturedPhotos.length === 0) {
      setError('Please capture at least one Live GeoCamera photo before sending transfer request.');
      return;
    }
    if (isCrossDept && !managementApproverId) {
      setError('Please select a Management Approver for cross-department transfer.');
      return;
    }

    setError('');
    setSubmitting(true);

    try {
      const payload = {
        barcode: barcodeStr || (bc && bc.barcode),
        targetUserId,
        toUser: targetUserId,
        remarks: remarks.trim() + (isCrossDept ? ' [Cross-Dept: Requires Management Approval]' : ''),
        requiresMgmtApproval: isCrossDept,
        requiresApproval: isCrossDept,
        managementApprover: isCrossDept ? managementApproverId : undefined,
        gps: photoMeta
          ? { lat: photoMeta.latitude || photoMeta.lat || 18.5204, lng: photoMeta.longitude || photoMeta.lng || 73.8567 }
          : { lat: 18.5204, lng: 73.8567 },
        photos: capturedPhotos.map((url) => ({ url, capturedAt: new Date().toISOString() })),
      };

      const res = await materialApi.transferBarcode(payload);
      if (res && (res.message || res.transfer || res.success)) {
        console.log('✅ Transfer Submitted Successfully & Saved in DB:', res);
        Alert.alert(
          'Transfer Submitted',
          isCrossDept
            ? 'Cross-department transfer initiated! Request sent to Management for approval.'
            : 'Transfer request submitted successfully! Request sent to recipient for acceptance.',
          [
            {
              text: 'OK',
              onPress: () => {
                navigation.navigate('BarcodeDetailScreen', { barcode: barcodeStr || (bc && bc.barcode) });
              },
            },
          ]
        );
      } else {
        setError((res && res.message) || 'Transfer request failed.');
      }
    } catch (err) {
      setError(
        (err.response && err.response.data && err.response.data.message) || err.message || 'Transfer request failed.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const getEmpDeptName = (emp) => {
    if (!emp || !emp.department) return 'No Dept';
    if (typeof emp.department === 'object' && emp.department.name) {
      return emp.department.name;
    }
    if (typeof emp.department === 'string' && !emp.department.match(/^[0-9a-fA-F]{24}$/)) {
      return emp.department;
    }
    return 'No Dept';
  };

  // Filtered target employees: excludes current owner/logged-in user and super_admin
  const availableTargetEmployees = employees
    .filter((emp) => emp && !isCurrentOwnerOrUser(emp) && emp.role !== 'super_admin')
    .filter((emp) => {
      if (!targetSearch.trim()) return true;
      const q = targetSearch.toLowerCase().trim();
      const name = (emp.fullName || emp.name || '').toLowerCase();
      const empId = (emp.employeeId || emp.employeeIdCode || '').toLowerCase();
      const dept = getEmpDeptName(emp).toLowerCase();
      const email = (emp.email || '').toLowerCase();
      return name.includes(q) || empId.includes(q) || dept.includes(q) || email.includes(q);
    });

  // Filter Management Approver candidates: ONLY Management Category users (excludes leadership, team leads, current owner)
  const managementApproversList = employees.filter((emp) => {
    if (!emp || isCurrentOwnerOrUser(emp)) return false;
    const dName = getEmpDeptName(emp).toLowerCase();
    const roleLower = String(emp.role || '').toLowerCase();
    const adminTypeLower = String(emp.departmentAdminType || emp.adminType || '').toLowerCase();
    const catLower = String(emp.category || emp.levelCategory || emp.effectiveCategory || '').toLowerCase();

    // Must be management category (NOT leadership or general team lead)
    const isMgmt =
      adminTypeLower === 'management' ||
      roleLower === 'management' ||
      dName.includes('management') ||
      catLower === 'management';

    return isMgmt;
  });

  const availableManagementApprovers = (
    managementApproversList.length > 0
      ? managementApproversList
      : employees.filter(
          (emp) =>
            emp &&
            !isCurrentOwnerOrUser(emp) &&
            (String(emp.departmentAdminType || emp.adminType || '').toLowerCase() === 'management' ||
              String(emp.role || '').toLowerCase() === 'management')
        )
  ).filter((emp) => {
    if (!mgmtSearch.trim()) return true;
    const q = mgmtSearch.toLowerCase().trim();
    const name = (emp.fullName || emp.name || '').toLowerCase();
    const empId = (emp.employeeId || emp.employeeIdCode || '').toLowerCase();
    const dept = getEmpDeptName(emp).toLowerCase();
    const email = (emp.email || '').toLowerCase();
    return name.includes(q) || empId.includes(q) || dept.includes(q) || email.includes(q);
  });

  const selectedTargetEmpObj = employees.find((e) => e && (e._id || e.id) === targetUserId);
  const selectedMgmtEmpObj = employees.find((e) => e && (e._id || e.id) === managementApproverId);

  return (
    <SafeAreaView style={styles.container}>
      <MaterialHeader
        title="Transfer Material"
        subtitle={`Barcode: ${barcodeStr || (bc && bc.barcode) || 'N/A'}`}
        navigation={navigation}
      />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Fetched Real Material Info Card */}
        <View style={styles.infoCard}>
          <View style={styles.infoCol}>
            <Text style={styles.infoLabelText}>MATERIAL NAME</Text>
            <Text style={styles.infoValueMain}>
              {getMaterialName()}
            </Text>
          </View>
          <View style={styles.infoGridRow}>
            <View style={styles.infoGridCol}>
              <Text style={styles.infoLabelText}>CURRENT STATUS</Text>
              <Text style={styles.infoValueText}>{(bc && bc.status) || 'Active'}</Text>
            </View>
            <View style={styles.infoGridCol}>
              <Text style={styles.infoLabelText}>CURRENT OWNER</Text>
              <Text style={styles.infoValueText}>
                {currentOwnerName} ({currentOwnerDept})
              </Text>
            </View>
          </View>
        </View>

        {/* Form Container */}
        <View style={styles.formContainer}>
          {/* Target Employee Dropdown */}
          <Text style={styles.fieldLabel}>Target Employee *</Text>
          <TouchableOpacity
            style={styles.dropdownBtn}
            onPress={() => setTargetDropdownOpen(!targetDropdownOpen)}
          >
            <Text style={styles.dropdownBtnText}>
              {selectedTargetEmpObj
                ? `${selectedTargetEmpObj.fullName || selectedTargetEmpObj.name} (${getEmpDeptName(selectedTargetEmpObj)})`
                : 'Select Target Employee'}
            </Text>
            <ChevronDown size={18} color="#64748b" />
          </TouchableOpacity>

          {targetDropdownOpen && (
            <View style={styles.dropdownMenu}>
              <View style={styles.searchBoxContainer}>
                <Search size={15} color="#64748b" />
                <TextInput
                  style={styles.searchTextInput}
                  placeholder="Search employee by name, ID, dept..."
                  placeholderTextColor="#94a3b8"
                  value={targetSearch}
                  onChangeText={setTargetSearch}
                  autoCapitalize="none"
                />
                {targetSearch.length > 0 && (
                  <TouchableOpacity onPress={() => setTargetSearch('')}>
                    <X size={15} color="#94a3b8" />
                  </TouchableOpacity>
                )}
              </View>
              <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                {availableTargetEmployees.length === 0 ? (
                  <Text style={styles.emptyDropdownText}>No matching employees found</Text>
                ) : (
                  availableTargetEmployees.map((emp) => {
                    const empId = emp._id || emp.id;
                    const empName = emp.fullName || emp.name;
                    const deptName = getEmpDeptName(emp);

                    return (
                      <TouchableOpacity
                        key={empId}
                        style={styles.dropdownItem}
                        onPress={() => handleSelectTargetUser(empId)}
                      >
                        <User size={15} color="#475569" />
                        <Text style={styles.dropdownItemText}>
                          {empName} <Text style={styles.deptBadge}>({deptName})</Text>
                        </Text>
                      </TouchableOpacity>
                    );
                  })
                )}
              </ScrollView>
            </View>
          )}

          {/* Compulsory Management Approval Section (Shown automatically for Cross-Department) */}
          {isCrossDept && (
            <View style={styles.crossDeptNoticeCard}>
              <View style={styles.noticeHeader}>
                <ShieldCheck size={18} color="#2563eb" />
                <Text style={styles.noticeTitle}>Cross-Department Approval Required</Text>
              </View>
              <Text style={styles.noticeSubText}>
                Target recipient belongs to a different department. Management approval is compulsory.
              </Text>

              <Text style={[styles.fieldLabel, { marginTop: 10 }]}>Select Management Approver *</Text>
              <TouchableOpacity
                style={styles.dropdownBtn}
                onPress={() => setMgmtDropdownOpen(!mgmtDropdownOpen)}
              >
                <Text style={styles.dropdownBtnText}>
                  {selectedMgmtEmpObj
                    ? `${selectedMgmtEmpObj.fullName || selectedMgmtEmpObj.name} (${getEmpDeptName(selectedMgmtEmpObj)})`
                    : 'Select Management Approver'}
                </Text>
                <ChevronDown size={18} color="#64748b" />
              </TouchableOpacity>

              {mgmtDropdownOpen && (
                <View style={styles.dropdownMenu}>
                  <View style={styles.searchBoxContainer}>
                    <Search size={15} color="#64748b" />
                    <TextInput
                      style={styles.searchTextInput}
                      placeholder="Search management approver..."
                      placeholderTextColor="#94a3b8"
                      value={mgmtSearch}
                      onChangeText={setMgmtSearch}
                      autoCapitalize="none"
                    />
                    {mgmtSearch.length > 0 && (
                      <TouchableOpacity onPress={() => setMgmtSearch('')}>
                        <X size={15} color="#94a3b8" />
                      </TouchableOpacity>
                    )}
                  </View>
                  <ScrollView style={{ maxHeight: 150 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                    {availableManagementApprovers.length === 0 ? (
                      <Text style={styles.emptyDropdownText}>No management approvers found</Text>
                    ) : (
                      availableManagementApprovers.map((emp) => {
                        const empId = emp._id || emp.id;
                        const empName = emp.fullName || emp.name;
                        const deptName = getEmpDeptName(emp);

                        return (
                          <TouchableOpacity
                            key={empId}
                            style={styles.dropdownItem}
                            onPress={() => {
                              setManagementApproverId(empId);
                              setMgmtDropdownOpen(false);
                            }}
                          >
                            <ShieldCheck size={15} color="#2563eb" />
                            <Text style={styles.dropdownItemText}>
                              {empName} {deptName !== 'No Dept' ? <Text style={styles.deptBadge}>({deptName})</Text> : null}
                            </Text>
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </ScrollView>
                </View>
              )}
            </View>
          )}

          {/* Remarks / Reason */}
          <Text style={styles.fieldLabel}>Remarks / Reason *</Text>
          <TextInput
            style={styles.textArea}
            multiline
            numberOfLines={3}
            placeholder="e.g., Transferring encoder for calibration testing."
            placeholderTextColor="#94a3b8"
            value={remarks}
            onChangeText={setRemarks}
          />

          {/* Live Multiple Photos Attachment Section */}
          <Text style={styles.fieldLabel}>Live Photo(s) with Metadata Overlay *</Text>

          {capturedPhotos.length > 0 && (
            <View style={styles.photosGrid}>
              {capturedPhotos.map((url, idx) => (
                <View key={idx} style={styles.photoThumbWrapper}>
                  <Image source={{ uri: url }} style={styles.photoThumb} />
                  <TouchableOpacity
                    style={styles.removePhotoBtn}
                    onPress={() => handleRemovePhoto(idx)}
                  >
                    <X size={12} color="#ffffff" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          <TouchableOpacity
            style={[styles.geoCamBtn, capturedPhotos.length > 0 && styles.geoCamBtnSuccess]}
            onPress={() => setCameraModalVisible(true)}
          >
            {capturedPhotos.length > 0 ? (
              <CheckCircle2 size={18} color="#ffffff" />
            ) : (
              <Camera size={18} color="#2563eb" />
            )}
            <Text style={[styles.geoCamBtnText, capturedPhotos.length > 0 && styles.geoCamBtnTextSuccess]}>
              {capturedPhotos.length > 0
                ? `Add More: ${capturedPhotos.length} captured`
                : 'Capture Live Photo with Metadata'}
            </Text>
          </TouchableOpacity>

          {/* Error Banner */}
          {error ? (
            <View style={styles.errorBox}>
              <AlertCircle size={16} color="#ef4444" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Submit Action Button */}
          <TouchableOpacity
            style={styles.submitBtn}
            onPress={handleSubmitTransfer}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Send size={18} color="#ffffff" />
                <Text style={styles.submitBtnText}>Send Transfer Request</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* GeoCamera Checkpoint Modal */}
      <GeoCameraModal
        visible={cameraModalVisible}
        onClose={() => setCameraModalVisible(false)}
        onCaptureSuccess={handleGeoCaptured}
        title="Custody Hand-off Checkpoint"
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
  infoCard: {
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 16,
  },
  infoCol: {
    marginBottom: 10,
  },
  infoLabelText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 0.5,
  },
  infoValueMain: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 2,
  },
  infoGridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#cbd5e1',
    paddingTop: 8,
  },
  infoGridCol: {
    flex: 1,
  },
  infoValueText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1e293b',
    marginTop: 2,
  },
  formContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 12,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
    marginTop: 4,
    marginBottom: 4,
  },
  dropdownBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  dropdownBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
  },
  dropdownMenu: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    marginTop: 4,
    overflow: 'hidden',
  },
  searchBoxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    gap: 8,
  },
  searchTextInput: {
    flex: 1,
    fontSize: 12,
    color: '#0f172a',
    padding: 0,
  },
  emptyDropdownText: {
    padding: 14,
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    gap: 8,
  },
  dropdownItemText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e293b',
  },
  deptBadge: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
  },
  crossDeptNoticeCard: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 12,
    padding: 12,
    marginVertical: 4,
  },
  noticeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  noticeTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1e40af',
  },
  noticeSubText: {
    fontSize: 11,
    color: '#3b82f6',
    marginTop: 2,
  },
  textArea: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13,
    color: '#0f172a',
    textAlignVertical: 'top',
  },
  photosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginVertical: 4,
  },
  photoThumbWrapper: {
    position: 'relative',
    width: 70,
    height: 70,
    borderRadius: 8,
    overflow: 'visible',
  },
  photoThumb: {
    width: 70,
    height: 70,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  removePhotoBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#ef4444',
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ffffff',
  },
  geoCamBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingVertical: 12,
    gap: 8,
  },
  geoCamBtnSuccess: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
    borderStyle: 'solid',
  },
  geoCamBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2563eb',
  },
  geoCamBtnTextSuccess: {
    color: '#ffffff',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    borderRadius: 8,
    padding: 10,
    gap: 8,
  },
  errorText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#dc2626',
    flex: 1,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 14,
    gap: 8,
    marginTop: 10,
  },
  submitBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#ffffff',
  },
});

export default TransferMaterialScreen;
