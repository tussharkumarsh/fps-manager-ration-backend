import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeCommodity, txFieldForCommodity } from '../src/lib/commodity';
import { currentIstYearMonth } from '../src/lib/ids';

test('normalizeCommodity canonicalizes rice and saree variants', () => {
    assert.equal(normalizeCommodity('FRice'), 'Rice');
    assert.equal(normalizeCommodity(' fortified rice '), 'Rice');
    assert.equal(normalizeCommodity('F.Rice'), 'Rice');
    assert.equal(normalizeCommodity('Saree Kit'), 'SAREE');
    assert.equal(normalizeCommodity('wheat'), 'Wheat');
    assert.equal(normalizeCommodity(' Bajra '), 'Bajra');
});

test('txFieldForCommodity maps FRice to rice and unknown to null', () => {
    assert.equal(txFieldForCommodity('FRice'), 'rice');
    assert.equal(txFieldForCommodity('SAREE'), 'saree');
    assert.equal(txFieldForCommodity('Bajra'), null);
});

test('currentIstYearMonth uses Asia/Kolkata', () => {
    assert.deepEqual(currentIstYearMonth(new Date('2026-11-30T20:00:00Z')), { year: '2026', month: '12' });
    assert.deepEqual(currentIstYearMonth(new Date('2026-11-30T18:00:00Z')), { year: '2026', month: '11' });
    assert.deepEqual(currentIstYearMonth(new Date('2026-12-31T19:00:00Z')), { year: '2027', month: '1' });
});
