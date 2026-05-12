import DateTimePicker from '@react-native-community/datetimepicker';
import { ArrowLeft, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Home, MapPin } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Dimensions, Platform, Text, TouchableOpacity, View } from 'react-native';
import api from '../api/axios';

import MapView, { Marker, Polyline } from '../components/MapComponents';

const { width, height } = Dimensions.get('window');

const TrackMyRoute = ({ navigation }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('Mapview');

  const [currentDate, setCurrentDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const dateStr = currentDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  useEffect(() => {
    fetchRoute();
  }, [currentDate]);

  const fetchRoute = async () => {
    try {
      setLoading(true);
      const dateIso = currentDate.toISOString().split('T')[0];
      const res = await api.get(`/reports/track-details-me?date=${dateIso}`);

      if (res.data.success) {
        setData(res.data.data);
      }
    } catch (err) {
      // Error handled silently or via UI
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-white">
        <ActivityIndicator size="large" color="#3a0ee9ff" />
      </View>
    );
  }

  // Construct path with validation
  const path = [];
  const addPoint = (loc, time, extra = {}) => {
    if (loc && typeof loc.latitude === 'number' && typeof loc.longitude === 'number') {
      path.push({
        latitude: loc.latitude,
        longitude: loc.longitude,
        time: time,
        ...extra
      });
    }
  };

  if (data?.punchIn?.location) {
    addPoint(data.punchIn.location, data.punchIn.time, { isStart: true });
  }

  if (data?.logs && Array.isArray(data.logs)) {
    data.logs.forEach(log => {
      addPoint({ latitude: log.latitude, longitude: log.longitude }, log.time);
    });
  }

  if (data?.punchOut?.location) {
    addPoint(data.punchOut.location, data.punchOut.time, { isEnd: true });
  }

  const initialRegion = path.length > 0 ? {
    latitude: path[0].latitude,
    longitude: path[0].longitude,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  } : {
    latitude: 16.701,
    longitude: 74.4496,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  };

  return (
    <View className="flex-1 bg-white">
      {/* Header (Blue Bar) */}
      <View className="bg-blue-800 pt-14 pb-4 px-4 flex-row items-center justify-between">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <ArrowLeft size={24} color="white" />
          </TouchableOpacity>
          <Text className="text-white text-xl font-bold ml-6">Track My Route</Text>
        </View>
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => navigation.navigate('Main')} className="ml-4">
            <Home size={22} color="white" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Info Bar */}
      <View className="bg-slate-100 p-4">
        <View className="flex-row justify-between items-center">
          <View>
            <Text className="text-slate-400 font-bold text-[10px] tracking-widest mb-1">Selected Date</Text>
            <View className="flex-row items-center gap-2">
              <CalendarIcon size={16} color="#64748b" />
              <Text className="text-slate-900 font-bold text-lg">{dateStr}</Text>
            </View>
          </View>
          <View className="flex-row gap-3">
            <TouchableOpacity
              onPress={() => {
                const d = new Date(currentDate);
                d.setDate(d.getDate() - 1);
                setCurrentDate(d);
              }}
              className="w-10 h-10 bg-white rounded-xl border border-slate-200 items-center justify-center"
            >
              <ChevronLeft size={20} color="#64748b" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowDatePicker(true)}
              className="w-10 h-10 bg-white rounded-xl border border-slate-200 items-center justify-center"
            >
              <CalendarIcon size={20} color="#0ea5e9" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                const d = new Date(currentDate);
                d.setDate(d.getDate() + 1);
                if (d <= new Date()) setCurrentDate(d);
              }}
              className="w-10 h-10 bg-white rounded-xl border border-slate-200 items-center justify-center"
            >
              <ChevronRight size={20} color="#64748b" />
            </TouchableOpacity>
          </View>
        </View>

        {showDatePicker && (
          <DateTimePicker
            value={currentDate}
            mode="date"
            display="default"
            maximumDate={new Date()}
            onChange={(event, selectedDate) => {
              setShowDatePicker(false);
              if (selectedDate) setCurrentDate(selectedDate);
            }}
          />
        )}

        <View className="mt-4 pt-4 border-t border-slate-200">
          <Text className="text-slate-900 font-bold text-sm">
            Total Distance: <Text className="text-[#0ea5e9]">{Math.round((data?.summary?.totalDistance || 0) * 1000)} meters</Text>
          </Text>
        </View>
      </View>

      {/* Map Content */}
      <View className="flex-1">
        {Platform.OS === 'web' ? (
          <View className="flex-1 justify-center items-center bg-slate-50">
            <MapPin size={48} color="#94a3b8" />
            <Text className="text-slate-400 font-bold mt-4">Map View is only available on Mobile Devices</Text>
            <Text className="text-slate-300 text-xs mt-1">Please use Android/iOS for live tracking</Text>
          </View>
        ) : (
          <MapView
            style={{ width, height: height * 0.55 }}
            initialRegion={initialRegion}
            showsUserLocation
          >
            {path.length >= 2 && (
              <Polyline
                coordinates={path.map(p => ({ latitude: p.latitude, longitude: p.longitude }))}
                strokeColor="#ff0000"
                strokeWidth={5}
              />
            )}
            {path.length > 0 && (
              <Marker
                coordinate={{
                  latitude: path[path.length - 1].latitude,
                  longitude: path[path.length - 1].longitude
                }}
              >
                <View className="w-10 h-10 bg-red-500 rounded-full items-center justify-center border-2 border-white shadow-lg">
                  <MapPin size={20} color="white" />
                </View>
              </Marker>
            )}
          </MapView>
        )}
      </View>
    </View>
  );
};

export default TrackMyRoute;

