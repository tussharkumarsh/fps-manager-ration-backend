import test from 'node:test';
import assert from 'node:assert/strict';

import { parseDailyTotals, summarizeDaily, compareDaily } from '../src/lib/dailyVerify';
import type { Transaction } from '../src/types';

// Shape of one day from the portal's Epos_Spring/fps/dateWiseTransDetails
// response (FPS 151209500212, 6 Nov 2026), trimmed to the fields that carry data.
const govDay = {
    date: null,
    avilcards: '16',
    transdate: '06-11-2026',
    transtime: '10:09:41',
    commoditylist: [
        { comm_short: 'Wheat', comm_name_en: null, sale_qty: 130.5 },
        { comm_short: 'Rice', comm_name_en: null, sale_qty: 164 },
        { comm_short: 'Sugar', comm_name_en: null, sale_qty: 12 },
        { comm_short: 'Jowar', comm_name_en: null, sale_qty: 130.5 },
    ],
};

function txn(srcNo: string, date: string, qty: Partial<Pick<Transaction, 'wheat' | 'rice' | 'sugar' | 'jowar' | 'saree'>>, extraItems: Record<string, number> = {}): Transaction {
    return {
        id: `${srcNo}-${date}`, slNo: 1, srcNo, scheme: 'PHH', availType: 'OTP', receiptNo: `${srcNo}-${date}`, date,
        wheat: 0, rice: 0, sugar: 0, saree: 0, jowar: 0, amount: 0, portability: 'Self', extraItems, ...qty,
    };
}

test('parseDailyTotals reads a portal day into ISO date, cards and canonical commodities', () => {
    assert.deepEqual(parseDailyTotals([govDay]), [
        { date: '2026-11-06', cards: 16, qty: { Wheat: 130.5, Rice: 164, Sugar: 12, Jowar: 130.5 } },
    ]);
    assert.equal(parseDailyTotals({ data: [govDay] }).length, 1);
    assert.deepEqual(parseDailyTotals(null), []);
});

test('summarizeDaily totals our sales per calendar day of the month, counting distinct cards', () => {
    const days = summarizeDaily(
        [
            txn('A', '2026-11-06 10:00', { wheat: 100, rice: 150 }),
            txn('A', '2026-11-06 12:00', { wheat: 30.5, rice: 14 }),
            txn('B', '2026-11-06 13:00', { sugar: 12 }, { Bajra: 2 }),
            txn('C', '2026-11-07 09:00', { jowar: 5 }),
            txn('D', '2026-10-31 09:00', { wheat: 9 }),
        ],
        '2026',
        '11'
    );
    assert.deepEqual(days, [
        { date: '2026-11-06', cards: 2, qty: { Wheat: 130.5, Rice: 164, Sugar: 12, Bajra: 2 } },
        { date: '2026-11-07', cards: 1, qty: { Jowar: 5 } },
    ]);
});

test('compareDaily matches equal days and flags each differing field, mismatches first', () => {
    const gov = [
        { date: '2026-11-06', cards: 16, qty: { Wheat: 130.5, Rice: 164 } },
        { date: '2026-11-07', cards: 3, qty: { Wheat: 10 } },
    ];
    const ours = [
        { date: '2026-11-06', cards: 16, qty: { Wheat: 130.504, Rice: 164, Sugar: 0 } },
        { date: '2026-11-07', cards: 2, qty: { Wheat: 8 } },
        { date: '2026-11-08', cards: 1, qty: { Rice: 4 } },
    ];
    const result = compareDaily(gov, ours);
    assert.equal(result.total, 3);
    assert.equal(result.matched, 1);
    assert.deepEqual(result.days.map((d) => [d.date, d.ok, d.diffs]), [
        ['2026-11-07', false, ['cards', 'Wheat']],
        ['2026-11-08', false, ['cards', 'Rice']],
        ['2026-11-06', true, []],
    ]);
    assert.equal(result.days[1].gov, null);
});
