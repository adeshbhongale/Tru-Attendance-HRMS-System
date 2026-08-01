import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { QrCode, User, Camera, Send, ArrowRightLeft } from 'lucide-react-native';
import MaterialHeader from '../components/MaterialHeader';
import BarcodeScannerModal from '../components/BarcodeScannerModal';
import GeoCameraModal from '../components/GeoCameraModal';
import materialApi from '../api/materialApi';

const TransferMaterialScreen = ({ route, navigation }) => {
  const initialBarcode = route.params?.barcode || '';
  const [barcode, setBarcode] = useState(initialBarcode);
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [scannerVisible, setScannerVisible] = useState(false);
  const [cameraModalVisible, setCameraModalVisible] = useState(false);
  const [geoPayload, setGeoPayload] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const res = await materialApi.getUsers();
      if (res && (res.data || Array.isArray(res))) {
        const list = res.data || res;
        setUsers(list);
        if (list.length > 0) setSelectedUserId(list[0]._id || list[0].id);
      }
    } catch (e) {
      console.warn('Could not load users for transfer', e);
    }
  };

  const handleGeoCaptured = (geoData) => {
    setGeoPayload(geoData);
  };

  const handleSubmitTransfer = async () => {
    if (!barcode.trim()) {
      Alert.alert('Validation Error', 'Please enter or scan a valid barcode.');
      return;
    }
    if (!selectedUserId) {
      Alert.alert('Validation Error', 'Please select a recipient user for custody hand-off.');
      return;
    }
    if (!geoPayload) {
      Alert.alert('Validation Error', 'Mandatory Photo & GPS checkpoint required before hand-off.');
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        barcode: barcode.trim(),
        toUser: selectedUserId,
        photoUrl: geoPayload.photoUrl,
        coordinates: geoPayload.coordinates,
      };

      const res = await materialApi.transferBarcode(payload);
      if (res && (res.success || res._id)) {
        Alert.alert('Success', 'Barcode custody transfer initiated!');
        navigation.navigate('BarcodeViewAllScreen');
      } else {
        Alert.alert('Error', res?.message || 'Transfer failed.');
      }
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <MaterialHeader
        title="Peer Custody Transfer"
        subtitle="Hand-off item to another staff member"
        navigation={navigation}
      />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Barcode Input & Scanner */}
        <Text style={styles.label}>ITEM BARCODE</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="e.g. BAR-2026-9812"
            placeholderTextColor="#94a3b8"
            value={barcode}
            onChangeText={setBarcode}
            autoCapitalize="characters"
          />
          <TouchableOpacity onPress={() => setScannerVisible(true)} style={styles.scanBtn}>
            <QrCode size={20} color="#ffffff" />
          </TouchableOpacity>
        </View>

        {/* Target Recipient User */}
        <Text style={styles.label}>SELECT RECIPIENT (NEW CUSTODIAN)</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.usersScroll}>
          {users.map((u) => {
            const uid = u._id || u.id;
            const uName = u.fullName || u.name || 'User';
            const isSelected = selectedUserId === uid;

            return (
              <TouchableOpacity
                key={uid}
                style={[styles.userChip, isSelected && styles.userChipActive]}
                onPress={() => setSelectedUserId(uid)}
              >
                <User size={16} color={isSelected ? '#ffffff' : '#64748b'} />
                <Text style={[styles.userChipText, isSelected && styles.userChipTextActive]}>
                  {uName}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Mandatory Photo & GPS Checkpoint */}
        <Text style={styles.label}>MANDATORY CUSTODY CHECKPOINT</Text>
        <TouchableOpacity
          onPress={() => setCameraModalVisible(true)}
          style={[styles.geoBtn, geoPayload && styles.geoBtnSuccess]}
        >
          <Camera size={20} color={geoPayload ? '#ffffff' : '#4f46e5'} />
          <Text style={[styles.geoBtnText, geoPayload && styles.geoBtnTextSuccess]}>
            {geoPayload ? 'Photo & GPS Checkpoint Logged ✓' : 'Capture Hand-off Photo & GPS'}
          </Text>
        </TouchableOpacity>

        {/* Submit Transfer */}
        <TouchableOpacity
          onPress={handleSubmitTransfer}
          disabled={submitting}
          style={styles.submitBtn}
        >
          {submitting ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <>
              <Send size={18} color="#ffffff" />
              <Text style={styles.submitBtnText}>Confirm Custody Hand-off</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Barcode Live Scanner Modal */}
      <BarcodeScannerModal
        visible={scannerVisible}
        onClose={() => setScannerVisible(false)}
        onScanSuccess={(scannedCode) => setBarcode(scannedCode)}
      />

      {/* Geo Camera Checkpoint Modal */}
      <GeoCameraModal
        visible={cameraModalVisible}
        onClose={() => setCameraModalVisible(false)}
        onCaptureSuccess={handleGeoCaptured}
        title="Custody Hand-off Checkpoint"
      />
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
  inputRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  input: {
    flex: 1,
    height: 48,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#0f172a',
  },
  scanBtn: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: '#4f46e5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  usersScroll: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  userChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 6,
  },
  userChipActive: {
    backgroundColor: '#4f46e5',
    borderColor: '#4f46e5',
  },
  userChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  userChipTextActive: {
    color: '#ffffff',
  },
  geoBtn: {
    height: 52,
    backgroundColor: '#eef2ff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#c7d2fe',
    borderStyle: 'dashed',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginVertical: 10,
  },
  geoBtnSuccess: {
    backgroundColor: '#10b981',
    borderColor: '#10b981',
    borderStyle: 'solid',
  },
  geoBtnText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#4f46e5',
  },
  geoBtnTextSuccess: {
    color: '#ffffff',
  },
  submitBtn: {
    height: 52,
    backgroundColor: '#ea580c',
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

export default TransferMaterialScreen;
