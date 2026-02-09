import { useEffect, useState, createContext, useContext, ReactNode, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName?: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Retry function with exponential backoff
const withRetry = async <T,>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> => {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      
      // Don't retry for auth errors (wrong credentials, etc.)
      if (lastError.message.includes('Invalid login') || 
          lastError.message.includes('Email not confirmed') ||
          lastError.message.includes('invalid_credentials')) {
        throw lastError;
      }
      
      // Only retry on network errors
      if (lastError.message.includes('Failed to fetch') || 
          lastError.message.includes('NetworkError') ||
          lastError.message.includes('ECONNREFUSED')) {
        const delay = baseDelay * Math.pow(2, attempt);
        // Retry with exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw lastError;
      }
    }
  }
  
  throw lastError || new Error('Max retries exceeded');
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    let mounted = true;
    
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (mounted) {
          setSession(session);
          setUser(session?.user ?? null);
          setLoading(false);
        }
      }
    );

    // THEN check for existing session with timeout fallback
    const sessionTimeout = setTimeout(() => {
      if (mounted && loading) {
        console.warn('Auth session check timeout - proceeding without session');
        setLoading(false);
      }
    }, 10000); // 10 second timeout

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (mounted) {
          clearTimeout(sessionTimeout);
          setSession(session);
          setUser(session?.user ?? null);
          setLoading(false);
        }
      })
      .catch((error) => {
        console.error('Failed to get session:', error);
        if (mounted) {
          clearTimeout(sessionTimeout);
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
      clearTimeout(sessionTimeout);
      subscription.unsubscribe();
    };
  }, [loading]);

  const signUp = useCallback(async (email: string, password: string, fullName?: string) => {
    const result = await withRetry(async () => {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: {
            full_name: fullName,
          },
        },
      });

      if (error) throw error;
      return true;
    });

    if (result) {
      toast({
        title: 'Conta criada com sucesso!',
        description: 'Você já pode começar a usar o ContentFactory.',
      });
    }
  }, [toast]);

  const signIn = useCallback(async (email: string, password: string) => {
    const result = await withRetry(async () => {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      return true;
    });

    if (result) {
      toast({
        title: 'Bem-vindo de volta!',
        description: 'Login realizado com sucesso.',
      });
    }
  }, [toast]);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast({
        title: 'Erro ao sair',
        description: error.message,
        variant: 'destructive',
      });
      throw error;
    }
  }, [toast]);

  return (
    <AuthContext.Provider value={{ user, session, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
