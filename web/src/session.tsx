import { createContext, useContext, useState, type ReactNode } from "react";
import { getIdentity, setIdentity, setToken, storeAuth } from "./api";
import type { AuthResult, Identity } from "./types";

interface SessionCtx {
  identity: Identity | null;
  signIn: (result: AuthResult) => void;
  signOut: () => void;
}

const Ctx = createContext<SessionCtx>({ identity: null, signIn: () => {}, signOut: () => {} });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [identity, setId] = useState<Identity | null>(() => getIdentity());
  return (
    <Ctx.Provider
      value={{
        identity,
        signIn: (result) => {
          storeAuth(result);
          setId({ id: result.user.id, role: result.user.role, label: result.user.name });
        },
        signOut: () => { setToken(null); setIdentity(null); setId(null); },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useSession() {
  return useContext(Ctx);
}
