import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiRequest } from "../api/client.js";
import { Alert } from "../components/Alert.jsx";
import { Button } from "../components/Button.jsx";
import { Card } from "../components/Card.jsx";
import { Input } from "../components/Input.jsx";
import { PageHeader } from "../components/PageHeader.jsx";

export function NewCustomerPage() { const navigate=useNavigate(); const [form,setForm]=useState({name:"",phone:"",email:"",address:"",notes:""}); const [error,setError]=useState(""); const [saving,setSaving]=useState(false); async function submit(e){e.preventDefault();setSaving(true);setError("");try{await apiRequest("/customers",{method:"POST",body:form,csrf:true});navigate("/app/collections/customers");}catch(x){setError(x.message||"No fue posible crear el cliente.");}finally{setSaving(false);}} return <div className="collections-page"><PageHeader title="Nuevo cliente"/><Card><form className="product-form" onSubmit={submit}>{error&&<Alert><p>{error}</p></Alert>}<Input id="customer-name" label="Nombre *" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required/><Input id="customer-phone" label="Teléfono" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/><Input id="customer-email" label="Correo" type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/><Input id="customer-address" label="Dirección" value={form.address} onChange={e=>setForm({...form,address:e.target.value})}/><Input id="customer-notes" label="Notas" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/><div className="product-form__actions"><Link className="button button--secondary" to="/app/collections/customers">Cancelar</Link><Button type="submit" disabled={saving}>{saving?"Guardando…":"Guardar cliente"}</Button></div></form></Card></div>; }
