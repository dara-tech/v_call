import React, { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Video, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface AuthScreenProps {
  onLogin: (token: string, user: any) => void;
}

const API_URL = import.meta.env.VITE_SIGNALING_SERVER || "http://localhost:5002";

export function AuthScreen({ onLogin }: AuthScreenProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  
  // Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');

  const handleAnonymousJoin = () => {
    const dummyUser = {
      _id: `anon_${Math.random().toString(36).substr(2, 9)}`,
      fullname: `Guest_${Math.floor(Math.random() * 1000)}`,
      email: 'guest@anonymous.local',
      isAnonymous: true
    };
    onLogin('dummy_token_anon', dummyUser);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const endpoint = isLogin ? '/api/auth/login' : '/api/auth/signup';
    const payload = isLogin ? { email, password } : { email, password, fullname: displayName };

    try {
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      toast.success(isLogin ? 'Welcome back!' : 'Account created successfully!');
      
      // Pass token up to App
      const { token, ...userData } = data;
      onLogin(token, userData);
      
    } catch (err: any) {
      toast.error(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#212121] md:bg-black flex flex-col items-center justify-center p-0 md:p-4">
      
      <div className="w-full h-screen md:h-auto md:max-w-[400px] bg-[#212121] md:rounded-2xl md:shadow-2xl md:border md:border-[#333333] flex flex-col items-center justify-center p-6 md:p-10">
        
        {/* Telegram-style Logo */}
        <div className="w-[120px] h-[120px] md:w-[140px] md:h-[140px] bg-[#3390ec] rounded-full flex items-center justify-center mb-8 shadow-sm">
          <Video className="w-14 h-14 md:w-16 md:h-16 text-white" strokeWidth={1.5} />
        </div>
        
        <h1 className="text-[28px] md:text-[32px] font-semibold text-white mb-2 text-center">
          {isLogin ? 'Sign in to V-Call' : 'Join V-Call'}
        </h1>
        
        <p className="text-[15px] md:text-[16px] text-[#aaaaaa] text-center mb-8 leading-relaxed px-2">
          {isLogin ? 'Please confirm your email and password.' : 'Enter your details to create a new account.'}
        </p>

        <form onSubmit={handleSubmit} className="w-full w-max-[360px] space-y-4">
          
          {!isLogin && (
            <div className="relative group">
              <Input 
                id="name"
                placeholder="Name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full h-[54px] bg-[#212121] border-[#333333] border-2 rounded-xl text-[16px] text-white px-4 transition-colors focus-visible:ring-0 focus-visible:border-[#3390ec] placeholder:text-[#777777]"
                required={!isLogin}
              />
            </div>
          )}

          <div className="relative group">
            <Input 
              id="email"
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-[54px] bg-[#212121] border-[#333333] border-2 rounded-xl text-[16px] text-white px-4 transition-colors focus-visible:ring-0 focus-visible:border-[#3390ec] placeholder:text-[#777777]"
              required
            />
          </div>

          <div className="relative group">
            <Input 
              id="password"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-[54px] bg-[#212121] border-[#333333] border-2 rounded-xl text-[16px] text-white px-4 transition-colors focus-visible:ring-0 focus-visible:border-[#3390ec] placeholder:text-[#777777]"
              required
            />
          </div>

          <Button 
            type="submit" 
            disabled={loading}
            className="w-full h-[54px] mt-6 bg-[#3390ec] hover:bg-[#2b7cb9] text-white rounded-xl text-[16px] font-medium transition-colors border-0"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              isLogin ? 'NEXT' : 'CREATE ACCOUNT'
            )}
          </Button>
        </form>

        <div className="flex flex-col items-center gap-3 mt-6">
          <button 
            type="button"
            onClick={() => setIsLogin(!isLogin)}
            className="text-[15px] text-[#3390ec] font-medium hover:underline"
          >
            {isLogin ? "CREATE ACCOUNT" : "LOG IN"}
          </button>

          <button 
            type="button"
            onClick={handleAnonymousJoin}
            className="text-[14px] text-[#aaaaaa] font-medium hover:text-white transition-colors"
          >
            JOIN ANONYMOUSLY
          </button>
        </div>

      </div>
    </div>
  );
}
