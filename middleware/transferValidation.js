import { body } from "express-validator";
export const transferValidation=[body('itemId').isInt({min:1}).toInt().withMessage('Selecciona un producto válido.'),body('fromLocationId').isInt({min:1}).toInt().withMessage('Selecciona el origen.'),body('toLocationId').isInt({min:1}).toInt().custom((v,{req})=>{if(v===req.body.fromLocationId)throw new Error('Origen y destino deben ser distintos.');return true;}),body('quantity').isInt({min:1,max:1000000}).toInt().withMessage('La cantidad debe ser positiva.'),body('reason').trim().isLength({min:5,max:500}).withMessage('El motivo debe tener entre 5 y 500 caracteres.'),body('reference').trim().customSanitizer(v=>v||null).optional({values:'null'}).isLength({min:1,max:120}).withMessage('La referencia debe tener hasta 120 caracteres.')];

const protectedFields = [
  "businessId",
  "createdBy",
  "transferId",
  "previousStock",
  "resultingStock",
  "quantityDelta",
  "fromStock",
  "toStock"
];

export const apiTransferValidation = [
  body("productId")
    .isInt({ min: 1 })
    .toInt()
    .withMessage("Selecciona un producto válido."),
  body("fromLocationId")
    .isInt({ min: 1 })
    .toInt()
    .withMessage("Selecciona una ubicación de origen válida."),
  body("toLocationId")
    .isInt({ min: 1 })
    .toInt()
    .custom((value, { req }) => {
      if (value === req.body.fromLocationId) {
        throw new Error("Origen y destino deben ser distintos.");
      }
      return true;
    }),
  body("quantity")
    .isInt({ min: 1, max: 1000000 })
    .toInt()
    .withMessage("La cantidad debe ser un entero positivo."),
  body("reason")
    .trim()
    .isLength({ min: 5, max: 500 })
    .withMessage("El motivo debe tener entre 5 y 500 caracteres."),
  body("reference")
    .optional({ values: "undefined" })
    .trim()
    .customSanitizer((value) => value || null)
    .optional({ values: "null" })
    .isLength({ min: 1, max: 120 })
    .withMessage("La referencia debe tener entre 1 y 120 caracteres."),
  ...protectedFields.map((field) => body(field)
    .not()
    .exists()
    .withMessage(`El campo ${field} no se puede modificar.`))
];
