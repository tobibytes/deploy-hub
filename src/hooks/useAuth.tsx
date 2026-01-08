import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { errorService } from '@/services/errorService';

interface User {
  id: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>({
    id: import.meta.env.VITE_DEPLOY_DEFAULT_USER_ID || '00000000-0000-0000-0000-000000000000'
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Using default user; no auth backend
    setLoading(false);
  }, []);

  const signUp = async (email: string, password: string, fullName?: string) => {
    try {
      errorService.logInfo('Sign up placeholder', { email, fullName });
      return { error: null };
    } catch (error: any) {
      errorService.logError('Sign up error', error, { email });
      return { error: error as Error };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      errorService.logInfo('Sign in placeholder', { email });
      return { error: null };
    } catch (error: any) {
      errorService.logError('Sign in error', error, { email });
      return { error: error as Error };
    }
  };

  const signOut = async () => {
    try {
      errorService.logInfo('Sign out placeholder');
    } catch (error: any) {
      errorService.logError('Sign out error', error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
