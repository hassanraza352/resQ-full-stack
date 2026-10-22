import { useState } from "react";
import AppLayout from "../components/AppLayout";
import { Banner, Empty, ErrorBox, Loading, Pager } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useFetch } from "../hooks/useFetch";
import { api, errorMessage } from "../api/client";
import { fmtDateTime } from "../api/format";
import type { Meta } from "../api/types";

interface U { _id: string; name: string; email: string; phone: string; role: string; isVerified: boolean; isActive?: boolean; createdAt: string }

const Users = () => {
  const { user: me } = useAuth();
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [page, setPage] = useState(1);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const { data, loading, error, reload } = useFetch(
    async () => (await api.get("/admin/users", { params: { page, limit: 15, ...(q && { q }), ...(role && { role }) } })).data as { users: U[]; meta: Meta },
    [page, role, q]
  );

  const toggle = async (u: U) => {
    const next = u.isActive === false;
    if (!window.confirm(`${next ? "Activate" : "Deactivate"} ${u.email}?`)) return;
    try { await api.patch(`/admin/users/${u._id}/active`, { isActive: next }); setMsg({ kind: "ok", text: next ? "Account activated." : "Account deactivated." }); void reload(true); }
    catch (e) { setMsg({ kind: "err", text: errorMessage(e) }); }
  };

  return (
    <AppLayout title="Users">
      <div className="tabs">
        <input placeholder="Search name or email" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} aria-label="Search users" />
        <select value={role} onChange={(e) => { setPage(1); setRole(e.target.value); }}>
          <option value="">All roles</option>{["user", "unit", "hospital", "admin"].map((r) => <option key={r}>{r}</option>)}
        </select>
      </div>
      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}
      {loading && <Loading />}
      {error && <ErrorBox message={error} onRetry={() => void reload()} />}
      {data?.users.length === 0 && <div className="box"><Empty icon="👥" title="No users match" /></div>}
      {data && data.users.length > 0 && (
        <div className="box">
          <div className="tw"><table>
            <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Status</th><th>Joined</th><th /></tr></thead>
            <tbody>
              {data.users.map((u) => (
                <tr key={u._id}>
                  <td><b>{u.name}</b></td><td>{u.email}</td><td>{u.phone}</td>
                  <td><span className="badge b-info">{u.role}</span></td>
                  <td><span className={`badge ${u.isActive === false ? "b-red" : "b-ok"}`}>{u.isActive === false ? "deactivated" : "active"}</span></td>
                  <td>{fmtDateTime(u.createdAt)}</td>
                  <td>{u._id !== me?.id && <button className="btn sm" onClick={() => toggle(u)}>{u.isActive === false ? "Activate" : "Deactivate"}</button>}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <Pager page={data.meta.page} pages={data.meta.pages} onPage={setPage} />
        </div>
      )}
    </AppLayout>
  );
};

export default Users;
