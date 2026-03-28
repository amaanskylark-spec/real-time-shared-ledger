import React, { createContext, useContext, useEffect, useState } from 'react';

export interface UserProfile {
  uid: string;
  username: string;
  displayName: string;
  createdAt: Date;
}

interface StoredUser {
  uid: string;
  username: string;
  passwordHash: string;
  displayName: string;
  createdAt: string;
}

interface AuthContextType {
  currentUser: UserProfile | null;
  loading: boolean;
  signUp: (username: string, password: string) => Promise<void>;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const USERS_STORAGE_KEY = 'sarkia_users';
const SESSION_STORAGE_KEY = 'sarkia_session';

// Simple hash for password storage (not cryptographically secure, but sufficient for local app)
const simpleHash = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36) + '_' + str.length.toString(36);
};

const DEFAULT_USERS: StoredUser[] = [
  {
    uid: 'user_wasim_001',
    username: 'WasimShaikh',
    passwordHash: simpleHash('W@simSh@ikh'),
    displayName: 'Wasim Shaikh',
    createdAt: new Date().toISOString(),
  },
  {
    uid: 'user_asif_002',
    username: 'AsifShaikh',
    passwordHash: simpleHash('@sifSh@ikh'),
    displayName: 'Asif Shaikh',
    createdAt: new Date().toISOString(),
  },
];

const loadUsers = (): StoredUser[] => {
  try {
    const stored = localStorage.getItem(USERS_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as StoredUser[];
    }
  } catch {}
  return [];
};

const saveUsers = (users: StoredUser[]) => {
  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
};

const initializeUsers = () => {
  const existing = loadUsers();
  if (existing.length === 0) {
    saveUsers(DEFAULT_USERS);
    return DEFAULT_USERS;
  }
  // Ensure default users always exist
  let updated = [...existing];
  let changed = false;
  for (const defaultUser of DEFAULT_USERS) {
    const exists = updated.some(u => u.uid === defaultUser.uid);
    if (!exists) {
      updated.push(defaultUser);
      changed = true;
    }
  }
  if (changed) saveUsers(updated);
  return updated;
};

const loadSession = (): UserProfile | null => {
  try {
    const stored = localStorage.getItem(SESSION_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as UserProfile & { createdAt: string };
      return { ...parsed, createdAt: new Date(parsed.createdAt) };
    }
  } catch {}
  return null;
};

const saveSession = (user: UserProfile) => {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));
};

const clearSession = () => {
  localStorage.removeItem(SESSION_STORAGE_KEY);
};

export const resolveDisplayName = (user: UserProfile | null) => {
  if (!user) return 'User';
  return user.displayName || user.username || 'User';
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    initializeUsers();
    const session = loadSession();
    if (session) setCurrentUser(session);
    setLoading(false);
  }, []);

  const signUp = async (username: string, password: string) => {
    const users = loadUsers();
    const trimmedUsername = username.trim();

    if (!trimmedUsername || trimmedUsername.length < 3) {
      throw new Error('Username must be at least 3 characters.');
    }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmedUsername)) {
      throw new Error('Username can only contain letters, numbers, and underscores.');
    }
    if (password.length < 6) {
      throw new Error('Password must be at least 6 characters.');
    }

    const exists = users.some(u => u.username.toLowerCase() === trimmedUsername.toLowerCase());
    if (exists) {
      throw new Error('Username already taken. Please choose another.');
    }

    const newUser: StoredUser = {
      uid: `user_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      username: trimmedUsername,
      passwordHash: simpleHash(password),
      displayName: trimmedUsername,
      createdAt: new Date().toISOString(),
    };

    saveUsers([...users, newUser]);
  };

  const signIn = async (username: string, password: string) => {
    const users = loadUsers();
    const trimmedUsername = username.trim();

    const found = users.find(u => u.username.toLowerCase() === trimmedUsername.toLowerCase());
    if (!found) {
      throw new Error('Invalid username or password.');
    }

    const hash = simpleHash(password);
    if (hash !== found.passwordHash) {
      throw new Error('Invalid username or password.');
    }

    const profile: UserProfile = {
      uid: found.uid,
      username: found.username,
      displayName: found.displayName,
      createdAt: new Date(found.createdAt),
    };

    saveSession(profile);
    setCurrentUser(profile);
  };

  const signOut = () => {
    clearSession();
    setCurrentUser(null);
  };

  return (
    <AuthContext.Provider value={{ currentUser, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
