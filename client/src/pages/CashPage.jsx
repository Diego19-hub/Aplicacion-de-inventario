import { ArrowDownToLine, ArrowUpFromLine, Banknote, CheckCircle2, LockKeyhole, Plus, RefreshCw, WalletCards } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { apiRequest } from "../api/client.js";
import { Alert } from "../components/Alert.jsx";
import { Button } from "../components/Button.jsx";
import { Card } from "../components/Card.jsx";
import { Input } from "../components/Input.jsx";
import { InfoTip } from "../components/InfoTip.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { Select } from "../components/Select.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { useAuth } from "../context/AuthContext.jsx";

function formatMoney(value, currency = "MXN") {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(Number(value) || 0);
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function errorMessage(error) {
  if (error?.status === 401 || error?.code === "AUTH_REQUIRED") return "Tu sesión terminó. Inicia sesión nuevamente.";
  if (error?.status === 403 || error?.code === "FORBIDDEN") return "No tienes permisos para administrar la Caja.";
  const messages = {
    CASH_REGISTER_NOT_FOUND: "No se encontró la caja seleccionada.",
    CASH_REGISTER_INACTIVE: "La caja o su ubicación están inactivas.",
    CASH_REGISTER_DUPLICATE: "Ya existe una caja con ese nombre en la ubicación seleccionada.",
    CASH_SESSION_REQUIRED: "No hay una caja abierta para esta ubicación.",
    CASH_SESSION_ALREADY_OPEN: "Esta caja ya tiene una sesión abierta.",
    CASH_SESSION_NOT_FOUND: "No se encontró la sesión de Caja.",
    CASH_SESSION_ALREADY_CLOSED: "La sesión de Caja ya está cerrada.",
    CASH_INSUFFICIENT_FUNDS: "El retiro supera el efectivo disponible.",
    CASH_INVALID_AMOUNT: "Indica un importe válido mayor o igual a cero.",
    CASH_INVALID_CLOSING_AMOUNT: "Indica un efectivo contado válido.",
    CASH_INVALID_MOVEMENT: "Selecciona un tipo de movimiento válido."
  };
  return messages[error?.code] || error?.message || "No fue posible completar la operación.";
}

function Detail({ label, children, tone = "" }) {
  return <div className={`cash-detail ${tone ? `cash-detail--${tone}` : ""}`}><span>{label}</span><strong>{children}</strong></div>;
}

export function CashPage() {
  const { session } = useAuth();
  const currency = session.activeBusiness?.currency || "MXN";
  const canManageCash = ["owner", "manager"].includes(session.membership?.role);
  const [registers, setRegisters] = useState([]);
  const [locations, setLocations] = useState([]);
  const [currentSession, setCurrentSession] = useState(null);
  const [closedSummary, setClosedSummary] = useState(null);
  const [selectedRegisterId, setSelectedRegisterId] = useState("");
  const [openingAmount, setOpeningAmount] = useState("");
  const [movementType, setMovementType] = useState("cash_in");
  const [movementAmount, setMovementAmount] = useState("");
  const [movementReason, setMovementReason] = useState("");
  const [closingAmount, setClosingAmount] = useState("");
  const [showCreateRegister, setShowCreateRegister] = useState(false);
  const [registerName, setRegisterName] = useState("");
  const [registerLocationId, setRegisterLocationId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState("");
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState("");

  const activeRegisters = useMemo(() => registers.filter((register) => register.status === "active"), [registers]);
  const activeLocations = useMemo(() => locations.filter((location) => location.status === "active"), [locations]);

  const loadData = useCallback(async (signal) => {
    setLoading(true);
    setError(null);
    setNotice("");
    try {
      const [registerData, sessionData, locationData] = await Promise.all([
        apiRequest("/cash/registers", { signal }),
        apiRequest("/cash/sessions/current", { signal }),
        apiRequest("/locations?status=active", { signal })
      ]);
      setRegisters(registerData?.registers ?? []);
      setCurrentSession(sessionData?.session ?? null);
      setLocations(locationData?.locations ?? []);
      setSelectedRegisterId((current) => current || String(registerData?.registers?.find((register) => register.status === "active")?.id ?? ""));
      setRegisterLocationId((current) => current || String(locationData?.locations?.[0]?.id ?? ""));
    } catch (requestError) {
      if (requestError?.name === "AbortError" || requestError?.message?.toLowerCase().includes("aborted")) return;
      setError(requestError);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadData(controller.signal);
    return () => controller.abort();
  }, [loadData]);

  function clearError() {
    setError(null);
    setNotice("");
  }

  async function openSession(event) {
    event.preventDefault();
    const amount = Number(openingAmount);
    if (!selectedRegisterId) return setError({ message: "Selecciona una caja para abrir la sesión." });
    if (!Number.isFinite(amount) || amount < 0) return setError({ code: "CASH_INVALID_AMOUNT" });
    if (!window.confirm("¿Deseas abrir esta sesión de Caja?")) return;
    setBusyAction("open");
    clearError();
    try {
      await apiRequest("/cash/sessions/open", { method: "POST", csrf: true, body: { registerId: Number(selectedRegisterId), openingAmount: amount } });
      setOpeningAmount("");
      setClosedSummary(null);
      await loadData();
    } catch (requestError) {
      setError(requestError);
    } finally {
      setBusyAction("");
    }
  }

  async function createRegister(event) {
    event.preventDefault();
    const name = registerName.trim();
    if (!name) return setError({ message: "Escribe el nombre de la caja." });
    if (!registerLocationId) return setError({ message: "Selecciona una ubicación activa." });
    const duplicate = registers.some((register) => register.location.id === Number(registerLocationId) && register.name.trim().toLowerCase() === name.toLowerCase());
    if (duplicate) return setError({ code: "CASH_REGISTER_DUPLICATE" });
    setBusyAction("register");
    clearError();
    try {
      const data = await apiRequest("/cash/registers", {
        method: "POST",
        csrf: true,
        body: { locationId: Number(registerLocationId), name }
      });
      const createdRegisterId = data?.register?.id;
      setRegisterName("");
      setShowCreateRegister(false);
      await loadData();
      if (createdRegisterId) setSelectedRegisterId(String(createdRegisterId));
      setNotice("La caja se creó correctamente.");
    } catch (requestError) {
      setError(requestError);
    } finally {
      setBusyAction("");
    }
  }

  async function saveMovement(event) {
    event.preventDefault();
    const amount = Number(movementAmount);
    if (!currentSession) return setError({ code: "CASH_SESSION_REQUIRED" });
    if (!Number.isFinite(amount) || amount <= 0) return setError({ code: "CASH_INVALID_AMOUNT" });
    if (!movementReason.trim()) return setError({ message: "Escribe un motivo para el movimiento." });
    const label = movementType === "cash_in" ? "entrada" : "retiro";
    if (!window.confirm(`¿Confirmas esta ${label} de ${formatMoney(amount, currency)}?`)) return;
    setBusyAction("movement");
    clearError();
    try {
      await apiRequest(`/cash/sessions/${currentSession.id}/movements`, {
        method: "POST",
        csrf: true,
        body: { movementType, amount, reason: movementReason.trim() }
      });
      setMovementAmount("");
      setMovementReason("");
      await loadData();
    } catch (requestError) {
      setError(requestError);
    } finally {
      setBusyAction("");
    }
  }

  async function closeSession(event) {
    event.preventDefault();
    const amount = Number(closingAmount);
    if (!currentSession) return setError({ code: "CASH_SESSION_REQUIRED" });
    if (!Number.isFinite(amount) || amount < 0) return setError({ code: "CASH_INVALID_CLOSING_AMOUNT" });
    if (!window.confirm("¿Deseas cerrar esta sesión de Caja? Revisa el efectivo contado antes de continuar.")) return;
    setBusyAction("close");
    clearError();
    try {
      const data = await apiRequest(`/cash/sessions/${currentSession.id}/close`, { method: "POST", csrf: true, body: { closingAmount: amount } });
      setClosedSummary(data?.session ?? null);
      setClosingAmount("");
      await loadData();
    } catch (requestError) {
      setError(requestError);
    } finally {
      setBusyAction("");
    }
  }

  if (!canManageCash) {
    return <section className="cash-page"><PageHeader title="Caja" description="Administra las sesiones de efectivo del negocio." /><Card><p className="cash-restricted">Solo owner y manager pueden administrar la Caja.</p></Card></section>;
  }

  if (loading) return <section className="dashboard-state"><Spinner label="Cargando Caja" /></section>;

  return (
    <section className="cash-page">
      <PageHeader
        title="Caja"
        description="Administra la apertura, los movimientos y el cierre de efectivo."
        actions={<><Button variant="secondary" onClick={() => loadData()} disabled={Boolean(busyAction)}><RefreshCw aria-hidden="true" />Actualizar</Button><Link className="button button--secondary" to="/app/cash/history">Ver historial de caja</Link>{!currentSession && <Button variant="secondary" onClick={() => { setShowCreateRegister(true); clearError(); }} disabled={Boolean(busyAction)}><Plus aria-hidden="true" />Nueva caja</Button>}</>}
      />
      {error && <Alert><div className="cash-error"><span>{errorMessage(error)}</span>{error.code === "CASH_SESSION_REQUIRED" && <Button variant="secondary" onClick={clearError}>Entendido</Button>}</div></Alert>}
      {notice && <div className="cash-notice" role="status"><CheckCircle2 aria-hidden="true" />{notice}</div>}

      {currentSession ? (
        <>
          <Card className="cash-status-card">
            <div className="cash-status-card__heading"><div><p className="eyebrow">Sesión actual</p><h2>{currentSession.register.name}</h2><p>{currentSession.location.name} · {currentSession.location.code}</p></div><span className="cash-status cash-status--open"><span aria-hidden="true" />Caja abierta</span></div>
            <div className="cash-details-grid">
              <Detail label="Abrió">{currentSession.openedBy.username}</Detail>
              <Detail label="Fecha de apertura">{formatDate(currentSession.openedAt)}</Detail>
              <Detail label={<span>Fondo inicial <InfoTip title="Fondo inicial" content="Dinero con el que comienza la sesión para dar cambio y operar." /></span>}>{formatMoney(currentSession.openingAmount, currency)}</Detail>
              <Detail label="Ventas en efectivo" tone="positive">{formatMoney(currentSession.cashSales, currency)}</Detail>
              <Detail label="Entradas" tone="positive">{formatMoney(currentSession.totalCashIn, currency)}</Detail>
              <Detail label="Retiros" tone="negative">{formatMoney(currentSession.totalCashOut, currency)}</Detail>
              <Detail label={<span>Efectivo esperado <InfoTip title="Efectivo esperado" content="Resultado de sumar fondo, entradas y ventas en efectivo, y restar retiros." /></span>} tone="highlight">{formatMoney(currentSession.expectedAmount, currency)}</Detail>
            </div>
          </Card>

          <div className="cash-action-grid">
            <Card>
              <div className="cash-card-heading"><ArrowUpFromLine aria-hidden="true" /><div><h2>Movimiento manual</h2><p>Registra entradas o retiros de efectivo.</p></div></div>
              <form className="cash-form" onSubmit={saveMovement}>
                <Select id="cash-movement-type" label={<span>Tipo de movimiento <InfoTip title="Entrada y retiro de efectivo" content="Una entrada agrega dinero a la caja; un retiro lo disminuye." /></span>} value={movementType} onChange={(event) => setMovementType(event.target.value)}>
                  <option value="cash_in">Entrada de efectivo</option>
                  <option value="cash_out">Retiro de efectivo</option>
                </Select>
                <Input id="cash-movement-amount" label="Importe" type="number" min="0.01" step="0.01" inputMode="decimal" value={movementAmount} onChange={(event) => setMovementAmount(event.target.value)} required />
                <Input id="cash-movement-reason" label="Motivo" value={movementReason} onChange={(event) => setMovementReason(event.target.value)} maxLength="500" required />
                <Button type="submit" variant="secondary" disabled={busyAction === "movement"}>{busyAction === "movement" ? <Spinner label="Guardando movimiento" /> : movementType === "cash_in" ? <><ArrowUpFromLine aria-hidden="true" />Entrada de efectivo</> : <><ArrowDownToLine aria-hidden="true" />Retiro de efectivo</>}</Button>
              </form>
            </Card>
            <Card>
              <div className="cash-card-heading"><LockKeyhole aria-hidden="true" /><div><h2>Cerrar caja</h2><p>Cuenta el efectivo disponible antes de cerrar.</p></div></div>
              <div className="cash-closing-expected"><span>Efectivo esperado <InfoTip title="Efectivo esperado" content="Es la cantidad que el sistema calcula que debería haber antes del cierre." /></span><strong>{formatMoney(currentSession.expectedAmount, currency)}</strong></div>
              <form className="cash-form" onSubmit={closeSession}>
                <Input id="cash-closing-amount" label="Efectivo contado" type="number" min="0" step="0.01" inputMode="decimal" value={closingAmount} onChange={(event) => setClosingAmount(event.target.value)} required />
                {closingAmount !== "" && Number.isFinite(Number(closingAmount)) && <div className={`cash-difference ${Number(closingAmount) - Number(currentSession.expectedAmount) < 0 ? "cash-difference--negative" : ""}`}><span>Diferencia <InfoTip title="Diferencia de caja" content="Compara el efectivo contado con el efectivo esperado. Puede ser positiva o negativa." /></span><strong>{formatMoney(Number(closingAmount) - Number(currentSession.expectedAmount), currency)}</strong></div>}
                <Button type="submit" variant="primary" disabled={busyAction === "close"}>{busyAction === "close" ? <Spinner label="Cerrando caja" /> : <><LockKeyhole aria-hidden="true" />Cerrar caja</>}</Button>
              </form>
            </Card>
          </div>
        </>
      ) : (
        <>
          {closedSummary && <Card className="cash-closed-summary"><CheckCircle2 aria-hidden="true" /><div><p className="eyebrow">Sesión cerrada</p><h2>Cierre completado</h2><p>La sesión se cerró correctamente.</p></div><div className="cash-details-grid"><Detail label="Efectivo contado">{formatMoney(closedSummary.closingAmount, currency)}</Detail><Detail label="Efectivo esperado">{formatMoney(closedSummary.expectedAmount, currency)}</Detail><Detail label="Diferencia" tone={Number(closedSummary.differenceAmount) < 0 ? "negative" : "positive"}>{formatMoney(closedSummary.differenceAmount, currency)}</Detail></div></Card>}
          <Card>
            <div className="cash-card-heading"><WalletCards aria-hidden="true" /><div><p className="eyebrow">Sin sesión abierta</p><h2>Abre una caja</h2><p>Selecciona una caja activa y registra el fondo inicial.</p></div></div>
            {activeRegisters.length === 0 ? <div className="cash-empty"><p>No hay cajas activas disponibles para este negocio.</p><Button variant="secondary" onClick={() => { setShowCreateRegister(true); clearError(); }}><Plus aria-hidden="true" />Crear caja</Button></div> : <div className="cash-register-list">{activeRegisters.map((register) => <article className="cash-register" key={register.id}><div><strong>{register.name}</strong><span>{register.location.name} · {register.location.code}</span></div><span className="cash-status cash-status--inactive">Disponible</span></article>)}</div>}
            {showCreateRegister && <form className="cash-create-form" onSubmit={createRegister}>
              <div className="cash-form-heading"><h3>Nueva caja</h3><p>Asigna un nombre y una ubicación activa.</p></div>
              <Input id="cash-register-name" label="Nombre de la caja" value={registerName} onChange={(event) => setRegisterName(event.target.value)} maxLength="120" autoFocus required />
              <Select id="cash-register-location" label="Ubicación activa" value={registerLocationId} onChange={(event) => setRegisterLocationId(event.target.value)} required>
                <option value="">Selecciona una ubicación</option>
                {activeLocations.map((location) => <option key={location.id} value={location.id}>{location.name} · {location.code}</option>)}
              </Select>
              <div className="cash-form-actions"><Button type="submit" disabled={busyAction === "register" || activeLocations.length === 0}>{busyAction === "register" ? <Spinner label="Guardando caja" /> : <><CheckCircle2 aria-hidden="true" />Guardar caja</>}</Button><Button type="button" variant="secondary" onClick={() => { setShowCreateRegister(false); setRegisterName(""); clearError(); }} disabled={busyAction === "register"}>Cancelar</Button></div>
            </form>}
            {activeRegisters.length > 0 && <form className="cash-open-form" onSubmit={openSession}><Select id="cash-register" label="Caja" value={selectedRegisterId} onChange={(event) => setSelectedRegisterId(event.target.value)} required><option value="">Selecciona una caja</option>{activeRegisters.map((register) => <option key={register.id} value={register.id}>{register.name} · {register.location.name}</option>)}</Select><Input id="cash-opening-amount" label="Fondo inicial" type="number" min="0" step="0.01" inputMode="decimal" value={openingAmount} onChange={(event) => setOpeningAmount(event.target.value)} required /><Button type="submit" disabled={busyAction === "open"}>{busyAction === "open" ? <Spinner label="Abriendo caja" /> : <><Plus aria-hidden="true" />Abrir caja</>}</Button></form>}
          </Card>
        </>
      )}
    </section>
  );
}
