import { supabase } from "../lib/supabase";
import type {
    InventoryMonthlySummary,
    ScmInventoryTransaction,
    ScmRoRecord,
    ScmTruckChitRecord,
} from "../types";

interface SummaryRowDb {
    fps_id: string;
    year: string;
    month: string;
    scheme: string;
    commodity: string;
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
        receivedQty: Number(row.received_qty || 0),
        distributedQty: Number(row.distributed_qty || 0),
        closingStock: Number(row.closing_stock || 0),
        truckChitCount: Number(row.truck_chit_count || 0),
        roCount: Number(row.ro_count || 0),
        importedAt: row.imported_at,
    };
}

export class ScmInventoryRepository {
    async upsertRoRecords(rows: ScmRoRecord[]): Promise<number> {
        if (rows.length === 0) return 0;
        const payload = rows.map((row) => ({
            fps_id: row.fpsId,
            shop_no: row.shopNo,
            district_code: row.districtCode,
            district_name: row.districtName,
            year: row.year,
            month: row.month,
            ro_no: row.roNo,
            ro_date: row.roDate || null,
            ro_time: row.roTime || null,
            dispatched: row.dispatched,
            sequence_no: row.sequenceNo,
            source_identifier: row.sourceIdentifier,
            imported_at: new Date().toISOString(),
        }));

        const { error } = await supabase.from("scm_monthly_ro_records").upsert(payload, {
            onConflict: "source_identifier",
        });
        if (error) throw new Error(`ScmInventoryRepository.upsertRoRecords: ${error.message}`);
        return payload.length;
    }

    async upsertTruckChits(rows: ScmTruckChitRecord[]): Promise<number> {
        if (rows.length === 0) return 0;
        const payload = rows.map((row) => ({
            fps_id: row.fpsId,
            truck_chit_no: row.truckChitNo,
            ro_no: row.roNo,
            year: row.year,
            month: row.month,
            sequence_no: row.sequenceNo,
            dispatch_date: row.dispatchDate || null,
            truck_no: row.truckNo || null,
            source_identifier: row.sourceIdentifier,
            imported_at: new Date().toISOString(),
        }));

        const { error } = await supabase.from("scm_truck_chits").upsert(payload, {
            onConflict: "source_identifier",
        });
        if (error) throw new Error(`ScmInventoryRepository.upsertTruckChits: ${error.message}`);
        return payload.length;
    }

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
        const { data, error } = await supabase
            .from("scm_inventory_summary")
            .select("*")
            .eq("fps_id", fpsId.trim())
            .eq("year", String(year).trim())
            .order("month")
            .order("scheme")
            .order("commodity");
        if (error) throw new Error(`ScmInventoryRepository.getSummaryForYear: ${error.message}`);
        return ((data as SummaryRowDb[]) || []).map(rowToSummary);
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
            received_qty: row.receivedQty,
            distributed_qty: row.distributedQty,
            closing_stock: row.closingStock,
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

    async getMonthCounts(fpsId: string, year: string, month: string): Promise<{ roCount: number; truckChitCount: number; }> {
        const { count: roCount, error: roError } = await supabase
            .from("scm_monthly_ro_records")
            .select("*", { count: "exact", head: true })
            .eq("fps_id", fpsId.trim())
            .eq("year", String(year).trim())
            .eq("month", String(month).trim());
        if (roError) throw new Error(`ScmInventoryRepository.getMonthCounts.ro: ${roError.message}`);

        const { count: truckChitCount, error: truckError } = await supabase
            .from("scm_truck_chits")
            .select("*", { count: "exact", head: true })
            .eq("fps_id", fpsId.trim())
            .eq("year", String(year).trim())
            .eq("month", String(month).trim());
        if (truckError) throw new Error(`ScmInventoryRepository.getMonthCounts.truck: ${truckError.message}`);

        return {
            roCount: roCount ?? 0,
            truckChitCount: truckChitCount ?? 0,
        };
    }

    async getMonthTransactions(fpsId: string, year: string, month: string): Promise<ScmInventoryTransaction[]> {
        const { data, error } = await supabase
            .from("scm_inventory_transactions")
            .select("*")
            .eq("fps_id", fpsId.trim())
            .eq("year", String(year).trim())
            .eq("month", String(month).trim());
        if (error) throw new Error(`ScmInventoryRepository.getMonthTransactions: ${error.message}`);
        return ((data as any[]) || []).map((row) => ({
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
