import { ArrowLeft, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { apiRequest } from "../api/client.js";
import { Alert } from "../components/Alert.jsx";
import { Button } from "../components/Button.jsx";
import { Card } from "../components/Card.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { Input } from "../components/Input.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { Select } from "../components/Select.jsx";
import { Spinner } from "../components/Spinner.jsx";

function statusLabel(status) {
  return {
    active: "Activo",
    suspended: "Suspendido",
    archived: "Archivado"
  }[status] ?? status;
}

function roleLabel(role) {
  return {
    owner: "Owner",
    manager: "Manager",
    viewer: "Viewer"
  }[role] ?? role;
}

function membershipStatusLabel(status) {
  return {
    active: "Activa",
    suspended: "Suspendida",
    removed: "Removida"
  }[status] ?? status;
}

function errorsByField(fields = []) {
  return Object.fromEntries(fields.map((field) => [field.field, field.message]));
}

export function ChangeAdminBusinessOwnerPage() {
  const { businessId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [requestError, setRequestError] = useState("");
  const [errors, setErrors] = useState({});
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadOptions = useCallback(async (query = "", useSearchLoading = false) => {
    const trimmedQuery = query.trim();
    const search = new URLSearchParams();
    if (trimmedQuery) search.set("q", trimmedQuery);

    setLoadError(null);
    setRequestError("");

    const updateLoading = useSearchLoading ? setIsSearching : setIsLoading;
    updateLoading(true);

    try {
      const response = await apiRequest(
        `/admin/businesses/${businessId}/change-owner/options${search.toString() ? `?${search.toString()}` : ""}`
      );
      setData(response);
      setSearchQuery(response.filters.q);
      setSelectedUserId((current) => (
        response.users.some((user) => String(user.id) === String(current))
          ? current
          : ""
      ));
    } catch (error) {
      setLoadError(error);
    } finally {
      updateLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    loadOptions("", false);
  }, [loadOptions]);

  function submitSearch(event) {
    event.preventDefault();
    loadOptions(searchQuery, true);
  }

  async function submitTransfer(event) {
    event.preventDefault();
    if (isSubmitting) return;

    const nextErrors = {};
    if (!selectedUserId) {
      nextErrors.newOwnerUserId = "Selecciona una persona propietaria válida.";
    }
    if (!confirmed) {
      nextErrors.confirmation = "Confirma explícitamente la transferencia antes de continuar.";
    }

    setErrors(nextErrors);
    setRequestError("");
    if (Object.keys(nextErrors).length > 0) return;

    setIsSubmitting(true);
    try {
      await apiRequest(`/admin/businesses/${businessId}/change-owner`, {
        method: "POST",
        body: { newOwnerUserId: Number(selectedUserId) },
        csrf: true
      });
      navigate(`/app/admin/businesses/${businessId}`);
    } catch (error) {
      setErrors(errorsByField(error.fields));
      setRequestError(error.message || "No fue posible transferir la propiedad del negocio.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return <section className="dashboard-state"><Spinner label="Cargando opciones de transferencia" /></section>;
  }

  if (loadError?.code === "BUSINESS_NOT_FOUND" || loadError?.code === "VALIDATION_ERROR") {
    return (
      <EmptyState
        title="Negocio no encontrado"
        description="No hay un negocio disponible con ese identificador."
        action={<Link className="button button--secondary" to="/app/admin/businesses">Volver a negocios</Link>}
      />
    );
  }

  if (loadError) {
    return (
      <Alert>
        <div className="dashboard-error">
          <span>No fue posible cargar las personas disponibles.</span>
          <Button variant="secondary" onClick={() => loadOptions(searchQuery, false)}>Reintentar</Button>
        </div>
      </Alert>
    );
  }

  const { business, owner, users, filters } = data;
  const selectedUser = users.find((user) => String(user.id) === String(selectedUserId)) ?? null;
  const businessArchived = business.status === "archived";

  return (
    <>
      <Link to={`/app/admin/businesses/${businessId}`} className="back-link">
        <ArrowLeft aria-hidden="true" />
        Volver al negocio
      </Link>
      <PageHeader
        title="Transferir propiedad"
        description="La persona propietaria anterior pasará a manager activa y la nueva persona quedará como owner activa."
      />
      <section className="transfer-detail-grid">
        <Card>
          <p className="eyebrow">Negocio</p>
          <dl className="detail-list">
            <div>
              <dt>Nombre</dt>
              <dd>{business.name}</dd>
            </div>
            <div>
              <dt>Slug</dt>
              <dd>{business.slug}</dd>
            </div>
            <div>
              <dt>Estado</dt>
              <dd>{statusLabel(business.status)}</dd>
            </div>
            <div>
              <dt>Propietario actual</dt>
              <dd>{owner ? `${owner.username} · ${owner.email}` : "Sin owner activo visible"}</dd>
            </div>
          </dl>
        </Card>
        <Card>
          <p className="eyebrow">Confirmación</p>
          <Alert variant={businessArchived ? "error" : "warning"}>
            {businessArchived
              ? "Los negocios archivados no pueden transferir propiedad."
              : "La transferencia se aplica dentro de una transacción y debe terminar con exactamente un owner activo."}
          </Alert>
          {selectedUser && (
            <dl className="detail-list">
              <div>
                <dt>Nuevo owner seleccionado</dt>
                <dd>{selectedUser.username} · {selectedUser.email}</dd>
              </div>
              <div>
                <dt>Membresía actual</dt>
                <dd>{selectedUser.membership ? `${roleLabel(selectedUser.membership.role)} · ${membershipStatusLabel(selectedUser.membership.status)}` : "No tiene membresía previa en este negocio"}</dd>
              </div>
            </dl>
          )}
        </Card>
      </section>

      <Card className="product-filter-card">
        <form className="product-filters" onSubmit={submitSearch}>
          <Input
            id="change-owner-search"
            type="search"
            label="Buscar personas registradas"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Username o correo"
          />
          <div className="product-filter-actions">
            <Button type="submit" variant="secondary" disabled={isSearching}>
              <Search aria-hidden="true" />
              {isSearching ? "Buscando…" : "Buscar personas"}
            </Button>
          </div>
        </form>
        <p className="muted">
          {filters.q
            ? `Mostrando coincidencias para “${filters.q}”.`
            : "Mostrando personas registradas disponibles para asumir la propiedad."}
        </p>
      </Card>

      <Card>
        {requestError && <Alert>{requestError}</Alert>}
        {users.length === 0 ? (
          <EmptyState
            title="Sin personas disponibles"
            description="Prueba con otro término de búsqueda para seleccionar a la nueva persona propietaria."
          />
        ) : (
          <form className="form-stack" onSubmit={submitTransfer} noValidate>
            <Select
              id="new-owner-user-id"
              label="Nueva persona propietaria"
              value={selectedUserId}
              onChange={(event) => {
                setSelectedUserId(event.target.value);
                setErrors((current) => {
                  const next = { ...current };
                  delete next.newOwnerUserId;
                  return next;
                });
              }}
              error={errors.newOwnerUserId}
              hint="Puedes elegir una cuenta sin membresía, activa, suspendida o removida; la membresía se reutilizará o creará como owner activa."
              required
              disabled={businessArchived || isSubmitting}
            >
              <option value="">Selecciona una persona</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.username} · {user.email}
                  {user.membership ? ` · ${roleLabel(user.membership.role)} ${membershipStatusLabel(user.membership.status).toLowerCase()}` : " · sin membresía"}
                </option>
              ))}
            </Select>

            <label className="archive-confirmation" htmlFor="change-owner-confirmation">
              <input
                id="change-owner-confirmation"
                type="checkbox"
                checked={confirmed}
                disabled={businessArchived || isSubmitting}
                onChange={(event) => {
                  setConfirmed(event.target.checked);
                  setErrors((current) => {
                    const next = { ...current };
                    delete next.confirmation;
                    return next;
                  });
                }}
                aria-invalid={Boolean(errors.confirmation)}
                aria-describedby={errors.confirmation ? "change-owner-confirmation-error" : undefined}
              />
              <span>Confirmo que quiero transferir la propiedad de este negocio y que la persona propietaria actual pasará a manager activa.</span>
            </label>
            {errors.confirmation && (
              <span id="change-owner-confirmation-error" className="field__error">
                {errors.confirmation}
              </span>
            )}

            <div className="form-actions">
              <Button
                type="submit"
                disabled={businessArchived || isSubmitting}
              >
                {isSubmitting ? "Transfiriendo…" : "Transferir propiedad"}
              </Button>
              <Link className="button button--secondary" to={`/app/admin/businesses/${businessId}`}>
                Cancelar
              </Link>
            </div>
          </form>
        )}
      </Card>
    </>
  );
}
