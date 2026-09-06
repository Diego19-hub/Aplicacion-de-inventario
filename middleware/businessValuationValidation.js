import { body } from "express-validator";

export const businessValuationValidation = [
  body("valuationMethod")
    .isIn(["average", "fifo"])
    .withMessage("El método de valuación debe ser average o fifo.")
];
