import { parseEposHtml, parseStockRegisterHtml } from "../lib/eposParser";
import type { Transaction, GovStockRegisterEntry } from "../types";

const EPOS_URL = "https://epos.mahafood.gov.in/FPS_Trans_Details.jsp";
const STOCK_REGISTER_URL = "https://epos.mahafood.gov.in/fps_stock_register_comm.action";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * This gov server's TLS handshake is observed to be intermittently flaky
 * (connection reset before the handshake completes, unrelated to request
 * content) — retried a few times with backoff before giving up.
 */
export class GovApiClient {
  async fetchTransactions(
    distCode: string,
    fpsId: string,
    month: string,
    year: string,
    maxAttempts = 4
  ): Promise<{ transactions: Transaction[] }> {
    const formBody = `dist_code=${encodeURIComponent(distCode)}&fps_id=${encodeURIComponent(
      fpsId
    )}&month=${encodeURIComponent(month)}&year=${encodeURIComponent(year)}`;

    let lastErr: unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await fetch(EPOS_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "Mozilla/5.0",
            Accept: "text/html",
          },
          body: formBody,
        });

        if (!response.ok) {
          throw new Error(`ePOS API returned status ${response.status}`);
        }

        const html = await response.text();
        return { transactions: parseEposHtml(html) };
      } catch (err) {
        lastErr = err;
        if (attempt < maxAttempts - 1) {
          await sleep(300 * 2 ** attempt + Math.random() * 200);
        }
      }
    }

    throw new Error(
      `Failed to reach ePOS API after ${maxAttempts} attempts: ${
        lastErr instanceof Error ? lastErr.message : String(lastErr)
      }`
    );
  }

  async fetchStockRegister(
    distCode: string,
    fpsId: string,
    month: string,
    year: string,
    maxAttempts = 4
  ): Promise<Omit<GovStockRegisterEntry, "fpsId" | "year" | "month" | "fetchedAt">[]> {
    const formBody = `dist_code=${encodeURIComponent(distCode)}&fps_id=${encodeURIComponent(
      fpsId
    )}&month=${encodeURIComponent(month)}&year=${encodeURIComponent(year)}`;

    let lastErr: unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await fetch(STOCK_REGISTER_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "Mozilla/5.0",
            Accept: "text/html",
          },
          body: formBody,
        });

        if (!response.ok) {
          throw new Error(`Stock register API returned status ${response.status}`);
        }

        const html = await response.text();
        return parseStockRegisterHtml(html);
      } catch (err) {
        lastErr = err;
        if (attempt < maxAttempts - 1) {
          await sleep(300 * 2 ** attempt + Math.random() * 200);
        }
      }
    }

    throw new Error(
      `Failed to reach stock register API after ${maxAttempts} attempts: ${
        lastErr instanceof Error ? lastErr.message : String(lastErr)
      }`
    );
  }
}
