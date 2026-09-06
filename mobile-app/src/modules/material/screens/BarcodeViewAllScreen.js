import {
  Camera,
  CheckCircle2,
  ExternalLink,
  FileText,
  HelpCircle,
  MapPin,
  MessageSquare,
  Paperclip,
  User,
  X
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import materialApi from '../api/materialApi';
import MaterialHeader from '../components/MaterialHeader';
import MaterialModuleFooter from '../components/MaterialModuleFooter';

const getCleanUserRemarks = (str) => {
  if (!str || typeof str !== 'string') return 'N/A';
  let clean = str.replace(/Status\s+auto-synced.*$/i, '').trim();
  clean = clean.replace(/Auto-synced.*$/i, '').trim();
  clean = clean.replace(/Generated.*$/i, '').trim();
  clean = clean.replace(/System\s+event.*$/i, '').trim();
  return clean || 'N/A';
};

const getParticipantName = (userObj, fallback = 'Authorized Staff') => {
  if (!userObj) return fallback;
  if (typeof userObj === 'string') {
    if (/^[0-9a-fA-F]{24}$/.test(userObj.trim())) return fallback;
    return userObj.trim();
  }
  const name = userObj.fullName || userObj.name || userObj.employeeId || userObj.email;
  if (name && typeof name === 'string' && !/^[0-9a-fA-F]{24}$/.test(name.trim())) {
    return name.trim();
  }
  return fallback;
};

const BarcodeViewAllScreen = ({ route, navigation }) => {
  const barcode = (route.params && route.params.barcode) || '';
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState((route.params && route.params.tab) || 'photos'); // 'photos' | 'remarks' | 'attachments'
  const [previewImage, setPreviewImage] = useState(null);

  const fetchBarcodeDetails = async () => {
    try {
      setLoading(true);
      if (barcode) {
        const res = await materialApi.getBarcodeDetails(barcode);
        setData(res.data || res);
      } else {
        const res = await materialApi.getTransactions({ limit: 1 });
        const firstTxn = Array.isArray(res.data && res.data.data) ? res.data.data[0] : null;
        if (firstTxn) setData(firstTxn);
      }
    } catch (e) {
      console.warn('Error loading view-all data:', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBarcodeDetails();
  }, [barcode]);

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

  const bc = (data && (data.barcode || (data.data && data.data.barcode))) || data || {};
  const transfers = (data && data.transfers) || [];
  const returns = (data && data.returns) || [];
  const splits = (data && data.splits) || [];
  const closeRequests = (data && data.closeRequests) || [];
  const exchanges = (data && data.exchanges) || [];
  const merges = (data && data.merges) || [];
  const receipts = (data && data.receipts) || [];

  // ==========================================
  // 1. AGGREGATE ALL PHOTOS WITH PURPOSE/REASON
  // ==========================================
  const allPhotos = [];
  const seenPhotoUrls = new Set();

  const addPhotoItem = ({ url, lat, lng, address, date, source, reason, user, typeColor = '#2563eb' }) => {
    if (!url || typeof url !== 'string' || seenPhotoUrls.has(url)) return;
    // Disallow invoice files appearing as photo attachments
    const isInvoice =
      (url && url.toLowerCase().includes('invoice')) ||
      (source && source.toLowerCase().includes('invoice document'));
    if (isInvoice) return;

    seenPhotoUrls.add(url);
    allPhotos.push({
      url,
      lat: parseFloat(lat) || NaN,
      lng: parseFloat(lng) || NaN,
      address: address || (bc.gps && bc.gps.address) || '',
      date: date || bc.createdAt || new Date().toISOString(),
      source: source || 'Asset Activity',
      reason: reason && reason !== 'N/A' ? reason : 'Verification photo uploaded during form submission.',
      user: user || 'Authorized User',
      typeColor,
    });
  };

  // A. Barcode Direct Asset Registration Photos
  if (bc.photos && Array.isArray(bc.photos)) {
    bc.photos.forEach((p) => {
      const url = typeof p === 'string' ? p : p.url;
      addPhotoItem({
        url,
        lat: p.lat,
        lng: p.lng,
        address: p.address,
        date: p.capturedAt || p.uploadedAt || bc.createdAt,
        source: 'Asset Registration',
        reason: 'Initial asset barcode registration and physical condition verification.',
        user: getParticipantName(bc.owner || bc.createdBy, 'Store Staff'),
        typeColor: '#4f46e5',
      });
    });
  }

  // B. Store Dispatch & Gate Pass Photos from Transaction
  if (bc.transaction) {
    const tx = bc.transaction;
    if (tx.photos && Array.isArray(tx.photos)) {
      tx.photos.forEach((p) => {
        const url = typeof p === 'string' ? p : p.url;
        addPhotoItem({
          url,
          lat: null,
          lng: null,
          address: null,
          date: tx.createdAt,
          source: 'Store Dispatch',
          reason: tx.dispatchRemarks || tx.remarks || 'Store warehouse dispatch material issuance.',
          user: getParticipantName(tx.storeIncharge || tx.requester, 'Store Incharge'),
          typeColor: '#2563eb',
        });
      });
    }
    if (tx.gatePassPhotos && Array.isArray(tx.gatePassPhotos)) {
      tx.gatePassPhotos.forEach((p) => {
        const url = typeof p === 'string' ? p : p.url;
        addPhotoItem({
          url,
          lat: null,
          lng: null,
          address: null,
          date: tx.createdAt,
          source: 'Gate Pass Verification',
          reason: tx.gatePassRemarks || tx.dispatchRemarks || 'Security gate pass verification at factory exit.',
          user: getParticipantName(tx.storeIncharge || tx.handler, 'Gate Security'),
          typeColor: '#0891b2',
        });
      });
    }
    if (tx.receipts && Array.isArray(tx.receipts)) {
      tx.receipts.forEach((rc) => {
        if (rc.photos && Array.isArray(rc.photos)) {
          rc.photos.forEach((p) => {
            const url = typeof p === 'string' ? p : p.url;
            addPhotoItem({
              url,
              lat: rc.gps && rc.gps.lat,
              lng: rc.gps && rc.gps.lng,
              address: rc.gps && rc.gps.address,
              date: rc.capturedAt || rc.createdAt,
              source: 'Requester Receiving',
              reason: rc.remarks || rc.receivingRemarks || 'Material custody accepted with GPS photo verification.',
              user: getParticipantName(rc.receiver || tx.requester, 'Requester'),
              typeColor: '#16a34a',
            });
          });
        }
      });
    }
  }

  // C. Direct Receipts
  receipts.forEach((rc) => {
    if (rc.photos && Array.isArray(rc.photos)) {
      rc.photos.forEach((p) => {
        const url = typeof p === 'string' ? p : p.url;
        addPhotoItem({
          url,
          lat: rc.gps && rc.gps.lat,
          lng: rc.gps && rc.gps.lng,
          address: rc.gps && rc.gps.address,
          date: rc.capturedAt || rc.createdAt,
          source: 'Receiving Receipt',
          reason: rc.remarks || rc.receivingRemarks || 'Goods receipt inspection verification.',
          user: getParticipantName(rc.receiver, 'Receiver'),
          typeColor: '#16a34a',
        });
      });
    }
  });

  // D. Peer Transfers
  transfers.forEach((tr) => {
    if (tr.photos && Array.isArray(tr.photos)) {
      tr.photos.forEach((p) => {
        const url = typeof p === 'string' ? p : p.url;
        addPhotoItem({
          url,
          lat: p.lat,
          lng: p.lng,
          address: p.address,
          date: p.capturedAt || tr.createdAt,
          source: 'Peer Transfer',
          reason: tr.remarks || tr.reason || `Transferred from ${getParticipantName(tr.fromUser)} to ${getParticipantName(tr.toUser)}.`,
          user: getParticipantName(tr.fromUser, 'Transferor'),
          typeColor: '#d97706',
        });
      });
    }
  });

  // E. Store Returns
  returns.forEach((rt) => {
    if (rt.photos && Array.isArray(rt.photos)) {
      rt.photos.forEach((p) => {
        const url = typeof p === 'string' ? p : p.url;
        addPhotoItem({
          url,
          lat: p.lat,
          lng: p.lng,
          address: p.address,
          date: p.capturedAt || rt.createdAt,
          source: 'Store Return',
          reason: rt.reason || rt.remarks || 'Material returned back towards Central Store.',
          user: getParticipantName(rt.fromUser || rt.requester, 'Custodian'),
          typeColor: '#dc2626',
        });
      });
    }
    if (rt.pickupPhotos && Array.isArray(rt.pickupPhotos)) {
      rt.pickupPhotos.forEach((p) => {
        const url = typeof p === 'string' ? p : p.url;
        addPhotoItem({
          url,
          lat: p.lat,
          lng: p.lng,
          address: p.address,
          date: p.capturedAt || rt.updatedAt,
          source: 'Transporter Return Pickup',
          reason: rt.handlerRemarks || rt.reason || 'Transporter picked up return materials from site.',
          user: getParticipantName(rt.returnHandler, 'Return Transporter'),
          typeColor: '#b45309',
        });
      });
    }
    if (rt.storePhotos && Array.isArray(rt.storePhotos)) {
      rt.storePhotos.forEach((p) => {
        const url = typeof p === 'string' ? p : p.url;
        addPhotoItem({
          url,
          lat: p.lat,
          lng: p.lng,
          address: p.address,
          date: p.capturedAt || rt.updatedAt,
          source: 'Store Return Receipt',
          reason: rt.storeRemarks || 'Physical acceptance and inspection into Central Store.',
          user: getParticipantName(rt.receivedBy, 'Store Incharge'),
          typeColor: '#9333ea',
        });
      });
    }
  });

  // F. Warranty Exchanges
  exchanges.forEach((ex) => {
    if (ex.photos && Array.isArray(ex.photos)) {
      ex.photos.forEach((p) => {
        const url = typeof p === 'string' ? p : p.url;
        addPhotoItem({
          url,
          lat: p.lat,
          lng: p.lng,
          address: p.address,
          date: p.capturedAt || ex.createdAt,
          source: 'Warranty Exchange Claim',
          reason: ex.warrantyReason || 'Physical defect evidence submitted for warranty replacement.',
          user: getParticipantName(ex.requester, 'Requester'),
          typeColor: '#e11d48',
        });
      });
    }
  });

  // G. Reel Splits
  splits.forEach((s) => {
    if (s.photos && Array.isArray(s.photos)) {
      s.photos.forEach((p) => {
        const url = typeof p === 'string' ? p : p.url;
        addPhotoItem({
          url,
          lat: p.lat,
          lng: p.lng,
          address: p.address,
          date: p.capturedAt || s.createdAt,
          source: 'Reel Split',
          reason: s.reason || s.remarks || `Reel split: ${s.splitQuantity || ''}m cut from parent (Child: ${s.childBarcode || 'Created'}).`,
          user: getParticipantName(s.requester, 'Store Technician'),
          typeColor: '#059669',
        });
      });
    }
  });

  // H. Barcode Merges
  merges.forEach((mg) => {
    if (mg.photos && Array.isArray(mg.photos)) {
      mg.photos.forEach((p) => {
        const url = typeof p === 'string' ? p : p.url;
        addPhotoItem({
          url,
          lat: p.lat,
          lng: p.lng,
          address: p.address,
          date: p.capturedAt || mg.createdAt,
          source: 'Barcode Merge',
          reason: mg.reason || `Consolidated lot into master barcode ${mg.finalParentBarcode || mg.selectedParentBarcode || ''}.`,
          user: getParticipantName(mg.requester, 'Store Incharge'),
          typeColor: '#7c3aed',
        });
      });
    }
  });

  // I. DC Internal / DC FOC / Invoice Conversions
  closeRequests.forEach((cr) => {
    if (cr.photos && Array.isArray(cr.photos)) {
      cr.photos.forEach((p) => {
        const url = typeof p === 'string' ? p : p.url;
        addPhotoItem({
          url,
          lat: p.lat,
          lng: p.lng,
          address: p.address,
          date: p.capturedAt || cr.createdAt,
          source: `${cr.documentType || 'Conversion'} Request`,
          reason: cr.remarks || cr.reason || (cr.customerName ? `Conversion for customer: ${cr.customerName}` : 'Material conversion inspection.'),
          user: getParticipantName(cr.requester, 'Requester'),
          typeColor: '#4338ca',
        });
      });
    }
  });

  // J. History Photos fallback
  if (bc.history && Array.isArray(bc.history)) {
    bc.history.forEach((log) => {
      if (log.photos && Array.isArray(log.photos)) {
        log.photos.forEach((p) => {
          const url = typeof p === 'string' ? p : p.url;
          addPhotoItem({
            url,
            lat: p.lat || (log.gps && log.gps.lat),
            lng: p.lng || (log.gps && log.gps.lng),
            address: p.address || (log.gps && log.gps.address),
            date: log.timestamp,
            source: log.action || 'Activity Log',
            reason: log.remarks || log.description || log.action,
            user: getParticipantName(log.user, 'System'),
          });
        });
      } else if (log.photo) {
        addPhotoItem({
          url: log.photo,
          lat: log.gps && log.gps.lat,
          lng: log.gps && log.gps.lng,
          address: log.gps && log.gps.address,
          date: log.timestamp,
          source: log.action || 'Activity Log',
          reason: log.remarks || log.description || log.action,
          user: getParticipantName(log.user, 'System'),
        });
      }
    });
  }

  // Sort photos newest first
  allPhotos.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  // ==========================================
  // 2. AGGREGATE ALL REMARKS & APPROVAL REASONS
  // ==========================================
  const remarksList = [];

  const addRemarkItem = ({ action, user, timestamp, remarks, badgeColor = '#2563eb', role = '' }) => {
    const clean = getCleanUserRemarks(remarks);
    if (!clean || clean === 'N/A') return;
    remarksList.push({
      action: action || 'Form Action',
      user: getParticipantName(user),
      role: role || '',
      timestamp: timestamp || new Date().toISOString(),
      remarks: clean,
      badgeColor,
    });
  };

  // Transaction workflow remarks
  if (bc.transaction) {
    const tx = bc.transaction;
    if (tx.remarks) {
      addRemarkItem({
        action: 'Transaction Request Created',
        user: tx.requester,
        role: 'Requester',
        timestamp: tx.createdAt,
        remarks: tx.remarks,
        badgeColor: '#2563eb',
      });
    }
    if (tx.tlRemarks) {
      addRemarkItem({
        action: 'Team Lead Approved',
        user: tx.teamLead,
        role: 'Team Lead Approver',
        timestamp: tx.updatedAt,
        remarks: tx.tlRemarks,
        badgeColor: '#16a34a',
      });
    }
    if (tx.managementRemarks) {
      addRemarkItem({
        action: 'Management Authorized',
        user: tx.managementApprover,
        role: 'Management Approver',
        timestamp: tx.updatedAt,
        remarks: tx.managementRemarks,
        badgeColor: '#059669',
      });
    }
    if (tx.dispatchRemarks || tx.gatePassRemarks) {
      addRemarkItem({
        action: 'Store Dispatched',
        user: tx.storeIncharge,
        role: 'Store Incharge',
        timestamp: tx.updatedAt,
        remarks: tx.dispatchRemarks || tx.gatePassRemarks,
        badgeColor: '#0891b2',
      });
    }
    if (tx.receivingRemarks) {
      addRemarkItem({
        action: 'Requester Custody Accepted',
        user: tx.requester,
        role: 'Custodian',
        timestamp: tx.updatedAt,
        remarks: tx.receivingRemarks,
        badgeColor: '#10b981',
      });
    }
  }

  // Direct receipts remarks
  receipts.forEach((rc) => {
    if (rc.remarks || rc.receivingRemarks) {
      addRemarkItem({
        action: 'Material Receipt Inspection',
        user: rc.receiver,
        role: 'Receiving Officer',
        timestamp: rc.createdAt,
        remarks: rc.remarks || rc.receivingRemarks,
        badgeColor: '#16a34a',
      });
    }
  });

  // Transfers remarks
  transfers.forEach((tr) => {
    if (tr.reason || tr.remarks) {
      addRemarkItem({
        action: 'Peer Transfer Initiated',
        user: tr.fromUser,
        role: 'Transferor',
        timestamp: tr.createdAt,
        remarks: tr.remarks || tr.reason,
        badgeColor: '#d97706',
      });
    }
    if (tr.acceptanceRemarks) {
      addRemarkItem({
        action: 'Peer Transfer Accepted',
        user: tr.toUser,
        role: 'Recipient',
        timestamp: tr.updatedAt,
        remarks: tr.acceptanceRemarks,
        badgeColor: '#16a34a',
      });
    }
    if (tr.rejectionReason) {
      addRemarkItem({
        action: 'Peer Transfer Rejected',
        user: tr.toUser,
        role: 'Recipient',
        timestamp: tr.updatedAt,
        remarks: tr.rejectionReason,
        badgeColor: '#dc2626',
      });
    }
  });

  // Returns remarks
  returns.forEach((rt) => {
    if (rt.reason || rt.remarks) {
      addRemarkItem({
        action: 'Store Return Initiated',
        user: rt.fromUser || rt.requester,
        role: 'Custodian',
        timestamp: rt.createdAt,
        remarks: rt.reason || rt.remarks,
        badgeColor: '#dc2626',
      });
    }
    if (rt.handlerRemarks) {
      addRemarkItem({
        action: 'Transporter Return Collected',
        user: rt.returnHandler,
        role: 'Return Transporter',
        timestamp: rt.updatedAt,
        remarks: rt.handlerRemarks,
        badgeColor: '#b45309',
      });
    }
    if (rt.storeRemarks) {
      addRemarkItem({
        action: 'Store Return Accepted into Warehouse',
        user: rt.receivedBy,
        role: 'Store Incharge',
        timestamp: rt.updatedAt,
        remarks: rt.storeRemarks,
        badgeColor: '#9333ea',
      });
    }
    if (rt.rejectionReason) {
      addRemarkItem({
        action: 'Store Return Rejected',
        user: rt.receivedBy,
        role: 'Store Incharge',
        timestamp: rt.updatedAt,
        remarks: rt.rejectionReason,
        badgeColor: '#dc2626',
      });
    }
  });

  // Warranty Exchanges
  exchanges.forEach((ex) => {
    if (ex.warrantyReason) {
      addRemarkItem({
        action: 'Warranty Replacement Claimed',
        user: ex.requester,
        role: 'Requester',
        timestamp: ex.createdAt,
        remarks: ex.warrantyReason,
        badgeColor: '#e11d48',
      });
    }
    if (ex.remarks || ex.approvedBy) {
      addRemarkItem({
        action: 'Warranty Replacement Approved',
        user: ex.approvedBy,
        role: 'Store Incharge',
        timestamp: ex.approvedAt || ex.updatedAt,
        remarks: ex.remarks || `Replacement unit issued (New Barcode: ${ex.newBarcode || 'Assigned'}).`,
        badgeColor: '#16a34a',
      });
    }
    if (ex.rejectionReason) {
      addRemarkItem({
        action: 'Warranty Claim Rejected',
        user: ex.approvedBy,
        role: 'Store Incharge',
        timestamp: ex.updatedAt,
        remarks: ex.rejectionReason,
        badgeColor: '#dc2626',
      });
    }
  });

  // Reel Splits
  splits.forEach((s) => {
    if (s.reason || s.remarks) {
      addRemarkItem({
        action: 'Reel Split Processed',
        user: s.requester,
        role: 'Store Staff',
        timestamp: s.createdAt,
        remarks: s.reason || s.remarks,
        badgeColor: '#059669',
      });
    }
  });

  // Barcode Merges
  merges.forEach((mg) => {
    if (mg.reason) {
      addRemarkItem({
        action: 'Barcode Lot Merge Processed',
        user: mg.requester,
        role: 'Store Incharge',
        timestamp: mg.createdAt,
        remarks: mg.reason,
        badgeColor: '#7c3aed',
      });
    }
  });

  // DC Internal, DC FOC, and Invoice conversions
  closeRequests.forEach((cr) => {
    const doc = cr.documentType || 'Conversion';
    if (cr.remarks || cr.reason) {
      addRemarkItem({
        action: `${doc} Request Initiated`,
        user: cr.requester,
        role: 'Requester',
        timestamp: cr.createdAt,
        remarks: cr.remarks || cr.reason || (cr.customerName ? `Customer: ${cr.customerName}` : ''),
        badgeColor: '#4338ca',
      });
    }
    if (cr.tlRemarks) {
      addRemarkItem({
        action: `${doc} Team Lead Approved`,
        user: cr.teamLead,
        role: 'Team Lead',
        timestamp: cr.updatedAt || cr.createdAt,
        remarks: cr.tlRemarks,
        badgeColor: '#16a34a',
      });
    }
    if (cr.managementRemarks) {
      addRemarkItem({
        action: `${doc} Management Authorized`,
        user: cr.managementApprover,
        role: 'Management Authority',
        timestamp: cr.updatedAt || cr.createdAt,
        remarks: cr.managementRemarks,
        badgeColor: '#059669',
      });
    }
    if (cr.accountRemarks || cr.invoiceNumber) {
      addRemarkItem({
        action: `${doc} Accounts Approved`,
        user: cr.accountApprover,
        role: 'Accounts Admin',
        timestamp: cr.updatedAt || cr.createdAt,
        remarks: cr.accountRemarks || (cr.invoiceNumber ? `Invoice Number: ${cr.invoiceNumber}` : 'Accounts verified & approved.'),
        badgeColor: '#2563eb',
      });
    }
    if (cr.storeRemarks) {
      addRemarkItem({
        action: `${doc} Store Physical Acceptance Completed`,
        user: cr.approvedBy,
        role: 'Central Store Incharge',
        timestamp: cr.updatedAt || cr.createdAt,
        remarks: cr.storeRemarks,
        badgeColor: '#16a34a',
      });
    }
    if (cr.rejectionReason) {
      addRemarkItem({
        action: `${doc} Request Rejected`,
        user: cr.approvedBy,
        role: 'Approver',
        timestamp: cr.updatedAt || cr.createdAt,
        remarks: cr.rejectionReason,
        badgeColor: '#dc2626',
      });
    }
  });

  // History logs
  if (bc.history && Array.isArray(bc.history)) {
    bc.history.forEach((log) => {
      const clean = getCleanUserRemarks(log.remarks || log.description || log.comment);
      if (clean && clean !== 'N/A') {
        addRemarkItem({
          action: log.action || 'Activity Event',
          user: log.user,
          role: 'Participant',
          timestamp: log.timestamp,
          remarks: clean,
          badgeColor: '#475569',
        });
      }
    });
  }

  // Sort remarks newest first
  remarksList.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

  // ==========================================
  // 3. AGGREGATE ALL ATTACHMENTS (EXCLUDING INVOICE DOCS ON MOBILE)
  // ==========================================
  const allAttachments = [];
  const seenDocUrls = new Set();

  const addAttachmentItem = ({ name, url, date, source }) => {
    if (!url || typeof url !== 'string' || seenDocUrls.has(url)) return;
    const isInvoice =
      (name && name.toLowerCase().includes('invoice')) ||
      (url && url.toLowerCase().includes('invoice'));
    if (isInvoice) return;

    seenDocUrls.add(url);
    allAttachments.push({
      name: name || url.split('/').pop() || 'Attachment Document',
      url,
      date: date || new Date().toISOString(),
      source: source || 'Form Document',
    });
  };

  if (bc.documents && Array.isArray(bc.documents)) {
    bc.documents.forEach((doc) => addAttachmentItem({ name: doc.name, url: doc.url, date: doc.uploadedAt, source: 'Asset Document' }));
  }
  if (bc.transaction) {
    const tx = bc.transaction;
    if (tx.documents && Array.isArray(tx.documents)) {
      tx.documents.forEach((doc) => addAttachmentItem({ name: doc.name, url: doc.url, date: doc.uploadedAt || tx.createdAt, source: 'Transaction Document' }));
    }
    if (tx.attachments && Array.isArray(tx.attachments)) {
      tx.attachments.forEach((doc) => addAttachmentItem({ name: doc.name, url: doc.url, date: doc.uploadedAt || tx.createdAt, source: 'Dispatch Attachment' }));
    }
    if (tx.receipts && Array.isArray(tx.receipts)) {
      tx.receipts.forEach((rc) => {
        if (rc.documents && Array.isArray(rc.documents)) {
          rc.documents.forEach((doc) => addAttachmentItem({ name: doc.name, url: doc.url, date: doc.uploadedAt, source: 'Receiving Document' }));
        }
      });
    }
  }
  returns.forEach((rt) => {
    if (rt.documents && Array.isArray(rt.documents)) {
      rt.documents.forEach((doc) => addAttachmentItem({ name: doc.name, url: doc.url, date: doc.uploadedAt || rt.createdAt, source: 'Return Challan Document' }));
    }
  });
  transfers.forEach((tr) => {
    if (tr.documents && Array.isArray(tr.documents)) {
      tr.documents.forEach((doc) => addAttachmentItem({ name: doc.name, url: doc.url, date: doc.uploadedAt || tr.createdAt, source: 'Transfer Document' }));
    }
  });

  return (
    <SafeAreaView style={styles.container}>
      <MaterialHeader
        title={bc.barcode ? `Audit: ${bc.barcode}` : 'Barcode Activity Ledger'}
        subtitle={bc.materialName || 'Photos, Purposes, Remarks & Attachments'}
        navigation={navigation}
      />

      {/* Navigation Tabs */}
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

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* ==========================================
            TAB 1: PHOTOS & FORM PURPOSE/REASONS
            ========================================== */}
        {activeTab === 'photos' && (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <View>
                <Text style={styles.sectionTitle}>Uploaded Images & Verification Photos</Text>
                <Text style={styles.sectionSubtitle}>
                  Photos captured across all workflows with exact reasons and purposes.
                </Text>
              </View>
            </View>

            {allPhotos.length === 0 ? (
              <View style={styles.emptyBox}>
                <Camera size={36} color="#94a3b8" />
                <Text style={styles.emptyText}>No photo records captured for this barcode.</Text>
              </View>
            ) : (
              <View style={styles.photoGrid}>
                {allPhotos.map((item, idx) => (
                  <View key={idx} style={styles.photoCard}>
                    {/* Image with tap to zoom preview */}
                    <TouchableOpacity activeOpacity={0.9} onPress={() => setPreviewImage(item.url)}>
                      <Image source={{ uri: item.url }} style={styles.photoImg} resizeMode="cover" />
                      <View style={styles.tapToZoomTag}>
                        <Text style={styles.tapToZoomText}>Tap to Zoom</Text>
                      </View>
                    </TouchableOpacity>

                    {/* Metadata & Purpose Container */}
                    <View style={styles.photoMetaBox}>
                      {/* Operation Source Badge */}
                      <View style={styles.sourceBadgeRow}>
                        <View style={[styles.sourceBadge, { backgroundColor: item.typeColor }]}>
                          <Text style={styles.sourceBadgeText}>{item.source}</Text>
                        </View>
                        <Text style={styles.photoDateText}>{new Date(item.date).toLocaleString()}</Text>
                      </View>

                      {/* Reason / Purpose Container */}
                      <View style={styles.purposeCard}>
                        <View style={styles.purposeTitleRow}>
                          <HelpCircle size={14} color="#4338ca" />
                          <Text style={styles.purposeTitle}>Reason / Purpose:</Text>
                        </View>
                        <Text style={styles.purposeText}>{item.reason}</Text>
                      </View>

                      {/* Submitter & GPS Row */}
                      <View style={styles.uploaderRow}>
                        <View style={styles.userRow}>
                          <User size={13} color="#64748b" />
                          <Text style={styles.userNameText}>{item.user}</Text>
                        </View>
                        {item.address ? (
                          <View style={styles.locRow}>
                            <MapPin size={13} color="#2563eb" />
                            <Text style={styles.locText} numberOfLines={3}>
                              {item.address}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* ==========================================
            TAB 2: PROCESS & APPROVAL REMARKS LEDGER
            ========================================== */}
        {activeTab === 'remarks' && (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <View>
                <Text style={styles.sectionTitle}>Process & Approval Reasons Ledger</Text>
                <Text style={styles.sectionSubtitle}>
                  Every submission reason, approval note, and rejection remark in chronological order.
                </Text>
              </View>
            </View>

            {remarksList.length === 0 ? (
              <View style={styles.emptyBox}>
                <MessageSquare size={36} color="#94a3b8" />
                <Text style={styles.emptyText}>No remarks or approval notes logged yet.</Text>
              </View>
            ) : (
              <View style={styles.remarksList}>
                {remarksList.map((log, index) => {
                  const dateStr = log.timestamp ? new Date(log.timestamp).toLocaleString() : '';
                  return (
                    <View key={index} style={styles.remarkItemCard}>
                      <View style={styles.remarkHeader}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <CheckCircle2 size={16} color={log.badgeColor} />
                          <Text style={styles.remarkActionTitle}>{log.action}</Text>
                        </View>
                        <Text style={styles.remarkDate}>{dateStr}</Text>
                      </View>

                      <View style={styles.remarkMetaRow}>
                        <Text style={styles.remarkUserText}>
                          Participant: <Text style={{ fontWeight: '700', color: '#0f172a' }}>{log.user}</Text>
                          {log.role ? ` (${log.role})` : ''}
                        </Text>
                      </View>

                      <View style={styles.remarkQuoteBox}>
                        <Text style={styles.remarkBodyText}>"{log.remarks}"</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* ==========================================
            TAB 3: DOCUMENT ATTACHMENTS
            ========================================== */}
        {activeTab === 'attachments' && (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <View>
                <Text style={styles.sectionTitle}>Challans & Form Attachments</Text>
                <Text style={styles.sectionSubtitle}>
                  Dispatched challans, return forms, and technical receipts for this barcode.
                </Text>
              </View>
            </View>

            {allAttachments.length === 0 ? (
              <View style={styles.emptyBox}>
                <Paperclip size={36} color="#94a3b8" />
                <Text style={styles.emptyText}>No document attachments found for this barcode.</Text>
              </View>
            ) : (
              <View style={styles.docList}>
                {allAttachments.map((doc, dIdx) => (
                  <TouchableOpacity
                    key={dIdx}
                    style={styles.docCard}
                    activeOpacity={0.7}
                    onPress={() => {
                      if (doc.url) Linking.openURL(doc.url).catch(() => { });
                    }}
                  >
                    <View style={styles.docIconBox}>
                      <FileText size={20} color="#2563eb" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.docNameText} numberOfLines={1}>{doc.name}</Text>
                      <Text style={styles.docSourceText}>{doc.source} • {new Date(doc.date).toLocaleDateString()}</Text>
                    </View>
                    <ExternalLink size={16} color="#94a3b8" />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Full Screen Image Preview Modal */}
      {previewImage ? (
        <Modal transparent animationType="fade" visible={Boolean(previewImage)} onRequestClose={() => setPreviewImage(null)}>
          <TouchableOpacity activeOpacity={1} style={styles.imagePreviewOverlay} onPress={() => setPreviewImage(null)}>
            <TouchableOpacity style={styles.closePreviewBtn} onPress={() => setPreviewImage(null)}>
              <X size={26} color="#ffffff" />
            </TouchableOpacity>
            <Image source={{ uri: previewImage }} style={styles.fullPreviewImage} resizeMode="contain" />
          </TouchableOpacity>
        </Modal>
      ) : null}

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
    borderColor: '#e2e8f0',
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
    borderBottomWidth: 2,
    borderColor: 'transparent',
  },
  tabItemActive: {
    borderColor: '#2563eb',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  tabTextActive: {
    color: '#2563eb',
    fontWeight: '800',
  },
  scrollContent: {
    padding: 14,
    paddingBottom: 30,
  },
  sectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  sectionHeaderRow: {
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
  },
  sectionSubtitle: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    gap: 8,
  },
  emptyText: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '600',
  },
  photoGrid: {
    gap: 14,
  },
  photoCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  photoImg: {
    width: '100%',
    height: 200,
    backgroundColor: '#0f172a',
  },
  tapToZoomTag: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  tapToZoomText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  photoMetaBox: {
    padding: 12,
    gap: 8,
  },
  sourceBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sourceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  sourceBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#ffffff',
  },
  photoDateText: {
    fontSize: 11,
    color: '#64748b',
  },
  purposeCard: {
    backgroundColor: '#eef2ff',
    borderLeftWidth: 3,
    borderLeftColor: '#4f46e5',
    padding: 8,
    borderRadius: 6,
    gap: 2,
  },
  purposeTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  purposeTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#312e81',
  },
  purposeText: {
    fontSize: 12,
    color: '#1e1b4b',
    lineHeight: 16,
  },
  uploaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  userNameText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  locRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: '50%',
  },
  locText: {
    fontSize: 11,
    color: '#2563eb',
  },
  remarksList: {
    gap: 12,
  },
  remarkItemCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 6,
  },
  remarkHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  remarkActionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
  },
  remarkDate: {
    fontSize: 10,
    color: '#94a3b8',
  },
  remarkMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  remarkUserText: {
    fontSize: 11,
    color: '#475569',
  },
  remarkQuoteBox: {
    backgroundColor: '#ffffff',
    borderLeftWidth: 3,
    borderLeftColor: '#cbd5e1',
    padding: 8,
    borderRadius: 4,
  },
  remarkBodyText: {
    fontSize: 12,
    color: '#334155',
    fontStyle: 'italic',
    lineHeight: 16,
  },
  docList: {
    gap: 8,
  },
  docCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 10,
  },
  docIconBox: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  docNameText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
  },
  docSourceText: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 2,
  },
  imagePreviewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closePreviewBtn: {
    position: 'absolute',
    top: 40,
    right: 20,
    zIndex: 10,
    padding: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
  },
  fullPreviewImage: {
    width: '92%',
    height: '82%',
  },
});

export default BarcodeViewAllScreen;
