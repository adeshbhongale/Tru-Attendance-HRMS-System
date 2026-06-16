import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Platform, StyleSheet } from 'react-native';

const AttendanceMap = ({ latitude, longitude, radius, userLocation, geofenceEnabled = true }) => {
  const mapRef = useRef(null);
  const googleMap = useRef(null);
  const officeMarker = useRef(null);
  const userMarker = useRef(null);
  const circle = useRef(null);
  const [scriptLoaded, setScriptLoaded] = useState(!!window.google);

  const officeLat = Number(latitude) || 16.704151;
  const officeLng = Number(longitude) || 74.450258;
  const officeRadius = Number(radius) || 200;
  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    if (!window.google) {
      // Check if script already exists to avoid duplicates
      const existingScript = document.getElementById('google-maps-script-web-app');
      if (existingScript) {
        setScriptLoaded(true);
        return;
      }

      const script = document.createElement('script');
      script.id = 'google-maps-script-web-app';
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}`;
      script.async = true;
      script.defer = true;
      script.onload = () => setScriptLoaded(true);
      document.head.appendChild(script);
    } else {
      setScriptLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!scriptLoaded || !mapRef.current || !window.google) return;

    const center = userLocation?.latitude 
      ? { lat: Number(userLocation.latitude), lng: Number(userLocation.longitude) }
      : { lat: officeLat, lng: officeLng };

    if (!googleMap.current) {
      googleMap.current = new window.google.maps.Map(mapRef.current, {
        center,
        zoom: 16,
        disableDefaultUI: true,
        zoomControl: true,
      });

      officeMarker.current = new window.google.maps.Marker({
        position: { lat: officeLat, lng: officeLng },
        map: googleMap.current,
        title: "Office Location",
        icon: {
          path: window.google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
          scale: 5,
          fillColor: '#4f46e5',
          fillOpacity: 1,
          strokeWeight: 2,
          strokeColor: '#ffffff',
        }
      });

      if (geofenceEnabled !== false) {
        circle.current = new window.google.maps.Circle({
          map: googleMap.current,
          center: { lat: officeLat, lng: officeLng },
          radius: officeRadius,
          fillColor: "#4f46e5",
          fillOpacity: 0.1,
          strokeColor: "#4f46e5",
          strokeOpacity: 0.3,
          strokeWeight: 1,
        });
      }
    }

    if (userLocation && window.google) {
      const userPos = { lat: Number(userLocation.latitude), lng: Number(userLocation.longitude) };
      
      if (!userMarker.current) {
        userMarker.current = new window.google.maps.Marker({
          position: userPos,
          map: googleMap.current,
          title: "My Location",
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 7,
            fillColor: '#10b981',
            fillOpacity: 1,
            strokeWeight: 2,
            strokeColor: '#ffffff',
          }
        });
      } else {
        userMarker.current.setPosition(userPos);
      }
    }
  }, [scriptLoaded, userLocation, officeLat, officeLng, officeRadius]);

  if (Platform.OS !== 'web') return null;

  return (
    <View style={styles.container}>
      <div 
        ref={mapRef} 
        style={{ width: '100%', height: '100%', borderRadius: '24px' }} 
      />
      {!scriptLoaded && (
        <View style={styles.loading}>
          <Text style={{ fontWeight: 'bold', color: '#64748b' }}>Loading Map...</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#f1f5f9',
    borderRadius: 24,
    overflow: 'hidden',
  },
  loading: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
  }
});

export default AttendanceMap;
