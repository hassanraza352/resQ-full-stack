import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { api, errorMessage } from "../api/client";
import { useLive, useSocket } from "../context/SocketContext";
import { timeAgo } from "../api/format";
import type { ChatMessage } from "../api/types";
import { Banner, Loading } from "./ui";

/** Request-scoped chat. The server only lets the requester, assigned unit/hospital and admins in. */
export default function Chat({ requestId }: { requestId: string }) {
  const { socket } = useSocket();
  const [msgs, setMsgs] = useState<ChatMessage[] | null>(null);
  const [canSend, setCanSend] = useState(true);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/emergencies/${requestId}/messages`);
      setMsgs(data.messages);
      setCanSend(data.canSend);
      setErr(null);
    } catch (e) { setErr(errorMessage(e)); }
  }, [requestId]);

  useEffect(() => { setMsgs(null); void load(); }, [load]);
  useEffect(() => {
    if (!socket) return;
    socket.emit("request:join", { requestId }, () => {});
    return () => { socket.emit("request:leave", { requestId }); };
  }, [socket, requestId]);
  useLive(["message:new", "resync"], () => void load());
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [msgs]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await api.post(`/emergencies/${requestId}/messages`, { text });
      setText("");
      await load();
    } catch (er) { setErr(errorMessage(er)); } finally { setSending(false); }
  };

  return (
    <div>
      {err && <Banner kind="err">{err}</Banner>}
      {!msgs && !err && <Loading />}
      <div style={{ maxHeight: 340, overflow: "auto", display: "flex", flexDirection: "column", gap: 8, padding: "6px 2px" }} aria-live="polite">
        {msgs?.length === 0 && <p style={{ color: "var(--mut)" }}>No messages yet.</p>}
        {msgs?.map((m) => (
          <div key={m.id} style={{ alignSelf: m.mine ? "flex-end" : "flex-start", maxWidth: "80%", background: m.mine ? "var(--sky)" : "var(--card)", color: m.mine ? "#04121f" : "var(--tx)", border: "1px solid var(--bd)", borderRadius: 14, padding: "8px 12px" }}>
            <small style={{ opacity: 0.7 }}>{m.mine ? "You" : `${m.senderName || m.senderRole} (${m.senderRole})`} · {timeAgo(m.createdAt)}</small>
            <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.text}</div>
          </div>
        ))}
        <div ref={end} />
      </div>
      {canSend ? (
        <form onSubmit={send} style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <input style={{ flex: 1 }} value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} placeholder="Type a message…" aria-label="Message" />
          <button className="btn p" disabled={sending || !text.trim()}>Send</button>
        </form>
      ) : <p style={{ color: "var(--mut)", marginTop: 8 }}>This request is closed; messaging is disabled.</p>}
    </div>
  );
}
