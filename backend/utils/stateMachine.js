/**
 * Emergency request lifecycle (single source of truth).
 *
 *  pending ──admin assigns──▶ assigned ──unit accepts──▶ accepted ──▶ en-route ──▶ arrived
 *     │  ▲                       │                                                   │
 *     │  └──unit rejects─────────┘                                         in-progress (optional)
 *     │                                                                              │
 *     ├─admin rejects─▶ rejected                                                     ▼
 *     └─cancelled (user while pending/assigned, admin any active state)           completed
 *
 * "Reassign" (assigned → assigned with a different unit) is a separate admin
 * operation, not a status transition.
 */
const STATUSES = [
  "pending",
  "assigned",
  "accepted",
  "en-route",
  "arrived",
  "in-progress",
  "completed",
  "cancelled",
  "rejected",
];

const ACTIVE_STATUSES = [
  "pending",
  "assigned",
  "accepted",
  "en-route",
  "arrived",
  "in-progress",
];

// Statuses in which a unit is committed to the request.
const UNIT_COMMITTED_STATUSES = [
  "assigned",
  "accepted",
  "en-route",
  "arrived",
  "in-progress",
];

const TERMINAL_STATUSES = ["completed", "cancelled", "rejected"];

// transitions[from][actorRole] = allowed target statuses
const TRANSITIONS = {
  pending: {
    admin: ["assigned", "rejected", "cancelled"],
    user: ["cancelled"],
  },
  assigned: {
    admin: ["cancelled"],
    user: ["cancelled"],
    unit: ["accepted", "pending"], // pending == the unit rejected the assignment
  },
  accepted: {
    admin: ["cancelled"],
    unit: ["en-route"],
  },
  "en-route": {
    admin: ["cancelled"],
    unit: ["arrived"],
  },
  arrived: {
    admin: ["cancelled"],
    unit: ["in-progress", "completed"],
  },
  "in-progress": {
    admin: ["cancelled"],
    unit: ["completed"],
  },
};

const allowedNext = (from, role) => TRANSITIONS[from]?.[role] || [];

const canTransition = (from, to, role) => allowedNext(from, role).includes(to);

module.exports = {
  STATUSES,
  ACTIVE_STATUSES,
  UNIT_COMMITTED_STATUSES,
  TERMINAL_STATUSES,
  TRANSITIONS,
  allowedNext,
  canTransition,
};
