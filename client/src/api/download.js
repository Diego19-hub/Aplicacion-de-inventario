export async function downloadCsv(path, fallbackName) {
  const response = await fetch(`/api${path}`, { credentials: "same-origin" });
  if (!response.ok) {
    let message = "No fue posible descargar el archivo.";
    try { message = (await response.json()).error?.message || message; } catch {}
    throw new Error(message);
  }
  const disposition = response.headers.get("content-disposition") || "";
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  const name = match && !match[1].includes("/") && !match[1].includes("\\") ? match[1] : fallbackName;
  const url = URL.createObjectURL(await response.blob()); const link = document.createElement("a"); link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
}
