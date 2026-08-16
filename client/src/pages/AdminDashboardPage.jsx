import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../api/client.js";
import { Alert } from "../components/Alert.jsx";
import { Card } from "../components/Card.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
export function AdminDashboardPage(){const[d,setD]=useState(null),[e,setE]=useState(null);useEffect(()=>{apiRequest("/admin/dashboard").then(setD).catch(setE)},[]);if(e)return <Alert>{e.message}</Alert>;if(!d)return <p>Cargando administración…</p>;return <><PageHeader title="Administración" description="Resumen global de la plataforma." actions={<Link className="button button--primary" to="/app/admin/businesses">Ver negocios</Link>}/><section className="metric-grid">{Object.entries(d.metrics).map(([k,v])=><Card key={k} className="metric-card"><p>{k.replaceAll("_"," ")}</p><strong>{v}</strong></Card>)}</section><section className="category-api-grid">{d.recent.map(b=><Card key={b.id}><Link className="text-link" to={`/app/admin/businesses/${b.id}`}>{b.name}</Link><p>{b.slug} · {b.status}</p></Card>)}</section></>}
