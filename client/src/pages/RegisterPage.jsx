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

function errorsByField(fields = []) {
  return Object.fromEntries(fields.map((field) => [field.field, field.message]));
}

export function RegisterPage() {
  const { isInitialLoading, register, session } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = isSafeReturnTo(searchParams.get("returnTo")) ? searchParams.get("returnTo") : null;
  const loginPath = returnTo ? `/login?${new URLSearchParams({ returnTo }).toString()}` : "/login";
  const [form, setForm] = useState({ username: "", email: "", password: "", passwordConfirmation: "" });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isInitialLoading) return <main className="centered-state"><Spinner label="Cargando sesión" /></main>;
  if (session.authenticated) return <Navigate to={returnTo || (session.activeBusiness ? "/app" : "/select-business")} replace />;

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (isSubmitting) return;

    const nextErrors = {};
    if (!form.username.trim()) nextErrors.username = "El nombre de usuario es obligatorio.";
    if (!form.email.trim()) nextErrors.email = "El correo es obligatorio.";
    if (!form.password) nextErrors.password = "La contraseña es obligatoria.";
    if (!form.passwordConfirmation) nextErrors.passwordConfirmation = "Confirma tu contraseña.";
    else if (form.password !== form.passwordConfirmation) nextErrors.passwordConfirmation = "Las contraseñas no coinciden.";
    setErrors(nextErrors);
    setFormError("");
    if (Object.keys(nextErrors).length > 0) return;

    setIsSubmitting(true);
    try {
      const nextSession = await register({
        username: form.username.trim(),
        email: form.email.trim(),
        password: form.password,
        passwordConfirmation: form.passwordConfirmation
      });
      navigate(returnTo || (nextSession.activeBusiness ? "/app" : "/select-business"), { replace: true });
    } catch (error) {
      setErrors(errorsByField(error.fields));
      setFormError(error.message || "No fue posible crear la cuenta.");
      setForm((current) => ({ ...current, password: "", passwordConfirmation: "" }));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <Card className="auth-card">
        <div className="auth-card__icon"><KeyRound aria-hidden="true" /></div>
        <div><p className="eyebrow">Nueva cuenta</p><h1>Crea tu cuenta</h1><p className="muted">Regístrate para acceder al inventario al que se te invite.</p></div>
        {(formError || Object.keys(errors).length > 0) && <Alert><div className="error-summary" role="alert"><strong>Revisa los datos de registro.</strong>{formError && <p>{formError}</p>}{Object.keys(errors).length > 0 && <ul>{Object.values(errors).map((message, index) => <li key={`${message}-${index}`}>{message}</li>)}</ul>}</div></Alert>}
        <form className="stack" onSubmit={handleSubmit} noValidate>
          <Input id="register-username" label="Nombre de usuario" autoComplete="username" value={form.username} onChange={(event) => update("username", event.target.value)} hint="Entre 3 y 30 caracteres: letras, números y guion bajo." error={errors.username} disabled={isSubmitting} required minLength="3" maxLength="30" />
          <Input id="register-email" label="Correo electrónico" type="email" autoComplete="email" value={form.email} onChange={(event) => update("email", event.target.value)} error={errors.email} disabled={isSubmitting} required maxLength="254" />
          <Input id="register-password" label="Contraseña" type="password" autoComplete="new-password" value={form.password} onChange={(event) => update("password", event.target.value)} hint="Entre 8 y 64 caracteres." error={errors.password} disabled={isSubmitting} required minLength="8" maxLength="64" />
          <Input id="register-password-confirmation" label="Confirmar contraseña" type="password" autoComplete="new-password" value={form.passwordConfirmation} onChange={(event) => update("passwordConfirmation", event.target.value)} error={errors.passwordConfirmation} disabled={isSubmitting} required minLength="8" maxLength="64" />
          <Button type="submit" disabled={isSubmitting}>{isSubmitting ? <Spinner label="Creando cuenta" /> : "Crear cuenta"}</Button>
        </form>
        <p className="muted">¿Ya tienes una cuenta? <Link className="text-link" to={loginPath}>Inicia sesión</Link></p>
      </Card>
    </main>
  );
}
