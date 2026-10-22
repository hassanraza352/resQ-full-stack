import { Link } from "react-router-dom";
import AppLayout from "../components/AppLayout";
import { Empty, ErrorBox, Loading } from "../components/ui";
import { useFetch } from "../hooks/useFetch";
import { useLive } from "../context/SocketContext";
import { api } from "../api/client";
import { timeAgo } from "../api/format";
import type { NotificationItem } from "../api/types";

const icon = (t: string) => ({ assignment: "🚑", "request-status": "📡", message: "💬", "hospital-response": "🏥", "hospital-case": "🏥", verification: "✅" } as Record<string, string>)[t] || "🔔";

const Notifications = () => {
  const { data, loading, error, reload } = useFetch(
    async () => (await api.get("/notifications", { params: { limit: 50 } })).data as { notifications: NotificationItem[]; unreadCount: number }
  );
  useLive(["notification:new", "resync"], () => void reload(true));

  const read = async (id: string) => { await api.patch(`/notifications/${id}/read`).catch(() => {}); void reload(true); };
  const readAll = async () => { await api.patch("/notifications/read-all").catch(() => {}); void reload(true); };

  return (
    <AppLayout title="Notifications" actions={data && data.unreadCount > 0 ? <button className="btn sm" onClick={readAll}>Mark all read</button> : null}>
      {loading && <Loading />}
      {error && <ErrorBox message={error} onRetry={() => void reload()} />}
      {data && (
        <div className="box">
          {data.notifications.length === 0 && <Empty icon="🔔" title="No notifications" hint="Updates about your requests will show up here." />}
          {data.notifications.map((n) => (
            <div className="row" key={n.id} style={{ opacity: n.read ? 0.6 : 1 }}>
              <div className="ic">{icon(n.type)}</div>
              <div className="t"><b>{n.title}</b><small>{n.body} · {timeAgo(n.createdAt)}</small></div>
              {n.request && <Link className="btn sm" to={`/user/report-details?id=${n.request}`}>View</Link>}
              {!n.read && <button className="btn sm" onClick={() => read(n.id)}>✓</button>}
            </div>
          ))}
        </div>
      )}
    </AppLayout>
  );
};

export default Notifications;
