import pool from "./pool.js";

export async function getActiveLocations(businessId) {
  const result = await pool.query("SELECT id, name, code, location_type, is_default FROM business_locations WHERE business_id=$1 AND status='active' ORDER BY is_default DESC, lower(name), id", [businessId]);
  return result.rows;
}

export async function getItemBalances(businessId, itemId) {
  const result = await pool.query(`SELECT l.id AS location_id, l.name, l.code, l.status, COALESCE(b.stock,0)::INTEGER AS stock
    FROM business_locations l LEFT JOIN inventory_balances b ON (b.business_id,b.location_id,b.item_id)=(l.business_id,l.id,$2)
    WHERE l.business_id=$1 AND (l.status='active' OR COALESCE(b.stock,0) > 0) ORDER BY l.status='active' DESC, l.is_default DESC, lower(l.name)`, [businessId,itemId]);
  return result.rows;
}

export async function listLocations(businessId) { const r=await pool.query(`SELECT l.*, COALESCE(sum(b.stock),0)::integer AS total_stock FROM business_locations l LEFT JOIN inventory_balances b ON (b.business_id,b.location_id)=(l.business_id,l.id) WHERE l.business_id=$1 GROUP BY l.id ORDER BY l.is_default DESC, lower(l.name),l.id`,[businessId]); return r.rows; }
export async function getLocation(id,businessId) { const r=await pool.query(`SELECT l.*,COALESCE(sum(b.stock),0)::integer AS total_stock FROM business_locations l LEFT JOIN inventory_balances b ON (b.business_id,b.location_id)=(l.business_id,l.id) WHERE l.id=$1 AND l.business_id=$2 GROUP BY l.id`,[id,businessId]);return r.rows[0]; }
export async function createLocation(data,businessId) { const r=await pool.query(`INSERT INTO business_locations(business_id,name,code,location_type,address,phone,notes) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,[businessId,data.name,data.code.toUpperCase(),data.locationType,data.address,data.phone,data.notes]);return r.rows[0]; }
export async function updateLocation(id,data,businessId) { const r=await pool.query(`UPDATE business_locations SET name=$1,code=$2,location_type=$3,address=$4,phone=$5,notes=$6 WHERE id=$7 AND business_id=$8 RETURNING id`,[data.name,data.code.toUpperCase(),data.locationType,data.address,data.phone,data.notes,id,businessId]);return r.rows[0]; }
export async function changeLocationStatus(id,businessId,from,to) { const r=await pool.query(`UPDATE business_locations l SET status=$4 WHERE l.id=$1 AND l.business_id=$2 AND l.status=$3 AND NOT (l.is_default AND $4='inactive') AND NOT ($4='inactive' AND EXISTS(SELECT 1 FROM inventory_balances b WHERE b.business_id=l.business_id AND b.location_id=l.id AND b.stock<>0)) RETURNING id`,[id,businessId,from,to]);return r.rows[0]; }
export async function makeDefaultLocation(id,businessId) { const client=await pool.connect();try {await client.query('BEGIN'); const target=await client.query("SELECT id FROM business_locations WHERE id=$1 AND business_id=$2 AND status='active' AND NOT is_default FOR UPDATE",[id,businessId]);if(!target.rows[0]){await client.query('ROLLBACK');return null;} await client.query("SELECT id FROM business_locations WHERE business_id=$1 AND is_default FOR UPDATE",[businessId]);await client.query("UPDATE business_locations SET is_default=false WHERE business_id=$1 AND is_default",[businessId]);const result=await client.query("UPDATE business_locations SET is_default=true WHERE id=$1 AND business_id=$2 AND status='active' RETURNING id",[id,businessId]);await client.query('COMMIT');return result.rows[0];}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();} }
