import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth, type Role } from "../context/AuthContext";

interface ProtectedRouteProps {
  allowedRoles: Role[];
}

export default function ProtectedRoute({
  allowedRoles,
}: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <p>Verifying your session...</p>;
  }

  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location }}
      />
    );
  }

  if (!allowedRoles.includes(user.role)) {
    const correctDashboard: Record<Role, string> = {
      user: "/user/dashboard",
      unit: "/unit/dashboard",
      hospital: "/hospital/overview",
      admin: "/admin/dashboard",
    };

    return (
      <Navigate
        to={correctDashboard[user.role]}
        replace
      />
    );
  }

  return <Outlet />;
}