import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  updateProfile,
  sendPasswordResetEmail,
  setPersistence,
  browserLocalPersistence,
  getRedirectResult,
  deleteUser,
} from 'firebase/auth';
import { deleteDoc, doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebase';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  fullName: string;
  createdAt: Date;
  photoURL?: string;
  provider?: 'password' | 'google' | 'unknown';
  deleteOtpEnabled?: boolean;
  deleteOtpSecret?: string;
  deleteOtpConfiguredAt?: Date;
}

interface AuthContextType {
  currentUser: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const toSafeDate = (value: unknown): Date => {
  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate?: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }

  if (value instanceof Date) {
    return value;
  }

  const parsed = new Date(value as string | number | Date);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const formatEmailAsName = (email?: string | null) => {
  if (!email) return 'User';

  const localPart = email.split('@')[0] || 'user';
  const formatted = localPart
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

  return formatted || 'User';
};

const detectProvider = (user: User, existingProvider?: string) => {
  if (user.providerData.some((provider) => provider.providerId === 'google.com')) {
    return 'google' as const;
  }

  if (user.providerData.some((provider) => provider.providerId === 'password')) {
    return 'password' as const;
  }

  if (existingProvider === 'google' || existingProvider === 'password') {
    return existingProvider;
  }

  return 'unknown' as const;
};

export const resolveDisplayName = (
  profile?: Partial<UserProfile> | null,
  user?: Pick<User, 'displayName' | 'email'> | null
) => {
  const profileFullName = profile?.fullName?.trim();
  if (profileFullName) return profileFullName;

  const profileName = profile?.displayName?.trim();
  if (profileName) return profileName;

  const authName = user?.displayName?.trim();
  if (authName) return authName;

  return formatEmailAsName(profile?.email || user?.email);
};

const mapUserProfile = (user: User, data?: Partial<UserProfile> | null): UserProfile => ({
  uid: user.uid,
  email: (data?.email || user.email || '').trim().toLowerCase(),
  displayName: resolveDisplayName(data, user),
  fullName: resolveDisplayName(data, user),
  createdAt: data?.createdAt ? toSafeDate(data.createdAt) : new Date(),
  photoURL: data?.photoURL || user.photoURL || undefined,
  provider: detectProvider(user, data?.provider),
  deleteOtpEnabled: Boolean(data?.deleteOtpEnabled && data?.deleteOtpSecret),
  deleteOtpSecret: typeof data?.deleteOtpSecret === 'string' ? data.deleteOtpSecret : undefined,
  deleteOtpConfiguredAt: data?.deleteOtpConfiguredAt ? toSafeDate(data.deleteOtpConfiguredAt) : undefined,
});

const getAuthErrorMessage = (error: unknown) => {
  const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: string }).code) : '';

  switch (code) {
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/missing-password':
      return 'Please enter your password.';
    case 'auth/invalid-credential':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return 'Invalid email or password.';
    case 'auth/email-already-in-use':
      return 'This email is already registered. Please sign in instead.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters long.';
    case 'auth/popup-blocked':
      return 'Google sign-in popup was blocked. Please allow popups and try again.';
    case 'auth/popup-closed-by-user':
      return 'Google sign-in was closed before completion.';
    case 'auth/cancelled-popup-request':
      return 'Another sign-in popup is already open. Please complete it first.';
    case 'auth/operation-not-supported-in-this-environment':
      return 'Google sign-in popup is not supported here. Please try again and the app will use redirect sign-in.';
    case 'auth/unauthorized-domain':
      return 'This domain is not authorized in Firebase Authentication. Add your current domain in Firebase Console > Authentication > Settings > Authorized domains.';
    case 'auth/operation-not-allowed':
    case 'auth/configuration-not-found':
      return 'This sign-in method is not enabled in Firebase. Enable Email/Password and Google in Firebase Authentication.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.';
    case 'auth/network-request-failed':
      return 'Network error. Please check your internet connection and try again.';
    case 'auth/user-disabled':
      return 'This account has been disabled.';
    case 'auth/requires-recent-login':
      return 'For security reasons, please sign out, sign in again, and then try deleting your account.';
    default:
      return typeof error === 'object' && error && 'message' in error
        ? String((error as { message?: string }).message)
        : 'Authentication failed. Please try again.';
  }
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const ensureUserProfile = async (user: User, preferredName?: string) => {
    const userRef = doc(db, 'users', user.uid);
    const userDoc = await getDoc(userRef);
    const existingProfile = userDoc.exists() ? (userDoc.data() as Partial<UserProfile>) : null;

    const fullName = preferredName?.trim() || resolveDisplayName(existingProfile, user);
    const profile: UserProfile = {
      uid: user.uid,
      email: (user.email || existingProfile?.email || '').trim().toLowerCase(),
      displayName: fullName,
      fullName,
      createdAt: existingProfile?.createdAt ? toSafeDate(existingProfile.createdAt) : new Date(),
      photoURL: user.photoURL || existingProfile?.photoURL || undefined,
      provider: detectProvider(user, existingProfile?.provider),
      deleteOtpEnabled: Boolean(existingProfile?.deleteOtpEnabled && existingProfile?.deleteOtpSecret),
      deleteOtpSecret: typeof existingProfile?.deleteOtpSecret === 'string' ? existingProfile.deleteOtpSecret : undefined,
      deleteOtpConfiguredAt: existingProfile?.deleteOtpConfiguredAt
        ? toSafeDate(existingProfile.deleteOtpConfiguredAt)
        : undefined,
    };

    const shouldWriteProfile =
      !userDoc.exists() ||
      existingProfile?.email !== profile.email ||
      existingProfile?.displayName !== profile.displayName ||
      existingProfile?.fullName !== profile.fullName ||
      existingProfile?.photoURL !== profile.photoURL ||
      existingProfile?.provider !== profile.provider;

    if (shouldWriteProfile) {
      await setDoc(userRef, profile, { merge: true });
    }

    if (user.displayName !== fullName) {
      try {
        await updateProfile(user, { displayName: fullName });
      } catch (profileError) {
        console.warn('Failed to sync Firebase auth display name:', profileError);
      }
    }

    setUserProfile(profile);
    return profile;
  };

  const signUp = async (email: string, password: string, displayName: string) => {
    try {
      const safeEmail = email.trim().toLowerCase();
      const safeDisplayName = displayName.trim() || formatEmailAsName(safeEmail);
      const result = await createUserWithEmailAndPassword(auth, safeEmail, password);

      await updateProfile(result.user, { displayName: safeDisplayName });
      await ensureUserProfile(result.user, safeDisplayName);

      await firebaseSignOut(auth);
      setCurrentUser(null);
      setUserProfile(null);
    } catch (error) {
      throw new Error(getAuthErrorMessage(error));
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const safeEmail = email.trim().toLowerCase();
      const result = await signInWithEmailAndPassword(auth, safeEmail, password);
      await ensureUserProfile(result.user);
    } catch (error) {
      throw new Error(getAuthErrorMessage(error));
    }
  };

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    try {
      const result = await signInWithPopup(auth, provider);
      await ensureUserProfile(result.user);
    } catch (error) {
      const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: string }).code) : '';

      if (
        code === 'auth/popup-blocked' ||
        code === 'auth/popup-closed-by-user' ||
        code === 'auth/cancelled-popup-request' ||
        code === 'auth/operation-not-supported-in-this-environment'
      ) {
        try {
          await signInWithRedirect(auth, provider);
          return;
        } catch (redirectError) {
          throw new Error(getAuthErrorMessage(redirectError));
        }
      }

      throw new Error(getAuthErrorMessage(error));
    }
  };

  const resetPassword = async (email: string) => {
    try {
      const safeEmail = email.trim().toLowerCase();

      if (!safeEmail) {
        throw new Error('Please enter your email address first.');
      }

      await sendPasswordResetEmail(auth, safeEmail, {
        url: window.location.origin,
        handleCodeInApp: false,
      });
    } catch (error) {
      throw new Error(getAuthErrorMessage(error));
    }
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
    setUserProfile(null);
  };

  const deleteAccount = async () => {
    const activeUser = auth.currentUser;

    if (!activeUser) {
      throw new Error('No signed-in account found.');
    }

    const userRef = doc(db, 'users', activeUser.uid);
    const existingProfileSnap = await getDoc(userRef);
    const existingProfileData = existingProfileSnap.exists() ? existingProfileSnap.data() : null;

    try {
      if (existingProfileSnap.exists()) {
        await deleteDoc(userRef);
      }

      await deleteUser(activeUser);
      setCurrentUser(null);
      setUserProfile(null);
    } catch (error) {
      if (existingProfileData) {
        try {
          await setDoc(userRef, existingProfileData, { merge: true });
        } catch (restoreError) {
          console.warn('Failed to restore user profile after delete failure:', restoreError);
        }
      }

      throw new Error(getAuthErrorMessage(error));
    }
  };

  useEffect(() => {
    let unsubscribeAuth: (() => void) | undefined;
    let unsubscribeProfile: (() => void) | undefined;

    const initializeAuth = async () => {
      try {
        await setPersistence(auth, browserLocalPersistence);
      } catch (error) {
        console.warn('Failed to enable auth persistence:', error);
      }

      try {
        const redirectResult = await getRedirectResult(auth);
        if (redirectResult?.user) {
          await ensureUserProfile(redirectResult.user);
        }
      } catch (error) {
        console.error('Google redirect sign-in failed:', error);
      }

      unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
        unsubscribeProfile?.();
        unsubscribeProfile = undefined;
        setCurrentUser(user);

        if (user) {
          try {
            await ensureUserProfile(user);

            const userRef = doc(db, 'users', user.uid);
            unsubscribeProfile = onSnapshot(
              userRef,
              async (snapshot) => {
                if (!snapshot.exists()) {
                  try {
                    await ensureUserProfile(user);
                  } catch (profileError) {
                    console.error('Failed to restore missing user profile:', profileError);
                    setUserProfile(mapUserProfile(user, null));
                  }
                  return;
                }

                setUserProfile(mapUserProfile(user, snapshot.data() as Partial<UserProfile>));
              },
              (profileError) => {
                console.error('Failed to subscribe to user profile:', profileError);
                setUserProfile(mapUserProfile(user, null));
              }
            );
          } catch (error) {
            console.error('Failed to load user profile:', error);
            setUserProfile(mapUserProfile(user, null));
          }
        } else {
          setUserProfile(null);
        }

        setLoading(false);
      });
    };

    initializeAuth().catch((error) => {
      console.error('Failed to initialize auth:', error);
      setLoading(false);
    });

    return () => {
      unsubscribeProfile?.();
      unsubscribeAuth?.();
    };
  }, []);

  const value: AuthContextType = {
    currentUser,
    userProfile,
    loading,
    signUp,
    signIn,
    signInWithGoogle,
    resetPassword,
    signOut,
    deleteAccount,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
