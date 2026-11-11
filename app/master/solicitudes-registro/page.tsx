"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useRouter } from "next/navigation";

type RequestRow = { id: string; nombreCliente: string; email: string; telefono: string; identificacion: string; estado: string; nombreCampana?: string; creadoEn?: { seconds: number } };

export default function SolicitudesRegistroPage() {
  const router = useRouter();
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("todas");
  const [selected, setSelected] = useState<string[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, "solicitudesRegistro"), orderBy("creadoEn", "desc")));
      setRows(snap.docs.map(d => ({ ...d.data(), id: d.id } as RequestRow)));
      setSelected(previous => previous.filter(id => snap.docs.some(d => d.id === id)));
    } catch { setError("No fue posible cargar las solicitudes. Revisa los permisos."); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    let active = true;
    const unsubscribe = onAuthStateChanged(auth, async user => {
      if (!user) { router.replace("/master/login"); return; }
      try {
        const token = await user.getIdToken();
        const response = await fetch("/api/master/verificar-acceso", { headers: { Authorization: "Bearer " + token }, cache: "no-store" });
        if (!response.ok) { router.replace(response.status === 403 ? "/login" : "/master/login"); return; }
        if (active) void load();
      } catch { router.replace("/master/login"); }
    });
    return () => { active = false; unsubscribe(); };
  }, [router]);

  const filtered = useMemo(() => rows.filter(r => {
    const match = [r.nombreCliente, r.email, r.identificacion, r.telefono, r.nombreCampana].some(v => String(v || "").toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
    return match && (filter === "todas" || r.estado === filter);
  }), [rows, search, filter]);
  const allVisibleSelected = filtered.length > 0 && filtered.every(r => selected.includes(r.id));

  const perform = async (action: "aprobar" | "rechazar" | "eliminar", ids: string[]) => {
    if (!ids.length || busy) return;
    const prompt = action === "eliminar"
      ? `¿Eliminar ${ids.length} solicitud(es) del listado? Esta acción no elimina cuentas de Authentication, clientes, usuarios ni el historial de demos. No se puede deshacer.`
      : action === "aprobar" ? "¿Aprobar el plan Free de este candidato?" : "¿Rechazar esta solicitud?";
    if (!window.confirm(prompt)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Sesión requerida.");
      const chunks = action === "eliminar" ? Array.from({ length: Math.ceil(ids.length / 400) }, (_, i) => ids.slice(i * 400, (i + 1) * 400)) : [ids];
      for (const chunk of chunks) {
        const response = await fetch("/api/master/solicitudes-registro", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: "Bearer " + token },
          body: JSON.stringify(action === "eliminar" ? { action, uids: chunk } : { action, uid: chunk[0] }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "No fue posible procesar la solicitud.");
      }
      setMessage(action === "eliminar" ? `Se eliminaron ${ids.length} solicitudes del listado.` : action === "aprobar" ? "Solicitud aprobada correctamente." : "Solicitud rechazada.");
      setSelected([]);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Error inesperado."); }
    finally { setBusy(false); }
  };

  const buttonBase = "rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";
  return <main className="min-h-screen bg-[#f3f7fb] px-4 py-6 text-slate-900 sm:px-7 sm:py-9">
    <div className="mx-auto max-w-6xl">
      <Link href="/master/dashboard" className="text-sm font-semibold text-[#1464d2]">← Volver al Master</Link>
      <header className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#1464d2]">Administración · Plan Free</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-[#15344f] sm:text-3xl">Solicitudes de registro</h1>
          <p className="mt-2 text-sm text-slate-500">Gestiona solicitudes, aprobaciones y registros sin afectar las cuentas de usuario.</p>
        </div>
        <button disabled={busy || loading} onClick={() => void load()} className={buttonBase + " border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}>Actualizar</button>
      </header>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Total", rows.length], ["Pendientes", rows.filter(r => r.estado === "pendiente").length],
          ["Aprobadas", rows.filter(r => r.estado === "aprobado").length], ["Rechazadas", rows.filter(r => r.estado === "rechazado").length],
        ].map(([label, value], i) => <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${["bg-[#a8d64f]", "bg-amber-400", "bg-emerald-500", "bg-slate-300"][i]}`} /><p className="text-xs font-semibold text-slate-500">{label}</p></div><p className="mt-2 text-2xl font-extrabold text-[#15344f]">{value}</p></div>)}
      </div>

      {error && <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{message}</p>}

      <section className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <input aria-label="Buscar solicitudes" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar nombre, correo, documento, campaña..." className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-[#1464d2] sm:max-w-md" />
          <select aria-label="Filtrar por estado" value={filter} onChange={e => setFilter(e.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="todas">Todos los estados</option><option value="pendiente">Pendientes</option><option value="aprobado">Aprobadas</option><option value="rechazado">Rechazadas</option></select>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-3 sm:px-5">
          <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={allVisibleSelected} onChange={e => setSelected(previous => e.target.checked ? [...new Set([...previous, ...filtered.map(r => r.id)])] : previous.filter(id => !filtered.some(r => r.id === id)))} />Seleccionar visibles ({filtered.length})</label>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">{selected.length} seleccionadas</span>
            <button disabled={busy || !selected.length} onClick={() => void perform("eliminar", selected)} className={buttonBase + " border border-red-200 bg-white text-red-700 hover:bg-red-50"}>Eliminar seleccionadas</button>
            <button disabled={busy || !rows.length} onClick={() => void perform("eliminar", rows.map(r => r.id))} className={buttonBase + " border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"}>Eliminar todas</button>
          </div>
        </div>
        <div className="divide-y divide-slate-100">
          {loading ? <p className="p-8 text-center text-sm text-slate-500">Cargando solicitudes…</p> : !filtered.length ? <p className="p-8 text-center text-sm text-slate-500">No hay solicitudes que coincidan con tu búsqueda.</p> : filtered.map(r => <div key={r.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="flex min-w-0 items-start gap-3">
              <input aria-label={`Seleccionar solicitud de ${r.nombreCliente}`} type="checkbox" className="mt-1.5" checked={selected.includes(r.id)} onChange={e => setSelected(previous => e.target.checked ? [...previous, r.id] : previous.filter(id => id !== r.id))} />
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-bold text-[#15344f]">{r.nombreCliente || "Sin nombre"}</p><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${r.estado === "pendiente" ? "bg-amber-50 text-amber-700" : r.estado === "aprobado" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{r.estado}</span></div>
                <p className="mt-1 break-all text-sm text-slate-600">{r.email} · {r.telefono || "Sin teléfono"}</p>
                <p className="mt-1 text-xs text-slate-500">Documento: {r.identificacion || "—"} · {r.nombreCampana || "Sin nombre de campaña"} · Free / 3 niveles</p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2 pl-6 sm:pl-0">
              {r.estado === "pendiente" && <><button disabled={busy} onClick={() => void perform("rechazar", [r.id])} className={buttonBase + " border border-slate-200 text-slate-700 hover:bg-slate-50"}>Rechazar</button><button disabled={busy} onClick={() => void perform("aprobar", [r.id])} className={buttonBase + " bg-[#a8d64f] text-[#20320b] hover:bg-[#b9e56a]"}>Aprobar</button></>}
              <button disabled={busy} onClick={() => void perform("eliminar", [r.id])} className={buttonBase + " border border-red-200 text-red-700 hover:bg-red-50"}>Eliminar</button>
            </div>
          </div>)}
        </div>
      </section>
      <p className="mt-4 text-xs leading-5 text-slate-500">Eliminar una solicitud solo limpia este listado. No elimina usuarios, campañas aprobadas ni el registro que impide solicitar una segunda demo.</p>
    </div>
  </main>;
}
