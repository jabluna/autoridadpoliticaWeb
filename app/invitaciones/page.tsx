"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";

type Invitation = { id: string; campanaNombre: string; categoria: string; estado: string; emisorNombre: string; expiraEn?: string };
export default function InvitacionesPage() {
  const router = useRouter();
  const [invitaciones, setInvitaciones] = useState<Invitation[]>([]);
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
    } catch (e) { setError(e instanceof Error ? e.message : "Error inesperado."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => onAuthStateChanged(auth, user => { if (!user) router.replace("/login"); else void load(); }), [load, router]);
  const respond = async (id: string, decision: "aceptar" | "rechazar") => {
    if (!auth.currentUser) return;
    setBusy(id); setError("");
    try {
      const res = await fetch("/api/invitaciones-red", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await auth.currentUser.getIdToken()}` }, body: JSON.stringify({ id, decision }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo responder.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Error inesperado."); }
    finally { setBusy(""); }
  };
  return <main className="min-h-screen bg-slate-50 p-4 sm:p-8"><div className="mx-auto max-w-3xl space-y-5">
    <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Mi grupo de trabajo</p><h1 className="text-2xl font-black text-slate-900">Invitaciones a campañas</h1></div><button onClick={()=>router.back()} className="rounded-xl border bg-white px-4 py-2 text-sm">Volver</button></div>
    <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Al aceptar quedas vinculado a la campaña. Por seguridad, los datos de tu red todavía no serán visibles para el otro candidato hasta completar los permisos de acceso y desvinculación.</p>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    {loading ? <p className="text-sm text-slate-500">Consultando invitaciones…</p> : invitaciones.length === 0 ? <p className="rounded-xl border bg-white p-5 text-sm">No tienes invitaciones registradas para tu correo verificado.</p> : invitaciones.map(item => <article key={item.id} className={`rounded-2xl border bg-white p-5 shadow-sm ${highlightId === item.id ? "border-emerald-500 ring-2 ring-emerald-200" : ""}`}><div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="font-bold">{item.campanaNombre}</h2><p className="text-sm text-slate-600">Invita: {item.emisorNombre} · {item.categoria}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{item.estado.replaceAll("_", " ")}</span></div>{item.estado === "pendiente" && <div className="mt-4 flex gap-2"><button disabled={!!busy} onClick={()=>void respond(item.id,"aceptar")} className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Aceptar</button><button disabled={!!busy} onClick={()=>void respond(item.id,"rechazar")} className="rounded-xl border px-4 py-2 text-sm disabled:opacity-50">Rechazar</button></div>}</article>)}
  </div></main>;
}
