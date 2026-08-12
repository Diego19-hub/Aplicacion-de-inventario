import { Navigate, Route, Routes } from "react-router-dom";

import { Spinner } from "./components/Spinner.jsx";
import { useAuth } from "./context/AuthContext.jsx";
import { AppShell } from "./layout/AppShell.jsx";
import { DashboardPage } from "./pages/DashboardPage.jsx";
import { LoginPage } from "./pages/LoginPage.jsx";
import { SelectBusinessPage } from "./pages/SelectBusinessPage.jsx";

function SessionGuard({ children }) {
  const { isInitialLoading, session } = useAuth();

  if (isInitialLoading) {
    return <main className="centered-state"><Spinner label="Cargando sesión" /></main>;
  }

  if (!session.authenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!session.activeBusiness) {
    return <Navigate to="/select-business" replace />;
  }

  return children;
}

function BusinessSelectionGuard({ children }) {
  const { isInitialLoading, session } = useAuth();

  if (isInitialLoading) {
    return <main className="centered-state"><Spinner label="Cargando sesión" /></main>;
  }

  if (!session.authenticated) {
    return <Navigate to="/login" replace />;
  }

  if (session.activeBusiness) {
    return <Navigate to="/app" replace />;
  }

  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/select-business"
        element={<BusinessSelectionGuard><SelectBusinessPage /></BusinessSelectionGuard>}
      />
      <Route
        path="/app"
        element={<SessionGuard><AppShell><DashboardPage /></AppShell></SessionGuard>}
      />
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  );
}
