import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { theme } from '../theme';
import { User, Mail, Phone, Briefcase, LogOut, ChevronRight } from 'lucide-react-native';

const ProfileScreen = ({ navigation }) => {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.avatarContainer}>
          <Text style={styles.avatarText}>JD</Text>
        </View>
        <Text style={styles.name}>John Doe</Text>
        <Text style={styles.role}>Senior Developer • IT Department</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.infoCard}>
          <View style={styles.infoItem}>
            <Mail size={20} color={theme.colors.textMuted} />
            <View style={styles.infoTextContainer}>
              <Text style={styles.infoLabel}>Email</Text>
              <Text style={styles.infoValue}>john.doe@example.com</Text>
            </View>
          </View>
          <View style={styles.infoItem}>
            <Phone size={20} color={theme.colors.textMuted} />
            <View style={styles.infoTextContainer}>
              <Text style={styles.infoLabel}>Mobile</Text>
              <Text style={styles.infoValue}>+91 9876543210</Text>
            </View>
          </View>
          <View style={styles.infoItem}>
            <Briefcase size={20} color={theme.colors.textMuted} />
            <View style={styles.infoTextContainer}>
              <Text style={styles.infoLabel}>Shift</Text>
              <Text style={styles.infoValue}>General Shift (09:00 - 18:00)</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity style={styles.menuItem}>
          <View style={styles.menuIconContainer}>
            <User size={20} color={theme.colors.primary} />
          </View>
          <Text style={styles.menuText}>Edit Profile</Text>
          <ChevronRight size={20} color={theme.colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.menuItem, { marginTop: 20 }]}
          onPress={() => navigation.navigate('Login')}
        >
          <View style={[styles.menuIconContainer, { backgroundColor: '#fee2e2' }]}>
            <LogOut size={20} color={theme.colors.danger} />
          </View>
          <Text style={[styles.menuText, { color: theme.colors.danger }]}>Logout</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    paddingTop: 80,
    paddingBottom: 40,
    backgroundColor: 'white',
    alignItems: 'center',
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    ...theme.shadows.light,
  },
  avatarContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
  },
  avatarText: {
    color: 'white',
    fontSize: 32,
    fontWeight: '800',
  },
  name: {
    fontSize: 24,
    fontWeight: '800',
    color: theme.colors.text,
  },
  role: {
    fontSize: 14,
    color: theme.colors.textMuted,
    marginTop: 5,
    fontWeight: '600',
  },
  content: {
    padding: 20,
  },
  infoCard: {
    backgroundColor: 'white',
    borderRadius: 25,
    padding: 20,
    marginBottom: 30,
    ...theme.shadows.light,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  infoTextContainer: {
    marginLeft: 15,
  },
  infoLabel: {
    fontSize: 12,
    color: theme.colors.textMuted,
    fontWeight: '600',
  },
  infoValue: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.text,
    marginTop: 2,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 20,
    ...theme.shadows.light,
  },
  menuIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#eff6ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  menuText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
  },
});

export default ProfileScreen;
