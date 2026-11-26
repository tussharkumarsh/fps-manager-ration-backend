import { parseStockRegisterHtml } from "../lib/eposParser";
import { parseEposJson } from "../lib/eposJsonParser";
import type { Transaction, GovStockRegisterEntry } from "../types";

const EPOS_URL = "https://epos.mahafood.gov.in/Epos_Spring/fps/fpstransactionwitoutcatptcha";
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
    const body = JSON.stringify({
      fps_id: fpsId,
      month: String(parseInt(month, 10)),
      year: String(year),
    });

    let lastErr: unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      let html: string;
      try {
        const response = await fetch(EPOS_URL, {
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

        html = await response.text();
      } catch (err) {
        lastErr = err;
        if (attempt < maxAttempts - 1) {
          await sleep(300 * 2 ** attempt + Math.random() * 200);
        }
        continue;
      }
      // Outside the retry: a page we can't parse won't parse on a retry, and
      // its error shouldn't be reported as a connectivity failure.
      let json: unknown;
      try {
        json = JSON.parse(html);
      } catch {
        throw new Error(
          `ePOS API returned a non-JSON response — the portal format may have changed: ${html.slice(0, 120)}`
        );
      }
      return parseEposJson(json);
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
