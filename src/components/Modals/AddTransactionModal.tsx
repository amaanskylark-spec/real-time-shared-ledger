import React, { useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../../services/firebase';
import { recalculatePersonBalance } from '../../services/ledger';
import { useAuth, resolveDisplayName } from '../../contexts/AuthContext';
import { Person, Transaction } from '../../types';
import {
  formatAmountInput,
  formatCurrency,
  formatSignedCurrency,
  getBalanceDelta,
  getTransactionTypeAvailability,
  parseAmountInput,
  roundMoney,
  TRANSACTION_TYPE_LABELS,
} from '../../utils/money';

interface AddTransactionModalProps {
  personId: string;
  personName: string;
  person: Person;
  currentBalanceOverride?: number;
  initialType: 'given' | 'received';
  existingTransaction?: Transaction | null;
  onClose: () => void;
}

const toPersonDate = (value: any): Date => {
  if (value?.toDate) return value.toDate();
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const formatDateInputValue = (value?: Date) => {
  if (!value) return new Date().toISOString().split('T')[0];
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().split('T')[0];
  return date.toISOString().split('T')[0];
};

export const AddTransactionModal: React.FC<AddTransactionModalProps> = ({
  personId,
  personName,
  person: initialPerson,
  currentBalanceOverride,
  initialType,
  existingTransaction,
  onClose,
}) => {
  const { currentUser, userProfile } = useAuth();
  const [person, setPerson] = useState<Person>(initialPerson);
  const [type, setType] = useState<'given' | 'received'>(existingTransaction?.type || initialType);
  const [amount, setAmount] = useState(
    existingTransaction ? formatAmountInput(String(existingTransaction.amount)) : ''
  );
  const [date, setDate] = useState(formatDateInputValue(existingTransaction?.date));
  const [comment, setComment] = useState(existingTransaction?.comment || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, 'people', personId),
      (snapshot) => {
        if (!snapshot.exists()) return;

        const data = snapshot.data();
        setPerson({
          id: snapshot.id,
          ...data,
          createdAt: toPersonDate(data.createdAt),
          lastUpdated: toPersonDate(data.lastUpdated),
        } as Person);
      },
      (snapshotError) => {
        console.error('Failed to watch person updates:', snapshotError);
      }
    );

    return () => unsubscribe();
  }, [personId]);

  const transactionAmount = parseAmountInput(amount);
  const effectiveCurrentBalance = roundMoney(
    typeof currentBalanceOverride === 'number' ? currentBalanceOverride : Number(person.currentBalance || 0)
  );
  const originalAmount = existingTransaction ? Number(existingTransaction.amount || 0) : 0;
  const originalDelta = existingTransaction ? getBalanceDelta(existingTransaction.type, originalAmount) : 0;
  const baseBalanceWithoutExisting = roundMoney(effectiveCurrentBalance - originalDelta);
  const previewBalance = useMemo(() => {
    return roundMoney(baseBalanceWithoutExisting + getBalanceDelta(type, transactionAmount));
  }, [baseBalanceWithoutExisting, transactionAmount, type]);
  const transactionAvailability = useMemo(() => {
    return existingTransaction
      ? { canGiven: true, canReceived: true, preferredType: type, helperMessage: '' }
      : getTransactionTypeAvailability(effectiveCurrentBalance);
  }, [effectiveCurrentBalance, existingTransaction, type]);

  useEffect(() => {
    if (existingTransaction) return;

    if (type === 'given' && !transactionAvailability.canGiven) {
      setType(transactionAvailability.preferredType);
    }

    if (type === 'received' && !transactionAvailability.canReceived) {
      setType(transactionAvailability.preferredType);
    }
  }, [existingTransaction, transactionAvailability, type]);

  const handleTypeSelection = (nextType: 'given' | 'received') => {
    if (existingTransaction) {
      setType(nextType);
      if (error) setError('');
      return;
    }

    if (nextType === 'given' && !transactionAvailability.canGiven) {
      setError(transactionAvailability.helperMessage || 'This transaction type is not allowed right now.');
      return;
    }

    if (nextType === 'received' && !transactionAvailability.canReceived) {
      setError(transactionAvailability.helperMessage || 'This transaction type is not allowed right now.');
      return;
    }

    setType(nextType);
    if (error) setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentUser) {
      setError('Please login to add transaction');
      return;
    }

    if (!date) {
      setError('Please choose a valid transaction date');
      return;
    }

    if (!Number.isFinite(transactionAmount) || transactionAmount <= 0) {
      setError('Amount must be greater than zero');
      return;
    }

    if (!existingTransaction) {
      if (type === 'given' && !transactionAvailability.canGiven) {
        setError(transactionAvailability.helperMessage || 'Money Given is not allowed for this balance state.');
        return;
      }

      if (type === 'received' && !transactionAvailability.canReceived) {
        setError(transactionAvailability.helperMessage || 'Money Received is not allowed for this balance state.');
        return;
      }
    }

    const actorName = resolveDisplayName(userProfile, currentUser);

    try {
      setError('');
      setLoading(true);

      const transactionDate = Timestamp.fromDate(new Date(`${date}T00:00:00`));
      const transactionPayload = {
        personId,
        amount: transactionAmount,
        type,
        date: transactionDate,
        dateLabel: date,
        addedBy: existingTransaction?.addedBy || currentUser.uid,
        addedByName: existingTransaction?.addedByName || actorName,
        comment: comment.trim(),
        updatedAt: serverTimestamp(),
      };

      if (existingTransaction) {
        await updateDoc(doc(db, 'transactions', existingTransaction.id), transactionPayload);
      } else {
        await addDoc(collection(db, 'transactions'), {
          ...transactionPayload,
          createdAt: serverTimestamp(),
        });
      }

      await recalculatePersonBalance(personId);

      try {
        await addDoc(collection(db, 'activity_logs'), {
          userId: currentUser.uid,
          userName: actorName,
          action: existingTransaction ? 'updated transaction' : `${type} transaction`,
          details: `${existingTransaction ? 'Updated' : type === 'given' ? 'Gave' : 'Received'} ${formatCurrency(transactionAmount)} ${type === 'given' ? 'for' : 'from'} ${personName}${comment.trim() ? ` - ${comment.trim()}` : ''}`,
          timestamp: serverTimestamp(),
          ledgerId: 'default',
        });
      } catch (logError) {
        console.warn('Transaction saved, but activity log failed:', logError);
      }

      onClose();
    } catch (err: any) {
      console.error('Transaction error:', err);
      setError(err?.message || 'Failed to save transaction. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end md:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-t-3xl md:rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-3xl md:rounded-t-2xl">
          <h2 className="text-xl font-bold text-gray-900">{existingTransaction ? 'Edit Transaction' : 'Add Transaction'}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition">
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-sm text-gray-600 mb-1">Transaction for</p>
            <p className="text-lg font-semibold text-gray-900">{personName}</p>
            <p className="text-sm text-gray-600 mt-1">
              Current balance:{' '}
              <span
                className={`font-semibold ${
                  Math.abs(effectiveCurrentBalance) < 0.0001
                    ? 'text-green-600'
                    : effectiveCurrentBalance < 0
                      ? 'text-green-700'
                      : 'text-red-600'
                }`}
              >
                {formatSignedCurrency(effectiveCurrentBalance)}
              </span>
            </p>
          </div>

          {!existingTransaction && transactionAvailability.helperMessage && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg text-sm">
              {transactionAvailability.helperMessage}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Transaction Type <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleTypeSelection('given')}
                className={`py-3 px-4 rounded-xl font-semibold transition border-2 ${
                  !existingTransaction && !transactionAvailability.canGiven
                    ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                    : type === 'given'
                      ? 'bg-orange-50 border-orange-300 text-orange-700'
                      : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
                aria-disabled={!existingTransaction && !transactionAvailability.canGiven}
                title={!existingTransaction && !transactionAvailability.canGiven ? transactionAvailability.helperMessage : TRANSACTION_TYPE_LABELS.given}
              >
                <svg className="w-5 h-5 mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
                {TRANSACTION_TYPE_LABELS.given}
              </button>
              <button
                type="button"
                onClick={() => handleTypeSelection('received')}
                className={`py-3 px-4 rounded-xl font-semibold transition border-2 ${
                  !existingTransaction && !transactionAvailability.canReceived
                    ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                    : type === 'received'
                      ? 'bg-green-50 border-green-300 text-green-700'
                      : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
                aria-disabled={!existingTransaction && !transactionAvailability.canReceived}
                title={!existingTransaction && !transactionAvailability.canReceived ? transactionAvailability.helperMessage : TRANSACTION_TYPE_LABELS.received}
              >
                <svg className="w-5 h-5 mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                {TRANSACTION_TYPE_LABELS.received}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Amount <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-semibold">₹</span>
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => {
                  setAmount(formatAmountInput(e.target.value));
                  if (error) setError('');
                }}
                className="w-full pl-8 pr-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition"
                placeholder="20,000"
                required
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">Use amount greater than zero</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Comment <span className="text-gray-400 text-xs">(optional)</span>
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition resize-none"
              placeholder="e.g., UPI payment received, First installment, Loan for shop..."
              rows={3}
            />
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <p className="text-sm text-blue-900">
              <svg className="w-4 h-4 inline-block mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              New balance will be: {formatSignedCurrency(previewBalance)}
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 border-2 border-gray-300 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-semibold hover:from-emerald-600 hover:to-teal-700 transition shadow-lg shadow-emerald-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (existingTransaction ? 'Saving...' : 'Adding...') : existingTransaction ? 'Save Changes' : 'Add Transaction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
