"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification, reload } from "firebase/auth";
import { auth } from "@/lib/firebase";
import RegistroCampana, { type CampanaInicial } from "./RegistroCampana";

export default function RegistroPage() {
  const [form, setForm] = useState({ nombre: "", identificacion: "", telefono: "", email: "", password: "", campana: "", ciudad: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);
  const [wizard, setWizard] = useState(false);
  const [existingAccount, setExistingAccount] = useState(false);
  const [verified, setVerified] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState("");
  const [verificationBusy, setVerificationBusy] = useState(false);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [emailStatus, setEmailStatus] = useState<"idle" | "available" | "used" | "existing">("idle");
  const [emailNotice, setEmailNotice] = useState("");
  const field = (key: keyof typeof form, label: string, type = "text", required = true) => (
    <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span><input required={required} type={type} value={form[key]} onChange={e => { setForm(v => ({ ...v, [key]: e.target.value })); if(key === "email" || key === "password") { setEmailStatus("idle"); setEmailNotice(""); } }} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
  );

  async function checkEmail() {
    const email = form.email.trim().toLowerCase();
    if (!email || !form.password) { setEmailNotice("Ingresa tu correo y contraseña para comprobar tu cuenta."); return false; }
    setCheckingEmail(true); setEmailNotice(""); setError("");
    try {
      const user = auth.currentUser?.email?.toLowerCase() === email
        ? auth.currentUser
        : (await signInWithEmailAndPassword(auth, email, form.password)).user;
      const token = await user.getIdToken();
      const response = await fetch("/api/registro/estado-demo", { headers: { Authorization: "Bearer " + token }, cache: "no-store" });
      if (!response.ok) throw new Error("No fue posible comprobar tu historial de demos. Inténtalo de nuevo.");
      const data = await response.json();
      if (data.used) {
        setEmailStatus("used");
        setEmailNotice(data.status === "pendiente" ? "Ya tienes una solicitud de demo pendiente. No necesitas registrarte nuevamente." : "Esta cuenta ya utilizó su única demo gratuita. No puede crear otra.");
        return false;
      }
      setExistingAccount(true);
      setEmailStatus("existing");
      setEmailNotice("Cuenta existente validada. Puedes continuar con tu primera demo sin perder acceso a otras redes.");
      return true;
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === "auth/invalid-credential" || code === "auth/user-not-found" || code === "auth/wrong-password") {
        if (existingAccount) {
          setEmailNotice("No se pudo autenticar la cuenta. Comprueba el correo y su contraseña actual.");
          return false;
        }
        setEmailStatus("available");
        setEmailNotice("Si el correo no está registrado, crearemos tu cuenta al finalizar. Si ya existe, deberás usar tu contraseña actual.");
        return true;
      }
      setEmailNotice(err instanceof Error ? err.message : "No fue posible comprobar el correo.");
      return false;
    } finally { setCheckingEmail(false); }
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (form.password.length < 8 && !existingAccount) { setError("La contraseña debe tener al menos 8 caracteres."); return; }
    if (emailStatus === "used") return;
    const canContinue = await checkEmail();
    if (canContinue) { setError(""); setWizard(true); }
  }

  async function finishRegistration(campanaInicial: CampanaInicial) {
    setError("");
    setLoading(true);
    try {
      const email = form.email.trim().toLowerCase();
      let user;
      if (existingAccount) {
        const credential = await signInWithEmailAndPassword(auth, email, form.password);
        user = credential.user;
      } else {
        try {
          const credential = await createUserWithEmailAndPassword(auth, email, form.password);
          user = credential.user;
        } catch (creationError: unknown) {
          if ((creationError as { code?: string })?.code !== "auth/email-already-in-use") throw creationError;
          setExistingAccount(true);
          setWizard(false);
          setError("Este correo ya está registrado. Selecciona «Ya tengo cuenta» e ingresa tu contraseña actual para comprobar si tienes una demo disponible.");
          return;
        }
      }
      const token = await user.getIdToken();
      const response = await fetch("/api/registro/solicitar-demo", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          nombre: form.nombre, identificacion: form.identificacion,
          telefono: form.telefono, campana: form.campana, ciudad: form.ciudad, campanaInicial,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "No fue posible registrar la solicitud.");
      setVerified(user.emailVerified);
      setComplete(true);
      if (!user.emailVerified) {
        try { await sendEmailVerification(user); setVerificationMessage("Enlace de verificación enviado a " + email + ". Revisa Spam."); }
        catch { setVerificationMessage("Solicitud guardada, pero falló el envío del enlace. Pulsa Reenviar."); }
      }
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      setError(code === "auth/invalid-credential" || code === "auth/wrong-password"
        ? "La contraseña de tu cuenta existente no es correcta."
        : code === "auth/weak-password" ? "Elige una contraseña más segura."
        : err instanceof Error ? err.message : "No fue posible completar el registro.");
    } finally { setLoading(false); }
  }


  async function verificationAction(resend: boolean) {
    setVerificationBusy(true);
    setVerificationMessage("");
    try {
      let user = auth.currentUser;
      if (!user || user.email?.toLowerCase() !== form.email.trim().toLowerCase()) {
        user = (await signInWithEmailAndPassword(auth, form.email.trim().toLowerCase(), form.password)).user;
      }
      await reload(user);
      if (user.emailVerified) {
        setVerified(true);
        setVerificationMessage("Correo verificado. El Master ya puede aprobar la solicitud.");
      } else if (resend) {
        await sendEmailVerification(user);
        setVerificationMessage("Enlace enviado. Revisa la bandeja de entrada y Spam.");
      } else {
        setVerificationMessage("Aún no se ha verificado. Abre el enlace del correo y vuelve a comprobar.");
      }
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      setVerificationMessage(code === "auth/too-many-requests" ? "Demasiados intentos. Espera unos minutos." : "No fue posible comprobar o enviar el enlace. Intenta nuevamente.");
    } finally { setVerificationBusy(false); }
  }

  return <main className="min-h-screen bg-[#f3f7fb] px-3 py-5 text-slate-900 sm:px-6 sm:py-8">
    <div className="mx-auto max-w-6xl">
      <Link href="/" className="text-sm font-semibold text-blue-700">← Volver a Autoridad Política</Link>
      <div className="mt-4 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-900/5 lg:grid lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="bg-[#123c60] px-5 py-6 text-white sm:px-7 lg:flex lg:flex-col lg:justify-center lg:px-8">
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-blue-100">Plan Free · Solicitud individual</span>
          <h1 className="mt-4 text-2xl font-extrabold sm:text-3xl">Tu campaña comienza aquí</h1>
          <p className="mt-3 max-w-lg text-sm leading-6 text-slate-200">Registra tu campaña y activa tu plan gratuito de 3 niveles de red.</p><div className="mt-5 grid grid-cols-3 gap-2 text-center text-xs lg:mt-10 lg:grid-cols-1 lg:text-left"><div className="rounded-xl bg-white/10 p-3">01 · Tus datos</div><div className="rounded-xl bg-white/10 p-3">02 · Campaña</div><div className="rounded-xl bg-white/10 p-3">03 · Verificación</div></div><p className="mt-5 text-xs leading-5 text-blue-100">Una demo por cuenta. Sujeto a verificación de correo y aprobación.</p>
        </div>
        {complete ? <div className="px-6 py-12 text-center sm:px-10">
          <div className="text-4xl">✓</div>
          <h2 className="mt-4 text-2xl font-bold">Solicitud recibida</h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-slate-600">Tu demo quedó pendiente de aprobación Master. Conservas el acceso a otras redes.</p>
          <div className="mx-auto mt-6 max-w-md rounded-2xl border border-blue-100 bg-blue-50 p-5 text-left">
            <p className="font-bold text-[#123c60]">{verified ? "Correo verificado" : "Verifica tu correo para habilitar la aprobación"}</p>
            <p className="mt-2 text-sm text-slate-600">{verified ? "Tu dirección ya está confirmada." : "Abre el enlace enviado a " + form.email + ". Revisa también Spam."}</p>
            {verificationMessage && <p role="status" className="mt-3 text-sm text-blue-900">{verificationMessage}</p>}
            {!verified && <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" disabled={verificationBusy} onClick={() => void verificationAction(true)} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">Reenviar verificación</button>
              <button type="button" disabled={verificationBusy} onClick={() => void verificationAction(false)} className="rounded-xl border border-blue-200 bg-white px-4 py-2.5 text-sm font-semibold text-blue-800 disabled:opacity-50">Ya verifiqué mi correo</button>
            </div>}
          </div>
          <Link href="/" className="mt-6 inline-flex rounded-xl border px-5 py-3 text-sm font-bold text-slate-700">Volver al inicio</Link>
        </div> :
        wizard ? <RegistroCampana nombre={form.nombre} initialName={form.campana} busy={loading} submitError={error} onFinish={finishRegistration} /> :
        <form onSubmit={submit} className="space-y-5 p-5 sm:p-7 lg:p-8">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-xl font-extrabold text-[#15344f]">Crear solicitud</h2><p className="mt-1 text-xs text-slate-500">Completa tus datos para continuar.</p></div><span className="rounded-full bg-lime-50 px-3 py-1.5 text-xs font-bold text-lime-800">Free · Sin costo</span></div>
          <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
            {field("nombre","Nombre completo *")}
            {field("identificacion","Documento de identidad *")}
            {field("telefono","Teléfono *","tel")}
            {field("email","Correo electrónico *","email")}
          </div>
          <div className="grid gap-x-4 gap-y-3 border-t border-slate-100 pt-4 sm:grid-cols-2">
            {field("campana","Nombre de campaña (opcional)","text",false)}
            {field("ciudad","Ciudad (opcional)","text",false)}
          </div>
          <div className="border-t border-slate-100 pt-4">
            <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
              {field("password",existingAccount?"Contraseña actual *":"Contraseña *","password")}
              <button type="button" disabled={checkingEmail || !form.email || !form.password} onClick={() => void checkEmail()} className="h-11 rounded-xl border border-blue-200 bg-blue-50 px-4 text-sm font-bold text-blue-800 disabled:opacity-50">{checkingEmail ? "Comprobando..." : "Comprobar correo"}</button>
            </div>
            <label className="mt-3 flex items-start gap-2 text-xs text-slate-600"><input type="checkbox" checked={existingAccount} onChange={e => {setExistingAccount(e.target.checked);setEmailStatus("idle");setEmailNotice("");}} className="mt-0.5" /><span>Ya tengo una cuenta y quiero solicitar mi primera demo.</span></label>
            {emailNotice && <p role="status" className={`mt-3 rounded-xl p-3 text-sm ${emailStatus === "used" ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-800"}`}>{emailNotice}</p>}
          </div>
          {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <div className="flex flex-col-reverse items-stretch justify-between gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center"><p className="text-xs text-slate-500">¿Ya tienes acceso? <Link href="/login" className="font-bold text-blue-700">Iniciar sesión</Link></p><button disabled={loading || checkingEmail || emailStatus === "used"} className="rounded-xl bg-[#126db2] px-6 py-3 text-sm font-bold text-white disabled:opacity-50">{checkingEmail ? "Validando..." : "Continuar a mi campaña →"}</button></div>
        </form>}
      </div>
    </div>
  </main>;
}
