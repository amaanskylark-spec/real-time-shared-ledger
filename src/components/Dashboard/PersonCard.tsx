import React from 'react';
import { Person, Transaction } from '../../types';
import {
  formatCurrency,
  formatSignedCurrency,
  getBalanceToneMeta,
  isSettledBalance,
  TRANSACTION_TYPE_LABELS,
} from '../../utils/money';

interface PersonCardProps {
  person: Person;
  lastTransaction?: Transaction | null;
  onClick: () => void;
  onDelete: () => void;
}

export const PersonCard: React.FC<PersonCardProps> = ({ person, lastTransaction, onClick, onDelete }) => {
  const isSettled = isSettledBalance(person.currentBalance);
  const balanceMeta = getBalanceToneMeta(person.currentBalance, lastTransaction?.type);

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-gray-100 hover:shadow-md hover:border-gray-200 transition cursor-pointer group"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className={`w-12 h-12 rounded-xl ${balanceMeta.iconBg} flex items-center justify-center flex-shrink-0`}>
            <span className={`text-lg font-bold ${balanceMeta.iconText}`}>
              {person.name.charAt(0).toUpperCase()}
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h3 className="text-lg font-semibold text-gray-900 truncate">{person.name}</h3>
              {isSettled && (
                <span className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Settled
                </span>
              )}
            </div>

            {/* Phone */}
            {person.phone && (
              <p className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                {person.phone}
              </p>
            )}

            {/* Last transaction */}
            {lastTransaction && (
              <p className="text-sm text-gray-600 break-words">
                Last: {TRANSACTION_TYPE_LABELS[lastTransaction.type]} {formatCurrency(lastTransaction.amount)}
                {(lastTransaction.description || lastTransaction.comment) && (
                  <span className="text-gray-400"> • {lastTransaction.description || lastTransaction.comment}</span>
                )}
              </p>
            )}

            {/* Notes */}
            {person.notes && (
              <p className="text-xs text-gray-500 mt-1 break-words flex items-start gap-1">
                <svg className="w-3 h-3 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                {person.notes}
              </p>
            )}

            {/* Comment/description */}
            {person.comment && (
              <p className="text-xs text-gray-500 mt-1 break-words flex items-start gap-1">
                <svg className="w-3 h-3 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                </svg>
                {person.comment}
              </p>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="inline-flex flex-shrink-0 items-center justify-center rounded-xl border border-red-200 bg-red-50 p-2.5 text-red-700 transition hover:bg-red-100 sm:px-3 sm:py-2"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3M4 7h16" />
          </svg>
          <span className="hidden sm:inline ml-1.5 text-xs font-semibold">Delete</span>
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className={`inline-flex items-center px-3 py-1.5 rounded-lg ${balanceMeta.cardBg} border ${balanceMeta.cardBorder}`}>
            <span className={`text-lg font-bold ${balanceMeta.cardText}`}>
              {formatSignedCurrency(person.currentBalance)}
            </span>
          </div>
          {!isSettled && (
            <p className={`text-xs mt-2 font-medium ${balanceMeta.cardText}`}>{balanceMeta.helperLabel}</p>
          )}
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-3 text-xs text-gray-500">
          <span>
            Added {new Date(person.createdAt).toLocaleDateString('en-IN', {
              day: 'numeric', month: 'short', year: 'numeric',
            })}
          </span>
          <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
            Open
            <svg className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </span>
        </div>
      </div>
    </div>
  );
};
