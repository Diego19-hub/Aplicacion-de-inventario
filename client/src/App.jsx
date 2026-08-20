import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { Spinner } from "./components/Spinner.jsx";
import { useAuth } from "./context/AuthContext.jsx";
import { AppShell } from "./layout/AppShell.jsx";
import { DashboardPage } from "./pages/DashboardPage.jsx";
import { LandingPage } from "./pages/LandingPage.jsx";
import { LoginPage } from "./pages/LoginPage.jsx";
import { RegisterPage } from "./pages/RegisterPage.jsx";
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
import { NewTransferPage } from "./pages/NewTransferPage.jsx";
import { TransferDetailsPage } from "./pages/TransferDetailsPage.jsx";
import { TransfersPage } from "./pages/TransfersPage.jsx";
import { CategoriesPage } from "./pages/CategoriesPage.jsx";
import { CategoryDetailsPage } from "./pages/CategoryDetailsPage.jsx";
import { EditCategoryPage } from "./pages/EditCategoryPage.jsx";
import { NewCategoryPage } from "./pages/NewCategoryPage.jsx";
import { DeleteCategoryPage } from "./pages/DeleteCategoryPage.jsx";
import { LocationsPage } from "./pages/LocationsPage.jsx";
import { LocationDetailsPage } from "./pages/LocationDetailsPage.jsx";
import { NewLocationPage } from "./pages/NewLocationPage.jsx";
import { EditLocationPage } from "./pages/EditLocationPage.jsx";
import { LocationTransitionPage } from "./pages/LocationTransitionPage.jsx";
import { SuppliersPage } from "./pages/SuppliersPage.jsx";
import { SupplierDetailsPage } from "./pages/SupplierDetailsPage.jsx";
import { NewSupplierPage } from "./pages/NewSupplierPage.jsx";
import { EditSupplierPage } from "./pages/EditSupplierPage.jsx";
import { SupplierTransitionPage } from "./pages/SupplierTransitionPage.jsx";
import { MembersPage } from "./pages/MembersPage.jsx";
import { SelectBusinessPage } from "./pages/SelectBusinessPage.jsx";
import { CreateBusinessPage } from "./pages/CreateBusinessPage.jsx";
import { InvitationPage } from "./pages/InvitationPage.jsx";
import { AlertsPage } from "./pages/AlertsPage.jsx";
import { ProductThresholdsPage } from "./pages/ProductThresholdsPage.jsx";
import { ReportsPage } from "./pages/ReportsPage.jsx";
import { InventoryReportPage } from "./pages/InventoryReportPage.jsx";
import { MovementReportPage } from "./pages/MovementReportPage.jsx";
import { SettingsPage } from "./pages/SettingsPage.jsx";
import { AdminDashboardPage } from "./pages/AdminDashboardPage.jsx";
import { AdminBusinessesPage } from "./pages/AdminBusinessesPage.jsx";
import { AdminBusinessDetailsPage } from "./pages/AdminBusinessDetailsPage.jsx";
import { NewAdminBusinessPage } from "./pages/NewAdminBusinessPage.jsx";
import { EditAdminBusinessPage } from "./pages/EditAdminBusinessPage.jsx";
import { AdminBusinessTransitionPage } from "./pages/AdminBusinessTransitionPage.jsx";
import { ChangeAdminBusinessOwnerPage } from "./pages/ChangeAdminBusinessOwnerPage.jsx";
import { ForbiddenPage, NotFoundPage } from "./pages/ErrorPages.jsx";

function loginPath(returnTo) {
  const params = new URLSearchParams();
  if (returnTo && returnTo.startsWith("/")) {
    params.set("returnTo", returnTo);
  }

  return `/login${params.toString() ? `?${params.toString()}` : ""}`;
}

function SessionGuard({ children }) {
  const { isInitialLoading, session } = useAuth();
  const location = useLocation();

  if (isInitialLoading) {
    return <main className="centered-state"><Spinner label="Cargando sesión" /></main>;
  }

  if (!session.authenticated) {
    return <Navigate to={loginPath(`${location.pathname}${location.search}`)} replace />;
  }

  if (!session.activeBusiness) {
    return <Navigate to="/select-business" replace />;
  }

  return children;
}

function BusinessSelectionGuard({ children }) {
  const { isInitialLoading, session } = useAuth();
  const location = useLocation();

  if (isInitialLoading) {
    return <main className="centered-state"><Spinner label="Cargando sesión" /></main>;
  }

  if (!session.authenticated) {
    return <Navigate to={loginPath(`${location.pathname}${location.search}`)} replace />;
  }

  return children;
}

function SuperAdminGuard({ children }) {
  const { isInitialLoading, session } = useAuth();
  const location = useLocation();

  if (isInitialLoading) {
    return <main className="centered-state"><Spinner label="Cargando sesión" /></main>;
  }

  if (!session.authenticated) {
    return <Navigate to={loginPath(`${location.pathname}${location.search}`)} replace />;
  }

  if (session.user?.platformRole !== "super_admin") {
    return <main className="main-content"><ForbiddenPage /></main>;
  }

  return children;
}

function NotFoundRoute() {
  const { isInitialLoading, session } = useAuth();

  if (isInitialLoading) {
    return <main className="centered-state"><Spinner label="Cargando sesión" /></main>;
  }

  if (session.authenticated && session.activeBusiness) {
    return <AppShell><NotFoundPage /></AppShell>;
  }

  return <main className="centered-state"><NotFoundPage /></main>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/invitations/:token" element={<InvitationPage />} />
      <Route
        path="/select-business"
        element={<BusinessSelectionGuard><SelectBusinessPage /></BusinessSelectionGuard>}
      />
      <Route
        path="/app"
        element={<SessionGuard><AppShell><DashboardPage /></AppShell></SessionGuard>}
      />
      <Route path="/app/alerts" element={<SessionGuard><AppShell><AlertsPage /></AppShell></SessionGuard>} />
      <Route path="/app/reports" element={<SessionGuard><AppShell><ReportsPage /></AppShell></SessionGuard>} />
      <Route path="/app/reports/inventory" element={<SessionGuard><AppShell><InventoryReportPage /></AppShell></SessionGuard>} />
      <Route path="/app/reports/movements" element={<SessionGuard><AppShell><MovementReportPage title="Reporte de movimientos" description="Historial de inventario por ubicación." /></AppShell></SessionGuard>} />
      <Route path="/app/movements" element={<SessionGuard><AppShell><MovementReportPage /></AppShell></SessionGuard>} />
      <Route path="/app/settings" element={<SessionGuard><AppShell><SettingsPage /></AppShell></SessionGuard>} />
      <Route path="/app/admin" element={<SuperAdminGuard><AppShell><AdminDashboardPage /></AppShell></SuperAdminGuard>} />
      <Route path="/app/admin/businesses" element={<SuperAdminGuard><AppShell><AdminBusinessesPage /></AppShell></SuperAdminGuard>} />
      <Route path="/app/admin/businesses/new" element={<SuperAdminGuard><AppShell><NewAdminBusinessPage /></AppShell></SuperAdminGuard>} />
      <Route path="/app/admin/businesses/:businessId/edit" element={<SuperAdminGuard><AppShell><EditAdminBusinessPage /></AppShell></SuperAdminGuard>} />
      <Route path="/app/admin/businesses/:businessId/change-owner" element={<SuperAdminGuard><AppShell><ChangeAdminBusinessOwnerPage /></AppShell></SuperAdminGuard>} />
      <Route path="/app/admin/businesses/:businessId/:action" element={<SuperAdminGuard><AppShell><AdminBusinessTransitionPage /></AppShell></SuperAdminGuard>} />
      <Route path="/app/admin/businesses/:businessId" element={<SuperAdminGuard><AppShell><AdminBusinessDetailsPage /></AppShell></SuperAdminGuard>} />
      <Route path="/app/products/:productId/thresholds" element={<SessionGuard><AppShell><ProductThresholdsPage /></AppShell></SessionGuard>} />
      <Route
        path="/app/products"
        element={<SessionGuard><AppShell><ProductsPage /></AppShell></SessionGuard>}
      />
      <Route
        path="/app/categories"
        element={<SessionGuard><AppShell><CategoriesPage /></AppShell></SessionGuard>}
      />
      <Route
        path="/app/categories/new"
        element={<SessionGuard><AppShell><NewCategoryPage /></AppShell></SessionGuard>}
      />
      <Route
        path="/app/categories/:categoryId/edit"
        element={<SessionGuard><AppShell><EditCategoryPage /></AppShell></SessionGuard>}
      />
      <Route
        path="/app/categories/:categoryId/delete"
        element={<SessionGuard><AppShell><DeleteCategoryPage /></AppShell></SessionGuard>}
      />
      <Route
        path="/app/locations"
        element={<SessionGuard><AppShell><LocationsPage /></AppShell></SessionGuard>}
      />
      <Route
        path="/app/locations/new"
        element={<SessionGuard><AppShell><NewLocationPage /></AppShell></SessionGuard>}
      />
      <Route
        path="/app/locations/:locationId/edit"
        element={<SessionGuard><AppShell><EditLocationPage /></AppShell></SessionGuard>}
      />
      <Route
        path="/app/locations/:locationId/make-default"
        element={<SessionGuard><AppShell><LocationTransitionPage action="make-default" /></AppShell></SessionGuard>}
      />
      <Route
        path="/app/locations/:locationId/deactivate"
        element={<SessionGuard><AppShell><LocationTransitionPage action="deactivate" /></AppShell></SessionGuard>}
      />
      <Route
        path="/app/locations/:locationId/reactivate"
        element={<SessionGuard><AppShell><LocationTransitionPage action="reactivate" /></AppShell></SessionGuard>}
      />
      <Route
        path="/app/suppliers"
        element={<SessionGuard><AppShell><SuppliersPage /></AppShell></SessionGuard>}
      />
      <Route
        path="/app/members"
        element={<SessionGuard><AppShell><MembersPage /></AppShell></SessionGuard>}
      />
      <Route
        path="/app/suppliers/new"
        element={<SessionGuard><AppShell><NewSupplierPage /></AppShell></SessionGuard>}
      />
      <Route
        path="/app/suppliers/:supplierId/edit"
        element={<SessionGuard><AppShell><EditSupplierPage /></AppShell></SessionGuard>}
      />
      <Route
        path="/app/suppliers/:supplierId/deactivate"
        element={<SessionGuard><AppShell><SupplierTransitionPage action="deactivate" /></AppShell></SessionGuard>}
      />
      <Route
        path="/app/suppliers/:supplierId/reactivate"
        element={<SessionGuard><AppShell><SupplierTransitionPage action="reactivate" /></AppShell></SessionGuard>}
      />
      <Route
        path="/app/suppliers/:supplierId"
        element={<SessionGuard><AppShell><SupplierDetailsPage /></AppShell></SessionGuard>}
      />
      <Route
        path="/app/locations/:locationId"
        element={<SessionGuard><AppShell><LocationDetailsPage /></AppShell></SessionGuard>}
      />
      <Route
        path="/app/categories/:categoryId"
        element={<SessionGuard><AppShell><CategoryDetailsPage /></AppShell></SessionGuard>}
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
        path="/app/transfers/new"
        element={<SessionGuard><AppShell><NewTransferPage /></AppShell></SessionGuard>}
      />
      <Route
        path="/app/transfers"
        element={<SessionGuard><AppShell><TransfersPage /></AppShell></SessionGuard>}
      />
      <Route
        path="/app/transfers/:transferId"
        element={<SessionGuard><AppShell><TransferDetailsPage /></AppShell></SessionGuard>}
      />
      <Route
        path="/app/products/:productId"
        element={<SessionGuard><AppShell><ProductDetailsPage /></AppShell></SessionGuard>}
      />
      <Route
        path="/onboarding/business"
        element={
          <BusinessSelectionGuard>
            <CreateBusinessPage />
          </BusinessSelectionGuard>
        }
      />
      <Route path="*" element={<NotFoundRoute />} />
    </Routes>
  );
}
