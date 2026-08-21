import { View } from 'react-native';

let MapViewNative = View;
let CircleNative = View;
let MarkerNative = View;
let PolylineNative = View;
let UrlTileNative = View;
let PROVIDER_GOOGLE_NATIVE = 'google';

try {
  const Maps = require('react-native-maps');
  if (Maps && Maps.default) {
    MapViewNative = Maps.default;
    CircleNative = Maps.Circle || View;
    MarkerNative = Maps.Marker || View;
    PolylineNative = Maps.Polyline || View;
    UrlTileNative = Maps.UrlTile || View;
    PROVIDER_GOOGLE_NATIVE = Maps.PROVIDER_GOOGLE || 'google';
  }
} catch (e) {
  console.warn('[MapComponents] react-native-maps not available (Expo Go). Using fallback placeholders.');
}

export const MapView = MapViewNative;
export const Circle = CircleNative;
export const Marker = MarkerNative;
export const Polyline = PolylineNative;
export const UrlTile = UrlTileNative;
export const PROVIDER_GOOGLE = PROVIDER_GOOGLE_NATIVE;
export default MapViewNative;
