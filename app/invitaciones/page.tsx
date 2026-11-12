"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";

type Invitation = { id: string; campanaNombre: string; categoria: string; estado: string; emisorNombre: string; expiraEn?: string; aceptadaEn?: string; retiradaEn?: string };
type Filter = "pendientes" | "aprobadas" | "historial";
const prettyDate = (date?: string) => date ? new Date(date).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" }) : "—";
const labels: Record<string, string> = { pendiente: "Pendiente", aceptada: "Vinculación activa", rechazada: "Rechazada", retirada: "Retirada", expirada: "Expirada" };

export default function InvitacionesPage() {
  const router = useRouter();
  const [invitaciones, setInvitaciones] = useState<Invitation[]>([]);
  const [filter, setFilter] = useState<Filter>("aprobadas");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [loading, setLoading] = useState(true);
  const [highlightId, setHighlightId] = useState("");
  useEffect(() => { setHighlightId(new URLSearchParams(window.location.search).get("invitacion") || ""); }, []);
  const load = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) return;
    try {
      const res = await fetch("/api/invitaciones-red", { headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error consultando invitaciones.");
      setInvitaciones(data.invitaciones || []);
      setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Error inesperado."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => onAuthStateChanged(auth, user => { if (!user) router.replace("/login"); else void load(); }), [load, router]);
  useEffect(() => {
    if (!highlightId) return;
    const selected = invitaciones.find(item => item.id === highlightId);
    if (selected) setFilter(selected.estado === "pendiente" ? "pendientes" : selected.estado === "aceptada" ? "aprobadas" : "historial");
  }, [highlightId, invitaciones]);
  const respond = async (id: string, decision: "aceptar" | "rechazar" | "retirar") => {
    if (!auth.currentUser) return;
    if (decision === "retirar" && !window.confirm("¿Confirmas que deseas retirarte de esta campaña? Tu red y sus datos seguirán siendo tuyos, pero la campaña que te invitó dejará de contabilizar tu aporte y solo conservará una referencia histórica.")) return;
    setBusy(id); setError("");
    try {
      const res = await fetch("/api/invitaciones-red", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await auth.currentUser.getIdToken()}` }, body: JSON.stringify({ id, decision }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo responder.");
      await load();
      if (decision === "retirar") setFilter("historial");
    } catch (e) { setError(e instanceof Error ? e.message : "Error inesperado."); }
    finally { setBusy(""); }
  };
  const counts = useMemo(() => ({
    pendientes: invitaciones.filter(i => i.estado === "pendiente").length,
    aprobadas: invitaciones.filter(i => i.estado === "aceptada").length,
    historial: invitaciones.filter(i => !["pendiente", "aceptada"].includes(i.estado)).length,
  }), [invitaciones]);
  const visible = useMemo(() => invitaciones.filter(i =>
    filter === "pendientes" ? i.estado === "pendiente" : filter === "aprobadas" ? i.estado === "aceptada" : !["pendiente", "aceptada"].includes(i.estado)
  ), [invitaciones, filter]);
  return <main className="min-h-screen bg-slate-50 p-4 sm:p-8"><div className="mx-auto max-w-4xl space-y-5">
    <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Mi grupo de trabajo</p><h1 className="text-2xl font-black text-slate-900">Invitaciones a campañas</h1></div><button onClick={()=>router.back()} className="rounded-xl border bg-white px-4 py-2 text-sm">Volver</button></div>
    <p className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">Tu red original siempre te pertenece. Puedes retirarte de una campaña aceptada cuando lo decidas, sin borrar tus datos ni tus líderes. La campaña dejará de contabilizar tu aporte desde ese momento.</p>
    <div className="grid grid-cols-3 gap-2 rounded-2xl bg-white p-2 shadow-sm">
      {([["pendientes","Pendientes"],["aprobadas","Aprobadas"],["historial","Historial"]] as const).map(([key,label])=><button key={key} type="button" onClick={()=>setFilter(key)} className={`rounded-xl px-2 py-3 text-xs font-bold sm:text-sm ${filter===key?"bg-emerald-700 text-white":"bg-slate-50 text-slate-600 hover:bg-slate-100"}`}>{label} ({counts[key]})</button>)}
    </div>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    {loading ? <p className="text-sm text-slate-500">Consultando invitaciones…</p> : !visible.length ? <p className="rounded-xl border bg-white p-5 text-sm text-slate-500">No tienes invitaciones en esta categoría.</p> : visible.map(item=><article key={item.id} className={`rounded-2xl border p-5 shadow-sm ${item.estado==="retirada"?"border-slate-200 bg-slate-100 text-slate-500":"bg-white"} ${highlightId===item.id?"ring-2 ring-emerald-300":""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="font-bold text-lg">{item.campanaNombre}</h2><p className="text-sm">Invita: {item.emisorNombre} · {item.categoria}</p></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${item.estado==="aceptada"?"bg-emerald-100 text-emerald-800":"bg-slate-200 text-slate-600"}`}>{labels[item.estado]||item.estado.replaceAll("_"," ")}</span></div>
      <details className="mt-3 rounded-xl border border-slate-200 p-3 text-sm"><summary className="cursor-pointer font-bold">Detalles de la invitación</summary><div className="mt-3 space-y-1 text-xs"><p>Campaña: {item.campanaNombre}</p><p>Categoría electoral: {item.categoria}</p><p>Invita: {item.emisorNombre}</p><p>Vence: {prettyDate(item.expiraEn)}</p>{item.aceptadaEn&&<p>Aceptada: {prettyDate(item.aceptadaEn)}</p>}{item.retiradaEn&&<p>Retirada: {prettyDate(item.retiradaEn)}</p>}</div></details>
      {item.estado==="pendiente"&&<div className="mt-4 flex gap-2"><button disabled={!!busy} onClick={()=>void respond(item.id,"aceptar")} className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Aceptar</button><button disabled={!!busy} onClick={()=>void respond(item.id,"rechazar")} className="rounded-xl border px-4 py-2 text-sm disabled:opacity-50">Rechazar</button></div>}
      {item.estado==="aceptada"&&<div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="max-w-md text-xs text-slate-500">Al retirarte recuperas la independencia de tu red. La campaña conservará una ficha histórica, sin acceso a las personas de tu red.</p><button disabled={!!busy} onClick={()=>void respond(item.id,"retirar")} className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50">{busy===item.id?"Procesando…":"Retirarme de esta red"}</button></div>}
      {item.estado==="retirada"&&<p className="mt-3 text-xs">La vinculación terminó. Tu red continúa en tu cuenta propia.</p>}
    </article>)}
  </div></main>;
}
