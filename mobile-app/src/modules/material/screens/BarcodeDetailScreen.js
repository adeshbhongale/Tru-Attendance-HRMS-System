import {
  ArrowRightLeft,
  CheckCircle,
  ChevronRight,
  FileText,
  Layers,
  QrCode,
  RefreshCw,
  RotateCcw,
  Scissors,
  User,
  X
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import materialApi from '../api/materialApi';
import MaterialHeader from '../components/MaterialHeader';
import MaterialModuleFooter from '../components/MaterialModuleFooter';
import StatusBadge from '../components/StatusBadge';

const getCleanUserRemarks = (str) => {
  if (!str) return 'N/A';
  let clean = str;
  if (clean.startsWith('Remarks: ')) {
    clean = clean.replace('Remarks: ', '');
  }
  const attachmentIdx = clean.indexOf(' | Attachment:');
  if (attachmentIdx !== -1) {
    clean = clean.substring(0, attachmentIdx);
  }
  return clean.trim();
};

const BarcodeDetailScreen = ({ route, navigation }) => {
  const { barcode } = route.params;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [actionLoading, setActionLoading] = useState(false);

  // Action Modals State
  const [splitModalVisible, setSplitModalVisible] = useState(false);
  const [splitLength, setSplitLength] = useState('');

  const fetchBarcodeDetails = async () => {
    try {
      setLoading(true);
      const res = await materialApi.getBarcodeDetails(barcode);
      if (res) {
        setData(res.data || res);
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to load barcode details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBarcodeDetails();
  }, [barcode]);

  if (loading || !data) {
    return (
      <SafeAreaView style={styles.container}>
        <MaterialHeader title="Barcode Audit" navigation={navigation} />
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#2563eb" />
        </View>
      </SafeAreaView>
    );
  }

  // Extract nested properties matching BarcodeDetail.jsx
  const bc = data.barcode || (data.data && data.data.barcode) || data;
  const transfers = data.transfers || [];
  const returns = data.returns || [];
  const splits = data.splits || [];
  const exchanges = data.exchanges || [];

  // Helper to extract clean user name and avoid ObjectIds or raw ID strings
  const getCleanName = (userObj, fallbackTxn) => {
    let name = '';
    if (userObj) {
      if (typeof userObj === 'object') {
        const uName = userObj.fullName || userObj.name || '';
        if (uName && uName.toLowerCase() !== 'store' && uName.toLowerCase() !== 'store warehouse' && !uName.match(/^[0-9a-fA-F]{24}$/)) {
          name = uName;
        }
      } else if (typeof userObj === 'string' && userObj.toLowerCase() !== 'store' && userObj.toLowerCase() !== 'store warehouse' && !userObj.match(/^[0-9a-fA-F]{24}$/)) {
        name = userObj;
      }
    }

    // If name is still empty, or is Store/Store Warehouse, or is ObjectId, AND fallbackTxn requester exists:
    if ((!name || name.toLowerCase() === 'store' || name.toLowerCase() === 'store warehouse' || name.match(/^[0-9a-fA-F]{24}$/)) && fallbackTxn && fallbackTxn.requester) {
      const req = fallbackTxn.requester;
      if (typeof req === 'object') {
        const reqName = req.fullName || req.name || '';
        if (reqName && !reqName.match(/^[0-9a-fA-F]{24}$/)) {
          name = reqName;
        }
      } else if (typeof req === 'string' && !req.match(/^[0-9a-fA-F]{24}$/)) {
        name = req;
      }
    }

    if (!name || name.match(/^[0-9a-fA-F]{24}$/)) {
      name = 'Store Warehouse';
    }

    return name;
  };

  const ownerName = getCleanName(bc.currentCustodian || bc.owner || bc.assignedTo, bc.transaction);

  // Extract owner department with full fallback chain
  let ownerDept = '';
  if (bc.currentDepartment && bc.currentDepartment.name) {
    ownerDept = bc.currentDepartment.name;
  } else if (bc.ownerDepartment && bc.ownerDepartment.name) {
    ownerDept = bc.ownerDepartment.name;
  } else if (bc.owner && typeof bc.owner === 'object' && bc.owner.department) {
    ownerDept = typeof bc.owner.department === 'object' ? bc.owner.department.name : bc.owner.department;
  } else if (bc.transaction && bc.transaction.department) {
    ownerDept = typeof bc.transaction.department === 'object' ? bc.transaction.department.name : bc.transaction.department;
  }

  if (!ownerDept) {
    ownerDept = 'Operations & Store';
  }

  const statusStr = (bc.status || 'Active').toUpperCase();
  const rawStatus = (bc.status || 'active').toString().toLowerCase();
  const rawTxnStatus = (bc.transaction && bc.transaction.status) ? bc.transaction.status.toString().toLowerCase() : '';
  const isBarcodeActive = ['active', 'issued', 'available', 'assigned'].includes(rawStatus) ||
    ['active', 'received', 'closed', 'completed'].includes(rawTxnStatus);

  // History timeline extraction matching BarcodeDetail.jsx
  const filteredHistory = (bc.history || []).filter((log) => {
    const actionLower = (log.action || '').toLowerCase();
    if (['exchanged', 'barcode exchanged', 'exchange requested'].includes(actionLower)) {
      return false;
    }
    return true;
  });

  const timelineHistory = [...filteredHistory];

  exchanges.forEach((ex) => {
    if (ex.status === 'pending') {
      timelineHistory.push({
        action: 'Barcode Exchange Requested',
        user: ex.requester,
        timestamp: ex.createdAt,
        remarks: getCleanUserRemarks(ex.warrantyReason),
      });
    }
    if (ex.status === 'approved') {
      timelineHistory.push({
        action: 'Barcode Exchange Completed',
        user: ex.approvedBy || { fullName: 'Store Admin' },
        timestamp: ex.approvedAt || ex.updatedAt,
        remarks: `Exchanged old ${ex.oldBarcode} for new ${ex.newBarcode || 'Replacement'} under warranty.`,
      });
    }
  });

  timelineHistory.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

  // Button Handlers
  const handleSplitReel = async () => {
    if (!splitLength || Number(splitLength) <= 0) {
      Alert.alert('Validation Error', 'Please enter a valid split length in meters.');
      return;
    }
    try {
      setActionLoading(true);
      const res = await materialApi.splitBarcode(bc.barcode, { splitQuantity: Number(splitLength) });
      if (res && res.success) {
        Alert.alert('Success', `Child Reel ${res.childBarcode || ''} created successfully!`);
        setSplitModalVisible(false);
        setSplitLength('');
        fetchBarcodeDetails();
      } else {
        Alert.alert('Error', (res && res.message) || 'Failed to split barcode reel.');
      }
    } catch (err) {
      const msg = (err.response && err.response.data && err.response.data.message) || err.message;
      Alert.alert('Error', msg);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <MaterialHeader
        title={bc.barcode || barcode}
        subtitle={bc.materialName || 'Serialized Inventory Unit'}
        navigation={navigation}
      />

      {/* Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'overview' && styles.tabItemActive]}
          onPress={() => setActiveTab('overview')}
        >
          <Text style={[styles.tabText, activeTab === 'overview' && styles.tabTextActive]}>
            Overview
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'history' && styles.tabItemActive]}
          onPress={() => setActiveTab('history')}
        >
          <Text style={[styles.tabText, activeTab === 'history' && styles.tabTextActive]}>
            Audit History ({timelineHistory.length})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {activeTab === 'overview' ? (
          <View>
            {/* Main Barcode Info Card */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.barcodeRow}>
                  <QrCode size={24} color="#2563eb" />
                  <Text style={styles.barcodeTitle}>{bc.barcode}</Text>
                </View>
                <StatusBadge status={bc.status} />
              </View>

              <Text style={styles.materialName}>{bc.materialName || 'Material Unit'}</Text>
              {bc.description ? <Text style={styles.descriptionText}>{bc.description}</Text> : null}

              <View style={styles.divider} />

              <View style={styles.infoGrid}>
                <View style={styles.infoRow}>
                  <User size={16} color="#64748b" />
                  <Text style={styles.infoLabel}>Current Owner:</Text>
                  <Text style={styles.infoValue}>
                    {ownerName}
                  </Text>
                </View>

                <View style={styles.infoRow}>
                  <Layers size={16} color="#64748b" />
                  <Text style={styles.infoLabel}>Department:</Text>
                  <Text style={styles.infoValue}>{ownerDept}</Text>
                </View>

                {bc.transactionId ? (
                  <TouchableOpacity
                    style={styles.infoRow}
                    onPress={() => navigation.navigate('MaterialDetailScreen', { id: bc.transactionId })}
                  >
                    <FileText size={16} color="#2563eb" />
                    <Text style={styles.infoLabel}>Transaction Voucher:</Text>
                    <Text style={[styles.infoValue, { color: '#2563eb', fontWeight: '700' }]}>
                      {bc.transactionId}
                    </Text>
                  </TouchableOpacity>
                ) : null}

                {bc.parentBarcode ? (
                  <View style={styles.infoRow}>
                    <Scissors size={16} color="#0284c7" />
                    <Text style={styles.infoLabel}>Parent Reel:</Text>
                    <Text style={[styles.infoValue, { color: '#0284c7', fontWeight: '700' }]}>
                      {bc.parentBarcode}
                    </Text>
                  </View>
                ) : null}

                {bc.quantity ? (
                  <View style={styles.infoRow}>
                    <Layers size={16} color="#64748b" />
                    <Text style={styles.infoLabel}>Reel Quantity / Length:</Text>
                    <Text style={styles.infoValue}>{bc.quantity} m</Text>
                  </View>
                ) : null}

                {/* View All Barcode Photos, Remarks & Attachments Button */}
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#2563eb',
                    paddingVertical: 12,
                    paddingHorizontal: 16,
                    borderRadius: 10,
                    marginTop: 14,
                    gap: 8,
                  }}
                  onPress={() => navigation.navigate('BarcodeViewAllScreen', { barcode: bc.barcode || barcode })}
                >
                  <FileText size={18} color="#ffffff" />
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#ffffff' }}>
                    View All Photos, Remarks & Attachments ➔
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Actions Panel connected to dedicated screens */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Available Barcode Actions</Text>

              {!isBarcodeActive && (
                <View style={{ backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#ffedd5', padding: 12, borderRadius: 8, marginBottom: 12 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#c2410c' }}>
                    Barcode Pending Acceptance ({String(bc.status || 'IN TRANSIT').toUpperCase()})
                  </Text>
                  <Text style={{ fontSize: 11, color: '#9a3412', marginTop: 2 }}>
                    This barcode is currently in-transit. Actions will unlock automatically once the receiver accepts the material via the Receiving Form.
                  </Text>
                </View>
              )}

              <View style={styles.actionGrid}>

                {/* 1. Transfer Material Screen */}
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' }]}
                  onPress={() => {
                    if (!isBarcodeActive) {
                      Alert.alert('Action Locked', 'Barcode is currently in-transit. Complete the Material Receiving Form to activate barcode actions.');
                      return;
                    }
                    navigation.navigate('TransferMaterialScreen', { barcode: bc.barcode });
                  }}
                >
                  <ArrowRightLeft size={20} color="#2563eb" />
                  <View style={styles.actionTextCol}>
                    <Text style={[styles.actionTitle, { color: '#1e40af' }]}>Transfer Material</Text>
                    <Text style={styles.actionSubText}>Transfer peer custody to staff member</Text>
                  </View>
                  <ChevronRight size={18} color="#2563eb" />
                </TouchableOpacity>

                {/* 2. Return Material Screen */}
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#fef2f2', borderColor: '#fca5a5' }]}
                  onPress={() => {
                    if (!isBarcodeActive) {
                      Alert.alert('Action Locked', 'Barcode is currently in-transit. Complete the Material Receiving Form to activate barcode actions.');
                      return;
                    }
                    navigation.navigate('ReturnMaterialScreen', { barcode: bc.barcode });
                  }}
                >
                  <RotateCcw size={20} color="#dc2626" />
                  <View style={styles.actionTextCol}>
                    <Text style={[styles.actionTitle, { color: '#991b1b' }]}>Return Material</Text>
                    <Text style={styles.actionSubText}>Return barcode item to central store</Text>
                  </View>
                  <ChevronRight size={18} color="#dc2626" />
                </TouchableOpacity>

                {/* 3. Exchange Barcode Screen */}
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#fffbeb', borderColor: '#fde68a' }]}
                  onPress={() => {
                    if (!isBarcodeActive) {
                      Alert.alert('Action Locked', 'Barcode is currently in-transit. Complete the Material Receiving Form to activate barcode actions.');
                      return;
                    }
                    navigation.navigate('ExchangeBarcodeScreen', { barcode: bc.barcode });
                  }}
                >
                  <RefreshCw size={20} color="#d97706" />
                  <View style={styles.actionTextCol}>
                    <Text style={[styles.actionTitle, { color: '#92400e' }]}>Exchange Barcode</Text>
                    <Text style={styles.actionSubText}>Replace defective item under warranty</Text>
                  </View>
                  <ChevronRight size={18} color="#d97706" />
                </TouchableOpacity>

                {/* 4. Split Material Screen */}
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#f3e8ff', borderColor: '#d8b4fe' }]}
                  onPress={() => {
                    if (!isBarcodeActive) {
                      Alert.alert('Action Locked', 'Barcode is currently in-transit. Complete the Material Receiving Form to activate barcode actions.');
                      return;
                    }
                    navigation.navigate('SplitMaterialScreen', { barcode: bc.barcode });
                  }}
                >
                  <Scissors size={20} color="#7c3aed" />
                  <View style={styles.actionTextCol}>
                    <Text style={[styles.actionTitle, { color: '#6b21a8' }]}>Split Material</Text>
                    <Text style={styles.actionSubText}>Divide parent barcode into child unit</Text>
                  </View>
                  <ChevronRight size={18} color="#7c3aed" />
                </TouchableOpacity>

                {/* 5. Convert Material Screen (RDC Closure) */}
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#f0fdf4', borderColor: '#86efac' }]}
                  onPress={() => {
                    if (!isBarcodeActive) {
                      Alert.alert('Action Locked', 'Barcode is currently in-transit. Complete the Material Receiving Form to activate barcode actions.');
                      return;
                    }
                    navigation.navigate('ConvertMaterialScreen', { barcode: bc.barcode });
                  }}
                >
                  <FileText size={20} color="#16a34a" />
                  <View style={styles.actionTextCol}>
                    <Text style={[styles.actionTitle, { color: '#166534' }]}>Convert to DC / Invoice</Text>
                    <Text style={styles.actionSubText}>RDC closure & voucher conversion</Text>
                  </View>
                  <ChevronRight size={18} color="#16a34a" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : (
          /* Audit History Tab matching BarcodeDetail.jsx */
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Lifecycle Audit Trail</Text>
            {timelineHistory.length === 0 ? (
              <Text style={styles.emptyText}>No historical logs recorded for this barcode.</Text>
            ) : (
              <View style={styles.timelineList}>
                {timelineHistory.map((item, index) => {
                  const dateStr = item.timestamp ? new Date(item.timestamp).toLocaleString() : '';
                  const uObj = item.user || {};
                  const userName = uObj.fullName || uObj.name || 'System';

                  return (
                    <View key={index} style={styles.timelineItem}>
                      <View style={styles.timelineIconDot}>
                        <CheckCircle size={14} color="#2563eb" />
                      </View>
                      <View style={styles.timelineContent}>
                        <Text style={styles.timelineAction}>{item.action}</Text>
                        <Text style={styles.timelineUser}>
                          By: {userName} • {dateStr}
                        </Text>
                        {item.remarks ? (
                          <Text style={styles.timelineRemarks}>"{item.remarks}"</Text>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Reel Split Modal */}
      <Modal visible={splitModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Reel Split Operation</Text>
              <TouchableOpacity onPress={() => setSplitModalVisible(false)}>
                <X size={20} color="#64748b" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubText}>
              Splitting Parent Reel: <Text style={{ fontWeight: '700' }}>{bc.barcode}</Text>
            </Text>

            <Text style={styles.fieldLabel}>Enter Cut Length (meters):</Text>
            <TextInput
              style={styles.modalInput}
              keyboardType="numeric"
              placeholder="e.g. 50"
              placeholderTextColor="#94a3b8"
              value={splitLength}
              onChangeText={setSplitLength}
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setSplitModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.confirmBtn}
                onPress={handleSplitReel}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.confirmBtnText}>Confirm Split</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <MaterialModuleFooter navigation={navigation} currentScreen="details" />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  tabItem: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabItemActive: {
    borderBottomColor: '#2563eb',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  tabTextActive: {
    color: '#2563eb',
    fontWeight: '700',
  },
  scrollContent: {
    padding: 16,
    gap: 14,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
    gap: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  barcodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  barcodeTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1e40af',
  },
  materialName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  descriptionText: {
    fontSize: 12,
    color: '#64748b',
  },
  divider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginVertical: 4,
  },
  infoGrid: {
    gap: 8,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  infoValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1e293b',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 4,
  },
  actionGrid: {
    gap: 10,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
  },
  actionTextCol: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  actionSubText: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  timelineList: {
    gap: 12,
    marginTop: 4,
  },
  timelineItem: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  timelineIconDot: {
    marginTop: 2,
  },
  timelineContent: {
    flex: 1,
    gap: 2,
  },
  timelineAction: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e293b',
  },
  timelineUser: {
    fontSize: 11,
    color: '#64748b',
  },
  timelineRemarks: {
    fontSize: 11,
    fontStyle: 'italic',
    color: '#475569',
    marginTop: 2,
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 13,
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
    borderRadius: 12,
    padding: 20,
    gap: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  modalSubText: {
    fontSize: 13,
    color: '#475569',
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    marginTop: 4,
  },
  modalInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#0f172a',
  },
  modalBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 8,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  confirmBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#2563eb',
  },
  confirmBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
});

export default BarcodeDetailScreen;
