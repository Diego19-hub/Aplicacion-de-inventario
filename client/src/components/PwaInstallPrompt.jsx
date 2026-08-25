import { Download, X } from "lucide-react";
import { useEffect, useState } from "react";

const DISMISSED_KEY = "inventario-pwa-install-dismissed";

export function PwaInstallPrompt() {
  const [installEvent, setInstallEvent] = useState(null);
  const [isDismissed, setIsDismissed] = useState(() => {
    try {
      return window.localStorage.getItem(DISMISSED_KEY) === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    function handleBeforeInstallPrompt(event) {
      event.preventDefault();
      setInstallEvent(event);
    }

    function handleAppInstalled() {
      setInstallEvent(null);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  if (!installEvent || isDismissed) return null;

  async function install() {
    installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
  }

  function dismiss() {
    setIsDismissed(true);
    try {
      window.localStorage.setItem(DISMISSED_KEY, "true");
    } catch {
      // La instalación sigue siendo opcional si localStorage no está disponible.
    }
  }

  return <aside className="pwa-install-prompt" aria-label="Instalar aplicación">
    <div>
      <strong>Instala Inventario</strong>
      <p>Accede más rápido desde tu dispositivo.</p>
    </div>
    <div className="pwa-install-prompt__actions">
      <button type="button" className="button button--primary" onClick={install}><Download aria-hidden="true" />Instalar aplicación</button>
      <button type="button" className="pwa-install-prompt__close" onClick={dismiss} aria-label="Cerrar aviso de instalación"><X aria-hidden="true" /></button>
    </div>
  </aside>;
}
