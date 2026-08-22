import { ArrowLeft, CheckCircle2, Download, FileSpreadsheet, Upload } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { apiRequest } from "../api/client.js";
import { Alert } from "../components/Alert.jsx";
import { Button } from "../components/Button.jsx";
import { Card } from "../components/Card.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { useAuth } from "../context/AuthContext.jsx";

function money(value) { return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(value); }

export function ProductImportPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [result, setResult] = useState(null);

  async function validateFile(event) {
    event.preventDefault();
    if (!file) return setError("Selecciona un archivo .xlsx.");
    setIsLoading(true); setError(""); setPreview(null); setResult(null);
    const formData = new FormData(); formData.append("file", file);
    try { setPreview(await apiRequest("/products/import/preview", { method: "POST", body: formData, csrf: true })); }
    catch (requestError) { setError(requestError.message || "No fue posible validar el archivo."); }
    finally { setIsLoading(false); }
  }

  async function confirmImport() {
    if (!preview?.valid || preview.products.length === 0) return;
    setIsConfirming(true); setError("");
    try { setResult(await apiRequest("/products/import/confirm", { method: "POST", body: { products: preview.products }, csrf: true })); }
    catch (requestError) { setError(requestError.message || "No fue posible confirmar la importación."); }
    finally { setIsConfirming(false); }
  }

  if (!session.permissions.canManageInventory) return <EmptyState title="Acceso restringido" description="No tienes permiso para importar productos en este negocio." action={<Link className="button button--secondary" to="/app/products">Volver a productos</Link>} />;
  if (result) return <><PageHeader title="Importación completada" description="Los productos fueron agregados al negocio activo." /><Card className="import-success"><CheckCircle2 aria-hidden="true" /><h2>{result.imported} productos importados</h2><p>Se crearon los productos, balances y movimientos iniciales.</p><Link className="button button--primary" to="/app/products">Regresar a Productos</Link></Card></>;

  return <>
    <Link to="/app/products" className="back-link"><ArrowLeft aria-hidden="true" />Volver a productos</Link>
    <PageHeader title="Importar productos" description="Carga la plantilla oficial de Excel y revisa los datos antes de confirmarlos." />
    {error && <Alert>{error}</Alert>}
    <Card className="import-guide"><div className="import-guide__heading"><div><p className="eyebrow">Antes de importar</p><h2>¿Cómo debe estar preparado tu Excel?</h2></div><a className="button button--secondary" href="/api/products/import/template" download="plantilla_importacion_productos.xlsx"><Download aria-hidden="true" />Descargar plantilla oficial</a></div><ul><li>Usa únicamente archivos .xlsx.</li><li>Conserva los encabezados de la plantilla.</li><li>Las columnas obligatorias son: <code>nombre_producto</code>, <code>sku</code>, <code>precio</code> y <code>existencias</code>.</li><li>El SKU debe ser único y debe tratarse como texto.</li><li>Escribe el código de barras como texto para conservar ceros iniciales.</li><li>El precio debe ser un número positivo o cero. Se aceptan: <code>1299.90</code>, <code>1,299.90</code> y <code>$1,299.90</code>.</li><li>Las existencias y existencias_minimas deben ser números enteros.</li><li>No uses fórmulas en las celdas.</li><li>No dejes vacías las columnas obligatorias.</li><li>Elimina las filas de ejemplo antes de importar, si no las necesitas.</li><li>No agregues <code>business_id</code>, <code>user_id</code> ni <code>status</code>.</li></ul></Card>
    <Card className="import-card"><form onSubmit={validateFile}><label className="import-file-field" htmlFor="product-import-file"><FileSpreadsheet aria-hidden="true" /><span><strong>Selecciona tu archivo .xlsx</strong><small>{file?.name ?? "Tamaño máximo: 5 MB"}</small></span><input id="product-import-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label><div className="import-file-note">Recomendado: descarga y utiliza la plantilla oficial para evitar errores.</div><Button type="submit" disabled={isLoading}>{isLoading ? "Validando…" : <><Upload aria-hidden="true" />Validar archivo</>}</Button></form></Card>
    {preview && <><section className="import-summary" aria-label="Resumen de importación"><Card><span>Filas leídas</span><strong>{preview.totalRows}</strong></Card><Card><span>Filas válidas</span><strong>{preview.validRows}</strong></Card><Card><span>Filas con errores</span><strong>{preview.invalidRows}</strong></Card></section><Card className="import-preview-card"><header className="section-heading"><div><p className="eyebrow">Vista previa</p><h2>Productos a importar</h2></div><Button disabled={!preview.valid || isConfirming} onClick={confirmImport}>{isConfirming ? "Importando…" : "Confirmar importación"}</Button></header>{preview.errors.length > 0 && <div className="import-errors"><strong>Corrige estos errores para continuar:</strong><ul>{preview.errors.map((item, index) => <li key={`${item.row}-${item.field}-${index}`}>Fila {item.row}, {item.field}: {item.message}</li>)}</ul></div>}{preview.products.length === 0 ? <EmptyState title="No hay filas válidas" description="Corrige el archivo y vuelve a validarlo." /> : <div className="import-table-wrap"><table className="import-table"><thead><tr><th>Producto</th><th>SKU</th><th>Código de barras</th><th>Precio</th><th>Existencias</th><th>Categoría</th><th>Ubicación</th></tr></thead><tbody>{preview.products.map((product) => <tr key={product.sku}><td>{product.name}</td><td>{product.sku}</td><td>{product.barcode || "—"}</td><td>{money(product.price)}</td><td>{product.stock}</td><td>{product.category || "Predeterminada"}</td><td>{product.location || "Principal"}</td></tr>)}</tbody></table></div>}</Card></>}
  </>;
}
