import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  Image,
  Alert
} from 'react-native';
import { theme } from '../theme';
import { Camera, MapPin, CheckCircle } from 'lucide-react-native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000/api';

const AttendanceScreen = ({ navigation }) => {
  const [hasSelfie, setHasSelfie] = useState(false);

  const handlePunch = () => {
    if (!hasSelfie) {
      Alert.alert('Required', 'Please capture a selfie for verification');
      return;
    }
    Alert.alert('Success', 'Punch in successful!', [
      { text: 'OK', onPress: () => navigation.goBack() }
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Punch In</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.locationCard}>
          <MapPin size={24} color={theme.colors.primary} />
          <View style={{ marginLeft: 15 }}>
            <Text style={styles.locationTitle}>Current Location</Text>
            <Text style={styles.locationText}>Central Tech Park, Sector 5, Pune</Text>
            <Text style={styles.geoStatus}>Within Office Radius</Text>
          </View>
        </View>

        <View style={styles.selfieContainer}>
          <Text style={styles.sectionLabel}>Capture Selfie</Text>
          <TouchableOpacity 
            style={styles.selfieBox} 
            onPress={() => setHasSelfie(true)}
          >
            {hasSelfie ? (
              <View style={styles.selfiePreview}>
                <CheckCircle size={50} color={theme.colors.success} />
                <Text style={{ marginTop: 10, color: theme.colors.success, fontWeight: '700' }}>Selfie Captured</Text>
              </View>
            ) : (
              <View style={styles.selfiePlaceholder}>
                <Camera size={40} color={theme.colors.textMuted} />
                <Text style={styles.placeholderText}>Tap to Capture</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <TouchableOpacity 
          style={[styles.punchBtn, { backgroundColor: hasSelfie ? theme.colors.primary : '#e2e8f0' }]} 
          onPress={handlePunch}
          disabled={!hasSelfie}
        >
          <Text style={styles.punchBtnText}>Submit Punch In</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: theme.colors.text,
  },
  content: {
    padding: 20,
    gap: 30,
  },
  locationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  locationTitle: {
    fontSize: 14,
    color: theme.colors.textMuted,
    fontWeight: '600',
  },
  locationText: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
    marginTop: 2,
  },
  geoStatus: {
    fontSize: 12,
    color: theme.colors.success,
    fontWeight: '700',
    marginTop: 5,
  },
  selfieContainer: {
    gap: 15,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
  },
  selfieBox: {
    height: 300,
    backgroundColor: '#f1f5f9',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selfiePlaceholder: {
    alignItems: 'center',
  },
  placeholderText: {
    marginTop: 10,
    color: theme.colors.textMuted,
    fontWeight: '600',
  },
  selfiePreview: {
    alignItems: 'center',
  },
  punchBtn: {
    height: 60,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
    ...theme.shadows.medium,
  },
  punchBtnText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '700',
  },
});

export default AttendanceScreen;
