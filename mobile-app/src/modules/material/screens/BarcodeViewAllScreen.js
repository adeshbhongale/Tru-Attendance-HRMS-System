import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Camera,
  MessageSquare,
  Paperclip,
  Calendar,
  MapPin,
  User,
  QrCode,
  FileText,
  GitMerge,
  RotateCcw,
  RefreshCw,
  ArrowRightLeft,
  Receipt,
  FileSpreadsheet,
  Plus,
  Trash2,
  X,
  Send,
  Check,
} from 'lucide-react-native';
import MaterialHeader from '../components/MaterialHeader';
import GeoCameraModal from '../components/GeoCameraModal';
import materialApi from '../api/materialApi';

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

const BarcodeViewAllScreen = ({ route, navigation }) => {
  const barcode = route.params?.barcode || '';
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(route.params?.tab || 'photos'); // 'photos' | 'remarks' | 'attachments'

  // Master lists for employee handlers & tally customers
  const [employees, setEmployees] = useState([]);
  const [tallyCustomers, setTallyCustomers] = useState([]);

  // Common GeoCamera Modal states
  const [geoCameraVisible, setGeoCameraVisible] = useState(false);
  const [geoCameraTarget, setGeoCameraTarget] = useState(''); // 'split' | 'return' | 'exchange' | 'transfer' | 'invoice' | 'dc'
  const [capturedGeoPayloads, setCapturedGeoPayloads] = useState({});

  // 1. SPLIT MATERIAL STATE
  const [splitModalVisible, setSplitModalVisible] = useState(false);
  const [requestedMaterialName, setRequestedMaterialName] = useState('');
  const [extraSplits, setExtraSplits] = useState([]);
  const [splitReason, setSplitReason] = useState('');
  const [splitSubmitting, setSplitSubmitting] = useState(false);

  // 2. RETURN MATERIAL STATE
  const [returnModalVisible, setReturnModalVisible] = useState(false);
  const [returnReason, setReturnReason] = useState('Project Completed');
  const [returnCondition, setReturnCondition] = useState('good');
  const [returnRemarks, setReturnRemarks] = useState('');
  const [returnMethod, setReturnMethod] = useState('direct'); // 'direct' | 'handler'
  const [selectedReturnHandlerId, setSelectedReturnHandlerId] = useState('');
  const [returnSubmitting, setReturnSubmitting] = useState(false);

  // 3. EXCHANGE MATERIAL STATE
  const [exchangeModalVisible, setExchangeModalVisible] = useState(false);
  const [exchangeRemarks, setExchangeRemarks] = useState('');
  const [hasNewBarcode, setHasNewBarcode] = useState('no'); // 'yes' | 'no'
  const [exchangeNewBarcode, setExchangeNewBarcode] = useState('');
  const [exchangeSubmitting, setExchangeSubmitting] = useState(false);

  // 4. TRANSFER MATERIAL STATE
  const [transferModalVisible, setTransferModalVisible] = useState(false);
  const [transferToUserId, setTransferToUserId] = useState('');
  const [transferManagementApprover, setTransferManagementApprover] = useState('');
  const [transferRemarks, setTransferRemarks] = useState('');
  const [transferSubmitting, setTransferSubmitting] = useState(false);

  // 5. CONVERT TO INVOICE STATE
  const [convertInvoiceModalVisible, setConvertInvoiceModalVisible] = useState(false);
  const [invoiceManagementApprover, setInvoiceManagementApprover] = useState('');
  const [invoiceRemarks, setInvoiceRemarks] = useState('');
  const [invoiceSubmitting, setInvoiceSubmitting] = useState(false);

  // 6. CONVERT TO DC INTERNAL & FOC STATE
  const [convertDcModalVisible, setConvertDcModalVisible] = useState(false);
  const [dcDocType, setDcDocType] = useState('DC FOC'); // 'DC FOC' | 'DC Internal'
  const [dcManagementApprover, setDcManagementApprover] = useState('');
  const [dcCustomerName, setDcCustomerName] = useState('');
  const [dcRemarks, setDcRemarks] = useState('');
  const [dcSubmitting, setDcSubmitting] = useState(false);

  const fetchBarcodeDetails = async () => {
    try {
      setLoading(true);
      if (barcode) {
        const res = await materialApi.getBarcodeDetails(barcode);
        setData(res.data || res);
      } else {
        const res = await materialApi.getTransactions({ limit: 1 });
        const firstTxn = Array.isArray(res.data?.data) ? res.data.data[0] : null;
        if (firstTxn) setData(firstTxn);
      }
    } catch (e) {
      console.warn('Error loading view-all data:', e.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchMasterLists = async () => {
    try {
      const [uRes, cRes] = await Promise.all([
        materialApi.getUsers(),
        materialApi.getTallyCustomers(),
      ]);
      let uList = uRes?.data || uRes?.employees || uRes || [];
      if (!Array.isArray(uList)) uList = [];
      setEmployees(uList);
      if (uList.length > 0) {
        setSelectedReturnHandlerId(uList[0]._id || uList[0].id);
        setTransferToUserId(uList[0]._id || uList[0].id);
      }

      let cList = cRes?.customers || cRes?.data || cRes || [];
      if (!Array.isArray(cList)) cList = [];
      setTallyCustomers(cList);
      if (cList.length > 0) setDcCustomerName(cList[0]);
    } catch (e) {
      console.warn('Error fetching master lists:', e.message);
    }
  };

  useEffect(() => {
    fetchBarcodeDetails();
    fetchMasterLists();
  }, [barcode]);

  const openGeoCamera = (target) => {
    setGeoCameraTarget(target);
    setGeoCameraVisible(true);
  };

  // 1. Submit Split
  const handleSubmitSplit = async () => {
    if (!requestedMaterialName.trim()) {
      Alert.alert('Validation Error', 'Please enter requested material name.');
      return;
    }
    if (!splitReason.trim()) {
      Alert.alert('Validation Error', 'Please enter a reason or remark for the split.');
      return;
    }
    const photoPayload = capturedGeoPayloads['split'];
    if (!photoPayload) {
      Alert.alert('Validation Error', 'GeoCamera photo verification is required before sending split request.');
      return;
    }

    try {
      setSplitSubmitting(true);
      const payload = {
        barcode,
        reason: splitReason.trim(),
        requestedMaterialName: requestedMaterialName.trim(),
        batchId: `${barcode}-${Date.now()}`,
        gps: photoPayload.gps || photoPayload.coordinates,
        photos: [{ url: photoPayload.photoUrl, capturedAt: new Date().toISOString() }],
        extraSplits: extraSplits.map(item => ({ barcode, reason: splitReason.trim(), requestedMaterialName: item.name.trim() })),
      };

      const res = await materialApi.splitBarcode(payload);
      if (res && (res.success || res._id || res.message?.includes('success'))) {
        Alert.alert('Success', 'Split request submitted to store successfully!');
        setSplitModalVisible(false);
        fetchBarcodeDetails();
      } else {
        Alert.alert('Error', res?.message || 'Failed to submit split request.');
      }
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || err.message);
    } finally {
      setSplitSubmitting(false);
    }
  };

  // 2. Submit Return
  const handleSubmitReturn = async () => {
    if (!returnRemarks.trim()) {
      Alert.alert('Validation Error', 'Please enter remarks / return details.');
      return;
    }
    if (returnMethod === 'handler' && !selectedReturnHandlerId) {
      Alert.alert('Validation Error', 'Please select a sourcing handler.');
      return;
    }
    const photoPayload = capturedGeoPayloads['return'];
    if (!photoPayload) {
      Alert.alert('Validation Error', 'GeoCamera photo verification is mandatory before returning material.');
      return;
    }

    try {
      setReturnSubmitting(true);
      const payload = {
        barcode,
        reason: returnReason,
        condition: returnCondition,
        remarks: returnRemarks.trim(),
        returnHandler: returnMethod === 'handler' ? selectedReturnHandlerId : undefined,
        gps: photoPayload.gps || photoPayload.coordinates,
        photos: [{ url: photoPayload.photoUrl, capturedAt: new Date().toISOString() }],
      };

      const res = await materialApi.returnBarcode(payload);
      if (res && (res.success || res._id || res.message?.includes('success'))) {
        Alert.alert('Success', 'Return request sent to store successfully!');
        setReturnModalVisible(false);
        fetchBarcodeDetails();
      } else {
        Alert.alert('Error', res?.message || 'Failed to submit return request.');
      }
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || err.message);
    } finally {
      setReturnSubmitting(false);
    }
  };

  // 3. Submit Exchange
  const handleSubmitExchange = async () => {
    if (!exchangeRemarks.trim()) {
      Alert.alert('Validation Error', 'Please enter remarks / failure reason.');
      return;
    }
    if (hasNewBarcode === 'yes' && !exchangeNewBarcode.trim()) {
      Alert.alert('Validation Error', 'Please enter the new replacement barcode ID.');
      return;
    }
    const photoPayload = capturedGeoPayloads['exchange'];
    if (!photoPayload) {
      Alert.alert('Validation Error', 'GeoCamera photo verification is mandatory before submitting exchange.');
      return;
    }

    try {
      setExchangeSubmitting(true);
      const payload = {
        oldBarcode: barcode,
        warrantyReason: exchangeRemarks.trim(),
        newBarcode: hasNewBarcode === 'yes' ? exchangeNewBarcode.trim().toUpperCase() : undefined,
        gps: photoPayload.gps || photoPayload.coordinates,
        photos: [{ url: photoPayload.photoUrl, capturedAt: new Date().toISOString() }],
      };

      const res = await materialApi.exchangeBarcode(payload);
      if (res && (res.success || res._id || res.message?.includes('success'))) {
        Alert.alert('Success', 'Barcode exchange request submitted successfully!');
        setExchangeModalVisible(false);
        fetchBarcodeDetails();
      } else {
        Alert.alert('Error', res?.message || 'Failed to submit exchange request.');
      }
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || err.message);
    } finally {
      setExchangeSubmitting(false);
    }
  };

  // 4. Submit Transfer
  const handleSubmitTransfer = async () => {
    if (!transferToUserId) {
      Alert.alert('Validation Error', 'Please select a recipient employee.');
      return;
    }
    if (!transferRemarks.trim()) {
      Alert.alert('Validation Error', 'Please provide remarks / reason for transfer.');
      return;
    }
    const photoPayload = capturedGeoPayloads['transfer'];
    if (!photoPayload) {
      Alert.alert('Validation Error', 'GeoCamera live photo proof is required before sending transfer request.');
      return;
    }

    try {
      setTransferSubmitting(true);
      const payload = {
        barcode,
        toUserId: transferToUserId,
        managementApprover: transferManagementApprover || undefined,
        remarks: transferRemarks.trim(),
        gps: photoPayload.gps || photoPayload.coordinates,
        photos: [{ url: photoPayload.photoUrl, capturedAt: new Date().toISOString() }],
      };

      const res = await materialApi.transferBarcode(payload);
      if (res && (res.success || res._id || res.message?.includes('success'))) {
        Alert.alert('Success', 'Transfer request submitted successfully!');
        setTransferModalVisible(false);
        fetchBarcodeDetails();
      } else {
        Alert.alert('Error', res?.message || 'Failed to submit transfer request.');
      }
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || err.message);
    } finally {
      setTransferSubmitting(false);
    }
  };

  // 5. Submit Convert to Invoice
  const handleSubmitInvoice = async () => {
    if (!invoiceRemarks.trim()) {
      Alert.alert('Validation Error', 'Please enter remarks / reason for invoice conversion.');
      return;
    }
    const photoPayload = capturedGeoPayloads['invoice'];
    if (!photoPayload) {
      Alert.alert('Validation Error', 'GeoCamera photo verification is required before conversion.');
      return;
    }

    try {
      setInvoiceSubmitting(true);
      const payload = {
        barcode,
        documentType: 'Invoice',
        managementApprover: invoiceManagementApprover || undefined,
        remarks: invoiceRemarks.trim(),
        gps: photoPayload.gps || photoPayload.coordinates,
        photos: [{ url: photoPayload.photoUrl, capturedAt: new Date().toISOString() }],
      };

      const res = await materialApi.convertBarcode(payload);
      if (res && (res.success || res._id || res.message?.includes('success'))) {
        Alert.alert('Success', 'Barcode conversion to Invoice request submitted successfully!');
        setConvertInvoiceModalVisible(false);
        fetchBarcodeDetails();
      } else {
        Alert.alert('Error', res?.message || 'Failed to submit conversion request.');
      }
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || err.message);
    } finally {
      setInvoiceSubmitting(false);
    }
  };

  // 6. Submit Convert to DC (FOC / Internal)
  const handleSubmitDc = async () => {
    if (!dcRemarks.trim()) {
      Alert.alert('Validation Error', 'Please enter remarks / reason for DC conversion.');
      return;
    }
    if (dcDocType === 'DC FOC' && !dcCustomerName) {
      Alert.alert('Validation Error', 'Please select a Tally Customer for DC FOC.');
      return;
    }
    const photoPayload = capturedGeoPayloads['dc'];
    if (!photoPayload) {
      Alert.alert('Validation Error', 'GeoCamera photo verification is required before conversion.');
      return;
    }

    try {
      setDcSubmitting(true);
      const payload = {
        barcode,
        documentType: dcDocType,
        managementApprover: dcManagementApprover || undefined,
        customerName: dcDocType === 'DC FOC' ? dcCustomerName : undefined,
        remarks: dcRemarks.trim(),
        gps: photoPayload.gps || photoPayload.coordinates,
        photos: [{ url: photoPayload.photoUrl, capturedAt: new Date().toISOString() }],
      };

      const res = await materialApi.convertBarcode(payload);
      if (res && (res.success || res._id || res.message?.includes('success'))) {
        Alert.alert('Success', `Barcode conversion to ${dcDocType} request submitted successfully!`);
        setConvertDcModalVisible(false);
        fetchBarcodeDetails();
      } else {
        Alert.alert('Error', res?.message || 'Failed to submit conversion request.');
      }
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || err.message);
    } finally {
      setDcSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <MaterialHeader title="Barcode Asset Audit" navigation={navigation} />
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#2563eb" />
        </View>
      </SafeAreaView>
    );
  }

  const bc = data?.barcode || data?.data?.barcode || data || {};
  const exchanges = data?.exchanges || [];
  const merges = data?.merges || [];

  // Build timeline history matching BarcodeViewAll.jsx
  const filteredHistory = (bc?.history || []).filter((log) => {
    const actionLower = (log.action || '').toLowerCase();
    if (['exchanged', 'barcode exchanged', 'exchange requested'].includes(actionLower)) {
      return false;
    }
    return true;
  });

  const timelineHistory = [...filteredHistory];

  merges.forEach((mg) => {
    if (mg.reason && mg.reason.trim()) {
      timelineHistory.push({
        action: 'Barcode Merge Requested',
        user: mg.requester,
        timestamp: mg.createdAt,
        remarks: mg.reason.trim(),
      });
    }
  });

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

  // Extract Remarks matching BarcodeViewAll.jsx
  const remarksList = timelineHistory.filter((log) => log.remarks && log.remarks.trim());

  // Aggregate Photos matching BarcodeViewAll.jsx
  const allPhotos = [];
  const seenPhotoUrls = new Set();
  const addPhoto = (url, lat, lng, address, date, source) => {
    if (!url || typeof url !== 'string' || seenPhotoUrls.has(url)) return;
    seenPhotoUrls.add(url);
    allPhotos.push({
      url,
      lat: parseFloat(lat) || NaN,
      lng: parseFloat(lng) || NaN,
      address: address || bc?.gps?.address || 'Verified Location',
      date: date || bc?.createdAt || new Date().toISOString(),
      source,
    });
  };

  if (bc?.photos) {
    bc.photos.forEach((p) => {
      const url = typeof p === 'string' ? p : p.url;
      addPhoto(url, p.lat, p.lng, p.address, p.capturedAt || p.uploadedAt, 'Barcode Asset');
    });
  }

  if (bc?.history) {
    bc.history.forEach((log) => {
      if (log.photo) {
        addPhoto(log.photo, log.gps?.lat, log.gps?.lng, log.gps?.address, log.timestamp, `History (${log.action})`);
      }
      if (log.metadata && log.metadata.photo) {
        addPhoto(log.metadata.photo, log.gps?.lat, log.gps?.lng, log.gps?.address, log.timestamp, `History (${log.action})`);
      }
    });
  }

  // Aggregate Attachments matching BarcodeViewAll.jsx
  const allAttachments = [];
  const seenDocUrls = new Set();
  const addAttachment = (name, url, date, source) => {
    if (!url || typeof url !== 'string' || seenDocUrls.has(url)) return;
    seenDocUrls.add(url);
    allAttachments.push({
      name: name || url.split('/').pop() || 'Attachment',
      url,
      date: date || new Date().toISOString(),
      source,
    });
  };

  if (bc?.documents) {
    bc.documents.forEach((doc) => addAttachment(doc.name, doc.url, doc.uploadedAt, 'Barcode Document'));
  }
  if (bc?.transaction?.documents) {
    bc.transaction.documents.forEach((doc) => addAttachment(doc.name, doc.url, doc.uploadedAt, 'Transaction Document'));
  }

  return (
    <SafeAreaView style={styles.container}>
      <MaterialHeader
        title={bc.barcode ? `Audit: ${bc.barcode}` : 'Barcode Activity Collector'}
        subtitle={bc.materialName || 'Geo-Tagged Photos, Remarks & Attachments'}
        navigation={navigation}
      />

      {/* Horizontal Action Bar for Barcode Movement Operations */}
      <View style={styles.actionBarContainer}>
        <Text style={styles.actionBarTitle}>WORKFLOW ACTIONS FOR BARCODE: {barcode || 'SELECTED'}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.actionBarScroll}>
          {/* 1. Split */}
          <TouchableOpacity style={[styles.actionBtnChip, { backgroundColor: '#7c3aed' }]} onPress={() => setSplitModalVisible(true)}>
            <GitMerge size={14} color="#ffffff" />
            <Text style={styles.actionBtnText}>Split Material</Text>
          </TouchableOpacity>

          {/* 2. Return */}
          <TouchableOpacity style={[styles.actionBtnChip, { backgroundColor: '#dc2626' }]} onPress={() => setReturnModalVisible(true)}>
            <RotateCcw size={14} color="#ffffff" />
            <Text style={styles.actionBtnText}>Return Material</Text>
          </TouchableOpacity>

          {/* 3. Exchange */}
          <TouchableOpacity style={[styles.actionBtnChip, { backgroundColor: '#d97706' }]} onPress={() => setExchangeModalVisible(true)}>
            <RefreshCw size={14} color="#ffffff" />
            <Text style={styles.actionBtnText}>Exchange Barcode</Text>
          </TouchableOpacity>

          {/* 4. Transfer */}
          <TouchableOpacity style={[styles.actionBtnChip, { backgroundColor: '#2563eb' }]} onPress={() => setTransferModalVisible(true)}>
            <ArrowRightLeft size={14} color="#ffffff" />
            <Text style={styles.actionBtnText}>Transfer Material</Text>
          </TouchableOpacity>

          {/* 5. Convert to Invoice */}
          <TouchableOpacity style={[styles.actionBtnChip, { backgroundColor: '#16a34a' }]} onPress={() => setConvertInvoiceModalVisible(true)}>
            <Receipt size={14} color="#ffffff" />
            <Text style={styles.actionBtnText}>Convert to Invoice</Text>
          </TouchableOpacity>

          {/* 6. Convert to DC */}
          <TouchableOpacity style={[styles.actionBtnChip, { backgroundColor: '#4f46e5' }]} onPress={() => setConvertDcModalVisible(true)}>
            <FileSpreadsheet size={14} color="#ffffff" />
            <Text style={styles.actionBtnText}>Convert to DC (FOC/Internal)</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Tabs matching BarcodeViewAll.jsx */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'photos' && styles.tabItemActive]}
          onPress={() => setActiveTab('photos')}
        >
          <Camera size={16} color={activeTab === 'photos' ? '#2563eb' : '#64748b'} />
          <Text style={[styles.tabText, activeTab === 'photos' && styles.tabTextActive]}>
            Photos ({allPhotos.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'remarks' && styles.tabItemActive]}
          onPress={() => setActiveTab('remarks')}
        >
          <MessageSquare size={16} color={activeTab === 'remarks' ? '#2563eb' : '#64748b'} />
          <Text style={[styles.tabText, activeTab === 'remarks' && styles.tabTextActive]}>
            Remarks ({remarksList.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'attachments' && styles.tabItemActive]}
          onPress={() => setActiveTab('attachments')}
        >
          <Paperclip size={16} color={activeTab === 'attachments' ? '#2563eb' : '#64748b'} />
          <Text style={[styles.tabText, activeTab === 'attachments' && styles.tabTextActive]}>
            Files ({allAttachments.length})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* TAB 1: Geo Photos Grid */}
        {activeTab === 'photos' && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Geo-Tagged Photo Receipts & Audits</Text>
            {allPhotos.length === 0 ? (
              <View style={styles.emptyBox}>
                <Camera size={36} color="#94a3b8" />
                <Text style={styles.emptyText}>No photo records captured yet.</Text>
              </View>
            ) : (
              <View style={styles.photoGrid}>
                {allPhotos.map((item, idx) => (
                  <View key={idx} style={styles.photoCard}>
                    <Image source={{ uri: item.url }} style={styles.photoImg} />
                    <View style={styles.photoMetaBox}>
                      <Text style={styles.photoSourceText}>{item.source}</Text>
                      {item.address ? (
                        <View style={styles.locRow}>
                          <MapPin size={12} color="#2563eb" />
                          <Text style={styles.locText} numberOfLines={1}>
                            {item.address}
                          </Text>
                        </View>
                      ) : null}
                      <Text style={styles.photoDateText}>{new Date(item.date).toLocaleString()}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* TAB 2: Remarks Collector */}
        {activeTab === 'remarks' && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Process & Form Remarks Ledger</Text>
            {remarksList.length === 0 ? (
              <View style={styles.emptyBox}>
                <MessageSquare size={36} color="#94a3b8" />
                <Text style={styles.emptyText}>No remarks logged during workflow execution.</Text>
              </View>
            ) : (
              <View style={styles.remarksList}>
                {remarksList.map((item, idx) => (
                  <View key={idx} style={styles.remarkItem}>
                    <View style={styles.remarkHeader}>
                      <Text style={styles.remarkAction}>{item.action}</Text>
                      <Text style={styles.remarkDate}>{new Date(item.timestamp).toLocaleDateString()}</Text>
                    </View>
                    <Text style={styles.remarkUser}>
                      By: {item.user?.fullName || item.user?.name || 'System User'}
                    </Text>
                    <Text style={styles.remarkBody}>"{item.remarks}"</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* TAB 3: Attachments Collector */}
        {activeTab === 'attachments' && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Uploaded Documents & Vouchers</Text>
            {allAttachments.length === 0 ? (
              <View style={styles.emptyBox}>
                <Paperclip size={36} color="#94a3b8" />
                <Text style={styles.emptyText}>No attachment files uploaded.</Text>
              </View>
            ) : (
              <View style={styles.attachList}>
                {allAttachments.map((item, idx) => (
                  <View key={idx} style={styles.attachItem}>
                    <FileText size={20} color="#2563eb" />
                    <View style={styles.attachCol}>
                      <Text style={styles.attachName}>{item.name}</Text>
                      <Text style={styles.attachSub}>
                        {item.source} • {new Date(item.date).toLocaleDateString()}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* 1. SPLIT MATERIAL MODAL */}
      <Modal visible={splitModalVisible} animationType="slide" transparent={false} onRequestClose={() => setSplitModalVisible(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#f8fafc' }}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setSplitModalVisible(false)}>
              <X size={22} color="#0f172a" />
            </TouchableOpacity>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.modalTitle}>Request Material Split</Text>
              <Text style={styles.modalSubtitle}>Primary Barcode: {barcode}</Text>
            </View>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
            <View style={styles.modalCard}>
              <Text style={styles.cardHeaderTag}>Primary Split Material Name *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Requested Split Material Name..."
                placeholderTextColor="#94a3b8"
                value={requestedMaterialName}
                onChangeText={setRequestedMaterialName}
              />

              {extraSplits.map((item, idx) => (
                <View key={idx} style={styles.extraSplitBox}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#7c3aed' }}>Additional Split Item #{idx + 1}</Text>
                    <TouchableOpacity onPress={() => setExtraSplits(extraSplits.filter((_, i) => i !== idx))}>
                      <Trash2 size={16} color="#dc2626" />
                    </TouchableOpacity>
                  </View>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Extra Material Name..."
                    placeholderTextColor="#94a3b8"
                    value={item.name}
                    onChangeText={(val) => {
                      const updated = [...extraSplits];
                      updated[idx].name = val;
                      setExtraSplits(updated);
                    }}
                  />
                </View>
              ))}

              <TouchableOpacity style={styles.addSplitRowBtn} onPress={() => setExtraSplits([...extraSplits, { name: '' }])}>
                <Plus size={16} color="#2563eb" />
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#2563eb' }}>Add More Materials to Split</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalCard}>
              <Text style={styles.cardHeaderTag}>Remark / Reason for Split *</Text>
              <TextInput
                style={styles.textArea}
                multiline
                numberOfLines={3}
                placeholder="Reason for material split request..."
                placeholderTextColor="#94a3b8"
                value={splitReason}
                onChangeText={setSplitReason}
              />
            </View>

            <View style={styles.modalCard}>
              <Text style={styles.cardHeaderTag}>Mandatory Live Photo Proof *</Text>
              <TouchableOpacity
                style={[styles.photoProofBtn, capturedGeoPayloads['split'] && styles.photoProofBtnSuccess]}
                onPress={() => openGeoCamera('split')}
              >
                <Camera size={18} color={capturedGeoPayloads['split'] ? '#ffffff' : '#2563eb'} />
                <Text style={[styles.photoProofBtnText, capturedGeoPayloads['split'] && { color: '#ffffff' }]}>
                  {capturedGeoPayloads['split'] ? 'GeoPhoto Verified ✓' : 'Take Geo-Tagged Split Photo'}
                </Text>
              </TouchableOpacity>
            </View>

            {splitSubmitting ? (
              <ActivityIndicator size="large" color="#7c3aed" style={{ marginVertical: 10 }} />
            ) : (
              <TouchableOpacity style={[styles.modalSubmitBtn, { backgroundColor: '#7c3aed' }]} onPress={handleSubmitSplit}>
                <Send size={18} color="#ffffff" />
                <Text style={styles.modalSubmitBtnText}>Send Split Request(s)</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* 2. RETURN MATERIAL MODAL */}
      <Modal visible={returnModalVisible} animationType="slide" transparent={false} onRequestClose={() => setReturnModalVisible(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#f8fafc' }}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setReturnModalVisible(false)}>
              <X size={22} color="#0f172a" />
            </TouchableOpacity>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.modalTitle}>Return Material to Store</Text>
              <Text style={styles.modalSubtitle}>Barcode: {barcode}</Text>
            </View>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
            <View style={styles.modalCard}>
              <Text style={styles.cardHeaderTag}>Reason for Return *</Text>
              <View style={styles.pickerRow}>
                {['Project Completed', 'Damaged / Needs Repair', 'Defective Unit Replacement', 'Incorrect Specification Sourced'].map((rOpt) => (
                  <TouchableOpacity
                    key={rOpt}
                    style={[styles.pickerChip, returnReason === rOpt && styles.pickerChipActive]}
                    onPress={() => setReturnReason(rOpt)}
                  >
                    <Text style={[styles.pickerChipText, returnReason === rOpt && styles.pickerChipTextActive]}>{rOpt}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.cardHeaderTag, { marginTop: 10 }]}>Physical Condition</Text>
              <View style={styles.pickerRow}>
                {[
                  { label: 'Good / Functional', val: 'good' },
                  { label: 'Damaged', val: 'damaged' },
                  { label: 'Needs Repair', val: 'needs_repair' },
                  { label: 'Defective', val: 'defective' },
                ].map((cOpt) => (
                  <TouchableOpacity
                    key={cOpt.val}
                    style={[styles.pickerChip, returnCondition === cOpt.val && styles.pickerChipActive]}
                    onPress={() => setReturnCondition(cOpt.val)}
                  >
                    <Text style={[styles.pickerChipText, returnCondition === cOpt.val && styles.pickerChipTextActive]}>{cOpt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.cardHeaderTag, { marginTop: 10 }]}>Remarks / Details *</Text>
              <TextInput
                style={styles.textArea}
                multiline
                numberOfLines={3}
                placeholder="Detailed remarks for returning to store..."
                placeholderTextColor="#94a3b8"
                value={returnRemarks}
                onChangeText={setReturnRemarks}
              />
            </View>

            <View style={styles.modalCard}>
              <Text style={styles.cardHeaderTag}>Logistics Delivery Option</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  style={[styles.methodCard, returnMethod === 'direct' && styles.methodCardActive]}
                  onPress={() => setReturnMethod('direct')}
                >
                  <Text style={[styles.methodTitle, returnMethod === 'direct' && styles.methodTitleActive]}>Direct Return</Text>
                  <Text style={styles.methodSub}>Deliver directly to store warehouse</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.methodCard, returnMethod === 'handler' && styles.methodCardActive]}
                  onPress={() => setReturnMethod('handler')}
                >
                  <Text style={[styles.methodTitle, returnMethod === 'handler' && styles.methodTitleActive]}>Assign Handler</Text>
                  <Text style={styles.methodSub}>Assign transporter employee</Text>
                </TouchableOpacity>
              </View>

              {returnMethod === 'handler' && (
                <View style={{ marginTop: 10 }}>
                  <Text style={styles.cardHeaderTag}>Select Sourcing Handler *</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row', marginTop: 4 }}>
                    {employees.map((h) => {
                      const hId = h._id || h.id;
                      const isSel = selectedReturnHandlerId === hId;
                      return (
                        <TouchableOpacity
                          key={hId}
                          style={[styles.handlerChip, isSel && styles.handlerChipActive]}
                          onPress={() => setSelectedReturnHandlerId(hId)}
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

            <View style={styles.modalCard}>
              <Text style={styles.cardHeaderTag}>Mandatory GeoCamera Proof *</Text>
              <TouchableOpacity
                style={[styles.photoProofBtn, capturedGeoPayloads['return'] && styles.photoProofBtnSuccess]}
                onPress={() => openGeoCamera('return')}
              >
                <Camera size={18} color={capturedGeoPayloads['return'] ? '#ffffff' : '#dc2626'} />
                <Text style={[styles.photoProofBtnText, capturedGeoPayloads['return'] && { color: '#ffffff' }]}>
                  {capturedGeoPayloads['return'] ? 'GeoPhoto Verified ✓' : 'Take Geo-Tagged Return Photo'}
                </Text>
              </TouchableOpacity>
            </View>

            {returnSubmitting ? (
              <ActivityIndicator size="large" color="#dc2626" style={{ marginVertical: 10 }} />
            ) : (
              <TouchableOpacity style={[styles.modalSubmitBtn, { backgroundColor: '#dc2626' }]} onPress={handleSubmitReturn}>
                <RotateCcw size={18} color="#ffffff" />
                <Text style={styles.modalSubmitBtnText}>Send Return Request</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* 3. EXCHANGE MATERIAL MODAL */}
      <Modal visible={exchangeModalVisible} animationType="slide" transparent={false} onRequestClose={() => setExchangeModalVisible(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#f8fafc' }}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setExchangeModalVisible(false)}>
              <X size={22} color="#0f172a" />
            </TouchableOpacity>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.modalTitle}>Exchange Barcode Under Warranty</Text>
              <Text style={styles.modalSubtitle}>Old Barcode: {barcode}</Text>
            </View>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
            <View style={styles.modalCard}>
              <Text style={styles.cardHeaderTag}>Remarks / Failure Reason *</Text>
              <TextInput
                style={styles.textArea}
                multiline
                numberOfLines={3}
                placeholder="Describe warranty defect or failure reason..."
                placeholderTextColor="#94a3b8"
                value={exchangeRemarks}
                onChangeText={setExchangeRemarks}
              />
            </View>

            <View style={styles.modalCard}>
              <Text style={styles.cardHeaderTag}>Do you have the new replacement barcode ID?</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                <TouchableOpacity
                  style={[styles.toggleChoiceBtn, hasNewBarcode === 'yes' && styles.toggleChoiceBtnActive]}
                  onPress={() => setHasNewBarcode('yes')}
                >
                  <Text style={[styles.toggleChoiceBtnText, hasNewBarcode === 'yes' && styles.toggleChoiceBtnTextActive]}>Yes</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.toggleChoiceBtn, hasNewBarcode === 'no' && styles.toggleChoiceBtnActive]}
                  onPress={() => {
                    setHasNewBarcode('no');
                    setExchangeNewBarcode('');
                  }}
                >
                  <Text style={[styles.toggleChoiceBtnText, hasNewBarcode === 'no' && styles.toggleChoiceBtnTextActive]}>No (Store Assigns)</Text>
                </TouchableOpacity>
              </View>

              {hasNewBarcode === 'yes' && (
                <View style={{ marginTop: 10 }}>
                  <Text style={styles.cardHeaderTag}>New Barcode ID *</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Enter new barcode ID string..."
                    placeholderTextColor="#94a3b8"
                    value={exchangeNewBarcode}
                    onChangeText={setExchangeNewBarcode}
                    autoCapitalize="characters"
                  />
                </View>
              )}
            </View>

            <View style={styles.modalCard}>
              <Text style={styles.cardHeaderTag}>Exchange Verification Photo *</Text>
              <TouchableOpacity
                style={[styles.photoProofBtn, capturedGeoPayloads['exchange'] && styles.photoProofBtnSuccess]}
                onPress={() => openGeoCamera('exchange')}
              >
                <Camera size={18} color={capturedGeoPayloads['exchange'] ? '#ffffff' : '#d97706'} />
                <Text style={[styles.photoProofBtnText, capturedGeoPayloads['exchange'] && { color: '#ffffff' }]}>
                  {capturedGeoPayloads['exchange'] ? 'GeoPhoto Verified ✓' : 'Take Exchange Verification Photo'}
                </Text>
              </TouchableOpacity>
            </View>

            {exchangeSubmitting ? (
              <ActivityIndicator size="large" color="#d97706" style={{ marginVertical: 10 }} />
            ) : (
              <TouchableOpacity style={[styles.modalSubmitBtn, { backgroundColor: '#d97706' }]} onPress={handleSubmitExchange}>
                <RefreshCw size={18} color="#ffffff" />
                <Text style={styles.modalSubmitBtnText}>Submit Exchange</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* 4. TRANSFER MATERIAL MODAL */}
      <Modal visible={transferModalVisible} animationType="slide" transparent={false} onRequestClose={() => setTransferModalVisible(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#f8fafc' }}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setTransferModalVisible(false)}>
              <X size={22} color="#0f172a" />
            </TouchableOpacity>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.modalTitle}>Transfer Material to Employee</Text>
              <Text style={styles.modalSubtitle}>Barcode: {barcode}</Text>
            </View>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
            <View style={styles.modalCard}>
              <Text style={styles.cardHeaderTag}>Recipient Employee *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row', marginTop: 4 }}>
                {employees.map((e) => {
                  const eId = e._id || e.id;
                  const isSel = transferToUserId === eId;
                  return (
                    <TouchableOpacity
                      key={eId}
                      style={[styles.handlerChip, isSel && styles.handlerChipActive]}
                      onPress={() => setTransferToUserId(eId)}
                    >
                      <User size={14} color={isSel ? '#ffffff' : '#64748b'} />
                      <Text style={[styles.handlerChipText, isSel && styles.handlerChipTextActive]}>
                        {e.fullName || e.name} ({e.department?.name || 'Dept'})
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <Text style={[styles.cardHeaderTag, { marginTop: 12 }]}>Management Approver (If Cross-Dept)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row', marginTop: 4 }}>
                {employees.filter(emp => emp.role === 'department_admin').map((m) => {
                  const mId = m._id || m.id;
                  const isSel = transferManagementApprover === mId;
                  return (
                    <TouchableOpacity
                      key={mId}
                      style={[styles.handlerChip, isSel && styles.handlerChipActive]}
                      onPress={() => setTransferManagementApprover(mId)}
                    >
                      <User size={14} color={isSel ? '#ffffff' : '#64748b'} />
                      <Text style={[styles.handlerChipText, isSel && styles.handlerChipTextActive]}>
                        {m.fullName || m.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            <View style={styles.modalCard}>
              <Text style={styles.cardHeaderTag}>Remarks / Reason *</Text>
              <TextInput
                style={styles.textArea}
                multiline
                numberOfLines={3}
                placeholder="Reason for transferring material..."
                placeholderTextColor="#94a3b8"
                value={transferRemarks}
                onChangeText={setTransferRemarks}
              />
            </View>

            <View style={styles.modalCard}>
              <Text style={styles.cardHeaderTag}>Live Photo Proof *</Text>
              <TouchableOpacity
                style={[styles.photoProofBtn, capturedGeoPayloads['transfer'] && styles.photoProofBtnSuccess]}
                onPress={() => openGeoCamera('transfer')}
              >
                <Camera size={18} color={capturedGeoPayloads['transfer'] ? '#ffffff' : '#2563eb'} />
                <Text style={[styles.photoProofBtnText, capturedGeoPayloads['transfer'] && { color: '#ffffff' }]}>
                  {capturedGeoPayloads['transfer'] ? 'GeoPhoto Verified ✓' : 'Take Transfer Photo'}
                </Text>
              </TouchableOpacity>
            </View>

            {transferSubmitting ? (
              <ActivityIndicator size="large" color="#2563eb" style={{ marginVertical: 10 }} />
            ) : (
              <TouchableOpacity style={[styles.modalSubmitBtn, { backgroundColor: '#2563eb' }]} onPress={handleSubmitTransfer}>
                <ArrowRightLeft size={18} color="#ffffff" />
                <Text style={styles.modalSubmitBtnText}>Send Transfer Request</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* 5. CONVERT TO INVOICE MODAL */}
      <Modal visible={convertInvoiceModalVisible} animationType="slide" transparent={false} onRequestClose={() => setConvertInvoiceModalVisible(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#f8fafc' }}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setConvertInvoiceModalVisible(false)}>
              <X size={22} color="#0f172a" />
            </TouchableOpacity>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.modalTitle}>Convert Barcode to Invoice</Text>
              <Text style={styles.modalSubtitle}>Barcode: {barcode}</Text>
            </View>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
            <View style={styles.modalCard}>
              <Text style={styles.cardHeaderTag}>Target Document Type</Text>
              <TextInput style={[styles.textInput, { backgroundColor: '#f1f5f9', color: '#64748b' }]} value="Invoice" editable={false} />

              <Text style={[styles.cardHeaderTag, { marginTop: 10 }]}>Choose Management Approver</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row', marginTop: 4 }}>
                {employees.filter(emp => emp.role === 'department_admin').map((m) => {
                  const mId = m._id || m.id;
                  const isSel = invoiceManagementApprover === mId;
                  return (
                    <TouchableOpacity
                      key={mId}
                      style={[styles.handlerChip, isSel && styles.handlerChipActive]}
                      onPress={() => setInvoiceManagementApprover(mId)}
                    >
                      <User size={14} color={isSel ? '#ffffff' : '#64748b'} />
                      <Text style={[styles.handlerChipText, isSel && styles.handlerChipTextActive]}>
                        {m.fullName || m.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            <View style={styles.modalCard}>
              <Text style={styles.cardHeaderTag}>Conversion Remarks / Justification *</Text>
              <TextInput
                style={styles.textArea}
                multiline
                numberOfLines={3}
                placeholder="Provide justification for accounts invoice conversion..."
                placeholderTextColor="#94a3b8"
                value={invoiceRemarks}
                onChangeText={setInvoiceRemarks}
              />
            </View>

            <View style={styles.modalCard}>
              <Text style={styles.cardHeaderTag}>Live Verification Photo *</Text>
              <TouchableOpacity
                style={[styles.photoProofBtn, capturedGeoPayloads['invoice'] && styles.photoProofBtnSuccess]}
                onPress={() => openGeoCamera('invoice')}
              >
                <Camera size={18} color={capturedGeoPayloads['invoice'] ? '#ffffff' : '#16a34a'} />
                <Text style={[styles.photoProofBtnText, capturedGeoPayloads['invoice'] && { color: '#ffffff' }]}>
                  {capturedGeoPayloads['invoice'] ? 'GeoPhoto Verified ✓' : 'Take Invoice Verification Photo'}
                </Text>
              </TouchableOpacity>
            </View>

            {invoiceSubmitting ? (
              <ActivityIndicator size="large" color="#16a34a" style={{ marginVertical: 10 }} />
            ) : (
              <TouchableOpacity style={[styles.modalSubmitBtn, { backgroundColor: '#16a34a' }]} onPress={handleSubmitInvoice}>
                <Receipt size={18} color="#ffffff" />
                <Text style={styles.modalSubmitBtnText}>Convert to Invoice</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* 6. CONVERT TO DC (INTERNAL / FOC) MODAL */}
      <Modal visible={convertDcModalVisible} animationType="slide" transparent={false} onRequestClose={() => setConvertDcModalVisible(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#f8fafc' }}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setConvertDcModalVisible(false)}>
              <X size={22} color="#0f172a" />
            </TouchableOpacity>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.modalTitle}>Convert DC Delivery Challan</Text>
              <Text style={styles.modalSubtitle}>Barcode: {barcode}</Text>
            </View>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
            <View style={styles.modalCard}>
              <Text style={styles.cardHeaderTag}>Target Document Type *</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                <TouchableOpacity
                  style={[styles.toggleChoiceBtn, dcDocType === 'DC FOC' && styles.toggleChoiceBtnActive]}
                  onPress={() => setDcDocType('DC FOC')}
                >
                  <Text style={[styles.toggleChoiceBtnText, dcDocType === 'DC FOC' && styles.toggleChoiceBtnTextActive]}>DC FOC</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.toggleChoiceBtn, dcDocType === 'DC Internal' && styles.toggleChoiceBtnActive]}
                  onPress={() => setDcDocType('DC Internal')}
                >
                  <Text style={[styles.toggleChoiceBtnText, dcDocType === 'DC Internal' && styles.toggleChoiceBtnTextActive]}>DC Internal</Text>
                </TouchableOpacity>
              </View>

              {dcDocType === 'DC FOC' && (
                <>
                  <Text style={[styles.cardHeaderTag, { marginTop: 10 }]}>Management Approver *</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row', marginTop: 4 }}>
                    {employees.filter(emp => emp.role === 'department_admin').map((m) => {
                      const mId = m._id || m.id;
                      const isSel = dcManagementApprover === mId;
                      return (
                        <TouchableOpacity
                          key={mId}
                          style={[styles.handlerChip, isSel && styles.handlerChipActive]}
                          onPress={() => setDcManagementApprover(mId)}
                        >
                          <User size={14} color={isSel ? '#ffffff' : '#64748b'} />
                          <Text style={[styles.handlerChipText, isSel && styles.handlerChipTextActive]}>
                            {m.fullName || m.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  <Text style={[styles.cardHeaderTag, { marginTop: 10 }]}>Select Tally Customer *</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row', marginTop: 4 }}>
                    {tallyCustomers.map((cust, cIdx) => {
                      const isSel = dcCustomerName === cust;
                      return (
                        <TouchableOpacity
                          key={cIdx}
                          style={[styles.handlerChip, isSel && styles.handlerChipActive]}
                          onPress={() => setDcCustomerName(cust)}
                        >
                          <User size={14} color={isSel ? '#ffffff' : '#64748b'} />
                          <Text style={[styles.handlerChipText, isSel && styles.handlerChipTextActive]}>
                            {cust}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </>
              )}
            </View>

            <View style={styles.modalCard}>
              <Text style={styles.cardHeaderTag}>Conversion Remarks / Reason *</Text>
              <TextInput
                style={styles.textArea}
                multiline
                numberOfLines={3}
                placeholder="Migration reason details..."
                placeholderTextColor="#94a3b8"
                value={dcRemarks}
                onChangeText={setDcRemarks}
              />
            </View>

            <View style={styles.modalCard}>
              <Text style={styles.cardHeaderTag}>Live Verification Photo *</Text>
              <TouchableOpacity
                style={[styles.photoProofBtn, capturedGeoPayloads['dc'] && styles.photoProofBtnSuccess]}
                onPress={() => openGeoCamera('dc')}
              >
                <Camera size={18} color={capturedGeoPayloads['dc'] ? '#ffffff' : '#4f46e5'} />
                <Text style={[styles.photoProofBtnText, capturedGeoPayloads['dc'] && { color: '#ffffff' }]}>
                  {capturedGeoPayloads['dc'] ? 'GeoPhoto Verified ✓' : 'Take Verification Photo'}
                </Text>
              </TouchableOpacity>
            </View>

            {dcSubmitting ? (
              <ActivityIndicator size="large" color="#4f46e5" style={{ marginVertical: 10 }} />
            ) : (
              <TouchableOpacity style={[styles.modalSubmitBtn, { backgroundColor: '#4f46e5' }]} onPress={handleSubmitDc}>
                <FileSpreadsheet size={18} color="#ffffff" />
                <Text style={styles.modalSubmitBtnText}>Request DC Conversion</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Shared GeoCamera Modal for Barcode Action Forms */}
      <GeoCameraModal
        visible={geoCameraVisible}
        onClose={() => setGeoCameraVisible(false)}
        onConfirm={(gData) => {
          if (geoCameraTarget) {
            setCapturedGeoPayloads(prev => ({ ...prev, [geoCameraTarget]: gData }));
          }
          setGeoCameraVisible(false);
          Alert.alert('Verified', 'Live photo & GPS location recorded!');
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
  actionBarContainer: {
    backgroundColor: '#0f172a',
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 6,
  },
  actionBarTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 0.8,
  },
  actionBarScroll: {
    gap: 8,
    alignItems: 'center',
  },
  actionBtnChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
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
  },
  sectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  photoGrid: {
    gap: 14,
  },
  photoCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  photoImg: {
    width: '100%',
    height: 180,
    backgroundColor: '#cbd5e1',
  },
  photoMetaBox: {
    padding: 10,
    gap: 4,
  },
  photoSourceText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563eb',
  },
  locRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  locText: {
    fontSize: 11,
    color: '#475569',
  },
  photoDateText: {
    fontSize: 10,
    color: '#94a3b8',
  },
  remarksList: {
    gap: 10,
  },
  remarkItem: {
    backgroundColor: '#f8fafc',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    gap: 4,
  },
  remarkHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  remarkAction: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e293b',
  },
  remarkDate: {
    fontSize: 11,
    color: '#94a3b8',
  },
  remarkUser: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
  },
  remarkBody: {
    fontSize: 12,
    fontStyle: 'italic',
    color: '#334155',
    marginTop: 2,
  },
  attachList: {
    gap: 10,
  },
  attachItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    gap: 10,
  },
  attachCol: {
    flex: 1,
  },
  attachName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  attachSub: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  emptyBox: {
    padding: 30,
    alignItems: 'center',
    gap: 10,
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 13,
  },

  // Action Modals Styling
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
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 8,
  },
  cardHeaderTag: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
  },
  textInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#0f172a',
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
  extraSplitBox: {
    borderWidth: 1,
    borderColor: '#ddd6fe',
    backgroundColor: '#f5f3ff',
    borderRadius: 8,
    padding: 10,
    gap: 6,
    marginTop: 6,
  },
  addSplitRowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
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
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
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
  methodCard: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
  },
  methodCardActive: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  methodTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  methodTitleActive: {
    color: '#2563eb',
  },
  methodSub: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 2,
  },
  toggleChoiceBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  toggleChoiceBtnActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  toggleChoiceBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  toggleChoiceBtnTextActive: {
    color: '#ffffff',
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
    backgroundColor: '#2563eb',
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
  modalSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
    marginTop: 4,
    marginBottom: 20,
  },
  modalSubmitBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
});

export default BarcodeViewAllScreen;
