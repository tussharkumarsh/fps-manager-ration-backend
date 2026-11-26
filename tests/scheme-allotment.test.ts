import test from 'node:test';
import assert from 'node:assert/strict';

import { parseSchemeAllotment, withAllotment } from '../src/lib/schemeAllotment';
import { ALLOTMENT_COMMODITIES } from '../src/lib/scmAllotment';

// Trimmed shape of Epos_Spring/SchemeAllotment/get_Scheme_Allot_FPS's
// response (Hingoli mandal, Nov 2026, type REG): one row per shop.
const shop = (fps_id: string, wheat: number) => ({
    dist_code: '1512', afso_code: '1512095', fps_id, fps_name: 'NA', total_cards: 400, total_units: 1494, month: 11, year: 2026,
    c_lst: [
        { comm_name_en: 'Wheat', comm_id: 1, qty_1: wheat },
        { comm_name_en: 'Rice', comm_id: 2, qty_1: 2958 },
        { comm_name_en: 'SAREE', comm_id: 10, qty_1: 0 },
        { comm_name_en: 'FRice', comm_id: 98, qty_1: 5 },
        { comm_name_en: 'Jowar', comm_id: 91, qty_1: null },
    ],
    s_lst: null,
});
const response = { rep_code: '200', rep_message: 'Success', data: [shop('151209500001', 2343.5), shop('151209500212', 4700)] };

test('parseSchemeAllotment picks this shop and totals its allotment per canonical commodity', () => {
    assert.deepEqual(parseSchemeAllotment(response, '151209500212'), {
        cards: 400,
        units: 1494,
        qty: { Wheat: 4700, Rice: 2963, SAREE: 0, Jowar: 0 },
    });
});

test('parseSchemeAllotment returns null when the shop is absent or there is no data', () => {
    assert.equal(parseSchemeAllotment(response, '151209599999'), null);
    assert.equal(parseSchemeAllotment({ rep_code: '204', rep_message: 'No data found' }, '151209500212'), null);
});

test('SCM allotment sync covers every commodity the portal lists', () => {
    assert.deepEqual(ALLOTMENT_COMMODITIES.map((c) => [c.commId, c.label]), [
        ['1', 'Wheat (Kgs)'], ['2', 'Rice (Kgs)'], ['4', 'Sugar (Kgs)'], ['10', 'SAREE (PKTS)'],
        ['90', 'Maize (Kgs)'], ['91', 'Jowar (Kgs)'], ['93', 'Ragi (Kgs)'], ['98', 'FRice (Kgs)'],
    ]);
});

test('withAllotment fills the register allotment by commodity and leaves others untouched', () => {
    const e = (commodity: string, alloted = 0) => ({ commodity, unit: 'Kgs', alloted, opening: 0, receivedRegular: 0, receivedExtra: 0, receivedMoved: 0, issued: 0, closing: 0 });
    const out = withAllotment([e('Wheat'), e('Wheat-PMGKAY', 7), e('Rice')], { Wheat: 4700, Rice: 2963 });
    assert.deepEqual(out.map((x) => [x.commodity, x.alloted]), [['Wheat', 4700], ['Wheat-PMGKAY', 7], ['Rice', 2963]]);
    assert.deepEqual(withAllotment([e('Wheat', 3)], null).map((x) => x.alloted), [3]);
});
