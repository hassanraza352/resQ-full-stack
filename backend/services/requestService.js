const Unit = require("../model/Unit");
const EmergencyRequest = require("../model/EmergencyRequest");
const { UNIT_COMMITTED_STATUSES } = require("../utils/stateMachine");

/** Mongo update fragment that appends a status-history entry. */
const historyEntry = ({ status, by = null, byRole, note = "" }) => ({
  status,
  by,
  byRole,
  note,
  at: new Date(),
});

/**
 * Free a unit (busy -> available) unless it still has another committed request.
 * Safe to call repeatedly.
 */
const releaseUnitIfFree = async (unitId, exceptRequestId = null) => {
  if (!unitId) return false;
  const filter = {
    assignedUnit: unitId,
    status: { $in: UNIT_COMMITTED_STATUSES },
  };
  if (exceptRequestId) filter._id = { $ne: exceptRequestId };
  const other = await EmergencyRequest.exists(filter);
  if (other) return false;
  const res = await Unit.updateOne(
    { _id: unitId, availability: "busy" },
    { $set: { availability: "available" } }
  );
  return res.modifiedCount > 0;
};

/** Reference id like RSQ-261017-7K2QD9 (unique index enforced in the schema). */
const crypto = require("crypto");
const makeReferenceId = () => {
  const d = new Date();
  const ymd =
    String(d.getUTCFullYear()).slice(2) +
    String(d.getUTCMonth() + 1).padStart(2, "0") +
    String(d.getUTCDate()).padStart(2, "0");
  const rand = crypto.randomBytes(5).toString("base64url").replace(/[-_]/g, "X").toUpperCase().slice(0, 6);
  return `RSQ-${ymd}-${rand}`;
};

module.exports = { historyEntry, releaseUnitIfFree, makeReferenceId };
