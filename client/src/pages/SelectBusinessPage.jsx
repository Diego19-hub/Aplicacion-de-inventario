import { Building2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { apiRequest } from "../api/client.js";
import { Alert } from "../components/Alert.jsx";
import { Button } from "../components/Button.jsx";
import { Card } from "../components/Card.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { useAuth } from "../context/AuthContext.jsx";

export function SelectBusinessPage() {
  const { logout, selectBusiness, session } = useAuth();
  const navigate = useNavigate();
  const [businesses, setBusinesses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [submittingBusinessId, setSubmittingBusinessId] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    apiRequest("/businesses")
      .then((data) => { if (active) setBusinesses(data); })
      .catch((requestError) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, []);

  async function handleSelect(businessId) {
    setSubmittingBusinessId(businessId);
    setError("");
    try {
      await selectBusiness(businessId);
      navigate("/app", { replace: true });
    } catch (requestError) {
      setError(requestError.message || "No fue posible seleccionar el negocio.");
    } finally {
      setSubmittingBusinessId(null);
    }
  }

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <main className="selection-page">
      <div className="selection-page__content">
        <PageHeader title="Selecciona un negocio" description="Elige el espacio de trabajo con el que deseas continuar." />
        {error && <Alert>{error}</Alert>}
        {isLoading ? (
          <div className="centered-state">
            <Spinner label="Cargando negocios" />
          </div>
        ) : businesses.length === 0 ? (
          <EmptyState
            title="No hay negocios disponibles"
            description="Tu cuenta no tiene una membresía activa en ningún negocio."
            action={<Button variant="secondary" onClick={handleLogout}>Cerrar sesión</Button>}
          />
        ) : (
          <div className="business-grid">
            {businesses.map((business) => {
              const isSelected = session.activeBusiness?.id === business.id;
              const isSubmitting = submittingBusinessId === business.id;

              return (
                <Card key={business.id} className="business-card">
                  <Building2 aria-hidden="true" />
                  <h2>{business.name}</h2>
                  <p>{business.role}</p>
                  {isSelected && <p aria-current="true">Negocio seleccionado actualmente</p>}
                  <Button
                    onClick={() => handleSelect(business.id)}
                    disabled={Boolean(submittingBusinessId)}
                    variant={isSelected ? "secondary" : "primary"}
                  >
                    {isSubmitting ? "Seleccionando…" : isSelected ? "Continuar con este negocio" : "Seleccionar"}
                  </Button>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
