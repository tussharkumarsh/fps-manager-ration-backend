import { supabase, fetchAllRows } from "../lib/supabase";
import type {
    InventoryMonthlySummary,
    ScmInventoryTransaction,
} from "../types";

interface SummaryRowDb {
    fps_id: string;
    year: string;
    month: string;
    scheme: string;
    commodity: string;
    opening_stock: number;
    received_qty: number;
    distributed_qty: number;
    closing_stock: number;
    truck_chit_count: number;
    ro_count: number;
    imported_at?: string;
}

function rowToSummary(row: SummaryRowDb): InventoryMonthlySummary {
    return {
        fpsId: row.fps_id,
        year: row.year,
        month: row.month,
        scheme: row.scheme,
        commodity: row.commodity,
        openingStock: Number(row.opening_stock || 0),
        receivedQty: Number(row.received_qty || 0),
        distributedQty: Number(row.distributed_qty || 0),
        closingStock: Number(row.closing_stock || 0),
        truckChitCount: Number(row.truck_chit_count || 0),
        roCount: Number(row.ro_count || 0),
        importedAt: row.imported_at,
    };
}

export class ScmInventoryRepository {
    async upsertTransactions(rows: ScmInventoryTransaction[]): Promise<number> {
        if (rows.length === 0) return 0;
        const payload = rows.map((row) => ({
            fps_id: row.fpsId,
            truck_chit_no: row.truckChitNo,
            ro_no: row.roNo,
            year: row.year,
            month: row.month,
            scheme: row.scheme,
            commodity: row.commodity,
            unit: row.unit,
            allocated_qty: row.allocatedQty,
            dispatched_qty: row.dispatchedQty,
            received_qty: row.receivedQty,
            transaction_date: row.transactionDate || null,
            source_identifier: row.sourceIdentifier,
            imported_at: new Date().toISOString(),
            district_code: row.districtCode || null,
        }));

        const { error } = await supabase.from("scm_inventory_transactions").upsert(payload, {
            onConflict: "source_identifier",
        });
        if (error) throw new Error(`ScmInventoryRepository.upsertTransactions: ${error.message}`);
        return payload.length;
    }

    /**
     * Removes a month's allotment rows (truck_chit_no "ALLOT-<ctype>") for the
     * given types, except those just written (keepIds).
     */
    async deleteStaleAllotmentRows(fpsId: string, year: string, month: string, ctypes: string[], keepIds: string[]): Promise<void> {
        if (ctypes.length === 0) return;
        let q = supabase
            .from("scm_inventory_transactions")
            .delete()
            .eq("fps_id", fpsId.trim())
            .eq("year", String(year).trim())
            .eq("month", String(month).trim())
            .in("truck_chit_no", ctypes.map((c) => `ALLOT-${c}`));
        if (keepIds.length > 0) {
            q = q.not("source_identifier", "in", `(${keepIds.map((id) => `"${id.replace(/"/g, "")}"`).join(",")})`);
        }
        const { error } = await q;
        if (error) throw new Error(`ScmInventoryRepository.deleteStaleAllotmentRows: ${error.message}`);
    }

    async getSummaryForMonth(fpsId: string, year: string, month: string): Promise<InventoryMonthlySummary[]> {
        const { data, error } = await supabase
            .from("scm_inventory_summary")
            .select("*")
            .eq("fps_id", fpsId.trim())
            .eq("year", String(year).trim())
            .eq("month", String(month).trim())
            .order("scheme")
            .order("commodity");
        if (error) throw new Error(`ScmInventoryRepository.getSummaryForMonth: ${error.message}`);
        return ((data as SummaryRowDb[]) || []).map(rowToSummary);
    }

    async getSummaryForYear(fpsId: string, year: string): Promise<InventoryMonthlySummary[]> {
        const rows = await fetchAllRows<SummaryRowDb>((from, to) =>
            supabase
                .from("scm_inventory_summary")
                .select("*")
                .eq("fps_id", fpsId.trim())
                .eq("year", String(year).trim())
                .order("month")
                .order("scheme")
                .order("commodity")
                .range(from, to)
        );
        return rows.map(rowToSummary);
    }

    async replaceSummaryRows(fpsId: string, year: string, month: string, rows: InventoryMonthlySummary[]): Promise<number> {
        if (rows.length === 0) {
            const { error } = await supabase.from("scm_inventory_summary").delete().eq("fps_id", fpsId.trim()).eq("year", year).eq("month", month);
            if (error) throw new Error(`ScmInventoryRepository.replaceSummaryRows.delete: ${error.message}`);
            return 0;
        }

        const payload = rows.map((row) => ({
            fps_id: row.fpsId,
            year: row.year,
            month: row.month,
            scheme: row.scheme,
            commodity: row.commodity,
            opening_stock: row.openingStock,
            received_qty: row.receivedQty,
            distributed_qty: row.distributedQty,
            closing_stock: row.closingStock,
            carried_forward_qty: row.closingStock,
            truck_chit_count: row.truckChitCount || 0,
            ro_count: row.roCount || 0,
            imported_at: new Date().toISOString(),
        }));

        const { error: deleteError } = await supabase
            .from("scm_inventory_summary")
            .delete()
            .eq("fps_id", fpsId.trim())
            .eq("year", String(year).trim())
            .eq("month", String(month).trim());
        if (deleteError) throw new Error(`ScmInventoryRepository.replaceSummaryRows.delete: ${deleteError.message}`);

        const { error: insertError } = await supabase.from("scm_inventory_summary").insert(payload);
        if (insertError) throw new Error(`ScmInventoryRepository.replaceSummaryRows.insert: ${insertError.message}`);
        return payload.length;
    }

    async getMonthTransactions(fpsId: string, year: string, month: string): Promise<ScmInventoryTransaction[]> {
        const data = await fetchAllRows<any>((from, to) =>
            supabase
                .from("scm_inventory_transactions")
                .select("*")
                .eq("fps_id", fpsId.trim())
                .eq("year", String(year).trim())
                .eq("month", String(month).trim())
                .range(from, to)
        );
        return data.map((row) => ({
            fpsId: row.fps_id,
            truckChitNo: row.truck_chit_no,
            roNo: row.ro_no,
            year: row.year,
            month: row.month,
            scheme: row.scheme,
            commodity: row.commodity,
            unit: row.unit,
            allocatedQty: Number(row.allocated_qty || 0),
            dispatchedQty: Number(row.dispatched_qty || 0),
            receivedQty: Number(row.received_qty || 0),
            transactionDate: row.transaction_date || undefined,
            sourceIdentifier: row.source_identifier,
            districtCode: row.district_code || undefined,
        }));
    }
}
