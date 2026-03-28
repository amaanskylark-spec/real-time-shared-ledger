import React from 'react';
import { Transaction } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { formatCurrency, TRANSACTION_TYPE_LABELS } from '../../utils/money';

interface TransactionItemProps {
  transaction: Transaction;
  onEdit: () => void;
  onDelete: () => void;
}

export const TransactionItem: React.FC<TransactionItemProps> = ({ transaction, onEdit, onDelete }) => {
  const { currentUser } = useAuth();
  const isGiven = transaction.type === 'given';
  const isDeleted = transaction.deleted === true;

  const bgColor = isGiven ? 'bg-orange-50' : 'bg-green-50';
  const borderColor = isGiven ? 'border-orange-200' : 'border-green-200';
  const textColor = isGiven ? 'text-orange-700' : 'text-green-700';
  const iconBg = isGiven ? 'bg-orange-100' : 'bg-green-100';

  const addedByName =
    transaction.addedByName && transaction.addedByName !== 'Unknown'
      ? transaction.addedByName
      : transaction.addedBy === currentUser?.uid
      ? currentUser?.displayName || currentUser?.username || 'User'
      : 'User';

  const description = transaction.description || transaction.comment || '';
  const category = transaction.category || 'General';

  const formatDate = (date: Date) =>
    new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  const formatTime = (date: Date) =>
    new Date(date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  if (isDeleted) {
    return (
      <div className="p-4 sm:p-5 bg-gray-50 opacity-60">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gray-200 flex items-center justify-center flex-shrink-0 text-xs font-bold text-gray-400">
            #{transaction.sequenceNumber ?? '—'}
          </div>
          <p className="text-sm text-gray-400 italic line-through">
            {TRANSACTION_TYPE_LABELS[transaction.type]} — {formatCurrency(transaction.amount)} — Deleted
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-5 hover:bg-gray-50 transition">
      <div className="flex items-start gap-3 sm:gap-4">
        {/* Sr. No badge */}
        <div className="flex-shrink-0 flex flex-col items-center gap-1">
          <div className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center">
            <span className="text-xs font-bold text-slate-500">#{transaction.sequenceNumber ?? '—'}</span>
          </div>
          <div className={`w-9 h-9 rounded-xl ${iconBg} flex items-center justify-center`}>
            {isGiven ? (
              <svg className="w-4 h-4 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            )}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          {/* Top row: type badge + amount + action buttons */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between mb-2">
            <div className="min-w-0 flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${bgColor} ${textColor} border ${borderColor}`}>
                {TRANSACTION_TYPE_LABELS[transaction.type]}
              </span>
              <span className={`text-base font-bold ${isGiven ? 'text-orange-700' : 'text-green-700'}`}>
                {formatCurrency(transaction.amount)}
              </span>
              {/* Category pill */}
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                {category}
              </span>
            </div>

            <div className="flex gap-2">
              <button
                onClick={onEdit}
                className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition"
              >
                Edit
              </button>
              <button
                onClick={onDelete}
                className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition"
              >
                Delete
              </button>
            </div>
          </div>

          {/* Description */}
          {description && (
            <div className="bg-gray-50 rounded-lg px-3 py-2 mb-2">
              <p className="text-sm text-gray-700 break-words">
                <svg className="w-3.5 h-3.5 inline-block mr-1.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                </svg>
                {description}
              </p>
            </div>
          )}

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {formatDate(transaction.date)}
            </span>
            <span className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {formatTime(transaction.createdAt)}
            </span>
            <span className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              {addedByName}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
