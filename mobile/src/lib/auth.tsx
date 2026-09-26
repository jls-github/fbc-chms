import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Platform } from "react-native";
import type { MyProfile, User } from "@shared/schemas";
import { api, setApiToken, setUnauthorizedHandler } from "./api";
import { loadToken, saveToken } from "./storage";

type TokenResponse = { token: string; expiresAt: string; user: User };
export type Me = { user: User; profile: MyProfile };

type Auth = {
  ready: boolean;
  signedIn: boolean;
  signIn: (identifier: string, password: string) => Promise<void>;
  signUp: (input: { firstName: string; lastName: string; email: string; phone: string; password: string }) => Promise<void>;
  claimInvite: (code: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<Auth | null>(null);
const deviceName = Platform.select({ ios: "iPhone app", android: "Android app", default: "Web app" });

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  const adopt = useCallback(
    async (t: string | null) => {
      setApiToken(t);
      await saveToken(t);
      qc.clear();
      setSignedIn(!!t);
    },
    [qc],
  );

  useEffect(() => {
    void loadToken().then((t) => {
      setApiToken(t);
      setSignedIn(!!t);
      setReady(true);
    });
    setUnauthorizedHandler(() => void adopt(null));
  }, [adopt]);

  const value = useMemo<Auth>(
    () => ({
      ready,
      signedIn,
      signIn: async (identifier, password) => {
        const r = await api.post<TokenResponse>("/auth/token", { identifier, password, deviceName });
        await adopt(r.token);
      },
      signUp: async (input) => {
        const r = await api.post<TokenResponse>("/public/app/signup", { ...input, deviceName });
        await adopt(r.token);
      },
      claimInvite: async (code, password) => {
        const r = await api.post<TokenResponse>("/public/app/claim-invite", { code, password, deviceName });
        await adopt(r.token);
      },
      signOut: async () => {
        await api.post("/auth/logout").catch(() => undefined);
        await adopt(null);
      },
    }),
    [ready, signedIn, adopt],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}

export const useMe = (enabled = true) =>
  useQuery({ queryKey: ["me"], queryFn: () => api.get<Me>("/app/me"), enabled, staleTime: 60_000 });
