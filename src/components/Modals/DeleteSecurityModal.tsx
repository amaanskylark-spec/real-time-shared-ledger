import React, { useEffect, useMemo, useState } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../services/firebase';
import {
  buildDeleteOtpUri,
  createDeleteOtpQrCode,
  formatSecretForDisplay,
  generateDeleteOtpSecret,
  getDeleteOtpAccountLabel,
  getDeleteOtpWindowSeconds,
  normalizeOtpToken,
  verifyDeleteOtpToken,
} from '../../services/deleteSecurity';

interface DeleteSecurityModalProps {
  onClose: () => void;
}

export const DeleteSecurityModal: React.FC<DeleteSecurityModalProps> = ({ onClose }) => {
  const { currentUser, userProfile } = useAuth();
  const [setupSecret, setSetupSecret] = useState('');
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const deleteProtectionEnabled = Boolean(userProfile?.deleteOtpEnabled && userProfile?.deleteOtpSecret);
  const accountLabel = getDeleteOtpAccountLabel(currentUser?.email, currentUser?.uid);
  const manualKey = useMemo(() => formatSecretForDisplay(setupSecret), [setupSecret]);

  const generateSetupBundle = async () => {
    try {
      setGenerating(true);
      setError('');
      setSuccess('');
      setOtp('');

      const secret = generateDeleteOtpSecret();
      const uri = buildDeleteOtpUri(accountLabel, secret);
      const qrUrl = await createDeleteOtpQrCode(uri);

      setSetupSecret(secret);
      setQrCodeUrl(qrUrl);
    } catch (setupError) {
      console.error('Failed to prepare delete security setup:', setupError);
      setError('Failed to generate Google Authenticator setup. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  useEffect(() => {
    if (!deleteProtectionEnabled || isResetting) {
      generateSetupBundle().catch((setupError) => {
        console.error('Delete security setup initialization failed:', setupError);
      });
    }
  }, [deleteProtectionEnabled, isResetting]);

  const handleEnableSecurity = async () => {
    if (!currentUser) {
      setError('Please sign in again to enable delete protection.');
      return;
    }

    if (!setupSecret) {
      setError('Setup secret is missing. Please regenerate the QR code and try again.');
      return;
    }

    if (normalizeOtpToken(otp).length !== 6) {
      setError('Enter the 6-digit code from Google Authenticator.');
      return;
    }

    try {
      setLoading(true);
      setError('');
      setSuccess('');

      const isValid = await verifyDeleteOtpToken(otp, setupSecret);
      if (!isValid) {
        setError('Invalid code. Please check the latest 6-digit code in Google Authenticator and try again.');
        return;
      }

      await setDoc(
        doc(db, 'users', currentUser.uid),
        {
          deleteOtpEnabled: true,
          deleteOtpSecret: setupSecret,
          deleteOtpConfiguredAt: serverTimestamp(),
        },
        { merge: true }
      );

      setSuccess('Delete protection is active. Every person deletion will now require a Google Authenticator code.');
      setIsResetting(false);
      setOtp('');
    } catch (saveError) {
      console.error('Failed to enable delete security:', saveError);
      setError('Failed to save delete protection. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDisableSecurity = async () => {
    if (!currentUser) {
      setError('Please sign in again to update delete protection.');
      return;
    }

    try {
      setLoading(true);
      setError('');
      setSuccess('');

      await setDoc(
        doc(db, 'users', currentUser.uid),
        {
          deleteOtpEnabled: false,
          deleteOtpSecret: null,
          deleteOtpConfiguredAt: null,
        },
        { merge: true }
      );

      setIsResetting(false);
      setSetupSecret('');
      setQrCodeUrl('');
      setOtp('');
      setSuccess('Delete protection has been turned off.');
    } catch (disableError) {
      console.error('Failed to disable delete protection:', disableError);
      setError('Failed to disable delete protection. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const showSetup = !deleteProtectionEnabled || isResetting;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 px-4 py-6">
      <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-gray-100 bg-white px-6 py-5 rounded-t-3xl">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Delete Security</h2>
            <p className="mt-1 text-sm text-gray-500">
              Protect person deletion with a 6-digit Google Authenticator code.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-gray-500 transition hover:bg-gray-100"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-5 px-6 py-5">
          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {success && (
            <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              {success}
            </div>
          )}

          {deleteProtectionEnabled && !showSetup && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 .246-.031.484-.09.712m-.91 4.288a4 4 0 118 0v1H5v-1a4 4 0 018 0zm6-9a6 6 0 11-12 0 6 6 0 0112 0z" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-emerald-900">Google Authenticator enabled</p>
                  <p className="text-sm text-emerald-800">
                    Every delete action now requires a fresh 6-digit OTP valid for about {getDeleteOtpWindowSeconds()} seconds.
                  </p>
                </div>
              </div>
            </div>
          )}

          {showSetup ? (
            <>
              <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 text-sm text-gray-700">
                <ol className="space-y-2 list-decimal pl-5">
                  <li>Open Google Authenticator on your phone.</li>
                  <li>Scan the QR code below or add the manual key.</li>
                  <li>Enter the latest 6-digit code to activate delete protection.</li>
                </ol>
              </div>

              <div className="rounded-3xl border border-gray-200 p-5 text-center">
                {generating ? (
                  <div className="py-10">
                    <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
                    <p className="text-sm text-gray-500">Generating secure QR code...</p>
                  </div>
                ) : (
                  <>
                    {qrCodeUrl && (
                      <img
                        src={qrCodeUrl}
                        alt="Google Authenticator QR Code"
                        className="mx-auto mb-4 h-56 w-56 rounded-2xl border border-gray-200 bg-white p-3"
                      />
                    )}
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Manual setup key</p>
                    <p className="mt-2 break-all rounded-2xl bg-gray-100 px-4 py-3 font-mono text-sm text-gray-800">
                      {manualKey || 'Preparing secret key...'}
                    </p>
                    <p className="mt-2 text-xs text-gray-500">Account label: {accountLabel}</p>
                  </>
                )}
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Google Authenticator OTP</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otp}
                  onChange={(event) => {
                    setOtp(normalizeOtpToken(event.target.value));
                    if (error) setError('');
                  }}
                  placeholder="Enter 6-digit code"
                  className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-center text-lg font-semibold tracking-[0.35em] text-gray-900 outline-none transition focus:border-transparent focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => {
                    generateSetupBundle().catch((setupError) => {
                      console.error('Failed to regenerate delete security setup:', setupError);
                    });
                  }}
                  disabled={loading || generating}
                  className="flex-1 rounded-2xl border border-gray-200 px-4 py-3 font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
                >
                  Regenerate QR
                </button>
                <button
                  type="button"
                  onClick={handleEnableSecurity}
                  disabled={loading || generating}
                  className="flex-1 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 px-4 py-3 font-semibold text-white transition hover:from-emerald-600 hover:to-teal-700 disabled:opacity-60"
                >
                  {loading ? 'Verifying...' : deleteProtectionEnabled ? 'Save New Setup' : 'Enable Delete Protection'}
                </button>
              </div>

              {deleteProtectionEnabled && (
                <button
                  type="button"
                  onClick={() => {
                    setIsResetting(false);
                    setError('');
                    setSuccess('');
                  }}
                  className="w-full rounded-2xl border border-gray-200 px-4 py-3 font-medium text-gray-700 transition hover:bg-gray-50"
                >
                  Back to status
                </button>
              )}
            </>
          ) : (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => {
                  setIsResetting(true);
                  setError('');
                  setSuccess('');
                }}
                className="w-full rounded-2xl border border-gray-200 px-4 py-3 font-semibold text-gray-800 transition hover:bg-gray-50"
              >
                Reset Google Authenticator
              </button>
              <button
                type="button"
                onClick={handleDisableSecurity}
                disabled={loading}
                className="w-full rounded-2xl border border-red-200 bg-red-50 px-4 py-3 font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-60"
              >
                {loading ? 'Updating...' : 'Disable Delete Protection'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
