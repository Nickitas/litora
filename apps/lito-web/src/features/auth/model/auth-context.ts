import { createContext } from "react";
import type {
  AuthState,
  LoginCredentials,
  RegisterData,
} from "@/entities/auth/types";

interface AuthContextType extends AuthState {
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  retrySession: () => Promise<void>;
  loading: boolean;
  checkError: string;
  sessionEnded: boolean;
}

export const AuthContext = createContext<AuthContextType | undefined>(
  undefined
);
