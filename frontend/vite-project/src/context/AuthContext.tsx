import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type Role = "user" | "unit" | "hospital" | "admin";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: Role;
  isVerified: boolean;
  emergencyContact?: { name: string; phone: string };
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  refreshAuth: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5000/api";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshAuth = useCallback(async () => {
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/auth/me`, {
        method: "GET",
        credentials: "include",
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok && data.success && data.user) {
        setUser(data.user as AuthUser);
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error("Session verification failed:", error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshAuth();
  }, [refreshAuth]);

  // Clears the HTTP-only cookie on the server, then drops the local session.
  const logout = useCallback(async () => {
    try {
      await fetch(`${API_URL}/auth/logout`, { method: "POST", credentials: "include" });
    } catch (error) {
      console.error("Logout request failed:", error);
    } finally {
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, refreshAuth, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}