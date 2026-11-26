import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseEposJson } from '../src/lib/eposJsonParser';

// One real record from the portal's Epos_Spring/fps/fpstransactionwitoutcatptcha
// response (FPS 151209500212, Nov 2026), trimmed to the fields that carry data.
const fixture = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'epos-transactions-2026-11.json'), 'utf8'));

const baseRecord = fixture[0];
const withCommodities = (list: { comm_name_en: string; sale_qty: number | null }[]) => ({
    ...baseRecord,
    commodityList: list.map((c) => ({ ...baseRecord.commodityList[0], ...c })),
});

test('parseEposJson maps a portal record to a Transaction', () => {
    const { transactions, unknownColumns } = parseEposJson(fixture);
    assert.deepEqual(unknownColumns, []);
    assert.deepEqual(transactions, [
        {
            id: '2564329493468023660',
            slNo: 1,
            srcNo: '272033297164',
            scheme: 'PHH',
            availType: 'OTP',
            receiptNo: '2564329493468023660',
            date: '2026-11-25 10:34',
            wheat: 6,
            rice: 8,
            sugar: 0,
            saree: 0,
            jowar: 6,
            amount: 0,
            portability: 'Self',
            authTransTime: '00.846',
            extraItems: {},
        },
    ]);
});

test('parseEposJson accepts the list wrapped in an object', () => {
    assert.equal(parseEposJson({ data: fixture }).transactions.length, 1);
});

test('parseEposJson keeps unknown commodities in extraItems and normalizes known names', () => {
    const { transactions, unknownColumns } = parseEposJson([
        withCommodities([
            { comm_name_en: 'FRice', sale_qty: 5 },
            { comm_name_en: 'Saree Kit', sale_qty: 1 },
            { comm_name_en: 'Bajra', sale_qty: 2 },
            { comm_name_en: 'Toor Dal', sale_qty: null },
        ]),
    ]);
    const t = transactions[0];
    assert.equal(t.rice, 5);
    assert.equal(t.saree, 1);
    // Toor Dal sold 0 here: not a new column, not stored.
    assert.deepEqual(t.extraItems, { Bajra: 2 });
    assert.deepEqual(unknownColumns, ['Bajra']);
});

test('parseEposJson maps auth types to OTP / IRIS / Authenticated', () => {
    const types = ['Aadhaar OTP', 'IRIS', 'Aadhaar Authentication', 'Biometric'].map(
        (auth_type) => parseEposJson([{ ...baseRecord, auth_type }]).transactions[0].availType
    );
    assert.deepEqual(types, ['OTP', 'IRIS', 'Authenticated', 'Authenticated']);
});

test('parseEposJson returns no rows for an empty month', () => {
    assert.deepEqual(parseEposJson([]).transactions, []);
    assert.deepEqual(parseEposJson(null).transactions, []);
});

test('parseEposJson throws when records lack a receipt id', () => {
    assert.throws(() => parseEposJson([{ foo: 1 }]), /receiptId/);
});

test('parseEposJson falls back to comm_short, then comm_id, and never drops a quantity', () => {
    const record = {
        ...baseRecord,
        commodityList: [
            { comm_name_en: null, comm_short: 'Sugar', comm_id: 4, sale_qty: 1 },
            { comm_name_en: null, comm_short: null, comm_id: 77, sale_qty: 3 },
            { comm_name_en: '', comm_short: '', comm_id: 0, sale_qty: 0 },
        ],
    };
    const { transactions, unknownColumns } = parseEposJson([record]);
    assert.equal(transactions[0].sugar, 1);
    assert.deepEqual(transactions[0].extraItems, { 'comm_id 77': 3 });
    assert.deepEqual(unknownColumns, ['comm_id 77']);
});
