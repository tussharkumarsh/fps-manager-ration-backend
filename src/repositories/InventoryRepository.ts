import { supabase } from "../lib/supabase";
import { generateItemId } from "../lib/ids";
import type { InventoryItem, InventoryLedgerEntry } from "../types";

interface ItemRow {
  fps_id: string;
  item_id: string;
  name: string;
  unit: string;
  tx_field: string;
  active: boolean;
  created_at: string;
}

interface LedgerRow {
  fps_id: string;
  year: string;
  month: string;
  item_id: string;
  opening: number;
  received: number;
  distributed_manual: number;
  closing: number;
  updated_at: string;
}

const DEFAULT_ITEMS: Omit<InventoryItem, "id">[] = [
  { name: "Wheat", unit: "Kg", txField: "wheat", active: true },
  { name: "Rice", unit: "Kg", txField: "rice", active: true },
  { name: "Sugar", unit: "Kg", txField: "sugar", active: true },
  { name: "Saree Kit", unit: "Pcs", txField: "", active: true },
  { name: "Jowar", unit: "Kg", txField: "jowar", active: true },
];

function rowToItem(row: ItemRow): InventoryItem {
  return {
    id: row.item_id,
    name: row.name,
    unit: row.unit,
    txField: (row.tx_field as InventoryItem["txField"]) || "",
    active: row.active,
  };
}

function itemToRow(fpsId: string, item: InventoryItem): ItemRow {
  return {
    fps_id: fpsId,
    item_id: item.id,
    name: item.name,
    unit: item.unit,
    tx_field: item.txField,
    active: item.active,
    created_at: new Date().toISOString(),
  };
}

function rowToLedger(row: LedgerRow): InventoryLedgerEntry {
  return {
    fpsId: row.fps_id,
    year: row.year,
    month: row.month,
    itemId: row.item_id,
    opening: row.opening,
    received: row.received,
    distributed: row.distributed_manual,
    closing: row.closing,
  };
}

function ledgerToRow(entry: InventoryLedgerEntry): LedgerRow {
  return {
    fps_id: entry.fpsId,
    year: entry.year,
    month: entry.month,
    item_id: entry.itemId,
    opening: entry.opening,
    received: entry.received,
    distributed_manual: entry.distributed,
    closing: entry.closing,
    updated_at: new Date().toISOString(),
  };
}

export class InventoryRepository {
  async getItems(fpsId: string): Promise<InventoryItem[]> {
    const trimmed = fpsId.trim();
    const { data, error } = await supabase.from("inventory_items").select("*").eq("fps_id", trimmed);
    if (error) throw new Error(`InventoryRepository.getItems: ${error.message}`);
    const items = (data as ItemRow[]).map(rowToItem);

    if (items.length === 0) {
      // No items yet for this dealer — seed the defaults, once.
      const seeded = DEFAULT_ITEMS.map((item) => itemToRow(trimmed, { ...item, id: generateItemId() }));
      const { error: insertError } = await supabase.from("inventory_items").insert(seeded);
      if (insertError) throw new Error(`InventoryRepository.getItems (seed): ${insertError.message}`);
      return seeded.map(rowToItem);
    }

    // Backfill: a default tx-linked commodity (e.g. Sugar/Jowar) added to
    // DEFAULT_ITEMS after this dealer was first seeded is still missing from
    // their item list — add just that one, without touching anything else.
    const existingTxFields = new Set(items.map((i) => i.txField).filter(Boolean));
    const missingDefaults = DEFAULT_ITEMS.filter((d) => d.txField && !existingTxFields.has(d.txField));
    if (missingDefaults.length > 0) {
      const newRows = missingDefaults.map((item) => itemToRow(trimmed, { ...item, id: generateItemId() }));
      const { error: backfillError } = await supabase.from("inventory_items").insert(newRows);
      if (backfillError) throw new Error(`InventoryRepository.getItems (backfill): ${backfillError.message}`);
      return [...items, ...newRows.map(rowToItem)];
    }

    return items;
  }

  async addItem(fpsId: string, item: Omit<InventoryItem, "id">): Promise<InventoryItem> {
    await this.getItems(fpsId); // ensures defaults are seeded first
    const newItem: InventoryItem = { ...item, id: generateItemId() };
    const { error } = await supabase.from("inventory_items").insert(itemToRow(fpsId, newItem));
    if (error) throw new Error(`InventoryRepository.addItem: ${error.message}`);
    return newItem;
  }

  async getLedgerForMonth(fpsId: string, year: string, month: string): Promise<InventoryLedgerEntry[]> {
    const { data, error } = await supabase
      .from("inventory_ledger")
      .select("*")
      .eq("fps_id", fpsId.trim())
      .eq("year", String(year).trim())
      .eq("month", String(month).trim());
    if (error) throw new Error(`InventoryRepository.getLedgerForMonth: ${error.message}`);
    return (data as LedgerRow[]).map(rowToLedger);
  }

  private async upsertLedgerRow(entry: InventoryLedgerEntry): Promise<void> {
    const { error } = await supabase
      .from("inventory_ledger")
      .upsert(ledgerToRow(entry), { onConflict: "fps_id,year,month,item_id" });
    if (error) throw new Error(`InventoryRepository.upsertLedgerRow: ${error.message}`);
  }

  async setReceived(
    fpsId: string,
    year: string,
    month: string,
    itemId: string,
    received: number,
    distributed: number
  ): Promise<InventoryLedgerEntry> {
    const { data: existing, error } = await supabase
      .from("inventory_ledger")
      .select("opening")
      .eq("fps_id", fpsId.trim())
      .eq("year", String(year).trim())
      .eq("month", String(month).trim())
      .eq("item_id", itemId.trim())
      .maybeSingle();
    if (error) throw new Error(`InventoryRepository.setReceived: ${error.message}`);

    const opening = existing ? (existing as { opening: number }).opening : 0;
    const closing = opening + received - distributed;
    const entry: InventoryLedgerEntry = { fpsId, year, month, itemId, opening, received, distributed, closing };
    await this.upsertLedgerRow(entry);
    return entry;
  }

  async setManualDistributed(
    fpsId: string,
    year: string,
    month: string,
    itemId: string,
    distributed: number
  ): Promise<InventoryLedgerEntry> {
    const { data: existing, error } = await supabase
      .from("inventory_ledger")
      .select("*")
      .eq("fps_id", fpsId.trim())
      .eq("year", String(year).trim())
      .eq("month", String(month).trim())
      .eq("item_id", itemId.trim())
      .maybeSingle();
    if (error) throw new Error(`InventoryRepository.setManualDistributed: ${error.message}`);

    const row = existing as LedgerRow | null;
    const opening = row?.opening ?? 0;
    const received = row?.received ?? 0;
    const closing = opening + received - distributed;
    const entry: InventoryLedgerEntry = { fpsId, year, month, itemId, opening, received, distributed, closing };
    await this.upsertLedgerRow(entry);
    return entry;
  }

  /**
   * Deletes every inventory item and ledger entry for this dealer —
   * opening balances, received/distributed history, everything. Used by
   * the factory reset / admin "clear data" flow; the default items get
   * re-seeded fresh (all balances at zero) the next time this dealer's
   * inventory is read.
   */
  async clearAll(fpsId: string): Promise<void> {
    const trimmed = fpsId.trim();
    const { error: ledgerError } = await supabase.from("inventory_ledger").delete().eq("fps_id", trimmed);
    if (ledgerError) throw new Error(`InventoryRepository.clearAll (ledger): ${ledgerError.message}`);
    const { error: itemsError } = await supabase.from("inventory_items").delete().eq("fps_id", trimmed);
    if (itemsError) throw new Error(`InventoryRepository.clearAll (items): ${itemsError.message}`);
  }
}
