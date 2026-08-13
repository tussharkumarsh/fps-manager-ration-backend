import test from 'node:test';
import assert from 'node:assert/strict';

import {
    parseMonthlyRoListHtml,
    parseTruckChitHtml,
    buildMonthlySummaryRows,
} from '../src/lib/scmParser';

const januaryListHtml = `
<table>
  <tr class="tableheader"><td colspan="5"><b>List of ROs for FPS 151209500212 for January'2026</b></td></tr>
  <tr bgcolor="skyblue"><td>Sl #</td><td>RO(s) Generated</td><td>RO(s) date</td><td>RO(s) Time</td><td>Dispatched</td></tr>
  <tr><td>1</td><td><a href="javascript:void(0);">RO/REG/1512/151209500212/01/2026/1</a><input type="hidden" name="tdronon" value="RO/REG/1512/151209500212/01/2026/1"></td><td>07-01-2026<input type="hidden" name="tdrdaten" value="2026-01-07"></td><td>20:15 PM</td><td>yes<input type="hidden" name="tdsdstatusn" value="yes"></td></tr>
  <tr><td>2</td><td><a href="javascript:void(0);">RO/REG/1512/151209500212/01/2026/2</a><input type="hidden" name="tdronon" value="RO/REG/1512/151209500212/01/2026/2"></td><td>08-01-2026<input type="hidden" name="tdrdaten" value="2026-01-08"></td><td>13:08 PM</td><td>yes<input type="hidden" name="tdsdstatusn" value="yes"></td></tr>
  <input type="hidden" name="trosizen" value="2">
</table>`;

const januaryTruckHtml = `
<table>
  <tr bgcolor="lightgreen"><td align="center" colspan="8"><b>TruckChit Details (TC-REG-1512-151209500212-01-2026-1) </b></td></tr>
  <tr bgcolor="#99CCFF"><td colspan="3">Truck No:MH22548</td><td colspan="5">Dispatch Date : 07-01-2026 09:54:17 PM</td></tr>
  <tr bgcolor="skyblue"><td align="center">Scheme</td><td align="center">Commodity</td><td align="center">Unit</td><td colspan="2" align="center">Alloted Quantity</td><td colspan="2" align="center">Dispatched Qty</td></tr>
  <tr><td>AAY</td><td>FRice</td><td>Kgs</td><td colspan="2" align="right">1352.000</td><td colspan="2" align="right">1222.000</td></tr>
  <tr><td>PHH</td><td>FRice</td><td>Kgs</td><td colspan="2" align="right">3066.000</td><td colspan="2" align="right">2975.000</td></tr>
  <tr bgcolor="red"><td bgcolor="lightgreen" colspan="8" align="center"><b>Received</b></td></tr>
  <tr bgcolor="#99CCFF"><td colspan="4">Rec Date: 08-01-2026</td><td colspan="4">Rec Time: 07:06:43 PM</td></tr>
  <tr bgcolor="#99CCFF"><td align="center">Scheme</td><td align="center">Commodity</td><td colspan="1" align="center">Unit</td><td colspan="2" align="center">Dispatch Qty</td><td colspan="2" align="center">Received Qty</td></tr>
  <tr><td align="left">AAY</td><td align="left">FRice</td><td align="left" colspan="1">Kgs</td><td align="right" colspan="2">1222.000</td><td align="right" colspan="2">1222.000</td></tr>
  <tr><td align="left">PHH</td><td align="left">FRice</td><td align="left" colspan="1">Kgs</td><td align="right" colspan="2">2975.000</td><td align="right" colspan="2">2975.000</td></tr>
</table>`;

test('parseMonthlyRoListHtml detects every RO and sequence', () => {
    const rows = parseMonthlyRoListHtml(januaryListHtml, { shopNo: '151209500212', districtCode: '1512', districtName: 'Hingoli', year: '2026', month: '1' });
    assert.equal(rows.length, 2);
    assert.equal(rows[0].roNo, 'RO/REG/1512/151209500212/01/2026/1');
    assert.equal(rows[1].sequenceNo, 2);
});

test('parseTruckChitHtml extracts dispatch and receipt quantities by scheme and commodity', () => {
    const rows = parseTruckChitHtml(januaryTruckHtml, {
        truckChitNo: 'TC-REG-1512-151209500212-01-2026-1',
        roNo: 'RO/REG/1512/151209500212/01/2026/1',
        month: '1',
        year: '2026',
        districtCode: '1512',
    });

    assert.equal(rows.length, 2);
    assert.deepEqual(rows[0], {
        truckChitNo: 'TC-REG-1512-151209500212-01-2026-1',
        roNo: 'RO/REG/1512/151209500212/01/2026/1',
        month: '1',
        year: '2026',
        districtCode: '1512',
        scheme: 'AAY',
        commodity: 'FRice',
        unit: 'Kgs',
        allocatedQty: 1352,
        dispatchedQty: 1222,
        receivedQty: 1222,
        transactionDate: '2026-01-08',
        dispatchDate: '2026-01-07',
        sourceIdentifier: 'TC-REG-1512-151209500212-01-2026-1|AAY|FRice',
    });
});

test('buildMonthlySummaryRows applies carry-forward by scheme and commodity', () => {
    const rows = buildMonthlySummaryRows([
        { year: '2026', month: '1', scheme: 'AAY', commodity: 'Rice', openingStock: 0, receivedQty: 100, distributedQty: 30, closingStock: 70, carriedForwardQty: 70 },
        { year: '2026', month: '1', scheme: 'PHH', commodity: 'Rice', openingStock: 0, receivedQty: 80, distributedQty: 20, closingStock: 60, carriedForwardQty: 60 },
        { year: '2026', month: '2', scheme: 'AAY', commodity: 'Rice', openingStock: 70, receivedQty: 50, distributedQty: 40, closingStock: 80, carriedForwardQty: 80 },
        { year: '2026', month: '2', scheme: 'PHH', commodity: 'Rice', openingStock: 60, receivedQty: 20, distributedQty: 14, closingStock: 66, carriedForwardQty: 66 },
    ]);

    assert.equal(rows[0].openingStock, 0);
    assert.equal(rows[2].openingStock, 70);
    assert.equal(rows[3].openingStock, 60);
    assert.equal(rows[3].closingStock, 66);
});
