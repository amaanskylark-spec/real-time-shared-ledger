import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import { calculateBalanceFromTransactions } from '../utils/money';

export const recalculatePersonBalance = async (personId: string) => {
  const personRef = doc(db, 'people', personId);
  const personSnapshot = await getDoc(personRef);

  if (!personSnapshot.exists()) {
    throw new Error('Person not found');
  }

  const personData = personSnapshot.data();
  const initialBalance = Number(personData.initialBalance || 0);

  const transactionsQuery = query(collection(db, 'transactions'), where('personId', '==', personId));
  const transactionSnapshot = await getDocs(transactionsQuery);
  const transactions = transactionSnapshot.docs.map((item) => item.data() as { amount: number; type: 'given' | 'received' });

  const currentBalance = calculateBalanceFromTransactions(initialBalance, transactions);

  await updateDoc(personRef, {
    currentBalance,
    lastUpdated: serverTimestamp(),
  });

  return currentBalance;
};

interface DeletePersonWithTransactionsParams {
  personId: string;
  personName: string;
  actorUserId: string;
  actorName: string;
}

export const deletePersonWithTransactions = async ({
  personId,
  personName,
  actorUserId,
  actorName,
}: DeletePersonWithTransactionsParams) => {
  const personRef = doc(db, 'people', personId);
  const personSnapshot = await getDoc(personRef);

  if (!personSnapshot.exists()) {
    throw new Error('Person not found');
  }

  const transactionsQuery = query(collection(db, 'transactions'), where('personId', '==', personId));
  const transactionSnapshot = await getDocs(transactionsQuery);
  const batch = writeBatch(db);

  transactionSnapshot.docs.forEach((transactionDoc) => {
    batch.delete(transactionDoc.ref);
  });

  batch.delete(personRef);

  const activityLogRef = doc(collection(db, 'activity_logs'));
  batch.set(activityLogRef, {
    userId: actorUserId,
    userName: actorName,
    action: 'deleted person',
    details: `Deleted ${personName} with ${transactionSnapshot.size} linked transaction${transactionSnapshot.size === 1 ? '' : 's'}`,
    timestamp: serverTimestamp(),
    ledgerId: 'default',
  });

  await batch.commit();
};
