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

const MaterialRequestScreen = ({ navigation }) => {
  // Form State matching CreateTransactionPage.jsx web page
  const [expectedReturnDate, setExpectedReturnDate] = useState('');
  const [description, setDescription] = useState('');
  const [mgtApprovers, setMgtApprovers] = useState([]);
  const [selectedMgt, setSelectedMgt] = useState('');
  const [workflowApprovalSteps, setWorkflowApprovalSteps] = useState([]);
  const [selectedApproversByStep, setSelectedApproversByStep] = useState({});
  const [materials, setMaterials] = useState([
    { name: '', qty: '1', price: '0', unit: 'Nos' },
  ]);

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [tallyModalVisible, setTallyModalVisible] = useState(false);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [activeItemIndex, setActiveItemIndex] = useState(0);

  // Fetch Dynamic Approval Steps from Workflow Engine
  useEffect(() => {
    fetchRoutingUsers();
  }, []);

  const fetchRoutingUsers = async () => {
    try {
      setLoading(true);
      // Fetch Workflow Engine Context for active Approval Steps
      const wfRes = await materialApi.getWorkflowContext('new');
      const steps = (wfRes && wfRes.context && wfRes.context.approvalSteps) ? wfRes.context.approvalSteps : [];

      if (steps.length > 0) {
        setWorkflowApprovalSteps(steps);
        const initialSelections = {};
        steps.forEach(step => {
          if (step.candidates && step.candidates.length > 0) {
            initialSelections[step.stepIndex] = step.candidates[0].id;
          }
        });
        setSelectedApproversByStep(initialSelections);
        if (steps[0] && steps[0].candidates && steps[0].candidates.length > 0) {
          setSelectedMgt(steps[0].candidates[0].id);
        }
      } else {
        // Fallback if no custom steps returned
        const res = await api.get('/employees?role=department_admin&allDepartments=true&limit=100');
        const list = res.data?.data || res.data || [];
        const formatted = Array.isArray(list) ? list.map(emp => ({
          id: emp._id || emp.id,
          label: `${emp.fullName || emp.name} (${emp.roleCode || emp.role || 'Approver'})`,
        })) : [];

        setWorkflowApprovalSteps([
          {
            stepIndex: 1,
            stepName: 'Approver Sign-off',
            candidates: formatted
          }
        ]);
        if (formatted.length > 0) {
          setMgtApprovers(formatted);
          setSelectedMgt(formatted[0].id);
          setSelectedApproversByStep({ 1: formatted[0].id });
        }
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
      const step1Approver = (workflowApprovalSteps[0] && selectedApproversByStep[workflowApprovalSteps[0].stepIndex]) || selectedMgt;
      const step2Approver = (workflowApprovalSteps[1] && selectedApproversByStep[workflowApprovalSteps[1].stepIndex]) || step1Approver;

      const payload = {
        isSimplified: true,
        expectedReturnDate: expectedReturnDate.trim(),
        dueDate: expectedReturnDate.trim(),
        description: description.trim(),
        teamLeadId: step1Approver,
        managementApproverId: step2Approver,
        selectedApproversByStep,
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

      const res = await materialApi.createTransaction(payload);
      if (res && (res.success || res._id || res.transactionId || res.transaction || (res.message && res.message.includes('successfully')))) {
        const createdId = res.transaction?.transactionId || res.data?.transactionId || res.transactionId || '';
        const successMsg = `Material Request ${createdId ? '#' + createdId + ' ' : ''}created successfully!`;

        if (Platform.OS === 'web') {
          if (typeof window !== 'undefined' && window.alert) {
            window.alert(successMsg);
          }
          navigation.navigate('MaterialListScreen', { tab: 'all' });
        } else {
          Alert.alert('Success', successMsg, [
            { text: 'OK', onPress: () => navigation.navigate('MaterialListScreen', { tab: 'all' }) }
          ], { cancelable: false });
        }
      } else {
        const errMsg = res?.message || 'Failed to submit transaction request.';
        if (Platform.OS === 'web' && typeof window !== 'undefined' && window.alert) {
          window.alert(`Error: ${errMsg}`);
        } else {
          Alert.alert('Error', errMsg);
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

  return (
    <SafeAreaView style={styles.container}>
      <MaterialHeader
        title="Create Material Request"
        subtitle="Sourcing and logistics transfer request with barcode loops"
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

        {/* Dynamic Approval Steps rendered dynamically based on Super Admin Policy */}
        {workflowApprovalSteps.map((step, sIdx) => {
          const isTeamLeadStep = sIdx === 0 || step.targetLevelNumber === 8 || (step.stepName && step.stepName.toLowerCase().includes('team lead'));
          const candidateList = (step.candidates && step.candidates.length > 0) ? step.candidates : mgtApprovers;
          const selectedId = selectedApproversByStep[step.stepIndex] || (candidateList[0] && candidateList[0].id) || selectedMgt;

          return (
            <View key={step.stepIndex || sIdx} style={{ marginBottom: 12 }}>
              <Text style={styles.label}>
                {step.stepName ? step.stepName.toUpperCase() : `STEP ${sIdx + 1} APPROVAL`} *
              </Text>

              {isTeamLeadStep ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, backgroundColor: '#eef2ff', borderColor: '#c7d2fe', borderWidth: 1, borderRadius: 12 }}>
                  <UserCheck size={18} color="#4f46e5" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#312e81' }}>
                      Step 1: Department Team Lead Approval
                    </Text>
                    <Text style={{ fontSize: 11, color: '#4338ca', marginTop: 2 }}>
                      Auto-assigned if TL exists in your department. If no TL exists, request routes directly to Management Approval.
                    </Text>
                  </View>
                </View>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                  {candidateList.map((emp) => {
                    const isSelected = selectedId === emp.id;
                    return (
                      <TouchableOpacity
                        key={emp.id}
                        style={[styles.approverChip, isSelected && styles.approverChipActive]}
                        onPress={() => {
                          setSelectedApproversByStep(prev => ({ ...prev, [step.stepIndex]: emp.id }));
                          setSelectedMgt(emp.id);
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
              )}
            </View>
          );
        })}

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
          disabled={submitting}
          style={styles.submitBtn}
        >
          {submitting ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <>
              <Send size={18} color="#ffffff" />
              <Text style={styles.submitBtnText}>Create Material Request</Text>
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
