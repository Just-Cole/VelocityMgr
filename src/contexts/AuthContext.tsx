
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { AppUser } from "@/lib/types";
import { Loader2 } from "lucide-react";

interface AuthContextType {
  user: AppUser | null;
  isLoading: boolean;
  logout: () => void;
}

const AuthContext = React.createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<AppUser | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const router = useRouter();

  React.useEffect(() => {
    try {
      const authDataString = sessionStorage.getItem('auth');
      if (authDataString) {
        const authData = JSON.parse(authDataString);
        if (authData.isAuthenticated && authData.user) {
          // The user object from login now contains username, roles, and permissions
          setUser(authData.user);
        } else {
          router.replace('/login');
        }
      } else {
        router.replace('/login');
      }
    } catch (error) {
      console.error("Failed to parse auth data from sessionStorage", error);
      router.replace('/login');
    } finally {
      setIsLoading(false);
    }
  }, [router]);
  
  const logout = React.useCallback(() => {
    sessionStorage.removeItem("auth");
    setUser(null);
    router.push("/login");
  }, [router]);

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
     // This prevents flashing the layout while redirecting.
     // The redirect is handled in the effect.
    return null;
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = React.useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
