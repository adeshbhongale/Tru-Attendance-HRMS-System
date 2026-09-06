import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  RefreshControl,
  TextInput,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  FolderTree,
  Package,
  ChevronRight,
  ChevronDown,
  QrCode,
  User,
  Search,
  Building,
  Box,
  CircleCheck,
  RotateCcw,
  ArrowRightLeft,
  Tag,
} from 'lucide-react-native';
import MaterialHeader from '../components/MaterialHeader';
import MaterialModuleFooter from '../components/MaterialModuleFooter';
import StatusBadge from '../components/StatusBadge';
import materialApi from '../api/materialApi';

const MaterialsTreeScreen = ({ navigation }) => {
  const [materialsTree, setMaterialsTree] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedMaterials, setExpandedMaterials] = useState({});
  const [currentUser, setCurrentUser] = useState(null);

  const buildTreeFromTransactions = (txnsList, myBarcodesList, userObj) => {
    const targetUserId = String(userObj?._id || userObj?.id || userObj?.user?._id || userObj?.user?.id || '');

    // Map active barcodes for quick lookup
    const barcodeMetaMap = new Map();
    (myBarcodesList || []).forEach((b) => {
      if (b && b.barcode) {
        barcodeMetaMap.set(String(b.barcode).trim().toUpperCase(), b);
      }
    });

    // Filter transactions to those created by or belonging to logged-in user
    const userTxns = (txnsList || []).filter((t) => {
      if (!t) return false;
      const reqId = String(t.requester?._id || t.requester?.id || t.requester || '');
      const createdById = String(t.createdBy?._id || t.createdBy?.id || t.createdBy || '');
      const senderId = String(t.sender?._id || t.sender?.id || t.sender || '');
      if (targetUserId) {
        return reqId === targetUserId || createdById === targetUserId || senderId === targetUserId;
      }
      return true;
    });

    const effectiveTxns = userTxns.length > 0 ? userTxns : (txnsList || []);
    const materialsMap = new Map();

    effectiveTxns.forEach((txn) => {
      const tId = txn.transactionId || '';
      const deptName = txn.department?.name || txn.department || '';
      const reqName = txn.requester?.fullName || txn.requester?.name || userObj?.fullName || 'Active Requester';

      if (Array.isArray(txn.materials)) {
        txn.materials.forEach((m) => {
          if (!m || !m.name) return;
          const matName = String(m.name).trim();
          const key = matName.toLowerCase();

          if (!materialsMap.has(key)) {
            materialsMap.set(key, {
              materialName: matName,
              category: m.category || txn.documentType || 'Requested Material',
              unit: m.unit || 'Nos',
              price: Number(m.price) || 0,
              totalCount: 0,
              activeCount: 0,
              returnedCount: 0,
              transferredCount: 0,
              exchangedCount: 0,
              splitCount: 0,
              barcodesMap: new Map(),
            });
          }

          const grp = materialsMap.get(key);
          if (Number(m.price) > 0 && !grp.price) grp.price = Number(m.price);
          if (m.unit && grp.unit === 'Nos') grp.unit = m.unit;

          if (Array.isArray(m.barcodes)) {
            m.barcodes.forEach((bEntry) => {
              const bCode = typeof bEntry === 'string' ? bEntry.trim().toUpperCase() : (bEntry?.barcode || '').trim().toUpperCase();
              if (!bCode) return;

              const liveMeta = barcodeMetaMap.get(bCode);
              const bStatus = liveMeta?.status || (typeof bEntry === 'object' ? bEntry.status : null) || 'Active';

              if (!grp.barcodesMap.has(bCode)) {
                grp.barcodesMap.set(bCode, {
                  _id: liveMeta?._id || bCode,
                  barcode: bCode,
                  status: bStatus,
                  unit: grp.unit,
                  ownerName: liveMeta?.owner?.fullName || liveMeta?.owner?.name || reqName,
                  ownerEmployeeId: liveMeta?.owner?.employeeId || '',
                  departmentName: deptName,
                  transactionId: tId,
                  isSplit: Boolean(liveMeta?.isSplit || (m.description && m.description.toLowerCase().includes('split'))),
                  splitFrom: liveMeta?.parentBarcode || liveMeta?.splitFrom || null,
                  isExchangeChild: Boolean(liveMeta?.isExchangeChild),
                  exchangeFrom: liveMeta?.exchangeFrom || null,
                  createdAt: liveMeta?.createdAt || txn.createdAt,
                  children: [],
                });
              }
            });
          }
        });
      }
    });

    // Also match any active barcodes held by the user into the tree
    (myBarcodesList || []).forEach((b) => {
      if (!b || !b.barcode) return;
      const bCode = String(b.barcode).trim().toUpperCase();
      const matName = (b.materialName || '').trim();
      const key = matName.toLowerCase();

      if (materialsMap.has(key)) {
        const grp = materialsMap.get(key);
        if (!grp.barcodesMap.has(bCode)) {
          grp.barcodesMap.set(bCode, {
            _id: b._id || bCode,
            barcode: bCode,
            status: b.status || 'Active',
            unit: b.unit || grp.unit,
            ownerName: b.owner?.fullName || b.owner?.name || userObj?.fullName || 'Active Requester',
            ownerEmployeeId: b.owner?.employeeId || '',
            departmentName: b.ownerDepartment?.name || b.ownerDepartment || '',
            transactionId: b.transactionId || '',
            isSplit: Boolean(b.isSplit),
            splitFrom: b.parentBarcode || b.splitFrom || null,
            isExchangeChild: Boolean(b.isExchangeChild),
            exchangeFrom: b.exchangeFrom || null,
            createdAt: b.createdAt,
            children: [],
          });
        }
      }
    });

    const treeResult = Array.from(materialsMap.values()).map((grp) => {
      const barcodesArray = Array.from(grp.barcodesMap.values());
      let activeCount = 0;
      let returnedCount = 0;
      let transferredCount = 0;
      let exchangedCount = 0;
      let splitCount = 0;

      barcodesArray.forEach((b) => {
        const st = (b.status || '').toLowerCase();
        if (st === 'active') activeCount++;
        else if (st === 'returned') returnedCount++;
        else if (st === 'transferred') transferredCount++;
        else if (st === 'exchanged') exchangedCount++;
        else if (st.includes('split')) splitCount++;
      });

      const nodeMap = new Map(barcodesArray.map((b) => [b.barcode, { ...b, children: [] }]));
      const roots = [];

      barcodesArray.forEach((b) => {
        const node = nodeMap.get(b.barcode);
        const parentCode = b.splitFrom || b.exchangeFrom;
        if (parentCode && nodeMap.has(parentCode) && parentCode !== b.barcode) {
          nodeMap.get(parentCode).children.push(node);
        } else {
          roots.push(node);
        }
      });

      return {
        materialName: grp.materialName,
        category: grp.category,
        unit: grp.unit,
        price: grp.price,
        totalCount: barcodesArray.length,
        activeCount,
        returnedCount,
        transferredCount,
        exchangedCount,
        splitCount,
        barcodes: barcodesArray,
        tree: roots,
      };
    });

    treeResult.sort((a, b) => b.totalCount - a.totalCount || a.materialName.localeCompare(b.materialName));
    return treeResult;
  };

  const fetchTreeData = async () => {
    try {
      setLoading(true);

      // Load logged-in user details from AsyncStorage
      let userObj = null;
      try {
        const uStr = await AsyncStorage.getItem('user');
        if (uStr) userObj = JSON.parse(uStr);
      } catch (_) {}

      const cachedUserId = await AsyncStorage.getItem('userId');
      const targetUserId = userObj?._id || userObj?.id || cachedUserId;
      setCurrentUser(userObj);

      // Fetch user's transactions and active barcodes to display ONLY user-created materials and their barcodes
      const [txnsRes, myBarcodesRes] = await Promise.all([
        materialApi.getTransactions({ tab: 'all', status: 'all' }).catch(() => ({ data: [] })),
        materialApi.getMyActiveBarcodes().catch(() => ({ data: [] })),
      ]);

      const txnsList = Array.isArray(txnsRes?.data?.data)
        ? txnsRes.data.data
        : (Array.isArray(txnsRes?.data) ? txnsRes.data : (Array.isArray(txnsRes) ? txnsRes : []));

      const myBarcodesList = Array.isArray(myBarcodesRes?.data)
        ? myBarcodesRes.data
        : (Array.isArray(myBarcodesRes?.barcodes) ? myBarcodesRes.barcodes : []);

      let treeData = buildTreeFromTransactions(txnsList, myBarcodesList, userObj);

      // If no local transaction tree formed, attempt getMaterialsTree as graceful fallback
      if (treeData.length === 0) {
        try {
          const treeRes = await materialApi.getMaterialsTree({
            userOnly: true,
            userId: targetUserId,
          });
          const rawData = Array.isArray(treeRes?.data)
            ? treeRes.data
            : (Array.isArray(treeRes?.materials) ? treeRes.materials : []);
          if (rawData.length > 0) {
            treeData = rawData;
          }
        } catch (_) {}
      }

      setMaterialsTree(treeData);

      // Auto-expand first 3 materials by default
      const initialExpanded = {};
      treeData.slice(0, 3).forEach((m, idx) => {
        const key = m.materialName || String(idx);
        initialExpanded[key] = true;
      });
      setExpandedMaterials(initialExpanded);
    } catch (e) {
      console.warn('Materials tree fetch error:', e);
      setMaterialsTree([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchTreeData();
  }, []);

  const toggleExpand = (materialName) => {
    setExpandedMaterials((prev) => ({
      ...prev,
      [materialName]: !prev[materialName],
    }));
  };

  const expandAll = () => {
    const all = {};
    materialsTree.forEach((m, idx) => {
      all[m.materialName || String(idx)] = true;
    });
    setExpandedMaterials(all);
  };

  const collapseAll = () => {
    setExpandedMaterials({});
  };

  // Metrics summary for logged-in user's materials
  const metrics = useMemo(() => {
    let totalMats = materialsTree.length;
    let totalBc = 0;
    let activeBc = 0;
    let returnedBc = 0;
    let transferredBc = 0;

    materialsTree.forEach((m) => {
      totalBc += Number(m.totalCount || 0);
      activeBc += Number(m.activeCount || 0);
      returnedBc += Number(m.returnedCount || 0);
      transferredBc += Number(m.transferredCount || 0);
    });

    return { totalMats, totalBc, activeBc, returnedBc, transferredBc };
  }, [materialsTree]);

  // Filtered Materials
  const filteredTree = useMemo(() => {
    const q = (searchQuery || '').trim().toLowerCase();
    if (!q) return materialsTree;

    return materialsTree.filter((m) => {
      const nameMatch = (m.materialName || '').toLowerCase().includes(q);
      const catMatch = (m.category || '').toLowerCase().includes(q);
      const barcodeMatch =
        Array.isArray(m.barcodes) &&
        m.barcodes.some((b) => (b.barcode || '').toLowerCase().includes(q));
      return nameMatch || catMatch || barcodeMatch;
    });
  }, [materialsTree, searchQuery]);

  // Render Barcode Node in Tree
  const renderBarcodeNode = (node, depth = 0, isChild = false) => {
    if (!node) return null;

    return (
      <View key={node.barcode || String(Math.random())} style={{ marginLeft: depth * 14 }}>
        <TouchableOpacity
          style={[styles.barcodeCard, isChild && styles.childBarcodeCard]}
          onPress={() => navigation.navigate('BarcodeDetailScreen', { barcode: node.barcode })}
          activeOpacity={0.7}
        >
          <View style={styles.barcodeHeaderRow}>
            <View style={styles.barcodeTitleGroup}>
              {isChild ? (
                <Text style={styles.branchSymbol}>↳</Text>
              ) : (
                <QrCode size={16} color="#4f46e5" />
              )}
              <Text style={styles.barcodeText}>{node.barcode}</Text>
              {node.isSplit && (
                <View style={styles.miniTag}>
                  <Text style={styles.miniTagText}>{isChild ? 'Child Split' : 'Parent Lot'}</Text>
                </View>
              )}
              {node.isExchangeChild && (
                <View style={[styles.miniTag, { backgroundColor: '#fdf4ff', borderColor: '#d8b4fe' }]}>
                  <Text style={[styles.miniTagText, { color: '#9333ea' }]}>Exchanged</Text>
                </View>
              )}
            </View>
            <StatusBadge status={node.status || 'Active'} />
          </View>

          <View style={styles.barcodeMetaRow}>
            <View style={styles.metaItem}>
              <User size={12} color="#64748b" />
              <Text style={styles.metaText} numberOfLines={1}>
                {node.ownerName || currentUser?.fullName || 'My Custody'}
              </Text>
            </View>

            {Boolean(node.departmentName) && (
              <View style={styles.metaItem}>
                <Building size={12} color="#64748b" />
                <Text style={styles.metaText} numberOfLines={1}>
                  {node.departmentName}
                </Text>
              </View>
            )}

            {Boolean(node.transactionId) && (
              <View style={styles.metaItem}>
                <Tag size={12} color="#64748b" />
                <Text style={styles.metaText} numberOfLines={1}>
                  {node.transactionId}
                </Text>
              </View>
            )}
          </View>
        </TouchableOpacity>

        {/* Render nested children (e.g. split child barcodes or warranty replacements) */}
        {Array.isArray(node.children) && node.children.length > 0 && (
          <View style={styles.childrenContainer}>
            {node.children.map((child) => renderBarcodeNode(child, depth + 1, true))}
          </View>
        )}
      </View>
    );
  };

  // Render each Material Accordion Card
  const renderMaterialCard = ({ item }) => {
    const isExpanded = Boolean(expandedMaterials[item.materialName]);
    const barcodesList =
      Array.isArray(item.tree) && item.tree.length > 0
        ? item.tree
        : (Array.isArray(item.barcodes) ? item.barcodes : []);

    return (
      <View style={styles.materialCard}>
        <TouchableOpacity
          style={styles.materialCardHeader}
          onPress={() => toggleExpand(item.materialName)}
          activeOpacity={0.7}
        >
          <View style={styles.matIconWrap}>
            <Package size={20} color="#4f46e5" />
          </View>

          <View style={styles.matHeaderInfo}>
            <Text style={styles.materialTitle}>{item.materialName}</Text>
            <View style={styles.matCategoryRow}>
              <Text style={styles.categoryBadge}>{item.category || 'Requested Stock'}</Text>
              <Text style={styles.unitText}>Unit: {item.unit || 'Nos'}</Text>
              {Number(item.price) > 0 && (
                <Text style={styles.priceBadge}>₹{item.price}</Text>
              )}
            </View>
          </View>

          <View style={styles.expandAction}>
            <View style={styles.badgePill}>
              <Text style={styles.badgePillText}>{item.totalCount || 0}</Text>
            </View>
            {isExpanded ? (
              <ChevronDown size={20} color="#475569" />
            ) : (
              <ChevronRight size={20} color="#94a3b8" />
            )}
          </View>
        </TouchableOpacity>

        {/* Summary Stats Row */}
        <View style={styles.materialStatsRow}>
          <View style={[styles.statChip, { backgroundColor: '#f0fdf4' }]}>
            <CircleCheck size={12} color="#16a34a" />
            <Text style={[styles.statChipText, { color: '#16a34a' }]}>
              Active: {item.activeCount || 0}
            </Text>
          </View>

          <View style={[styles.statChip, { backgroundColor: '#fef2f2' }]}>
            <RotateCcw size={12} color="#dc2626" />
            <Text style={[styles.statChipText, { color: '#dc2626' }]}>
              Returned: {item.returnedCount || 0}
            </Text>
          </View>

          <View style={[styles.statChip, { backgroundColor: '#fff7ed' }]}>
            <ArrowRightLeft size={12} color="#ea580c" />
            <Text style={[styles.statChipText, { color: '#ea580c' }]}>
              Transferred: {item.transferredCount || 0}
            </Text>
          </View>
        </View>

        {/* Expanded Tree View */}
        {isExpanded && (
          <View style={styles.expandedContent}>
            <View style={styles.treeSectionHeader}>
              <Text style={styles.treeSectionTitle}>
                REQUESTED BARCODES & STOCK LINEAGE ({barcodesList.length})
              </Text>
            </View>

            {barcodesList.length > 0 ? (
              <View style={styles.barcodeTreeList}>
                {barcodesList.map((rootNode) => renderBarcodeNode(rootNode, 0, false))}
              </View>
            ) : (
              <View style={styles.noBarcodesBox}>
                <Box size={24} color="#cbd5e1" />
                <Text style={styles.noBarcodesText}>
                  Barcodes pending store issuance or dispatch for this item.
                </Text>
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <MaterialHeader
        title="My Materials Tree"
        subtitle="Materials & barcodes from your requested transactions"
        navigation={navigation}
      />

      {/* Metrics Banner */}
      <View style={styles.metricsBanner}>
        <View style={styles.metricCol}>
          <Text style={styles.metricVal}>{metrics.totalMats}</Text>
          <Text style={styles.metricLabel}>Materials</Text>
        </View>
        <View style={styles.metricDivider} />
        <View style={styles.metricCol}>
          <Text style={styles.metricVal}>{metrics.totalBc}</Text>
          <Text style={styles.metricLabel}>Barcodes</Text>
        </View>
        <View style={styles.metricDivider} />
        <View style={styles.metricCol}>
          <Text style={[styles.metricVal, { color: '#16a34a' }]}>{metrics.activeBc}</Text>
          <Text style={styles.metricLabel}>Active Stock</Text>
        </View>
        <View style={styles.metricDivider} />
        <View style={styles.metricCol}>
          <Text style={[styles.metricVal, { color: '#dc2626' }]}>{metrics.returnedBc}</Text>
          <Text style={styles.metricLabel}>Returned</Text>
        </View>
      </View>

      {/* Search Bar & Quick Expand/Collapse */}
      <View style={styles.searchSection}>
        <View style={styles.searchInputWrap}>
          <Search size={16} color="#94a3b8" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search material name, category, or barcode..."
            placeholderTextColor="#94a3b8"
            value={searchQuery}
            onChangeText={setSearchQuery}
            clearButtonMode="while-editing"
          />
        </View>

        <View style={styles.expandControlsRow}>
          <TouchableOpacity onPress={expandAll} style={styles.expandBtn}>
            <Text style={styles.expandBtnText}>Expand All</Text>
          </TouchableOpacity>
          <Text style={{ color: '#cbd5e1' }}>•</Text>
          <TouchableOpacity onPress={collapseAll} style={styles.expandBtn}>
            <Text style={styles.expandBtnText}>Collapse All</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Content View */}
      {loading && !refreshing ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#4f46e5" />
          <Text style={styles.loadingText}>Loading your requested materials & barcodes...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredTree}
          keyExtractor={(item, index) => item.materialName || String(index)}
          renderItem={renderMaterialCard}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchTreeData();
              }}
              colors={['#4f46e5']}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <FolderTree size={44} color="#94a3b8" />
              <Text style={styles.emptyTitle}>No Materials Requested</Text>
              <Text style={styles.emptySubtitle}>
                {searchQuery
                  ? `No material matches "${searchQuery}".`
                  : 'You have not requested any materials yet. Materials from your transactions will appear here.'}
              </Text>
            </View>
          }
        />
      )}

      {/* Footer Navigation */}
      <MaterialModuleFooter navigation={navigation} currentScreen="tree" />
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
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748b',
    fontWeight: '600',
  },
  metricsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 6,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
  },
  metricCol: {
    flex: 1,
    alignItems: 'center',
  },
  metricVal: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1e293b',
  },
  metricLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
    marginTop: 2,
  },
  metricDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#f1f5f9',
  },
  searchSection: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 8,
  },
  searchInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0f172a',
    padding: 0,
  },
  expandControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 6,
  },
  expandBtn: {
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  expandBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4f46e5',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    paddingTop: 4,
  },
  materialCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
  },
  materialCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  matIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#eef2ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  matHeaderInfo: {
    flex: 1,
  },
  materialTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: 0.2,
  },
  matCategoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  categoryBadge: {
    fontSize: 11,
    color: '#4f46e5',
    backgroundColor: '#f5f3ff',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontWeight: '700',
  },
  unitText: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
  },
  priceBadge: {
    fontSize: 11,
    color: '#059669',
    fontWeight: '700',
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  expandAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badgePill: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  badgePillText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
  },
  materialStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 12,
    flexWrap: 'wrap',
  },
  statChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  expandedContent: {
    backgroundColor: '#f8fafc',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    padding: 12,
  },
  treeSectionHeader: {
    marginBottom: 8,
  },
  treeSectionTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 0.6,
  },
  barcodeTreeList: {
    gap: 8,
  },
  barcodeCard: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 6,
  },
  childBarcodeCard: {
    borderLeftWidth: 3,
    borderLeftColor: '#8b5cf6',
    backgroundColor: '#faf5ff',
  },
  barcodeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  barcodeTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  branchSymbol: {
    fontSize: 16,
    color: '#8b5cf6',
    fontWeight: 'bold',
  },
  barcodeText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: 0.5,
  },
  miniTag: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  miniTagText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#2563eb',
  },
  barcodeMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
  },
  childrenContainer: {
    borderLeftWidth: 1.5,
    borderLeftColor: '#c4b5fd',
    paddingLeft: 4,
    marginTop: 2,
  },
  noBarcodesBox: {
    padding: 16,
    alignItems: 'center',
    gap: 6,
  },
  noBarcodesText: {
    fontSize: 12,
    color: '#94a3b8',
    fontStyle: 'italic',
  },
  emptyBox: {
    padding: 40,
    alignItems: 'center',
    gap: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#475569',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
  },
});

export default MaterialsTreeScreen;
