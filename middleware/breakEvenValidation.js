import { query } from "express-validator";

export const breakEvenValidation = [
  query("month")
    .custom((value) => {
      if (typeof value !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
        throw new Error("El mes debe tener formato YYYY-MM.");
      }
      return true;
    })
    .withMessage("El mes debe tener formato YYYY-MM.")
];
