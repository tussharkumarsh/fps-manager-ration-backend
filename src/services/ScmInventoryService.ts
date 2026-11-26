import { ScmApiClient } from "../lib/scmApiClient";
import { ScmInventoryRepository } from "../repositories/ScmInventoryRepository";
import { TransactionRepository } from "../repositories/TransactionRepository";
import { MonthLockRepository } from "../repositories/MonthLockRepository";
import { buildMonthSummary } from "../lib/scmSummary";
import { currentIstYearMonth, previousMonth } from "../lib/ids";
import type { ScmInventoryTransaction, ScmRoRecord, ScmTruckChitRecord } from "../types";

export class ScmInventoryService {
    private readonly repo = new ScmInventoryRepository();
    private readonly api = new ScmApiClient();
    private readonly txnRepo = new TransactionRepository();
    private readonly lockRepo = new MonthLockRepository();

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

        // Recompute this month (from everything stored for it, not just this
        // batch) and every later month, since each month's opening is the
        // previous month's closing.
        await this.recomputeFrom(fpsId, year, month);
        const summary = await this.repo.getSummaryForMonth(fpsId, year, month);

        return {
            roCount: roRecords.length,
            truckChitCount: truckChits.length,
            summary,
            transactions,
        };
    }

    private buildTruckChitPattern(roNo: string): string {
        const formatted = roNo.replace(/^RO\//, "").replace(/\//g, "-");
        return `TC-${formatted}`;
    }

    async recomputeYear(fpsId: string, year: string): Promise<void> {
        await this.recomputeFrom(fpsId, year, "1");
    }

    /**
     * Rebuilds the stored summary for fromMonth through the last month of
     * the year (or the current IST month, for the current year), in order,
     * so each month opens with the previous month's closing. Uses data
     * already stored from SCM and ePOS syncs — no portal fetch.
     */
    async recomputeFrom(fpsId: string, year: string, fromMonth: string): Promise<void> {
        const now = currentIstYearMonth();
        if (Number(year) > Number(now.year)) return;
        const lastMonth = year === now.year ? Number(now.month) : 12;
        const start = Number(fromMonth);

        const before = previousMonth(year, String(start));
        let previous = await this.repo.getSummaryForMonth(fpsId, before.year, before.month);

        for (let m = start; m <= lastMonth; m++) {
            const month = String(m);
            const [scmTxns, localTxns] = await Promise.all([
                this.repo.getMonthTransactions(fpsId, year, month),
                this.txnRepo.getForMonth(fpsId, year, month),
            ]);
            // A month counts as ePOS-synced once it has a lock row or any stored
            // transaction; otherwise its distribution is unknown, not zero.
            const localDataSynced = localTxns.length > 0 || (await this.lockRepo.get(fpsId, year, month)) !== null;
            const summary = buildMonthSummary({ fpsId, year, month, localDataSynced, scmTxns, localTxns, previous });
            await this.repo.replaceSummaryRows(fpsId, year, month, summary);
            previous = summary;
        }
    }
}
