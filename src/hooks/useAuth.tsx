import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { backendAPI } from '@/lib/backend-api';
import { errorService } from '@/services/errorService';

interface User {
  id: string;
  email: string;
  fullName?: string;
  createdAt?: string;
  isAdmin?: boolean;
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
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is already logged in
    const checkAuth = async () => {
      const token = backendAPI.getAuthToken();
      if (token) {
        try {
          const { user: userData } = await backendAPI.getCurrentUser();
          setUser({
            id: userData.id,
            email: userData.email,
            fullName: userData.fullName,
            createdAt: userData.createdAt,
            isAdmin: userData.isAdmin,
          });
        } catch (error) {
          // Token is invalid or expired
          backendAPI.signout();
          setUser(null);
        }
      }
      setLoading(false);
    };

    checkAuth();
  }, []);

  const signUp = async (email: string, password: string, fullName?: string) => {
    try {
      const { user: userData } = await backendAPI.signup(email, password, fullName);
      setUser({
        id: userData.id,
        email: userData.email,
        fullName: userData.fullName,
        createdAt: userData.createdAt,
        isAdmin: userData.isAdmin,
      });
      errorService.logInfo('Sign up successful', { email });
      return { error: null };
    } catch (error: any) {
      errorService.logError('Sign up error', error, { email });
      return { error: error as Error };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { user: userData } = await backendAPI.signin(email, password);
      setUser({
        id: userData.id,
        email: userData.email,
        fullName: userData.fullName,
        createdAt: userData.createdAt,
        isAdmin: userData.isAdmin,
      });
      errorService.logInfo('Sign in successful', { email });
      return { error: null };
    } catch (error: any) {
      errorService.logError('Sign in error', error, { email });
      return { error: error as Error };
    }
  };

  const signOut = async () => {
    try {
      backendAPI.signout();
      setUser(null);
      errorService.logInfo('Sign out successful');
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

