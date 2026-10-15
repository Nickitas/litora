import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ApiResponseError } from "@litora/api-client";
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
  const [checkError, setCheckError] = useState("");
  const [sessionEnded, setSessionEnded] = useState(false);
  const wasAuthenticated = useRef(false);

  const retrySession = useCallback(async () => {
    setLoading(true);
    setCheckError("");
    try {
      const session = await api.refresh();
      wasAuthenticated.current = true;
      setState({ user: session.user, isAuthenticated: true });
      setSessionEnded(false);
    } catch (error) {
      if (error instanceof ApiResponseError && error.status === 401) {
        wasAuthenticated.current = false;
        setState({ user: null, isAuthenticated: false });
      } else {
        setCheckError(
          error instanceof Error ? error.message : "Не удалось проверить сессию"
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = api.onAuthChange((change) => {
      if (change.type === "session") {
        wasAuthenticated.current = true;
        setState({ user: change.session.user, isAuthenticated: true });
        setSessionEnded(false);
        setCheckError("");
      } else {
        if (change.reason === "expired" && wasAuthenticated.current)
          setSessionEnded(true);
        else if (change.reason === "logout") setSessionEnded(false);
        wasAuthenticated.current = false;
        setState({ user: null, isAuthenticated: false });
      }
    });
    const timer = window.setTimeout(() => void retrySession(), 0);
    return () => {
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, [retrySession]);

  const login = async (credentials: LoginCredentials) => {
    const session = await api.login(credentials);
    wasAuthenticated.current = true;
    setState({ user: session.user, isAuthenticated: true });
    setSessionEnded(false);
  };

  const register = async (data: RegisterData) => {
    const session = await api.register(data);
    wasAuthenticated.current = true;
    setState({ user: session.user, isAuthenticated: true });
    setSessionEnded(false);
  };

  const logout = async () => {
    await api.logout();
    wasAuthenticated.current = false;
    setState({ user: null, isAuthenticated: false });
    setSessionEnded(false);
  };

  return (
    <AuthContext.Provider
      value={{
        ...state,
        loading,
        checkError,
        sessionEnded,
        retrySession,
        login,
        register,
        logout,
      }}
    >
      <Fragment key={state.user?.id ?? "anonymous"}>{children}</Fragment>
    </AuthContext.Provider>
  );
}
