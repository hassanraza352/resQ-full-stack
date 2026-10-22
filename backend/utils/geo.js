/**
 * Coordinate convention used across RESQ
 * ---------------------------------------
 *  - Browser Geolocation / API query params / frontend state:  { latitude, longitude }  (lat first)
 *  - MongoDB GeoJSON & stored coordinates:                     [longitude, latitude]   (lng first)
 *  - Leaflet:                                                  [latitude, longitude]
 * All conversion between those happens ONLY through the helpers below.
 */
const isFiniteNumber = (v) => typeof v === "number" && Number.isFinite(v);

const toNumber = (v) => {
  if (v === null || v === undefined || v === "") return NaN;
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "") return Number(v);
  return NaN;
};

const validLatLng = (lat, lng) =>
  isFiniteNumber(lat) &&
  isFiniteNumber(lng) &&
  lat >= -90 &&
  lat <= 90 &&
  lng >= -180 &&
  lng <= 180;

/** Parses {latitude, longitude} (numbers or numeric strings). Returns null if invalid. */
const parseLatLng = (latitude, longitude) => {
  const lat = toNumber(latitude);
  const lng = toNumber(longitude);
  return validLatLng(lat, lng) ? { latitude: lat, longitude: lng } : null;
};

/** lat/lng -> GeoJSON Point ([lng, lat]) */
const toGeoPoint = (latitude, longitude) => ({
  type: "Point",
  coordinates: [longitude, latitude],
});

/** [lng, lat] -> { latitude, longitude } or null */
const fromCoordinates = (coordinates) => {
  if (!Array.isArray(coordinates) || coordinates.length !== 2) return null;
  const [lng, lat] = coordinates;
  return validLatLng(lat, lng) ? { latitude: lat, longitude: lng } : null;
};

/** Straight-line (great-circle) distance in km. Discovery filter ONLY - not road distance. */
const haversineKm = (a, b) => {
  const R = 6371.0088;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};

/** Round for privacy (3 decimals ~ 110 m). */
const roundCoord = (n, decimals = 3) => {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
};

module.exports = {
  validLatLng,
  parseLatLng,
  toGeoPoint,
  fromCoordinates,
  haversineKm,
  roundCoord,
  toNumber,
};
