export interface FamilyMember {
  msNo: number;
  nameEng: string;
  nameLL?: string;
  hofn?: string;
  memberId?: string;
  age?: string;
  uid?: string;
  mobile?: string;
  relation?: string;
  motherName?: string;
  fatherName?: string;
  gender?: string;
}

export interface Customer {
  srcNo: string;
  name: string;
  lastDispatched?: string;
  scheme?: "PHH" | "AAY";
  sNo?: number;
  areaType?: string;
  status?: string;
  memberCount?: number;
  mobile?: string;
  familyHead?: string;
  members?: FamilyMember[];
  disabled?: boolean;
  disabledReason?: string;
  disabledAt?: string;
  // From the government beneficiary file ("FPS-wise RC & Member Details").
  /** FPS whose file this card last came from ("" / undefined = own, imported before this existed). */
  sourceFpsId?: string;
  sourceFpsName?: string;
  /** When this card was last present in an uploaded file (ISO). */
  portalSyncedAt?: string;
  approvalDate?: string;
  approvedBy?: string;
  /** "A" (Verified and Approved) / "U" (Yet to be Scanned). */
  statusCode?: string;
  /** The head's mobile exactly as in the file, usually masked. */
  portalMobile?: string;
}

export interface Transaction {
  id: string;
  slNo: number;
  srcNo: string;
  scheme: "PHH" | "AAY";
  availType: "Authenticated" | "OTP" | "IRIS";
  receiptNo: string;
  date: string;
  wheat: number;
  rice: number;
  sugar: number;
  saree: number;
  jowar: number;
  amount: number;
  portability: string;
  authTransTime?: string;
  /** Quantities from ePOS commodity columns without a dedicated field, keyed by header text. */
  extraItems?: Record<string, number>;
  customerName?: string;
  monthDate?: string;
  /** Allocation (ration) month the record belongs to on the portal — not always the calendar month of `date`. */
  year?: string;
  month?: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  txField: "wheat" | "rice" | "sugar" | "jowar" | "";
  active: boolean;
}

export interface InventoryLedgerEntry {
  fpsId: string;
  year: string;
  month: string;
  itemId: string;
  opening: number;
  received: number;
  distributed: number;
  closing: number;
}

export interface GovStockRegisterEntry {
  fpsId: string;
  year: string;
  month: string;
  commodity: string;
  unit: string;
  alloted: number;
  /** Allotment per scheme (PHH, AAY, …), from the Detailed Allotment report. */
  allotedByScheme?: Record<string, number>;
  opening: number;
  receivedRegular: number;
  receivedExtra: number;
  receivedMoved: number;
  issued: number;
  closing: number;
  fetchedAt: string;
}

export interface ScmRoRecord {
  id?: string;
  fpsId: string;
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
  importedAt?: string;
}

export interface ScmTruckChitRecord {
  id?: string;
  fpsId: string;
  truckChitNo: string;
  roNo: string;
  year: string;
  month: string;
  sequenceNo: number;
  dispatchDate?: string;
  truckNo?: string;
  sourceIdentifier: string;
  importedAt?: string;
}

export interface ScmInventoryTransaction {
  id?: string;
  fpsId: string;
  truckChitNo: string;
  roNo: string;
  year: string;
  month: string;
  scheme: string;
  commodity: string;
  unit: string;
  allocatedQty: number;
  dispatchedQty: number;
  receivedQty: number;
  transactionDate?: string;
  sourceIdentifier: string;
  importedAt?: string;
  districtCode?: string;
}

export interface InventoryMonthlySummary {
  fpsId: string;
  year: string;
  month: string;
  scheme: string;
  commodity: string;
  /** Previous month's closing for the same scheme × commodity. */
  openingStock: number;
  receivedQty: number;
  distributedQty: number;
  closingStock: number;
  truckChitCount: number;
  roCount: number;
  importedAt?: string;
}

export interface AppUser {
  fpsId: string;
  distCode: string;
  username: string;
  passwordHash: string;
  displayName: string;
  role: "dealer" | "admin";
  createdAt: string;
  active: boolean;
}

export interface MonthLock {
  fpsId: string;
  year: string;
  month: string;
  status: "live" | "synced_locked";
  lastSyncedAt: string;
  recordCount: number;
}

/** Particular key (e.g. "wheat") -> hand-entered PHH/AAY figures. */
export type ManualGoshwaraEntries = Record<string, { phh: number; aay: number }>;

export interface ManualGoshwara {
  fpsId: string;
  year: string;
  month: string;
  entries: ManualGoshwaraEntries;
  updatedAt: string;
}

export interface StoredTransaction extends Transaction {
  fpsId: string;
  year: string;
  month: string;
  fetchedAt: string;
  source: "api" | "manual";
}

/** A dealer's saved contact details for another shop (FPS) whose cards collect at theirs. */
export interface OtherShop {
  /** The dealer who saved it. */
  fpsId: string;
  /** The other shop's FPS number, as the ePOS portability column shows it. */
  shopFpsId: string;
  shopName: string;
  dealerName: string;
  mobile: string;
  altMobile: string;
  address: string;
  notes: string;
  updatedAt: string;
}

export type { FpsDirectoryEntry } from "./lib/fpsDirectory";

/** The footer summary printed at the bottom of a beneficiary file; null = not in the file. */
export type BeneficiaryFooter = Record<
  | "totalCards" | "femaleHof" | "maleHof" | "totalMembers"
  | "age0to5" | "age5to12" | "age12to60" | "age60plus"
  | "validUid" | "invalidUid" | "validMobile" | "invalidMobile"
  | "female" | "male",
  number | null
> & { maleHofn: string | null; femaleHofn: string | null };

/** One beneficiary-file upload: the file's header and footer, and what the merge did. */
export interface BeneficiaryImport {
  id: string;
  fpsId: string;
  sourceFpsId: string;
  sourceFpsName: string;
  district: string;
  dfso: string;
  tfso: string;
  officeCode: string;
  fileName: string;
  importedAt: string;
  cards: number;
  members: number;
  aayCards: number;
  phhCards: number;
  footer: BeneficiaryFooter;
  newCards: number;
  updatedCards: number;
  missingCards: number;
}
