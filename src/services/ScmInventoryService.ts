import { ScmApiClient } from "../lib/scmApiClient";
import { ScmInventoryRepository } from "../repositories/ScmInventoryRepository";
import { TransactionRepository } from "../repositories/TransactionRepository";
import type { InventoryMonthlySummary, ScmInventoryTransaction, ScmRoRecord, ScmTruckChitRecord } from "../types";

// The SCM portal's own "dispatched" figure reflects what the government
// dispatched to us, not what we actually handed out to customers. For the
// commodities our local transaction ledger tracks (wheat/rice/saree kit),
// "distributed" should reflect our own recorded sales instead - so the
// summary stays consistent with the rest of the app rather than the
// portal's dispatch record.
const COMMODITY_TX_FIELD: Record<string, "wheat" | "rice" | "saree"> = {
    wheat: "wheat",
    rice: "rice",
    saree: "saree",
    "saree kit": "saree",
};

function txFieldForCommodity(commodity: string): "wheat" | "rice" | "saree" | null {
    return COMMODITY_TX_FIELD[commodity.trim().toLowerCase()] || null;
}

export class ScmInventoryService {
    private readonly repo = new ScmInventoryRepository();
    private readonly api = new ScmApiClient();
    private readonly txnRepo = new TransactionRepository();

    async syncMonth(fpsId: string, year: string, month: string, shopNo?: string, districtCode?: string, districtName?: string, batchNo?: string) {
        // The SCM portal's shop number is the dealer's own fps_id, and its
        // district name param is just the district code repeated - so both
        // default off values we already have rather than requiring separate config.
        const effectiveShopNo = shopNo || fpsId || process.env.SCM_SHOP_NO;
        const effectiveDistrictCode = districtCode || process.env.SCM_DISTRICT_CODE;
        const effectiveDistrictName = districtName || effectiveDistrictCode || process.env.SCM_DISTRICT_NAME;

        if (!effectiveShopNo || !effectiveDistrictCode || !effectiveDistrictName) {
            throw new Error("shopNo (or fpsId) and districtCode are required to sync SCM inventory");
        }

        const roRows = await this.api.fetchMonthlyRoList({
            shopNo: effectiveShopNo,
            districtCode: effectiveDistrictCode,
            districtName: effectiveDistrictName,
            year,
            month,
        });

        const normalizedBatchNo = String(batchNo ?? "").trim();
        const requestedRoRows = normalizedBatchNo
            ? roRows.filter((row) => row.roNo.endsWith(`/${normalizedBatchNo}`))
            : roRows;

        const roRecords: ScmRoRecord[] = requestedRoRows.map((row) => ({
            fpsId,
            shopNo: row.shopNo,
            districtCode: row.districtCode,
            districtName: row.districtName,
            year: row.year,
            month: row.month,
            roNo: row.roNo,
            roDate: row.roDate,
            roTime: row.roTime,
            dispatched: row.dispatched,
            sequenceNo: row.sequenceNo,
            sourceIdentifier: row.sourceIdentifier,
        }));

        await this.repo.upsertRoRecords(roRecords);

        const truckChits: ScmTruckChitRecord[] = [];
        const transactions: ScmInventoryTransaction[] = [];
        for (const ro of roRecords) {
            if (!ro.roNo) continue;
            const truckChitNo = this.buildTruckChitPattern(ro.roNo);
            const truckRows = await this.api.fetchTruckChitDetail({
                shopNo: effectiveShopNo,
                districtCode: effectiveDistrictCode,
                districtName: effectiveDistrictName,
                year,
                month,
                roNo: ro.roNo,
                truckChitNo,
                sequenceNo: ro.sequenceNo,
            });

            if (truckRows.length === 0) continue;

            const truckRecord: ScmTruckChitRecord = {
                fpsId,
                truckChitNo,
                roNo: ro.roNo,
                year,
                month,
                sequenceNo: ro.sequenceNo,
                dispatchDate: truckRows[0]?.dispatchDate,
                truckNo: undefined,
                sourceIdentifier: truckChitNo,
            };
            truckChits.push(truckRecord);

            for (const row of truckRows) {
                transactions.push({
                    fpsId,
                    truckChitNo,
                    roNo: ro.roNo,
                    year,
                    month,
                    scheme: row.scheme,
                    commodity: row.commodity,
                    unit: row.unit,
                    allocatedQty: row.allocatedQty,
                    dispatchedQty: row.dispatchedQty,
                    receivedQty: row.receivedQty,
                    transactionDate: row.transactionDate,
                    sourceIdentifier: row.sourceIdentifier,
                    districtCode: effectiveDistrictCode,
                });
            }
        }

        await this.repo.upsertTruckChits(truckChits);
        await this.repo.upsertTransactions(transactions);

        // Recompute from all transactions synced for the month so far (not just this
        // batch's), otherwise a batch-scoped sync would wipe out prior batches' summary.
        const monthTruckChitCount = normalizedBatchNo ? (await this.repo.getMonthCounts(fpsId, year, month)).truckChitCount : truckChits.length;
        const monthTransactions = normalizedBatchNo ? await this.repo.getMonthTransactions(fpsId, year, month) : transactions;

        const summary = await this.calculateSummary(fpsId, year, month, monthTruckChitCount, monthTransactions);
        await this.repo.replaceSummaryRows(fpsId, year, month, summary);

        return {
            roCount: roRecords.length,
            truckChitCount: truckChits.length,
            summary,
            transactions,
        };
    }

    // Re-runs calculateSummary for every already-synced month of the year,
    // in order, using data already stored from prior SCM syncs (no portal
    // fetch). Needed because calculateSummary reads each month's opening
    // stock from the previous month's stored closing, so fixing the
    // distributed-quantity logic requires recomputing months sequentially
    // for the carry-forward chain to stay correct - not just the month
    // that gets re-synced next.
    async recomputeYear(fpsId: string, year: string): Promise<void> {
        for (let m = 1; m <= 12; m++) {
            const month = String(m);
            const monthTransactions = await this.repo.getMonthTransactions(fpsId, year, month);
            const { truckChitCount } = await this.repo.getMonthCounts(fpsId, year, month);
            if (monthTransactions.length === 0 && truckChitCount === 0) continue;

            const summary = await this.calculateSummary(fpsId, year, month, truckChitCount, monthTransactions);
            await this.repo.replaceSummaryRows(fpsId, year, month, summary);
        }
    }

    private buildTruckChitPattern(roNo: string): string {
        const formatted = roNo.replace(/^RO\//, "").replace(/\//g, "-");
        return `TC-${formatted}`;
    }

    async calculateSummary(
        fpsId: string,
        year: string,
        month: string,
        truckChitCount: number,
        transactions: ScmInventoryTransaction[]
    ): Promise<InventoryMonthlySummary[]> {
        const grouped = new Map<string, { scheme: string; commodity: string; received: number; distributed: number; truckChitCount: number; roCount: number; }>();

        for (const txn of transactions) {
            const key = `${txn.scheme}|${txn.commodity}`;
            const current = grouped.get(key) || { scheme: txn.scheme, commodity: txn.commodity, received: 0, distributed: 0, truckChitCount: 0, roCount: 0 };
            current.received += txn.receivedQty;
            current.distributed += txn.dispatchedQty;
            current.truckChitCount = Math.max(current.truckChitCount, 1);
            grouped.set(key, current);
        }

        // Override "distributed" with our own recorded sales for the
        // commodities the local transaction ledger tracks, summed per
        // scheme so AAY and PHH quantities don't get mixed together.
        const localTxns = await this.txnRepo.getForMonth(fpsId, year, month);
        const localDistributed = new Map<string, number>();
        for (const txn of localTxns) {
            for (const field of ["wheat", "rice", "saree"] as const) {
                const key = `${txn.scheme}|${field}`;
                localDistributed.set(key, (localDistributed.get(key) || 0) + (txn[field] || 0));
            }
        }
        for (const current of grouped.values()) {
            const txField = txFieldForCommodity(current.commodity);
            if (txField) {
                current.distributed = localDistributed.get(`${current.scheme}|${txField}`) || 0;
            }
        }

        const previousMonth = this.previousMonth(year, month);
        const prevRows = previousMonth ? await this.getPreviousSummaryRows(fpsId, previousMonth.year, previousMonth.month) : [];
        const prevByKey = new Map(prevRows.map((row) => [`${row.scheme}|${row.commodity}`, row]));

        const summary: InventoryMonthlySummary[] = [];
        const order = Array.from(grouped.keys()).sort();
        for (const key of order) {
            const current = grouped.get(key)!;
            const previousRow = prevByKey.get(key);
            const openingStock = previousRow ? previousRow.closingStock : 0;
            const closingStock = openingStock + current.received - current.distributed;
            summary.push({
                fpsId,
                year,
                month,
                scheme: current.scheme,
                commodity: current.commodity,
                openingStock,
                receivedQty: current.received,
                distributedQty: current.distributed,
                closingStock,
                carriedForwardQty: closingStock,
                truckChitCount: current.truckChitCount,
                roCount: current.roCount,
            });
        }

        if (!summary.length && truckChitCount > 0) {
            for (let i = 0; i < truckChitCount; i++) {
                summary.push({
                    fpsId,
                    year,
                    month,
                    scheme: "UNKNOWN",
                    commodity: "UNKNOWN",
                    openingStock: 0,
                    receivedQty: 0,
                    distributedQty: 0,
                    closingStock: 0,
                    carriedForwardQty: 0,
                    truckChitCount: 1,
                    roCount: 1,
                });
            }
        }

        return summary;
    }

    private previousMonth(year: string, month: string): { year: string; month: string; } | null {
        const numericMonth = Number.parseInt(month, 10);
        if (numericMonth <= 1) {
            return { year: String(Number.parseInt(year, 10) - 1), month: "12" };
        }
        return { year, month: String(numericMonth - 1).padStart(2, "0") };
    }

    private async getPreviousSummaryRows(fpsId: string, year: string, month: string): Promise<InventoryMonthlySummary[]> {
        const data = await this.repo.getSummaryForMonth(fpsId, year, month);
        return data;
    }
}
