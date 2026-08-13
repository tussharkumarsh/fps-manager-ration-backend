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
