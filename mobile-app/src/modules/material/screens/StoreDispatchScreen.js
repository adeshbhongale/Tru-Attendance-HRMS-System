import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  Alert,
  ActivityIndicator,
  TextInput,
  Image,
  Modal,
} from 'react-native';
import {
  Truck,
  User,
  QrCode,
  Camera,
  Plus,
  Trash2,
  Calendar,
  FileText,
  ShieldCheck,
  ChevronRight,
  X,
  Package,
  Clock,
} from 'lucide-react-native';
import MaterialHeader from '../components/MaterialHeader';
import BarcodeScannerModal from '../components/BarcodeScannerModal';
import GeoCameraModal from '../components/GeoCameraModal';
import materialApi from '../api/materialApi';

const StoreDispatchScreen = ({ route, navigation }) => {
  const { id } = route.params || {};
  const [txn, setTxn] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form Fields matching StoreDispatchPage.jsx
  const [receiverId, setReceiverId] = useState('');
  const [expectedReturnDate, setExpectedReturnDate] = useState('');
  const [dispatchMethod, setDispatchMethod] = useState('handler'); // 'handler' | 'direct'
  const [handlerId, setHandlerId] = useState('');
  const [wfContext, setWfContext] = useState(null);
  const [remarks, setRemarks] = useState('');

  // Dropdown Lists
  const [employees, setEmployees] = useState([]);
  const [handlers, setHandlers] = useState([]);

  // Material Rows state (matching transaction materials)
  const [materialRows, setMaterialRows] = useState([]);
  // Available barcodes mapping by material name: { [materialName]: [barcodeString1, barcodeString2] }
  const [rowBarcodesMap, setRowBarcodesMap] = useState({});

  // Document / Gate Pass photos & attachments state
  const [docPhotos, setDocPhotos] = useState([]);

  // Error mappings: `${matIndex}-${bcIndex}` -> error string
  const [barcodeErrors, setBarcodeErrors] = useState({});

  // Modals & Camera Trigger States
  const [activeScanner, setActiveScanner] = useState(null); // { matIndex, bcIndex } or null
  const [scannerVisible, setScannerVisible] = useState(false);
  const [openMaterialGeoIndex, setOpenMaterialGeoIndex] = useState(null); // index or null
  const [openDocGeoCamera, setOpenDocGeoCamera] = useState(false);
  const [empModalVisible, setEmpModalVisible] = useState(false);
  const [empSearchQuery, setEmpSearchQuery] = useState('');

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load employees list
      const empRes = await materialApi.getUsers();
      const empList = (empRes && (empRes.data || Array.isArray(empRes))) ? (empRes.data || empRes) : [];
      setEmployees(empList);

      // Fetch transaction details
      const txRes = await materialApi.getTransactionById(id);
      const txData = txRes && (txRes.data || txRes.transaction || txRes);

      if (!txData) {
        Alert.alert('Error', 'Transaction not found.');
        return;
      }
      setTxn(txData);

      // Fetch Workflow Engine context for active step feature flags
      try {
        const wfRes = await materialApi.getWorkflowContext(id);
        if (wfRes && wfRes.context) {
          setWfContext(wfRes.context);
          if (wfRes.context.uiPermissions?.showAssignHandler === false || wfRes.context.dispatchMethod === 'DIRECT') {
            setDispatchMethod('direct');
          }
        }
      } catch (wfErr) {
        console.warn('Workflow context fetch warning:', wfErr.message);
      }

      // Filter handlers to exclude requester
      const requesterId = (txData.requester && (txData.requester._id || txData.requester)) || '';
      const handlerList = empList.filter((emp) => (emp._id || emp.id) !== requesterId);
      setHandlers(handlerList);

      // Default receiver to requester
      setReceiverId(requesterId);

      // Set default handler if available
      if (handlerList.length > 0) {
        setHandlerId(handlerList[0]._id || handlerList[0].id);
      }

      // Expected return date calculation (no timezone shift)
      const dateVal = txData.dueDate || txData.expectedReturnDate;
      if (dateVal) {
        try {
          const rawDateStr = String(dateVal).split('T')[0];
          setExpectedReturnDate(rawDateStr);
        } catch (e) {
          console.warn('Error formatting date:', dateVal);
        }
      }

      // Load Tally Inventory for price & unit matching
      let tallyInventory = [];
      try {
        const tallyRes = await materialApi.getTallyInventory();
        tallyInventory = (tallyRes && tallyRes.materials) || [];
      } catch (tErr) {
        console.warn('Error fetching Tally inventory:', tErr);
      }

      // Map transaction materials to form rows
      const rows = (txData.materials || []).map((m) => {
        const matchedTally = tallyInventory.find(
          (item) => (item.name || '').toLowerCase() === (m.name || m.materialName || '').toLowerCase()
        );
        const qty = Number(m.quantity || m.qty) || 1;
        const bcInputs = Array(qty).fill('');

        return {
          name: m.name || m.materialName || '',
          quantity: qty,
          unit: (matchedTally && matchedTally.unit) || m.unit || 'pcs',
          description: m.description || '',
          price: (matchedTally && matchedTally.price) || m.price || 10,
          barcodes: bcInputs,
          photos: [],
          isPreExisting: true,
        };
      });

      setMaterialRows(rows);
    } catch (err) {
      console.warn('Error fetching store dispatch data:', err);
      Alert.alert('Error', 'Failed to load transaction data.');
    } finally {
      setLoading(false);
    }
  };

  // Helper to format date string without timezone shift
  const formatDisplayDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    try {
      const parts = String(dateStr).split('T')[0].split('-');
      if (parts.length === 3) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        const d = new Date(year, month, day);
        return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      }
      return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch (e) {
      return dateStr;
    }
  };

  // Fetch available store barcodes for each material in rows matching StoreDispatchPage.jsx
  const materialNamesKey = materialRows.map((r) => r.name).filter(Boolean).join(',');

  useEffect(() => {
    const fetchAvailableBarcodes = async () => {
      const uniqueNames = [...new Set(materialRows.map((r) => r.name).filter(Boolean))];
      for (const name of uniqueNames) {
        try {
          const res = await materialApi.getStoreAvailableBarcodes(name);
          const bcList = (res && (res.barcodes || res.data)) || [];
          setRowBarcodesMap((prev) => ({
            ...prev,
            [name]: bcList.map((b) => (typeof b === 'string' ? b : b.barcode)),
          }));
        } catch (err) {
          console.warn(`Failed fetching store barcodes for "${name}":`, err);
        }
      }
    };

    if (materialRows.length > 0) {
      fetchAvailableBarcodes();
    }
  }, [materialNamesKey]);

  // Live Barcode Validation matching StoreDispatchPage.jsx
  const validateBarcode = (matIndex, bcIndex, value) => {
    const key = `${matIndex}-${bcIndex}`;
    setBarcodeErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleBarcodeChange = (matIndex, bcIndex, value) => {
    const updated = [...materialRows];
    updated[matIndex].barcodes[bcIndex] = value;
    setMaterialRows(updated);
    validateBarcode(matIndex, bcIndex, value);
  };

  const handleScanBarcodeSuccess = (code) => {
    if (activeScanner) {
      const { matIndex, bcIndex } = activeScanner;
      handleBarcodeChange(matIndex, bcIndex, code);
      setActiveScanner(null);
      setScannerVisible(false);
    }
  };

  const handleQuantityChange = (index, value) => {
    const qty = parseInt(value, 10) || 1;
    const updated = [...materialRows];
    updated[index].quantity = qty;

    const currentBc = updated[index].barcodes;
    if (currentBc.length < qty) {
      const diff = qty - currentBc.length;
      updated[index].barcodes = [...currentBc, ...Array(diff).fill('')];
    } else if (currentBc.length > qty) {
      updated[index].barcodes = currentBc.slice(0, qty);
    }
    setMaterialRows(updated);
  };

  const handlePriceChange = (index, value) => {
    const updated = [...materialRows];
    updated[index].price = parseFloat(value) || 0;
    setMaterialRows(updated);
  };

  // Material GeoPhoto Confirmation Callback
  const handleConfirmMaterialGeoPhoto = (geoData) => {
    if (openMaterialGeoIndex !== null) {
      const updated = [...materialRows];
      const newPhoto = {
        url: geoData.photoUrl,
        metadata: {
          lat: (geoData.coordinates && geoData.coordinates.lat) || 18.5204,
          lng: (geoData.coordinates && geoData.coordinates.lng) || 73.8567,
          address: (geoData.coordinates && geoData.coordinates.address) || 'MIDC Store',
          capturedAt: new Date().toISOString(),
        },
      };
      updated[openMaterialGeoIndex].photos = [
        ...(updated[openMaterialGeoIndex].photos || []),
        newPhoto,
      ];
      setMaterialRows(updated);
      setOpenMaterialGeoIndex(null);
    }
  };

  // Document Attachment Handler (PDF, Word, Images)
  const handlePickDocument = () => {
    Alert.alert(
      'Attach Document',
      'Select document type to attach to dispatch:',
      [
        {
          text: 'PDF Document (.pdf)',
          onPress: () => {
            const fileName = `Challan_${Date.now()}.pdf`;
            setDocPhotos((prev) => [
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
            const fileName = `DeliveryNote_${Date.now()}.docx`;
            setDocPhotos((prev) => [
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
          text: 'Gate Pass Photo / Camera',
          onPress: () => setOpenDocGeoCamera(true),
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  // Document GeoPhoto Confirmation Callback
  const handleConfirmDocGeoPhoto = (geoData) => {
    const newDocPhoto = {
      url: geoData.photoUrl,
      name: `GatePass_${Date.now()}.jpg`,
      type: 'image',
      mime: 'image/jpeg',
      metadata: {
        lat: (geoData.coordinates && geoData.coordinates.lat) || 18.5204,
        lng: (geoData.coordinates && geoData.coordinates.lng) || 73.8567,
        address: (geoData.coordinates && geoData.coordinates.address) || 'MIDC Store Gate',
        capturedAt: new Date().toISOString(),
      },
    };
    setDocPhotos([...docPhotos, newDocPhoto]);
    setOpenDocGeoCamera(false);
  };

  const handleRemoveDocPhoto = (index) => {
    setDocPhotos(docPhotos.filter((_, idx) => idx !== index));
  };

  // Grand Total Calculation
  const getGrandTotal = () => {
    return materialRows.reduce((sum, row) => sum + row.price * row.quantity, 0);
  };

  // Dispatch Submit Handler matching StoreDispatchPage.jsx
  const handleSubmitDispatch = async () => {
    if (!receiverId) {
      Alert.alert('Validation Error', 'Receiver Employee is required.');
      return;
    }
    if (!expectedReturnDate) {
      Alert.alert('Validation Error', 'Expected Return Date is compulsory.');
      return;
    }
    if (dispatchMethod === 'handler' && !handlerId) {
      Alert.alert('Validation Error', 'Sourcing handler assignment is required.');
      return;
    }

    // Material validation checks matching web StoreDispatchPage.jsx
    for (let i = 0; i < materialRows.length; i++) {
      const row = materialRows[i];
      if (!row.name.trim()) {
        Alert.alert('Validation Error', `Please specify a name for material row #${i + 1}.`);
        return;
      }
      if (row.barcodes.some((bc) => !bc.trim())) {
        Alert.alert('Validation Error', `Please enter all barcode numbers for material "${row.name}".`);
        return;
      }
    }

    if (docPhotos.length === 0) {
      Alert.alert('Validation Error', 'At least one Gate Pass / Document attachment is required.');
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        receiver: receiverId,
        documentType: 'RDC',
        expectedReturnDate,
        priority: 'medium',
        dispatchMethod,
        handlerId: dispatchMethod === 'handler' ? handlerId : undefined,
        remarks: remarks.trim(),
        materials: materialRows.map((row) => ({
          name: row.name,
          quantity: row.quantity,
          unit: row.unit,
          description: row.description,
          price: row.price,
          barcodes: row.barcodes.map((bc) => bc.trim()),
          photos: row.photos,
        })),
        photos: docPhotos,
      };

      const res = await materialApi.dispatchTransaction(id || txn._id, payload);
      if (res && (res.success || res._id || (res.message && res.message.includes('success')))) {
        Alert.alert('Success', 'Store Sourcing & Dispatch registered successfully!');
        navigation.navigate('MaterialDetailScreen', { id: id || txn._id });
      } else {
        Alert.alert('Dispatch Error', (res && res.message) || 'Dispatch operation failed.');
      }
    } catch (err) {
      console.warn('Dispatch submission error:', err);
      Alert.alert('Dispatch Error', (err.response && err.response.data && err.response.data.message) || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !txn) {
    return (
      <SafeAreaView style={styles.container}>
        <MaterialHeader title="Store Dispatch" navigation={navigation} />
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#2563eb" />
        </View>
      </SafeAreaView>
    );
  }

  const selectedReceiverObj = employees.find((e) => (e._id || e.id) === receiverId);

  return (
    <SafeAreaView style={styles.container}>
      <MaterialHeader
        title="Store Sourcing & Dispatch"
        subtitle={`Voucher #${txn.transactionId || 'RDC-DISPATCH'}`}
        navigation={navigation}
      />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Step 1: Dispatch Metadata Header Card */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>1. DISPATCH RECIPIENT & METHOD</Text>

          {/* Top Summary Banner: Created Date-Time & Purpose */}
          <View style={styles.metaBannerBox}>
            <View style={styles.metaBannerRow}>
              <Clock size={13} color="#2563eb" />
              <Text style={styles.metaBannerLabel}>Request Created:</Text>
              <Text style={styles.metaBannerVal}>
                {txn.createdAt
                  ? new Date(txn.createdAt).toLocaleString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true,
                    })
                  : 'N/A'}
              </Text>
            </View>

            <View style={[styles.metaBannerRow, { marginTop: 4 }]}>
              <FileText size={13} color="#64748b" />
              <Text style={styles.metaBannerLabel}>Purpose:</Text>
              <Text style={styles.metaBannerValSmall}>
                {txn.description || txn.remarks || 'Material Movement & Dispatch'}
              </Text>
            </View>
          </View>

          {/* Receiver Selection (Read-only from transaction) */}
          <Text style={styles.fieldLabel}>RECEIVER EMPLOYEE</Text>
          <View style={[styles.selectBox, { backgroundColor: '#f8fafc', borderColor: '#cbd5e1' }]}>
            <User size={16} color="#64748b" />
            <Text style={[styles.selectBoxText, { color: '#0f172a', fontWeight: '700' }]}>
              {selectedReceiverObj
                ? (selectedReceiverObj.name || selectedReceiverObj.fullName)
                : (txn.requester && (txn.requester.name || txn.requester.fullName)) || 'Requester Staff'}
            </Text>
          </View>

          {/* Expected Return Date (Read-only from transaction) */}
          <Text style={styles.fieldLabel}>EXPECTED RETURN DATE</Text>
          <View style={[styles.inputIconRow, { backgroundColor: '#f8fafc', borderColor: '#cbd5e1' }]}>
            <Calendar size={16} color="#64748b" />
            <TextInput
              style={[styles.iconInput, { color: '#0f172a', fontWeight: '700' }]}
              value={formatDisplayDate(expectedReturnDate)}
              editable={false}
            />
          </View>

          {/* Dispatch Method Segment */}
          <Text style={styles.fieldLabel}>DISPATCH METHOD *</Text>
          <View style={styles.segmentedRow}>
            {(wfContext?.uiPermissions?.showAssignHandler !== false && wfContext?.dispatchMethod !== 'DIRECT') && (
              <TouchableOpacity
                style={[styles.segmentBtn, dispatchMethod === 'handler' && styles.segmentBtnActive]}
                onPress={() => setDispatchMethod('handler')}
              >
                <Truck size={16} color={dispatchMethod === 'handler' ? '#ffffff' : '#64748b'} />
                <Text style={[styles.segmentText, dispatchMethod === 'handler' && styles.segmentTextActive]}>
                  Assign Handler
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[
                styles.segmentBtn, 
                dispatchMethod === 'direct' && styles.segmentBtnActive,
                (wfContext?.uiPermissions?.showAssignHandler === false || wfContext?.dispatchMethod === 'DIRECT') && { flex: 1 }
              ]}
              onPress={() => setDispatchMethod('direct')}
            >
              <User size={16} color={dispatchMethod === 'direct' ? '#ffffff' : '#64748b'} />
              <Text style={[styles.segmentText, dispatchMethod === 'direct' && styles.segmentTextActive]}>
                Direct Dispatch (Direct to Requester)
              </Text>
            </TouchableOpacity>
          </View>

          {/* Sourcing Handler Picker */}
          {dispatchMethod === 'handler' && (
            <View>
              <Text style={styles.fieldLabel}>SOURCING TRANSPORTER / HANDLER *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                {handlers.map((h) => {
                  const hid = h._id || h.id;
                  const isSel = handlerId === hid;
                  return (
                    <TouchableOpacity
                      key={hid}
                      style={[styles.chip, isSel && styles.chipActive]}
                      onPress={() => setHandlerId(hid)}
                    >
                      <User size={14} color={isSel ? '#ffffff' : '#475569'} />
                      <Text style={[styles.chipText, isSel && styles.chipTextActive]}>
                        {h.fullName || h.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}
        </View>

        {/* Step 2: Material Items & Barcode Stock Assignment */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.sectionTitle}>2. MATERIALS & BARCODE ASSIGNMENT</Text>
          </View>

          {materialRows.map((row, matIdx) => (
            <View key={matIdx} style={styles.materialBox}>
              <View style={styles.materialBoxHeader}>
                <View style={styles.matTitleRow}>
                  <Package size={16} color="#2563eb" />
                  <Text style={styles.matNameText}>{row.name || `Material Item #${matIdx + 1}`}</Text>
                </View>
              </View>

              {/* Qty & Price Row (Read-only for existing transaction items) */}
              <View style={styles.rowGrid}>
                <View style={styles.gridCol}>
                  <Text style={styles.subLabel}>QUANTITY</Text>
                  <View style={[styles.textInput, { backgroundColor: '#f8fafc', justifyContent: 'center' }]}>
                    <Text style={{ fontWeight: '700', color: '#0f172a' }}>{row.quantity} {row.unit}</Text>
                  </View>
                </View>
                <View style={styles.gridCol}>
                  <Text style={styles.subLabel}>UNIT PRICE (₹)</Text>
                  <View style={[styles.textInput, { backgroundColor: '#f8fafc', justifyContent: 'center' }]}>
                    <Text style={{ fontWeight: '700', color: '#0f172a' }}>₹{row.price}</Text>
                  </View>
                </View>
              </View>

              {/* Barcode Inputs matching Quantity */}
              <Text style={styles.subLabel}>BARCODE NUMBERS ({row.barcodes.length}):</Text>
              {row.barcodes.map((bcVal, bcIdx) => {
                const errorKey = `${matIdx}-${bcIdx}`;
                const errText = barcodeErrors[errorKey];

                return (
                  <View key={bcIdx} style={styles.barcodeInputWrapper}>
                    <View style={[styles.barcodeInputRow, errText && styles.borderError]}>
                      <QrCode size={16} color="#64748b" />
                      <TextInput
                        style={styles.barcodeInput}
                        value={bcVal}
                        onChangeText={(v) => handleBarcodeChange(matIdx, bcIdx, v)}
                        placeholder={`Enter barcode #${bcIdx + 1}...`}
                        placeholderTextColor="#94a3b8"
                        keyboardType="numeric"
                      />
                      <TouchableOpacity
                        style={styles.scanIconButton}
                        onPress={() => {
                          setActiveScanner({ matIndex: matIdx, bcIndex: bcIdx });
                          setScannerVisible(true);
                        }}
                      >
                        <Camera size={16} color="#2563eb" />
                      </TouchableOpacity>
                    </View>
                    {errText && <Text style={styles.errorText}>{errText}</Text>}
                  </View>
                );
              })}

              {/* GeoPhoto Verification for Material (Supports Multiple Photos) */}
              <View style={styles.photoContainer}>
                <Text style={styles.subLabel}>MATERIAL PHOTO VERIFICATION (MULTIPLE PHOTOS ALLOWED):</Text>
                <View style={styles.photoRow}>
                  {(row.photos || []).map((p, pIdx) => (
                    <View key={pIdx} style={{ position: 'relative' }}>
                      <Image source={{ uri: p.url }} style={styles.photoThumb} />
                      <TouchableOpacity
                        style={styles.removePhotoBadge}
                        onPress={() => {
                          const updated = [...materialRows];
                          updated[matIdx].photos = updated[matIdx].photos.filter((_, idx) => idx !== pIdx);
                          setMaterialRows(updated);
                        }}
                      >
                        <X size={10} color="#ffffff" />
                      </TouchableOpacity>
                    </View>
                  ))}
                  <TouchableOpacity
                    style={styles.addPhotoBtn}
                    onPress={() => setOpenMaterialGeoIndex(matIdx)}
                  >
                    <Camera size={18} color="#2563eb" />
                    <Text style={styles.addPhotoBtnText}>+ Add Photo</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))}
        </View>

        {/* Step 3: Document Attachments (PDF, Word, Images) */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>3. ATTACHED DISPATCH DOCUMENTS *</Text>
          <Text style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>
            Attach PDF challans, Word documents, or image files for this dispatch (Multiple files supported)
          </Text>

          {/* List of attached documents */}
          {docPhotos.map((dp, dIdx) => {
            const isPdf = dp.type === 'pdf' || (dp.name && dp.name.endsWith('.pdf'));
            const isWord = dp.type === 'word' || (dp.name && (dp.name.endsWith('.doc') || dp.name.endsWith('.docx')));
            const isImg = dp.type === 'image' || (dp.url && (dp.url.startsWith('data:image') || dp.url.startsWith('http') || dp.url.startsWith('file')));

            return (
              <View key={dIdx} style={styles.docItemCard}>
                {isImg && dp.url ? (
                  <Image source={{ uri: dp.url }} style={{ width: 40, height: 40, borderRadius: 6 }} />
                ) : (
                  <View style={[styles.docTypeBadge, isPdf ? { backgroundColor: '#fee2e2' } : { backgroundColor: '#e0e7ff' }]}>
                    <FileText size={18} color={isPdf ? '#dc2626' : '#4338ca'} />
                  </View>
                )}
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#1e293b' }} numberOfLines={1}>
                    {dp.name || `Document #${dIdx + 1}`}
                  </Text>
                  <Text style={{ fontSize: 10, color: '#64748b' }}>
                    {dp.mime || (isPdf ? 'PDF Document' : isWord ? 'Word Document' : 'Document Image')}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => handleRemoveDocPhoto(dIdx)} style={{ padding: 6 }}>
                  <Trash2 size={16} color="#dc2626" />
                </TouchableOpacity>
              </View>
            );
          })}

          {/* Attachment button */}
          <View style={{ marginTop: 6 }}>
            <TouchableOpacity style={styles.attachBtn} onPress={handlePickDocument}>
              <FileText size={16} color="#2563eb" />
              <Text style={styles.attachBtnText}>+ Attach Document File (PDF / Word / Image)</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Remarks & Submit Card */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>4. REMARKS & CONFIRMATION</Text>
          <TextInput
            style={styles.textArea}
            multiline
            numberOfLines={3}
            value={remarks}
            onChangeText={setRemarks}
            placeholder="Enter store dispatch notes or gate pass remarks..."
            placeholderTextColor="#94a3b8"
          />

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>TOTAL VOUCHER ESTIMATE:</Text>
            <Text style={styles.totalVal}>₹{getGrandTotal().toLocaleString('en-IN')}</Text>
          </View>

          <TouchableOpacity
            style={styles.submitButton}
            onPress={handleSubmitDispatch}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ShieldCheck size={20} color="#ffffff" />
                <Text style={styles.submitButtonText}>CONFIRM STORE DISPATCH</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Barcode Scanner Modal */}
      <BarcodeScannerModal
        visible={scannerVisible}
        onClose={() => setScannerVisible(false)}
        onScanSuccess={handleScanBarcodeSuccess}
        title="Scan Material Barcode"
      />

      {/* Material GeoCamera Modal */}
      <GeoCameraModal
        visible={openMaterialGeoIndex !== null}
        onClose={() => setOpenMaterialGeoIndex(null)}
        onConfirm={handleConfirmMaterialGeoPhoto}
        onCaptureSuccess={handleConfirmMaterialGeoPhoto}
      />

      {/* Employee Receiver Selection Modal */}
      <Modal visible={empModalVisible} animationType="slide" transparent={false}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#ffffff' }}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Receiver Employee</Text>
            <TouchableOpacity onPress={() => setEmpModalVisible(false)}>
              <X size={20} color="#0f172a" />
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.searchBar}
            value={empSearchQuery}
            onChangeText={setEmpSearchQuery}
            placeholder="Search employee by name or ID..."
            placeholderTextColor="#94a3b8"
          />
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            {employees
              .filter((e) => {
                if (!empSearchQuery.trim()) return true;
                const q = empSearchQuery.toLowerCase();
                return (
                  (e.fullName || '').toLowerCase().includes(q) ||
                  (e.employeeId || '').toLowerCase().includes(q)
                );
              })
              .map((emp) => {
                const eid = emp._id || emp.id;
                return (
                  <TouchableOpacity
                    key={eid}
                    style={styles.empRow}
                    onPress={() => {
                      setReceiverId(eid);
                      setEmpModalVisible(false);
                    }}
                  >
                    <User size={18} color="#2563eb" />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={styles.empName}>{emp.fullName || emp.name}</Text>
                      <Text style={styles.empSub}>ID: {emp.employeeId || 'EMP'}</Text>
                    </View>
                    {receiverId === eid && <ShieldCheck size={18} color="#16a34a" />}
                  </TouchableOpacity>
                );
              })}
          </ScrollView>
        </SafeAreaView>
      </Modal>
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
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1e293b',
    letterSpacing: 0.5,
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
  selectBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    padding: 12,
    gap: 10,
  },
  selectBoxText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
  },
  inputIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 10,
  },
  iconInput: {
    flex: 1,
    height: 42,
    fontSize: 13,
    color: '#0f172a',
    marginLeft: 8,
  },
  segmentedRow: {
    flexDirection: 'row',
    gap: 8,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    gap: 6,
  },
  segmentBtnActive: {
    backgroundColor: '#2563eb',
  },
  segmentText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  segmentTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  chipScroll: {
    flexDirection: 'row',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    marginRight: 8,
    gap: 6,
  },
  chipActive: {
    backgroundColor: '#2563eb',
  },
  chipText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  addMaterialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#eff6ff',
    borderRadius: 6,
  },
  addMaterialBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563eb',
  },
  materialBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    gap: 8,
  },
  materialBoxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  matTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  matNameText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  textInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    paddingHorizontal: 10,
    height: 38,
    fontSize: 12,
    color: '#0f172a',
  },
  rowGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  gridCol: {
    flex: 1,
  },
  barcodeInputWrapper: {
    marginBottom: 4,
  },
  barcodeInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    paddingHorizontal: 8,
  },
  borderError: {
    borderColor: '#dc2626',
    backgroundColor: '#fef2f2',
  },
  barcodeInput: {
    flex: 1,
    height: 38,
    fontSize: 12,
    color: '#0f172a',
    marginLeft: 6,
  },
  scanIconButton: {
    padding: 6,
  },
  errorText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#dc2626',
    marginTop: 2,
  },
  photoContainer: {
    marginTop: 4,
  },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  photoThumb: {
    width: 50,
    height: 50,
    borderRadius: 6,
  },
  addPhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 6,
    paddingHorizontal: 10,
    height: 50,
  },
  addPhotoBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563eb',
  },
  removePhotoBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#dc2626',
    borderRadius: 10,
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  metaBannerBox: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 8,
    padding: 10,
    marginBottom: 4,
  },
  metaBannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaBannerLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1e40af',
  },
  metaBannerVal: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1d4ed8',
  },
  metaBannerValSmall: {
    fontSize: 11,
    color: '#334155',
    flex: 1,
  },
  docItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 8,
    marginBottom: 6,
  },
  docTypeBadge: {
    width: 38,
    height: 38,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 8,
    paddingVertical: 10,
    gap: 6,
  },
  attachBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563eb',
  },
  docPhotoWrapper: {
    position: 'relative',
  },
  photoThumbLarge: {
    width: 70,
    height: 70,
    borderRadius: 8,
  },
  removeDocPhotoBtn: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#dc2626',
    borderRadius: 10,
    padding: 2,
  },
  addDocPhotoBox: {
    width: 120,
    height: 70,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  addDocPhotoText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#2563eb',
    textAlign: 'center',
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
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  totalLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
  },
  totalVal: {
    fontSize: 15,
    fontWeight: '800',
    color: '#16a34a',
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    borderRadius: 10,
    gap: 8,
    marginTop: 6,
  },
  submitButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  searchBar: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 14,
    height: 42,
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 8,
    fontSize: 13,
    color: '#0f172a',
  },
  empRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  empName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  empSub: {
    fontSize: 11,
    color: '#64748b',
  },
});

export default StoreDispatchScreen;
