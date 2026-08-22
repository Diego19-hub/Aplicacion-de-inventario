import {
  getApiProductBalances,
  getApiProductById,
  getApiProductRecentMovements
} from "../db/apiProductQueries.js";

function alertStatus(stock, minimumStock) {
  if (minimumStock === null) return "not_configured";
  if (stock === 0) return "out_of_stock";
  if (stock <= Number(minimumStock)) return "low_stock";
  return "ok";
}

export async function getProductDetails(req, res, next) {
  const productId = /^[1-9]\d*$/.test(req.params.productId)
    ? Number(req.params.productId)
    : null;

  if (!productId || !Number.isSafeInteger(productId)) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Revisa los campos enviados.",
        fields: [{ field: "productId", message: "El producto debe ser un entero positivo." }]
      }
    });
  }

  try {
    const product = await getApiProductById(req.business.id, productId);

    if (!product) {
      return res.status(404).json({
        error: {
          code: "PRODUCT_NOT_FOUND",
          message: "No se encontró el producto solicitado."
        }
      });
    }

    const [balances, recentMovements] = await Promise.all([
      getApiProductBalances(req.business.id, productId),
      getApiProductRecentMovements(req.business.id, productId)
    ]);

    return res.status(200).json({
      data: {
        product: {
          id: product.id,
          name: product.name,
          sku: product.sku,
          barcode: product.barcode,
          description: product.description,
          brand: product.brand,
          price: Number(product.price),
          stock: Number(product.stock),
          createdAt: product.created_at,
          category: { id: product.category_id, name: product.category_name }
        },
        balances: balances.map((balance) => ({
          location: {
            id: balance.location_id,
            name: balance.location_name,
            code: balance.location_code,
            status: balance.location_status,
            isDefault: balance.is_default
          },
          stock: Number(balance.stock),
          minimumStock: balance.minimum_stock === null ? null : Number(balance.minimum_stock),
          alertStatus: alertStatus(Number(balance.stock), balance.minimum_stock)
        })),
        recentMovements: recentMovements.map((movement) => ({
          id: movement.id,
          createdAt: movement.created_at,
          type: movement.movement_type,
          quantityDelta: Number(movement.quantity_delta),
          previousStock: Number(movement.previous_stock),
          resultingStock: Number(movement.resulting_stock),
          reason: movement.reason,
          reference: movement.reference,
          location: { id: movement.location_id, name: movement.location_name, code: movement.location_code },
          createdBy: { id: movement.created_by_id, username: movement.username },
          transferId: movement.transfer_id === null ? null : Number(movement.transfer_id)
        }))
      }
    });
  } catch (error) {
    return next(error);
  }
}
