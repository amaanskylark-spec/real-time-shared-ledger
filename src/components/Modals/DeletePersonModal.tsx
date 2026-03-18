import React, { useEffect, useMemo, useState } from 'react';
import { Person } from '../../types';
import { useAuth, resolveDisplayName } from '../../contexts/AuthContext';
import { deletePersonWithTransactions } from '../../services/ledger';
import { formatSignedCurrency } from '../../utils/money';
import { normalizeOtpToken, verifyDeleteOtpToken } from '../../services/deleteSecurity';

interface DeletePersonModalProps {
  person: Person;
  transactionCount: number;
  onClose: () => void;
  onOpenSecuritySetup: () => void;
}

const MAX_RETRY_ATTEMPTS = 5;
const RETRY_LOCK_MS = 30_000;

export const DeletePersonModal: React.FC<DeletePersonModalProps> = ({
  person,
  transactionCount,
  onClose,
  onOpenSecuritySetup,
}) => {
  const { currentUser, userProfile } = useAuth();
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [tick, setTick] = useState(Date.now());

  const deleteProtectionEnabled = Boolean(userProfile?.deleteOtpEnabled && userProfile?.deleteOtpSecret);
  const secondsLeft = lockedUntil ? Math.max(0, Math.ceil((lockedUntil - tick) / 1000)) : 0;
  const attemptsLeft = Math.max(0, MAX_RETRY_ATTEMPTS - attempts);
  const isLocked = secondsLeft > 0;

  useEffect(() => {
    if (!lockedUntil) return;

    const timer = window.setInterval(() => {
      setTick(Date.now());
    }, 500);

    return () => window.clearInterval(timer);
  }, [lockedUntil]);

  useEffect(() => {
    if (!lockedUntil) return;
    if (Date.now() < lockedUntil) return;

    setLockedUntil(null);
    setAttempts(0);
    setError('');
  }, [lockedUntil, tick]);

  const detailText = useMemo(() => {
    const transactionLabel = transactionCount === 1 ? 'transaction' : 'transactions';
    return `${person.name} will be removed along with ${transactionCount} ${transactionLabel}. Current balance: ${formatSignedCurrency(person.currentBalance)}.`;
  }, [person.currentBalance, person.name, transactionCount]);

  const handleDelete = async () => {
    if (!currentUser) {
      setError('Please sign in again to delete this person.');
      return;
    }

    if (!deleteProtectionEnabled || !userProfile?.deleteOtpSecret) {
      setError('Enable Google Authenticator delete protection first.');
      return;
    }

    if (isLocked) {
      setError(`Too many invalid attempts. Try again in ${secondsLeft}s.`);
      return;
    }

    if (normalizeOtpToken(otp).length !== 6) {
      setError('Enter the 6-digit OTP from Google Authenticator.');
      return;
    }

    try {
      setLoading(true);
      setError('');

      const isValid = await verifyDeleteOtpToken(otp, userProfile.deleteOtpSecret);
      if (!isValid) {
        const nextAttempts = attempts + 1;
        setAttempts(nextAttempts);

        if (nextAttempts >= MAX_RETRY_ATTEMPTS) {
          setLockedUntil(Date.now() + RETRY_LOCK_MS);
          setError('Too many invalid codes. Delete authorization is temporarily locked for 30 seconds.');
        } else {
          setError(`Invalid OTP. Please try the latest code from Google Authenticator. ${MAX_RETRY_ATTEMPTS - nextAttempts} attempts left.`);
        }
        return;
      }

      await deletePersonWithTransactions({
        personId: person.id,
        personName: person.name,
        actorUserId: currentUser.uid,
        actorName: resolveDisplayName(userProfile, currentUser),
      });

      onClose();
    } catch (deleteError) {
      console.error('Failed to delete person entry:', deleteError);
      setError('Failed to delete this entry. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 px-4 py-6">
      <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl">
        <div className="border-b border-gray-100 px-6 py-5">
          <h2 className="text-xl font-bold text-gray-900">Delete {person.name}?</h2>
          <p className="mt-1 text-sm text-gray-500">A Google Authenticator code is required before this entry can be removed.</p>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {detailText}
          </div>

          {!deleteProtectionEnabled ? (
            <div className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
              <p>
                Google Authenticator delete protection is not enabled on your account yet. Set it up once, then come back and delete this entry securely.
              </p>
              <button
                type="button"
                onClick={onOpenSecuritySetup}
                className="w-full rounded-2xl bg-amber-500 px-4 py-3 font-semibold text-white transition hover:bg-amber-600"
              >
                Set Up Google Authenticator
              </button>
            </div>
          ) : (
            <>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">6-digit delete OTP</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otp}
                  onChange={(event) => {
                    setOtp(normalizeOtpToken(event.target.value));
                    if (error) setError('');
                  }}
                  placeholder="Enter OTP"
                  className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-center text-lg font-semibold tracking-[0.35em] text-gray-900 outline-none transition focus:border-transparent focus:ring-2 focus:ring-red-500"
                />
                <p className="mt-2 text-xs text-gray-500">
                  Valid codes refresh automatically every ~30 seconds in Google Authenticator.
                </p>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-600">
                Retry attempts left: <span className="font-semibold text-gray-800">{attemptsLeft}</span>
                {isLocked && <span className="ml-2 text-red-600">Locked for {secondsLeft}s</span>}
              </div>
            </>
          )}

          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-2xl border border-gray-200 px-4 py-3 font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={loading || !deleteProtectionEnabled || isLocked}
              className="rounded-2xl bg-red-600 px-4 py-3 font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Authorizing...' : 'Verify OTP & Delete'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
