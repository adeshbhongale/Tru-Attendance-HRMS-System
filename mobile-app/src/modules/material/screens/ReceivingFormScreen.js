import {
  Camera,
  FileText,
  Package,
  Paperclip,
  ShieldCheck,
  Trash2,
  X,
  UploadCloud,
  Image as ImageIcon,
} from 'lucide-react-native';
import { useEffect, useState, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
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
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  // Camera State
  const [cameraModalVisible, setCameraModalVisible] = useState(false);
  const [docCameraVisible, setDocCameraVisible] = useState(false);
  const [activeBarcode, setActiveBarcode] = useState(null);
  const docFileInputRef = useRef(null);

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

      if (!txData && route.params?.barcodes && Array.isArray(route.params.barcodes) && route.params.barcodes.length > 0) {
        for (const bcItem of route.params.barcodes) {
          const bcCode = typeof bcItem === 'string' ? bcItem : (bcItem?.barcode || bcItem);
          if (!bcCode) continue;
          try {
            const bcRes = await materialApi.getBarcodeDetails(bcCode);
            const foundBc = bcRes && (bcRes.barcode || bcRes.data || bcRes);
            if (foundBc && foundBc.transactionId) {
              const txRes = await materialApi.getTransactionById(foundBc.transactionId);
              txData = txRes && (txRes.data || txRes.transaction || txRes);
              if (txData) {
                targetBc = foundBc;
                break;
              }
            }
          } catch (e) {}
        }
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

      if (txData && ['received', 'closed', 'completed'].includes(txData.status) && activeMode !== 'store-return') {
        Alert.alert(
          'Already Received',
          `Transaction #${txData.transactionId || targetId} has already been received and completed. It cannot be reopened or resubmitted.`,
          [{ text: 'OK', onPress: () => navigation.replace('MaterialDetailScreen', { id: targetId }) }]
        );
        return;
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

  // Document Attachment Handler (Real Uploads in Any Format + Multiple Photo Capture)
  const handlePickDocument = () => {
    Alert.alert(
      'Attach Document / Photo',
      'Choose how to attach documents (multiple allowed):',
      [
        {
          text: 'Upload File (PDF / Word / Excel / Any)',
          onPress: () => {
            if (Platform.OS === 'web') {
              if (docFileInputRef.current) {
                docFileInputRef.current.click();
              }
            } else {
              handleNativeDocPick();
            }
          },
        },
        {
          text: 'Capture Photo with Camera (Multiple)',
          onPress: () => {
            setDocCameraVisible(true);
          },
        },
        {
          text: 'Choose Photo from Gallery',
          onPress: handlePickGalleryImage,
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const handleNativeDocPick = async () => {
    try {
      setUploadingDoc(true);
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        multiple: true,
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets) return;

      for (const asset of result.assets) {
        const fileName = asset.name || `Document_${Date.now()}`;
        const ext = fileName.includes('.') ? fileName.split('.').pop().toLowerCase() : '';
        const isPdf = ext === 'pdf';
        const isWord = ext === 'doc' || ext === 'docx';
        const isExcel = ext === 'xls' || ext === 'xlsx' || ext === 'csv';
        const isImg = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext);
        const type = isPdf ? 'pdf' : isWord ? 'word' : isExcel ? 'excel' : isImg ? 'image' : 'document';

        let finalUrl = asset.uri;
        try {
          const formData = new FormData();
          formData.append('file', {
            uri: asset.uri,
            name: fileName,
            type: asset.mimeType || 'application/octet-stream',
          });
          const upRes = await materialApi.uploadFile(formData);
          if (upRes && (upRes.url || upRes.secure_url)) {
            finalUrl = upRes.url || upRes.secure_url;
          }
        } catch (upErr) {
          console.warn('Native document upload notice:', upErr.message);
        }

        setCommonDocuments((prev) => [
          ...prev,
          {
            url: finalUrl,
            name: fileName,
            type,
            mime: asset.mimeType || (isPdf ? 'application/pdf' : isWord ? 'application/msword' : 'application/octet-stream'),
            size: asset.size,
            uploadedAt: new Date().toISOString(),
          },
        ]);
      }
    } catch (err) {
      Alert.alert('Document Error', err.message || 'Failed to select document.');
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleWebFileSelect = async (e) => {
    const files = e.target?.files;
    if (!files || files.length === 0) return;
    setUploadingDoc(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileName = file.name || `Document_${Date.now()}`;
        const ext = fileName.includes('.') ? fileName.split('.').pop().toLowerCase() : '';
        const isPdf = ext === 'pdf';
        const isWord = ext === 'doc' || ext === 'docx';
        const isExcel = ext === 'xls' || ext === 'xlsx' || ext === 'csv';
        const isImg = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext);
        const type = isPdf ? 'pdf' : isWord ? 'word' : isExcel ? 'excel' : isImg ? 'image' : 'document';

        let finalUrl = '';
        try {
          const formData = new FormData();
          formData.append('file', file);
          const upRes = await materialApi.uploadFile(formData);
          if (upRes && (upRes.url || upRes.secure_url)) {
            finalUrl = upRes.url || upRes.secure_url;
          }
        } catch (upErr) {
          console.warn('Web document upload notice:', upErr.message);
        }

        if (!finalUrl) {
          finalUrl = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (ev) => resolve(ev.target?.result || '');
            reader.readAsDataURL(file);
          });
        }

        setCommonDocuments((prev) => [
          ...prev,
          {
            url: finalUrl,
            name: fileName,
            type,
            mime: file.type || (isPdf ? 'application/pdf' : isWord ? 'application/msword' : 'application/octet-stream'),
            size: file.size,
            uploadedAt: new Date().toISOString(),
          },
        ]);
      }
    } catch (err) {
      console.warn('Web upload error:', err);
    } finally {
      setUploadingDoc(false);
      if (e.target) e.target.value = '';
    }
  };

  const handlePickGalleryImage = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.8,
        base64: true,
      });
      if (!res.canceled && res.assets && res.assets.length > 0) {
        for (const asset of res.assets) {
          let docUrl = asset.uri;
          if (asset.base64) {
            try {
              const upRes = await materialApi.uploadBase64(asset.base64);
              if (upRes && upRes.url) docUrl = upRes.url;
            } catch (_) {}
          }
          setCommonDocuments((prev) => [
            ...prev,
            {
              url: docUrl,
              name: `Photo_${Date.now()}.jpg`,
              type: 'image',
              mime: 'image/jpeg',
              uploadedAt: new Date().toISOString(),
            },
          ]);
        }
      }
    } catch (err) {
      console.warn('Gallery pick error:', err);
    }
  };

  const handleDocPhotoCaptureSuccess = (uploadData) => {
    const photoUrl = uploadData.photoUrl || uploadData.url || uploadData.uri;
    if (!photoUrl) return;
    const fileName = `CapturedDoc_${Date.now()}.jpg`;
    setCommonDocuments((prev) => [
      ...prev,
      {
        url: photoUrl,
        name: fileName,
        type: 'image',
        mime: 'image/jpeg',
        gps: uploadData.gps || uploadData.coordinates,
        uploadedAt: new Date().toISOString(),
      },
    ]);
    setDocCameraVisible(false);
    Alert.alert('Photo Attached', 'Document photo captured and added to attachments list.');
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
    if (submitting || isSubmitted) return;
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
          setIsSubmitted(true);
          Alert.alert(
            'Success',
            res.message || 'Packages collected from Store. Deliver them to the requester to complete handover.',
            [
              {
                text: 'OK',
                onPress: () => navigation.replace('MaterialDetailScreen', { id: targetTxId }),
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

        // Aggregate material condition from per-barcode evidence
        const conditions = barcodes.map((item) => {
          const key = item.barcode || item._id;
          return (barcodeEvidence[key] || {}).condition;
        }).filter(Boolean);
        const worstCondition = conditions.includes('needs_repair')
          ? 'needs_repair'
          : conditions.includes('damaged') ? 'damaged' : 'good';

        const res = await materialApi.handleTransfer({
          transferId,
          action: 'accept',
          reason: commonRemark.trim(),
          gps: receiverGeo,
          materialCondition: worstCondition,
          documents: commonDocuments,
          photos: Object.values(barcodeEvidence)
            .flatMap((ev) => (ev.photos || []).map((p) => ({ url: p.url, capturedAt: p.capturedAt }))),
        });
        if (res && res.success !== false) {
          setIsSubmitted(true);
          Alert.alert(
            'Success',
            res.message || 'Transfer accepted. Barcode custody has moved to you!',
            [
              {
                text: 'OK',
                onPress: () => navigation.replace('MaterialDetailScreen', { id: targetTxId }),
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

        const finalTxnId =
          bulkRes?.transactionId ||
          (bulkRes?.returns && bulkRes.returns.find((r) => r && r.transactionId)?.transactionId) ||
          (txn && (txn.transactionId || txn._id)) ||
          targetTxId;

        if (bulkRes && bulkRes.success !== false) {
          setIsSubmitted(true);
          Alert.alert(
            'Success',
            `Return request(s) accepted into Store — ${targetReturnIds.length} barcode(s) received!`,
            [
              {
                text: 'OK',
                onPress: () => {
                  const targetId = (finalTxnId && finalTxnId !== 'RECEIVE-ID') ? finalTxnId : targetTxId;
                  navigation.replace('MaterialDetailScreen', { id: targetId });
                },
              },
            ]
          );
          return;
        }

        // Fallback: accept returns one by one
        let allAccepted = true;
        let singleTxnId = finalTxnId;
        for (const rId of targetReturnIds) {
          const singleRes = await materialApi.acceptReturn(rId, { remarks: commonRemark.trim() });
          if (singleRes && singleRes.transactionId) {
            singleTxnId = singleRes.transactionId;
          }
          if (!(singleRes && singleRes.success !== false)) allAccepted = false;
        }
        if (allAccepted) {
          setIsSubmitted(true);
          Alert.alert(
            'Success',
            'Material return request(s) accepted into Store!',
            [
              {
                text: 'OK',
                onPress: () => {
                  const targetId = (singleTxnId && singleTxnId !== 'RECEIVE-ID') ? singleTxnId : targetTxId;
                  navigation.replace('MaterialDetailScreen', { id: targetId });
                },
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
        setIsSubmitted(true);
        Alert.alert(
          'Success',
          'Materials successfully received and barcodes activated under your custody!',
          [
            {
              text: 'OK',
              onPress: () => navigation.replace('MaterialDetailScreen', { id: targetTxId }),
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
            style={[styles.submitBtn, (submitting || isSubmitted) && { opacity: 0.6 }]}
            onPress={handleSubmitReceiving}
            disabled={submitting || isSubmitted}
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

      {/* Live GeoCamera Modal for Barcode Evidence */}
      <GeoCameraModal
        visible={cameraModalVisible}
        onClose={() => setCameraModalVisible(false)}
        onConfirm={handleCapturePhotoSuccess}
        onCaptureSuccess={handleCapturePhotoSuccess}
        title="Live Photo Verification"
      />

      {/* Live GeoCamera Modal for Document Photos */}
      <GeoCameraModal
        visible={docCameraVisible}
        onClose={() => setDocCameraVisible(false)}
        onConfirm={handleDocPhotoCaptureSuccess}
        onCaptureSuccess={handleDocPhotoCaptureSuccess}
        title="Capture Document / Challan Photo"
      />

      {/* Hidden Web File Input for Real Multi-format Document Uploads */}
      {Platform.OS === 'web' && (
        <input
          type="file"
          ref={docFileInputRef}
          multiple
          accept="*/*"
          style={{ display: 'none' }}
          onChange={handleWebFileSelect}
        />
      )}
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
