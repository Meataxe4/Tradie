import { createContext, useContext, useState, type ReactNode } from "react";
import { getIdentity, setIdentity } from "./api";
import type { Identity } from "./types";

interface SessionCtx {
  identity: Identity | null;
  signIn: (id: Identity) => void;
  signOut: () => void;
}

const Ctx = createContext<SessionCtx>({ identity: null, signIn: () => {}, signOut: () => {} });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [identity, setId] = useState<Identity | null>(() => getIdentity());
  return (
    <Ctx.Provider
      value={{
        identity,
        signIn: (id) => { setIdentity(id); setId(id); },
        signOut: () => { setIdentity(null); setId(null); },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useSession() {
  return useContext(Ctx);
}
