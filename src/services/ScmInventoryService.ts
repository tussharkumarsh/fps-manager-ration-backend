import { ScmApiClient, fetchShopAllotment } from "../lib/scmApiClient";
import { afsoCodeFor, AFSO_NAMES, ALLOTMENT_COMMODITIES, ALLOTMENT_TYPES, allotmentToScmTxns, findShopAllotment, preferActualReceipts } from "../lib/scmAllotment";
import { ScmInventoryRepository } from "../repositories/ScmInventoryRepository";
import { TransactionRepository } from "../repositories/TransactionRepository";
import { MonthLockRepository } from "../repositories/MonthLockRepository";
import { buildMonthSummary, transactionsInDateMonth } from "../lib/scmSummary";
import { currentIstYearMonth, monthsFrom, previousMonth } from "../lib/ids";
import type { ScmInventoryTransaction, ScmRoRecord, ScmTruckChitRecord } from "../types";

export class ScmInventoryService {
    private readonly repo = new ScmInventoryRepository();
    private readonly api = new ScmApiClient();
    private readonly txnRepo = new TransactionRepository();
    private readonly lockRepo = new MonthLockRepository();

    /**
     * Pulls this shop's allotment for every known commodity × allotment type
     * from the SCM portal, stores it as the month's received stock (replacing
     * earlier allotment rows for the month; real truck-chit rows are kept and
     * take precedence), then rebuilds the stock summary from this month on.
     */
    async syncAllotment(fpsId: string, year: string, month: string, distCode: string) {
        const afsoCode = afsoCodeFor(fpsId);
        const names = AFSO_NAMES[afsoCode] ?? { distName: "", afsoName: "" };
        const jobs = ALLOTMENT_COMMODITIES.flatMap((c) => ALLOTMENT_TYPES.map((t) => ({ c, t })));

        const rows: ScmInventoryTransaction[] = [];
        const failures: string[] = [];
        const warnings: string[] = [];
        // A few requests at a time: each returns the whole mandal, and the
        // portal is slow and occasionally errors.
        for (let i = 0; i < jobs.length; i += 12) {
            await Promise.all(
                jobs.slice(i, i + 12).map(async ({ c, t }) => {
                    try {
                        const body = await fetchShopAllotment({
                            distCode,
                            distName: names.distName,
                            afsoCode,
                            afsoName: names.afsoName,
                            commId: c.commId,
                            commName: c.label,
                            ctype: t.ctype,
                            month,
                            year,
                        });
                        const allotment = findShopAllotment(body, fpsId);
                        if (allotment) {
                            rows.push(...allotmentToScmTxns({ fpsId, year, month, ctype: t.ctype, commodity: c.name, unit: c.unit, allotment }));
                        }
                    } catch (err) {
                        const msg = `${c.name}/${t.name}: ${err instanceof Error ? err.message : String(err)}`;
                        (t.optional ? warnings : failures).push(msg);
                    }
                })
            );
        }

        // Never replace a month's allotment with a partial set.
        if (failures.length > 0) {
            throw new Error(`SCM allotment sync incomplete (${failures.length} of ${jobs.length} requests failed): ${failures.join("; ")}`);
        }

        await this.repo.deleteAllotmentRows(fpsId, year, month);
        await this.repo.upsertTransactions(rows);
        await this.recomputeFrom(fpsId, year, month);
        const summary = await this.repo.getSummaryForMonth(fpsId, year, month);
        return { allotmentRows: rows.length, roCount: 0, truckChitCount: 0, summary, warnings };
    }

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
     * Rebuilds the stored summary for (year, fromMonth) through the current
     * IST month — crossing into later years, so a December change reaches
     * the next January — in order, so each month opens with the previous
     * month's closing. Uses data already stored from SCM and ePOS syncs — no
     * portal fetch.
     */
    async recomputeFrom(fpsId: string, year: string, fromMonth: string): Promise<void> {
        const months = monthsFrom(year, fromMonth, currentIstYearMonth());
        if (months.length === 0) return;

        const before = previousMonth(year, String(Number(fromMonth)));
        let previous = await this.repo.getSummaryForMonth(fpsId, before.year, before.month);
        // Sales are counted in the month of their own date (see
        // transactionsInDateMonth), so one allocation month's sync can feed
        // several calendar months — load the dealer's sales once.
        const allLocalTxns = await this.txnRepo.getAll(fpsId);

        for (const { year, month } of months) {
            const scmTxns = preferActualReceipts(await this.repo.getMonthTransactions(fpsId, year, month));
            const localTxns = transactionsInDateMonth(allLocalTxns, year, month);
            // A month counts as ePOS-synced once it has a lock row or any sale
            // dated in it; otherwise its distribution is unknown, not zero.
            const localDataSynced = localTxns.length > 0 || (await this.lockRepo.get(fpsId, year, month)) !== null;
            const summary = buildMonthSummary({ fpsId, year, month, localDataSynced, scmTxns, localTxns, previous });
            await this.repo.replaceSummaryRows(fpsId, year, month, summary);
            previous = summary;
        }
    }
}
