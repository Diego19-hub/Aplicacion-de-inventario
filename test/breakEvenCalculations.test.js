import test from "node:test";
import assert from "node:assert/strict";

import { calculateBreakEven } from "../controllers/apiBreakEvenController.js";

test("calcula punto de equilibrio y redondea unidades hacia arriba", () => {
  const result = calculateBreakEven({
    month: "2026-08",
    costs: [{ id: 1, name: "Renta", amount: "10000.00", applied_amount: "10000.00", frequency: "monthly" }],
    sales: { sales_count: 2, units_sold: "150", revenue: "25000.00", variable_costs: "14000.00", missing_cost_lines: 0, missing_cost_sales: 0 }
  });

  assert.equal(result.fixedCosts, 10000);
  assert.equal(result.grossProfit, 11000);
  assert.equal(result.contributionMarginUnit, 73.33);
  assert.equal(result.contributionMarginRate, 0.44);
  assert.equal(result.breakEvenUnits, 137);
  assert.equal(result.breakEvenRevenue, 22727.27);
  assert.equal(result.unitsRemaining, 0);
  assert.equal(result.revenueRemaining, 0);
  assert.deepEqual(result.warnings, []);
});

test("advierte costos faltantes y evita calcular un margen no exacto", () => {
  const result = calculateBreakEven({
    month: "2026-08",
    costs: [],
    sales: { sales_count: 1, units_sold: "2", revenue: "20.00", variable_costs: "0.00", missing_cost_lines: 1, missing_cost_sales: 1 }
  });

  assert.equal(result.calculationComplete, false);
  assert.equal(result.missingCostLines, 1);
  assert.equal(result.missingCostSales, 1);
  assert.equal(result.warnings.length >= 2, true);
});

test("devuelve NULL para el punto de equilibrio sin ventas o con margen no positivo", () => {
  const noSales = calculateBreakEven({
    month: "2026-08",
    costs: [{ id: 1, name: "Renta", amount: "10000", applied_amount: "10000", frequency: "monthly" }],
    sales: { sales_count: 0, units_sold: "0", revenue: "0", variable_costs: "0", missing_cost_lines: 0, missing_cost_sales: 0 }
  });
  const negativeMargin = calculateBreakEven({
    month: "2026-08",
    costs: [{ id: 1, name: "Renta", amount: "10000", applied_amount: "10000", frequency: "monthly" }],
    sales: { sales_count: 1, units_sold: "1", revenue: "10", variable_costs: "12", missing_cost_lines: 0, missing_cost_sales: 0 }
  });

  assert.equal(noSales.breakEvenUnits, null);
  assert.equal(noSales.breakEvenRevenue, null);
  assert.equal(negativeMargin.breakEvenUnits, null);
  assert.equal(negativeMargin.breakEvenRevenue, null);
});
