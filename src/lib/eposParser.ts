import * as cheerio from "cheerio";
import type { Transaction, GovStockRegisterEntry } from "../types";

// Fixed leading columns present in every variant of the government "Qty in Kgs"
// table: Sl No, SRC No, Scheme, Avail Type, Receipt No, Date. After that come a
// variable set of commodity columns (Wheat/Rice/Sugar always present; SAREE and
// Jowar are mutually exclusive depending on what that FPS distributes), then
// Amount, Portability, Auth Trans Time. Column positions are therefore located
// by header text rather than assumed to be fixed, so a shop whose table has no
// SAREE column doesn't get Jowar's value misread as saree (and Amount as jowar).
//
// The government page doesn't reliably wrap the header row in <thead> (and may
// not use <th> at all), so the header can't be found via a fixed selector like
// "#Report thead tr". Instead every row in the table is scanned for the one
// containing both "Wheat" and "Portability" text — that's the header row,
// wherever it lives in the DOM — and it's excluded from the data rows by
// object identity.
function findHeaderIndex($: cheerio.CheerioAPI, headerCells: cheerio.Cheerio<import("domhandler").Element>, label: string): number {
  let found = -1;
  headerCells.each((idx, cell) => {
    if (found === -1 && $(cell).text().trim().toUpperCase().includes(label.toUpperCase())) {
      found = idx;
    }
  });
  return found;
}

export function parseEposHtml(html: string): Transaction[] {
  const $ = cheerio.load(html);
  const transactions: Transaction[] = [];

  const allRows = $("#Report tr").toArray();
  const headerRowEl = allRows.find((row) => {
    const text = $(row).text().toUpperCase();
    return text.includes("WHEAT") && text.includes("PORTABILITY");
  });

  let wheatIdx = -1, riceIdx = -1, sugarIdx = -1, sareeIdx = -1, jowarIdx = -1;
  let amountIdx = -1, portabilityIdx = -1, authTimeIdx = -1;
  let hasHeaderMap = false;

  if (headerRowEl) {
    const headerCells = $(headerRowEl).find("th, td");
    wheatIdx = findHeaderIndex($, headerCells, "Wheat");
    riceIdx = findHeaderIndex($, headerCells, "Rice");
    sugarIdx = findHeaderIndex($, headerCells, "Sugar");
    sareeIdx = findHeaderIndex($, headerCells, "SAREE");
    jowarIdx = findHeaderIndex($, headerCells, "Jowar");
    amountIdx = findHeaderIndex($, headerCells, "Amount");
    portabilityIdx = findHeaderIndex($, headerCells, "Portability");
    authTimeIdx = findHeaderIndex($, headerCells, "Auth Trans Time");
    hasHeaderMap = wheatIdx !== -1 && riceIdx !== -1 && amountIdx !== -1 && portabilityIdx !== -1;
  }

  let i = 0;
  for (const row of allRows) {
    if (row === headerRowEl) continue;
    const cells = $(row).find("td");
    if (cells.length < 13) continue;
    const slNo = parseInt($(cells[0]).text().trim(), 10);
    if (!Number.isFinite(slNo)) continue;

    const cellText = (idx: number) => (idx === -1 ? "" : $(cells[idx]).text().trim());
    const cellNum = (idx: number) => (idx === -1 ? 0 : parseFloat($(cells[idx]).text().trim()) || 0);

    const receiptNo = $(cells[4]).text().trim();

    // Fallback to the legacy fixed layout (Wheat, Rice, Sugar, SAREE, Jowar,
    // Amount, Portability at cells 6-12) if the header row couldn't be found.
    const wheat = hasHeaderMap ? cellNum(wheatIdx) : parseFloat($(cells[6]).text().trim()) || 0;
    const rice = hasHeaderMap ? cellNum(riceIdx) : parseFloat($(cells[7]).text().trim()) || 0;
    const sugar = hasHeaderMap ? cellNum(sugarIdx) : parseFloat($(cells[8]).text().trim()) || 0;
    const saree = hasHeaderMap ? cellNum(sareeIdx) : parseFloat($(cells[9]).text().trim()) || 0;
    const jowar = hasHeaderMap ? cellNum(jowarIdx) : parseFloat($(cells[10]).text().trim()) || 0;
    const amount = hasHeaderMap ? cellNum(amountIdx) : parseFloat($(cells[11]).text().trim()) || 0;
    const portability = hasHeaderMap ? cellText(portabilityIdx) : $(cells[12]).text().trim();
    const authTransTime = hasHeaderMap
      ? (authTimeIdx === -1 ? undefined : cellText(authTimeIdx))
      : (cells.length >= 14 ? $(cells[13]).text().trim() : undefined);

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
  }

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
