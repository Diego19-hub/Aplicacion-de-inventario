import pool from "./pool.js";
import { auditService } from "../services/auditService.js";
import { notificationService } from "../services/notificationService.js";

export async function getApiTransferFormOptions(businessId) {
  const [products, locations, balances] = await Promise.all([
    pool.query(
      `
        SELECT id, name, sku, stock
        FROM items
        WHERE business_id = $1
          AND status = 'active'
        ORDER BY LOWER(name), id
      `,
      [businessId]
    ),
    pool.query(
      `
        SELECT id, name, code, is_default
        FROM business_locations
        WHERE business_id = $1
          AND status = 'active'
        ORDER BY is_default DESC, LOWER(name), id
      `,
      [businessId]
    ),
    pool.query(
      `
        SELECT b.item_id, b.location_id, b.stock
        FROM inventory_balances b
        INNER JOIN items i
          ON (i.business_id, i.id) = (b.business_id, b.item_id)
        INNER JOIN business_locations l
          ON (l.business_id, l.id) = (b.business_id, b.location_id)
        WHERE b.business_id = $1
          AND i.status = 'active'
          AND l.status = 'active'
      `,
      [businessId]
    )
  ]);

  return {
    products: products.rows,
    locations: locations.rows,
    balances: balances.rows
  };
}

export async function createInventoryTransfer({ businessId,itemId,userId,fromLocationId,toLocationId,quantity,reason,reference }) {
 const client=await pool.connect();
 try { await client.query('BEGIN');
  const item=(await client.query("SELECT id,name,sku,stock FROM items WHERE id=$1 AND business_id=$2 AND status='active' FOR UPDATE",[itemId,businessId])).rows[0]; if(!item){await client.query('ROLLBACK');return {error:'not_found'};}
  if(fromLocationId===toLocationId){await client.query('ROLLBACK');return {error:'same_location'};}
  const locations=(await client.query("SELECT id,name,code FROM business_locations WHERE business_id=$1 AND status='active' AND id=ANY($2::int[]) ORDER BY id FOR KEY SHARE",[businessId,[fromLocationId,toLocationId]])).rows; if(locations.length!==2){await client.query('ROLLBACK');return {error:'location_not_found'};}
  await client.query("INSERT INTO inventory_balances(business_id,location_id,item_id,stock) VALUES($1,$2,$3,0) ON CONFLICT DO NOTHING",[businessId,toLocationId,itemId]);
  const balances=(await client.query("SELECT location_id,stock FROM inventory_balances WHERE business_id=$1 AND item_id=$2 AND location_id=ANY($3::int[]) ORDER BY location_id FOR UPDATE",[businessId,itemId,[fromLocationId,toLocationId]])).rows;
  const byId=new Map(balances.map(b=>[b.location_id,b.stock])); const fromStock=byId.get(fromLocationId)??0, toStock=byId.get(toLocationId)??0;
  if(fromStock<quantity){await client.query('ROLLBACK');return {error:'insufficient_stock'};}
  const transfer=(await client.query("INSERT INTO inventory_transfers(business_id,item_id,from_location_id,to_location_id,quantity,reason,reference,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,quantity,reason,reference,created_at",[businessId,itemId,fromLocationId,toLocationId,quantity,reason,reference||null,userId])).rows[0];
  const out=fromStock-quantity, inn=toStock+quantity;
  await client.query("INSERT INTO inventory_movements(business_id,item_id,location_id,transfer_id,movement_type,quantity_delta,previous_stock,resulting_stock,reason,reference,created_by) VALUES($1,$2,$3,$4,'transfer_out',$5,$6,$7,$8,$9,$10),($1,$2,$11,$4,'transfer_in',$12,$13,$14,$8,$9,$10)",[businessId,itemId,fromLocationId,transfer.id,-quantity,fromStock,out,reason,reference||null,userId,toLocationId,quantity,toStock,inn]);
  await client.query("UPDATE inventory_balances SET stock=CASE WHEN location_id=$3 THEN $4::integer WHEN location_id=$5 THEN $6::integer END WHERE business_id=$1 AND item_id=$2 AND location_id IN($3,$5)",[businessId,itemId,fromLocationId,out,toLocationId,inn]);
  const total=(await client.query("SELECT COALESCE(sum(stock),0)::int total FROM inventory_balances WHERE business_id=$1 AND item_id=$2",[businessId,itemId])).rows[0].total; if(total!==item.stock)throw new Error('La transferencia alteró el stock total.');
  await notificationService.syncStockAlertNotifications({ client, businessId });
  await auditService.record({ client, businessId, userId, module: "transfers", action: "create", reference: reference || `TRANSFER-${transfer.id}`, description: "Transferencia registrada", newValues: { itemId, fromLocationId, toLocationId, quantity, reason } });
  await client.query('COMMIT');
  return {
    ...transfer,
    item,
    fromLocation: locations.find((location) => location.id === fromLocationId),
    toLocation: locations.find((location) => location.id === toLocationId)
  };
 } catch(e){await client.query('ROLLBACK');throw e;} finally{client.release();}
}
