import * as cheerio from "cheerio";

export interface MonthlyRoRow {
    shopNo: string;
    districtCode: string;
    districtName: string;
    year: string;
    month: string;
    roNo: string;
    roDate?: string;
    roTime?: string;
    dispatched: boolean;
    sequenceNo: number;
    sourceIdentifier: string;
}

export interface TruckChitDetailRow {
    truckChitNo: string;
    roNo: string;
    month: string;
    year: string;
    districtCode: string;
    scheme: string;
    commodity: string;
    unit: string;
    allocatedQty: number;
    dispatchedQty: number;
    receivedQty: number;
    transactionDate?: string;
    dispatchDate?: string;
    sourceIdentifier: string;
}

export interface MonthlySummaryRow {
    year: string;
    month: string;
    scheme: string;
    commodity: string;
    openingStock: number;
    receivedQty: number;
    distributedQty: number;
    closingStock: number;
    carriedForwardQty: number;
    truckChitCount?: number;
    roCount?: number;
}

const num = (value: string) => {
    const cleaned = value.replace(/[,\s]/g, "").trim();
    const parsed = Number.parseFloat(cleaned || "0");
    return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeCommodity = (value: string) => (value || "").trim() || "Unknown";

const normalizeScheme = (value: string) => (value || "").trim().toUpperCase();

const normalizeUnit = (value: string) => (value || "").trim();

export function parseMonthlyRoListHtml(
    html: string,
    context: { shopNo: string; districtCode: string; districtName: string; year: string; month: string; }
): MonthlyRoRow[] {
    const $ = cheerio.load(html);
    const rows: MonthlyRoRow[] = [];

    const allRows = $("table tr");
    allRows.each((_, row) => {
        const cells = $(row).find("td");
        if (cells.length < 5) return;

        const firstCellText = $(cells[0]).text().trim();
        const roInput = $(row).find('input[name="tdronon"]');
        const roNo = roInput.first().attr("value")?.trim() || "";
        if (!roNo || !/^RO\//i.test(roNo)) return;

        const hiddenDate = $(row).find('input[name="tdrdaten"]').first().attr("value")?.trim();
        const hiddenStatus = $(row).find('input[name="tdsdstatusn"]').first().attr("value")?.trim();
        const sequenceMatch = roNo.match(/\/(\d+)$/);

        rows.push({
            shopNo: context.shopNo,
            districtCode: context.districtCode,
            districtName: context.districtName,
            year: context.year,
            month: context.month,
            roNo,
            roDate: hiddenDate || $(cells[1]).text().trim() || undefined,
            roTime: $(cells[3]).text().trim() || undefined,
            dispatched: /yes|true/i.test(hiddenStatus || $(cells[4]).text().trim() || ""),
            sequenceNo: Number.parseInt(sequenceMatch?.[1] || firstCellText || "0", 10) || 0,
            sourceIdentifier: `${roNo}`,
        });
    });

    return rows.filter((row) => row.roNo.length > 0);
}

export function parseTruckChitHtml(
    html: string,
    context: { truckChitNo: string; roNo: string; month: string; year: string; districtCode: string; }
): TruckChitDetailRow[] {
    const $ = cheerio.load(html);
    const merged = new Map<string, TruckChitDetailRow>();
    let inReceivedSection = false;

    const dispatchDateMatch = $("body")
        .text()
        .match(/Dispatch Date\s*:\s*(\d{2}-\d{2}-\d{4})/i);
    const recDateMatch = $("body")
        .text()
        .match(/Rec Date\s*:\s*(\d{2}-\d{2}-\d{4})/i);
    const dispatchDate = dispatchDateMatch?.[1] ? dispatchDateMatch[1].split("-").reverse().join("-") : undefined;
    const transactionDate = recDateMatch?.[1] ? recDateMatch[1].split("-").reverse().join("-") : dispatchDate;

    $("tr").each((_, row) => {
        const rowText = $(row).text().replace(/\s+/g, " ").trim();
        if (rowText.includes("Received")) {
            inReceivedSection = true;
            return;
        }

        const cells = $(row).find("td");
        if (cells.length < 4) return;

        const firstText = $(cells[0]).text().trim();
        if (!firstText || /Scheme|Truck No|Dispatch Date|Rec Date|Rec Time/i.test(firstText)) return;

        const values = cells.toArray().map((cell) => $(cell).text().trim());
        const scheme = normalizeScheme(values[0]);
        const commodity = normalizeCommodity(values[1]);
        if (!scheme || !commodity) return;

        const unit = normalizeUnit(values[2]);
        const key = `${scheme}|${commodity}`;
        const base: TruckChitDetailRow = merged.get(key) || {
            truckChitNo: context.truckChitNo,
            roNo: context.roNo,
            month: context.month,
            year: context.year,
            districtCode: context.districtCode,
            scheme,
            commodity,
            unit,
            allocatedQty: 0,
            dispatchedQty: 0,
            receivedQty: 0,
            transactionDate,
            dispatchDate,
            sourceIdentifier: `${context.truckChitNo}|${scheme}|${commodity}`,
        };

        if (inReceivedSection) {
            base.dispatchedQty = base.dispatchedQty || num(values[3] || "0");
            base.receivedQty += num(values[4] || "0");
            base.transactionDate = transactionDate || base.transactionDate;
        } else {
            base.allocatedQty += num(values[3] || "0");
            base.dispatchedQty = base.dispatchedQty || num(values[4] || "0");
            base.dispatchDate = dispatchDate || base.dispatchDate;
            base.transactionDate = dispatchDate || base.transactionDate;
        }

        base.unit = unit || base.unit;
        base.commodity = commodity || base.commodity;
        merged.set(key, base);
    });

    return Array.from(merged.values()).filter(
        (row) => row.scheme && row.commodity && (row.allocatedQty > 0 || row.dispatchedQty > 0 || row.receivedQty > 0)
    );
}

export function buildMonthlySummaryRows(rows: MonthlySummaryRow[]): MonthlySummaryRow[] {
    const latestByKey = new Map<string, MonthlySummaryRow>();
    const ordered: MonthlySummaryRow[] = [];

    const sorted = [...rows].sort((a, b) => {
        const aKey = `${a.year}-${a.month.padStart(2, "0")}`;
        const bKey = `${b.year}-${b.month.padStart(2, "0")}`;
        return aKey.localeCompare(bKey);
    });

    for (const row of sorted) {
        const key = `${row.scheme}|${row.commodity}`;
        const previous = latestByKey.get(key);
        const openingStock = row.openingStock > 0 ? row.openingStock : previous?.closingStock ?? 0;
        const receivedQty = row.receivedQty || 0;
        const distributedQty = row.distributedQty || 0;
        const closingStock = openingStock + receivedQty - distributedQty;
        const nextRow: MonthlySummaryRow = {
            ...row,
            openingStock,
            receivedQty,
            distributedQty,
            closingStock,
            carriedForwardQty: closingStock,
        };
        ordered.push(nextRow);
        latestByKey.set(key, nextRow);
    }

    return ordered;
}
