import * as cheerio from "cheerio";
import type { Transaction } from "../types";

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
