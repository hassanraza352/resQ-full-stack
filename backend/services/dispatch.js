const Unit = require("../model/Unit");
const { load } = require("../config/env");
const { toGeoPoint, parseLatLng } = require("../utils/geo");
const { getRoute } = require("./routing");
const { HttpError } = require("../utils/response");

/** Reads & validates ?lat=&lng=&radiusKm=&limit=&page= (strings from the query string). */
const parseNearbyQuery = (q, { defaultLimit = 10, maxLimit = 25 } = {}) => {
  const cfg = load();
  const pos = parseLatLng(q.lat ?? q.latitude, q.lng ?? q.longitude);
  if (!pos) throw new HttpError(400, "Valid lat and lng query parameters are required");
  let radiusKm = Number(q.radiusKm);
  if (!Number.isFinite(radiusKm) || radiusKm <= 0) radiusKm = cfg.nearbyDefaultRadiusKm;
  radiusKm = Math.min(radiusKm, cfg.nearbyMaxRadiusKm);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(q.limit, 10) || defaultLimit));
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  return { ...pos, radiusKm, limit, page, skip: (page - 1) * limit };
};

/**
 * Geospatial discovery (2dsphere $geoNear). Distance returned here is STRAIGHT-LINE
 * and is only a discovery filter / sort key - never road distance.
 * Policy: verified units only; "available" only unless `availability` says otherwise;
 * live position must be fresher than UNIT_LOCATION_MAX_AGE_MIN unless includeStale.
 */
const findUnitsNear = async ({
  latitude,
  longitude,
  radiusKm,
  limit,
  skip = 0,
  availability = ["available"],
  includeStale = false,
  excludeUnitIds = [],
}) => {
  const cfg = load();
  const query = {
    verificationStatus: "verified",
    availability: { $in: availability },
  };
  if (!includeStale) {
    query.locationUpdatedAt = { $gte: new Date(Date.now() - cfg.unitLocationMaxAgeMin * 60 * 1000) };
  }
  if (excludeUnitIds.length) query._id = { $nin: excludeUnitIds };

  return Unit.aggregate([
    {
      $geoNear: {
        near: toGeoPoint(latitude, longitude),
        key: "location",
        distanceField: "distanceMeters",
        maxDistance: radiusKm * 1000,
        spherical: true,
        query,
      },
    },
    { $skip: skip },
    { $limit: limit },
  ]);
};

/** Adds `road` (route-based distance/ETA) for the first `n` units; null when routing is unavailable. */
const attachRoutes = async (units, incident, n = 5) => {
  const out = await Promise.all(
    units.map(async (u, i) => {
      if (i >= n) return { ...u, road: null };
      const pos = { latitude: u.location.coordinates[1], longitude: u.location.coordinates[0] };
      const r = await getRoute(pos, incident);
      return {
        ...u,
        road: r
          ? {
              distanceMeters: r.distanceMeters,
              durationSeconds: r.durationSeconds,
              kind: r.kind,
              provider: r.provider,
              computedAt: r.computedAt,
            }
          : null,
      };
    })
  );
  return out;
};

module.exports = { parseNearbyQuery, findUnitsNear, attachRoutes };
