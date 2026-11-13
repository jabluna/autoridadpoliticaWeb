"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, getDocs, collection } from "firebase/firestore";

type Invitation = { id: string; campanaNombre: string; categoria: string; estado: string; emisorNombre: string; expiraEn?: string; aceptadaEn?: string; retiradaEn?: string };
type Filter = "pendientes" | "aprobadas" | "historial";
const prettyDate = (date?: string) => date ? new Date(date).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" }) : "—";
const labels: Record<string, string> = { pendiente: "Pendiente", aceptada: "Vinculación activa", rechazada: "Rechazada", retirada: "Retirada", expirada: "Expirada" };

export default function InvitacionesPage() {
  const router = useRouter();
  const [sidebarOpen,setSidebarOpen]=useState(false);
  const [cliente,setCliente]=useState<{logoURL?:string;nombreCampana?:string;nombreCliente?:string;partidoMovimiento?:string;plan?:{nombre?:string};nivelesRed?:number}|null>(null);
  const [campanas,setCampanas]=useState<Array<{nombreCampana?:string}>>([]);
  useEffect(()=>{let active=true;const unsubscribe=onAuthStateChanged(auth,async user=>{if(!user)return;try{const u=await getDoc(doc(db,"usuarios",user.uid));const clienteId=u.data()?.clienteId;if(!clienteId)return;const [c,cs]=await Promise.all([getDoc(doc(db,"clientes",clienteId)),getDocs(collection(db,"clientes",clienteId,"campanas"))]);if(active){setCliente(c.exists()?c.data():null);setCampanas(cs.docs.map(x=>x.data()));}}catch(e){console.warn("No se pudo cargar el encabezado de campaña",e);}});return()=>{active=false;unsubscribe()};},[]);
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
  return <main className="min-h-screen bg-[#f4f7fb] text-slate-900">
      {sidebarOpen && (
        <button
          aria-label="Cerrar menú"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-[1px] lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col bg-gradient-to-b from-[#102f77] via-[#153f9a] to-[#071e52] text-white shadow-2xl transition-transform duration-300 lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-[76px] items-center gap-3 border-b border-white/10 px-5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white text-sm font-bold text-[#153f9a]">
            {cliente?.logoURL ? (
              <img src={cliente.logoURL} alt="Logo" className="h-full w-full object-contain p-1.5" />
            ) : (
              "AP"
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {campanas[0]?.nombreCampana || cliente?.nombreCampana || cliente?.nombreCliente}
            </p>
            <p className="mt-0.5 truncate text-[11px] text-blue-100/65">
              {cliente?.partidoMovimiento || "Gestión de campaña"}
            </p>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="ml-auto text-white/50 lg:hidden"
          >
            ✕
          </button>
        </div>

        <div className="px-4 pt-6">
          <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[.18em] text-white/35">
            Principal
          </p>
          <nav className="space-y-1.5">
            {[{label:"Dashboard",icon:"dashboard",href:"/dashboard",active:false},{label:"Configuración de campaña",icon:"settings",href:"/configuracion-campana",active:false},{label:"Mi red",icon:"network",href:"/mired",active:false},{label:"Invitaciones a campañas",icon:"users",href:"/invitaciones",active:true}].map((item) => (
              <button
                key={item.label}
                onClick={() => item.href && router.push(item.href)}
                className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left text-sm font-medium transition ${
                  item.active
                    ? "bg-white text-[#102f77] shadow-lg shadow-black/10"
                    : "text-white/65 hover:bg-white/[0.08] hover:text-white"
                }`}
              >
                <InvNavIcon name={item.icon} />
                {item.label}
                {item.active && (
                  <span className="ml-auto h-2 w-2 rounded-full bg-blue-500" />
                )}
              </button>
            ))}
            <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.04] p-2">
              <p className="px-3 py-2 text-xs font-extrabold uppercase tracking-wider text-blue-100">Medios</p>
              {[
                { label: "Autorizaciones y gestión", href: "/medios/gestion" },
                { label: "Medios", href: "/medios" },
                { label: "Galería", href: "/medios/galeria" },
              ].map(item => (
                <button
                  key={item.href}
                  onClick={() => { setSidebarOpen(false); router.push(item.href); }}
                  className="block w-full rounded-lg px-3 py-2.5 text-left text-sm text-white/75 transition hover:bg-white/10 hover:text-white"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </nav>
        </div>

        <div className="mt-auto p-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[.15em] text-blue-200/80">
              Plan actual
            </p>
            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="truncate text-sm font-semibold">
                {cliente?.plan?.nombre || "Plan activo"}
              </p>
              <span className="rounded-full bg-emerald-400/15 px-2 py-1 text-[10px] font-semibold text-emerald-300">
                ACTIVO
              </span>
            </div>
            <p className="mt-2 text-[11px] leading-5 text-white/40">
              {cliente?.nivelesRed || 1} niveles de red disponibles
            </p>
          </div>
        </div>
      </aside>


    <div className="min-h-screen lg:pl-[280px]"><header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur"><div className="flex h-[76px] items-center gap-3 px-4 sm:px-6 xl:px-8"><button onClick={()=>setSidebarOpen(true)} aria-label="Abrir menú" className="rounded-xl border px-3 py-2 lg:hidden">☰</button><div><p className="text-xs font-medium text-slate-400">Panel de campaña</p><h1 className="text-base font-semibold sm:text-lg">Invitaciones a campañas</h1></div></div></header><div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-8">
    <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-blue-800">Mi grupo de trabajo</p><h1 className="text-2xl font-black text-slate-900">Invitaciones a campañas</h1></div><button onClick={()=>router.back()} className="rounded-xl border bg-white px-4 py-2 text-sm">Volver</button></div>
    <p className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">Tu red original siempre te pertenece. Puedes retirarte de una campaña aceptada cuando lo decidas, sin borrar tus datos ni tus líderes. La campaña dejará de contabilizar tu aporte desde ese momento.</p>
    <div className="grid grid-cols-3 gap-2 rounded-2xl bg-white p-2 shadow-sm">
      {([["pendientes","Pendientes"],["aprobadas","Aprobadas"],["historial","Historial"]] as const).map(([key,label])=><button key={key} type="button" onClick={()=>setFilter(key)} className={`rounded-xl px-2 py-3 text-xs font-bold sm:text-sm ${filter===key?"bg-blue-800 text-white":"bg-slate-50 text-slate-600 hover:bg-slate-100"}`}>{label} ({counts[key]})</button>)}
    </div>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    {loading ? <p className="text-sm text-slate-500">Consultando invitaciones…</p> : !visible.length ? <p className="rounded-xl border bg-white p-5 text-sm text-slate-500">No tienes invitaciones en esta categoría.</p> : visible.map(item=><article key={item.id} className={`rounded-2xl border p-5 shadow-sm ${item.estado==="retirada"?"border-slate-200 bg-slate-100 text-slate-500":"bg-white"} ${highlightId===item.id?"ring-2 ring-emerald-300":""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="font-bold text-lg">{item.campanaNombre}</h2><p className="text-sm">Invita: {item.emisorNombre} · {item.categoria}</p></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${item.estado==="aceptada"?"bg-emerald-100 text-emerald-800":"bg-slate-200 text-slate-600"}`}>{labels[item.estado]||item.estado.replaceAll("_"," ")}</span></div>
      <details className="mt-3 rounded-xl border border-slate-200 p-3 text-sm"><summary className="cursor-pointer font-bold">Detalles de la invitación</summary><div className="mt-3 space-y-1 text-xs"><p>Campaña: {item.campanaNombre}</p><p>Categoría electoral: {item.categoria}</p><p>Invita: {item.emisorNombre}</p><p>Vence: {prettyDate(item.expiraEn)}</p>{item.aceptadaEn&&<p>Aceptada: {prettyDate(item.aceptadaEn)}</p>}{item.retiradaEn&&<p>Retirada: {prettyDate(item.retiradaEn)}</p>}</div></details>
      {item.estado==="pendiente"&&<div className="mt-4 flex gap-2"><button disabled={!!busy} onClick={()=>void respond(item.id,"aceptar")} className="rounded-xl bg-blue-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Aceptar</button><button disabled={!!busy} onClick={()=>void respond(item.id,"rechazar")} className="rounded-xl border px-4 py-2 text-sm disabled:opacity-50">Rechazar</button></div>}
      {item.estado==="aceptada"&&<div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="max-w-md text-xs text-slate-500">Al retirarte recuperas la independencia de tu red. La campaña conservará una ficha histórica, sin acceso a las personas de tu red.</p><button disabled={!!busy} onClick={()=>void respond(item.id,"retirar")} className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50">{busy===item.id?"Procesando…":"Retirarme de esta red"}</button></div>}
      {item.estado==="retirada"&&<p className="mt-3 text-xs">La vinculación terminó. Tu red continúa en tu cuenta propia.</p>}
    </article>)}
  </div></div></main>;
}

function InvNavIcon({ name }: { name: string }) {
  const common = { width: 19, height: 19, viewBox: "0 0 24 24", fill: "none" };

  if (name === "dashboard") return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.7"/><rect x="14" y="3" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.7"/><rect x="3" y="14" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.7"/><rect x="14" y="14" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.7"/></svg>;
  if (name === "network") return <svg {...common}><circle cx="12" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.7"/><circle cx="5" cy="18" r="2.5" stroke="currentColor" strokeWidth="1.7"/><circle cx="19" cy="18" r="2.5" stroke="currentColor" strokeWidth="1.7"/><path d="M10.7 7.2L6.3 15.7M13.3 7.2L17.7 15.7M7.5 18H16.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>;
  if (name === "users") return <svg {...common}><circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.7"/><path d="M3.5 19C4.3 15.8 6.1 14 9 14C11.9 14 13.7 15.8 14.5 19" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/><path d="M15 5.5C17.1 5.5 18.5 6.9 18.5 9C18.5 11.1 17.1 12.5 15 12.5M16.5 14.5C18.8 15 20.1 16.5 20.5 19" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>;
  if (name === "map") return <svg {...common}><path d="M4 5L9 3L15 5L20 3V19L15 21L9 19L4 21V5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><path d="M9 3V19M15 5V21" stroke="currentColor" strokeWidth="1.7"/></svg>;
  if (name === "chart") return <svg {...common}><path d="M4 20V11M10 20V5M16 20V14M22 20V8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>;
  if (name === "levels") return <svg {...common}><path d="M5 7H19M7 12H17M9 17H15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>;
  if (name === "settings") return <svg {...common}><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7"/><path d="M19 13.5V10.5L16.9 9.8C16.7 9.2 16.4 8.7 16 8.2L16.5 6L14 4.5L12.4 6.1C11.8 6 11.2 6 10.6 6.1L9 4.5L6.5 6L7 8.2C6.6 8.7 6.3 9.2 6.1 9.8L4 10.5V13.5L6.1 14.2C6.3 14.8 6.6 15.3 7 15.8L6.5 18L9 19.5L10.6 17.9C11.2 18 11.8 18 12.4 17.9L14 19.5L16.5 18L16 15.8C16.4 15.3 16.7 14.8 16.9 14.2L19 13.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>;
  if (name === "profile") return <svg {...common}><circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.7"/><path d="M5 20C5.8 16.2 8.1 14 12 14C15.9 14 18.2 16.2 19 20" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>;
  if (name === "logout") return <svg {...common}><path d="M10 5H5V19H10M14 8L18 12L14 16M8 12H18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>;
  if (name === "bell") return <svg {...common}><path d="M18 8A6 6 0 0 0 6 8C6 15 3.5 16 3.5 16H20.5S18 15 18 8Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><path d="M10 20H14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>;
  return null;
}
