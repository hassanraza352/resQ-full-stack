export type RequestStatus =
  | "pending" | "assigned" | "accepted" | "en-route" | "arrived"
  | "in-progress" | "completed" | "cancelled" | "rejected";

export interface UnitLocation {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  updatedAt: string | null;
  stale: boolean;
  precision: "exact" | "approximate";
}

export interface UnitInfo {
  id: string;
  label: string;
  vehicleType: "basic" | "advanced" | "patient-transport";
  availability: "available" | "busy" | "offline";
  contactNumber?: string;
  registrationNumber?: string;
  vehicleModel?: string;
  capacity?: number;
  verificationStatus?: "pending" | "verified" | "rejected";
  location: UnitLocation | null;
}

export interface RoadEstimate {
  distanceMeters: number;
  durationSeconds: number;
  kind: string;
  provider: string;
  computedAt: string;
}

export interface NearbyUnit extends UnitInfo {
  straightLineKm: number;
  road: RoadEstimate | null;
  assignedToYou: boolean;
}

export interface Candidate extends NearbyUnit {
  eligible: boolean;
  ineligibleReason: string | null;
  currentAssignment: { requestId: string; referenceId: string; status: string } | null;
  previouslyRejected: boolean;
  isCurrentlyAssignedToThisRequest: boolean;
}

export interface BedInfo {
  totalBeds: number; availableBeds: number; icuTotal: number; icuAvailable: number;
  updatedAt: string | null; stale: boolean;
}

export interface HospitalInfo {
  id: string;
  hospitalName: string;
  address: string;
  contactNumber: string;
  emergencyAvailability: "accepting" | "not-accepting";
  verificationStatus?: "pending" | "verified" | "rejected";
  registrationNumber?: string;
  emergencyCapacity?: number;
  location: { latitude: number; longitude: number } | null;
  beds: BedInfo;
  straightLineKm?: number;
  staffCount?: number;
  user?: { name: string; email: string; phone: string };
}

export interface HistoryEntry { status: RequestStatus; byRole: string; note: string; at: string }

export interface EmergencyRequest {
  id: string;
  referenceId: string;
  emergencyType: string;
  priority: "low" | "normal" | "high" | "critical";
  description: string;
  contactNumber: string;
  status: RequestStatus;
  location: { address: string; latitude: number; longitude: number; accuracy: number | null; source: string };
  statusHistory: HistoryEntry[];
  allowedNext: RequestStatus[];
  createdAt: string;
  updatedAt: string;
  assignedAt: string | null;
  cancelReason: string;
  requester?: { id: string; name: string; phone: string; email?: string };
  assignedUnit: (Partial<UnitInfo> & { id: string }) | null;
  assignedHospital: (Partial<HospitalInfo> & { id: string }) | null;
  hospitalResponse: { status: "pending" | "accepted" | "declined"; note?: string };
  rejectedUnits?: string[];
  assignmentHistory?: { unit: string; action: string; byRole: string; note: string; at: string }[];
}

export interface Meta { page: number; limit: number; total: number; pages: number }

export interface RouteResult {
  incident: { latitude: number; longitude: number };
  unit?: UnitInfo;
  straightLineKm?: number;
  route: null | {
    distanceMeters: number; durationSeconds: number;
    geometry: [number, number][]; provider: string; kind: string; computedAt: string;
  };
  reason?: string;
}

export interface NotificationItem {
  id: string; type: string; title: string; body: string;
  request: string | null; read: boolean; createdAt: string;
}

export interface ChatMessage {
  id: string; text: string; senderRole: string; senderName: string; mine: boolean; createdAt: string;
}
