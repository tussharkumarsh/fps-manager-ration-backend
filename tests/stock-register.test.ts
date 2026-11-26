import test from 'node:test';
import assert from 'node:assert/strict';

import { parseStockRegisterJson } from '../src/lib/stockRegisterParser';

// One row of Epos_Spring/fps/getfpsStockregister's response
// (FPS 151209500212, Nov 2026), as returned by the portal.
const wheat = {
    distNameEn: 'Hingoli', distCode: '1512', afso_name_en: 'HINGOLI', afsoCode: '1512095', fpsId: '151209500212',
    commNameEn: 'Wheat', commId: '1', commMeasureUnit: 'Kgs',
    allottedQty: 0, ob: -257, receivedQty: 3370, extraRo: 0, sixaCase: 0, issuedQty: 3244, cb: -131,
    refreshTime: '2026-11-26 16:43:03.932005+05:30', scheme_id: null, scheme_short_name: null,
    prevMonth: 0, curntMonth: 3370, type: null, futrMonth: 0, fpsStatus: null, shopType: null,
};

test('parseStockRegisterJson maps a portal row to a stock register entry', () => {
    assert.deepEqual(parseStockRegisterJson([wheat], '151209500212'), [
        {
            commodity: 'Wheat', unit: 'Kgs', alloted: 0, opening: -257,
            receivedRegular: 3370, receivedExtra: 0, receivedMoved: 0, issued: 3244, closing: -131,
        },
    ]);
});

test('parseStockRegisterJson normalizes commodity names and keeps only this FPS', () => {
    const rows = parseStockRegisterJson(
        [
            { ...wheat, commNameEn: 'FRice', commMeasureUnit: 'Kgs', ob: 1, receivedQty: 2, issuedQty: 3, cb: 0 },
            { ...wheat, fpsId: '151209500228' },
            { ...wheat, commNameEn: 'SAREE', commMeasureUnit: 'PKTS', extraRo: 5, sixaCase: 1 },
        ],
        '151209500212'
    );
    assert.deepEqual(rows.map((r) => [r.commodity, r.unit, r.receivedExtra, r.receivedMoved]), [
        ['Rice', 'Kgs', 0, 0],
        ['SAREE', 'PKTS', 5, 1],
    ]);
});

test('parseStockRegisterJson returns nothing for an empty month', () => {
    assert.deepEqual(parseStockRegisterJson([], '151209500212'), []);
    // A null body is not an empty month (that comes as []): it must not wipe stored data.
    assert.throws(() => parseStockRegisterJson(null, '151209500212'));
});
