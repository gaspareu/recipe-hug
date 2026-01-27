import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => Promise<void>;
  resolvedTheme: 'light' | 'dark';
  isLoading: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const resolvedTheme = theme === 'system' ? getSystemTheme() : theme;
  
  root.classList.remove('light', 'dark');
  root.classList.add(resolvedTheme);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [theme, setThemeState] = useState<Theme>('system');
  const [isLoading, setIsLoading] = useState(true);

  // Calculate resolved theme
  const resolvedTheme = theme === 'system' ? getSystemTheme() : theme;

  // Fetch theme from profile on mount
  useEffect(() => {
    async function fetchTheme() {
      if (!user) {
        // Use localStorage for non-authenticated users
        const stored = localStorage.getItem('theme') as Theme | null;
        if (stored && ['light', 'dark', 'system'].includes(stored)) {
          setThemeState(stored);
          applyTheme(stored);
        } else {
          applyTheme('system');
        }
        setIsLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('theme')
          .eq('id', user.id)
          .maybeSingle();

        if (error) throw error;

        const userTheme = (data?.theme as Theme) || 'system';
        setThemeState(userTheme);
        applyTheme(userTheme);
      } catch (error) {
        console.error('Error fetching theme:', error);
        applyTheme('system');
      } finally {
        setIsLoading(false);
      }
    }

    fetchTheme();
  }, [user]);

  // Listen for system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleChange = () => {
      if (theme === 'system') {
        applyTheme('system');
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  const setTheme = async (newTheme: Theme) => {
    setThemeState(newTheme);
    applyTheme(newTheme);
    localStorage.setItem('theme', newTheme);

    if (user) {
      try {
        await supabase
          .from('profiles')
          .update({ theme: newTheme })
          .eq('id', user.id);
      } catch (error) {
        console.error('Error saving theme:', error);
      }
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme, isLoading }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
