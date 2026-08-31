import {
  ArrowRightLeft,
  ChevronRight,
  Clock,
  FolderTree,
  House as Home,
  Package,
  PlusCircle,
  RotateCcw
} from 'lucide-react-native';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialHeader from '../components/MaterialHeader';
import MaterialModuleFooter from '../components/MaterialModuleFooter';

const HUB_ITEMS = [
  {
    key: 'create_request',
    title: 'Create Material Request',
    description: 'Initiate new store sourcing voucher',
    icon: PlusCircle,
    iconColor: '#059669',
    bgColor: '#ecfdf5',
    screen: 'MaterialRequestScreen',
  },
  {
    key: 'dashboard',
    title: 'Dashboard',
    description: 'MMS Analytics & metrics overview',
    icon: Home,
    iconColor: '#4f46e5',
    bgColor: '#eef2ff',
    screen: 'MaterialDashboard',
  },
  {
    key: 'pending',
    title: 'Pending Requests',
    description: 'Awaiting TL, Mgt & Store sign-off',
    icon: Clock,
    iconColor: '#d97706',
    bgColor: '#fef3c7',
    screen: 'PendingTransactionsScreen',
  },
  {
    key: 'transactions',
    title: 'All Transactions',
    description: 'Material movement vouchers log',
    icon: Package,
    iconColor: '#2563eb',
    bgColor: '#eff6ff',
    screen: 'MaterialListScreen',
  },
  {
    key: 'tree',
    title: 'Materials Tree',
    description: 'Master stock category hierarchy',
    icon: FolderTree,
    iconColor: '#9333ea',
    bgColor: '#f3e8ff',
    screen: 'MaterialsTreeScreen',
  },
  {
    key: 'transfers',
    title: 'Transfers',
    description: 'Peer-to-peer custody hand-offs',
    icon: ArrowRightLeft,
    iconColor: '#ea580c',
    bgColor: '#ffedd5',
    screen: 'TransferListScreen',
  },
  {
    key: 'returns',
    title: 'Returns',
    description: 'Store warehouse return requests',
    icon: RotateCcw,
    iconColor: '#dc2626',
    bgColor: '#fef2f2',
    screen: 'ReturnListScreen',
  },
];

const MaterialMovementHubScreen = ({ navigation }) => {
  return (
    <SafeAreaView style={styles.container}>
      <MaterialHeader
        title="Material Movement"
        subtitle="MMS Feature Hub & Quick Access"
        navigation={navigation}
        showBack={false}
      />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.sectionHeader}>SELECT MODULE OR WORKFLOW</Text>

        <View style={styles.hubGrid}>
          {HUB_ITEMS.map((item) => {
            const IconComp = item.icon;

            return (
              <TouchableOpacity
                key={item.key}
                activeOpacity={0.8}
                style={styles.card}
                onPress={() => navigation.navigate(item.screen)}
              >
                <View style={[styles.iconBox, { backgroundColor: item.bgColor }]}>
                  <IconComp size={22} color={item.iconColor} />
                </View>

                <View style={styles.cardContent}>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <Text style={styles.cardDesc}>{item.description}</Text>
                </View>

                <ChevronRight size={20} color="#94a3b8" />
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* Material Module Footer */}
      <MaterialModuleFooter navigation={navigation} currentScreen="hub" />
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
  sectionHeader: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#64748b',
    letterSpacing: 0.8,
    marginBottom: 14,
  },
  hubGrid: {
    gap: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  iconBox: {
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  createRequestBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#059669',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  createRequestIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  createRequestTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  createRequestSubtitle: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.85)',
    marginTop: 2,
  },
  cardDesc: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
});

export default MaterialMovementHubScreen;
