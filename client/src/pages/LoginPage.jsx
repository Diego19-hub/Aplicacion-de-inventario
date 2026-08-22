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

function GoogleLogo() {
  return (
    <svg className="google-mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="#4285F4" d="M21.35 12.27c0-.71-.06-1.4-.18-2.05H12v3.88h5.24a4.48 4.48 0 0 1-1.94 2.94v2.44h3.14c1.84-1.69 2.91-4.18 2.91-7.21Z" />
      <path fill="#34A853" d="M12 21.6c2.63 0 4.84-.87 6.45-2.36l-3.14-2.44c-.87.58-1.98.92-3.31.92-2.54 0-4.69-1.72-5.46-4.03H3.3v2.52A9.75 9.75 0 0 0 12 21.6Z" />
      <path fill="#FBBC05" d="M6.54 13.69A5.86 5.86 0 0 1 6.23 12c0-.59.11-1.16.31-1.69V7.79H3.3A9.73 9.73 0 0 0 2.25 12c0 1.57.38 3.06 1.05 4.21l3.24-2.52Z" />
      <path fill="#EA4335" d="M12 6.28c1.43 0 2.71.49 3.72 1.45l2.79-2.79C16.84 3.37 14.63 2.4 12 2.4a9.75 9.75 0 0 0-8.7 5.39l3.24 2.52C7.31 8 9.46 6.28 12 6.28Z" />
    </svg>
  );
}

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
        <form className="stack" onSubmit={handleSubmit} noValidate>
          <Input id="identifier" label="Usuario o correo" autoComplete="username" value={identifier} onChange={(event) => setIdentifier(event.target.value)} error={errors.identifier} disabled={isSubmitting} />
          <Input id="password" label="Contraseña" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} error={errors.password} disabled={isSubmitting} />
          <Button type="submit" disabled={isSubmitting}>{isSubmitting ? <Spinner label="Ingresando" /> : "Iniciar sesión"}</Button>
        </form>
        <div className="auth-divider"><span>o continúa con</span></div>
        <a className="button button--google" href="/api/auth/google"><GoogleLogo />Continuar con Google</a>
        <p className="muted">¿Aún no tienes cuenta? <Link className="text-link" to={registerPath}>Crea una cuenta</Link></p>
      </Card>
    </main>
  );
}
