import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Login } from './components/Auth/Login';
import { Signup } from './components/Auth/Signup';
import { Home } from './components/Dashboard/Home';
import { PersonDetail } from './components/PersonDetail/PersonDetail';

function AuthScreen() {
  const [isLogin, setIsLogin] = useState(true);
  const [authMessage, setAuthMessage] = useState('');
  const [prefilledUsername, setPrefilledUsername] = useState('');

  const openLogin = (message = '', username = '') => {
    setAuthMessage(message);
    setPrefilledUsername(username);
    setIsLogin(true);
  };

  const openSignup = () => {
    setAuthMessage('');
    setIsLogin(false);
  };

  return isLogin ? (
    <Login
      onToggleMode={openSignup}
      initialMessage={authMessage}
      initialUsername={prefilledUsername}
    />
  ) : (
    <Signup
      onToggleMode={() => openLogin()}
      onSignupSuccess={(username) =>
        openLogin('Account created successfully. Please sign in with your new credentials.', username)
      }
    />
  );
}

function MainApp() {
  const { currentUser, loading } = useAuth();
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-400 font-medium">Loading Sarkia...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <AuthScreen />;
  }

  if (selectedPersonId) {
    return (
      <PersonDetail
        personId={selectedPersonId}
        onBack={() => setSelectedPersonId(null)}
      />
    );
  }

  return <Home onSelectPerson={setSelectedPersonId} />;
}

export function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
