import { parseStockRegisterHtml } from "../lib/eposParser";
import { parseEposJson } from "../lib/eposJsonParser";
import { parseDailyTotals, type DayTotals } from "../lib/dailyVerify";
import type { Transaction, GovStockRegisterEntry } from "../types";

const EPOS_URL = "https://epos.mahafood.gov.in/Epos_Spring/fps/fpstransactionwitoutcatptcha";
const DAILY_TOTALS_URL = "https://epos.mahafood.gov.in/Epos_Spring/fps/dateWiseTransDetails";
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
  /**
   * POSTs a JSON body to one of the portal's Epos_Spring endpoints and
   * returns the parsed JSON. Network/HTTP failures are retried; a response
   * that isn't JSON is not (it won't become JSON on a retry, and it means the
   * portal changed, not that it's unreachable).
   */
  private async postEposJson(url: string, payload: Record<string, string>, maxAttempts = 4): Promise<unknown> {
    const body = JSON.stringify(payload);
    let lastErr: unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      let text: string;
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0",
            Accept: "application/json, text/plain, */*",
            Origin: "https://epos.mahafood.gov.in",
            Referer: "https://epos.mahafood.gov.in/",
          },
          body,
        });
        if (!response.ok) {
          throw new Error(`ePOS API returned status ${response.status}`);
        }
        text = await response.text();
      } catch (err) {
        lastErr = err;
        if (attempt < maxAttempts - 1) {
          await sleep(300 * 2 ** attempt + Math.random() * 200);
        }
        continue;
      }
      try {
        return JSON.parse(text);
      } catch {
        throw new Error(
          `ePOS API returned a non-JSON response — the portal format may have changed: ${text.slice(0, 120)}`
        );
      }
    }
    throw new Error(
      `Failed to reach ePOS API after ${maxAttempts} attempts: ${
        lastErr instanceof Error ? lastErr.message : String(lastErr)
      }`
    );
  }

  /**
   * The portal's transaction report moved (Nov 2026) from the
   * FPS_Trans_Details.jsp HTML table to a JSON endpoint that takes only
   * fps_id/month/year — district is implied by the FPS id. `_distCode` is
   * kept in the signature for callers.
   */
  async fetchTransactions(
    _distCode: string,
    fpsId: string,
    month: string,
    year: string,
    maxAttempts = 4
  ): Promise<{ transactions: Transaction[]; unknownColumns: string[] }> {
    const json = await this.postEposJson(
      EPOS_URL,
      { fps_id: fpsId, month: String(parseInt(month, 10)), year: String(year) },
      maxAttempts
    );
    return parseEposJson(json);
  }

  /** The portal's own per-day sales totals for a month — used only to verify our stored data. */
  async fetchDailyTotals(distCode: string, fpsId: string, month: string, year: string): Promise<DayTotals[]> {
    const json = await this.postEposJson(DAILY_TOTALS_URL, {
      dist_code: distCode,
      month: String(parseInt(month, 10)),
      year: String(year),
      fps_id: fpsId,
    });
    return parseDailyTotals(json);
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
