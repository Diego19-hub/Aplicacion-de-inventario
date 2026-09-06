export function normalizeSearch(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}
//Esta función sirve para normalizar o estandarizar un texto de búsqueda, limpiándolo por completo para facilitar que tu buscador encuentre coincidencias exactas sin importar cómo lo haya escrito el usuario.