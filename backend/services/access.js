const Unit = require("../model/Unit");
const Hospital = require("../model/Hospital");

/**
 * Object-level authorization for a request: who may see it at all.
 *  - requester : own requests only
 *  - unit      : only requests assigned to its own unit
 *  - hospital  : only requests assigned to its own hospital
 *  - admin     : all
 * `request` needs requester, assignedUnit, assignedHospital (ids or populated docs).
 */
const idOf = (v) => (v && v._id ? v._id.toString() : v ? v.toString() : null);

const canAccessRequest = async (user, request) => {
  if (!user || !request) return false;
  if (user.role === "admin") return true;
  if (user.role === "user") return idOf(request.requester) === user.id;
  if (user.role === "unit") {
    const unitId = idOf(request.assignedUnit);
    if (!unitId) return false;
    return !!(await Unit.exists({ _id: unitId, user: user.id }));
  }
  if (user.role === "hospital") {
    const hid = idOf(request.assignedHospital);
    if (!hid) return false;
    return !!(await Hospital.exists({ _id: hid, user: user.id }));
  }
  return false;
};

module.exports = { canAccessRequest, idOf };
