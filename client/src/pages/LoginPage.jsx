import { KeyRound } from "lucide-react";
import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";

import { Alert } from "../components/Alert.jsx";
import { Button } from "../components/Button.jsx";
import { Card } from "../components/Card.jsx";
import { Input } from "../components/Input.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { isSafeReturnTo } from "../utils/safeReturnTo.js";

export function LoginPage() {
  const { isInitialLoading, login, session } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = isSafeReturnTo(searchParams.get("returnTo")) ? searchParams.get("returnTo") : null;
  const registerPath = returnTo ? `/register?${new URLSearchParams({ returnTo }).toString()}` : "/register";
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const oauthError = { GOOGLE_CANCELLED: "Cancelaste el inicio de sesión con Google.", GOOGLE_NOT_CONFIGURED: "El inicio de sesión con Google no está configurado.", GOOGLE_INVALID_STATE: "No se pudo validar la sesión de Google. Inténtalo de nuevo.", GOOGLE_EMAIL_NOT_VERIFIED: "Tu cuenta de Google debe tener un correo verificado.", GOOGLE_ACCOUNT_CONFLICT: "La cuenta de Google ya está vinculada a otra cuenta.", GOOGLE_INVALID_TOKEN: "No fue posible validar la cuenta de Google.", GOOGLE_SCHEMA_NOT_READY: "El inicio de sesión con Google requiere completar la configuración de la base de datos." }[searchParams.get("oauthError")];

  if (isInitialLoading) return <main className="centered-state"><Spinner label="Cargando sesión" /></main>;
  if (session.authenticated) return <Navigate to={returnTo || (session.activeBusiness ? "/app" : "/select-business")} replace />;

  async function handleSubmit(event) {
    event.preventDefault();
    const nextErrors = {};
    if (!identifier.trim()) nextErrors.identifier = "Introduce tu usuario o correo electrónico.";
    if (!password) nextErrors.password = "Introduce tu contraseña.";
    setErrors(nextErrors);
    setFormError("");
    if (Object.keys(nextErrors).length) return;

    setIsSubmitting(true);
    try {
      const nextSession = await login({ identifier: identifier.trim(), password });
      navigate(returnTo || (nextSession.activeBusiness ? "/app" : "/select-business"), { replace: true });
    } catch (error) {
      const fields = Object.fromEntries((error.fields ?? []).map((field) => [field.field, field.message]));
      setErrors(fields);
      setFormError(error.message || "No fue posible iniciar sesión.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <Card className="auth-card">
        <div className="auth-card__icon"><KeyRound aria-hidden="true" /></div>
        <div><p className="eyebrow">Bienvenido</p><h1>Accede a Inventario</h1><p className="muted">Gestiona tu operación desde un solo lugar.</p></div>
        {(formError || oauthError) && <Alert>{formError || oauthError}</Alert>}
        <a className="button button--google" href="/api/auth/google"><span className="google-mark" aria-hidden="true">G</span>Continuar con Google</a>
        <div className="auth-divider"><span>o continúa con tu correo</span></div>
        <form className="stack" onSubmit={handleSubmit} noValidate>
          <Input id="identifier" label="Usuario o correo" autoComplete="username" value={identifier} onChange={(event) => setIdentifier(event.target.value)} error={errors.identifier} disabled={isSubmitting} />
          <Input id="password" label="Contraseña" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} error={errors.password} disabled={isSubmitting} />
          <Button type="submit" disabled={isSubmitting}>{isSubmitting ? <Spinner label="Ingresando" /> : "Iniciar sesión"}</Button>
        </form>
        <p className="muted">¿Aún no tienes cuenta? <Link className="text-link" to={registerPath}>Crea una cuenta</Link></p>
      </Card>
    </main>
  );
}
