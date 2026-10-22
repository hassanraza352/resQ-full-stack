import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { io, type Socket } from "socket.io-client";
import { SOCKET_URL } from "../api/client";
import { useAuth } from "./AuthContext";

interface SocketCtx { socket: Socket | null; connected: boolean }
const Ctx = createContext<SocketCtx>({ socket: null, connected: false });

/** One authenticated socket per logged-in session (cookie is sent automatically). */
export function SocketProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!user) return;
    const s = io(SOCKET_URL, { withCredentials: true, transports: ["websocket", "polling"], reconnectionDelayMax: 8000 });
    s.on("connect", () => setConnected(true));
    s.on("disconnect", () => setConnected(false));
    setSocket(s);
    return () => {
      s.removeAllListeners();
      s.disconnect();
      setSocket(null);
      setConnected(false);
    };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return <Ctx.Provider value={{ socket, connected }}>{children}</Ctx.Provider>;
}

export const useSocket = () => useContext(Ctx);

/**
 * Calls `onEvent` whenever one of `events` arrives AND after every (re)connect,
 * so a page that missed events while offline re-syncs from the REST API.
 * The database stays the source of truth; events only signal "refetch".
 */
export function useLive(events: string[], onEvent: (event: string, payload?: unknown) => void) {
  const { socket } = useSocket();
  const cb = useRef(onEvent);
  useEffect(() => { cb.current = onEvent; });
  const key = events.join("|");

  useEffect(() => {
    if (!socket) return;
    const handlers = events.map((ev) => {
      const h = (payload?: unknown) => cb.current(ev, payload);
      socket.on(ev, h);
      return [ev, h] as const;
    });
    const resync = () => cb.current("resync");
    socket.io.on("reconnect", resync);
    return () => {
      handlers.forEach(([ev, h]) => socket.off(ev, h));
      socket.io.off("reconnect", resync);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, key]);
}
