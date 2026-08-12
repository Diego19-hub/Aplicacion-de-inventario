import {
  getDashboardStockByLocation,
  getDashboardSummary,
  getRecentDashboardMovements
} from "../db/dashboardQueries.js";

function number(value) {
  return Number(value);
}

export async function getDashboard(req, res, next) {
  try {
    const [summary, recentMovements, stockByLocation] = await Promise.all([
      getDashboardSummary(req.business.id),
      getRecentDashboardMovements(req.business.id),
      getDashboardStockByLocation(req.business.id)
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
        }))
      }
    });
  } catch (error) {
    return next(error);
  }
}
