import {
  getDashboardLowStockProducts,
  getDashboardMovementTrend,
  getDashboardStockByLocation,
  getDashboardStockByCategory,
  getDashboardSummary,
  getRecentDashboardMovements
} from "../db/dashboardQueries.js";

function number(value) {
  return Number(value);
}

export async function getDashboard(req, res, next) {
  try {
    const [summary, recentMovements, stockByLocation, movementTrend, stockByCategory, lowStockProducts] = await Promise.all([
      getDashboardSummary(req.business.id),
      getRecentDashboardMovements(req.business.id),
      getDashboardStockByLocation(req.business.id),
      getDashboardMovementTrend(req.business.id),
      getDashboardStockByCategory(req.business.id),
      getDashboardLowStockProducts(req.business.id)
    ]);

    return res.status(200).json({
      data: {
        summary: {
          activeProducts: number(summary.active_products),
          totalUnits: number(summary.total_units),
          inventoryValue: number(summary.inventory_value),
          lowStockAlerts: number(summary.low_stock_alerts),
          activeLocations: number(summary.active_locations)
        },
        recentMovements: recentMovements.map((movement) => ({
          id: movement.id,
          createdAt: movement.created_at,
          itemName: movement.item_name,
          sku: movement.sku,
          locationName: movement.location_name,
          locationCode: movement.location_code,
          movementType: movement.movement_type,
          quantityDelta: number(movement.quantity_delta),
          username: movement.username
        })),
        stockByLocation: stockByLocation.map((location) => ({
          id: location.id,
          name: location.name,
          code: location.code,
          totalStock: number(location.total_stock)
        })),
        movementTrend: movementTrend.map((row) => ({ date: String(row.date).slice(0, 10), entries: number(row.entries), exits: number(row.exits), adjustments: number(row.adjustments) })),
        stockByCategory: stockByCategory.map((category) => ({ id: category.id, name: category.name, totalStock: number(category.total_stock) })),
        lowStockProducts: lowStockProducts.map((product) => ({ id: product.id, name: product.name, sku: product.sku, categoryName: product.category_name, totalStock: number(product.total_stock), minimumStock: number(product.minimum_stock), lowStockLocations: number(product.low_stock_locations) }))
      }
    });
  } catch (error) {
    return next(error);
  }
}
