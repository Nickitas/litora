import type { User } from "@/entities/user/types";

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
}

export type { LoginDto as LoginCredentials, RegisterDto as RegisterData } from "@litora/contracts";
