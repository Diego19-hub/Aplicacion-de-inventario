import multer from "multer";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export const productImportUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, callback) => {
    const extension = file.originalname.toLowerCase().endsWith(".xlsx");
    if (extension && file.mimetype === XLSX_MIME) return callback(null, true);
    return callback(Object.assign(new Error("Solo se aceptan archivos .xlsx."), { code: "INVALID_FILE_TYPE" }));
  }
}).single("file");

export function handleProductImportUploadError(error, req, res, next) {
  if (!error) return next();
  if (error.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: { code: "FILE_TOO_LARGE", message: "El archivo no puede superar 5 MB." } });
  if (error.code === "INVALID_FILE_TYPE") return res.status(400).json({ error: { code: "INVALID_FILE_TYPE", message: error.message } });
  return next(error);
}
