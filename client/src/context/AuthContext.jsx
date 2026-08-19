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

  useEffect(() => {
    function handleUnauthorized() {
      setSession(anonymousSession);
    }

    window.addEventListener("api:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("api:unauthorized", handleUnauthorized);
  }, []);

  const login = useCallback(async (credentials) => {
    await apiRequest("/auth/login", {
      method: "POST",
      body: credentials,
      csrf: true
    });
    return reloadSession();
  }, [reloadSession]);

  const register = useCallback(async (registration) => {
    await apiRequest("/auth/register", {
      method: "POST",
      body: registration,
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

  const acceptInvitation = useCallback(async (token) => {
    const result = await apiRequest(`/invitations/${encodeURIComponent(token)}/accept`, {
      method: "POST",
      csrf: true
    });
    await reloadSession();
    return result;
  }, [reloadSession]);

  const createBusiness = useCallback(async (business) => {
    const result = await apiRequest("/onboarding/business", {
      method: "POST",
      body: business,
      csrf: true
    });

    await reloadSession();
    return result;
  }, [reloadSession]);

  const value = useMemo(() => ({
    session,
    isInitialLoading,
    clearSession: () => setSession(anonymousSession),
    login,
    register,
    logout,
    reloadSession,
    selectBusiness,
    acceptInvitation,
    createBusiness
  }), [session, isInitialLoading, login, register, logout, reloadSession, selectBusiness, acceptInvitation, createBusiness]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth debe usarse dentro de AuthProvider.");
  }

  return context;
}
