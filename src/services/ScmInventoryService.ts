import { fetchShopAllotment } from "../lib/scmApiClient";
import { afsoCodeFor, afsoNamesFor, ALLOTMENT_COMMODITIES, ALLOTMENT_PREFIX, ALLOTMENT_TYPES, allotmentToScmTxns, findShopAllotment, preferActualReceipts, replaceableCtypes } from "../lib/scmAllotment";
import { ScmInventoryRepository } from "../repositories/ScmInventoryRepository";
import { TransactionRepository } from "../repositories/TransactionRepository";
import { MonthLockRepository } from "../repositories/MonthLockRepository";
import { FpsDirectoryRepository } from "../repositories/FpsDirectoryRepository";
import { buildMonthSummary, transactionsInDateMonth } from "../lib/scmSummary";
import { currentIstYearMonth, monthsFrom, previousMonth } from "../lib/ids";
import type { ScmInventoryTransaction } from "../types";

export class ScmInventoryService {
    private readonly repo = new ScmInventoryRepository();
    private readonly txnRepo = new TransactionRepository();
    private readonly lockRepo = new MonthLockRepository();
    private readonly directoryRepo = new FpsDirectoryRepository();

    /**
     * Pulls this shop's allotment for every known commodity × allotment type
     * from the SCM portal, stores it as the month's received stock (replacing
     * earlier allotment rows for the month; real truck-chit rows are kept and
     * take precedence), then rebuilds the stock summary from this month on.
     */
    async syncAllotment(fpsId: string, year: string, month: string, distCode: string) {
        const afsoCode = afsoCodeFor(fpsId);
        // Names are only sent along with the codes (the portal answers by
        // code), so a directory lookup failure just leaves them blank.
        const directory = await this.directoryRepo.sampleByOffice(afsoCode).catch(() => []);
        const names = afsoNamesFor(afsoCode, directory);
        const jobs = ALLOTMENT_COMMODITIES.flatMap((c) => ALLOTMENT_TYPES.map((t) => ({ c, t })));

        const rows: ScmInventoryTransaction[] = [];
        const failures: string[] = [];
        const warnings: string[] = [];
        const failedCtypes = new Set<string>();
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
                        failedCtypes.add(t.ctype);
                    }
                })
            );
        }

        // Never replace a month's allotment with a partial set.
        if (failures.length > 0) {
            throw new Error(`SCM allotment sync incomplete (${failures.length} of ${jobs.length} requests failed): ${failures.join("; ")}`);
        }

        // Only types fetched completely are replaced; an optional type that
        // failed this time keeps the rows an earlier sync stored. New rows go
        // in first and only then are stale ones removed, so the month is never
        // left without allotment rows midway.
        const ctypes = replaceableCtypes(ALLOTMENT_TYPES.map((t) => t.ctype), failedCtypes);
        const keep = rows.filter((r) => ctypes.includes(r.truckChitNo.slice(ALLOTMENT_PREFIX.length)));
        await this.repo.upsertTransactions(keep);
        await this.repo.deleteStaleAllotmentRows(fpsId, year, month, ctypes, keep.map((r) => r.sourceIdentifier));
        await this.recomputeFrom(fpsId, year, month);
        const summary = await this.repo.getSummaryForMonth(fpsId, year, month);
        return { allotmentRows: keep.length, roCount: 0, truckChitCount: 0, summary, warnings };
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
