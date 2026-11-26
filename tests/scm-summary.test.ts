import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMonthSummary, transactionsInDateMonth } from '../src/lib/scmSummary';
import type { InventoryMonthlySummary, ScmInventoryTransaction, Transaction } from '../src/types';

const base = { fpsId: '151209500212', year: '2026', month: '8', localDataSynced: true };

function scm(scheme: string, commodity: string, receivedQty: number, dispatchedQty = receivedQty): ScmInventoryTransaction {
    return {
        fpsId: base.fpsId, truckChitNo: 'TC-1', roNo: 'RO/1', year: base.year, month: base.month,
        scheme, commodity, unit: 'Kgs', allocatedQty: receivedQty, dispatchedQty, receivedQty,
        sourceIdentifier: `TC-1|${scheme}|${commodity}`,
    };
}

function local(scheme: 'PHH' | 'AAY', qty: Partial<Pick<Transaction, 'wheat' | 'rice' | 'sugar' | 'saree' | 'jowar'>>): Transaction {
    return {
        id: 'r', slNo: 1, srcNo: 's', scheme, availType: 'OTP', receiptNo: 'r', date: '2026-08-01 10:00',
        wheat: 0, rice: 0, sugar: 0, saree: 0, jowar: 0, amount: 0, portability: 'Self', ...qty,
    };
}

function prev(scheme: string, commodity: string, closingStock: number): InventoryMonthlySummary {
    return {
        fpsId: base.fpsId, year: '2026', month: '7', scheme, commodity, openingStock: 0,
        receivedQty: 0, distributedQty: 0, closingStock, truckChitCount: 0, roCount: 0,
    };
}

const findRow = (rows: InventoryMonthlySummary[], scheme: string, commodity: string) =>
    rows.find((r) => r.scheme === scheme && r.commodity === commodity);

test('carries previous closing into opening', () => {
    const rows = buildMonthSummary({
        ...base,
        scmTxns: [scm('PHH', 'Rice', 3066)],
        localTxns: [local('PHH', { rice: 3162 })],
        previous: [prev('PHH', 'Rice', -74)],
    });
    const row = findRow(rows, 'PHH', 'Rice')!;
    assert.equal(row.openingStock, -74);
    assert.equal(row.receivedQty, 3066);
    assert.equal(row.distributedQty, 3162);
    assert.equal(row.closingStock, -170);
});

test('continues the chain across the FRice→Rice rename', () => {
    const rows = buildMonthSummary({
        ...base,
        scmTxns: [scm('PHH', 'Rice', 5)],
        localTxns: [],
        previous: [prev('PHH', 'FRice', 10)],
    });
    assert.equal(rows.length, 1);
    const row = findRow(rows, 'PHH', 'Rice')!;
    assert.equal(row.openingStock, 10);
    assert.equal(row.closingStock, 15);
});

test('keeps a carried row with no receipts this month', () => {
    const rows = buildMonthSummary({
        ...base,
        scmTxns: [],
        localTxns: [local('AAY', { saree: 10 })],
        previous: [prev('AAY', 'SAREE', 80)],
    });
    const row = findRow(rows, 'AAY', 'SAREE')!;
    assert.deepEqual(
        [row.openingStock, row.receivedQty, row.distributedQty, row.closingStock],
        [80, 0, 10, 70]
    );
});

test('uses dispatchedQty for commodities without a local field', () => {
    const rows = buildMonthSummary({
        ...base,
        scmTxns: [scm('PHH', 'Bajra', 60, 50)],
        localTxns: [],
        previous: [],
    });
    const row = findRow(rows, 'PHH', 'Bajra')!;
    assert.equal(row.distributedQty, 50);
    assert.equal(row.closingStock, 10);
});

test('adds a row for local distribution with no receipts and no previous stock', () => {
    const rows = buildMonthSummary({
        ...base,
        scmTxns: [],
        localTxns: [local('AAY', { sugar: 35 })],
        previous: [],
    });
    const row = findRow(rows, 'AAY', 'Sugar')!;
    assert.equal(row.closingStock, -35);
});

test('drops previous rows that closed at zero and have no activity', () => {
    const rows = buildMonthSummary({ ...base, scmTxns: [], localTxns: [], previous: [prev('PHH', 'Wheat', 0)] });
    assert.deepEqual(rows, []);
});

test('falls back to dispatchedQty for tracked commodities when the month has no synced ePOS data', () => {
    const rows = buildMonthSummary({
        ...base,
        localDataSynced: false,
        scmTxns: [scm('PHH', 'FRice', 3140, 3140)],
        localTxns: [],
        previous: [prev('PHH', 'Rice', 20)],
    });
    const row = findRow(rows, 'PHH', 'Rice')!;
    assert.equal(row.distributedQty, 3140);
    assert.equal(row.closingStock, 20);
});

test('transactionsInDateMonth groups by the transaction date, not the allocation month', () => {
    const t = (date: string) => ({ ...local('PHH', { wheat: 1 }), date });
    const txns = [t('2026-04-11 09:48'), t('2026-05-02 10:00'), t('2026-06-28 11:12'), t('2026-06-01 08:00'), t('')];
    assert.equal(transactionsInDateMonth(txns, '2026', '4').length, 1);
    assert.equal(transactionsInDateMonth(txns, '2026', '5').length, 1);
    assert.equal(transactionsInDateMonth(txns, '2026', '6').length, 2);
    assert.equal(transactionsInDateMonth(txns, '2025', '6').length, 0);
});
