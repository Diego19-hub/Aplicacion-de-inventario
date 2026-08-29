import pool from "./pool.js";
import { auditService } from "../services/auditService.js";
import { notificationService } from "../services/notificationService.js";

export const RECIPE_UNITS = ["piece", "kilogram", "gram", "liter", "milliliter", "package", "box"];

function factor(unit) {
  return { piece: 1, kilogram: 1, gram: 0.001, liter: 1, milliliter: 0.001, package: 1, box: 1 }[unit];
}

export function convertQuantity(quantity, unit) {
  return Number(quantity) * factor(unit);
}

export function calculateRecipeCost(recipe, ingredients) {
  const ingredientCost = recipe.manual_cost !== null && recipe.manual_cost !== undefined
    ? Number(recipe.manual_cost)
    : ingredients.reduce((sum, ingredient) => sum + Number(ingredient.cost_price ?? 0) * convertQuantity(ingredient.quantity, ingredient.unit), 0);
  const wasteCost = ingredientCost * Number(recipe.waste_percentage || 0) / 100;
  const productionCost = ingredientCost + wasteCost + Number(recipe.labor_cost || 0) + Number(recipe.logistics_cost || 0);
  return { ingredientCost, wasteCost, productionCost, unitCost: productionCost / Number(recipe.yield_quantity), isEstimated: Boolean(recipe.manual_cost !== null && recipe.manual_cost !== undefined || recipe.is_estimated) };
}

export async function listRecipes(businessId) {
  const result = await pool.query(`
    SELECT r.id, r.name, r.product_id, i.name AS product_name, i.sku, r.yield_quantity, r.yield_unit,
           r.waste_percentage, r.manual_cost, r.is_estimated, r.labor_cost, r.logistics_cost, r.status, r.updated_at,
           COUNT(ri.id)::INTEGER AS ingredient_count
    FROM recipes r
    INNER JOIN items i ON (i.business_id, i.id) = (r.business_id, r.product_id)
    LEFT JOIN recipe_ingredients ri ON (ri.business_id, ri.recipe_id) = (r.business_id, r.id)
    WHERE r.business_id = $1
    GROUP BY r.id, i.name, i.sku
    ORDER BY r.status DESC, LOWER(r.name), r.id`, [businessId]);
  return result.rows;
}

export async function getRecipe(businessId, recipeId) {
  const recipeResult = await pool.query(`SELECT r.*, i.name AS product_name, i.sku, i.price AS product_price FROM recipes r INNER JOIN items i ON (i.business_id, i.id)=(r.business_id,r.product_id) WHERE r.business_id=$1 AND r.id=$2`, [businessId, recipeId]);
  if (!recipeResult.rows[0]) return null;
  const ingredients = await pool.query(`SELECT ri.*, i.name AS item_name, i.sku, i.cost_price FROM recipe_ingredients ri INNER JOIN items i ON (i.business_id,i.id)=(ri.business_id,ri.item_id) WHERE ri.business_id=$1 AND ri.recipe_id=$2 ORDER BY ri.id`, [businessId, recipeId]);
  return { recipe: recipeResult.rows[0], ingredients: ingredients.rows, cost: calculateRecipeCost(recipeResult.rows[0], ingredients.rows) };
}

export async function getRecipeProducts(businessId) {
  const result = await pool.query(`SELECT id, name, sku, cost_price, stock FROM items WHERE business_id=$1 AND status='active' ORDER BY LOWER(name), id`, [businessId]);
  return result.rows;
}

export async function getRecipeLocations(businessId) {
  const result = await pool.query("SELECT id, name, code, is_default FROM business_locations WHERE business_id=$1 AND status='active' ORDER BY is_default DESC, LOWER(name), id", [businessId]);
  return result.rows;
}

async function verifyRecipeItems(client, businessId, productId, ingredients) {
  const ids = [...new Set(ingredients.map((item) => Number(item.itemId)))];
  if (!ids.length || ids.includes(Number(productId))) throw new Error("Una receta no puede utilizarse a sí misma como ingrediente.");
  const result = await client.query("SELECT id FROM items WHERE business_id=$1 AND status='active' AND id=ANY($2::INTEGER[])", [businessId, ids]);
  if (result.rows.length !== ids.length) throw new Error("Todos los ingredientes deben pertenecer al negocio y estar activos.");
  const cycle = await client.query(`WITH RECURSIVE used(item_id) AS (
    SELECT unnest($3::INTEGER[])
    UNION
    SELECT ri.item_id FROM used u
    INNER JOIN recipes r ON r.business_id=$1 AND r.product_id=u.item_id AND r.status='active'
    INNER JOIN recipe_ingredients ri ON (ri.business_id,ri.recipe_id)=(r.business_id,r.id)
  ) SELECT EXISTS (SELECT 1 FROM used WHERE item_id=$2) AS found`, [businessId, productId, ids]);
  if (cycle.rows[0].found) throw new Error("La receta crearía una dependencia circular.");
}

export async function createRecipe({ businessId, userId, data }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await verifyRecipeItems(client, businessId, data.productId, data.ingredients);
    const recipe = (await client.query(`INSERT INTO recipes (business_id,name,product_id,yield_quantity,yield_unit,instructions,waste_percentage,manual_cost,manual_cost_notes,is_estimated,labor_cost,logistics_cost,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`, [businessId, data.name, data.productId, data.yieldQuantity, data.yieldUnit, data.instructions || null, data.wastePercentage, data.manualCost || null, data.manualCostNotes || null, Boolean(data.isEstimated), data.laborCost || 0, data.logisticsCost || 0, userId])).rows[0];
    for (const ingredient of data.ingredients) await client.query("INSERT INTO recipe_ingredients (business_id,recipe_id,item_id,quantity,unit) VALUES ($1,$2,$3,$4,$5)", [businessId, recipe.id, ingredient.itemId, ingredient.quantity, ingredient.unit]);
    await auditService.record({ client, businessId, userId, module: "recipes", action: "create", reference: `RECIPE-${recipe.id}`, description: "Receta creada", newValues: { recipeId: recipe.id, data } });
    await client.query("COMMIT");
    return getRecipe(businessId, recipe.id);
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; } finally { client.release(); }
}

export async function updateRecipe({ businessId, userId, recipeId, data }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = (await client.query("SELECT product_id FROM recipes WHERE business_id=$1 AND id=$2 AND status='active' FOR UPDATE", [businessId, recipeId])).rows[0];
    if (!current) return null;
    await verifyRecipeItems(client, businessId, data.productId, data.ingredients);
    await client.query(`UPDATE recipes SET name=$1, product_id=$2, yield_quantity=$3, yield_unit=$4, instructions=$5, waste_percentage=$6, manual_cost=$7, manual_cost_notes=$8, is_estimated=$9, labor_cost=$10, logistics_cost=$11 WHERE business_id=$12 AND id=$13`, [data.name, data.productId, data.yieldQuantity, data.yieldUnit, data.instructions || null, data.wastePercentage, data.manualCost || null, data.manualCostNotes || null, Boolean(data.isEstimated), data.laborCost || 0, data.logisticsCost || 0, businessId, recipeId]);
    await client.query("DELETE FROM recipe_ingredients WHERE business_id=$1 AND recipe_id=$2", [businessId, recipeId]);
    for (const ingredient of data.ingredients) await client.query("INSERT INTO recipe_ingredients (business_id,recipe_id,item_id,quantity,unit) VALUES ($1,$2,$3,$4,$5)", [businessId, recipeId, ingredient.itemId, ingredient.quantity, ingredient.unit]);
    await auditService.record({ client, businessId, userId, module: "recipes", action: "edit", reference: `RECIPE-${recipeId}`, description: "Receta editada", newValues: { recipeId, data } });
    await client.query("COMMIT");
    return getRecipe(businessId, recipeId);
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; } finally { client.release(); }
}

export async function updateRecipeStatus({ businessId, userId, recipeId, status }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query("UPDATE recipes SET status=$1 WHERE business_id=$2 AND id=$3 RETURNING *", [status, businessId, recipeId]);
    if (!result.rows[0]) { await client.query("ROLLBACK"); return null; }
    await auditService.record({ client, businessId, userId, module: "recipes", action: "change_status", reference: `RECIPE-${recipeId}`, description: "Estado de receta actualizado", newValues: { status } });
    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; } finally { client.release(); }
}

export async function produceRecipe({ businessId, recipeId, userId, locationId, quantity }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const detail = await getRecipeWithClient(client, businessId, recipeId);
    if (!detail || detail.recipe.status !== "active") { await client.query("ROLLBACK"); return { error: "not_found" }; }
    const location = (await client.query("SELECT id FROM business_locations WHERE business_id=$1 AND id=$2 AND status='active' FOR KEY SHARE", [businessId, locationId])).rows[0];
    if (!location) { await client.query("ROLLBACK"); return { error: "location_not_found" }; }
    const itemIds = [...new Set([Number(detail.recipe.product_id), ...detail.ingredients.map((item) => Number(item.item_id))])];
    await client.query("INSERT INTO inventory_balances (business_id,location_id,item_id,stock) SELECT $1,$2,x,0 FROM unnest($3::INTEGER[]) x ON CONFLICT DO NOTHING", [businessId, locationId, itemIds]);
    const balances = (await client.query("SELECT item_id,stock FROM inventory_balances WHERE business_id=$1 AND location_id=$2 AND item_id=ANY($3::INTEGER[]) FOR UPDATE", [businessId, locationId, itemIds])).rows;
    const stocks = new Map(balances.map((row) => [Number(row.item_id), Number(row.stock)]));
    const deductions = detail.ingredients.map((ingredient) => ({ itemId: Number(ingredient.item_id), amount: convertQuantity(ingredient.quantity, ingredient.unit) * Number(quantity) }));
    for (const deduction of deductions) if ((stocks.get(deduction.itemId) ?? 0) < deduction.amount || !Number.isInteger(deduction.amount)) { await client.query("ROLLBACK"); return { error: "insufficient_stock", itemId: deduction.itemId }; }
    for (const deduction of deductions) { const previous = stocks.get(deduction.itemId); const resulting = previous - deduction.amount; await client.query("INSERT INTO inventory_movements (business_id,location_id,item_id,movement_type,quantity_delta,previous_stock,resulting_stock,reason,reference,created_by) VALUES ($1,$2,$3,'exit',$4,$5,$6,'Producción de receta',$7,$8)", [businessId, locationId, deduction.itemId, -deduction.amount, previous, resulting, `RECIPE-${recipeId}`, userId]); await client.query("UPDATE inventory_balances SET stock=$1 WHERE business_id=$2 AND location_id=$3 AND item_id=$4", [resulting, businessId, locationId, deduction.itemId]); await client.query("UPDATE items SET stock=stock-$1 WHERE business_id=$2 AND id=$3", [deduction.amount, businessId, deduction.itemId]); }
    const produced = Number(detail.recipe.yield_quantity) * Number(quantity); const finalPrevious = stocks.get(Number(detail.recipe.product_id)) ?? 0; const finalResulting = finalPrevious + produced;
    await client.query("INSERT INTO inventory_movements (business_id,location_id,item_id,movement_type,quantity_delta,previous_stock,resulting_stock,reason,reference,created_by) VALUES ($1,$2,$3,'entry',$4,$5,$6,'Producción de receta',$7,$8)", [businessId, locationId, detail.recipe.product_id, produced, finalPrevious, finalResulting, `RECIPE-${recipeId}`, userId]);
    await client.query("UPDATE inventory_balances SET stock=$1 WHERE business_id=$2 AND location_id=$3 AND item_id=$4", [finalResulting, businessId, locationId, detail.recipe.product_id]); await client.query("UPDATE items SET stock=stock+$1 WHERE business_id=$2 AND id=$3", [produced, businessId, detail.recipe.product_id]);
    await notificationService.syncStockAlertNotifications({ client, businessId });
    await auditService.record({ client, businessId, userId, module: "recipes", action: "create", reference: `RECIPE-${recipeId}`, description: "Lote producido", newValues: { recipeId, locationId, quantity, produced } });
    await client.query("COMMIT"); return { recipeId: Number(recipeId), produced, productStock: finalResulting };
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; } finally { client.release(); }
}

async function getRecipeWithClient(client, businessId, recipeId) {
  const recipe = (await client.query("SELECT * FROM recipes WHERE business_id=$1 AND id=$2 FOR UPDATE", [businessId, recipeId])).rows[0];
  if (!recipe) return null;
  const ingredients = (await client.query("SELECT ri.*, i.cost_price FROM recipe_ingredients ri JOIN items i ON (i.business_id,i.id)=(ri.business_id,ri.item_id) WHERE ri.business_id=$1 AND ri.recipe_id=$2 FOR SHARE", [businessId, recipeId])).rows;
  return { recipe, ingredients };
}
