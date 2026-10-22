import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth, type Role } from "../context/AuthContext";
import { useLive, useSocket } from "../context/SocketContext";
import { api } from "../api/client";
import { timeAgo } from "../api/format";
import type { NotificationItem } from "../api/types";

type NavItem = { to: string; icon: string; label: string };

// Same pages/labels as the original per-role sidebars (+ the admin units page that existed but was not routed)
const NAV: Record<Role, NavItem[]> = {
  user: [
    { to: "/user/dashboard", icon: "🏠", label: "Dashboard" },
    { to: "/user/report", icon: "🚨", label: "Report Incident" },
    { to: "/user/my-reports", icon: "📄", label: "My Reports" },
    { to: "/user/report-details", icon: "📡", label: "Live Status" },
    { to: "/user/hospital", icon: "🏥", label: "Nearby Hospitals" },
    { to: "/user/units", icon: "🚑", label: "Service Units" },
    { to: "/user/map", icon: "🗺️", label: "Live Map" },
    { to: "/user/messages", icon: "💬", label: "Messages" },
    { to: "/user/notifications", icon: "🔔", label: "Notifications" },
    { to: "/user/settings", icon: "⚙️", label: "Settings" },
  ],
  unit: [
    { to: "/unit/dashboard", icon: "🏠", label: "Dashboard" },
    { to: "/unit/request", icon: "📥", label: "Requests" },
    { to: "/unit/assignment", icon: "🚨", label: "Active Assignment" },
    { to: "/unit/map", icon: "🗺️", label: "Map & Route" },
    { to: "/unit/profile", icon: "🚑", label: "Unit Profile" },
    { to: "/unit/setting", icon: "⚙️", label: "Settings" },
  ],
  hospital: [
    { to: "/hospital/overview", icon: "🏥", label: "Overview" },
    { to: "/hospital/cases", icon: "📋", label: "Cases" },
    { to: "/hospital/beds", icon: "🛏️", label: "Beds" },
    { to: "/hospital/staff", icon: "👩‍⚕️", label: "Staff" },
    { to: "/hospital/setting", icon: "⚙️", label: "Settings" },
  ],
  admin: [
    { to: "/admin/dashboard", icon: "🏠", label: "Dashboard" },
    { to: "/admin/incident", icon: "🚨", label: "Incidents & Dispatch" },
    { to: "/admin/units", icon: "🚑", label: "Units" },
    { to: "/admin/hospital", icon: "🏥", label: "Hospitals" },
    { to: "/admin/user", icon: "👥", label: "Users" },
    { to: "/admin/reports", icon: "📊", label: "Reports" },
    { to: "/admin/setting", icon: "⚙️", label: "Settings" },
  ],
};

function Bell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/notifications", { params: { limit: 8 } });
      setItems(data.notifications);
      setUnread(data.unreadCount);
    } catch { /* bell is non-critical */ }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useLive(["notification:new", "resync"], () => void load());

  const readAll = async () => {
    await api.patch("/notifications/read-all").catch(() => {});
    void load();
  };

  return (
    <div style={{ position: "relative" }}>
      <button className="btn sm" aria-label={`Notifications, ${unread} unread`} onClick={() => setOpen((o) => !o)}>
        🔔{unread > 0 && <b style={{ marginLeft: 4, color: "var(--red)" }}>{unread > 9 ? "9+" : unread}</b>}
      </button>
      {open && (
        <div className="box" style={{ position: "absolute", right: 0, top: 44, width: 320, maxWidth: "88vw", zIndex: 2000, maxHeight: 380, overflow: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <b>Notifications</b>
            {unread > 0 && <button className="btn sm" onClick={readAll}>Mark all read</button>}
          </div>
          {items.length === 0 && <p style={{ color: "var(--mut)", padding: "12px 0" }}>Nothing yet.</p>}
          {items.map((n) => (
            <div key={n.id} className="row" style={{ opacity: n.read ? 0.6 : 1 }}>
              <div className="t"><b>{n.title}</b><small>{n.body} · {timeAgo(n.createdAt)}</small></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AppLayout({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  const { user, logout } = useAuth();
  const { connected } = useSocket();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const role = user!.role;

  const initials = user!.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  const toggleTheme = () => {
    const el = document.documentElement;
    const next = el.dataset.theme === "dark" ? "light" : "dark";
    el.dataset.theme = next;
    try { localStorage.setItem("resq-theme", next); } catch { /* storage unavailable */ }
  };
  useEffect(() => {
    try {
      const saved = localStorage.getItem("resq-theme");
      if (saved) document.documentElement.dataset.theme = saved;
    } catch { /* ignore */ }
  }, []);

  const doLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="app">
      <aside className={`side ${open ? "open" : ""}`}>
        <div className="side-header-controls">
          <Link className="logo" to="/"><i>✚</i>RESQ</Link>
          <button className="side-close-btn" onClick={() => setOpen(false)} aria-label="Close menu">✕</button>
        </div>
        {NAV[role].map((n) => (
          <NavLink key={n.to} to={n.to} className={({ isActive }) => (isActive ? "on" : "")} onClick={() => setOpen(false)}>
            <span>{n.icon}</span>{n.label}
          </NavLink>
        ))}
        <div style={{ marginTop: "auto" }}>
          <a href="/login" onClick={(e) => { e.preventDefault(); void doLogout(); }}>
            <span>↪</span>Logout
          </a>
        </div>
      </aside>
      <div className={`sidebar-overlay ${open ? "active" : ""}`} onClick={() => setOpen(false)} />

      <div className="main">
        <header className="top">
          <button className="burger" aria-label="Open menu" onClick={() => setOpen(true)}>☰</button>
          <h1>{title}</h1>
          <span className="sp" />
          {actions}
          <span title={connected ? "Real-time connection active" : "Real-time connection not active (pages refresh on demand)"} className={`badge ${connected ? "b-ok" : "b-warn"}`}>
            {connected ? "● Live" : "○ Offline"}
          </span>
          <button className="btn sm" aria-label="Toggle theme" onClick={toggleTheme}>🌓</button>
          <Bell />
          <div className="av" title={user!.name}>{initials || "U"}</div>
        </header>
        <main className="pg">{children}</main>
      </div>
    </div>
  );
}
