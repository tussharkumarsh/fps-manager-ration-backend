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
  saree: number;
  amount: number;
  portability: string;
  authTransTime?: string;
  customerName?: string;
  monthDate?: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  txField: "wheat" | "rice" | "";
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
  opening: number;
  receivedRegular: number;
  receivedExtra: number;
  receivedMoved: number;
  issued: number;
  closing: number;
  fetchedAt: string;
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

export interface StoredTransaction extends Transaction {
  fpsId: string;
  year: string;
  month: string;
  fetchedAt: string;
  source: "api" | "manual";
}
