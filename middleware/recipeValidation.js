import { body } from "express-validator";

const units = ["piece", "kilogram", "gram", "liter", "milliliter", "package", "box"];
const positive = (value) => Number.isFinite(Number(value)) && Number(value) > 0;

const recipeFields = [
  body("name").isString().trim().isLength({ min: 1, max: 150 }).withMessage("El nombre de la receta es obligatorio."),
  body("productId").isInt({ min: 1 }).toInt().withMessage("Selecciona un producto final válido."),
  body("yieldQuantity").custom(positive).toFloat().withMessage("El rendimiento debe ser mayor que cero."),
  body("yieldUnit").isIn(units).withMessage("La unidad de rendimiento no es válida."),
  body("instructions").optional({ values: "undefined" }).isString().trim().isLength({ max: 3000 }).withMessage("Las instrucciones son demasiado largas."),
  body("wastePercentage").optional({ values: "undefined" }).custom((value) => Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100).toFloat().withMessage("La merma debe estar entre 0 y 100."),
  body("manualCost").optional({ values: "undefined" }).custom((value) => value === null || value === "" || positive(value)).toFloat().withMessage("El costo manual debe ser mayor que cero."),
  body("manualCostNotes").optional({ values: "undefined" }).isString().trim().isLength({ max: 1000 }).withMessage("Las notas del costo son demasiado largas."),
  body("laborCost").optional({ values: "undefined" }).custom((value) => Number.isFinite(Number(value)) && Number(value) >= 0).toFloat().withMessage("La mano de obra no puede ser negativa."),
  body("logisticsCost").optional({ values: "undefined" }).custom((value) => Number.isFinite(Number(value)) && Number(value) >= 0).toFloat().withMessage("La logística no puede ser negativa."),
  body("ingredients").isArray({ min: 1, max: 200 }).withMessage("Agrega al menos un ingrediente."),
  body("ingredients.*.itemId").isInt({ min: 1 }).toInt().withMessage("El ingrediente no es válido."),
  body("ingredients.*.quantity").custom(positive).toFloat().withMessage("La cantidad debe ser mayor que cero."),
  body("ingredients.*.unit").isIn(units).withMessage("La unidad del ingrediente no es válida.")
];

export const recipeValidation = recipeFields;
export const recipeStatusValidation = [body("status").isIn(["active", "inactive"]).withMessage("El estado no es válido.")];
export const recipeProductionValidation = [body("locationId").isInt({ min: 1 }).toInt().withMessage("Selecciona una ubicación válida."), body("quantity").custom(positive).toFloat().withMessage("La cantidad de lotes debe ser mayor que cero.")];
