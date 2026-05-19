import { AlertCircle, Bell, Check, CheckCheck, Inbox, Megaphone, ShieldAlert, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  RefreshControl,
  SafeAreaView,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import api from '../api/axios';

const NotificationDrawer = ({ visible, onClose, onUpdateUnreadCount }) => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  // Pagination states
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchNotifications = async (targetPage = 1, shouldAppend = false, showLoading = true) => {
    try {
      if (targetPage === 1) {
        if (showLoading) setLoading(true);
      } else {
        setLoadingMore(true);
      }

      const res = await api.get(`/notifications/employee/feed?page=${targetPage}&limit=10`);
      if (res.data.success) {
        const feed = res.data.data || [];
        const total = res.data.total || 0;

        if (shouldAppend) {
          setNotifications(prev => {
            const existingIds = new Set(prev.map(item => item._id));
            const uniqueNew = feed.filter(item => !existingIds.has(item._id));
            return [...prev, ...uniqueNew];
          });
        } else {
          setNotifications(feed);
        }

        // Check if we have more pages to load
        const fetchedCount = shouldAppend ? notifications.length + feed.length : feed.length;
        setHasMore(fetchedCount < total && feed.length > 0);
        setPage(targetPage);

        // Update the global unread count
        if (onUpdateUnreadCount) {
          const unreadRes = await api.get('/notifications/employee/unread-count');
          if (unreadRes.data.success) {
            onUpdateUnreadCount(unreadRes.data.count);
          }
        }
      }
    } catch (err) {
      console.log('Error fetching notifications feed:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    if (visible) {
      fetchNotifications(1, false, true);
    }
  }, [visible]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchNotifications(1, false, false);
  };

  const loadMore = () => {
    if (hasMore && !loading && !loadingMore && !refreshing) {
      fetchNotifications(page + 1, true, false);
    }
  };

  const handleMarkAsRead = async (id) => {
    try {
      const res = await api.put(`/notifications/employee/read/${id}`);
      if (res.data.success) {
        setNotifications(prev =>
          prev.map(n => (n._id === id ? { ...n, isRead: true } : n))
        );
        // Recalculate unread count
        const updated = notifications.map(n => (n._id === id ? { ...n, isRead: true } : n));
        const unread = updated.filter(n => !n.isRead).length;
        if (onUpdateUnreadCount) onUpdateUnreadCount(unread);
      }
    } catch (err) {
      console.log('Error marking notification as read:', err.message);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      const res = await api.put('/notifications/employee/read-all');
      if (res.data.success) {
        setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
        if (onUpdateUnreadCount) onUpdateUnreadCount(0);
      }
    } catch (err) {
      console.log('Error marking all as read:', err.message);
    }
  };

  const toggleExpand = (id, isRead) => {
    setExpandedId(expandedId === id ? null : id);
    if (!isRead) {
      handleMarkAsRead(id);
    }
  };

  const getTypeConfig = (type) => {
    const normalizedType = (type || 'General Announcement').trim();
    switch (normalizedType) {
      case 'Emergency Alert':
      case 'Geofence Exit':
      case 'Geofence Entry':
        return {
          icon: <ShieldAlert size={20} color="#ef4444" />,
          bgColor: 'bg-rose-50/80',
          borderColor: 'border-rose-100',
          unreadBorder: 'border-rose-200',
          accentColor: '#ef4444',
          accentBg: 'bg-rose-500',
          shadowColor: 'shadow-rose-50/50',
          textBg: 'bg-rose-100/50 text-rose-700',
          label: 'Emergency'
        };
      case 'Attendance Alert':
      case 'Late Alert':
      case 'Late Coming':
      case 'Employee absent':
        return {
          icon: <AlertCircle size={20} color="#d97706" />,
          bgColor: 'bg-amber-50/80',
          borderColor: 'border-amber-100',
          unreadBorder: 'border-amber-200',
          accentColor: '#d97706',
          accentBg: 'bg-amber-500',
          shadowColor: 'shadow-amber-50/50',
          textBg: 'bg-amber-100/50 text-amber-700',
          label: 'Attendance'
        };
      case 'HR Announcement':
        return {
          icon: <Megaphone size={20} color="#8b5cf6" />,
          bgColor: 'bg-purple-50/80',
          borderColor: 'border-purple-100',
          unreadBorder: 'border-purple-200',
          accentColor: '#8b5cf6',
          accentBg: 'bg-purple-500',
          shadowColor: 'shadow-purple-50/50',
          textBg: 'bg-purple-100/50 text-purple-700',
          label: 'HR Update'
        };
      case 'Meeting Notification':
        return {
          icon: <Megaphone size={20} color="#06b6d4" />,
          bgColor: 'bg-cyan-50/80',
          borderColor: 'border-cyan-100',
          unreadBorder: 'border-cyan-200',
          accentColor: '#06b6d4',
          accentBg: 'bg-cyan-500',
          shadowColor: 'shadow-cyan-50/50',
          textBg: 'bg-cyan-100/50 text-cyan-700',
          label: 'Meeting'
        };
      case 'Punch Confirmation':
        return {
          icon: <CheckCheck size={20} color="#10b981" />,
          bgColor: 'bg-emerald-50/80',
          borderColor: 'border-emerald-100',
          unreadBorder: 'border-emerald-200',
          accentColor: '#10b981',
          accentBg: 'bg-emerald-500',
          shadowColor: 'shadow-emerald-50/50',
          textBg: 'bg-emerald-100/50 text-emerald-700',
          label: 'Punch OK'
        };
      default:
        return {
          icon: <Megaphone size={20} color="#4f46e5" />,
          bgColor: 'bg-indigo-50/80',
          borderColor: 'border-indigo-100',
          unreadBorder: 'border-indigo-200',
          accentColor: '#4f46e5',
          accentBg: 'bg-indigo-500',
          shadowColor: 'shadow-indigo-50/50',
          textBg: 'bg-indigo-100/50 text-indigo-700',
          label: normalizedType
        };
    }
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();

    const isToday = date.toDateString() === now.toDateString();
    const isYesterday = new Date(now.setDate(now.getDate() - 1)).toDateString() === date.toDateString();

    const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });

    if (isToday) return `Today, ${time}`;
    if (isYesterday) return `Yesterday, ${time}`;

    return `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${time}`;
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <SafeAreaView className="flex-1 bg-slate-50">
        {/* Header */}
        <View className="flex-row justify-between items-center px-6 py-4 bg-blue-700 border-b border-slate-100 shadow-sm">
          <View className="flex-row items-center gap-3">
            <View className="w-10 h-10 rounded-xl bg-white justify-center items-center">
              <Bell size={20} color="#4f46e5" />
            </View>
            <View>
              <Text className="text-xl font-bold text-slate-100 tracking-tight">Notifications</Text>
              <Text className="text-[10px] text-slate-100 font-bold tracking-wider ">Personal Inbox Feed</Text>
            </View>
          </View>
          <TouchableOpacity onPress={onClose} className="p-2 bg-slate-100 rounded-full">
            <X size={20} color="#64748b" />
          </TouchableOpacity>
        </View>

        {/* Sub Header / Mark All As Read */}
        {notifications.length > 0 && notifications.some(n => !n.isRead) && (
          <View className="px-6 py-3 bg-indigo-50/50 flex-row justify-between items-center border-b border-indigo-100/30">
            <Text className="text-[11px] font-bold text-indigo-600">
              You have {notifications.filter(n => !n.isRead).length} unread updates
            </Text>
            <TouchableOpacity onPress={handleMarkAllAsRead} className="flex-row items-center gap-1.5">
              <Check size={12} color="#4f46e5" />
              <Text className="text-[11px] font-extrabold text-indigo-700 tracking-tight">Mark all as read</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Body Feed */}
        {loading && !refreshing ? (
          <View className="flex-1 justify-center items-center">
            <ActivityIndicator size="large" color="#4f46e5" />
            <Text className="mt-3 text-slate-400 font-bold text-sm">Opening Inbox...</Text>
          </View>
        ) : notifications.length === 0 ? (
          <View className="flex-1 justify-center items-center px-8 gap-4">
            <View className="w-20 h-20 rounded-full bg-slate-100 justify-center items-center border border-slate-200 shadow-inner">
              <Inbox size={36} color="#94a3b8" />
            </View>
            <View className="items-center">
              <Text className="text-lg font-bold text-slate-700 tracking-tight">Inbox is Empty</Text>
              <Text className="text-slate-400 font-bold text-xs text-center mt-1">
                You're all caught up! Push messages, alerts, and system confirmations will show up here.
              </Text>
            </View>
          </View>
        ) : (
          <FlatList
            data={notifications}
            keyExtractor={item => item._id}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4f46e5']} />
            }
            contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
            onEndReached={loadMore}
            onEndReachedThreshold={0.3}
            ListFooterComponent={() => {
              if (loadingMore) {
                return (
                  <View className="py-4 items-center justify-center">
                    <ActivityIndicator size="small" color="#4f46e5" />
                    <Text className="text-[10px] text-slate-400 font-bold mt-1.5">Loading more...</Text>
                  </View>
                );
              }
              if (!hasMore && notifications.length > 0) {
                return (
                  <View className="py-6 items-center border-t border-slate-100 mt-2">
                    <Text className="text-[10px] text-slate-400 font-bold tracking-wider ">YOU'RE ALL CAUGHT UP! ✨</Text>
                  </View>
                );
              }
              return null;
            }}
            renderItem={({ item }) => {
              const isExpanded = expandedId === item._id;
              const config = getTypeConfig(item.type);
              return (
                <TouchableOpacity
                  onPress={() => toggleExpand(item._id, item.isRead)}
                  activeOpacity={0.9}
                  className={`bg-white rounded-3xl p-5 mb-4 border transition-all flex-row gap-4 items-start relative ${item.isRead
                    ? 'border-slate-100 shadow-sm'
                    : `border-slate-100 shadow-md ${config.shadowColor}`
                    }`}
                  style={!item.isRead ? { borderLeftWidth: 6, borderLeftColor: config.accentColor } : null}
                >
                  {/* Unread Accent Dot Indicator */}
                  {!item.isRead && (
                    <View className={`w-2 h-2 rounded-full ${config.accentBg} absolute top-4 right-4 shrink-0`} />
                  )}

                  <View className={`w-10 h-10 rounded-2xl items-center justify-center shrink-0 shadow-sm ${config.bgColor} ${config.borderColor} border`}>
                    {config.icon}
                  </View>

                  <View className="flex-1 min-w-0">
                    <View className="flex-row justify-between items-start flex-wrap gap-1">
                      <Text
                        className={`text-[13px] tracking-tight flex-1 pr-2 ${item.isRead ? 'font-bold text-slate-700' : 'font-extrabold text-slate-900'
                          }`}
                      >
                        {item.title}
                      </Text>
                      <View className={`px-2 py-0.5 rounded-lg shrink-0 ${config.textBg}`}>
                        <Text className="text-[8px] font-extrabold tracking-widest">{config.label}</Text>
                      </View>
                    </View>

                    <Text
                      className="text-slate-500 font-medium text-xs mt-1.5 leading-relaxed"
                    >
                      {item.message || item.body}
                    </Text>

                    <Text className="text-[10px] text-slate-400 font-bold tracking-wider mt-3">
                      {formatDateTime(item.createdAt)}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
};

export default NotificationDrawer;
