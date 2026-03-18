import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
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

interface HomeProps {
  onSelectPerson: (personId: string) => void;
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

export const Home: React.FC<HomeProps> = ({ onSelectPerson }) => {
  const { currentUser } = useAuth();
  const [people, setPeople] = useState<Person[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [showAddPerson, setShowAddPerson] = useState(false);
  const [showDeleteSecurity, setShowDeleteSecurity] = useState(false);
  const [personToDelete, setPersonToDelete] = useState<Person | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'balance' | 'recent' | 'settled'>('recent');

  useEffect(() => {
    if (!currentUser) return;

    const peopleQuery = query(collection(db, 'people'), orderBy('lastUpdated', 'desc'));

    const unsubscribePeople = onSnapshot(
      peopleQuery,
      (snapshot) => {
        const peopleData = snapshot.docs.map((personDoc) => {
          const data = personDoc.data();
          return {
            id: personDoc.id,
            ...data,
            createdAt: toSafeDate(data.createdAt),
            lastUpdated: toSafeDate(data.lastUpdated),
          } as Person;
        });

        setPeople(peopleData);
      },
      (error) => {
        console.error('Failed to listen to people:', error);
      }
    );

    const transactionsQuery = query(collection(db, 'transactions'));

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
      unsubscribePeople();
      unsubscribeTransactions();
    };
  }, [currentUser]);

  const derivedPeople = useMemo(() => {
    return people.map((person) => {
      const personTransactions = transactions.filter((transaction) => transaction.personId === person.id);
      const currentBalance = calculateBalanceFromTransactions(person.initialBalance || 0, personTransactions);
      const lastTransaction = personTransactions[0];

      return {
        ...person,
        currentBalance,
        lastUpdated: lastTransaction?.updatedAt || lastTransaction?.createdAt || person.lastUpdated,
        lastTransaction,
      };
    });
  }, [people, transactions]);

  const stats = useMemo(() => {
    const { totalGiven, totalReceived } = calculateTransactionTotals(transactions);
    const totalPending = derivedPeople.reduce(
      (sum, person) => sum + Math.max(Number(person.currentBalance || 0), 0),
      0
    );

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayTransactions = transactions.filter((transaction) => {
      const transactionDate = new Date(transaction.date);
      transactionDate.setHours(0, 0, 0, 0);
      return transactionDate.getTime() === today.getTime();
    });

    return {
      totalGiven,
      totalReceived,
      totalPending,
      todayTotal: todayTransactions.length,
    };
  }, [derivedPeople, transactions]);

  const filteredAndSortedPeople = useMemo(() => {
    return [...derivedPeople]
      .filter((person) => person.name.toLowerCase().includes(searchTerm.toLowerCase()))
      .sort((a, b) => {
        if (sortBy === 'balance') {
          return Number(b.currentBalance || 0) - Number(a.currentBalance || 0);
        }

        if (sortBy === 'settled') {
          const aSettled = isSettledBalance(a.currentBalance) ? 0 : 1;
          const bSettled = isSettledBalance(b.currentBalance) ? 0 : 1;
          if (aSettled !== bSettled) return aSettled - bSettled;
          return b.lastUpdated.getTime() - a.lastUpdated.getTime();
        }

        return b.lastUpdated.getTime() - a.lastUpdated.getTime();
      });
  }, [derivedPeople, searchTerm, sortBy]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50">
      <Header onOpenDeleteSecurity={() => setShowDeleteSecurity(true)} />

      <div className="max-w-6xl mx-auto px-4 py-6 pb-24 md:pb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Total Pending</span>
              <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
                <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(stats.totalPending)}</p>
          </div>

          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Total Given</span>
              <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
                <svg className="w-4 h-4 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(stats.totalGiven)}</p>
          </div>

          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Total Received</span>
              <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
                <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(stats.totalReceived)}</p>
          </div>

          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Today's Activity</span>
              <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900">{stats.todayTotal}</p>
          </div>
        </div>

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
              onChange={(e) => setSortBy(e.target.value as 'balance' | 'recent' | 'settled')}
              className="px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none bg-white"
            >
              <option value="recent">Recently Updated</option>
              <option value="balance">Highest Balance</option>
              <option value="settled">Settled First</option>
            </select>
          </div>
        </div>

        <div className="space-y-3">
          {filteredAndSortedPeople.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center shadow-sm border border-gray-100">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
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
          transactionCount={transactions.filter((transaction) => transaction.personId === personToDelete.id).length}
          onClose={() => setPersonToDelete(null)}
          onOpenSecuritySetup={() => {
            setPersonToDelete(null);
            setShowDeleteSecurity(true);
          }}
        />
      )}
    </div>
  );
};
