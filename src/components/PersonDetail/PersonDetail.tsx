import React, { useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { db } from '../../services/firebase';
import { recalculatePersonBalance } from '../../services/ledger';
import { useAuth, resolveDisplayName } from '../../contexts/AuthContext';
import { Person, Transaction } from '../../types';
import { AddTransactionModal } from '../Modals/AddTransactionModal';
import { TransactionItem } from './TransactionItem';
import {
  calculateBalanceFromTransactions,
  calculateTransactionTotals,
  formatAmountInput,
  formatCurrency,
  formatSignedCurrency,
  getBalanceToneMeta,
  getTransactionTypeAvailability,
  isSettledBalance,
  parseAmountInput,
  TRANSACTION_TYPE_LABELS,
} from '../../utils/money';

interface PersonDetailProps {
  personId: string;
  onBack: () => void;
}

const toSafeDate = (value: any): Date => {
  if (value?.toDate) return value.toDate();
  if (value instanceof Date) return value;

  if (typeof value === 'string') {
    const normalized = value.includes('T') ? value : `${value}T00:00:00`;
    const parsed = new Date(normalized);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const sortTransactionsByLatest = (items: Transaction[]) => {
  return [...items].sort((a, b) => {
    const aTime = a.date?.getTime?.() ?? a.createdAt?.getTime?.() ?? 0;
    const bTime = b.date?.getTime?.() ?? b.createdAt?.getTime?.() ?? 0;
    return bTime - aTime;
  });
};

export const PersonDetail: React.FC<PersonDetailProps> = ({ personId, onBack }) => {
  const { currentUser, userProfile } = useAuth();
  const [person, setPerson] = useState<Person | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [transactionType, setTransactionType] = useState<'given' | 'received'>('given');
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [deletingTransaction, setDeletingTransaction] = useState<Transaction | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [transactionSearch, setTransactionSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'given' | 'received'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [transactionActionNotice, setTransactionActionNotice] = useState('');

  useEffect(() => {
    if (!personId) return;

    const unsubscribePerson = onSnapshot(
      doc(db, 'people', personId),
      (snapshot) => {
        if (!snapshot.exists()) return;

        const data = snapshot.data();
        setPerson({
          id: snapshot.id,
          ...data,
          createdAt: toSafeDate(data.createdAt),
          lastUpdated: toSafeDate(data.lastUpdated),
        } as Person);
      },
      (error) => {
        console.error('Failed to listen to person:', error);
      }
    );

    const transactionsQuery = query(collection(db, 'transactions'), where('personId', '==', personId));

    const unsubscribeTransactions = onSnapshot(
      transactionsQuery,
      (snapshot) => {
        const transactionsData = snapshot.docs.map((transactionDoc) => {
          const data = transactionDoc.data();
          return {
            id: transactionDoc.id,
            ...data,
            date: toSafeDate(data.date),
            createdAt: toSafeDate(data.createdAt),
            updatedAt: toSafeDate(data.updatedAt),
          } as Transaction;
        });

        setTransactions(sortTransactionsByLatest(transactionsData));
      },
      (error) => {
        console.error('Failed to listen to transactions:', error);
      }
    );

    return () => {
      unsubscribePerson();
      unsubscribeTransactions();
    };
  }, [personId]);

  const filteredTransactions = useMemo(() => {
    const min = parseAmountInput(minAmount);
    const max = parseAmountInput(maxAmount);

    return transactions.filter((transaction) => {
      const search = transactionSearch.trim().toLowerCase();
      const matchesSearch =
        !search ||
        transaction.comment?.toLowerCase().includes(search) ||
        transaction.addedByName?.toLowerCase().includes(search) ||
        transaction.type.toLowerCase().includes(search) ||
        String(transaction.amount).includes(search);

      const matchesType = typeFilter === 'all' || transaction.type === typeFilter;

      const transactionDateString = new Date(transaction.date).toISOString().split('T')[0];
      const matchesFrom = !dateFrom || transactionDateString >= dateFrom;
      const matchesTo = !dateTo || transactionDateString <= dateTo;
      const matchesMin = !minAmount || transaction.amount >= min;
      const matchesMax = !maxAmount || transaction.amount <= max;

      return matchesSearch && matchesType && matchesFrom && matchesTo && matchesMin && matchesMax;
    });
  }, [transactions, transactionSearch, typeFilter, dateFrom, dateTo, minAmount, maxAmount]);

  const stats = useMemo(() => calculateTransactionTotals(transactions), [transactions]);
  const computedBalance = useMemo(() => {
    return calculateBalanceFromTransactions(person?.initialBalance || 0, transactions);
  }, [person?.initialBalance, transactions]);
  const latestTransaction = transactions[0];
  const balanceMeta = getBalanceToneMeta(computedBalance, latestTransaction?.type);
  const isSettled = isSettledBalance(computedBalance);
  const transactionAvailability = useMemo(
    () => getTransactionTypeAvailability(computedBalance),
    [computedBalance]
  );

  useEffect(() => {
    if (!person) return;

    const storedBalance = Number(person.currentBalance || 0);
    if (Math.abs(storedBalance - computedBalance) < 0.0001) return;

    recalculatePersonBalance(personId).catch((error) => {
      console.error('Failed to repair stale person balance:', error);
    });
  }, [computedBalance, person, personId]);

  useEffect(() => {
    if (!transactionActionNotice) return;

    const timeout = window.setTimeout(() => setTransactionActionNotice(''), 3200);
    return () => window.clearTimeout(timeout);
  }, [transactionActionNotice]);

  const openNewTransaction = (type: 'given' | 'received') => {
    if (type === 'given' && !transactionAvailability.canGiven) {
      setTransactionActionNotice(transactionAvailability.helperMessage || 'Money Given is not allowed right now.');
      return;
    }

    if (type === 'received' && !transactionAvailability.canReceived) {
      setTransactionActionNotice(transactionAvailability.helperMessage || 'Money Received is not allowed right now.');
      return;
    }

    setTransactionActionNotice('');
    setEditingTransaction(null);
    setTransactionType(type);
    setShowTransactionModal(true);
  };

  const openEditTransaction = (transaction: Transaction) => {
    setEditingTransaction(transaction);
    setTransactionType(transaction.type);
    setShowTransactionModal(true);
  };

  const closeTransactionModal = () => {
    setEditingTransaction(null);
    setShowTransactionModal(false);
  };

  const requestDeleteTransaction = (transaction: Transaction) => {
    setDeletingTransaction(transaction);
  };

  const handleDeleteTransaction = async () => {
    if (!person || !currentUser || !deletingTransaction) return;

    const actorName = resolveDisplayName(userProfile, currentUser);

    try {
      setDeleteLoading(true);
      await deleteDoc(doc(db, 'transactions', deletingTransaction.id));
      await recalculatePersonBalance(personId);

      try {
        await addDoc(collection(db, 'activity_logs'), {
          userId: currentUser.uid,
          userName: actorName,
          action: 'deleted transaction',
          details: `Deleted ${deletingTransaction.type} transaction of ${formatCurrency(deletingTransaction.amount)} for ${person.name}`,
          timestamp: serverTimestamp(),
          ledgerId: 'default',
        });
      } catch (logError) {
        console.warn('Transaction deleted, but activity log failed:', logError);
      }

      setDeletingTransaction(null);
    } catch (err) {
      console.error('Failed to delete transaction:', err);
    } finally {
      setDeleteLoading(false);
    }
  };

  if (!person) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-lg transition">
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className={`w-10 h-10 rounded-xl ${balanceMeta.iconBg} flex items-center justify-center flex-shrink-0`}>
              <span className={`text-lg font-bold ${balanceMeta.iconText}`}>
                {person.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-gray-900 truncate">{person.name}</h1>
              {person.phone && <p className="text-xs text-gray-500">{person.phone}</p>}
            </div>
            {(isSettled || latestTransaction?.type === 'received') && (
              <span className={`flex-shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-semibold ${balanceMeta.cardBg} ${balanceMeta.cardText}`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={isSettled ? 'M5 13l4 4L19 7' : 'M7 13l3 3 7-7'} />
                </svg>
                {balanceMeta.badgeLabel}
              </span>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6 pb-24 md:pb-6">
        <div className={`${balanceMeta.heroBg} rounded-2xl p-6 text-white mb-6 shadow-lg`}>
          <p className="text-sm opacity-90 mb-2">{balanceMeta.heroLabel}</p>
          <p className="text-4xl font-bold mb-2">{formatSignedCurrency(computedBalance)}</p>
          {!isSettled && computedBalance < 0 && (
            <p className="text-sm text-white/90">Negative balance means extra amount has already been received.</p>
          )}
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/20">
            <div>
              <p className="text-xs opacity-75 mb-1">Total Given</p>
              <p className="text-xl font-semibold">{formatCurrency(stats.totalGiven)}</p>
            </div>
            <div>
              <p className="text-xs opacity-75 mb-1">Total Received</p>
              <p className="text-xl font-semibold">{formatCurrency(stats.totalReceived)}</p>
            </div>
          </div>
        </div>

        {transactionActionNotice && (
          <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-sm">
            {transactionActionNotice}
          </div>
        )}

        {transactionAvailability.helperMessage && (
          <div className="mb-4 bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-xl text-sm">
            {transactionAvailability.helperMessage}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mb-6">
          <button
            onClick={() => openNewTransaction('given')}
            aria-disabled={!transactionAvailability.canGiven}
            className={`py-3 px-4 rounded-xl font-semibold transition flex items-center justify-center gap-2 border-2 ${
              transactionAvailability.canGiven
                ? 'bg-white border-orange-200 text-orange-700 hover:bg-orange-50'
                : 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
            {TRANSACTION_TYPE_LABELS.given}
          </button>
          <button
            onClick={() => openNewTransaction('received')}
            aria-disabled={!transactionAvailability.canReceived}
            className={`py-3 px-4 rounded-xl font-semibold transition flex items-center justify-center gap-2 border-2 ${
              transactionAvailability.canReceived
                ? 'bg-white border-green-200 text-green-700 hover:bg-green-50'
                : 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            {TRANSACTION_TYPE_LABELS.received}
          </button>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 space-y-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Transaction History</h2>
              <p className="text-sm text-gray-600">{filteredTransactions.length} of {transactions.length} transactions</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <input
                type="text"
                value={transactionSearch}
                onChange={(e) => setTransactionSearch(e.target.value)}
                placeholder="Search comment, type, or user"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
              />
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as 'all' | 'given' | 'received')}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none bg-white"
              >
                <option value="all">All Types</option>
                <option value="given">{TRANSACTION_TYPE_LABELS.given}</option>
                <option value="received">{TRANSACTION_TYPE_LABELS.received}</option>
              </select>
              <div className="grid grid-cols-2 gap-3 sm:col-span-2 lg:col-span-1">
                <input
                  type="text"
                  inputMode="decimal"
                  value={minAmount}
                  onChange={(e) => setMinAmount(formatAmountInput(e.target.value))}
                  placeholder="Min amount"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                />
                <input
                  type="text"
                  inputMode="decimal"
                  value={maxAmount}
                  onChange={(e) => setMaxAmount(formatAmountInput(e.target.value))}
                  placeholder="Max amount"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                />
              </div>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
              />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  setTransactionSearch('');
                  setTypeFilter('all');
                  setDateFrom('');
                  setDateTo('');
                  setMinAmount('');
                  setMaxAmount('');
                }}
                className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 transition"
              >
                Clear Filters
              </button>
            </div>
          </div>

          {filteredTransactions.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <p className="text-gray-600">{transactions.length === 0 ? 'No transactions yet' : 'No transactions match the current filters'}</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredTransactions.map((transaction) => (
                <TransactionItem
                  key={transaction.id}
                  transaction={transaction}
                  onEdit={() => openEditTransaction(transaction)}
                  onDelete={() => requestDeleteTransaction(transaction)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <button
        onClick={() => openNewTransaction(transactionAvailability.preferredType)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-full shadow-lg shadow-emerald-300 flex items-center justify-center hover:from-emerald-600 hover:to-teal-700 transition transform hover:scale-110 z-50 md:hidden"
        title={transactionAvailability.preferredType === 'given' ? TRANSACTION_TYPE_LABELS.given : TRANSACTION_TYPE_LABELS.received}
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>

      {showTransactionModal && (
        <AddTransactionModal
          personId={personId}
          personName={person.name}
          person={person}
          currentBalanceOverride={computedBalance}
          initialType={transactionType}
          existingTransaction={editingTransaction}
          onClose={closeTransactionModal}
        />
      )}

      {deletingTransaction && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Delete this transaction?</h3>
            <p className="text-sm text-gray-600 mb-6">
              This cannot be undone. The person balance will be recalculated immediately.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setDeletingTransaction(null)}
                disabled={deleteLoading}
                className="flex-1 px-4 py-3 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteTransaction}
                disabled={deleteLoading}
                className="flex-1 px-4 py-3 rounded-xl bg-red-600 text-white font-semibold hover:bg-red-700 transition disabled:opacity-50"
              >
                {deleteLoading ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
