"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection, deleteDoc, doc, getDocs, orderBy, query,
  serverTimestamp, updateDoc
} from "firebase/firestore";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";

type Cliente = {
  id: string;
  authUid?: string;
  tipoCliente: "agencia" | "candidato";
  nombreCliente: string;
  identificacion: string;
  nombreCampana?: string;
  partidoMovimiento?: string;
  cargoAspirado?: string;
  responsable?: string;
  email: string;
  telefono: string;
  ubicacion?: { ciudad?: string; departamento?: string; pais?: string; direccion?: string };
  plan?: { id?: string; nombre?: string; meses?: number; valor?: number; descuento?: number; valorFinal?: number };
  nivelesRed?: number;
  logoURL?: string;
  estado?: "activo" | "inactivo";
};

export default function ClientesMasterPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("todos");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => onAuthStateChanged(auth, user => {
    if (!user) return router.replace("/master/login");
    setChecking(false);
  }), [router]);

  const load = async () => {
    try {
      setLoading(true);
      const snap = await getDocs(query(collection(db, "clientes"), orderBy("nombreCliente")));
      setClientes(snap.docs.map(d => ({ id: d.id, ...d.data() } as Cliente)));
    } catch (e) {
      console.error(e);
      setError("No fue posible cargar los clientes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (!checking) load(); }, [checking]);

  const filtered = useMemo(() => clientes.filter(c => {
    const q = search.trim().toLowerCase();
    const matchesSearch = !q || [
      c.nombreCliente, c.identificacion, c.email, c.nombreCampana,
      c.partidoMovimiento, c.plan?.nombre
    ].some(v => String(v || "").toLowerCase().includes(q));
    const matchesFilter =
      filter === "todos" ||
      filter === c.estado ||
      filter === c.tipoCliente;
    return matchesSearch && matchesFilter;
  }), [clientes, search, filter]);

  const toggle = async (c: Cliente) => {
    try {
      setActionId(c.id); setError(""); setMessage("");
      const estado = (c.estado || "activo") === "activo" ? "inactivo" : "activo";
      await updateDoc(doc(db, "clientes", c.id), { estado, actualizadoEn: serverTimestamp() });
      if (c.authUid) {
        await updateDoc(doc(db, "usuarios", c.authUid), { estado, actualizadoEn: serverTimestamp() });
      }
      setMessage(estado === "inactivo" ? "Cliente inactivado correctamente." : "Cliente activado correctamente.");
      await load();
    } catch (e) {
      console.error(e);
      setError("No fue posible cambiar el estado del cliente.");
    } finally {
      setActionId(null);
    }
  };

  const remove = async (c: Cliente) => {
    const ok = window.confirm(`¿Eliminar a "${c.nombreCliente}" de la base de clientes?\n\nEsta acción elimina su ficha de Firestore. La cuenta de Authentication se conserva por seguridad administrativa.`);
    if (!ok) return;
    try {
      setActionId(c.id); setError(""); setMessage("");
      if (c.authUid) {
        try { await deleteDoc(doc(db, "usuarios", c.authUid)); } catch {}
      }
      await deleteDoc(doc(db, "clientes", c.id));
      setMessage("Cliente eliminado de la base de datos.");
      await load();
    } catch (e) {
      console.error(e);
      setError("No fue posible eliminar el cliente.");
    } finally {
      setActionId(null);
    }
  };

  if (checking) return <div className="flex min-h-screen items-center justify-center bg-[#f5f8ff] text-sm text-slate-500">Validando sesión...</div>;

  return (
    <main className="min-h-screen bg-[#f5f8ff]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-4 px-4 py-5 sm:px-7 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => router.push("/master/dashboard")} className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50">←</button>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.16em] text-[#1464d2]">Administración</p>
              <h1 className="text-xl font-semibold tracking-tight text-slate-950">Clientes</h1>
            </div>
          </div>
          <button onClick={() => router.push("/master/clientes/nuevo")} className="flex h-11 items-center justify-center rounded-xl bg-[#1464d2] px-5 text-sm font-semibold text-white hover:bg-[#0f54b5]">+ Crear nuevo cliente</button>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] px-4 py-7 sm:px-7">
        <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Total clientes" value={clientes.length} tone="blue" />
          <Stat label="Activos" value={clientes.filter(c => (c.estado || "activo") === "activo").length} tone="green" />
          <Stat label="Candidatos" value={clientes.filter(c => c.tipoCliente === "candidato").length} tone="violet" />
          <Stat label="Agencias" value={clientes.filter(c => c.tipoCliente === "agencia").length} tone="amber" />
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Clientes registrados</h2>
              <p className="mt-1 text-sm text-slate-500">Consulta y administra las cuentas creadas.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente..." className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none focus:border-blue-400 sm:w-72" />
              <select value={filter} onChange={e => setFilter(e.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-600 outline-none">
                <option value="todos">Todos</option>
                <option value="activo">Activos</option>
                <option value="inactivo">Inactivos</option>
                <option value="candidato">Candidatos</option>
                <option value="agencia">Agencias</option>
              </select>
            </div>
          </div>

          {(error || message) && <div className="px-5 pt-5 sm:px-6">{error && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}{message && <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>}</div>}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] text-left">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-4">Cliente</th>
                  <th className="px-5 py-4">Tipo</th>
                  <th className="px-5 py-4">Campaña</th>
                  <th className="px-5 py-4">Plan</th>
                  <th className="px-5 py-4">Red</th>
                  <th className="px-5 py-4">Contacto</th>
                  <th className="px-5 py-4">Estado</th>
                  <th className="px-5 py-4">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? <tr><td colSpan={8} className="px-5 py-14 text-center text-sm text-slate-400">Cargando clientes...</td></tr> :
                 filtered.length === 0 ? <tr><td colSpan={8} className="px-5 py-14 text-center text-sm text-slate-400">No hay clientes para mostrar.</td></tr> :
                 filtered.map(c => (
                  <tr key={c.id} className="transition hover:bg-slate-50/70">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-400">
                          {c.logoURL ? <img src={c.logoURL} alt="" className="h-full w-full object-contain p-1" /> : (c.nombreCliente?.slice(0,2).toUpperCase() || "CL")}
                        </div>
                        <div>
                          <p className="max-w-[220px] truncate text-sm font-semibold text-slate-800">{c.nombreCliente}</p>
                          <p className="mt-1 text-xs text-slate-400">{c.identificacion}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${c.tipoCliente === "agencia" ? "bg-violet-50 text-violet-600" : "bg-blue-50 text-blue-600"}`}>{c.tipoCliente === "agencia" ? "Agencia" : "Candidato"}</span></td>
                    <td className="px-5 py-4"><p className="max-w-[190px] truncate text-sm text-slate-700">{c.nombreCampana || "—"}</p><p className="mt-1 max-w-[190px] truncate text-xs text-slate-400">{c.partidoMovimiento || "Sin partido/movimiento"}</p></td>
                    <td className="px-5 py-4"><p className="text-sm font-semibold text-slate-700">{c.plan?.nombre || "Sin plan"}</p><p className="mt-1 text-xs text-slate-400">{c.plan?.meses === 0 ? "Free" : c.plan?.meses ? `${c.plan.meses} meses` : "—"}</p></td>
                    <td className="px-5 py-4"><span className="rounded-lg bg-cyan-50 px-2.5 py-1.5 text-xs font-semibold text-cyan-700">{c.nivelesRed || 1} niveles</span></td>
                    <td className="px-5 py-4"><p className="max-w-[210px] truncate text-sm text-slate-700">{c.email}</p><p className="mt-1 text-xs text-slate-400">{c.telefono}</p></td>
                    <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${(c.estado || "activo") === "activo" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{c.estado || "activo"}</span></td>
                    <td className="px-5 py-4">
                      <div className="flex gap-2">
                        <button onClick={() => router.push(`/master/clientes/nuevo?id=${encodeURIComponent(c.id)}`)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Editar</button>
                        <button disabled={actionId === c.id} onClick={() => toggle(c)} className={`rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50 ${(c.estado || "activo") === "activo" ? "bg-amber-50 text-amber-700 hover:bg-amber-100" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"}`}>{actionId === c.id ? "..." : (c.estado || "activo") === "activo" ? "Inactivar" : "Activar"}</button>
                        <button disabled={actionId === c.id} onClick={() => remove(c)} className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50">Eliminar</button>
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

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  const tones: Record<string,string> = {
    blue: "from-blue-500 to-cyan-400",
    green: "from-emerald-500 to-teal-400",
    violet: "from-violet-500 to-fuchsia-400",
    amber: "from-amber-400 to-orange-500"
  };
  return <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${tones[tone]}`} /><p className="text-sm font-medium text-slate-500">{label}</p><p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">{value}</p></div>;
}
