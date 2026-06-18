import { useState, useEffect } from 'react';
import { AuthScreen } from './components/AuthScreen';
import { ChatLayout } from './components/ChatLayout';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [token, setToken] = useState<string | null>(localStorage.getItem('v_call_token'));
  const [currentUser, setCurrentUser] = useState<any>(null);
  
  useEffect(() => {
    if (token) {
      const userStr = localStorage.getItem('v_call_user');
      if (userStr && userStr !== 'undefined') {
        try {
          const u = JSON.parse(userStr);
          if (u) {
            setCurrentUser(u);
            setIsAuthenticated(true);
          } else {
            throw new Error('User is empty');
          }
        } catch (e) {
          console.error('Failed to parse user from localStorage', e);
          localStorage.removeItem('v_call_user');
          localStorage.removeItem('v_call_token');
          setIsAuthenticated(false);
          setToken(null);
        }
      } else {
        localStorage.removeItem('v_call_user');
        localStorage.removeItem('v_call_token');
        setIsAuthenticated(false);
        setToken(null);
      }
    }
  }, [token]);

  const handleLogin = (newToken: string, user: any) => {
    localStorage.setItem('v_call_token', newToken);
    localStorage.setItem('v_call_user', JSON.stringify(user));
    setToken(newToken);
    setCurrentUser(user);
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('v_call_token');
    localStorage.removeItem('v_call_user');
    setToken(null);
    setCurrentUser(null);
    setIsAuthenticated(false);
  };

  return (
    <div className="min-h-screen bg-black">
      {!isAuthenticated ? (
        <AuthScreen onLogin={handleLogin} />
      ) : (
        <ChatLayout currentUser={currentUser} token={token!} onLogout={handleLogout} />
      )}
    </div>
  );
}

export default App;
