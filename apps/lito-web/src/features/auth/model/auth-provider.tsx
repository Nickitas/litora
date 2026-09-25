import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/shared/api/client";
import type {
  AuthState,
  LoginCredentials,
  RegisterData,
} from "@/entities/auth/types";
import { AuthContext } from "./auth-context";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
  });
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let mounted = true;
    api
      .refresh()
      .then((session) => {
        if (mounted) setState({ user: session.user, isAuthenticated: true });
      })
      .catch(() => {
        if (mounted) setState({ user: null, isAuthenticated: false });
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const login = async (credentials: LoginCredentials) => {
    const session = await api.login(credentials);
    setState({ user: session.user, isAuthenticated: true });
  };

  const register = async (data: RegisterData) => {
    const session = await api.register(data);
    setState({ user: session.user, isAuthenticated: true });
  };

  const logout = async () => {
    await api.logout();
    setState({ user: null, isAuthenticated: false });
  };

  return (
    <AuthContext.Provider
      value={{ ...state, loading, login, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}
