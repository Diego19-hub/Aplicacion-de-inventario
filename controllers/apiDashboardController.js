import {
  getDashboardLowStockProducts,
  getDashboardMovementTrend,
  getDashboardStockByLocation,
  getDashboardStockByCategory,
  getDashboardSummary,
  getRecentDashboardMovements
} from "../db/dashboardQueries.js";

function number(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

const allowedPeriods = new Set(["1m", "3m", "6m", "12m"]);
const periodLabels = new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short" });

function formatTrendDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : periodLabels.format(date);
}

export async function getDashboard(req, res, next) {
  try {
    const period = allowedPeriods.has(req.query.period) ? req.query.period : "1m";
    const [summary, recentMovements, stockByLocation, movementTrend, stockByCategory, lowStockProducts] = await Promise.all([
      getDashboardSummary(req.business.id),
      getRecentDashboardMovements(req.business.id),
      getDashboardStockByLocation(req.business.id),
      getDashboardMovementTrend(req.business.id, period),
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
        period,
        movementTrend: movementTrend.map((row) => {
          const entries = number(row.entries);
          const exits = number(row.exits);
          const adjustments = number(row.adjustments);
          return { date: String(row.date).slice(0, 10), label: formatTrendDate(row.date), entries, exits, adjustments, transfersIn: number(row.transfers_in), transfersOut: number(row.transfers_out), totalMovements: entries + exits + Math.abs(adjustments), netChange: entries - exits + adjustments };
        }),
        totals: movementTrend.reduce((totals, row) => {
          const entries = number(row.entries);
          const exits = number(row.exits);
          const adjustments = number(row.adjustments);
          return { entries: totals.entries + entries, exits: totals.exits + exits, adjustments: totals.adjustments + adjustments, transfersIn: totals.transfersIn + number(row.transfers_in), transfersOut: totals.transfersOut + number(row.transfers_out), netChange: totals.netChange + entries - exits + adjustments };
        }, { entries: 0, exits: 0, adjustments: 0, transfersIn: 0, transfersOut: 0, netChange: 0 }),
        stockByCategory: stockByCategory.map((category) => ({ id: category.id, name: category.name, totalStock: number(category.total_stock) })),
        lowStockProducts: lowStockProducts.map((product) => ({ id: product.id, name: product.name, sku: product.sku, categoryName: product.category_name, totalStock: number(product.total_stock), minimumStock: number(product.minimum_stock), lowStockLocations: number(product.low_stock_locations) }))
      }
    });
  } catch (error) {
    return next(error);
  }
}
