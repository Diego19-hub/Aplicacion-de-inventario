import { Check, Edit3, Plus, Power, WalletCards } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { apiRequest } from "../api/client.js";
import { Alert } from "../components/Alert.jsx";
import { Button } from "../components/Button.jsx";
import { Card } from "../components/Card.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { Input } from "../components/Input.jsx";
import { InfoTip } from "../components/InfoTip.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { Select } from "../components/Select.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { useAuth } from "../context/AuthContext.jsx";

const typeLabels = { fixed: "Fijo", variable: "Variable" };
const frequencyLabels = { monthly: "Mensual", yearly: "Anual", one_time: "Único" };
const emptyForm = { name: "", description: "", amount: "", costType: "fixed", frequency: "monthly" };

function money(value, currency) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(Number(value));
}

function date(value) {
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(new Date(value));
}

function fieldsByName(fields = []) {
  return Object.fromEntries(fields.map((field) => [field.field, field.message]));
}

export function BusinessCostsPage() {
  const { session } = useAuth();
  const canManage = ["owner", "manager"].includes(session.membership?.role);
  const currency = session.activeBusiness?.currency ?? "MXN";
  const [costs, setCosts] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [errors, setErrors] = useState({});
  const [requestError, setRequestError] = useState("");
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const loadCosts = useCallback(async () => {
    setIsLoading(true);
    setRequestError("");
    try {
      const result = await apiRequest("/business-costs");
      setCosts(result.costs ?? []);
    } catch (error) {
      setRequestError(error.message || "No fue posible cargar los costos.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadCosts(); }, [loadCosts]);

  function openNew() {
    setEditingId(null);
    setForm(emptyForm);
    setErrors({});
    setRequestError("");
    setNotice("");
    setIsFormOpen(true);
  }

  function openEdit(cost) {
    setEditingId(cost.id);
    setForm({ name: cost.name, description: cost.description ?? "", amount: String(cost.amount), costType: cost.costType, frequency: cost.frequency });
    setErrors({});
    setRequestError("");
    setNotice("");
    setIsFormOpen(true);
  }

  function updateField(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
    setRequestError("");
  }

  async function submit(event) {
    event.preventDefault();
    const nextErrors = {};
    if (!form.name.trim()) nextErrors.name = "El nombre es obligatorio.";
    if (form.amount === "" || !Number.isFinite(Number(form.amount)) || Number(form.amount) <= 0) nextErrors.amount = "El importe debe ser mayor que cero.";
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }
    setIsSaving(true);
    setErrors({});
    setRequestError("");
    try {
      const result = await apiRequest(editingId ? `/business-costs/${editingId}` : "/business-costs", {
        method: editingId ? "PUT" : "POST",
        body: { ...form, amount: Number(form.amount) },
        csrf: true
      });
      setCosts((current) => editingId ? current.map((cost) => cost.id === editingId ? result.cost : cost) : [...current, result.cost]);
      setIsFormOpen(false);
      setNotice(editingId ? "Costo actualizado correctamente." : "Costo creado correctamente.");
    } catch (error) {
      if (error.code === "VALIDATION_ERROR") setErrors(fieldsByName(error.fields));
      setRequestError(error.message || "No fue posible guardar el costo.");
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleCost(cost) {
    setRequestError("");
    try {
      const result = await apiRequest(`/business-costs/${cost.id}/status`, { method: "PATCH", body: { isActive: !cost.isActive }, csrf: true });
      setCosts((current) => current.map((item) => item.id === cost.id ? result.cost : item));
      setNotice(result.cost.isActive ? "Costo activado." : "Costo desactivado.");
    } catch (error) {
      setRequestError(error.message || "No fue posible cambiar el estado del costo.");
    }
  }

  if (isLoading) return <section className="dashboard-state"><Spinner label="Cargando costos" /></section>;
  if (requestError && costs.length === 0 && !isFormOpen) return <Alert><div className="dashboard-error"><span>{requestError}</span><Button variant="secondary" onClick={loadCosts}>Reintentar</Button></div></Alert>;

  return <section className="business-costs-page">
    <PageHeader title="Costos" description="Administra los costos del negocio para mantener tu información financiera actualizada." actions={canManage && <Button onClick={openNew}><Plus aria-hidden="true" />Nuevo costo</Button>} />
    {requestError && <Alert>{requestError}</Alert>}
    {notice && <div className="business-costs-notice" role="status"><Check aria-hidden="true" />{notice}</div>}
    <p className="business-costs-help">El costo de adquisición de un producto es lo que pagaste por cada unidad. <InfoTip title="Costo de adquisición de producto" content="Se guarda en el producto y ayuda a estimar el margen y el punto de equilibrio." /></p>
    {isFormOpen && canManage && <Card className="business-cost-form"><div className="section-heading"><div><p className="eyebrow">{editingId ? "Editar costo" : "Nuevo costo"}</p><h2>{editingId ? "Actualiza los datos del costo" : "Registra un costo del negocio"}</h2></div></div><form className="business-cost-form__fields" onSubmit={submit} noValidate><Input id="business-cost-name" label="Nombre *" value={form.name} onChange={(event) => updateField("name", event.target.value)} maxLength="150" required error={errors.name} /><Input id="business-cost-description" label="Descripción" value={form.description} onChange={(event) => updateField("description", event.target.value)} maxLength="500" error={errors.description} /><Input id="business-cost-amount" label={`Importe * (${currency})`} type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => updateField("amount", event.target.value)} required error={errors.amount} /><Select id="business-cost-type" label={<span>Tipo <InfoTip title="Costo fijo o variable" content="Un costo fijo se mantiene aunque vendas más o menos. Un costo variable cambia con la operación." /></span>} value={form.costType} onChange={(event) => updateField("costType", event.target.value)}><option value="fixed">Fijo</option><option value="variable">Variable</option></Select><Select id="business-cost-frequency" label={<span>Frecuencia <InfoTip title="Frecuencia" content="Mensual se aplica cada mes; anual se prorratea entre 12; único solo se aplica una vez." /></span>} value={form.frequency} onChange={(event) => updateField("frequency", event.target.value)}><option value="monthly">Mensual</option><option value="yearly">Anual</option><option value="one_time">Único</option></Select><div className="business-cost-form__actions"><Button type="button" variant="secondary" onClick={() => setIsFormOpen(false)} disabled={isSaving}>Cancelar</Button><Button type="submit" disabled={isSaving}>{isSaving ? "Guardando…" : editingId ? "Guardar cambios" : "Crear costo"}</Button></div></form></Card>}
    {costs.length === 0 ? <EmptyState title="Sin costos registrados" description="Agrega el primer costo del negocio para comenzar a administrarlo." action={canManage && <Button onClick={openNew}><Plus aria-hidden="true" />Nuevo costo</Button>} /> : <Card className="business-costs-table-card"><div className="business-costs-table-wrap"><table className="business-costs-table"><thead><tr><th>Nombre</th><th>Descripción</th><th>Importe</th><th>Tipo</th><th>Frecuencia</th><th>Estado</th><th>Actualizado</th>{canManage && <th>Acciones</th>}</tr></thead><tbody>{costs.map((cost) => <tr key={cost.id} className={!cost.isActive ? "business-costs-row--inactive" : ""}><th scope="row">{cost.name}</th><td>{cost.description || "—"}</td><td>{money(cost.amount, currency)}</td><td>{typeLabels[cost.costType] ?? cost.costType}</td><td>{frequencyLabels[cost.frequency] ?? cost.frequency}</td><td><span className={`business-cost-status business-cost-status--${cost.isActive ? "active" : "inactive"}`}>{cost.isActive ? "Activo" : "Inactivo"}</span></td><td><time dateTime={cost.updatedAt}>{date(cost.updatedAt)}</time></td>{canManage && <td><div className="business-costs-actions"><Button variant="secondary" onClick={() => openEdit(cost)} disabled={!cost.isActive}><Edit3 aria-hidden="true" />Editar</Button><Button variant={cost.isActive ? "danger" : "secondary"} onClick={() => toggleCost(cost)}><Power aria-hidden="true" />{cost.isActive ? "Desactivar" : "Activar"}</Button></div></td>}</tr>)}</tbody></table></div></Card>}
    {!canManage && <p className="business-costs-readonly"><WalletCards aria-hidden="true" />Tienes acceso de consulta. Solo owner y manager pueden modificar costos.</p>}
  </section>;
}
