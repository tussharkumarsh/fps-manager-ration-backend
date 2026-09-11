import * as cheerio from "cheerio";
import type { Transaction, GovStockRegisterEntry } from "../types";

// The government table's <thead> has TWO header rows, not one:
//   row A: Sl No, SRC No, Scheme, Avail Type, Receipt No, Date (rowspan=2),
//          a single "Qty in Kgs" cell spanning N commodity columns,
//          then Amount, Portability, Auth Trans Time (rowspan=2)
//   row B: the N leaf labels for the "Qty in Kgs" group — e.g. Wheat, Rice,
//          Sugar, Jowar for shops with no Saree column; other shops may have
//          a different set/count (a Saree column instead of/alongside Jowar).
// So no single row contains both "Wheat" and "Portability" text, and the
// column position of each commodity has to be read from row B while the
// leading (6) and trailing (Amount/Portability/Auth Trans Time) columns are
// read from row A around its colspan placeholder.
function labelIndex(cells: { text: string }[], label: string): number {
  return cells.findIndex((c) => c.text.toUpperCase().includes(label.toUpperCase()));
}

export function parseEposHtml(html: string): Transaction[] {
  const $ = cheerio.load(html);
  const transactions: Transaction[] = [];

  const LEADING = 6;
  let wheatIdx = -1, riceIdx = -1, sugarIdx = -1, sareeIdx = -1, jowarIdx = -1;
  let amountIdx = -1, portabilityIdx = -1, authTimeIdx = -1;
  let hasHeaderMap = false;

  const theadRows = $("#Report thead tr").toArray();
  if (theadRows.length >= 2) {
    const subHeaderRow = theadRows[theadRows.length - 1];
    const upperRow = theadRows[theadRows.length - 2];
    const subCells = $(subHeaderRow)
      .find("th, td")
      .toArray()
      .map((c) => ({ text: $(c).text().trim() }));
    const upperCells = $(upperRow)
      .find("th, td")
      .toArray()
      .map((c) => ({ text: $(c).text().trim() }));
    // upperRow = 6 leading cells + 1 "Qty in Kgs" placeholder + trailing cells.
    const trailingCells = upperCells.slice(LEADING + 1);

    const w = labelIndex(subCells, "Wheat");
    const r = labelIndex(subCells, "Rice");
    const s = labelIndex(subCells, "Sugar");
    const sa = labelIndex(subCells, "SAREE");
    const j = labelIndex(subCells, "Jowar");
    if (w !== -1) wheatIdx = LEADING + w;
    if (r !== -1) riceIdx = LEADING + r;
    if (s !== -1) sugarIdx = LEADING + s;
    if (sa !== -1) sareeIdx = LEADING + sa;
    if (j !== -1) jowarIdx = LEADING + j;

    const trailingStart = LEADING + subCells.length;
    const a = labelIndex(trailingCells, "Amount");
    const p = labelIndex(trailingCells, "Portability");
    const at = labelIndex(trailingCells, "Auth Trans Time");
    if (a !== -1) amountIdx = trailingStart + a;
    if (p !== -1) portabilityIdx = trailingStart + p;
    if (at !== -1) authTimeIdx = trailingStart + at;

    hasHeaderMap = wheatIdx !== -1 && riceIdx !== -1 && amountIdx !== -1 && portabilityIdx !== -1;
  }

  let i = 0;
  $("#Report tbody tr").each((_, row) => {
    const cells = $(row).find("td");
    if (cells.length < LEADING + 1) return;
    const slNo = parseInt($(cells[0]).text().trim(), 10);
    if (!Number.isFinite(slNo)) return;

    const cellText = (idx: number) => (idx === -1 ? "" : $(cells[idx]).text().trim());
    const cellNum = (idx: number) => (idx === -1 ? 0 : parseFloat($(cells[idx]).text().trim()) || 0);

    const receiptNo = $(cells[4]).text().trim();

    // Fallback to the observed default layout (Wheat, Rice, Sugar, Jowar,
    // Amount, Portability, Auth Trans Time at cells 6-12, no Saree column)
    // if the two-row header couldn't be parsed.
    const wheat = hasHeaderMap ? cellNum(wheatIdx) : parseFloat($(cells[6]).text().trim()) || 0;
    const rice = hasHeaderMap ? cellNum(riceIdx) : parseFloat($(cells[7]).text().trim()) || 0;
    const sugar = hasHeaderMap ? cellNum(sugarIdx) : parseFloat($(cells[8]).text().trim()) || 0;
    const saree = hasHeaderMap ? cellNum(sareeIdx) : 0;
    const jowar = hasHeaderMap ? cellNum(jowarIdx) : parseFloat($(cells[9]).text().trim()) || 0;
    const amount = hasHeaderMap ? cellNum(amountIdx) : parseFloat($(cells[10]).text().trim()) || 0;
    const portability = hasHeaderMap ? cellText(portabilityIdx) : $(cells[11]).text().trim();
    const authTransTime = hasHeaderMap ? cellText(authTimeIdx) || undefined : cellText(12) || undefined;

    transactions.push({
      id: receiptNo,
      slNo: slNo || i + 1,
      srcNo: $(cells[1]).text().trim(),
      scheme: $(cells[2]).text().trim() as "PHH" | "AAY",
      availType: $(cells[3]).text().trim() as "Authenticated" | "OTP" | "IRIS",
      receiptNo,
      date: $(cells[5]).text().trim(),
      wheat,
      rice,
      sugar,
      saree,
      jowar,
      amount,
      portability,
      authTransTime,
    });
    i++;
  });

  return transactions;
}

const num = (text: string) => parseFloat(text.trim()) || 0;

/**
 * Stock register table has no stable id (unlike #Report for transactions),
 * so the table is located by its own header text instead — the row layout
 * is SI.No / Commodity / Units / Alloted / OB / Regular / Extra / Moved /
 * Issued / CB (10 cells), with a data row starting with a numeric SI.No.
 */
export function parseStockRegisterHtml(
  html: string
): Omit<GovStockRegisterEntry, "fpsId" | "year" | "month" | "fetchedAt">[] {
  const $ = cheerio.load(html);
  const entries: Omit<GovStockRegisterEntry, "fpsId" | "year" | "month" | "fetchedAt">[] = [];

  let table = $("table").filter((_, el) => {
    const text = $(el).text();
    return text.includes("Commodity") && (text.includes("CB Qty") || text.includes("OB Qty"));
  });
  if (table.length === 0) table = $("table");

  table.find("tr").each((_, row) => {
    const cells = $(row).find("td");
    if (cells.length < 10) return;
    const slNo = parseInt($(cells[0]).text().trim(), 10);
    if (!Number.isFinite(slNo)) return;

    entries.push({
      commodity: $(cells[1]).text().trim(),
      unit: $(cells[2]).text().trim(),
      alloted: num($(cells[3]).text()),
      opening: num($(cells[4]).text()),
      receivedRegular: num($(cells[5]).text()),
      receivedExtra: num($(cells[6]).text()),
      receivedMoved: num($(cells[7]).text()),
      issued: num($(cells[8]).text()),
      closing: num($(cells[9]).text()),
    });
  });

  return entries;
}
