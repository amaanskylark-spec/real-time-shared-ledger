import React from 'react';
import { Transaction } from '../../types';
import { useAuth, resolveDisplayName } from '../../contexts/AuthContext';
import { formatCurrency, TRANSACTION_TYPE_LABELS } from '../../utils/money';

interface TransactionItemProps {
  transaction: Transaction;
  onEdit: () => void;
  onDelete: () => void;
}

export const TransactionItem: React.FC<TransactionItemProps> = ({ transaction, onEdit, onDelete }) => {
  const { currentUser, userProfile } = useAuth();
  const isGiven = transaction.type === 'given';
  const bgColor = isGiven ? 'bg-orange-50' : 'bg-green-50';
  const borderColor = isGiven ? 'border-orange-200' : 'border-green-200';
  const textColor = isGiven ? 'text-orange-700' : 'text-green-700';
  const iconBg = isGiven ? 'bg-orange-100' : 'bg-green-100';

  const addedByName =
    transaction.addedByName && transaction.addedByName !== 'Unknown'
      ? transaction.addedByName
      : transaction.addedBy === currentUser?.uid
        ? resolveDisplayName(userProfile, currentUser)
        : 'User';

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="p-4 sm:p-5 hover:bg-gray-50 transition">
      <div className="flex items-start gap-3 sm:gap-4">
        <div className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl ${iconBg} flex items-center justify-center flex-shrink-0`}>
          {isGiven ? (
            <svg className="w-5 h-5 sm:w-6 sm:h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          ) : (
            <svg className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-col gap-3 mb-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h4 className="font-semibold text-gray-900 break-words">
                  {TRANSACTION_TYPE_LABELS[transaction.type]}
                </h4>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-bold ${bgColor} ${textColor} border ${borderColor}`}>
                  {formatCurrency(transaction.amount)}
                </span>
              </div>
              <p className="text-sm text-gray-600 break-words">
                Added by <span className="font-medium">{addedByName}</span>
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
              <button
                onClick={onEdit}
                className="w-full sm:w-auto px-3 py-2 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition"
                title="Edit transaction"
              >
                Edit
              </button>
              <button
                onClick={onDelete}
                className="w-full sm:w-auto px-3 py-2 text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition"
                title="Delete transaction"
              >
                Delete
              </button>
            </div>
          </div>

          {transaction.comment && (
            <div className="bg-gray-50 rounded-lg p-3 mb-2">
              <p className="text-sm text-gray-700 break-words">
                <svg className="w-4 h-4 inline-block mr-1.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                </svg>
                {transaction.comment}
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1 min-w-0">
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {formatDate(transaction.date)}
            </span>
            <span className="flex items-center gap-1 min-w-0">
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {formatTime(transaction.createdAt)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
