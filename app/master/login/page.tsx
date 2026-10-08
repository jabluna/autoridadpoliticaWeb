"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";

export default function MasterLoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        router.replace("/master/dashboard");
        return;
      }

      setCheckingSession(false);
    });

    return unsubscribe;
  }, [router]);

  const clearMessages = () => {
    setError("");
    setSuccess("");
  };

  const getAuthErrorMessage = (err: unknown) => {
    const code =
      typeof err === "object" && err !== null && "code" in err
        ? String((err as { code?: string }).code)
        : "";

    switch (code) {
      case "auth/invalid-email":
        return "El correo electrónico no es válido.";
      case "auth/invalid-credential":
      case "auth/wrong-password":
      case "auth/user-not-found":
        return "El correo o la contraseña no son correctos.";
      case "auth/user-disabled":
        return "Esta cuenta se encuentra deshabilitada.";
      case "auth/too-many-requests":
        return "Se realizaron demasiados intentos. Intenta nuevamente más tarde.";
      case "auth/network-request-failed":
        return "No fue posible conectar con el servicio. Revisa tu conexión a internet.";
      case "auth/popup-blocked":
        return "El navegador bloqueó la ventana de Google. Habilita las ventanas emergentes e intenta de nuevo.";
      case "auth/unauthorized-domain":
        return "Este dominio no está autorizado en Firebase Authentication.";
      default:
        return "No fue posible completar la operación. Intenta nuevamente.";
    }
  };

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearMessages();

    if (!email.trim() || !password) {
      setError("Ingresa tu correo electrónico y contraseña.");
      return;
    }

    try {
      setLoading(true);
      await signInWithEmailAndPassword(auth, email.trim(), password);
      router.replace("/master/dashboard");
    } catch (err: unknown) {
      console.error(err);
      setError(getAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    clearMessages();

    try {
      setGoogleLoading(true);
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });

      await signInWithPopup(auth, provider);
      router.replace("/master/dashboard");
    } catch (err: unknown) {
      const code =
        typeof err === "object" && err !== null && "code" in err
          ? String((err as { code?: string }).code)
          : "";

      if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") {
        console.error(err);
        setError(getAuthErrorMessage(err));
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleResetPassword = async () => {
    clearMessages();

    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      setError("Escribe tu correo electrónico en el campo superior para recuperar la contraseña.");
      return;
    }

    try {
      setResetLoading(true);
      await sendPasswordResetEmail(auth, normalizedEmail);
      setSuccess(
        "Solicitud enviada. Si la cuenta corresponde a un acceso válido, revisa el correo para continuar con el cambio de contraseña."
      );
    } catch (err: unknown) {
      console.error(err);
      setError(getAuthErrorMessage(err));
    } finally {
      setResetLoading(false);
    }
  };

  const busy = loading || googleLoading || resetLoading;

  if (checkingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f7fb]">
        <div className="flex items-center gap-3 text-sm font-medium text-slate-500">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-[#071526]" />
          Validando sesión...
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#f5f7fb] lg:grid lg:grid-cols-[1.08fr_0.92fr]">
      <section className="relative hidden min-h-screen overflow-hidden bg-[#071526] px-12 py-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -left-32 top-24 h-96 w-96 rounded-full bg-[#164e63]/30 blur-3xl" />
        <div className="absolute -bottom-28 right-0 h-[420px] w-[420px] rounded-full bg-[#1d4ed8]/20 blur-3xl" />
        <div className="absolute right-14 top-14 h-20 w-20 rounded-full border border-white/10" />
        <div className="absolute right-24 top-24 h-36 w-36 rounded-full border border-white/[0.06]" />

        <div className="relative z-10 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[#071526] shadow-xl shadow-black/20">
            <svg width="25" height="25" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 2L20 6.5V17.5L12 22L4 17.5V6.5L12 2Z" stroke="currentColor" strokeWidth="1.7" />
              <circle cx="12" cy="9" r="2.3" fill="currentColor" />
              <path d="M7.8 16.3C8.8 13.9 10.2 12.7 12 12.7C13.8 12.7 15.2 13.9 16.2 16.3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <p className="text-base font-semibold tracking-wide">Autoridad Política</p>
            <p className="text-xs text-slate-400">Plataforma de gestión territorial</p>
          </div>
        </div>

        <div className="relative z-10 max-w-xl">
          <span className="mb-6 inline-flex rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] text-slate-300">
            Administración central
          </span>

          <h1 className="text-5xl font-semibold leading-[1.08] tracking-[-0.04em] xl:text-6xl">
            Construye,
            <br />
            organiza y conecta
            <br />
            <span className="text-slate-400">redes territoriales.</span>
          </h1>

          <p className="mt-7 max-w-lg text-base leading-7 text-slate-400">
            Gestiona campañas, estructuras, líderes, nodos y equipos desde una
            plataforma diseñada para crecer desde lo local hasta lo nacional.
          </p>

          <div className="mt-10 grid max-w-lg grid-cols-3 gap-3">
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.04] p-4">
              <p className="text-xl font-semibold">360°</p>
              <p className="mt-1 text-xs text-slate-400">Visión de la red</p>
            </div>
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.04] p-4">
              <p className="text-xl font-semibold">Multi</p>
              <p className="mt-1 text-xs text-slate-400">Campañas y nodos</p>
            </div>
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.04] p-4">
              <p className="text-xl font-semibold">Live</p>
              <p className="mt-1 text-xs text-slate-400">Información centralizada</p>
            </div>
          </div>
        </div>

        <div className="relative z-10 flex items-center justify-between text-xs text-slate-500">
          <span>Panel Master</span>
          <span>Acceso restringido</span>
        </div>
      </section>

      <section className="relative flex min-h-screen items-center justify-center px-5 py-10 sm:px-8 lg:px-12">
        <div className="absolute left-5 top-6 flex items-center gap-3 lg:hidden">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#071526] text-white">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 2L20 6.5V17.5L12 22L4 17.5V6.5L12 2Z" stroke="currentColor" strokeWidth="1.7" />
              <circle cx="12" cy="9" r="2.3" fill="currentColor" />
              <path d="M7.8 16.3C8.8 13.9 10.2 12.7 12 12.7C13.8 12.7 15.2 13.9 16.2 16.3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Autoridad Política</p>
            <p className="text-[11px] text-slate-500">Panel Master</p>
          </div>
        </div>

        <div className="w-full max-w-[440px] pt-16 lg:pt-0">
          <div className="mb-9">
            <p className="mb-3 text-sm font-semibold text-blue-600">ACCESO MASTER</p>
            <h2 className="text-3xl font-semibold tracking-[-0.035em] text-slate-950 sm:text-[38px]">
              Bienvenido de nuevo
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              Ingresa tus credenciales para acceder al centro de administración.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-700">
                Correo electrónico
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M4 6.5H20V17.5H4V6.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                    <path d="M4.5 7L12 12.5L19.5 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error || success) clearMessages();
                  }}
                  autoComplete="email"
                  placeholder="nombre@correo.com"
                  className="h-14 w-full rounded-2xl border border-slate-200 bg-white pl-12 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-4 focus:ring-slate-900/[0.04]"
                />
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-4">
                <label htmlFor="password" className="text-sm font-medium text-slate-700">
                  Contraseña
                </label>
                <button
                  type="button"
                  onClick={handleResetPassword}
                  disabled={busy}
                  className="text-xs font-medium text-slate-500 transition hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {resetLoading ? "Enviando..." : "¿Olvidaste tu contraseña?"}
                </button>
              </div>

              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <rect x="5" y="10" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.6" />
                    <path d="M8 10V7C8 4.8 9.8 3 12 3C14.2 3 16 4.8 16 7V10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </div>

                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error || success) clearMessages();
                  }}
                  autoComplete="current-password"
                  placeholder="Ingresa tu contraseña"
                  className="h-14 w-full rounded-2xl border border-slate-200 bg-white pl-12 pr-14 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-4 focus:ring-slate-900/[0.04]"
                />

                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-0 flex w-14 items-center justify-center text-slate-400 transition hover:text-slate-700"
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {showPassword ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M3 3L21 21" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                      <path d="M10.6 10.7C10.2 11.1 10 11.5 10 12C10 13.1 10.9 14 12 14C12.5 14 12.9 13.8 13.3 13.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                      <path d="M6.4 6.5C4.7 7.7 3.5 9.5 2.5 12C4.5 16.5 7.6 18.5 12 18.5C13.7 18.5 15.2 18.2 16.5 17.5M9.2 5.8C10.1 5.6 11 5.5 12 5.5C16.4 5.5 19.5 7.5 21.5 12C20.9 13.4 20.2 14.5 19.3 15.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M2.5 12C4.5 7.5 7.6 5.5 12 5.5C16.4 5.5 19.5 7.5 21.5 12C19.5 16.5 16.4 18.5 12 18.5C7.6 18.5 4.5 16.5 2.5 12Z" stroke="currentColor" strokeWidth="1.7" />
                      <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.7" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div role="alert" className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm leading-5 text-red-700">
                {error}
              </div>
            )}

            {success && (
              <div role="status" className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm leading-5 text-emerald-700">
                {success}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="flex h-14 w-full items-center justify-center rounded-2xl bg-[#071526] px-6 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 transition duration-200 hover:-translate-y-0.5 hover:bg-[#0b2139] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
            >
              {loading ? (
                <span className="flex items-center gap-3">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Ingresando...
                </span>
              ) : (
                "Ingresar al panel"
              )}
            </button>
          </form>

          <div className="my-7 flex items-center gap-4">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-xs text-slate-400">o continuar con</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={busy}
            className="flex h-14 w-full items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-6 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {googleLoading ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
                Conectando...
              </>
            ) : (
              <>
                <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M21.8 12.2C21.8 11.5 21.7 10.9 21.6 10.3H12V14.1H17.5C17.3 15.3 16.6 16.3 15.6 17V19.5H18.8C20.7 17.8 21.8 15.2 21.8 12.2Z" />
                  <path fill="#34A853" d="M12 22C14.7 22 17 21.1 18.8 19.5L15.6 17C14.7 17.6 13.5 18 12 18C9.4 18 7.2 16.3 6.4 13.9H3.1V16.5C4.9 19.8 8.2 22 12 22Z" />
                  <path fill="#FBBC05" d="M6.4 13.9C6.2 13.3 6.1 12.7 6.1 12C6.1 11.3 6.2 10.7 6.4 10.1V7.5H3.1C2.4 8.9 2 10.4 2 12C2 13.6 2.4 15.1 3.1 16.5L6.4 13.9Z" />
                  <path fill="#EA4335" d="M12 6C13.6 6 15 6.6 16 7.6L18.9 4.7C17 3 14.7 2 12 2C8.2 2 4.9 4.2 3.1 7.5L6.4 10.1C7.2 7.7 9.4 6 12 6Z" />
                </svg>
                Continuar con Google
              </>
            )}
          </button>

          <p className="mt-9 text-center text-xs leading-5 text-slate-400">
            Acceso exclusivo para administradores autorizados.
            <br />
            Las sesiones y actividades podrán ser auditadas.
          </p>
        </div>
      </section>
    </main>
  );
}
