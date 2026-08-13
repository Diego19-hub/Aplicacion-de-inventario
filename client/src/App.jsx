import { Navigate, Route, Routes } from "react-router-dom";

import { Spinner } from "./components/Spinner.jsx";
import { useAuth } from "./context/AuthContext.jsx";
import { AppShell } from "./layout/AppShell.jsx";
import { DashboardPage } from "./pages/DashboardPage.jsx";
import { LoginPage } from "./pages/LoginPage.jsx";
import { ProductsPage } from "./pages/ProductsPage.jsx";
import { ProductDetailsPage } from "./pages/ProductDetailsPage.jsx";
import { NewProductPage } from "./pages/NewProductPage.jsx";
import { EditProductPage } from "./pages/EditProductPage.jsx";
import { ArchiveProductPage } from "./pages/ArchiveProductPage.jsx";
import { ArchivedProductsPage } from "./pages/ArchivedProductsPage.jsx";
import { ArchivedProductDetailsPage } from "./pages/ArchivedProductDetailsPage.jsx";
import { RestoreProductPage } from "./pages/RestoreProductPage.jsx";
import { ProductMovementsPage } from "./pages/ProductMovementsPage.jsx";
import { NewProductMovementPage } from "./pages/NewProductMovementPage.jsx";
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
      <Route
        path="/app/products"
        element={<SessionGuard><AppShell><ProductsPage /></AppShell></SessionGuard>}
      />
      <Route
        path="/app/products/new"
        element={<SessionGuard><AppShell><NewProductPage /></AppShell></SessionGuard>}
      />
      <Route
        path="/app/products/archived"
        element={<SessionGuard><AppShell><ArchivedProductsPage /></AppShell></SessionGuard>}
      />
      <Route
        path="/app/products/:productId/edit"
        element={<SessionGuard><AppShell><EditProductPage /></AppShell></SessionGuard>}
      />
      <Route
        path="/app/products/:productId/archive"
        element={<SessionGuard><AppShell><ArchiveProductPage /></AppShell></SessionGuard>}
      />
      <Route
        path="/app/products/:productId/archived"
        element={<SessionGuard><AppShell><ArchivedProductDetailsPage /></AppShell></SessionGuard>}
      />
      <Route
        path="/app/products/:productId/restore"
        element={<SessionGuard><AppShell><RestoreProductPage /></AppShell></SessionGuard>}
      />
      <Route
        path="/app/products/:productId/movements"
        element={<SessionGuard><AppShell><ProductMovementsPage /></AppShell></SessionGuard>}
      />
      <Route
        path="/app/products/:productId/movements/new"
        element={<SessionGuard><AppShell><NewProductMovementPage /></AppShell></SessionGuard>}
      />
      <Route
        path="/app/products/:productId"
        element={<SessionGuard><AppShell><ProductDetailsPage /></AppShell></SessionGuard>}
      />
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  );
}
