import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Package,
  User,
  Building,
  Calendar,
  CircleCheck,
  CircleX,
  Truck,
  Camera,
  RotateCcw,
  Layers,
  QrCode,
  GitMerge,
  ChevronRight,
  FileText,
  ShieldAlert,
  CheckSquare,
  Square,
  X,
  Send,
} from 'lucide-react-native';
import MaterialHeader from '../components/MaterialHeader';
import StatusBadge from '../components/StatusBadge';
import GeoCameraModal from '../components/GeoCameraModal';
import materialApi from '../api/materialApi';

const MaterialDetailScreen = ({ route, navigation }) => {
  const { id, initialTxn } = route.params || {};
  const [txn, setTxn] = useState(initialTxn || null);
  const [barcodes, setBarcodes] = useState([]);
  const [loading, setLoading] = useState(!initialTxn);
  const [actionLoading, setActionLoading] = useState(false);
  const [geoModalVisible, setGeoModalVisible] = useState(false);
  const [activeTab, setActiveTab] = useState('materials'); // 'materials' | 'timeline' | 'documents'

  // Return Multiple Material Modal States matching ReturnMultiple.jsx
  const [returnMultipleModalVisible, setReturnMultipleModalVisible] = useState(false);
  const [selectedBarcodesToReturn, setSelectedBarcodesToReturn] = useState([]);
  const [returnReason, setReturnReason] = useState('Job Completed');
  const [returnCondition, setReturnCondition] = useState('good');
  const [returnRemarks, setReturnRemarks] = useState('');
  const [returnMethod, setReturnMethod] = useState('direct'); // 'direct' | 'handler'
  const [handlersList, setHandlersList] = useState([]);
  const [selectedHandlerId, setSelectedHandlerId] = useState('');
  const [returnGeoPayload, setReturnGeoPayload] = useState(null);
  const [returnGeoCameraVisible, setReturnGeoCameraVisible] = useState(false);
  const [returnSubmitting, setReturnSubmitting] = useState(false);

  const fetchDetails = async () => {
    try {
      if (!txn) setLoading(true);
      const res = await materialApi.getTransactionById(id);
      if (res) {
        const txnData = res.data || res.transaction || res;
        setTxn(txnData);
        if (res.barcodes) {
          setBarcodes(res.barcodes);
        }
      }
    } catch (e) {
      console.warn('Failed loading updated transaction details:', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetails();
  }, [id]);

  const handleApprove = async () => {
    try {
      setActionLoading(true);
      const res = await materialApi.approveTransaction(id);
      if (res && res.success) {
        Alert.alert('Success', 'Transaction approved successfully!');
        fetchDetails();
      } else {
        Alert.alert('Error', res?.message || 'Approval failed.');
      }
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    try {
      setActionLoading(true);
      const res = await materialApi.rejectTransaction(id, 'Rejected from mobile app');
      if (res && res.success) {
        Alert.alert('Rejected', 'Transaction marked as rejected.');
        fetchDetails();
      }
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleGeoReceiptConfirm = async (geoData) => {
    try {
      setActionLoading(true);
      const res = await materialApi.receiveTransaction(id, {
        photoUrl: geoData.photoUrl,
        coordinates: geoData.coordinates,
        gps: geoData.gps,
      });

      if (res && res.success) {
        Alert.alert('Receipt Confirmed', 'Materials received into active inventory!');
        fetchDetails();
      }
    } catch (err) {
      Alert.alert('Receipt Error', err.response?.data?.message || err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenReturnMultipleModal = async () => {
    let availBarcodes = barcodes.map(b => typeof b === 'string' ? b : b.barcode).filter(Boolean);
    if (availBarcodes.length === 0 && txn?.materials) {
      txn.materials.forEach(m => {
        if (m.barcodes) {
          m.barcodes.forEach(b => {
            const bStr = typeof b === 'string' ? b : b.barcode;
            if (bStr && !availBarcodes.includes(bStr)) availBarcodes.push(bStr);
          });
        }
      });
    }

    if (availBarcodes.length === 0) {
      Alert.alert('No Barcodes', 'There are no active barcodes available to return for this transaction.');
      return;
    }

    setSelectedBarcodesToReturn([...availBarcodes]);
    setReturnReason('Job Completed');
    setReturnCondition('good');
    setReturnRemarks('');
    setReturnMethod('direct');
    setReturnGeoPayload(null);
    setReturnMultipleModalVisible(true);

    try {
      const uRes = await materialApi.getUsers();
      let uList = uRes?.data || uRes || [];
      if (!Array.isArray(uList)) uList = [];
      setHandlersList(uList);
      if (uList.length > 0) setSelectedHandlerId(uList[0]._id || uList[0].id);
    } catch (e) {
      console.warn('Failed loading handlers list:', e);
    }
  };

  const handleToggleBarcodeReturnSelect = (bCode) => {
    if (selectedBarcodesToReturn.includes(bCode)) {
      setSelectedBarcodesToReturn(selectedBarcodesToReturn.filter(b => b !== bCode));
    } else {
      setSelectedBarcodesToReturn([...selectedBarcodesToReturn, bCode]);
    }
  };

  const handleSelectAllReturnBarcodes = () => {
    let availBarcodes = barcodes.map(b => typeof b === 'string' ? b : b.barcode).filter(Boolean);
    if (availBarcodes.length === 0 && txn?.materials) {
      txn.materials.forEach(m => {
        if (m.barcodes) {
          m.barcodes.forEach(b => {
            const bStr = typeof b === 'string' ? b : b.barcode;
            if (bStr && !availBarcodes.includes(bStr)) availBarcodes.push(bStr);
          });
        }
      });
    }
    if (selectedBarcodesToReturn.length === availBarcodes.length) {
      setSelectedBarcodesToReturn([]);
    } else {
      setSelectedBarcodesToReturn([...availBarcodes]);
    }
  };

  const handleSubmitReturnMultiple = async () => {
    if (selectedBarcodesToReturn.length === 0) {
      Alert.alert('Validation Error', 'Please select at least 1 barcode to return.');
      return;
    }
    if (!returnRemarks.trim()) {
      Alert.alert('Validation Error', 'Please provide return remarks / details.');
      return;
    }
    if (returnMethod === 'handler' && !selectedHandlerId) {
      Alert.alert('Validation Error', 'Please select a sourcing handler.');
      return;
    }
    if (!returnGeoPayload) {
      Alert.alert('Validation Error', 'GeoCamera photo verification is mandatory before returning materials.');
      return;
    }

    try {
      setReturnSubmitting(true);
      const payload = {
        transactionId: txn.transactionId,
        barcodesToReturn: selectedBarcodesToReturn,
        reason: returnReason,
        condition: returnCondition,
        remarks: returnRemarks.trim(),
        returnMethod,
        handlerId: returnMethod === 'handler' ? selectedHandlerId : undefined,
        photoUrl: returnGeoPayload.photoUrl,
        coordinates: returnGeoPayload.coordinates,
        gps: returnGeoPayload.gps || returnGeoPayload.coordinates,
        photos: [{ url: returnGeoPayload.photoUrl, capturedAt: new Date().toISOString() }],
      };

      const res = await materialApi.returnMultipleBarcodes(payload);
      if (res && (res.success || res._id || res.message?.includes('success'))) {
        Alert.alert('Success', `Return request submitted for ${selectedBarcodesToReturn.length} barcode(s)!`);
        setReturnMultipleModalVisible(false);
        fetchDetails();
      } else {
        Alert.alert('Error', res?.message || 'Failed to submit return request.');
      }
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || err.message);
    } finally {
      setReturnSubmitting(false);
    }
  };

  if (loading && !txn) {
    return (
      <SafeAreaView style={styles.container}>
        <MaterialHeader title="Request Details" navigation={navigation} />
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#2563eb" />
        </View>
      </SafeAreaView>
    );
  }

  const requesterName = txn.requester?.fullName || txn.requester?.name || 'Staff User';
  const requesterEmpId = txn.requester?.employeeId || 'EMP';
  const deptName = txn.department?.name || 'General';

  return (
    <SafeAreaView style={styles.container}>
      <MaterialHeader
        title={txn.transactionId || 'Voucher Details'}
        subtitle={txn.documentType ? `${txn.documentType} Voucher Log` : 'Material Movement Log'}
        navigation={navigation}
      />

      {/* Detail Navigation Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'materials' && styles.tabItemActive]}
          onPress={() => setActiveTab('materials')}
        >
          <Text style={[styles.tabText, activeTab === 'materials' && styles.tabTextActive]}>
            Materials ({txn.materials?.length || 0})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'timeline' && styles.tabItemActive]}
          onPress={() => setActiveTab('timeline')}
        >
          <Text style={[styles.tabText, activeTab === 'timeline' && styles.tabTextActive]}>
            Timeline ({txn.timeline?.length || 0})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Voucher Metadata Header Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.txnIdRow}>
              <Text style={styles.docTypeBadge}>{txn.documentType || 'RDC'}</Text>
              <Text style={styles.txnIdText}>{txn.transactionId}</Text>
            </View>
            <StatusBadge status={txn.status} />
          </View>

          <View style={styles.divider} />

          <View style={styles.infoGrid}>
            <View style={styles.infoRow}>
              <User size={16} color="#64748b" />
              <Text style={styles.infoLabel}>Requester:</Text>
              <Text style={styles.infoVal}>
                {requesterName} ({requesterEmpId})
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Building size={16} color="#64748b" />
              <Text style={styles.infoLabel}>Department:</Text>
              <Text style={styles.infoVal}>{deptName}</Text>
            </View>

            <View style={styles.infoRow}>
              <Calendar size={16} color="#64748b" />
              <Text style={styles.infoLabel}>Created Date:</Text>
              <Text style={styles.infoVal}>
                {txn.createdAt ? new Date(txn.createdAt).toLocaleDateString() : 'N/A'}
              </Text>
            </View>

            {txn.dueDate ? (
              <View style={styles.infoRow}>
                <Calendar size={16} color="#64748b" />
                <Text style={styles.infoLabel}>Exp. Return Date:</Text>
                <Text style={[styles.infoVal, { color: '#2563eb', fontWeight: '700' }]}>
                  {new Date(txn.dueDate).toLocaleDateString()}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {activeTab === 'materials' ? (
          <>
            {/* Material Items Box with Serialized Barcodes matching TransactionDetailPage */}
            <Text style={styles.sectionTitle}>
              MATERIAL ITEMS ({txn.materials?.length || 0})
            </Text>

            <View style={styles.materialsList}>
              {txn.materials?.map((mat, idx) => {
                const matBarcodes = (barcodes.length > 0
                  ? barcodes.filter(
                      (b) =>
                        (b.materialName || '').toLowerCase() === (mat.name || mat.materialName || '').toLowerCase()
                    )
                  : mat.barcodes || []
                );

                return (
                  <View key={idx} style={styles.matCard}>
                    {/* Material Name & Qty */}
                    <View style={styles.matCardHeader}>
                      <View style={styles.matNameRow}>
                        <Package size={18} color="#2563eb" />
                        <Text style={styles.matTitle}>{mat.name || mat.materialName || `Item #${idx + 1}`}</Text>
                      </View>
                      <View style={styles.qtyBadge}>
                        <Text style={styles.qtyText}>
                          {mat.quantity || mat.qty || 1} {mat.unit || 'pcs'}
                        </Text>
                      </View>
                    </View>

                    {mat.description ? (
                      <Text style={styles.matDesc}>{mat.description}</Text>
                    ) : null}

                    {/* Serialized Barcodes Chips matching TransactionDetailPage.jsx */}
                    <View style={styles.barcodesContainer}>
                      <Text style={styles.barcodesLabel}>
                        Serialized Barcode Units ({matBarcodes.length}):
                      </Text>
                      {matBarcodes.length > 0 ? (
                        <View style={styles.barcodeChipsGrid}>
                          {matBarcodes.map((bItem, bIdx) => {
                            const bStr = typeof bItem === 'string' ? bItem : bItem.barcode;
                            return (
                              <TouchableOpacity
                                key={bIdx}
                                style={styles.barcodeChip}
                                onPress={() =>
                                  navigation.navigate('BarcodeDetailScreen', { barcode: bStr })
                                }
                              >
                                <QrCode size={13} color="#2563eb" />
                                <Text style={styles.barcodeChipText}>{bStr}</Text>
                                <ChevronRight size={12} color="#94a3b8" />
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      ) : (
                        <Text style={styles.noBarcodesText}>
                          Barcodes will be generated upon Store Dispatch.
                        </Text>
                      )}

                      {/* View All Details & Assets link for this material */}
                      {matBarcodes.length > 0 && (
                        <TouchableOpacity
                          style={styles.viewAllLink}
                          onPress={() =>
                            navigation.navigate('BarcodeViewAllScreen', {
                              barcode: typeof matBarcodes[0] === 'string' ? matBarcodes[0] : matBarcodes[0].barcode,
                            })
                          }
                        >
                          <Text style={styles.viewAllLinkText}>
                            View All Barcode Photos, Remarks & Attachments ➔
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
            {/* Merge Material Lot Button inside Transaction Detail Page matching user requirement */}
            {barcodes.length >= 2 && (
              <TouchableOpacity
                style={styles.mergeBtn}
                onPress={() =>
                  navigation.navigate('MergeMaterialScreen', {
                    transactionId: txn.transactionId,
                    availableBarcodes: barcodes,
                  })
                }
              >
                <GitMerge size={18} color="#ffffff" />
                <Text style={styles.mergeBtnText}>Merge Material Lots</Text>
              </TouchableOpacity>
            )}

            {/* Return Multiple Material Button */}
            <TouchableOpacity
              style={styles.returnMultipleBtn}
              onPress={handleOpenReturnMultipleModal}
            >
              <RotateCcw size={18} color="#ffffff" />
              <Text style={styles.returnMultipleBtnText}>Return Multiple Materials</Text>
            </TouchableOpacity>

            {/* Assign Delivery Handler Button */}
            <TouchableOpacity
              style={styles.assignHandlerBtn}
              onPress={() =>
                navigation.navigate('HandlerAssignmentScreen', {
                  id: txn.transactionId || txn._id,
                })
              }
            >
              <Truck size={18} color="#ffffff" />
              <Text style={styles.assignHandlerBtnText}>Assign Delivery Handler</Text>
            </TouchableOpacity>

            {/* Workflow Action Triggers */}
            {actionLoading ? (
              <ActivityIndicator size="large" color="#2563eb" style={{ marginVertical: 20 }} />
            ) : (
              <View style={styles.actionsContainer}>
                {['submitted', 'tl_approved'].includes(txn.status) && (
                  <View style={styles.btnRow}>
                    <TouchableOpacity onPress={handleApprove} style={styles.approveBtn}>
                      <CircleCheck size={18} color="#ffffff" />
                      <Text style={styles.btnText}>Approve Request</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleReject} style={styles.rejectBtn}>
                      <CircleX size={18} color="#ffffff" />
                      <Text style={styles.btnText}>Reject</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {txn.status === 'store_accepted' && (
                  <TouchableOpacity
                    onPress={() => navigation.navigate('StoreDispatchScreen', { id: txn._id })}
                    style={styles.dispatchBtn}
                  >
                    <Truck size={18} color="#ffffff" />
                    <Text style={styles.btnText}>Assign Handler & Dispatch</Text>
                  </TouchableOpacity>
                )}

                {txn.status === 'dispatched' && (
                  <TouchableOpacity
                    onPress={() => setGeoModalVisible(true)}
                    style={styles.receiveBtn}
                  >
                    <Camera size={18} color="#ffffff" />
                    <Text style={styles.btnText}>Confirm GeoPhoto Receipt</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </>
        ) : (
          /* Timeline Tab matching TransactionDetailPage.jsx */
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Transaction Timeline</Text>
            {txn.timeline?.length === 0 ? (
              <Text style={styles.noBarcodesText}>No timeline events logged.</Text>
            ) : (
              <View style={styles.timelineList}>
                {txn.timeline?.map((item, idx) => (
                  <View key={idx} style={styles.timelineItem}>
                    <View style={styles.timelineDot} />
                    <View style={styles.timelineContent}>
                      <Text style={styles.timelineAction}>{item.action}</Text>
                      <Text style={styles.timelineUser}>
                        {item.description || `Action by ${item.user?.fullName || 'User'}`}
                      </Text>
                      <Text style={styles.timelineDate}>
                        {item.timestamp ? new Date(item.timestamp).toLocaleString() : ''}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Geo Camera Modal for Receipt Verification */}
      <GeoCameraModal
        visible={geoModalVisible}
        onClose={() => setGeoModalVisible(false)}
        onConfirm={handleGeoReceiptConfirm}
      />

      {/* Return Multiple Materials Modal matching ReturnMultiple.jsx */}
      <Modal
        visible={returnMultipleModalVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setReturnMultipleModalVisible(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: '#f8fafc' }}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setReturnMultipleModalVisible(false)}>
              <X size={22} color="#0f172a" />
            </TouchableOpacity>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.modalTitle}>Return Multiple Materials</Text>
              <Text style={styles.modalSubtitle}>Txn: {txn.transactionId}</Text>
            </View>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
            {/* Barcode multi-select checklist */}
            <View style={styles.modalSectionCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={styles.modalSectionTitle}>
                  Select Barcodes ({selectedBarcodesToReturn.length}/{barcodes.length})
                </Text>
                <TouchableOpacity onPress={handleSelectAllReturnBarcodes}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#2563eb' }}>
                    {selectedBarcodesToReturn.length === barcodes.length ? 'Deselect All' : 'Select All'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={{ gap: 8, marginTop: 10 }}>
                {barcodes.map((item, bIdx) => {
                  const bStr = typeof item === 'string' ? item : item.barcode;
                  const isSel = selectedBarcodesToReturn.includes(bStr);
                  return (
                    <TouchableOpacity
                      key={bIdx}
                      style={[styles.barcodeReturnItem, isSel && styles.barcodeReturnItemSelected]}
                      onPress={() => handleToggleBarcodeReturnSelect(bStr)}
                    >
                      {isSel ? <CheckSquare size={18} color="#dc2626" /> : <Square size={18} color="#94a3b8" />}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.barcodeReturnText}>{bStr}</Text>
                        {item.materialName && <Text style={styles.barcodeReturnSub}>{item.materialName}</Text>}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Return details */}
            <View style={styles.modalSectionCard}>
              <Text style={styles.modalSectionTitle}>Return Details</Text>

              {/* Reason */}
              <Text style={styles.fieldLabel}>Return Reason *</Text>
              <View style={styles.pickerRow}>
                {['Job Completed', 'Defective/Damaged', 'Incorrect Material', 'Excess Stock'].map((rOption) => (
                  <TouchableOpacity
                    key={rOption}
                    style={[styles.pickerChip, returnReason === rOption && styles.pickerChipActive]}
                    onPress={() => setReturnReason(rOption)}
                  >
                    <Text style={[styles.pickerChipText, returnReason === rOption && styles.pickerChipTextActive]}>
                      {rOption}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Physical condition */}
              <Text style={styles.fieldLabel}>Physical Condition</Text>
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

              {/* Remarks */}
              <Text style={styles.fieldLabel}>Remarks / Return Reason Details *</Text>
              <TextInput
                style={styles.textArea}
                multiline
                numberOfLines={3}
                placeholder="Enter detailed reason for returning these materials..."
                placeholderTextColor="#94a3b8"
                value={returnRemarks}
                onChangeText={setReturnRemarks}
              />
            </View>

            {/* Handover Method */}
            <View style={styles.modalSectionCard}>
              <Text style={styles.modalSectionTitle}>Return Handover Method</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  style={[styles.methodCard, returnMethod === 'direct' && styles.methodCardActive]}
                  onPress={() => setReturnMethod('direct')}
                >
                  <Text style={[styles.methodTitle, returnMethod === 'direct' && styles.methodTitleActive]}>
                    Direct Store Handover
                  </Text>
                  <Text style={styles.methodSub}>Deliver directly to store</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.methodCard, returnMethod === 'handler' && styles.methodCardActive]}
                  onPress={() => setReturnMethod('handler')}
                >
                  <Text style={[styles.methodTitle, returnMethod === 'handler' && styles.methodTitleActive]}>
                    Assign Transporter
                  </Text>
                  <Text style={styles.methodSub}>Assign employee handler</Text>
                </TouchableOpacity>
              </View>

              {returnMethod === 'handler' && (
                <View style={{ marginTop: 10 }}>
                  <Text style={styles.fieldLabel}>Select Sourcing Handler *</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row', marginTop: 4 }}>
                    {handlersList.map((h) => {
                      const hId = h._id || h.id;
                      const isSel = selectedHandlerId === hId;
                      return (
                        <TouchableOpacity
                          key={hId}
                          style={[styles.handlerChip, isSel && styles.handlerChipActive]}
                          onPress={() => setSelectedHandlerId(hId)}
                        >
                          <User size={14} color={isSel ? '#ffffff' : '#64748b'} />
                          <Text style={[styles.handlerChipText, isSel && styles.handlerChipTextActive]}>
                            {h.fullName || h.name || h.employeeId}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}
            </View>

            {/* Photo verification button */}
            <View style={styles.modalSectionCard}>
              <Text style={styles.modalSectionTitle}>Mandatory GeoCamera Proof *</Text>
              <TouchableOpacity
                style={[styles.photoProofBtn, returnGeoPayload && styles.photoProofBtnSuccess]}
                onPress={() => setReturnGeoCameraVisible(true)}
              >
                <Camera size={18} color={returnGeoPayload ? '#ffffff' : '#dc2626'} />
                <Text style={[styles.photoProofBtnText, returnGeoPayload && { color: '#ffffff' }]}>
                  {returnGeoPayload ? 'GeoPhoto Verified ✓' : 'Capture Live GeoPhoto Evidence'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Submit */}
            {returnSubmitting ? (
              <ActivityIndicator size="large" color="#dc2626" style={{ marginVertical: 10 }} />
            ) : (
              <TouchableOpacity style={styles.submitReturnBtn} onPress={handleSubmitReturnMultiple}>
                <RotateCcw size={18} color="#ffffff" />
                <Text style={styles.submitReturnBtnText}>
                  Submit Return Request ({selectedBarcodesToReturn.length} items)
                </Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Return Multiple GeoCamera Modal */}
      <GeoCameraModal
        visible={returnGeoCameraVisible}
        onClose={() => setReturnGeoCameraVisible(false)}
        onConfirm={(gData) => {
          setReturnGeoPayload(gData);
          setReturnGeoCameraVisible(false);
          Alert.alert('Verified', 'Return photo evidence & GPS coordinates captured!');
        }}
      />
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
    gap: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  txnIdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  docTypeBadge: {
    fontSize: 10,
    fontWeight: '800',
    color: '#2563eb',
    backgroundColor: '#eff6ff',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  txnIdText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e40af',
  },
  divider: {
    height: 1,
    backgroundColor: '#f1f5f9',
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
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  infoVal: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e293b',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
    marginTop: 4,
  },
  materialsList: {
    gap: 12,
  },
  matCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 10,
  },
  matCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  matNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  matTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  qtyBadge: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  qtyText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563eb',
  },
  matDesc: {
    fontSize: 12,
    color: '#64748b',
  },
  barcodesContainer: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    gap: 8,
  },
  barcodesLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  barcodeChipsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  barcodeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    gap: 4,
  },
  barcodeChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1e40af',
  },
  noBarcodesText: {
    fontSize: 11,
    color: '#94a3b8',
    fontStyle: 'italic',
  },
  viewAllLink: {
    marginTop: 4,
  },
  viewAllLinkText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563eb',
  },
  mergeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#7c3aed',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
    marginTop: 6,
  },
  mergeBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
  returnMultipleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dc2626',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
    marginTop: 6,
  },
  returnMultipleBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
  actionsContainer: {
    marginTop: 6,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 12,
  },
  approveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16a34a',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  rejectBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dc2626',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  dispatchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  receiveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0284c7',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  btnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
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
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#2563eb',
    marginTop: 4,
  },
  timelineContent: {
    flex: 1,
    gap: 2,
  },
  timelineAction: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  timelineUser: {
    fontSize: 12,
    color: '#475569',
  },
  timelineDate: {
    fontSize: 10,
    color: '#94a3b8',
  },

  // Return Multiple Modal Styles
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  modalSubtitle: {
    fontSize: 11,
    color: '#64748b',
  },
  modalSectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 8,
  },
  modalSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e293b',
  },
  barcodeReturnItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 10,
    backgroundColor: '#ffffff',
  },
  barcodeReturnItemSelected: {
    borderColor: '#dc2626',
    backgroundColor: '#fef2f2',
  },
  barcodeReturnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  barcodeReturnSub: {
    fontSize: 11,
    color: '#64748b',
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    marginTop: 6,
  },
  pickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  pickerChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
  },
  pickerChipActive: {
    backgroundColor: '#dc2626',
    borderColor: '#dc2626',
  },
  pickerChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  pickerChipTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  textArea: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    padding: 10,
    fontSize: 12,
    color: '#0f172a',
    textAlignVertical: 'top',
  },
  methodCard: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
  },
  methodCardActive: {
    borderColor: '#dc2626',
    backgroundColor: '#fef2f2',
  },
  methodTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  methodTitleActive: {
    color: '#dc2626',
  },
  methodSub: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 2,
  },
  handlerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    marginRight: 6,
  },
  handlerChipActive: {
    backgroundColor: '#dc2626',
  },
  handlerChipText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
  handlerChipTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  photoProofBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
  },
  photoProofBtnSuccess: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
  },
  photoProofBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2563eb',
  },
  submitReturnBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#dc2626',
    paddingVertical: 14,
    borderRadius: 10,
    marginTop: 4,
    marginBottom: 20,
  },
  submitReturnBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
  assignHandlerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 8,
  },
  assignHandlerBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
});

export default MaterialDetailScreen;
