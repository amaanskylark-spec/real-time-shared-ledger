export interface Person {
  id: string;
  name: string;
  phone?: string;
  initialBalance: number;
  currentBalance: number;
  notes?: string;
  createdAt: Date;
  createdBy: string;
  lastUpdated: Date;
}

export interface Transaction {
  id: string;
  personId: string;
  amount: number;
  type: 'given' | 'received';
  date: Date;
  addedBy: string;
  addedByName: string;
  comment?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Ledger {
  id: string;
  name: string;
  members: string[]; // user IDs
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
