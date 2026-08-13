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
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  );
}
