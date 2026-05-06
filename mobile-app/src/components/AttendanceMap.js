import MapView, { Circle, Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { View, Text, Platform } from 'react-native';

const AttendanceMap = ({ latitude, longitude, radius, userLocation }) => {
  const officeLat = latitude || 16.704151;
  const officeLng = longitude || 74.450258;
  const officeRadius = radius || 200;

  // Use user location if available, otherwise fallback to office
  const mapCenter = userLocation || { latitude: officeLat, longitude: officeLng };

  return (
    <MapView
      className="flex-1"
      provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
      region={{
        latitude: mapCenter.latitude,
        longitude: mapCenter.longitude,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      }}
    >
      {/* Office Geofence */}
      <Circle
        center={{ latitude: officeLat, longitude: officeLng }}
        radius={officeRadius}
        fillColor="rgba(79, 70, 229, 0.15)"
        strokeColor="rgba(79, 70, 229, 0.4)"
        strokeWidth={2}
      />
      
      {/* Office Marker */}
      <Marker
        coordinate={{ latitude: officeLat, longitude: officeLng }}
        title="Office Location"
        pinColor="#4f46e5"
      />

      {/* User Live Location Marker */}
      {userLocation && (
        <Marker
          coordinate={userLocation}
          title="You are here"
          description="Your live location"
        >
          <View className="items-center justify-center">
            <View className="w-8 h-8 rounded-full bg-emerald-500/20 items-center justify-center">
              <View className="w-4 h-4 rounded-full bg-emerald-500 border-2 border-white shadow-lg" />
            </View>
          </View>
        </Marker>
      )}
    </MapView>
  );
};

export default AttendanceMap;
