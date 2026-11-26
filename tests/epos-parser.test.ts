import test from 'node:test';
import assert from 'node:assert/strict';

import { parseEposHtml, parseEposReport } from '../src/lib/eposParser';

// Mirrors the live report's two-row <thead>: row A has the leading columns,
// a colspan "Qty in Kgs" placeholder and the trailing columns; row B has the
// commodity labels.
function report(commodities: string[], qtys: string[]): string {
    return `
    <table id="Report">
      <thead>
        <tr>
          <th rowspan="2">Sl No</th><th rowspan="2">SRC No</th><th rowspan="2">Scheme</th>
          <th rowspan="2">Avail Type</th><th rowspan="2">Receipt No</th><th rowspan="2">Date</th>
          <th colspan="${commodities.length}">Qty in Kgs</th>
          <th rowspan="2">Amount</th><th rowspan="2">Portability</th><th rowspan="2">Auth Trans Time</th>
        </tr>
        <tr>${commodities.map((c) => `<th>${c}</th>`).join('')}</tr>
      </thead>
      <tbody>
        <tr>
          <td>1</td><td>272025965612</td><td>PHH</td><td>OTP</td><td>2564242562065505803</td><td>2026-08-30 12:16</td>
          ${qtys.map((q) => `<td>${q}</td>`).join('')}
          <td>0.00</td><td>Self</td><td>00.1111</td>
        </tr>
      </tbody>
    </table>`;
}

test('parseEposHtml maps Wheat/Rice/Sugar/SAREE/Jowar to the correct fields, in that column order', () => {
    const rows = parseEposHtml(report(['Wheat', 'Rice', 'Sugar', 'SAREE', 'Jowar'], ['6.000', '6.000', '0.000', '0.000', '3.000']));
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0], {
        id: '2564242562065505803',
        slNo: 1,
        srcNo: '272025965612',
        scheme: 'PHH',
        availType: 'OTP',
        receiptNo: '2564242562065505803',
        date: '2026-08-30 12:16',
        wheat: 6,
        rice: 6,
        sugar: 0,
        saree: 0,
        jowar: 3,
        amount: 0,
        portability: 'Self',
        authTransTime: '00.1111',
        extraItems: {},
    });
});

test('parseEposReport stores an unknown commodity column in extraItems', () => {
    const { transactions, unknownColumns } = parseEposReport(
        report(['Wheat', 'Rice', 'Bajra', 'Jowar'], ['5.000', '10.000', '2.000', '3.000'])
    );
    assert.deepEqual(unknownColumns, ['Bajra']);
    assert.equal(transactions.length, 1);
    const t = transactions[0];
    assert.deepEqual(t.extraItems, { Bajra: 2 });
    assert.equal(t.wheat, 5);
    assert.equal(t.rice, 10);
    assert.equal(t.jowar, 3);
    assert.equal(t.amount, 0);
    assert.equal(t.portability, 'Self');
});

test('parseEposReport throws when the commodity header cannot be read', () => {
    const headerless = `
    <table id="Report"><tbody>
      <tr><td>1</td><td>272025965612</td><td>PHH</td><td>OTP</td><td>2564242562065505803</td><td>2026-08-30 12:16</td>
      <td>6.000</td><td>6.000</td><td>0.000</td><td>0.000</td><td>3.000</td><td>0.00</td><td>Self</td><td>00.1111</td></tr>
    </tbody></table>`;
    assert.throws(() => parseEposReport(headerless), /header/i);
});

test('parseEposReport returns no rows and no error for a month with no transactions', () => {
    const { transactions } = parseEposReport('<html><body>No Records Found</body></html>');
    assert.deepEqual(transactions, []);
});

test('parseEposReport accepts a month whose header has no Wheat or Rice column', () => {
    const { transactions } = parseEposReport(report(['Sugar', 'Jowar'], ['1.000', '4.000']));
    assert.equal(transactions.length, 1);
    assert.equal(transactions[0].sugar, 1);
    assert.equal(transactions[0].jowar, 4);
    assert.equal(transactions[0].wheat, 0);
    assert.equal(transactions[0].portability, 'Self');
});
