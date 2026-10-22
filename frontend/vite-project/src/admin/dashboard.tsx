
import { useMemo } from "react";
import { Link } from "react-router-dom";
import AppLayout from "../components/AppLayout";
import MapView, { type MapMarker } from "../components/MapView";
import {
  Empty,
  ErrorBox,
  Loading,
  PriorityBadge,
  Stat,
  StatusBadge,
} from "../components/ui";
import { useFetch } from "../hooks/useFetch";
import { useLive } from "../context/SocketContext";
import { api } from "../api/client";
import { timeAgo, typeIcon } from "../api/format";
import type { EmergencyRequest } from "../api/types";

interface Stats {
  users: { total: number; byRole: Record<string, number> };
  units: {
    total: number;
    verified: number;
    pending: number;
    available: number;
    assigned: number;
    offline: number;
  };
  hospitals: {
    total: number;
    verified: number;
    pending: number;
    accepting: number;
  };
  emergencies: {
    total: number;
    pending: number;
    active: number;
    completed: number;
    cancelled: number;
  };
  timings: {
    timeToArrival: {
      sampleSize: number;
      averageMinutes: number | null;
    };
  };
  generatedAt: string;
}

const Dashboardadmin = () => {
  const { data, loading, error, reload } = useFetch(async () => {
    const [statsResponse, emergenciesResponse] = await Promise.all([
      api.get("/admin/dashboard"),
      api.get("/admin/emergencies", {
        params: {
          scope: "active",
          limit: 50,
          sort: "priority",
        },
      }),
    ]);

    return {
      stats: statsResponse.data.data as Stats,
      active: emergenciesResponse.data.requests as EmergencyRequest[],
    };
  });

useLive(
  ["emergency:new", "emergency:updated", "resync"],
  () => void reload(true),
  250
);

  // Recalculate markers only when the active emergency list changes.
  const markers = useMemo<MapMarker[]>(
    () =>
      (data?.active ?? []).map((request) => ({
        id: request.id,
        kind: "incident",
        position: [
          request.location.latitude,
          request.location.longitude,
        ],
        title: `${request.referenceId} (${request.status})`,
        detail: request.location.address,
      })),
    [data?.active]
  );

  const pendingList = useMemo(
    () =>
      (data?.active ?? [])
        .filter((request) => request.status === "pending")
        .slice(0, 8),
    [data?.active]
  );

  const stats = data?.stats;
  const pendingCount = stats?.emergencies.pending ?? 0;
  const pendingVerifications =
    (stats?.units.pending ?? 0) + (stats?.hospitals.pending ?? 0);

  return (
    <AppLayout title="Admin Dashboard">
      {/* Only show the initial loader when no dashboard data exists yet. */}
      {loading && !data && <Loading />}

      {/* Keep already loaded dashboard data visible during refresh errors. */}
      {error && (
        <ErrorBox
          message={error}
          onRetry={() => void reload()}
        />
      )}

      {stats && (
        <>
          <div className="cards">
            <Stat
              label="Active incidents"
              value={stats.emergencies.active}
              badge={`${pendingCount} awaiting dispatch`}
              kind={pendingCount ? "b-red" : "b-ok"}
            />

            <Stat
              label="Total requests"
              value={stats.emergencies.total}
              badge={`${stats.emergencies.completed} completed`}
              kind="b-info"
            />

            <Stat
              label="Units available"
              value={stats.units.available}
              badge={`${stats.units.assigned} assigned · ${stats.units.offline} off duty`}
              kind={stats.units.available ? "b-ok" : "b-warn"}
            />

            <Stat
              label="Verified hospitals"
              value={stats.hospitals.verified}
              badge={`${stats.hospitals.accepting} accepting`}
              kind="b-ok"
            />

            <Stat
              label="Pending verifications"
              value={pendingVerifications}
              badge={`${stats.units.pending} units · ${stats.hospitals.pending} hospitals`}
              kind={pendingVerifications ? "b-warn" : "b-ok"}
            />

            <Stat
              label="Avg. time to arrival"
              value={
                stats.timings.timeToArrival.averageMinutes != null
                  ? `${stats.timings.timeToArrival.averageMinutes} min`
                  : "—"
              }
              badge={
                stats.timings.timeToArrival.sampleSize
                  ? `n=${stats.timings.timeToArrival.sampleSize}`
                  : "not enough data"
              }
            />
          </div>

          <div className="two">
            <div className="box">
              <h3>Active incidents map</h3>

              <MapView
                markers={markers}
                height={380}
                legendKinds={["incident"]}
                emptyHint="No active incidents"
              />
            </div>

            <div className="box">
              <h3>
                Awaiting dispatch{" "}
                {pendingCount > 0 && (
                  <span className="badge b-red">{pendingCount}</span>
                )}
              </h3>

              {pendingList.length === 0 && (
                <Empty icon="✅" title="Queue is clear" />
              )}

              {pendingList.map((request) => (
                <div className="row" key={request.id}>
                  <div className="ic">
                    {typeIcon(request.emergencyType)}
                  </div>

                  <div className="t">
                    <b>
                      {request.referenceId}{" "}
                      <PriorityBadge priority={request.priority} />
                    </b>
                    <small>
                      {request.location.address} ·{" "}
                      {timeAgo(request.createdAt)}
                    </small>
                  </div>

                  <StatusBadge status={request.status} />
                </div>
              ))}

              <p style={{ marginTop: 10 }}>
                <Link
                  className="btn p sm"
                  to="/admin/incident"
                >
                  Open dispatch workspace →
                </Link>
              </p>

              <small style={{ color: "var(--mut)" }}>
                Database stats updated at{" "}
                {new Date(stats.generatedAt).toLocaleTimeString()}
              </small>
            </div>
          </div>
        </>
      )}
    </AppLayout>
  );
};

export default Dashboardadmin;
