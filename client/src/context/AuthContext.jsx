import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";

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
    canManageCustomers: false,
    canManageCustomerCharges: false,
    canRegisterCustomerPayments: false,
    canCancelCustomerPayments: false,
    canViewCustomerCollections: false,
    isSuperAdmin: false
  }
};

export function AuthProvider({ children }) {
  const location = useLocation();
  const [session, setSession] = useState(anonymousSession);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [initialLoadError, setInitialLoadError] = useState(false);

  const reloadSession = useCallback(async () => {
    setInitialLoadError(false);
    const nextSession = await apiRequest("/session");
    setSession(nextSession);
    return nextSession;
  }, []);

  useEffect(() => {
    if (location.pathname === "/") {
      setInitialLoadError(false);
      setIsInitialLoading(false);
      return undefined;
    }

    let active = true;

    reloadSession()
      .catch((requestError) => {
        if (active) {
          setSession(anonymousSession);
          if (requestError?.name !== "ApiError") setInitialLoadError(true);
        }
      })
      .finally(() => {
        if (active) setIsInitialLoading(false);
      });

    return () => {
      active = false;
    };
  }, [location.pathname, reloadSession]);

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
    initialLoadError,
    clearSession: () => setSession(anonymousSession),
    login,
    register,
    logout,
    reloadSession,
    selectBusiness,
    acceptInvitation,
    createBusiness
  }), [session, isInitialLoading, initialLoadError, login, register, logout, reloadSession, selectBusiness, acceptInvitation, createBusiness]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth debe usarse dentro de AuthProvider.");
  }

  return context;
}
