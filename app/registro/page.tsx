"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import RegistroCampana, { type CampanaInicial } from "./RegistroCampana";

export default function RegistroPage() {
  const [form, setForm] = useState({ nombre: "", identificacion: "", telefono: "", email: "", password: "", campana: "", ciudad: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);
  const [wizard, setWizard] = useState(false);
  const [existingAccount, setExistingAccount] = useState(false);
  const field = (key: keyof typeof form, label: string, type = "text", required = true) => (
    <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span><input required={required} type={type} value={form[key]} onChange={e => setForm(v => ({ ...v, [key]: e.target.value }))} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
  );

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (form.password.length < 8) { setError("La contraseña debe tener al menos 8 caracteres."); return; }
    setError(""); setWizard(true);
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
          setError("Este correo ya está registrado. Puedes solicitar tu demo con tu contraseña actual, sin perder tus redes. Si ya usaste una demo, no podrás solicitar otra.");
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
      if (!user.emailVerified) await sendEmailVerification(user);
      setComplete(true);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      setError(code === "auth/invalid-credential" || code === "auth/wrong-password"
        ? "La contraseña de tu cuenta existente no es correcta."
        : code === "auth/weak-password" ? "Elige una contraseña más segura."
        : err instanceof Error ? err.message : "No fue posible completar el registro.");
    } finally { setLoading(false); }
  }

  return <main className="min-h-screen bg-[#f3f7fb] px-5 py-12 text-slate-900">
    <div className="mx-auto max-w-3xl">
      <Link href="/" className="text-sm font-semibold text-blue-700">← Volver a Autoridad Política</Link>
      <div className="mt-7 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-900/5">
        <div className="bg-[#123c60] px-6 py-9 text-white sm:px-10">
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-blue-100">Plan Free · Solicitud individual</span>
          <h1 className="mt-5 text-3xl font-extrabold">Crea tu cuenta gratuita</h1>
          <p className="mt-2 max-w-lg text-sm leading-6 text-slate-200">Solicita una única demo por cuenta para explorar Autoridad Política. El plan Free incluye 3 niveles de red y requiere verificar tu correo y la aprobación del administrador.</p>
        </div>
        {complete ? <div className="px-6 py-12 text-center sm:px-10"><div className="text-4xl">✓</div><h2 className="mt-4 text-2xl font-bold">Solicitud recibida</h2><p className="mx-auto mt-3 max-w-md text-sm leading-7 text-slate-600">Tu solicitud de demo fue registrada. Si tu correo aún no estaba verificado, te enviamos un enlace de verificación. La aprobación del Master sigue siendo necesaria. Conservas el acceso a las redes a las que ya perteneces.</p><Link href="/" className="mt-6 inline-flex rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white">Volver al inicio</Link></div> :
        wizard ? <RegistroCampana nombre={form.nombre} initialName={form.campana} busy={loading} submitError={error} onFinish={finishRegistration} /> :
        <form onSubmit={submit} className="space-y-6 p-6 sm:p-10">
          <div><h2 className="text-sm font-bold text-slate-900">Datos del usuario</h2><div className="mt-4 grid gap-4 sm:grid-cols-2">{field("nombre","Nombre completo *")}{field("identificacion","Documento de identidad *")}{field("telefono","Teléfono *","tel")}{field("email","Correo electrónico *","email")}</div></div>
          <div className="border-t border-slate-100 pt-6"><h2 className="text-sm font-bold">Información de campaña</h2><div className="mt-4 grid gap-4 sm:grid-cols-2">{field("campana","Nombre de campaña (opcional)","text",false)}{field("ciudad","Ciudad (opcional)","text",false)}</div></div>
          <div className="border-t border-slate-100 pt-6"><h2 className="text-sm font-bold">Seguridad</h2><div className="mt-4 max-w-sm">{field("password",existingAccount?"Contraseña actual de tu cuenta *":"Contraseña (nueva o actual si ya tienes cuenta) *","password")}</div><p className="mt-2 text-xs text-slate-500">Mínimo 8 caracteres para cuentas nuevas. Si ya tienes cuenta, usa tu contraseña actual; no se cambiará.</p><label className="mt-4 flex items-start gap-2 text-sm text-slate-700"><input type="checkbox" checked={existingAccount} onChange={e=>setExistingAccount(e.target.checked)} className="mt-1" /><span>Ya tengo cuenta (como candidato o integrante de otra red) y quiero solicitar mi única demo.</span></label></div>
          <div className="rounded-xl bg-blue-50 p-4 text-xs leading-6 text-blue-900">Registro sujeto a verificación por correo y aprobación. <strong>Plan asignado:</strong> Free · 3 niveles de red · Sin costo. Solo registros individuales; las agencias deben solicitar otro tipo de cuenta.</div>
          {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
          <div className="flex flex-wrap items-center justify-between gap-4"><p className="text-xs text-slate-500">¿Ya tienes cuenta? <Link href="/login" className="font-bold text-blue-700">Inicia sesión</Link></p><button disabled={loading} className="rounded-xl bg-[#126db2] px-7 py-3 text-sm font-bold text-white disabled:opacity-50">{loading ? "Registrando..." : "Continuar a mi campaña →"}</button></div>
        </form>}
      </div>
    </div>
  </main>;
}
