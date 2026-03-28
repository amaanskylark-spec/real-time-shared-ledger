export interface Person {
  id: string;
  name: string;
  phone?: string;
  initialBalance: number;
  currentBalance: number;
  notes?: string;
  comment?: string; // general comment / description about person
  createdAt: Date;
  createdBy: string;
  lastUpdated: Date;
}

export interface Transaction {
  id: string;
  personId: string;
  amount: number;
  type: 'given' | 'received';
  category?: string;
  description?: string; // user-entered description/comment
  date: Date;
  addedBy: string;
  addedByName: string;
  comment?: string; // alias kept for backward compat
  sequenceNumber: number; // permanent sequential #, assigned at creation, never changes
  deleted?: boolean;       // soft-delete flag
  deletedAt?: Date;
  deletedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Ledger {
  id: string;
  name: string;
  members: string[];
  memberDetails: { uid: string; name: string; email: string }[];
  createdBy: string;
  createdAt: Date;
}

export interface ActivityLog {
  id: string;
  userId: string;
  userName: string;
  action: string;
  details: string;
  timestamp: Date;
  ledgerId: string;
}
