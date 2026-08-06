export const fetchDynamicLocation = async (lat, lng) => {
  const latitude = parseFloat(lat);
  const longitude = parseFloat(lng);
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
      {
        headers: { 'Accept-Language': 'en' },
      }
    );
    if (response.ok) {
      const data = await response.json();
      return {
        lat: latitude,
        lng: longitude,
        address: data.display_name || `Location (${latitude}, ${longitude})`
      };
    }
  } catch (err) {
    console.error('Reverse geocoding error:', err);
  }
  return {
    lat: latitude,
    lng: longitude,
    address: `Location at coordinates (${latitude}, ${longitude})`
  };
};
