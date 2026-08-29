import { Info } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "./Button.jsx";
import { Card } from "./Card.jsx";

const content = {
  dashboard: "Revisa ventas, utilidad estimada, inventario, cobranza, gastos y alertas. Usa el selector de periodo para comparar resultados; la utilidad puede ser parcial si faltan costos históricos.",
  breakEven: "El punto de equilibrio estima cuánto necesitas vender para cubrir costos. Los fijos no cambian con las ventas y los variables sí. El resultado depende de los datos registrados.",
  costs: "Registra mano de obra, logística y otros gastos. Define si son fijos o variables y su periodicidad semanal, mensual, anual o única. Solo se incluyen gastos activos y vigentes.",
  recipes: "Una receta relaciona un producto final con ingredientes. Las cantidades deben corresponder al rendimiento y tener costos registrados. El lote suma ingredientes, merma, mano de obra y logística; producir descuenta ingredientes del inventario.",
  collections: "Registra clientes, cargos y pagos para consultar saldos y estados de cuenta. Los pagos próximos o vencidos se identifican por fecha; un pago registrado reduce el saldo y permite imprimir su ticket.",
  purchases: "El flujo es orden de compra → recepción parcial o total → aumento de inventario → transacción. La cantidad recibida nunca puede superar la solicitada ni duplicarse.",
  alerts: "Agotado y stock bajo requieren atención; stock excedente invita a revisar el máximo. Los mínimos y máximos se configuran por producto y ubicación. Rojo es urgente, amarillo es revisión y verde es correcto.",
  transactions: "Es el historial unificado de entradas, salidas, ajustes, transferencias, ventas y producción. Los filtros y referencias automáticas facilitan rastrear cada operación.",
  reports: "Inventario actual muestra existencias y valor; movimientos muestra el historial; sin movimiento y stock bajo ayudan a decidir. Filtra por fechas, producto, categoría, ubicación o usuario y exporta CSV, Excel o impresión.",
  inventory: "Consulta existencias por producto y ubicación. Usa los filtros para revisar categorías, mínimos y necesidades de reabastecimiento."
};

function keyFor(moduleKey, businessId) { return `help_info_${moduleKey}_${businessId || "global"}`; }

export function HelpInfoPanel({ moduleKey, businessId }) { const key=keyFor(moduleKey,businessId); const [hidden,setHidden]=useState(()=>localStorage.getItem(key)==="hidden"); const [expanded,setExpanded]=useState(true); useEffect(()=>{const reset=()=>{localStorage.removeItem(key);setHidden(false);setExpanded(true)};window.addEventListener("help-info:reset",reset);return()=>window.removeEventListener("help-info:reset",reset)},[key]); if(hidden)return <div className="help-info-panel__restore"><Button type="button" variant="secondary" onClick={()=>{localStorage.removeItem(key);setHidden(false);setExpanded(true)}}>Mostrar explicación</Button></div>; return <Card className="help-info-panel"><header className="help-info-panel__header"><div className="help-info-panel__title"><Info aria-hidden="true"/><h2>¿Cómo funciona?</h2></div><Button type="button" variant="secondary" aria-expanded={expanded} aria-controls={`help-${moduleKey}`} onClick={()=>setExpanded(value=>!value)}>{expanded?"Ocultar explicación":"Mostrar explicación"}</Button></header>{expanded&&<div id={`help-${moduleKey}`} className="help-info-panel__content"><p>{content[moduleKey]||"Consulta esta sección para conocer sus funciones principales."}</p><button type="button" className="help-info-panel__never" onClick={()=>{localStorage.setItem(key,"hidden");setHidden(true)}}>No volver a mostrar</button></div>}</Card>; }
export function resetHelpInfoPanels() { Object.keys(localStorage).filter((key)=>key.startsWith("help_info_")).forEach((key)=>localStorage.removeItem(key)); window.dispatchEvent(new Event("help-info:reset")); }
