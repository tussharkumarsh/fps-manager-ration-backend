import * as cheerio from "cheerio";
import type { Transaction, GovStockRegisterEntry } from "../types";

// Fixed leading columns present in every variant of the government "Qty in Kgs"
// table: Sl No, SRC No, Scheme, Avail Type, Receipt No, Date. After that come a
// variable set of commodity columns (Wheat/Rice/Sugar always present; SAREE and
// Jowar are mutually exclusive depending on what that FPS distributes), then
// Amount, Portability, Auth Trans Time. Column positions are therefore located
// by header text rather than assumed to be fixed, so a shop whose table has no
// SAREE column doesn't get Jowar's value misread as saree (and Amount as jowar).
const LEADING_COLUMNS = 6;

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

  const headerRow = $("#Report thead tr").last();
  const headerCells = headerRow.find("th, td");

  const wheatIdx = findHeaderIndex($, headerCells, "Wheat");
  const riceIdx = findHeaderIndex($, headerCells, "Rice");
  const sugarIdx = findHeaderIndex($, headerCells, "Sugar");
  const sareeIdx = findHeaderIndex($, headerCells, "SAREE");
  const jowarIdx = findHeaderIndex($, headerCells, "Jowar");
  const amountIdx = findHeaderIndex($, headerCells, "Amount");
  const portabilityIdx = findHeaderIndex($, headerCells, "Portability");
  const authTimeIdx = findHeaderIndex($, headerCells, "Auth Trans Time");

  const hasHeaderMap = wheatIdx !== -1 && riceIdx !== -1 && amountIdx !== -1 && portabilityIdx !== -1;

  $("#Report tbody tr").each((i, row) => {
    const cells = $(row).find("td");
    if (cells.length < LEADING_COLUMNS + 1) return;

    const cellText = (idx: number) => (idx === -1 ? "" : $(cells[idx]).text().trim());
    const cellNum = (idx: number) => (idx === -1 ? 0 : parseFloat($(cells[idx]).text().trim()) || 0);

    const receiptNo = $(cells[4]).text().trim();

    // Fallback to the legacy fixed layout (Wheat, Rice, Sugar, SAREE, Jowar,
    // Amount, Portability at cells 6-12) if the header row couldn't be parsed.
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
      slNo: parseInt($(cells[0]).text().trim()) || i + 1,
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
