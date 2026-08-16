import { AlertTriangle, ArrowLeft, Home, LogIn } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import { Button } from "../components/Button.jsx";
import { Card } from "../components/Card.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { useAuth } from "../context/AuthContext.jsx";

function ErrorActions({ onReset }) {
  const { isInitialLoading, session } = useAuth();
  const navigate = useNavigate();
  const isAuthenticated = !isInitialLoading && session.authenticated;
  const dashboardPath = session.activeBusiness ? "/app" : "/select-business";

  return (
    <div className="form-actions">
      <Button variant="secondary" onClick={() => navigate(-1)}>
        <ArrowLeft aria-hidden="true" />
        Volver
      </Button>
      {isAuthenticated ? (
        <Link className="button button--primary" to={dashboardPath} onClick={onReset}>
          <Home aria-hidden="true" />
          Ir al dashboard
        </Link>
      ) : (
        <Link className="button button--primary" to="/login" onClick={onReset}>
          <LogIn aria-hidden="true" />
          Iniciar sesión
        </Link>
      )}
    </div>
  );
}

export function ForbiddenPage() {
  return (
    <section className="error-page">
      <EmptyState
        title="Acceso restringido"
        description="Tu cuenta no tiene permisos para consultar esta sección."
        action={<ErrorActions />}
      />
    </section>
  );
}

export function NotFoundPage() {
  return (
    <section className="error-page">
      <EmptyState
        title="Página no encontrada"
        description="La ruta solicitada no existe o ya no está disponible."
        action={<ErrorActions />}
      />
    </section>
  );
}

export function UnexpectedErrorPage({ onReset }) {
  return (
    <main className="centered-state">
      <Card className="auth-card">
        <div className="auth-card__icon">
          <AlertTriangle aria-hidden="true" />
        </div>
        <div>
          <p className="eyebrow">Error inesperado</p>
          <h1>No pudimos mostrar esta pantalla</h1>
          <p className="muted">Intenta volver a una sección segura o iniciar sesión de nuevo.</p>
        </div>
        <ErrorActions onReset={onReset} />
      </Card>
    </main>
  );
}
