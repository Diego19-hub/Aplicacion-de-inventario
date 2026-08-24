import { validationResult } from "express-validator";

import { getBreakEvenCosts, getBreakEvenSales } from "../db/breakEvenQueries.js";

function roundMoney(value) {
  return Number(Number(value).toFixed(2));
}

function monthBounds(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  const nextYear = monthNumber === 12 ? year + 1 : year;
  const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1;
  return {
    start: `${month}-01T00:00:00.000Z`,
    end: `${nextYear}-${String(nextMonth).padStart(2, "0")}-01T00:00:00.000Z`
  };
}

export function calculateBreakEven({ month, costs, sales }) {
  const fixedCosts = roundMoney(costs.reduce((sum, cost) => sum + Number(cost.applied_amount), 0));
  const revenue = roundMoney(sales.revenue);
  const variableCosts = roundMoney(sales.variable_costs);
  const unitsSold = Number(sales.units_sold);
  const salesCount = Number(sales.sales_count);
  const missingCostLines = Number(sales.missing_cost_lines ?? 0);
  const missingCostSales = Number(sales.missing_cost_sales ?? 0);
  const grossProfit = roundMoney(revenue - variableCosts);
  const warnings = [];

  if (missingCostLines > 0) {
    warnings.push(`Hay ${missingCostLines} línea${missingCostLines === 1 ? "" : "s"} de venta sin costo de producto.`);
    warnings.push("La utilidad y el punto de equilibrio están incompletos y no deben interpretarse como exactos.");
  }
  if (salesCount === 0) warnings.push("No hay ventas completadas en el mes seleccionado.");

  const contributionMarginUnit = unitsSold > 0 ? (revenue - variableCosts) / unitsSold : null;
  const contributionMarginRate = revenue > 0 ? (revenue - variableCosts) / revenue : null;
  if (contributionMarginUnit === null || contributionMarginRate === null) {
    warnings.push("No hay datos suficientes para calcular el margen de contribución.");
  } else if (contributionMarginUnit <= 0 || contributionMarginRate <= 0) {
    warnings.push("El margen de contribución es cero o negativo; no se puede calcular el punto de equilibrio.");
  }

  const canCalculateBreakEven = fixedCosts >= 0 && contributionMarginUnit !== null && contributionMarginRate !== null && contributionMarginUnit > 0 && contributionMarginRate > 0;
  const breakEvenUnits = canCalculateBreakEven ? Math.ceil(fixedCosts / contributionMarginUnit) : null;
  const breakEvenRevenue = canCalculateBreakEven ? roundMoney(fixedCosts / contributionMarginRate) : null;

  return {
    period: month,
    fixedCosts,
    revenue,
    unitsSold,
    variableCosts,
    grossProfit,
    contributionMarginUnit: contributionMarginUnit === null ? null : roundMoney(contributionMarginUnit),
    contributionMarginRate: contributionMarginRate === null ? null : roundMoney(contributionMarginRate),
    breakEvenUnits,
    breakEvenRevenue,
    unitsRemaining: breakEvenUnits === null ? null : Math.max(breakEvenUnits - unitsSold, 0),
    revenueRemaining: breakEvenRevenue === null ? null : roundMoney(Math.max(breakEvenRevenue - revenue, 0)),
    salesCount,
    currentSales: salesCount,
    currentRevenue: revenue,
    currentUnits: unitsSold,
    percentageReached: breakEvenRevenue === null || breakEvenRevenue === 0 ? null : roundMoney((revenue / breakEvenRevenue) * 100),
    grossProfitEstimated: grossProfit,
    calculationComplete: missingCostLines === 0,
    missingCostLines,
    missingCostSales,
    fixedCostsUsed: costs.map((cost) => ({
      id: Number(cost.id),
      name: cost.name,
      frequency: cost.frequency,
      amount: Number(cost.amount),
      appliedAmount: roundMoney(cost.applied_amount)
    })),
    variableCostsUsed: { productCosts: variableCosts },
    warnings
  };
}

export async function getBreakEven(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Revisa los parámetros enviados.",
        fields: errors.array().map((error) => ({ field: error.path, message: error.msg }))
      }
    });
  }

  const month = req.query.month;
  const { start, end } = monthBounds(month);

  try {
    const [costs, sales] = await Promise.all([
      getBreakEvenCosts({ businessId: req.business.id, monthStart: start, monthEnd: end }),
      getBreakEvenSales({ businessId: req.business.id, monthStart: start, monthEnd: end })
    ]);
    return res.status(200).json({ data: calculateBreakEven({ month, costs, sales }) });
  } catch (error) {
    return next(error);
  }
}
