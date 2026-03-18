import React, { useEffect, useState } from 'react';
import { useAuth, resolveDisplayName } from '../../contexts/AuthContext';

interface HeaderProps {
  onOpenDeleteSecurity: () => void;
}

type DeferredInstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

export const Header: React.FC<HeaderProps> = ({ onOpenDeleteSecurity }) => {
  const { currentUser, userProfile, signOut, deleteAccount } = useAuth();
  const displayName = resolveDisplayName(userProfile, currentUser);
  const email = userProfile?.email || currentUser?.email || '';
  const deleteProtectionEnabled = Boolean(userProfile?.deleteOtpEnabled && userProfile?.deleteOtpSecret);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<DeferredInstallPrompt | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean };
    setIsInstalled(mediaQuery.matches || navigatorWithStandalone.standalone === true);

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as DeferredInstallPrompt);
    };

    const handleInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      setShowInstallHelp(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const handleInstallApp = async () => {
    if (isInstalled) {
      setShowInstallHelp(true);
      return;
    }

    if (!deferredPrompt) {
      setShowInstallHelp(true);
      return;
    }

    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  const handleDeleteAccount = async () => {
    try {
      setDeleting(true);
      setDeleteError('');
      await deleteAccount();
      setShowDeleteDialog(false);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Failed to delete account.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-200 flex-shrink-0">
                <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              </div>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl font-bold text-gray-900 truncate">Money Tracker</h1>
                <p className="text-xs text-gray-500 truncate">Shared Financial Records</p>
              </div>
            </div>

            <div className="hidden md:flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-900">{displayName}</p>
                <p className="text-xs text-gray-500">{email}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white font-semibold">
                {displayName.charAt(0).toUpperCase() || 'U'}
              </div>
              <button
                onClick={handleInstallApp}
                className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${
                  isInstalled
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100'
                }`}
                title={isInstalled ? 'App already installed' : 'Install app on this device'}
              >
                {isInstalled ? 'App Installed' : 'Install App'}
              </button>
              <button
                onClick={onOpenDeleteSecurity}
                className={`p-2 rounded-lg transition ${
                  deleteProtectionEnabled ? 'hover:bg-emerald-50 bg-emerald-50/70' : 'hover:bg-amber-50 bg-amber-50/70'
                }`}
                title={deleteProtectionEnabled ? 'Delete Security Enabled' : 'Set Up Delete Security'}
              >
                <svg
                  className={`w-5 h-5 ${deleteProtectionEnabled ? 'text-emerald-600' : 'text-amber-600'}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 11c0 .246-.031.484-.09.712m.09 8.288s8-4 8-10V5l-8-3-8 3v5c0 6 8 10 8 10zm0-9a3 3 0 100-6 3 3 0 000 6z"
                  />
                </svg>
              </button>
              <button
                onClick={() => {
                  setDeleteError('');
                  setShowDeleteDialog(true);
                }}
                className="p-2 hover:bg-red-50 rounded-lg transition"
                title="Delete Account"
              >
                <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3M4 7h16" />
                </svg>
              </button>
              <button
                onClick={signOut}
                className="p-2 hover:bg-gray-100 rounded-lg transition"
                title="Sign Out"
              >
                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>

            <div className="flex md:hidden items-center gap-2 flex-shrink-0">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white font-semibold">
                {displayName.charAt(0).toUpperCase() || 'U'}
              </div>
              <button
                onClick={() => setShowMobileMenu(true)}
                className="p-2 rounded-lg border border-gray-200 bg-white text-gray-700 shadow-sm"
                title="Open account menu"
                aria-label="Open account menu"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      {showMobileMenu && (
        <div className="fixed inset-0 z-[55] bg-black/40 md:hidden" onClick={() => setShowMobileMenu(false)}>
          <div
            className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-white p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1.5 w-14 rounded-full bg-gray-200" />
            <div className="mb-4 flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white font-semibold">
                {displayName.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{displayName}</p>
                <p className="text-xs text-gray-500 truncate">{email}</p>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={async () => {
                  setShowMobileMenu(false);
                  await handleInstallApp();
                }}
                className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                  isInstalled
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-sky-200 bg-sky-50 text-sky-800'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-white/70 p-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 16v-8m0 8l-3-3m3 3l3-3M5 20h14" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{isInstalled ? 'App Installed' : 'Install App'}</p>
                    <p className="text-xs opacity-80">Add Money Tracker to your home screen</p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => {
                  setShowMobileMenu(false);
                  onOpenDeleteSecurity();
                }}
                className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                  deleteProtectionEnabled
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-amber-200 bg-amber-50 text-amber-800'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-white/70 p-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 .246-.031.484-.09.712m.09 8.288s8-4 8-10V5l-8-3-8 3v5c0 6 8 10 8 10zm0-9a3 3 0 100-6 3 3 0 000 6z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{deleteProtectionEnabled ? 'Authenticator Protection Enabled' : 'Set Up Google Authenticator'}</p>
                    <p className="text-xs opacity-80">Manage secure delete authorization</p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => {
                  setShowMobileMenu(false);
                  setDeleteError('');
                  setShowDeleteDialog(true);
                }}
                className="w-full rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-left text-red-700 transition"
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-white/80 p-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3M4 7h16" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Delete My Account</p>
                    <p className="text-xs opacity-80">Remove your own user record</p>
                  </div>
                </div>
              </button>

              <button
                onClick={async () => {
                  setShowMobileMenu(false);
                  await signOut();
                }}
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-left text-gray-800 transition"
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-white p-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Sign Out</p>
                    <p className="text-xs opacity-80">Exit this device session</p>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {showInstallHelp && (
        <div className="fixed inset-0 z-[60] bg-black/50 px-4" onClick={() => setShowInstallHelp(false)}>
          <div
            className="absolute inset-x-0 bottom-0 mx-auto max-w-md rounded-t-3xl bg-white p-6 shadow-2xl md:bottom-auto md:top-1/2 md:-translate-y-1/2 md:rounded-3xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1.5 w-14 rounded-full bg-gray-200 md:hidden" />
            <div className="mb-4 flex items-start gap-3">
              <div className="rounded-2xl bg-sky-50 p-3 text-sky-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 16v-8m0 8l-3-3m3 3l3-3M5 20h14" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Install Money Tracker</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Use the app like a mobile app directly from your home screen.
                </p>
              </div>
            </div>

            <div className="space-y-3 text-sm text-gray-700">
              <div className="rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3">
                <p className="font-semibold text-sky-800">Android Chrome</p>
                <p className="mt-1">Tap the browser menu and choose <span className="font-semibold">Add to Home screen</span> or <span className="font-semibold">Install app</span>.</p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
                <p className="font-semibold text-gray-900">iPhone Safari</p>
                <p className="mt-1">Tap <span className="font-semibold">Share</span> and then <span className="font-semibold">Add to Home Screen</span>.</p>
              </div>
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-emerald-800">
                After installing, Money Tracker opens in full-screen like a normal mobile app.
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setShowInstallHelp(false)}
                className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-black"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-gray-100 px-6 py-4">
              <h2 className="text-lg font-bold text-gray-900">Delete your account?</h2>
              <p className="mt-1 text-sm text-gray-500">
                This will remove your user record from Firebase and sign you out. Shared people and transaction records will stay in the app.
              </p>
            </div>

            <div className="space-y-4 px-6 py-5">
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                Account: <span className="font-semibold">{email}</span>
              </div>

              {deleteError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {deleteError}
                </div>
              )}

              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => {
                    if (!deleting) {
                      setShowDeleteDialog(false);
                      setDeleteError('');
                    }
                  }}
                  className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={deleting}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={deleting}
                >
                  {deleting ? 'Deleting...' : 'Delete Account'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
