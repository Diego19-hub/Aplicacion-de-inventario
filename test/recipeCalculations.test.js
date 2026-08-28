import test from "node:test";
import assert from "node:assert/strict";
import { calculateRecipeCost, convertQuantity } from "../db/recipeQueries.js";

test("calcula costo de receta, merma y costo unitario", () => {
  const result = calculateRecipeCost({ yield_quantity: 10, waste_percentage: "10", labor_cost: "20", logistics_cost: "10" }, [
    { quantity: 500, unit: "gram", cost_price: "100" },
    { quantity: 1.2, unit: "liter", cost_price: "50" },
    { quantity: 10, unit: "piece", cost_price: "2" }
  ]);
  assert.equal(convertQuantity(500, "gram"), 0.5);
  assert.equal(result.ingredientCost, 75);
  assert.equal(result.wasteCost, 7.5);
  assert.equal(result.productionCost, 112.5);
  assert.equal(result.unitCost, 11.25);
});

test("el costo manual permite marcar una receta estimada", () => {
  const result = calculateRecipeCost({ yield_quantity: 10, waste_percentage: 0, manual_cost: "100", labor_cost: 0, logistics_cost: 0 }, []);
  assert.equal(result.productionCost, 100);
  assert.equal(result.isEstimated, true);
});
