import test from 'node:test';
import assert from 'node:assert/strict';

import { parseStockRegisterJson } from '../src/lib/stockRegisterParser';
import { carryOverAllotment } from '../src/lib/schemeAllotment';
import { preferActualReceipts, replaceableCtypes } from '../src/lib/scmAllotment';
import { parseEposJson } from '../src/lib/eposJsonParser';
import { parseDailyTotals } from '../src/lib/dailyVerify';
import { withTimeout } from '../src/lib/ids';
import type { ScmInventoryTransaction } from '../src/types';

const regRow = { fpsId: '151209500212', commNameEn: 'Wheat', commMeasureUnit: 'Kgs', allottedQty: 0, ob: -257, receivedQty: 3370, extraRo: 0, sixaCase: 0, issuedQty: 3244, cb: -131 };

// #1 — an error reply must not look like "no stock".
test('parseStockRegisterJson unwraps {data:[...]} and throws on an error reply', () => {
    assert.equal(parseStockRegisterJson({ data: [regRow] }, '151209500212').length, 1);
    assert.throws(() => parseStockRegisterJson({ rep_code: 500, rep_message: 'Error' }, '151209500212'), /Error/);
    assert.throws(() => parseStockRegisterJson('oops', '151209500212'), /stock register/i);
    assert.deepEqual(parseStockRegisterJson([], '151209500212'), []);
});

// #2 — a failed allotment fetch keeps what was stored.
test('carryOverAllotment copies stored allotment onto freshly fetched entries', () => {
    const e = (commodity: string, alloted = 0, allotedByScheme: Record<string, number> = {}) =>
        ({ commodity, unit: 'Kgs', alloted, allotedByScheme, opening: 0, receivedRegular: 0, receivedExtra: 0, receivedMoved: 0, issued: 0, closing: 0 });
    const out = carryOverAllotment([e('Wheat'), e('Rice')], [e('Wheat', 3513, { PHH: 2358, AAY: 1155 })]);
    assert.deepEqual(out.map((x) => [x.commodity, x.alloted, x.allotedByScheme]), [
        ['Wheat', 3513, { PHH: 2358, AAY: 1155 }],
        ['Rice', 0, {}],
    ]);
});

// #3 — real receipts win only for their own scheme x commodity.
test('preferActualReceipts keeps allotment rows for keys without real receipts', () => {
    const row = (truckChitNo: string, scheme: string, commodity: string) => ({ truckChitNo, scheme, commodity } as ScmInventoryTransaction);
    const kept = preferActualReceipts([
        row('TC-REG-1', 'PHH', 'Wheat'),
        row('ALLOT-1', 'PHH', 'Wheat'),
        row('ALLOT-1', 'PHH', 'Rice'),
        row('ALLOT-1', 'AAY', 'FRice'),
        row('TC-REG-2', 'AAY', 'Rice'),
    ]);
    assert.deepEqual(kept.map((r) => `${r.truckChitNo}|${r.scheme}|${r.commodity}`), [
        'TC-REG-1|PHH|Wheat', 'ALLOT-1|PHH|Rice', 'TC-REG-2|AAY|Rice',
    ]);
});

// #4 — only allotment types fetched completely may be replaced.
test('replaceableCtypes lists the types whose every request succeeded', () => {
    assert.deepEqual(replaceableCtypes(['1', '2', '6'], new Set(['6'])), ['1', '2']);
    assert.deepEqual(replaceableCtypes(['1', '2'], new Set()), ['1', '2']);
});

// #5 — best-effort work gets a time budget.
test('withTimeout resolves to undefined when the work overruns its budget', async () => {
    assert.equal(await withTimeout(new Promise((r) => setTimeout(() => r('late'), 200)), 20), undefined);
    assert.equal(await withTimeout(Promise.resolve('ok'), 200), 'ok');
});

// #8 — a zero-quantity commodity is not a "new column".
test('parseEposJson ignores unknown commodities with zero quantity', () => {
    const { transactions, unknownColumns } = parseEposJson([{
        receiptId: '1', existingRcNumber: '2', schemeShortName: 'PHH', loginTime: '2026-11-25 10:34:18',
        commodityList: [{ comm_name_en: 'Wheat', sale_qty: 6 }, { comm_name_en: 'Maize', sale_qty: 0 }, { comm_name_en: 'Wheat-PMGKAY', sale_qty: null }],
    }]);
    assert.deepEqual(unknownColumns, []);
    assert.deepEqual(transactions[0].extraItems, {});
});

// #9 — the daily report reads commodity names the same way as the parser.
test('parseDailyTotals falls back from an empty comm_short to comm_name_en, then comm_id', () => {
    const [day] = parseDailyTotals([{ transdate: '06-11-2026', avilcards: '1', commoditylist: [
        { comm_short: '', comm_name_en: 'Wheat', sale_qty: 130.5 },
        { comm_short: null, comm_name_en: null, comm_id: 77, sale_qty: 2 },
    ] }]);
    assert.deepEqual(day.qty, { Wheat: 130.5, 'comm_id 77': 2 });
});
