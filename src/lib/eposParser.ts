import * as cheerio from "cheerio";
import type { Transaction, GovStockRegisterEntry } from "../types";

export function parseEposHtml(html: string): Transaction[] {
  const $ = cheerio.load(html);
  const transactions: Transaction[] = [];

  $("#Report tbody tr").each((i, row) => {
    const cells = $(row).find("td");
    if (cells.length >= 11) {
      const receiptNo = $(cells[4]).text().trim();
      const wheat = parseFloat($(cells[6]).text().trim()) || 0;
      const rice = parseFloat($(cells[7]).text().trim()) || 0;
      const saree = parseFloat($(cells[8]).text().trim()) || 0;
      const amount = parseFloat($(cells[9]).text().trim()) || 0;

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
        saree,
        amount,
        portability: $(cells[10]).text().trim(),
        authTransTime: cells.length >= 12 ? $(cells[11]).text().trim() : undefined,
      });
    }
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
