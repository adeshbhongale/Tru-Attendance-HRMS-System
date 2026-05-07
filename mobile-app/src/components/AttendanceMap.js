import { Platform, StyleSheet, View } from 'react-native';
import { User as UserIcon } from 'lucide-react-native';
import MapView, { Circle, Marker, PROVIDER_GOOGLE } from 'react-native-maps';

const AttendanceMap = ({ latitude, longitude, radius, userLocation }) => {
  // Ensure we are working with numbers
  const officeLat = Number(latitude) || 16.704151;
  const officeLng = Number(longitude) || 74.450258;
  const officeRadius = Number(radius) || 200;

  const mapCenter = {
    latitude: Number(userLocation?.latitude) || officeLat,
    longitude: Number(userLocation?.longitude) || officeLng,
  };

  return (
    <MapView
      style={styles.map} // Explicit style for native rendering
      provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
      initialRegion={{
        ...mapCenter,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      }}
      region={{
        ...mapCenter,
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

      {/* Live Employee Location Marker */}
      {userLocation && (
        <Marker
          coordinate={{
            latitude: Number(userLocation.latitude),
            longitude: Number(userLocation.longitude),
          }}
          title="My Location"
          anchor={{ x: 0.5, y: 0.5 }}
        >
          <View style={styles.userMarkerContainer}>
            <View style={styles.userMarkerPulse} />
            <View style={styles.userMarkerInner}>
              <UserIcon size={14} color="white" strokeWidth={3} />
            </View>
          </View>
        </Marker>
      )}
    </MapView>
  );
};

const styles = StyleSheet.create({
  map: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  userMarkerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40,
  },
  userMarkerPulse: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#10b981',
    opacity: 0.2,
  },
  userMarkerInner: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#10b981',
    borderWidth: 2,
    borderColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
});

export default AttendanceMap;