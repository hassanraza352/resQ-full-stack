import { useState } from "react";
import AppLayout from "../components/AppLayout";
import Chat from "../components/Chat";
import { Empty, ErrorBox, Loading, StatusBadge } from "../components/ui";
import { useFetch } from "../hooks/useFetch";
import { useLive } from "../context/SocketContext";
import { api } from "../api/client";
import { timeAgo, typeIcon } from "../api/format";

interface Thread { requestId: string; referenceId: string; status: string; emergencyType: string; active: boolean; lastMessage: { text: string; at: string; role: string } | null }

export const MessagesView = ({ title }: { title: string }) => {
  const { data, loading, error, reload } = useFetch(async () => (await api.get("/messages/threads")).data.threads as Thread[]);
  const [selected, setSelected] = useState<string | null>(null);
  useLive(["message:new", "emergency:updated", "resync"], () => void reload(true));
  const current = data?.find((t) => t.requestId === (selected || data?.[0]?.requestId));

  return (
    <AppLayout title={title}>
      {loading && <Loading />}
      {error && <ErrorBox message={error} onRetry={() => void reload()} />}
      {data && data.length === 0 && <div className="box"><Empty icon="💬" title="No conversations" hint="Messages are available for your emergency requests, with the people handling them." /></div>}
      {data && data.length > 0 && (
        <div className="two" style={{ gridTemplateColumns: "1fr 2fr" }}>
          <div className="box">
            <h3>Conversations</h3>
            {data.map((t) => (
              <div className="row" key={t.requestId} style={{ cursor: "pointer", background: current?.requestId === t.requestId ? "rgba(56,189,248,.12)" : undefined }} onClick={() => setSelected(t.requestId)}>
                <div className="ic">{typeIcon(t.emergencyType)}</div>
                <div className="t"><b>{t.referenceId}</b><small>{t.lastMessage ? `${t.lastMessage.text.slice(0, 40)} · ${timeAgo(t.lastMessage.at)}` : "No messages yet"}</small></div>
                <StatusBadge status={t.status} />
              </div>
            ))}
          </div>
          <div className="box">
            <h3>{current?.referenceId}</h3>
            {current && <Chat requestId={current.requestId} />}
          </div>
        </div>
      )}
    </AppLayout>
  );
};

const Messages = () => <MessagesView title="Messages" />;
export default Messages;
