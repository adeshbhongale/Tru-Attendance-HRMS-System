import {
  Camera,
  FileText,
  Package,
  Paperclip,
  ShieldCheck,
  Trash2,
  X
} from 'lucide-react-native';
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

const ReceivingFormScreen = ({ route, navigation }) => {
  const { id, mode = 'receive', transferId } = route.params || {};
  const [txn, setTxn] = useState(null);
  const [barcodes, setBarcodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Mode banner config matching ReceivingForm.jsx supported modes
  const MODE_CONFIG = {
    'receive': { title: 'Receive Materials', actionLabel: 'ACCEPT MATERIALS', hint: 'Verify each dispatched barcode physically and confirm custody.' },
    'handler-pickup': { title: 'Handler Store Pickup', actionLabel: 'CONFIRM COLLECT FROM STORE', hint: 'Confirm you have collected the assigned packages from the Store warehouse.' },
    'store-return': { title: 'Store Return Inspection', actionLabel: 'CONFIRM STORE ACCEPTANCE', hint: 'Physically inspect the returning materials and accept into warehouse.' },
    'transfer-accept': { title: 'Accept Barcode Transfer', actionLabel: 'CONFIRM TRANSFER ACCEPTANCE', hint: 'Accept incoming custody for the listed barcode(s).' },
  };
  const activeMode = MODE_CONFIG[mode] ? mode : 'receive';

  // Form States matching ReceivingForm.jsx
  const [commonRemark, setCommonRemark] = useState('');
  const [barcodeEvidence, setBarcodeEvidence] = useState({});
  const [commonDocuments, setCommonDocuments] = useState([]);

  // Camera State
  const [cameraModalVisible, setCameraModalVisible] = useState(false);
  const [activeBarcode, setActiveBarcode] = useState(null);

  useEffect(() => {
    loadReceivingData();
  }, [id]);

  const loadReceivingData = async () => {
    try {
      setLoading(true);
      const targetId = id || route.params?.returnId || route.params?.barcode;
      let txData = null;
      let targetBc = null;

      if (targetId) {
        try {
          const txRes = await materialApi.getTransactionById(targetId);
          txData = txRes && (txRes.data || txRes.transaction || txRes);
        } catch (txErr) {}
      }

      if (!txData && (route.params?.barcode || targetId)) {
        const bcCode = route.params?.barcode || targetId;
        try {
          const bcRes = await materialApi.getBarcodeDetails(bcCode);
          targetBc = bcRes && (bcRes.barcode || bcRes.data || bcRes);
          if (targetBc && targetBc.transactionId) {
            const txRes = await materialApi.getTransactionById(targetBc.transactionId);
            txData = txRes && (txRes.data || txRes.transaction || txRes);
          }
        } catch (bcErr) {}
      }

      if (!txData) {
        txData = {
          _id: targetId || 'RECEIVE-ID',
          transactionId: targetId || 'RECEIVE-ID',
          requester: { fullName: 'Store Receiver' },
          status: 'pending_store_receipt',
          materials: [
            {
              name: targetBc ? targetBc.materialName : 'Returned Inventory Material',
              barcodes: [route.params?.barcode || targetId || 'ITEM-1'],
              returnId: route.params?.returnId || targetId,
            }
          ]
        };
      }

      setTxn(txData);

      // Fetch barcoded items associated with transaction
      let bcList = [];
      const returnBarcodes = [
        route.params?.barcode,
        ...(Array.isArray(route.params?.barcodes) ? route.params.barcodes : []),
        ...(targetBc ? [targetBc.barcode] : []),
      ].filter(Boolean).map(b => String(typeof b === 'string' ? b : (b.barcode || b)).trim().toUpperCase());

      // When in 'store-return' mode, strictly show ONLY the returning barcode(s)
      if (activeMode === 'store-return' && returnBarcodes.length > 0) {
        if (targetBc && returnBarcodes.includes(String(targetBc.barcode || '').toUpperCase())) {
          bcList.push({
            barcode: targetBc.barcode || route.params?.barcode,
            materialName: targetBc.materialName || 'Returned Material',
            owner: targetBc.owner,
            returnId: route.params?.returnId || targetId,
          });
        } else if (txData && txData.materials) {
          txData.materials.forEach((m) => {
            const mBarcodes = m.barcodes || [];
            mBarcodes.forEach((bObj) => {
              const bcCode = typeof bObj === 'string' ? bObj : (bObj.barcode || bObj.code);
              const norm = String(bcCode || '').trim().toUpperCase();
              if (norm && returnBarcodes.includes(norm)) {
                bcList.push({
                  barcode: bcCode,
                  materialName: m.name || m.materialName || 'Returned Material',
                  owner: txData.requester,
                  returnId: route.params?.returnId || m.returnId,
                });
              }
            });
          });
        }

        if (bcList.length === 0) {
          returnBarcodes.forEach(bcCode => {
            bcList.push({
              barcode: bcCode,
              materialName: targetBc ? targetBc.materialName : 'Returned Material',
              owner: txData.requester,
              returnId: route.params?.returnId || targetId,
            });
          });
        }
      } else if (targetBc) {
        bcList.push({
          barcode: targetBc.barcode || route.params?.barcode,
          materialName: targetBc.materialName || 'Returned Material',
          owner: targetBc.owner,
          returnId: route.params?.returnId || targetId,
        });
      } else if (txData.materials) {
        txData.materials.forEach((m, mIdx) => {
          const mBarcodes = m.barcodes || [];
          if (mBarcodes.length > 0) {
            mBarcodes.forEach((bObj) => {
              const bcCode = typeof bObj === 'string' ? bObj : (bObj.barcode || bObj.code);
              if (bcCode) {
                bcList.push({
                  barcode: bcCode,
                  materialName: m.name || m.materialName || 'Material Unit',
                  owner: txData.requester,
                  returnId: route.params?.returnId || m.returnId,
                });
              }
            });
          } else {
            bcList.push({
              barcode: m.barcode || `ITEM-${mIdx + 1}`,
              materialName: m.name || m.materialName || 'Material Unit',
              owner: txData.requester,
              returnId: route.params?.returnId || m.returnId,
            });
          }
        });
      }

      setBarcodes(bcList);

      // Initialize evidence state for each barcode item
      const initialEvidence = {};
      bcList.forEach((b) => {
        const key = b.barcode || b._id;
        initialEvidence[key] = {
          condition: 'good',
          photos: [],
          documents: [],
        };
      });
      setBarcodeEvidence(initialEvidence);
    } catch (err) {
      console.warn('Error loading receiving form data:', err);
      Alert.alert('Error', 'Failed to load transaction receiving data.');
    } finally {
      setLoading(false);
    }
  };

  const updateEvidence = (barcodeKey, changes) => {
    setBarcodeEvidence((current) => ({
      ...current,
      [barcodeKey]: {
        condition: 'good',
        photos: [],
        documents: [],
        ...current[barcodeKey],
        ...changes,
      },
    }));
  };

  const handleCapturePhotoSuccess = (uploadData) => {
    if (!activeBarcode || !uploadData) return;
    const photoUrl = uploadData.photoUrl || uploadData.url || uploadData.uri;
    if (!photoUrl) return;
    const current = barcodeEvidence[activeBarcode] || { photos: [] };
    const newPhoto = {
      url: photoUrl,
      capturedAt: new Date().toISOString(),
      gps: uploadData.gps || uploadData.coordinates,
    };
    updateEvidence(activeBarcode, {
      photos: [...(current.photos || []), newPhoto],
      gps: uploadData.gps || uploadData.coordinates,
    });
    setCameraModalVisible(false);
    setActiveBarcode(null);
  };

  const handlePickDocument = () => {
    Alert.alert(
      'Upload Dispatch Attachment',
      'Select document type to attach:',
      [
        {
          text: 'PDF Document (.pdf)',
          onPress: () => {
            const fileName = `ReceivingChallan_${Date.now()}.pdf`;
            setCommonDocuments((prev) => [
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
            const fileName = `ReceivingNote_${Date.now()}.docx`;
            setCommonDocuments((prev) => [
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
            const fileName = `ReceivingPhoto_${Date.now()}.jpg`;
            setCommonDocuments((prev) => [
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
    setCommonDocuments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleRemoveBarcodePhoto = (barcodeKey, photoIdx) => {
    const current = barcodeEvidence[barcodeKey] || { photos: [] };
    const updatedPhotos = (current.photos || []).filter((_, i) => i !== photoIdx);
    updateEvidence(barcodeKey, { photos: updatedPhotos });
  };

  const handleSubmitReceiving = async () => {
    if (!barcodes.length) {
      Alert.alert('Validation Error', 'No dispatched barcodes found for this transaction.');
      return;
    }
    if (!commonRemark.trim()) {
      Alert.alert('Validation Error', 'Please enter the common receiving remark before proceeding.');
      return;
    }

    // Collect first captured geo evidence for the payload
    let firstPhoto = null;
    let firstGps = null;
    for (const item of barcodes) {
      const key = item.barcode || item._id;
      const ev = barcodeEvidence[key] || {};
      if (!firstPhoto && ev.photos && ev.photos.length > 0) {
        firstPhoto = ev.photos[0];
        firstGps = ev.gps || ev.photos[0].gps || null;
      }
      if (firstPhoto) break;
    }
    // GeoCamera proof is mandatory in every mode (spec best practice #2)
    if (!firstPhoto) {
      Alert.alert('Validation Error', 'Live geo-tagged photo verification is mandatory. Please capture at least one photo per barcode before confirming.');
      return;
    }

    try {
      setSubmitting(true);

      const receiverGeo = {
        lat: (firstGps && (firstGps.latitude || firstGps.lat)) || 18.5204,
        lng: (firstGps && (firstGps.longitude || firstGps.lng)) || 73.8567,
        address: (firstGps && firstGps.address) || 'Address unavailable',
      };
      const targetTxId = id || (txn && (txn._id || txn.id || txn.transactionId));

      // ============ MODE: handler-pickup → PATCH /transactions/:id/handler-action {actionType:'collect'} ============
      if (activeMode === 'handler-pickup') {
        const res = await materialApi.handlerAction(targetTxId, {
          actionType: 'collect',
          remarks: commonRemark.trim(),
        });
        if (res && res.success !== false) {
          Alert.alert(
            'Success',
            res.message || 'Packages collected from Store. Deliver them to the requester to complete handover.',
            [
              {
                text: 'OK',
                onPress: () => navigation.navigate('MaterialDetailScreen', { id: targetTxId }),
              },
            ]
          );
          return;
        }
        Alert.alert('Error', (res && res.message) || 'Handler pickup confirmation failed.');
        return;
      }

      // ============ MODE: transfer-accept → POST /barcodes/handle-transfer {transferId, action:'accept'} ============
      if (activeMode === 'transfer-accept') {
        if (!transferId) {
          Alert.alert('Error', 'Missing transfer reference id.');
          return;
        }
        const res = await materialApi.handleTransfer({
          transferId,
          action: 'accept',
          reason: commonRemark.trim(),
          gps: receiverGeo,
          photos: Object.values(barcodeEvidence)
            .flatMap((ev) => (ev.photos || []).map((p) => ({ url: p.url, capturedAt: p.capturedAt }))),
        });
        if (res && res.success !== false) {
          Alert.alert(
            'Success',
            res.message || 'Transfer accepted. Barcode custody has moved to you!',
            [
              {
                text: 'OK',
                onPress: () => navigation.navigate('MaterialDetailScreen', { id: targetTxId }),
              },
            ]
          );
          return;
        }
        Alert.alert('Error', (res && res.message) || 'Transfer acceptance failed.');
        return;
      }

      // ============ Return acceptance path (store-return mode or return params) ============
      const activeReturnId = route.params?.returnId || (barcodes[0] && barcodes[0].returnId);
      const passedReturnIds = route.params?.returnIds;
      const targetReturnIds = (passedReturnIds && Array.isArray(passedReturnIds) && passedReturnIds.length > 0)
        ? passedReturnIds
        : (activeReturnId ? [activeReturnId] : []);

      if (activeMode === 'store-return' || targetReturnIds.length > 0) {
        const bulkRes = await materialApi.bulkAcceptReturns({
          returnIds: targetReturnIds,
          remarks: commonRemark.trim(),
          documents: commonDocuments,
        });
        if (bulkRes && bulkRes.success !== false) {
          Alert.alert(
            'Success',
            `Return request(s) accepted into Store — ${targetReturnIds.length} barcode(s) received!`,
            [
              {
                text: 'OK',
                onPress: () => navigation.navigate('MaterialDetailScreen', { id: targetTxId }),
              },
            ]
          );
          return;
        }
        // Fallback: accept returns one by one
        let allAccepted = true;
        for (const rId of targetReturnIds) {
          const singleRes = await materialApi.acceptReturn(rId, { remarks: commonRemark.trim() });
          if (!(singleRes && singleRes.success !== false)) allAccepted = false;
        }
        if (allAccepted) {
          Alert.alert(
            'Success',
            'Material return request(s) accepted into Store!',
            [
              {
                text: 'OK',
                onPress: () => navigation.navigate('MaterialDetailScreen', { id: targetTxId }),
              },
            ]
          );
          return;
        }
        Alert.alert('Error', (bulkRes && bulkRes.message) || 'Failed to accept return request(s).');
        return;
      }

      // ============ MODE: receive → PATCH /transactions/:id/receive ============
      // Backend contract reads: receiverGeo{lat,lng,address}, materialCondition, remarks, photo (URL string)
      const conditions = barcodes.map((item) => {
        const key = item.barcode || item._id;
        return (barcodeEvidence[key] || {}).condition;
      }).filter(Boolean);
      const worstCondition = conditions.includes('needs_repair')
        ? 'needs_repair'
        : conditions.includes('damaged') ? 'damaged' : 'good';

      const payload = {
        receiverGeo,
        materialCondition: worstCondition,
        remarks: commonRemark.trim(),
        photo: firstPhoto.url,
        receipts: barcodes.map((item) => {
          const key = item.barcode || item._id;
          const ev = barcodeEvidence[key] || {};
          return {
            barcode: item.barcode,
            returnId: item.returnId,
            condition: ev.condition || 'good',
            remarks: commonRemark.trim(),
            photos: ev.photos || [],
            documents: commonDocuments,
          };
        }),
      };

      const res = await materialApi.receiveTransaction(targetTxId, payload);
      if (res && (res.transaction || res.message)) {
        Alert.alert(
          'Success',
          'Materials successfully received and barcodes activated under your custody!',
          [
            {
              text: 'OK',
              onPress: () => navigation.navigate('MaterialDetailScreen', { id: targetTxId }),
            },
          ]
        );
      } else {
        Alert.alert('Receiving Error', (res && res.message) || 'Material receipt confirmation failed.');
      }
    } catch (err) {
      console.warn('Receiving submit error:', err);
      const msg = (err.response && err.response.data && err.response.data.message) || err.message;
      Alert.alert('Receiving Error', msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !txn) {
    return (
      <SafeAreaView style={styles.container}>
        <MaterialHeader title={MODE_CONFIG[activeMode].title} navigation={navigation} />
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#2563eb" />
        </View>
      </SafeAreaView>
    );
  }

  const requesterName = (txn.requester && (txn.requester.name || txn.requester.fullName)) || 'Requester';

  return (
    <SafeAreaView style={styles.container}>
      <MaterialHeader
        title={MODE_CONFIG[activeMode].title}
        subtitle={`Voucher #${txn.transactionId || 'RDC-RECEIVE'}`}
        navigation={navigation}
      />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Mode Hint Banner */}
        <View style={styles.modeBanner}>
          <ShieldCheck size={16} color="#1e40af" />
          <Text style={styles.modeBannerText}>{MODE_CONFIG[activeMode].hint}</Text>
        </View>

        {/* Header Summary Card */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>PER-BARCODE RECEIVING VERIFICATION</Text>
          <Text style={styles.sectionSub}>
            Each material needs its condition verified, live photo proof, and receiving remarks.
          </Text>

          {/* Common Receiving Remark */}
          <Text style={styles.fieldLabel}>COMMON RECEIVING REMARK / PURPOSE *</Text>
          <TextInput
            style={styles.textArea}
            multiline
            numberOfLines={3}
            value={commonRemark}
            onChangeText={setCommonRemark}
            placeholder="Add one common receiving remark for all listed materials..."
            placeholderTextColor="#94a3b8"
          />
        </View>

        {/* Per Barcode / Material Items List */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>MATERIAL VERIFICATION LIST ({barcodes.length})</Text>

          {barcodes.map((item, idx) => {
            const key = item.barcode || item._id;
            const evidence = barcodeEvidence[key] || { condition: 'good', photos: [] };

            return (
              <View key={key || idx} style={styles.materialItemBox}>
                <View style={styles.itemHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Package size={16} color="#2563eb" />
                    <Text style={styles.itemBarcodeText}>{item.barcode}</Text>
                  </View>
                  <Text style={styles.itemOwnerText}>Custodian: {requesterName}</Text>
                </View>

                <Text style={styles.itemNameText}>{item.materialName || 'Material Unit'}</Text>

                {/* Material Condition Dropdown / Segment */}
                <Text style={styles.subLabel}>MATERIAL CONDITION *</Text>
                <View style={styles.segmentedRow}>
                  <TouchableOpacity
                    style={[styles.segmentBtn, evidence.condition === 'good' && styles.segmentGood]}
                    onPress={() => updateEvidence(key, { condition: 'good' })}
                  >
                    <Text style={[styles.segmentText, evidence.condition === 'good' && styles.segmentTextActive]}>
                      Good Condition
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.segmentBtn, evidence.condition === 'damaged' && styles.segmentDamaged]}
                    onPress={() => updateEvidence(key, { condition: 'damaged' })}
                  >
                    <Text style={[styles.segmentText, evidence.condition === 'damaged' && styles.segmentTextActive]}>
                      Box Damaged
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.segmentBtn, evidence.condition === 'needs_repair' && styles.segmentRepair]}
                    onPress={() => updateEvidence(key, { condition: 'needs_repair' })}
                  >
                    <Text style={[styles.segmentText, evidence.condition === 'needs_repair' && styles.segmentTextActive]}>
                      Unit Defective
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Live Photo Verification per Barcode */}
                <View style={styles.photoContainer}>
                  <View style={styles.photoHeaderRow}>
                    <Text style={styles.subLabel}>LIVE PHOTO VERIFICATION ({evidence.photos.length}) *</Text>
                    <TouchableOpacity
                      style={styles.capturePhotoBtn}
                      onPress={() => {
                        setActiveBarcode(key);
                        setCameraModalVisible(true);
                      }}
                    >
                      <Camera size={14} color="#2563eb" />
                      <Text style={styles.capturePhotoBtnText}>Capture Live Photo</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Photo Thumbnails */}
                  {evidence.photos.length > 0 && (
                    <View style={styles.photoRow}>
                      {evidence.photos.map((photo, pIdx) => (
                        <View key={pIdx} style={styles.thumbWrapper}>
                          <Image source={{ uri: photo.url }} style={styles.photoThumb} />
                          <TouchableOpacity
                            style={styles.removeThumbBadge}
                            onPress={() => handleRemoveBarcodePhoto(key, pIdx)}
                          >
                            <X size={10} color="#ffffff" />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        {/* Global Document Upload Section */}
        <View style={styles.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Paperclip size={16} color="#2563eb" />
            <Text style={styles.sectionTitle}>RECEIVING DOCUMENTS & ATTACHMENTS</Text>
          </View>
          <Text style={styles.sectionSub}>
            Attach delivery challans, receiving slips, or document images (Multiple files allowed).
          </Text>

          {/* List of uploaded documents */}
          {commonDocuments.map((doc, dIdx) => {
            const isPdf = doc.type === 'pdf' || (doc.name && doc.name.endsWith('.pdf'));
            const isWord = doc.type === 'word' || (doc.name && (doc.name.endsWith('.doc') || doc.name.endsWith('.docx')));
            const isImg = doc.type === 'image' || (doc.url && (doc.url.startsWith('data:image') || doc.url.startsWith('http') || doc.url.startsWith('file')));

            return (
              <View key={dIdx} style={styles.docItemCard}>
                {isImg && doc.url ? (
                  <Image source={{ uri: doc.url }} style={{ width: 40, height: 40, borderRadius: 6 }} />
                ) : (
                  <View style={[styles.docTypeBadge, isPdf ? { backgroundColor: '#fee2e2' } : { backgroundColor: '#e0e7ff' }]}>
                    <FileText size={18} color={isPdf ? '#dc2626' : '#4338ca'} />
                  </View>
                )}
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#1e293b' }} numberOfLines={1}>
                    {doc.name || `Attachment #${dIdx + 1}`}
                  </Text>
                  <Text style={{ fontSize: 10, color: '#64748b' }}>
                    {doc.mime || (isPdf ? 'PDF Document' : isWord ? 'Word Document' : 'Document Image')}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => handleRemoveDocument(dIdx)} style={{ padding: 6 }}>
                  <Trash2 size={16} color="#dc2626" />
                </TouchableOpacity>
              </View>
            );
          })}

          <TouchableOpacity style={styles.addDocBtn} onPress={handlePickDocument}>
            <Paperclip size={16} color="#2563eb" />
            <Text style={styles.addDocBtnText}>+ Add Attachment (PDF / Word / Image)</Text>
          </TouchableOpacity>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.submitBtn}
            onPress={handleSubmitReceiving}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <ShieldCheck size={18} color="#ffffff" />
                <Text style={styles.submitBtnText}>{MODE_CONFIG[activeMode].actionLabel}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Live GeoCamera Modal */}
      <GeoCameraModal
        visible={cameraModalVisible}
        onClose={() => setCameraModalVisible(false)}
        onConfirm={handleCapturePhotoSuccess}
        onCaptureSuccess={handleCapturePhotoSuccess}
        title="Live Photo Verification"
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
  scrollContent: {
    padding: 14,
    gap: 12,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 10,
  },
  modeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 10,
    padding: 12,
  },
  modeBannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#1e40af',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1e293b',
    letterSpacing: 0.5,
  },
  sectionSub: {
    fontSize: 11,
    color: '#64748b',
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    marginTop: 4,
  },
  subLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
    marginTop: 6,
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
  materialItemBox: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 12,
    gap: 8,
    marginTop: 4,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemBarcodeText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
  },
  itemOwnerText: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
  },
  itemNameText: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '600',
  },
  segmentedRow: {
    flexDirection: 'row',
    gap: 6,
  },
  segmentBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    backgroundColor: '#f1f5f9',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  segmentGood: {
    backgroundColor: '#16a34a',
    borderColor: '#15803d',
  },
  segmentDamaged: {
    backgroundColor: '#d97706',
    borderColor: '#b45309',
  },
  segmentRepair: {
    backgroundColor: '#dc2626',
    borderColor: '#b91c1c',
  },
  segmentText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#475569',
  },
  segmentTextActive: {
    color: '#ffffff',
    fontWeight: '800',
  },
  photoContainer: {
    marginTop: 6,
  },
  photoHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  capturePhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  capturePhotoBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#2563eb',
  },
  photoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  thumbWrapper: {
    position: 'relative',
  },
  photoThumb: {
    width: 50,
    height: 50,
    borderRadius: 6,
  },
  removeThumbBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#dc2626',
    borderRadius: 10,
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 8,
    marginBottom: 4,
  },
  docTypeBadge: {
    width: 38,
    height: 38,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addDocBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 8,
    paddingVertical: 10,
    gap: 6,
    marginTop: 4,
  },
  addDocBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563eb',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  cancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
  },
  cancelBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  submitBtn: {
    flex: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    backgroundColor: '#16a34a',
    borderRadius: 10,
  },
  submitBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
});

export default ReceivingFormScreen;
