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
  const { currentUser, signOut } = useAuth();
  const displayName = resolveDisplayName(currentUser);
  const username = currentUser?.username || '';
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<DeferredInstallPrompt | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

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
                <h1 className="text-lg sm:text-xl font-bold text-gray-900 truncate">Sarkia</h1>
                <p className="text-xs text-gray-500 truncate">Shared Financial Records</p>
              </div>
            </div>

            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-900">{displayName}</p>
                <p className="text-xs text-gray-500">@{username}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white font-semibold">
                {displayName.charAt(0).toUpperCase()}
              </div>
              <button
                onClick={handleInstallApp}
                className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${
                  isInstalled
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100'
                }`}
              >
                {isInstalled ? 'App Installed' : 'Install App'}
              </button>
              <button
                onClick={onOpenDeleteSecurity}
                className="p-2 hover:bg-amber-50 rounded-lg transition"
                title="Delete Security Settings"
              >
                <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
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

            {/* Mobile nav */}
            <div className="flex md:hidden items-center gap-2 flex-shrink-0">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white font-semibold">
                {displayName.charAt(0).toUpperCase()}
              </div>
              <button
                onClick={() => setShowMobileMenu(true)}
                className="p-2 rounded-lg border border-gray-200 bg-white text-gray-700 shadow-sm"
                aria-label="Open menu"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile menu */}
      {showMobileMenu && (
        <div className="fixed inset-0 z-[55] bg-black/40 md:hidden" onClick={() => setShowMobileMenu(false)}>
          <div
            className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1.5 w-14 rounded-full bg-gray-200" />
            <div className="mb-4 flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white font-semibold">
                {displayName.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">{displayName}</p>
                <p className="text-xs text-gray-500">@{username}</p>
              </div>
            </div>
            <div className="space-y-3">
              <button
                onClick={() => { setShowMobileMenu(false); handleInstallApp(); }}
                className={`w-full rounded-2xl border px-4 py-3 text-left transition ${isInstalled ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-sky-200 bg-sky-50 text-sky-800'}`}
              >
                <p className="text-sm font-semibold">{isInstalled ? 'App Installed' : 'Install App'}</p>
                <p className="text-xs opacity-70">Add Sarkia to your home screen</p>
              </button>
              <button
                onClick={() => { setShowMobileMenu(false); onOpenDeleteSecurity(); }}
                className="w-full rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-amber-800"
              >
                <p className="text-sm font-semibold">Delete Security</p>
                <p className="text-xs opacity-70">Manage secure delete authorization</p>
              </button>
              <button
                onClick={() => { setShowMobileMenu(false); signOut(); }}
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-left text-gray-800"
              >
                <p className="text-sm font-semibold">Sign Out</p>
                <p className="text-xs opacity-70">Exit this session</p>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Install help modal */}
      {showInstallHelp && (
        <div className="fixed inset-0 z-[60] bg-black/50 px-4" onClick={() => setShowInstallHelp(false)}>
          <div
            className="absolute inset-x-0 bottom-0 mx-auto max-w-md rounded-t-3xl bg-white p-6 shadow-2xl md:bottom-auto md:top-1/2 md:-translate-y-1/2 md:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-gray-900 mb-4">Install Sarkia</h2>
            <div className="space-y-3 text-sm text-gray-700">
              <div className="rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3">
                <p className="font-semibold text-sky-800">Android Chrome</p>
                <p className="mt-1">Tap the browser menu → <strong>Add to Home screen</strong></p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
                <p className="font-semibold text-gray-900">iPhone Safari</p>
                <p className="mt-1">Tap <strong>Share</strong> → <strong>Add to Home Screen</strong></p>
              </div>
            </div>
            <button onClick={() => setShowInstallHelp(false)} className="mt-5 w-full rounded-xl bg-gray-900 py-2 text-sm font-semibold text-white">
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
};
