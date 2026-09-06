import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Plus, Trash2, Calendar, Send, Database, UserCheck, FileText } from 'lucide-react-native';
import MaterialHeader from '../components/MaterialHeader';
import MaterialModuleFooter from '../components/MaterialModuleFooter';
import TallyMaterialSelectModal from '../components/TallyMaterialSelectModal';
import DatePickerModal from '../components/DatePickerModal';
import materialApi from '../api/materialApi';
import api from '../../../api/axios';

const MaterialRequestScreen = ({ route, navigation }) => {
  const editTransaction = route?.params?.editTransaction;
  const isEditMode = Boolean(editTransaction);

  // Form State matching CreateTransactionPage.jsx web page
  const [expectedReturnDate, setExpectedReturnDate] = useState('');
  const [description, setDescription] = useState('');
  const [userDepartment, setUserDepartment] = useState('');
  const [teamLeadName, setTeamLeadName] = useState('');
  const [hasTeamLead, setHasTeamLead] = useState(false);
  const [deptTLId, setDeptTLId] = useState(null);
  const [isManagerStep1, setIsManagerStep1] = useState(false);
  const [mgtApprovers, setMgtApprovers] = useState([]);
  const [selectedMgt, setSelectedMgt] = useState('');
  const [workflowApprovalSteps, setWorkflowApprovalSteps] = useState([]);
  const [selectedApproversByStep, setSelectedApproversByStep] = useState({});
  const [materials, setMaterials] = useState([
    { name: '', qty: '1', price: '0', unit: 'Nos' },
  ]);

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [tallyModalVisible, setTallyModalVisible] = useState(false);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [activeItemIndex, setActiveItemIndex] = useState(0);

  // Pre-fill form if editing an existing request before approval
  useEffect(() => {
    if (editTransaction) {
      if (editTransaction.description) {
        setDescription(editTransaction.description);
      }
      const rawDate = editTransaction.expectedReturnDate || editTransaction.dueDate;
      if (rawDate) {
        try {
          const d = new Date(rawDate);
          if (!isNaN(d.getTime())) {
            setExpectedReturnDate(d.toISOString().split('T')[0]);
          } else {
            setExpectedReturnDate(String(rawDate).split('T')[0]);
          }
        } catch (_) {
          setExpectedReturnDate(String(rawDate).split('T')[0]);
        }
      }
      if (Array.isArray(editTransaction.materials) && editTransaction.materials.length > 0) {
        setMaterials(
          editTransaction.materials.map((m) => ({
            name: m.materialName || m.name || '',
            qty: String(m.quantity || m.qty || 1),
            price: String(m.price || m.rate || 0),
            unit: m.unit || 'Nos',
          }))
        );
      }
      if (editTransaction.managementApprover) {
        const mId =
          typeof editTransaction.managementApprover === 'object'
            ? editTransaction.managementApprover._id || editTransaction.managementApprover.id
            : editTransaction.managementApprover;
        if (mId) setSelectedMgt(String(mId));
      }
    }
  }, [editTransaction]);

  // Fetch Dynamic Approval Steps from Workflow Engine
  useEffect(() => {
    fetchRoutingUsers();
  }, []);

  const fetchRoutingUsers = async () => {
    try {
      setLoading(true);

      let currentDept = '';
      let directTLName = '';
      let foundTLId = null;
      let isMgrRule = false;

      // 1. Fetch Workflow Engine Context for active Approval Steps first
      let activeSteps = [];
      try {
        const wfRes = await materialApi.getWorkflowContext('new');
        activeSteps = (wfRes && wfRes.context && wfRes.context.approvalSteps) ? wfRes.context.approvalSteps : [];
        if (activeSteps.length > 0) {
          const s1 = activeSteps[0];
          if (s1 && (s1.approverRule === 'IMMEDIATE_MANAGER' || s1.approverRule === 'REPORTS_TO')) {
            isMgrRule = true;
          }
        }
      } catch (_) {}
      setIsManagerStep1(isMgrRule);

      // 2. Fetch logged-in user profile & department / manager info
      try {
        const meRes = await api.get('/auth/me').catch(() => api.get('/employees/me'));
        const u = meRes.data?.user || meRes.data?.data || meRes.data;
        if (u) {
          currentDept = u.department || (typeof u.department === 'object' ? u.department?.name : '') || '';
          setUserDepartment(currentDept);

          // Direct reportsTo check (for Immediate Manager or direct supervisor)
          if (u.reportsTo) {
            if (typeof u.reportsTo === 'object' && (u.reportsTo.fullName || u.reportsTo.name)) {
              directTLName = u.reportsTo.fullName || u.reportsTo.name;
              foundTLId = u.reportsTo._id || u.reportsTo.id;
            } else if (typeof u.reportsTo === 'string' && u.reportsTo.length > 5) {
              foundTLId = u.reportsTo;
              try {
                const mgrRes = await api.get(`/employees/${u.reportsTo}`);
                const mgrData = mgrRes.data?.data || mgrRes.data?.employee || mgrRes.data;
                if (mgrData && (mgrData.fullName || mgrData.name)) {
                  directTLName = mgrData.fullName || mgrData.name;
                }
              } catch (_) {}
            }
          }

          if (!directTLName && u.approver) {
            if (typeof u.approver === 'object' && (u.approver.fullName || u.approver.name)) {
              directTLName = u.approver.fullName || u.approver.name;
              foundTLId = u.approver._id || u.approver.id;
            } else if (typeof u.approver === 'string' && u.approver.length > 5) {
              foundTLId = u.approver;
              try {
                const mgrRes = await api.get(`/employees/${u.approver}`);
                const mgrData = mgrRes.data?.data || mgrRes.data?.employee || mgrRes.data;
                if (mgrData && (mgrData.fullName || mgrData.name)) {
                  directTLName = mgrData.fullName || mgrData.name;
                }
              } catch (_) {}
            }
          }
        }
      } catch (_) {}

      // 3. Fallback to candidate resolved in workflow context for Step 1 if available
      if (!directTLName && activeSteps.length > 0 && activeSteps[0].candidates && activeSteps[0].candidates.length > 0) {
        const cand = activeSteps[0].candidates[0];
        if (cand && (cand.name || cand.label)) {
          directTLName = cand.name || cand.label;
          foundTLId = cand.id || cand._id;
        }
      }

      // 4. If Step 1 is ROLE (Team Lead) and not direct manager, look up Team Lead specifically in user's department
      if (!isMgrRule && !directTLName && currentDept) {
        try {
          const deptTLRes = await api.get(`/employees?department=${encodeURIComponent(currentDept)}&allCompanies=true&limit=50`);
          const deptEmployees = deptTLRes.data?.data || deptTLRes.data?.employees || deptTLRes.data || [];
          if (Array.isArray(deptEmployees)) {
            const tlUser = deptEmployees.find(e => 
              (e.role && (e.role.toLowerCase() === 'team_lead' || e.role.toLowerCase() === 'tl')) ||
              (e.roleCode && /TL/i.test(e.roleCode)) ||
              (e.roleLevel === 7 || e.roleLevel === 8)
            );
            if (tlUser) {
              directTLName = tlUser.fullName || tlUser.name || '';
              foundTLId = tlUser._id || tlUser.id;
            }
          }
        } catch (_) {}
      }

      if (directTLName) {
        setTeamLeadName(directTLName);
        setHasTeamLead(true);
        setDeptTLId(foundTLId);
      } else {
        setTeamLeadName('');
        setHasTeamLead(false);
        setDeptTLId(null);
      }

      // 4. Setup workflow steps and selections
      let foundMgtCandidates = [];
      if (activeSteps.length > 0) {
        setWorkflowApprovalSteps(activeSteps);
        const initialSelections = {};

        activeSteps.forEach((step, idx) => {
          if (step.candidates && step.candidates.length > 0) {
            initialSelections[step.stepIndex] = step.candidates[0].id;
            if (idx === 1 || step.approverRule === 'MANAGEMENT_CATEGORY' || (step.stepName && step.stepName.toLowerCase().includes('management'))) {
              foundMgtCandidates = step.candidates;
            }
          }
        });

        setSelectedApproversByStep(initialSelections);

        if (foundMgtCandidates.length > 0) {
          setMgtApprovers(foundMgtCandidates);
          setSelectedMgt(foundMgtCandidates[0].id);
        } else if (activeSteps[1] && activeSteps[1].candidates && activeSteps[1].candidates.length > 0) {
          setMgtApprovers(activeSteps[1].candidates);
          setSelectedMgt(activeSteps[1].candidates[0].id);
        }
      }

      // 5. Fallback ONLY if no management candidates returned from workflow context
      if (foundMgtCandidates.length === 0) {
        try {
          const res = await api.get('/employees?role=management&limit=50').catch(() => api.get('/employees?category=MANAGEMENT&limit=50'));
          const list = res.data?.data || res.data?.employees || res.data || [];
          const formatted = Array.isArray(list) ? list.map(emp => ({
            id: emp._id || emp.id,
            label: `${emp.fullName || emp.name} (${emp.roleCode || emp.role || 'Management'})`,
          })) : [];

          if (formatted.length > 0) {
            setMgtApprovers(formatted);
            if (!selectedMgt) setSelectedMgt(formatted[0].id);
          }
        } catch (_) {}
      }
    } catch (err) {
      if (err.response?.status === 401) {
        Alert.alert('Session Expired', 'Please login again to create material requests.', [
          { text: 'OK', onPress: () => navigation.replace && navigation.replace('Login') }
        ]);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAddMaterial = () => {
    setMaterials([...materials, { name: '', qty: '1', price: '0', unit: 'Nos' }]);
  };

  const handleRemoveMaterial = (index) => {
    if (materials.length === 1) return;
    setMaterials(materials.filter((_, idx) => idx !== index));
  };

  const handleMaterialChange = (index, field, value) => {
    const updated = [...materials];
    updated[index][field] = value ?? '';
    setMaterials(updated);
  };

  const handleOpenTallyPicker = (index) => {
    setActiveItemIndex(index);
    setTallyModalVisible(true);
  };

  const handleTallySelected = (selected) => {
    const updated = [...materials];
    updated[activeItemIndex].name = selected.name || selected.materialName || '';
    updated[activeItemIndex].unit = selected.unit || 'Nos';
    updated[activeItemIndex].price = String(selected.price || selected.rate || 0);
    setMaterials(updated);
  };

  const handleSubmit = async () => {
    if (submitting || isSubmitted) return;
    if (!expectedReturnDate.trim()) {
      Alert.alert('Validation Error', 'Expected return date is required (YYYY-MM-DD).');
      return;
    }
    if (!selectedMgt) {
      Alert.alert('Validation Error', 'Management Approver is required.');
      return;
    }
    if (!description.trim()) {
      Alert.alert('Validation Error', 'Purpose of request is required.');
      return;
    }

    // Validate all materials
    for (let i = 0; i < materials.length; i++) {
      const mat = materials[i];
      if (!mat.name?.trim()) {
        Alert.alert('Validation Error', `Material Name is required for Row #${i + 1}`);
        return;
      }
      if (Number(mat.qty) <= 0) {
        Alert.alert('Validation Error', `Quantity must be greater than 0 for Row #${i + 1}`);
        return;
      }
    }

    try {
      setSubmitting(true);
      const step1Approver = deptTLId || (hasTeamLead ? (workflowApprovalSteps[0] && selectedApproversByStep[workflowApprovalSteps[0].stepIndex]) : null);
      const step2Approver = selectedMgt || (workflowApprovalSteps[1] && selectedApproversByStep[workflowApprovalSteps[1].stepIndex]) || null;

      const payload = {
        isSimplified: true,
        expectedReturnDate: expectedReturnDate.trim(),
        dueDate: expectedReturnDate.trim(),
        description: description.trim(),
        teamLeadId: step1Approver,
        managementApproverId: step2Approver,
        selectedApproversByStep: {
          ...selectedApproversByStep,
          1: step1Approver,
          2: selectedMgt
        },
        materials: materials.map(m => ({
          name: m.name.trim(),
          materialName: m.name.trim(),
          quantity: Number(m.qty) || 1,
          unit: m.unit || 'Nos',
          price: Number(m.price) || 0,
          rate: Number(m.price) || 0,
          barcodes: [],
        })),
        documentType: 'RDC',
      };

      if (isEditMode) {
        const editId = editTransaction._id || editTransaction.id || editTransaction.transactionId;
        const res = await materialApi.updateTransaction(editId, payload);
        if (res && (res.success || res._id || res.transactionId || res.transaction || (res.message && res.message.includes('successfully')))) {
          setIsSubmitted(true);
          // Reset form state so back button never reveals stale form
          setDescription('');
          setExpectedReturnDate('');
          setMaterials([{ name: '', qty: '1', price: '0', unit: 'Nos' }]);

          const successMsg = `Material Request #${editTransaction.transactionId || ''} updated and resubmitted successfully!`;
          if (Platform.OS === 'web') {
            if (typeof window !== 'undefined' && window.alert) {
              window.alert(successMsg);
            }
            navigation.replace('MaterialListScreen', { tab: 'all' });
          } else {
            Alert.alert(
              'Success',
              successMsg,
              [{ text: 'OK', onPress: () => navigation.replace('MaterialListScreen', { tab: 'all' }) }],
              { cancelable: false }
            );
          }
        } else {
          const errMsg = res?.message || 'Failed to update transaction request.';
          if (Platform.OS === 'web' && typeof window !== 'undefined' && window.alert) {
            window.alert(`Error: ${errMsg}`);
          } else {
            Alert.alert('Error', errMsg);
          }
        }
      } else {
        const res = await materialApi.createTransaction(payload);
        if (res && (res.success || res._id || res.transactionId || res.transaction || (res.message && res.message.includes('successfully')))) {
          setIsSubmitted(true);
          // Reset form state so back button never reveals stale form
          setDescription('');
          setExpectedReturnDate('');
          setMaterials([{ name: '', qty: '1', price: '0', unit: 'Nos' }]);

          const createdId = res.transaction?.transactionId || res.data?.transactionId || res.transactionId || '';
          const successMsg = `Material Request ${createdId ? '#' + createdId + ' ' : ''}created successfully!`;

          if (Platform.OS === 'web') {
            if (typeof window !== 'undefined' && window.alert) {
              window.alert(successMsg);
            }
            navigation.replace('MaterialListScreen', { tab: 'all' });
          } else {
            Alert.alert(
              'Success',
              successMsg,
              [{ text: 'OK', onPress: () => navigation.replace('MaterialListScreen', { tab: 'all' }) }],
              { cancelable: false }
            );
          }
        } else {
          const errMsg = res?.message || 'Failed to submit transaction request.';
          if (Platform.OS === 'web' && typeof window !== 'undefined' && window.alert) {
            window.alert(`Error: ${errMsg}`);
          } else {
            Alert.alert('Error', errMsg);
          }
        }
      }
    } catch (err) {
      const errMsg = err.response?.data?.message || err.message || 'Submission failed.';
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.alert) {
        window.alert(`Error: ${errMsg}`);
      } else {
        Alert.alert('Error', errMsg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const isSameApprover = !!(deptTLId && selectedMgt && String(deptTLId) === String(selectedMgt));

  return (
    <SafeAreaView style={styles.container}>
      <MaterialHeader
        title={isEditMode ? 'Edit Material Request' : 'Create Material Request'}
        subtitle={
          isEditMode
            ? `Edit #${editTransaction.transactionId || ''} before manager approval`
            : 'Sourcing and logistics transfer request with barcode loops'
        }
        navigation={navigation}
      />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Expected Return Date Picker Trigger */}
        <Text style={styles.label}>EXPECTED RETURN DATE *</Text>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setDatePickerVisible(true)}
          style={styles.inputBox}
        >
          <Calendar size={18} color="#4f46e5" />
          <Text style={[styles.input, { textAlignVertical: 'center', paddingTop: 10 }, !expectedReturnDate && { color: '#94a3b8' }]}>
            {expectedReturnDate ? expectedReturnDate : 'Tap to select return date...'}
          </Text>
        </TouchableOpacity>

        {/* Step 1: Immediate Manager vs Department Team Lead (Auto Assigned) */}
        <View style={{ marginBottom: 12 }}>
          <Text style={styles.label}>
            {isManagerStep1 ? 'STEP 1: IMMEDIATE MANAGER APPROVAL *' : 'STEP 1: DEPARTMENT TEAM LEAD APPROVAL *'}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: '#eef2ff', borderColor: '#c7d2fe', borderWidth: 1, borderRadius: 12 }}>
            <UserCheck size={20} color="#4f46e5" />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#312e81' }}>
                {isManagerStep1
                  ? (hasTeamLead ? `Immediate Manager: ${teamLeadName}` : 'No Immediate Manager Assigned')
                  : (hasTeamLead
                      ? `Team Leader: ${teamLeadName}${userDepartment ? ` (${userDepartment})` : ''}`
                      : (userDepartment ? `No Team Lead in ${userDepartment}` : 'Auto-Assigned Department Team Lead'))}
              </Text>
              <Text style={{ fontSize: 11, color: '#4338ca', marginTop: 2 }}>
                {hasTeamLead
                  ? (isSameApprover
                      ? 'Approver matches Management: Step 1 auto-merges into single Management Approval.'
                      : (isManagerStep1
                          ? 'Auto-routed to your reporting manager upon request creation.'
                          : 'Auto-routed to your department Team Leader upon request creation.'))
                  : (isManagerStep1
                      ? 'No reporting manager assigned. Request will auto-route to Management Approval.'
                      : `No Team Leader assigned to ${userDepartment || 'your department'}. Request will auto-route to Management Approval.`)}
              </Text>
            </View>
          </View>
        </View>

        {/* Step 2: Management Approver Selection Only */}
        <View style={{ marginBottom: 12 }}>
          <Text style={styles.label}>STEP 2: CHOOSE MANAGEMENT APPROVER *</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
            {mgtApprovers.map((emp) => {
              const isSelected = selectedMgt === emp.id;
              return (
                <TouchableOpacity
                  key={emp.id}
                  style={[styles.approverChip, isSelected && styles.approverChipActive]}
                  onPress={() => {
                    setSelectedMgt(emp.id);
                    setSelectedApproversByStep(prev => ({ ...prev, 2: emp.id }));
                  }}
                >
                  <UserCheck size={16} color={isSelected ? '#ffffff' : '#64748b'} />
                  <Text style={[styles.approverChipText, isSelected && styles.approverChipTextActive]}>
                    {emp.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Purpose / Description */}
        <Text style={styles.label}>PURPOSE / DESCRIPTION *</Text>
        <View style={styles.textAreaBox}>
          <TextInput
            style={styles.textAreaInput}
            placeholder="Purpose of request..."
            placeholderTextColor="#94a3b8"
            multiline
            numberOfLines={3}
            value={description}
            onChangeText={setDescription}
          />
        </View>

        {/* Materials List */}
        <View style={styles.materialsHeader}>
          <Text style={styles.label}>MATERIALS NEEDED *</Text>
          <TouchableOpacity onPress={handleAddMaterial} style={styles.addBtn}>
            <Plus size={16} color="#4f46e5" />
            <Text style={styles.addBtnText}>Add Row</Text>
          </TouchableOpacity>
        </View>

        {materials.map((mat, idx) => (
          <View key={idx} style={styles.itemCard}>
            <View style={styles.itemRowHeader}>
              <Text style={styles.itemIndexText}>{idx + 1}. Material Name</Text>
              {materials.length > 1 && (
                <TouchableOpacity onPress={() => handleRemoveMaterial(idx)} style={styles.trashBtn}>
                  <Trash2 size={16} color="#ef4444" />
                </TouchableOpacity>
              )}
            </View>

            {/* Tally Selector Trigger */}
            <TouchableOpacity
              onPress={() => handleOpenTallyPicker(idx)}
              style={styles.tallyPickerBtn}
            >
              <Database size={16} color="#4f46e5" />
              <Text style={styles.tallyPickerText} numberOfLines={1}>
                {mat.name ? mat.name : 'Search Tally inventory...'}
              </Text>
            </TouchableOpacity>

            <View style={styles.qtyRow}>
              <View style={styles.inputCol}>
                <Text style={styles.fieldLabel}>Qty *</Text>
                <TextInput
                  style={styles.itemInput}
                  placeholder="1"
                  placeholderTextColor="#94a3b8"
                  keyboardType="numeric"
                  value={String(mat.qty)}
                  onChangeText={(val) => handleMaterialChange(idx, 'qty', val)}
                />
              </View>

              <View style={styles.inputCol}>
                <Text style={styles.fieldLabel}>Unit</Text>
                <TextInput
                  style={[styles.itemInput, styles.disabledInput]}
                  placeholder="Nos"
                  placeholderTextColor="#94a3b8"
                  value={mat.unit}
                  editable={false}
                />
              </View>

              <View style={styles.inputCol}>
                <Text style={styles.fieldLabel}>Est. Price (₹)</Text>
                <TextInput
                  style={[styles.itemInput, styles.disabledInput]}
                  placeholder="0"
                  placeholderTextColor="#94a3b8"
                  value={String(mat.price)}
                  editable={false}
                />
              </View>
            </View>
          </View>
        ))}

        {/* Submit */}
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={submitting || isSubmitted}
          style={[styles.submitBtn, (submitting || isSubmitted) && { opacity: 0.6 }]}
        >
          {submitting ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <>
              <Send size={18} color="#ffffff" />
              <Text style={styles.submitBtnText}>
                {isEditMode ? 'Update & Resubmit Request' : 'Create Material Request'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Tally Stock Inventory Modal */}
      <TallyMaterialSelectModal
        visible={tallyModalVisible}
        onClose={() => setTallyModalVisible(false)}
        onSelect={handleTallySelected}
      />

      <DatePickerModal
        visible={datePickerVisible}
        onClose={() => setDatePickerVisible(false)}
        onSelectDate={(dateStr) => setExpectedReturnDate(dateStr)}
        initialDate={expectedReturnDate}
      />

      {/* Material Module Footer */}
      <MaterialModuleFooter navigation={navigation} currentScreen="create" />
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
  label: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#64748b',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 12,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 12,
    height: 48,
    gap: 8,
    marginBottom: 8,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: '#0f172a',
  },
  chipScroll: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  approverChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  approverChipActive: {
    backgroundColor: '#4f46e5',
    borderColor: '#4f46e5',
  },
  approverChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  approverChipTextActive: {
    color: '#ffffff',
  },
  textAreaBox: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    padding: 12,
    marginBottom: 8,
  },
  textAreaInput: {
    fontSize: 14,
    color: '#0f172a',
    minHeight: 64,
    textAlignVertical: 'top',
  },
  materialsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#4f46e5',
  },
  itemCard: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 10,
  },
  itemRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemIndexText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#334155',
  },
  trashBtn: {
    padding: 4,
  },
  tallyPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 46,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    gap: 8,
  },
  tallyPickerText: {
    flex: 1,
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  qtyRow: {
    flexDirection: 'row',
    gap: 8,
  },
  inputCol: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 4,
  },
  itemInput: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 10,
    height: 42,
    fontSize: 13,
    color: '#0f172a',
  },
  disabledInput: {
    backgroundColor: '#f8fafc',
    color: '#64748b',
  },
  submitBtn: {
    height: 52,
    backgroundColor: '#16a34a',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
    marginBottom: 30,
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default MaterialRequestScreen;
