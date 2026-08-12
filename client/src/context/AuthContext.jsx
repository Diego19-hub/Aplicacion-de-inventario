import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { apiRequest } from "../api/client.js";

const AuthContext = createContext(null);

const anonymousSession = {
  authenticated: false,
  user: null,
  activeBusiness: null,
  membership: null,
  permissions: {
    canManageInventory: false,
    canDeleteInventory: false,
    canManageMembers: false,
    isSuperAdmin: false
  }
};

export function AuthProvider({ children }) {
  const [session, setSession] = useState(anonymousSession);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  const reloadSession = useCallback(async () => {
    const nextSession = await apiRequest("/session");
    setSession(nextSession);
    return nextSession;
  }, []);

  useEffect(() => {
    let active = true;

    reloadSession()
      .catch(() => {
        if (active) setSession(anonymousSession);
      })
      .finally(() => {
        if (active) setIsInitialLoading(false);
      });

    return () => {
      active = false;
    };
  }, [reloadSession]);

  const login = useCallback(async (credentials) => {
    await apiRequest("/auth/login", {
      method: "POST",
      body: credentials,
      csrf: true
    });
    return reloadSession();
  }, [reloadSession]);

  const logout = useCallback(async () => {
    await apiRequest("/auth/logout", { method: "POST", csrf: true });
    setSession(anonymousSession);
  }, []);

  const selectBusiness = useCallback(async (businessId) => {
    await apiRequest("/session/active-business", {
      method: "PUT",
      body: { businessId },
      csrf: true
    });
    return reloadSession();
  }, [reloadSession]);

  const value = useMemo(() => ({
    session,
    isInitialLoading,
    login,
    logout,
    reloadSession,
    selectBusiness
  }), [session, isInitialLoading, login, logout, reloadSession, selectBusiness]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth debe usarse dentro de AuthProvider.");
  }

  return context;
}
