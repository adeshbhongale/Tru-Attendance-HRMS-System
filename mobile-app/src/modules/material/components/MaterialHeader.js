import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ArrowLeft, Menu } from 'lucide-react-native';
import { useSidebar } from '../../../context/SidebarContext';

const MaterialHeader = ({ title, subtitle, navigation, showBack = true, rightElement = null }) => {
  const { openSidebar } = useSidebar();

  return (
    <View style={styles.headerContainer}>
      <View style={styles.leftRow}>
        {showBack ? (
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
            <ArrowLeft size={22} color="#1e293b" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={openSidebar} style={styles.iconBtn}>
            <Menu size={22} color="#1e293b" />
          </TouchableOpacity>
        )}
        <View style={styles.titleBox}>
          <Text style={styles.titleText} numberOfLines={1}>{title}</Text>
          {subtitle && <Text style={styles.subtitleText} numberOfLines={1}>{subtitle}</Text>}
        </View>
      </View>
      {rightElement && <View style={styles.rightBox}>{rightElement}</View>}
    </View>
  );
};

const styles = StyleSheet.create({
  headerContainer: {
    height: 60,
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  leftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconBtn: {
    padding: 6,
    marginRight: 10,
  },
  titleBox: {
    flex: 1,
  },
  titleText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  subtitleText: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 1,
  },
  rightBox: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});

export default MaterialHeader;
