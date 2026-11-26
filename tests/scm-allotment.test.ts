import test from 'node:test';
import assert from 'node:assert/strict';

import {
    afsoCodeFor,
    ALLOTMENT_TYPES,
    allotmentToScmTxns,
    findShopAllotment,
    preferActualReceipts,
} from '../src/lib/scmAllotment';
import type { ScmInventoryTransaction } from '../src/types';

// Trimmed shape of scm_spring/api/KeyRegister/get_fps_keyreg_allot's
// response: one row per shop in the mandal, the shop id in fpshop_address.
const response = {
    rep_code: '200',
    rep_message: 'Success',
    heading: 'Detailed Allotment for Wheat (Kgs) in Hingoli/HINGOLI - November 2026',
    data: [
        { fpshop_address: '151209500001', schemelist: { PHH: 1243.5, AAY: 1100, NER: 0 } },
        { fpshop_address: '151209500212', schemelist: { PHH: 3066, AAY: 1034, NER: 0 } },
    ],
};

test('afsoCodeFor takes the mandal code from the first 7 digits of the FPS id', () => {
    assert.equal(afsoCodeFor('151209500212'), '1512095');
});

test('the six allotment types are numbered 1..6 as on the portal', () => {
    assert.deepEqual(ALLOTMENT_TYPES.map((t) => [t.ctype, t.name]), [
        ['1', 'REGULAR'], ['2', 'EXTRA'], ['3', 'PORT'], ['4', 'ADVANCE'], ['5', 'ADHOC'], ['6', 'EXTRA PERCENTAGE'],
    ]);
});

test('findShopAllotment picks this shop out of the mandal list', () => {
    assert.deepEqual(findShopAllotment(response, '151209500212'), { PHH: 3066, AAY: 1034, NER: 0 });
    assert.equal(findShopAllotment(response, '151209599999'), null);
    assert.equal(findShopAllotment({ data: [] }, '151209500212'), null);
});

test('findShopAllotment throws on a non-success response', () => {
    assert.throws(() => findShopAllotment({ rep_code: '500', rep_message: 'Error' }, '151209500212'), /Error/);
});

test('allotmentToScmTxns turns non-zero schemes into received rows keyed by type', () => {
    const rows = allotmentToScmTxns({
        fpsId: '151209500212', year: '2026', month: '11', ctype: '3', commodity: 'Wheat', unit: 'Kgs',
        allotment: { PHH: 3066, AAY: 0, NER: 0 },
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].scheme, 'PHH');
    assert.equal(rows[0].commodity, 'Wheat');
    assert.equal(rows[0].receivedQty, 3066);
    assert.equal(rows[0].dispatchedQty, 3066);
    assert.equal(rows[0].truckChitNo, 'ALLOT-3');
    assert.equal(rows[0].sourceIdentifier, 'ALLOT|151209500212|2026|11|3|Wheat|PHH');
});

test('preferActualReceipts ignores allotment rows when the month has real truck-chit receipts', () => {
    const row = (truckChitNo: string) => ({ truckChitNo } as ScmInventoryTransaction);
    assert.deepEqual(preferActualReceipts([row('TC-REG-1'), row('ALLOT-1')]).map((r) => r.truckChitNo), ['TC-REG-1']);
    assert.deepEqual(preferActualReceipts([row('ALLOT-1'), row('ALLOT-3')]).map((r) => r.truckChitNo), ['ALLOT-1', 'ALLOT-3']);
});

test('findShopAllotment treats "No data found" as no allotment, not an error', () => {
    assert.equal(findShopAllotment({ rep_code: '204', rep_message: 'No data found' }, '151209500212'), null);
    assert.equal(findShopAllotment({ rep_code: '500', rep_message: 'No Data Found.' }, '151209500212'), null);
});
