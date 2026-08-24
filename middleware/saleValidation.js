import { body } from "express-validator";

const MAX_QUANTITY = 1000000;

export const apiSaleValidation = [
  body("locationId")
    .isInt({ min: 1 })
    .withMessage("Selecciona una ubicación válida.")
    .toInt(),
  body("paymentMethod")
    .isIn(["cash", "card", "transfer"])
    .withMessage("Selecciona un método de pago válido."),
  body("amountReceived")
    .optional({ values: "undefined" })
    .custom((value) => {
      if (value === "" || value === null || value === undefined) return true;
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed >= 0 && parsed <= 999999999999.99;
    })
    .withMessage("El monto recibido debe ser un número no negativo válido."),
  body("items")
    .isArray({ min: 1, max: 100 })
    .withMessage("Agrega al menos un producto a la venta."),
  body("items.*.itemId")
    .isInt({ min: 1 })
    .withMessage("Selecciona un producto válido.")
    .toInt(),
  body("items.*.quantity")
    .isInt({ min: 1, max: MAX_QUANTITY })
    .withMessage("La cantidad debe ser un entero positivo.")
    .toInt()
];
