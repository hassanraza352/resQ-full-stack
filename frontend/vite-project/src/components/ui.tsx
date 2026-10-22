import type { ReactNode } from "react";
import { statusBadgeClass, statusLabel } from "../api/format";

export const Loading = ({ text = "Loading…" }: { text?: string }) => (
  <p role="status" style={{ color: "var(--mut)", padding: "18px 4px" }}>⏳ {text}</p>
);

export const ErrorBox = ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
  <div role="alert" className="box" style={{ borderColor: "var(--red)" }}>
    <p style={{ color: "var(--red)", marginBottom: onRetry ? 10 : 0 }}>⚠️ {message}</p>
    {onRetry && <button className="btn sm" onClick={onRetry}>↻ Retry</button>}
  </div>
);

export const Empty = ({ icon = "📭", title, hint, action }: { icon?: string; title: string; hint?: string; action?: ReactNode }) => (
  <div style={{ textAlign: "center", padding: "28px 12px", color: "var(--mut)" }}>
    <div style={{ fontSize: 34 }}>{icon}</div>
    <b style={{ display: "block", color: "var(--tx)", margin: "6px 0" }}>{title}</b>
    {hint && <p style={{ marginBottom: 12 }}>{hint}</p>}
    {action}
  </div>
);

export const Banner = ({ kind = "info", children }: { kind?: "info" | "ok" | "warn" | "err"; children: ReactNode }) => {
  const color = { info: "var(--info)", ok: "var(--ok)", warn: "var(--warn)", err: "var(--red)" }[kind];
  return (
    <div role={kind === "err" ? "alert" : "status"} style={{ border: `1px solid ${color}`, borderLeft: `5px solid ${color}`, borderRadius: 12, padding: "10px 14px", margin: "0 0 14px", background: "var(--card)", fontSize: 14 }}>
      {children}
    </div>
  );
};

export const StatusBadge = ({ status }: { status: string }) => (
  <span className={`badge ${statusBadgeClass(status)}`}>{statusLabel(status)}</span>
);

export const PriorityBadge = ({ priority }: { priority: string }) => (
  <span className={`badge ${priority === "critical" ? "b-red" : priority === "high" ? "b-warn" : "b-info"}`}>{priority}</span>
);

export const Pager = ({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) =>
  pages <= 1 ? null : (
    <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "center", marginTop: 14 }}>
      <button className="btn sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>← Prev</button>
      <span style={{ color: "var(--mut)", fontSize: 13 }}>Page {page} of {pages}</span>
      <button className="btn sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next →</button>
    </div>
  );

export const Stat = ({ label, value, badge, kind = "b-info" }: { label: string; value: ReactNode; badge?: string; kind?: string }) => (
  <div className="st">
    <small>{label}</small>
    <b>{value}</b>
    {badge && <span className={`badge ${kind}`}>{badge}</span>}
  </div>
);

export const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="fld">
    <label>{label}</label>
    {children}
  </div>
);
