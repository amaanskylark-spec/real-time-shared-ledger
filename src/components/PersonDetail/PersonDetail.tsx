import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../../services/firebase';
import { recalculatePersonBalance } from '../../services/ledger';
import { useAuth } from '../../contexts/AuthContext';
import { Person, Transaction } from '../../types';
import { AddTransactionModal, CATEGORIES } from '../Modals/AddTransactionModal';
import { TransactionItem } from './TransactionItem';
import { exportTransactionsPDF } from '../../utils/pdfExport';
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
    const n = value.includes('T') ? value : `${value}T00:00:00`;
    const p = new Date(n);
    if (!Number.isNaN(p.getTime())) return p;
  }
  const p = new Date(value);
  return Number.isNaN(p.getTime()) ? new Date() : p;
};

export const PersonDetail: React.FC<PersonDetailProps> = ({ personId, onBack }) => {
  const { currentUser } = useAuth();
  const [person, setPerson] = useState<Person | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [transactionType, setTransactionType] = useState<'given' | 'received'>('given');
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [confirmSoftDelete, setConfirmSoftDelete] = useState<Transaction | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  // ── filters ──────────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'given' | 'received'>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [addedByFilter, setAddedByFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [sortField, setSortField] = useState<'date' | 'amount' | 'category'>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [showDeleted, setShowDeleted] = useState(false);
  const [transactionActionNotice, setTransactionActionNotice] = useState('');

  // ── realtime listeners ────────────────────────────────────────────────────
  useEffect(() => {
    if (!personId) return;

    const unsubPerson = onSnapshot(doc(db, 'people', personId), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      setPerson({
        id: snap.id,
        ...data,
        createdAt: toSafeDate(data.createdAt),
        lastUpdated: toSafeDate(data.lastUpdated),
      } as Person);
    });

    const unsubTx = onSnapshot(
      query(collection(db, 'transactions'), where('personId', '==', personId)),
      (snap) => {
        const data = snap.docs.map((d) => {
          const tx = d.data();
          return {
            id: d.id,
            ...tx,
            date: toSafeDate(tx.date),
            createdAt: toSafeDate(tx.createdAt),
            updatedAt: toSafeDate(tx.updatedAt),
            deletedAt: tx.deletedAt ? toSafeDate(tx.deletedAt) : undefined,
          } as Transaction;
        });
        // Sort by sequenceNumber ascending for canonical order
        data.sort((a, b) => (a.sequenceNumber ?? 0) - (b.sequenceNumber ?? 0));
        setTransactions(data);
      }
    );

    return () => { unsubPerson(); unsubTx(); };
  }, [personId]);

  // ── derived ───────────────────────────────────────────────────────────────
  // Only non-deleted transactions affect balance calculations
  const activeTx = useMemo(() => transactions.filter((t) => !t.deleted), [transactions]);

  const computedBalance = useMemo(
    () => calculateBalanceFromTransactions(person?.initialBalance || 0, activeTx),
    [person?.initialBalance, activeTx]
  );

  const stats = useMemo(() => calculateTransactionTotals(activeTx), [activeTx]);
  const latestTx = activeTx[activeTx.length - 1] ?? null;
  const balanceMeta = getBalanceToneMeta(computedBalance, latestTx?.type);
  const isSettled = isSettledBalance(computedBalance);
  const txAvailability = useMemo(() => getTransactionTypeAvailability(computedBalance), [computedBalance]);

  // Unique added-by names for filter dropdown
  const addedByOptions = useMemo(() => {
    const names = new Set(transactions.map((t) => t.addedByName).filter(Boolean));
    return Array.from(names);
  }, [transactions]);

  // ── balance repair ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!person) return;
    const stored = Number(person.currentBalance || 0);
    if (Math.abs(stored - computedBalance) < 0.0001) return;
    recalculatePersonBalance(personId).catch(console.error);
  }, [computedBalance, person, personId]);

  // ── action notice ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!transactionActionNotice) return;
    const t = window.setTimeout(() => setTransactionActionNotice(''), 3200);
    return () => window.clearTimeout(t);
  }, [transactionActionNotice]);

  // ── filtered / sorted list ────────────────────────────────────────────────
  const filteredTransactions = useMemo(() => {
    const minAmt = parseAmountInput(minAmount);
    const maxAmt = parseAmountInput(maxAmount);

    let list = transactions.filter((t) => {
      // show/hide deleted
      if (!showDeleted && t.deleted) return false;

      const s = search.trim().toLowerCase();
      const desc = (t.description || t.comment || '').toLowerCase();
      const matchSearch =
        !s ||
        desc.includes(s) ||
        (t.addedByName || '').toLowerCase().includes(s) ||
        t.type.toLowerCase().includes(s) ||
        String(t.amount).includes(s) ||
        (t.category || '').toLowerCase().includes(s);

      const matchType = typeFilter === 'all' || t.type === typeFilter;
      const matchCat = categoryFilter === 'all' || (t.category || 'General') === categoryFilter;
      const matchBy = addedByFilter === 'all' || t.addedByName === addedByFilter;
      const dateStr = new Date(t.date).toISOString().split('T')[0];
      const matchFrom = !dateFrom || dateStr >= dateFrom;
      const matchTo = !dateTo || dateStr <= dateTo;
      const matchMin = !minAmount || t.amount >= minAmt;
      const matchMax = !maxAmount || t.amount <= maxAmt;

      return matchSearch && matchType && matchCat && matchBy && matchFrom && matchTo && matchMin && matchMax;
    });

    // Sort (but Sr.No reflects original sequenceNumber, not current order)
    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'date') cmp = a.date.getTime() - b.date.getTime();
      else if (sortField === 'amount') cmp = a.amount - b.amount;
      else if (sortField === 'category') cmp = (a.category || '').localeCompare(b.category || '');
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [transactions, search, typeFilter, categoryFilter, addedByFilter, dateFrom, dateTo, minAmount, maxAmount, sortField, sortDir, showDeleted]);

  // ── handlers ──────────────────────────────────────────────────────────────
  const openNew = (t: 'given' | 'received') => {
    if (t === 'given' && !txAvailability.canGiven) {
      setTransactionActionNotice(txAvailability.helperMessage || 'Not allowed');
      return;
    }
    if (t === 'received' && !txAvailability.canReceived) {
      setTransactionActionNotice(txAvailability.helperMessage || 'Not allowed');
      return;
    }
    setEditingTransaction(null);
    setTransactionType(t);
    setShowTransactionModal(true);
  };

  const openEdit = (tx: Transaction) => {
    setEditingTransaction(tx);
    setTransactionType(tx.type);
    setShowTransactionModal(true);
  };

  // Soft delete: mark deleted = true, don't remove from Firestore
  const handleSoftDelete = async () => {
    if (!confirmSoftDelete || !currentUser) return;
    try {
      setDeleteLoading(true);
      const actorName = currentUser.displayName || currentUser.username || 'Unknown';
      await updateDoc(doc(db, 'transactions', confirmSoftDelete.id), {
        deleted: true,
        deletedAt: new Date(),
        deletedBy: actorName,
      });
      await recalculatePersonBalance(personId);
      setConfirmSoftDelete(null);
    } catch (err) {
      console.error('Soft delete failed:', err);
    } finally {
      setDeleteLoading(false);
    }
  };

  // PDF export
  const handleExportPDF = useCallback(async () => {
    if (!person) return;
    setPdfLoading(true);
    try {
      const actorName = currentUser?.displayName || currentUser?.username || 'Unknown';
      await exportTransactionsPDF({
        person,
        transactions: activeTx,
        exportedBy: actorName,
      });
    } catch (err) {
      console.error('PDF export failed:', err);
      alert('PDF export failed. Please try again.');
    } finally {
      setPdfLoading(false);
    }
  }, [person, activeTx, currentUser]);

  const clearFilters = () => {
    setSearch('');
    setTypeFilter('all');
    setCategoryFilter('all');
    setAddedByFilter('all');
    setDateFrom('');
    setDateTo('');
    setMinAmount('');
    setMaxAmount('');
  };

  if (!person) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50">
      {/* Header */}
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
            {/* PDF download button */}
            <button
              onClick={handleExportPDF}
              disabled={pdfLoading || activeTx.length === 0}
              className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl text-sm font-semibold hover:from-emerald-600 hover:to-teal-700 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-emerald-200"
              title="Download PDF"
            >
              {pdfLoading ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              )}
              <span className="hidden sm:inline">{pdfLoading ? 'Generating...' : 'PDF'}</span>
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6 pb-24 md:pb-6">
        {/* Balance hero */}
        <div className={`${balanceMeta.heroBg} rounded-2xl p-6 text-white mb-6 shadow-lg`}>
          <p className="text-sm opacity-90 mb-1">{balanceMeta.heroLabel}</p>
          <p className="text-4xl font-bold mb-1">{formatSignedCurrency(computedBalance)}</p>
          {person.notes && (
            <p className="text-xs text-white/80 mt-1">📝 {person.notes}</p>
          )}
          {person.comment && (
            <p className="text-xs text-white/80">💬 {person.comment}</p>
          )}
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/20 mt-3">
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

        {/* Notices */}
        {transactionActionNotice && (
          <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-sm">
            {transactionActionNotice}
          </div>
        )}
        {txAvailability.helperMessage && (
          <div className="mb-4 bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-xl text-sm">
            {txAvailability.helperMessage}
          </div>
        )}

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {(['given', 'received'] as const).map((t) => {
            const canDo = t === 'given' ? txAvailability.canGiven : txAvailability.canReceived;
            return (
              <button
                key={t}
                onClick={() => openNew(t)}
                aria-disabled={!canDo}
                className={`py-3 px-4 rounded-xl font-semibold transition flex items-center justify-center gap-2 border-2 ${
                  canDo
                    ? t === 'given'
                      ? 'bg-white border-orange-200 text-orange-700 hover:bg-orange-50'
                      : 'bg-white border-green-200 text-green-700 hover:bg-green-50'
                    : 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                {TRANSACTION_TYPE_LABELS[t]}
              </button>
            );
          })}
        </div>

        {/* Transaction history card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {/* Card header */}
          <div className="px-5 py-4 border-b border-gray-100 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Transaction History</h2>
                <p className="text-sm text-gray-500">
                  Showing {filteredTransactions.length} of {transactions.filter(t => !t.deleted || showDeleted).length} entries
                </p>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showDeleted}
                    onChange={(e) => setShowDeleted(e.target.checked)}
                    className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  Show deleted
                </label>
                <button
                  onClick={handleExportPDF}
                  disabled={pdfLoading || activeTx.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition disabled:opacity-50"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Download PDF
                </button>
              </div>
            </div>

            {/* Filters grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {/* Search */}
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search description, type, user..."
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm"
              />
              {/* Type */}
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as any)}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none bg-white text-sm"
              >
                <option value="all">All Types</option>
                <option value="given">{TRANSACTION_TYPE_LABELS.given}</option>
                <option value="received">{TRANSACTION_TYPE_LABELS.received}</option>
              </select>
              {/* Category */}
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none bg-white text-sm"
              >
                <option value="all">All Categories</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              {/* Added by */}
              <select
                value={addedByFilter}
                onChange={(e) => setAddedByFilter(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none bg-white text-sm"
              >
                <option value="all">All Users</option>
                {addedByOptions.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              {/* Date range */}
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm" />
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm" />
              {/* Amount range */}
              <input type="text" inputMode="decimal" value={minAmount}
                onChange={(e) => setMinAmount(formatAmountInput(e.target.value))}
                placeholder="Min amount" className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm" />
              <input type="text" inputMode="decimal" value={maxAmount}
                onChange={(e) => setMaxAmount(formatAmountInput(e.target.value))}
                placeholder="Max amount" className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm" />
              {/* Sort */}
              <div className="flex gap-2">
                <select
                  value={sortField}
                  onChange={(e) => setSortField(e.target.value as any)}
                  className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none bg-white text-sm"
                >
                  <option value="date">Sort: Date</option>
                  <option value="amount">Sort: Amount</option>
                  <option value="category">Sort: Category</option>
                </select>
                <button
                  onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                  className="px-3 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 transition text-sm font-medium text-gray-700"
                  title={sortDir === 'asc' ? 'Ascending' : 'Descending'}
                >
                  {sortDir === 'asc' ? '↑ Asc' : '↓ Desc'}
                </button>
              </div>
              <button
                onClick={clearFilters}
                className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 transition text-sm"
              >
                Clear Filters
              </button>
            </div>
          </div>

          {/* List */}
          {filteredTransactions.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <p className="text-gray-600">
                {transactions.length === 0 ? 'No transactions yet' : 'No transactions match the current filters'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredTransactions.map((tx) => (
                <TransactionItem
                  key={tx.id}
                  transaction={tx}
                  onEdit={() => openEdit(tx)}
                  onDelete={() => setConfirmSoftDelete(tx)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* FAB */}
      <button
        onClick={() => openNew(txAvailability.preferredType)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-full shadow-lg shadow-emerald-300 flex items-center justify-center hover:from-emerald-600 hover:to-teal-700 transition transform hover:scale-110 z-50 md:hidden"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>

      {/* Transaction modal */}
      {showTransactionModal && (
        <AddTransactionModal
          personId={personId}
          personName={person.name}
          person={person}
          currentBalanceOverride={computedBalance}
          initialType={transactionType}
          existingTransaction={editingTransaction}
          onClose={() => { setEditingTransaction(null); setShowTransactionModal(false); }}
        />
      )}

      {/* Soft delete confirm */}
      {confirmSoftDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Delete this transaction?</h3>
            <p className="text-sm text-gray-600 mb-2">
              Transaction <strong>#{confirmSoftDelete.sequenceNumber}</strong> —{' '}
              {TRANSACTION_TYPE_LABELS[confirmSoftDelete.type]} of{' '}
              {formatCurrency(confirmSoftDelete.amount)}.
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-5 text-xs text-amber-800">
              ℹ️ This transaction will be <strong>soft-deleted</strong> — its Sr. No. is preserved permanently. You can view it by enabling "Show deleted" in filters.
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmSoftDelete(null)}
                disabled={deleteLoading}
                className="flex-1 px-4 py-3 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSoftDelete}
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
