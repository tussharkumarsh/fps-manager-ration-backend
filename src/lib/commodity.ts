export type TxField = "wheat" | "rice" | "sugar" | "saree" | "jowar";

/**
 * The government portals name the same commodity differently across months
 * and reports (e.g. "FRice" for fortified rice until June 2026, "Rice"
 * after; "Saree Kit" vs "SAREE"). Every place that groups or matches by
 * commodity goes through this so carry-forward chains and the local
 * transaction mapping don't break on a rename.
 */
const CANONICAL: Record<string, string> = {
  wheat: "Wheat",
  rice: "Rice",
  frice: "Rice",
  "f.rice": "Rice",
  "f rice": "Rice",
  "fortified rice": "Rice",
  sugar: "Sugar",
  jowar: "Jowar",
  saree: "SAREE",
  "saree kit": "SAREE",
};

const TX_FIELD: Record<string, TxField> = {
  Wheat: "wheat",
  Rice: "rice",
  Sugar: "sugar",
  Jowar: "jowar",
  SAREE: "saree",
};

export const TX_FIELD_TO_COMMODITY: Record<TxField, string> = {
  wheat: "Wheat",
  rice: "Rice",
  sugar: "Sugar",
  jowar: "Jowar",
  saree: "SAREE",
};

export function normalizeCommodity(name: string): string {
  const trimmed = (name || "").trim().replace(/\s+/g, " ");
  return CANONICAL[trimmed.toLowerCase()] ?? trimmed;
}

export function txFieldForCommodity(name: string): TxField | null {
  return TX_FIELD[normalizeCommodity(name)] ?? null;
}
