import { parseMonthlyRoListHtml, parseTruckChitHtml } from "./scmParser";

export interface ScmMonthQuery {
    shopNo: string;
    districtCode: string;
    districtName: string;
    year: string;
    month: string;
}

export class ScmApiClient {
    private readonly baseUrl = process.env.SCM_BASE_URL || "https://scm.mahafood.gov.in";
    private readonly userAgent = process.env.SCM_USER_AGENT || "Mozilla/5.0";

    private buildUrl(path: string): URL {
        return new URL(path, this.baseUrl.endsWith("/") ? this.baseUrl : `${this.baseUrl}/`);
    }

    async fetchMonthlyRoList(query: ScmMonthQuery) {
        const url = this.buildUrl("/shoproanddispatchdetailsn.jsp");
        url.searchParams.set("shopno", query.shopNo);
        url.searchParams.set("cyearo", query.year);
        url.searchParams.set("imonth", String(query.month));
        url.searchParams.set("dist", query.districtCode);
        url.searchParams.set("tdistnamen", query.districtName);

        const res = await fetch(url.toString(), {
            method: "GET",
            headers: {
                "User-Agent": this.userAgent,
                Accept: "text/html",
            },
        });

        if (!res.ok) {
            throw new Error(`SCM monthly RO API returned ${res.status} for ${query.year}-${query.month}`);
        }

        const html = await res.text();
        return parseMonthlyRoListHtml(html, query);
    }

    async fetchTruckChitDetail(
        query: ScmMonthQuery & { roNo: string; truckChitNo: string; sequenceNo: number; }
    ) {
        const url = this.buildUrl("/truckchitdetailsa.jsp");
        url.searchParams.set("tr", query.truckChitNo);
        url.searchParams.set("dpmon", String(query.month));
        url.searchParams.set("cyearo", query.year);
        url.searchParams.set("tdro", query.roNo);
        url.searchParams.set("dist", query.districtCode);

        const res = await fetch(url.toString(), {
            method: "GET",
            headers: {
                "User-Agent": this.userAgent,
                Accept: "text/html",
            },
        });

        if (!res.ok) {
            throw new Error(`SCM truck chit API returned ${res.status} for ${query.roNo}`);
        }

        const html = await res.text();
        return parseTruckChitHtml(html, {
            truckChitNo: query.truckChitNo,
            roNo: query.roNo,
            month: query.month,
            year: query.year,
            districtCode: query.districtCode,
        });
    }
}

export interface ShopAllotmentQuery {
    distCode: string;
    distName: string;
    afsoCode: string;
    afsoName: string;
    commId: string;
    commName: string;
    ctype: string;
    month: string;
    year: string;
}

const ALLOTMENT_URL = "https://scm.mahafood.gov.in/scm_spring/api/KeyRegister/get_fps_keyreg_allot";

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The "District Wise Shop Allotment" report (Nov 2026 portal). Same payload
 * the portal's own page sends; month/year go as numbers, the rest as strings,
 * scheme "0" = all schemes. Network/HTTP failures are retried.
 */
export async function fetchShopAllotment(q: ShopAllotmentQuery, maxAttempts = 3): Promise<unknown> {
    const body = JSON.stringify({
        month: parseInt(q.month, 10),
        year: parseInt(q.year, 10),
        comm_id: q.commId,
        dist_code: q.distCode,
        afso_code: q.afsoCode,
        ctype: q.ctype,
        scheme: "0",
        commname: q.commName,
        distname: q.distName,
        afsoname: q.afsoName,
    });
    let lastErr: unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            const res = await fetch(ALLOTMENT_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json, text/plain, */*",
                    "User-Agent": "Mozilla/5.0",
                    Origin: "https://scm.mahafood.gov.in",
                    Referer: "https://scm.mahafood.gov.in/scm/KeyRegisterAllotInt",
                },
                body,
            });
            if (!res.ok) throw new Error(`SCM allotment API returned ${res.status}`);
            const text = await res.text();
            try {
                return JSON.parse(text);
            } catch {
                throw new Error(`SCM allotment API returned a non-JSON response: ${text.slice(0, 120)}`);
            }
        } catch (err) {
            lastErr = err;
            if (err instanceof Error && err.message.includes("non-JSON")) throw err;
            if (attempt < maxAttempts - 1) await sleep(400 * 2 ** attempt);
        }
    }
    throw new Error(lastErr instanceof Error ? lastErr.message : String(lastErr));
}
