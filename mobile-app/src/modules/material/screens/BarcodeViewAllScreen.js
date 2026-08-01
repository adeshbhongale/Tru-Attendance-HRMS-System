import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Camera,
  MessageSquare,
  Paperclip,
  MapPin,
  FileText,
  X,
  CheckCircle2,
} from 'lucide-react-native';
import MaterialHeader from '../components/MaterialHeader';
import MaterialModuleFooter from '../components/MaterialModuleFooter';
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
  const exchanges = (data && data.exchanges) || [];
  const merges = (data && data.merges) || [];

  const filteredHistory = (bc.history || []).filter((log) => {
    const actionLower = (log.action || '').toLowerCase();
    if (['exchanged', 'barcode exchanged', 'exchange requested'].includes(actionLower)) {
      return false;
    }
    return true;
  });

  const timelineHistory = [];

  // Extract from history logs
  filteredHistory.forEach((log) => {
    const cleanRem = getCleanUserRemarks(log.remarks || log.description || log.reason || log.comment);
    timelineHistory.push({
      action: log.action || 'Movement Event',
      user: log.user || log.createdBy || { fullName: 'System' },
      timestamp: log.timestamp || log.createdAt,
      remarks: cleanRem !== 'N/A' ? cleanRem : '',
    });
  });

  // Extract from associated transaction if present
  if (bc.transaction) {
    const tx = bc.transaction;
    if (tx.remarks) {
      timelineHistory.push({
        action: 'Transaction Request Created',
        user: tx.requester,
        timestamp: tx.createdAt,
        remarks: tx.remarks,
      });
    }
    if (tx.tlRemarks) {
      timelineHistory.push({
        action: 'Team Lead Approved',
        user: tx.teamLead,
        timestamp: tx.updatedAt,
        remarks: tx.tlRemarks,
      });
    }
    if (tx.managementRemarks) {
      timelineHistory.push({
        action: 'Management Approved',
        user: tx.managementApprover,
        timestamp: tx.updatedAt,
        remarks: tx.managementRemarks,
      });
    }
    if (tx.dispatchRemarks || tx.gatePassRemarks) {
      timelineHistory.push({
        action: 'Store Dispatched',
        user: tx.storeIncharge,
        timestamp: tx.updatedAt,
        remarks: tx.dispatchRemarks || tx.gatePassRemarks,
      });
    }
    if (tx.receivingRemarks || tx.receipts) {
      const rRem = tx.receivingRemarks || (Array.isArray(tx.receipts) && tx.receipts[0] && tx.receipts[0].remarks);
      if (rRem) {
        timelineHistory.push({
          action: 'Requester Received',
          user: tx.requester,
          timestamp: tx.updatedAt,
          remarks: rRem,
        });
      }
    }
  }

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

  // Extract Remarks list
  const remarksList = timelineHistory.filter((log) => log.remarks && log.remarks.trim());

  // Aggregate ALL Photos across entire lifecycle
  const allPhotos = [];
  const seenPhotoUrls = new Set();
  const addPhoto = (url, lat, lng, address, date, source) => {
    if (!url || typeof url !== 'string' || seenPhotoUrls.has(url)) return;
    seenPhotoUrls.add(url);
    allPhotos.push({
      url,
      lat: parseFloat(lat) || NaN,
      lng: parseFloat(lng) || NaN,
      address: address || (bc.gps && bc.gps.address) || 'Verified Location',
      date: date || bc.createdAt || new Date().toISOString(),
      source,
    });
  };

  if (bc.photos) {
    bc.photos.forEach((p) => {
      const url = typeof p === 'string' ? p : p.url;
      addPhoto(url, p.lat, p.lng, p.address, p.capturedAt || p.uploadedAt, 'Barcode Asset Photo');
    });
  }

  if (bc.history) {
    bc.history.forEach((log) => {
      if (log.photos && Array.isArray(log.photos)) {
        log.photos.forEach((p) => {
          const url = typeof p === 'string' ? p : p.url;
          addPhoto(url, p.lat, p.lng, p.address, log.timestamp, `History (${log.action})`);
        });
      } else if (log.photo) {
        addPhoto(log.photo, log.gps && log.gps.lat, log.gps && log.gps.lng, log.gps && log.gps.address, log.timestamp, `History (${log.action})`);
      }
      if (log.metadata && log.metadata.photo) {
        addPhoto(log.metadata.photo, log.gps && log.gps.lat, log.gps && log.gps.lng, log.gps && log.gps.address, log.timestamp, `History (${log.action})`);
      }
    });
  }

  if (bc.transaction) {
    const tx = bc.transaction;
    if (tx.photos && Array.isArray(tx.photos)) {
      tx.photos.forEach((p) => {
        const url = typeof p === 'string' ? p : p.url;
        addPhoto(url, null, null, null, tx.createdAt, 'Transaction Dispatch Photo');
      });
    }
    if (tx.gatePassPhotos && Array.isArray(tx.gatePassPhotos)) {
      tx.gatePassPhotos.forEach((p) => {
        const url = typeof p === 'string' ? p : p.url;
        addPhoto(url, null, null, null, tx.createdAt, 'Gate Pass Verification Photo');
      });
    }
    if (tx.receipts && Array.isArray(tx.receipts)) {
      tx.receipts.forEach((rc) => {
        if (rc.photos && Array.isArray(rc.photos)) {
          rc.photos.forEach((p) => {
            const url = typeof p === 'string' ? p : p.url;
            addPhoto(url, rc.gps && rc.gps.lat, rc.gps && rc.gps.lng, rc.gps && rc.gps.address, rc.capturedAt, 'Receiving Custody Photo');
          });
        }
      });
    }
  }

  // Aggregate ALL Attachments & Documents
  const allAttachments = [];
  const seenDocUrls = new Set();
  const addAttachment = (name, url, date, source) => {
    if (!url || typeof url !== 'string' || seenDocUrls.has(url)) return;
    seenDocUrls.add(url);
    allAttachments.push({
      name: name || url.split('/').pop() || 'Attachment Document',
      url,
      date: date || new Date().toISOString(),
      source,
    });
  };

  if (bc.documents) {
    bc.documents.forEach((doc) => addAttachment(doc.name, doc.url, doc.uploadedAt, 'Barcode Document'));
  }
  if (bc.transaction) {
    const tx = bc.transaction;
    if (tx.documents && Array.isArray(tx.documents)) {
      tx.documents.forEach((doc) => addAttachment(doc.name, doc.url, doc.uploadedAt, 'Transaction Document'));
    }
    if (tx.attachments && Array.isArray(tx.attachments)) {
      tx.attachments.forEach((doc) => addAttachment(doc.name, doc.url, doc.uploadedAt, 'Dispatch Attachment'));
    }
    if (tx.receipts && Array.isArray(tx.receipts)) {
      tx.receipts.forEach((rc) => {
        if (rc.documents && Array.isArray(rc.documents)) {
          rc.documents.forEach((doc) => addAttachment(doc.name, doc.url, doc.uploadedAt, 'Receiving Attachment'));
        }
      });
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <MaterialHeader
        title={bc.barcode ? `Audit: ${bc.barcode}` : 'Barcode Activity Ledger'}
        subtitle={bc.materialName || 'Geo-Tagged Photos, Remarks & Attachments'}
        navigation={navigation}
      />

      {/* Tabs */}
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
                  <TouchableOpacity
                    key={idx}
                    style={styles.photoCard}
                    onPress={() => setPreviewImage(item.url)}
                  >
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
                  </TouchableOpacity>
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
                <Text style={styles.emptyText}>No user remarks logged yet.</Text>
              </View>
            ) : (
              <View style={styles.remarksList}>
                {remarksList.map((log, index) => {
                  const uObj = log.user || {};
                  const userName = uObj.fullName || uObj.name || (typeof log.user === 'string' ? log.user : 'System');
                  const dateStr = log.timestamp ? new Date(log.timestamp).toLocaleString() : '';

                  return (
                    <View key={index} style={styles.remarkItemCard}>
                      <View style={styles.remarkHeader}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <CheckCircle2 size={16} color="#2563eb" />
                          <Text style={styles.remarkActionTitle}>{log.action}</Text>
                        </View>
                        <Text style={styles.remarkDate}>{dateStr}</Text>
                      </View>

                      <Text style={styles.remarkUserText}>By: {userName}</Text>
                      <Text style={styles.remarkBodyText}>"{log.remarks}"</Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* TAB 3: Document Attachments */}
        {activeTab === 'attachments' && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Dispatch & Form Attachments</Text>
            {allAttachments.length === 0 ? (
              <View style={styles.emptyBox}>
                <Paperclip size={36} color="#94a3b8" />
                <Text style={styles.emptyText}>No document attachments found.</Text>
              </View>
            ) : (
              <View style={styles.docList}>
                {allAttachments.map((doc, dIdx) => (
                  <View key={dIdx} style={styles.docCard}>
                    <View style={styles.docIconBox}>
                      <FileText size={20} color="#2563eb" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.docNameText} numberOfLines={1}>{doc.name}</Text>
                      <Text style={styles.docSourceText}>{doc.source} • {new Date(doc.date).toLocaleDateString()}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Full Screen Image Preview Modal */}
      {previewImage ? (
        <Modal transparent animationType="fade" visible={Boolean(previewImage)}>
          <TouchableOpacity style={styles.imagePreviewOverlay} onPress={() => setPreviewImage(null)}>
            <TouchableOpacity style={styles.closePreviewBtn} onPress={() => setPreviewImage(null)}>
              <X size={24} color="#ffffff" />
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
  },
  sectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1e293b',
    marginBottom: 12,
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 30,
    gap: 8,
  },
  emptyText: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '600',
  },
  photoGrid: {
    gap: 12,
  },
  photoCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  photoImg: {
    width: '100%',
    height: 180,
  },
  photoMetaBox: {
    padding: 10,
    gap: 4,
  },
  photoSourceText: {
    fontSize: 11,
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
    flex: 1,
  },
  photoDateText: {
    fontSize: 10,
    color: '#94a3b8',
  },
  remarksList: {
    gap: 10,
  },
  remarkItemCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 4,
  },
  remarkHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  remarkActionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0f172a',
  },
  remarkDate: {
    fontSize: 10,
    color: '#94a3b8',
  },
  remarkUserText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  remarkBodyText: {
    fontSize: 12,
    color: '#334155',
    fontStyle: 'italic',
    marginTop: 2,
  },
  docList: {
    gap: 8,
  },
  docCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 10,
  },
  docIconBox: {
    width: 36,
    height: 36,
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
  },
  imagePreviewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closePreviewBtn: {
    position: 'absolute',
    top: 40,
    right: 20,
    zIndex: 10,
    padding: 10,
  },
  fullPreviewImage: {
    width: '90%',
    height: '80%',
  },
});

export default BarcodeViewAllScreen;
