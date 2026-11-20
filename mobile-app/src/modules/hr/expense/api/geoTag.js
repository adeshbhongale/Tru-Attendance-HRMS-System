import * as Location from "expo-location";
import { Alert, Linking } from "react-native";

/**
 * Live-photo geo-tag for expense claim captures (all claim forms / claim types).
 * Returns { latitude, longitude, accuracy, address, capturedAt } or null when
 * location permission / GPS is unavailable (caller must then abort the capture).
 */
export async function getLivePhotoGeoTag() {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Location Required",
        "Location permission is required to geo-tag the live photo.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Open Settings", onPress: () => Linking.openSettings().catch(() => {}) },
        ]
      );
      return null;
    }

    let pos = null;
    try {
      pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    } catch {
      pos = await Location.getLastKnownPositionAsync().catch(() => null);
    }
    if (!pos?.coords) {
      Alert.alert("Location Unavailable", "Could not get your current location. Please turn on GPS and try again.");
      return null;
    }

    const { latitude, longitude, accuracy } = pos.coords;
    let address = "";
    try {
      const [g] = await Location.reverseGeocodeAsync({ latitude, longitude });
      if (g) {
        address = [g.name, g.street, g.district || g.subregion, g.city, g.region, g.postalCode]
          .filter((p, i, arr) => p && arr.indexOf(p) === i)
          .join(", ");
      }
    } catch {
      // address is optional; coordinates are the geo-tag
    }

    return { latitude, longitude, accuracy: accuracy ?? null, address, capturedAt: new Date().toISOString() };
  } catch {
    Alert.alert("Location Unavailable", "Could not get your current location. Please turn on GPS and try again.");
    return null;
  }
}
