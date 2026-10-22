import { useState } from "react";
import AppLayout from "../components/AppLayout";
import { Empty, ErrorBox, Loading, Stat } from "../components/ui";
import { useFetch } from "../hooks/useFetch";
import { api } from "../api/client";
import { statusLabel } from "../api/format";

interface Count { key: string; count: number }
interface TimingStat { sampleSize: number; averageMinutes: number | null; medianMinutes: number | null }
interface Report {
  rangeDays: number; byType: Count[]; byStatus: Count[]; byPriority: Count[]; perDay: Count[]; hospitalResponses: Count[];
  timings: { dispatchDelay: TimingStat; travelTime: TimingStat; timeToArrival: TimingStat };
}

const Bars = ({ rows, label = (k: string) => k }: { rows: Count[]; label?: (k: string) => string }) => {
  const max = Math.max(1, ...rows.map((r) => r.count));
  if (!rows.length) return <Empty icon="📊" title="No data in this period" />;
  return (
    <div>
      {rows.map((r) => (
        <div key={r.key} style={{ display: "grid", gridTemplateColumns: "110px 1fr 40px", gap: 8, alignItems: "center", margin: "6px 0", fontSize: 13 }}>
          <span>{label(r.key)}</span>
          <div style={{ background: "var(--bd)", borderRadius: 6, height: 14 }}><div style={{ width: `${(r.count / max) * 100}%`, height: "100%", borderRadius: 6, background: "var(--sky)" }} /></div>
          <b>{r.count}</b>
        </div>
      ))}
    </div>
  );
};

const T = ({ t }: { t: TimingStat }) => (t.sampleSize ? <>{t.averageMinutes} min avg · {t.medianMinutes} median <small>(n={t.sampleSize})</small></> : <>Not enough data</>);

const Reports = () => {
  const [days, setDays] = useState(30);
  const { data, loading, error, reload } = useFetch(async () => (await api.get("/admin/reports", { params: { days } })).data.data as Report, [days]);

  return (
    <AppLayout title="Reports & Analytics">
      <div className="tabs">
        {[7, 30, 90, 365].map((d) => <span key={d} className={`chip ${days === d ? "on" : ""}`} onClick={() => setDays(d)}>Last {d} days</span>)}
      </div>
      {loading && <Loading />}
      {error && <ErrorBox message={error} onRetry={() => void reload()} />}
      {data && (
        <>
          <div className="cards">
            <Stat label="Requests in period" value={data.byStatus.reduce((a, b) => a + b.count, 0)} badge={`${data.rangeDays} days`} />
            <Stat label="Dispatch delay" value={data.timings.dispatchDelay.averageMinutes != null ? `${data.timings.dispatchDelay.averageMinutes} min` : "—"} badge={data.timings.dispatchDelay.sampleSize ? `n=${data.timings.dispatchDelay.sampleSize}` : "no data"} />
            <Stat label="Unit travel time" value={data.timings.travelTime.averageMinutes != null ? `${data.timings.travelTime.averageMinutes} min` : "—"} badge={data.timings.travelTime.sampleSize ? `n=${data.timings.travelTime.sampleSize}` : "no data"} />
            <Stat label="Time to arrival" value={data.timings.timeToArrival.averageMinutes != null ? `${data.timings.timeToArrival.averageMinutes} min` : "—"} badge={data.timings.timeToArrival.sampleSize ? `n=${data.timings.timeToArrival.sampleSize}` : "no data"} />
          </div>
          <div className="two" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div className="box"><h3>By category</h3><Bars rows={data.byType} /></div>
            <div className="box"><h3>By status</h3><Bars rows={data.byStatus} label={statusLabel} /></div>
            <div className="box"><h3>By priority</h3><Bars rows={data.byPriority} /></div>
            <div className="box"><h3>Hospital responses</h3><Bars rows={data.hospitalResponses} /></div>
          </div>
          <div className="box"><h3>Requests per day</h3><Bars rows={data.perDay} /></div>
          <div className="box">
            <h3>Response-time statistics</h3>
            <p>Dispatch delay (created → assigned): <b><T t={data.timings.dispatchDelay} /></b></p>
            <p>Travel time (assigned → arrived): <b><T t={data.timings.travelTime} /></b></p>
            <p>Time to arrival (created → arrived): <b><T t={data.timings.timeToArrival} /></b></p>
            <small style={{ color: "var(--mut)" }}>Computed from recorded status timestamps; shown as "Not enough data" when no request has the required events.</small>
          </div>
        </>
      )}
    </AppLayout>
  );
};

export default Reports;
