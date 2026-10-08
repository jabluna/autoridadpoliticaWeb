"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { createUserWithEmailAndPassword, onAuthStateChanged, signOut, updateProfile, type User } from "firebase/auth";
import { collection, doc, getDocs, orderBy, query, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { deleteApp, getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth, db, storage, firebaseConfig } from "@/lib/firebase";

type AdminRow = {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  telefono?: string;
  cargo?: string;
  fotoURL?: string;
  estado?: string;
};

export default function AdministradoresMasterPage() {
  const router = useRouter();
  const [sessionUser, setSessionUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [form, setForm] = useState({
    nombre: "", apellido: "", email: "", telefono: "", cargo: "", password: ""
  });

  useEffect(() => onAuthStateChanged(auth, (u) => {
    if (!u) return router.replace("/master/login");
    setSessionUser(u);
    setChecking(false);
  }), [router]);

  const loadAdmins = async () => {
    try {
      setLoadingList(true);
      const snap = await getDocs(query(collection(db, "administradoresMaster"), orderBy("nombre")));
      setAdmins(snap.docs.map(d => ({ id: d.id, ...d.data() } as AdminRow)));
    } catch (e) {
      console.error(e);
      setError("No fue posible cargar los administradores.");
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => { if (!checking) loadAdmins(); }, [checking]);

  const requirements = useMemo(() => ({
    length: form.password.length >= 8,
    upper: /[A-Z]/.test(form.password),
    lower: /[a-z]/.test(form.password),
    number: /\d/.test(form.password),
    special: /[^A-Za-z0-9]/.test(form.password),
  }), [form.password]);

  const validPassword = Object.values(requirements).every(Boolean);

  const setField = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setError(""); setMessage("");
  };

  const onPhoto = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("Selecciona un archivo de imagen válido.");
    if (file.size > 3 * 1024 * 1024) return setError("La fotografía no debe superar 3 MB.");
    setPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));
    setError("");
  };

  const saveAdmin = async (e: FormEvent) => {
    e.preventDefault();
    setError(""); setMessage("");
    if (!form.nombre.trim() || !form.apellido.trim() || !form.email.trim() || (!editingId && !form.password)) {
      return setError("Completa los campos obligatorios.");
    }
    if (!editingId && !validPassword) return setError("La contraseña aún no cumple todos los requisitos.");

    setSaving(true);
    let secondaryApp: ReturnType<typeof initializeApp> | null = null;
    try {
      if (editingId) {
        let fotoURL = photoPreview;
        if (photo) {
          const safeName = photo.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const photoRef = ref(storage, `administradoresMaster/${editingId}/perfil-${Date.now()}-${safeName}`);
          await uploadBytes(photoRef, photo);
          fotoURL = await getDownloadURL(photoRef);
        }
        await updateDoc(doc(db, "administradoresMaster", editingId), {
          nombre: form.nombre.trim(),
          apellido: form.apellido.trim(),
          nombreCompleto: `${form.nombre.trim()} ${form.apellido.trim()}`,
          telefono: form.telefono.trim(),
          cargo: form.cargo.trim(),
          fotoURL,
        });
        cancelEdit();
        setMessage("Administrador actualizado correctamente.");
        await loadAdmins();
        return;
      }
      const secondaryName = `adminCreator-${Date.now()}`;
      secondaryApp = initializeApp(firebaseConfig, secondaryName);
      const secondaryAuth = getAuth(secondaryApp);
      const credential = await createUserWithEmailAndPassword(secondaryAuth, form.email.trim().toLowerCase(), form.password);
      const uid = credential.user.uid;

      let fotoURL = "";
      if (photo) {
        const safeName = photo.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const photoRef = ref(storage, `administradoresMaster/${uid}/perfil-${Date.now()}-${safeName}`);
        await uploadBytes(photoRef, photo);
        fotoURL = await getDownloadURL(photoRef);
      }

      const nombreCompleto = `${form.nombre.trim()} ${form.apellido.trim()}`;
      await updateProfile(credential.user, { displayName: nombreCompleto, photoURL: fotoURL || null });

      await setDoc(doc(db, "administradoresMaster", uid), {
        uid,
        nombre: form.nombre.trim(),
        apellido: form.apellido.trim(),
        nombreCompleto,
        email: form.email.trim().toLowerCase(),
        telefono: form.telefono.trim(),
        cargo: form.cargo.trim(),
        fotoURL,
        rol: "master",
        estado: "activo",
        creadoPor: sessionUser?.uid || "",
        creadoEn: serverTimestamp(),
      });

      await signOut(secondaryAuth);
      setForm({ nombre: "", apellido: "", email: "", telefono: "", cargo: "", password: "" });
      setPhoto(null); setPhotoPreview("");
      setMessage("Administrador creado correctamente.");
      await loadAdmins();
    } catch (e: any) {
      console.error(e);
      const code = e?.code || "";
      if (code === "auth/email-already-in-use") setError("Ya existe un usuario registrado con este correo.");
      else if (code === "auth/invalid-email") setError("El correo electrónico no es válido.");
      else if (code === "storage/unauthorized") setError("Firebase Storage no permitió subir la fotografía. Revisa sus reglas.");
      else setError("No fue posible crear el administrador. Revisa la consola para más detalle.");
    } finally {
      if (secondaryApp) {
        try { await deleteApp(secondaryApp); } catch {}
      }
      setSaving(false);
    }
  };


  const startEdit = (a: AdminRow) => {
    setEditingId(a.id);
    setForm({
      nombre: a.nombre || "",
      apellido: a.apellido || "",
      email: a.email || "",
      telefono: a.telefono || "",
      cargo: a.cargo || "",
      password: "",
    });
    setPhotoPreview(a.fotoURL || "");
    setPhoto(null);
    setMessage("");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm({ nombre: "", apellido: "", email: "", telefono: "", cargo: "", password: "" });
    setPhoto(null);
    setPhotoPreview("");
    setError("");
    setMessage("");
  };

  const toggleStatus = async (a: AdminRow) => {
    try {
      setActionId(a.id);
      const next = (a.estado || "activo") === "activo" ? "inactivo" : "activo";
      await updateDoc(doc(db, "administradoresMaster", a.id), { estado: next });
      setMessage(next === "inactivo" ? "Administrador desactivado." : "Administrador activado.");
      await loadAdmins();
    } catch (e) {
      console.error(e);
      setError("No fue posible cambiar el estado del administrador.");
    } finally {
      setActionId(null);
    }
  };

  if (checking) return <div className="flex min-h-screen items-center justify-center bg-[#f4f7fb] text-sm text-slate-500">Validando sesión...</div>;

  return (
    <main className="min-h-screen bg-[#f4f7fb]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-4 py-4 sm:px-7">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/master/dashboard")} className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50">←</button>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.16em] text-blue-600">Panel Master</p>
              <h1 className="text-xl font-semibold tracking-tight text-slate-950">Administradores</h1>
            </div>
          </div>
          <button onClick={() => signOut(auth).then(() => router.replace("/master/login"))} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">Cerrar sesión</button>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] gap-6 px-4 py-6 sm:px-7 xl:grid-cols-[430px_1fr]">
        <section className="h-fit rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-slate-950">{editingId ? "Editar administrador" : "Nuevo administrador"}</h2>
            <p className="mt-1 text-sm text-slate-500">Crea una persona con acceso a funciones Master.</p>
          </div>

          <form onSubmit={saveAdmin} className="space-y-4">
            <div className="flex items-center gap-4 rounded-2xl bg-slate-50 p-4">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white text-xl font-semibold text-slate-400">
                {photoPreview ? <img src={photoPreview} alt="Vista previa" className="h-full w-full object-cover" /> : "Foto"}
              </div>
              <div>
                <label className="inline-flex cursor-pointer rounded-xl bg-[#0b1b30] px-4 py-2 text-xs font-semibold text-white hover:bg-[#102a49]">
                  Agregar fotografía
                  <input type="file" accept="image/*" onChange={onPhoto} className="hidden" />
                </label>
                <p className="mt-2 text-[11px] text-slate-400">JPG, PNG o WEBP · Máx. 3 MB</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <Field label="Nombres *" value={form.nombre} onChange={v => setField("nombre", v)} />
              <Field label="Apellidos *" value={form.apellido} onChange={v => setField("apellido", v)} />
            </div>
            <div><label className="mb-2 block text-sm font-medium text-slate-700">Correo electrónico *</label><input type="email" value={form.email} disabled={!!editingId} onChange={e => setField("email", e.target.value)} className="h-12 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-slate-400 disabled:bg-slate-100 disabled:text-slate-500" />{editingId && <p className="mt-1 text-[11px] text-slate-400">El correo de acceso no se modifica desde esta edición.</p>}</div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <Field label="Teléfono" value={form.telefono} onChange={v => setField("telefono", v)} />
              <Field label="Cargo / función" value={form.cargo} onChange={v => setField("cargo", v)} />
            </div>

            {!editingId && <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Contraseña *</label>
              <div className="relative">
                <input type={showPassword ? "text" : "password"} value={form.password} onChange={e => setField("password", e.target.value)} className="h-12 w-full rounded-xl border border-slate-200 px-3 pr-16 text-sm outline-none focus:border-slate-400" placeholder="Crear contraseña" />
                <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute inset-y-0 right-3 text-xs font-semibold text-slate-500">{showPassword ? "Ocultar" : "Ver"}</button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                <Req ok={requirements.length} text="8 caracteres" />
                <Req ok={requirements.upper} text="1 mayúscula" />
                <Req ok={requirements.lower} text="1 minúscula" />
                <Req ok={requirements.number} text="1 número" />
                <Req ok={requirements.special} text="1 símbolo" />
              </div>
            </div>}

            {error && <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
            {message && <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>}

            <button disabled={saving} className="h-12 w-full rounded-xl bg-[#0b1b30] text-sm font-semibold text-white hover:bg-[#102a49] disabled:opacity-50">
              {saving ? "Guardando..." : editingId ? "Guardar cambios" : "Guardar administrador"}
            </button>
            {editingId && <button type="button" onClick={cancelEdit} className="h-11 w-full rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancelar edición</button>}
          </form>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 p-5 sm:p-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Administradores registrados</h2>
              <p className="mt-1 text-sm text-slate-500">{admins.length} registro{admins.length === 1 ? "" : "s"}</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                <tr><th className="px-5 py-4">Administrador</th><th className="px-5 py-4">Contacto</th><th className="px-5 py-4">Cargo</th><th className="px-5 py-4">Estado</th><th className="px-5 py-4">Acciones</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loadingList ? (
                  <tr><td colSpan={5} className="px-5 py-12 text-center text-sm text-slate-400">Cargando administradores...</td></tr>
                ) : admins.length === 0 ? (
                  <tr><td colSpan={5} className="px-5 py-12 text-center text-sm text-slate-400">Aún no hay administradores registrados.</td></tr>
                ) : admins.map(a => (
                  <tr key={a.id} className="hover:bg-slate-50/70">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-slate-100 text-xs font-semibold text-slate-500">
                          {a.fotoURL ? <img src={a.fotoURL} alt="" className="h-full w-full object-cover" /> : `${a.nombre?.[0] || ""}${a.apellido?.[0] || ""}`}
                        </div>
                        <div><p className="text-sm font-semibold text-slate-800">{a.nombre} {a.apellido}</p><p className="text-xs text-slate-400">Master</p></div>
                      </div>
                    </td>
                    <td className="px-5 py-4"><p className="text-sm text-slate-700">{a.email}</p><p className="mt-1 text-xs text-slate-400">{a.telefono || "Sin teléfono"}</p></td>
                    <td className="px-5 py-4 text-sm text-slate-600">{a.cargo || "Administrador"}</td>
                    <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${(a.estado || "activo") === "activo" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{a.estado || "activo"}</span></td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <button onClick={() => startEdit(a)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Editar</button>
                        <button disabled={actionId === a.id} onClick={() => toggleStatus(a)} className={`rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50 ${(a.estado || "activo") === "activo" ? "bg-red-50 text-red-600 hover:bg-red-100" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"}`}>
                          {actionId === a.id ? "..." : (a.estado || "activo") === "activo" ? "Desactivar" : "Activar"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return <div><label className="mb-2 block text-sm font-medium text-slate-700">{label}</label><input type={type} value={value} onChange={e => onChange(e.target.value)} className="h-12 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-slate-400" /></div>;
}
function Req({ ok, text }: { ok: boolean; text: string }) {
  return <span className={`flex items-center gap-1.5 ${ok ? "text-emerald-600" : "text-slate-400"}`}><span>{ok ? "✓" : "○"}</span>{text}</span>;
}
