import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { apiRequest } from "../api/client.js";
import { Alert } from "../components/Alert.jsx";
import { Button } from "../components/Button.jsx";
import { Card } from "../components/Card.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { Input } from "../components/Input.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { Select } from "../components/Select.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { useAuth } from "../context/AuthContext.jsx";

export function NewCustomerChargePage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState({ customerId: "", concept: "", amount: "", frequency: "monthly", dueDate: new Date().toISOString().slice(0, 10), notes: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    apiRequest("/customers").then((result) => setCustomers(result.customers ?? [])).catch((requestError) => setError(requestError.message || "No fue posible cargar los clientes.")).finally(() => setLoading(false));
  }, []);

  if (!session.permissions.canManageCustomerCharges) return <EmptyState title="Acceso restringido" description="Solo owner y manager pueden crear cargos." action={<Link className="button button--secondary" to="/app/collections">Volver a cobranza</Link>} />;
  if (loading) return <section className="dashboard-state"><Spinner label="Cargando clientes" /></section>;

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (!form.customerId) return setError("Selecciona un cliente.");
    if (!Number.isFinite(Number(form.amount)) || Number(form.amount) <= 0) return setError("El monto debe ser mayor que cero.");
    setSaving(true);
    try {
      await apiRequest("/customer-charges", { method: "POST", body: { ...form, customerId: Number(form.customerId), amount: Number(form.amount) }, csrf: true });
      setSuccess("Cargo creado correctamente. Actualizando cobranza…");
      window.setTimeout(() => navigate("/app/collections"), 500);
    } catch (requestError) {
      setError(requestError.message || "No fue posible crear el cargo.");
      setSaving(false);
    }
  }

  return <div className="collections-page"><PageHeader title="Nuevo cargo" description="Registra un cargo pendiente para un cliente." /><Card><form className="product-form" onSubmit={submit}>{error && <Alert><p>{error}</p></Alert>}{success && <Alert variant="success"><p>{success}</p></Alert>}<Select id="charge-customer" label="Cliente" value={form.customerId} onChange={(event) => setForm({ ...form, customerId: event.target.value })} required><option value="">Selecciona un cliente</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</Select><Input id="charge-concept" label="Concepto" value={form.concept} onChange={(event) => setForm({ ...form, concept: event.target.value })} required /><Input id="charge-amount" label="Monto" type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} required /><Select id="charge-frequency" label="Frecuencia" value={form.frequency} onChange={(event) => setForm({ ...form, frequency: event.target.value })}><option value="weekly">Semanal</option><option value="biweekly">Quincenal</option><option value="monthly">Mensual</option><option value="one_time">Único</option></Select><Input id="charge-due-date" label="Fecha de vencimiento" type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} required /><Input id="charge-notes" label="Notas (opcional)" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /><div className="product-form__actions"><Link className="button button--secondary" to="/app/collections">Cancelar</Link><Button type="submit" disabled={saving}>{saving ? "Guardando…" : "Guardar cargo"}</Button></div></form></Card></div>;
}
