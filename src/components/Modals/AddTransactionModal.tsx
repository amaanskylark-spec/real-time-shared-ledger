import React, { useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../../services/firebase';
import { recalculatePersonBalance } from '../../services/ledger';
import { useAuth } from '../../contexts/AuthContext';
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

export const CATEGORIES = [
  'General',
  'Loan',
  'Repayment',
  'Purchase',
  'Salary',
  'Advance',
  'Rent',
  'Utility',
  'Medical',
  'Travel',
  'Food',
  'Other',
] as const;

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

/** Returns the next sequenceNumber for a person's transactions */
async function getNextSequenceNumber(personId: string): Promise<number> {
  const snap = await getDocs(
    query(collection(db, 'transactions'), where('personId', '==', personId))
  );
  if (snap.empty) return 1;
  let max = 0;
  snap.forEach((d) => {
    const sn = Number(d.data().sequenceNumber ?? 0);
    if (sn > max) max = sn;
  });
  return max + 1;
}

export const AddTransactionModal: React.FC<AddTransactionModalProps> = ({
  personId,
  personName,
  person: initialPerson,
  currentBalanceOverride,
  initialType,
  existingTransaction,
  onClose,
}) => {
  const { currentUser } = useAuth();
  const [person, setPerson] = useState<Person>(initialPerson);
  const [type, setType] = useState<'given' | 'received'>(existingTransaction?.type || initialType);
  const [amount, setAmount] = useState(
    existingTransaction ? formatAmountInput(String(existingTransaction.amount)) : ''
  );
  const [date, setDate] = useState(formatDateInputValue(existingTransaction?.date));
  const [description, setDescription] = useState(
    existingTransaction?.description || existingTransaction?.comment || ''
  );
  const [category, setCategory] = useState<string>(existingTransaction?.category || 'General');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'people', personId), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      setPerson({
        id: snap.id,
        ...data,
        createdAt: toPersonDate(data.createdAt),
        lastUpdated: toPersonDate(data.lastUpdated),
      } as Person);
    });
    return () => unsub();
  }, [personId]);

  const transactionAmount = parseAmountInput(amount);
  const effectiveCurrentBalance = roundMoney(
    typeof currentBalanceOverride === 'number' ? currentBalanceOverride : Number(person.currentBalance || 0)
  );
  const originalAmount = existingTransaction ? Number(existingTransaction.amount || 0) : 0;
  const originalDelta = existingTransaction ? getBalanceDelta(existingTransaction.type, originalAmount) : 0;
  const baseBalanceWithoutExisting = roundMoney(effectiveCurrentBalance - originalDelta);
  const previewBalance = useMemo(
    () => roundMoney(baseBalanceWithoutExisting + getBalanceDelta(type, transactionAmount)),
    [baseBalanceWithoutExisting, transactionAmount, type]
  );
  const transactionAvailability = useMemo(
    () =>
      existingTransaction
        ? { canGiven: true, canReceived: true, preferredType: type, helperMessage: '' }
        : getTransactionTypeAvailability(effectiveCurrentBalance),
    [effectiveCurrentBalance, existingTransaction, type]
  );

  useEffect(() => {
    if (existingTransaction) return;
    if (type === 'given' && !transactionAvailability.canGiven) setType(transactionAvailability.preferredType);
    if (type === 'received' && !transactionAvailability.canReceived) setType(transactionAvailability.preferredType);
  }, [existingTransaction, transactionAvailability, type]);

  const handleTypeSelection = (next: 'given' | 'received') => {
    if (!existingTransaction) {
      if (next === 'given' && !transactionAvailability.canGiven) {
        setError(transactionAvailability.helperMessage || 'Not allowed');
        return;
      }
      if (next === 'received' && !transactionAvailability.canReceived) {
        setError(transactionAvailability.helperMessage || 'Not allowed');
        return;
      }
    }
    setType(next);
    if (error) setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) { setError('Please login'); return; }
    if (!date) { setError('Choose a valid date'); return; }
    if (!Number.isFinite(transactionAmount) || transactionAmount <= 0) {
      setError('Amount must be greater than zero');
      return;
    }

    const actorName = currentUser.displayName || currentUser.username || 'Unknown';

    try {
      setError('');
      setLoading(true);

      const transactionDate = Timestamp.fromDate(new Date(`${date}T00:00:00`));
      const now = new Date();
      const payload: Record<string, any> = {
        personId,
        amount: transactionAmount,
        type,
        category,
        description: description.trim(),
        comment: description.trim(), // keep backward-compat alias
        date: transactionDate,
        dateLabel: date,
        addedBy: existingTransaction?.addedBy || currentUser.uid,
        addedByName: existingTransaction?.addedByName || actorName,
        updatedAt: now,
        deleted: false,
      };

      if (existingTransaction) {
        await updateDoc(doc(db, 'transactions', existingTransaction.id), payload);
      } else {
        // Assign permanent sequential number
        const seqNum = await getNextSequenceNumber(personId);
        await addDoc(collection(db, 'transactions'), {
          ...payload,
          sequenceNumber: seqNum,
          createdAt: now,
        });
      }

      await recalculatePersonBalance(personId);
      onClose();
    } catch (err: any) {
      console.error('Transaction error:', err);
      setError(err?.message || 'Failed to save transaction.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end md:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-t-3xl md:rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-3xl md:rounded-t-2xl">
          <h2 className="text-xl font-bold text-gray-900">
            {existingTransaction ? 'Edit Transaction' : 'Add Transaction'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition">
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
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

          {/* Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Transaction Type <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              {(['given', 'received'] as const).map((t) => {
                const disabled = !existingTransaction &&
                  (t === 'given' ? !transactionAvailability.canGiven : !transactionAvailability.canReceived);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => handleTypeSelection(t)}
                    className={`py-3 px-4 rounded-xl font-semibold transition border-2 ${
                      disabled
                        ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                        : type === t
                        ? t === 'given'
                          ? 'bg-orange-50 border-orange-300 text-orange-700'
                          : 'bg-green-50 border-green-300 text-green-700'
                        : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {TRANSACTION_TYPE_LABELS[t]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Amount */}
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
                onChange={(e) => { setAmount(formatAmountInput(e.target.value)); if (error) setError(''); }}
                className="w-full pl-8 pr-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition"
                placeholder="20,000"
                required
              />
            </div>
          </div>

          {/* Date */}
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

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none bg-white"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description <span className="text-gray-400 text-xs">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition resize-none"
              placeholder="e.g., UPI payment, first installment, shop loan..."
              rows={3}
            />
          </div>

          {/* Preview */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <p className="text-sm text-blue-900">
              New balance will be: <strong>{formatSignedCurrency(previewBalance)}</strong>
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
              className="flex-1 px-4 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-semibold hover:from-emerald-600 hover:to-teal-700 transition shadow-lg shadow-emerald-200 disabled:opacity-50"
            >
              {loading ? (existingTransaction ? 'Saving...' : 'Adding...') : existingTransaction ? 'Save Changes' : 'Add Transaction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
