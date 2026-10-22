export const fmtDistance = (meters?: number | null) =>
  meters == null ? "—" : meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;

export const fmtDuration = (seconds?: number | null) => {
  if (seconds == null) return "—";
  const m = Math.max(1, Math.round(seconds / 60));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
};

export const fmtDateTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "—";

export const timeAgo = (iso?: string | null) => {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
};

export const statusLabel = (s: string) =>
  ({ "en-route": "En route", "in-progress": "In progress" } as Record<string, string>)[s] ||
  s.charAt(0).toUpperCase() + s.slice(1);

export const typeIcon = (t: string) =>
  ({ medical: "🚑", accident: "🚗", cardiac: "❤️", pregnancy: "🤰", fire: "🔥", other: "➕" } as Record<string, string>)[t] || "🚨";

export const statusBadgeClass = (s: string) =>
  ({
    pending: "b-warn", assigned: "b-info", accepted: "b-info", "en-route": "b-info",
    arrived: "b-ok", "in-progress": "b-ok", completed: "b-ok", cancelled: "b-red", rejected: "b-red",
  } as Record<string, string>)[s] || "b-info";

export const toLeaflet = (p: { latitude: number; longitude: number }): [number, number] => [p.latitude, p.longitude];
