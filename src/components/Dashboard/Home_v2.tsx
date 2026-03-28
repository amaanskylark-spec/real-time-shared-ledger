import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { Person, Transaction } from '../../types';
import { PersonCard } from './PersonCard';
import { AddPersonModal } from '../Modals/AddPersonModal';
import { DeletePersonModal } from '../Modals/DeletePersonModal';
import { DeleteSecurityModal } from '../Modals/DeleteSecurityModal';
import { Header } from '../Layout/Header';
import {
  calculateBalanceFromTransactions,
  calculateTransactionTotals,
  formatCurrency,
  isSettledBalance,
} from '../../utils/money';
import { exportTransactionsPDF } from '../../utils/pdfExport';

interface HomeProps {
  onSelectPerson: (personId: string) => void;
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

const sortTransactionsBySeq = (items: Transaction[]) =>
  [...items].sort((a, b) => (a.sequenceNumber ?? 0) - (b.sequenceNumber ?? 0));

export const Home: React.FC<HomeProps> = ({ onSelectPerson }) => {
  const { currentUser } = useAuth();
  const [people, setPeople] = useState<Person[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [showAddPerson, setShowAddPerson] = useState(false);
  const [showDeleteSecurity, setShowDeleteSecurity] = useState(false);
  const [personToDelete, setPersonToDelete] = useState<Person | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'oldest' | 'newest' | 'balance' | 'settled'>('oldest');
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => {
    if (!currentUser) return;

    // No orderBy — sort client-side so new entries appear instantly (bug fix)
    const unsubPeople = onSnapshot(query(collection(db, 'people')), (snap) => {
      const data = snap.docs.map((d) => {
        const doc = d.data();
        return {
          id: d.id,
          ...doc,
          createdAt: toSafeDate(doc.createdAt),
          lastUpdated: toSafeDate(doc.lastUpdated),
        } as Person;
      });
      setPeople(data);
    }, console.error);

    const unsubTx = onSnapshot(query(collection(db, 'transactions')), (snap) => {
      const data = snap.docs.map((d) => {
        const doc = d.data();
        return {
          id: d.id,
          ...doc,
          date: toSafeDate(doc.date),
          createdAt: toSafeDate(doc.createdAt),
          updatedAt: toSafeDate(doc.updatedAt),
        } as Transaction;
      });
      setTransactions(sortTransactionsBySeq(data));
    }, console.error);

    return () => { unsubPeople(); unsubTx(); };
  }, [currentUser]);

  const activeTx = useMemo(() => transactions.filter((t) => !t.deleted), [transactions]);

  const derivedPeople = useMemo(() => {
    return people.map((person) => {
      const personTx = activeTx.filter((t) => t.personId === person.id);
      const currentBalance = calculateBalanceFromTransactions(person.initialBalance || 0, personTx);
      const lastTransaction = personTx.length > 0 ? personTx[personTx.length - 1] : null;
      return {
        ...person,
        currentBalance,
        lastUpdated: lastTransaction?.updatedAt || lastTransaction?.createdAt || person.lastUpdated || new Date(),
        lastTransaction,
      };
    });
  }, [people, activeTx]);

  const stats = useMemo(() => {
    const { totalGiven, totalReceived } = calculateTransactionTotals(activeTx);
    const totalPending = derivedPeople.reduce(
      (sum, p) => sum + Math.max(Number(p.currentBalance || 0), 0),
      0
    );
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTotal = activeTx.filter((t) => {
      const d = new Date(t.date);
      d.setHours(0, 0, 0, 0);
      return d.getTime() === today.getTime();
    }).length;
    return { totalGiven, totalReceived, totalPending, todayTotal };
  }, [derivedPeople, activeTx]);

  const filteredAndSortedPeople = useMemo(() => {
    return [...derivedPeople]
      .filter((p) => p.name.toLowerCase().includes(searchTerm.toLowerCase()))
      .sort((a, b) => {
        if (sortBy === 'oldest') return a.createdAt.getTime() - b.createdAt.getTime();
        if (sortBy === 'newest') return b.createdAt.getTime() - a.createdAt.getTime();
        if (sortBy === 'balance') return Number(b.currentBalance || 0) - Number(a.currentBalance || 0);
        if (sortBy === 'settled') {
          const aS = isSettledBalance(a.currentBalance) ? 0 : 1;
          const bS = isSettledBalance(b.currentBalance) ? 0 : 1;
          if (aS !== bS) return aS - bS;
          return a.createdAt.getTime() - b.createdAt.getTime();
        }
        return 0;
      });
  }, [derivedPeople, searchTerm, sortBy]);

  const handleExportAll = async () => {
    setPdfLoading(true);
    try {
      const actorName = currentUser?.displayName || currentUser?.username || 'Unknown';
      await exportTransactionsPDF({ transactions: activeTx, exportedBy: actorName });
    } catch (err) {
      console.error('PDF export failed:', err);
      alert('PDF export failed.');
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50">
      <Header onOpenDeleteSecurity={() => setShowDeleteSecurity(true)} />

      <div className="max-w-6xl mx-auto px-4 py-6 pb-24 md:pb-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total Pending', value: formatCurrency(stats.totalPending), colorClass: 'bg-red-100 text-red-600', path: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
            { label: 'Total Given', value: formatCurrency(stats.totalGiven), colorClass: 'bg-orange-100 text-orange-600', path: 'M12 19l9 2-9-18-9 18 9-2zm0 0v-8' },
            { label: 'Total Received', value: formatCurrency(stats.totalReceived), colorClass: 'bg-green-100 text-green-600', path: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
            { label: "Today's Activity", value: String(stats.todayTotal), colorClass: 'bg-blue-100 text-blue-600', path: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6' },
          ].map(({ label, value, colorClass, path }) => (
            <div key={label} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">{label}</span>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colorClass}`}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={path} />
                  </svg>
                </div>
              </div>
              <p className="text-2xl font-bold text-gray-900">{value}</p>
            </div>
          ))}
        </div>

        {/* Search + sort + export */}
        <div className="bg-white rounded-2xl p-4 mb-6 shadow-sm border border-gray-100">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search by person name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
              />
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none bg-white"
            >
              <option value="oldest">Oldest First (Default)</option>
              <option value="newest">Newest First</option>
              <option value="balance">Highest Balance</option>
              <option value="settled">Settled First</option>
            </select>
            <button
              onClick={handleExportAll}
              disabled={pdfLoading || activeTx.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 font-semibold hover:bg-emerald-100 transition disabled:opacity-50 text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {pdfLoading ? 'Generating...' : 'Export All PDF'}
            </button>
          </div>
        </div>

        {/* People list */}
        <div className="space-y-3">
          {filteredAndSortedPeople.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center shadow-sm border border-gray-100">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No people added yet</h3>
              <p className="text-gray-600 mb-6">Start by adding a person to track transactions</p>
              <button
                onClick={() => setShowAddPerson(true)}
                className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-semibold hover:from-emerald-600 hover:to-teal-700 transition shadow-lg shadow-emerald-200"
              >
                Add First Person
              </button>
            </div>
          ) : (
            filteredAndSortedPeople.map((person) => (
              <PersonCard
                key={person.id}
                person={person}
                lastTransaction={person.lastTransaction}
                onClick={() => onSelectPerson(person.id)}
                onDelete={() => setPersonToDelete(person)}
              />
            ))
          )}
        </div>
      </div>

      {/* FAB */}
      <button
        onClick={() => setShowAddPerson(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-full shadow-lg shadow-emerald-300 flex items-center justify-center hover:from-emerald-600 hover:to-teal-700 transition transform hover:scale-110 z-50"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>

      {showAddPerson && <AddPersonModal onClose={() => setShowAddPerson(false)} />}
      {showDeleteSecurity && <DeleteSecurityModal onClose={() => setShowDeleteSecurity(false)} />}
      {personToDelete && (
        <DeletePersonModal
          person={personToDelete}
          transactionCount={activeTx.filter((t) => t.personId === personToDelete.id).length}
          onClose={() => setPersonToDelete(null)}
          onOpenSecuritySetup={() => { setPersonToDelete(null); setShowDeleteSecurity(true); }}
        />
      )}
    </div>
  );
};
