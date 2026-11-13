"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import {onAuthStateChanged} from "firebase/auth";
import {auth,db} from "@/lib/firebase";
import {collection,doc,getDoc,getDocs} from "firebase/firestore";
import {useMediosGestionAccess} from "@/components/useMediosGestionAccess";
import {useRouter} from "next/navigation";
type Point={id:string;semana:string;fechaCorte:string;lideres:number;integrantes:number;estimadoManual:number;aporteCalculado:number;metaElectoral:number;lideresConActividad:number;lideresConFechaActividad:number};
type Metric="integrantes"|"lideres"|"estimadoManual"|"aporteCalculado"|"lideresConActividad";
const metrics:[Metric,string,string][]=[["integrantes","Integrantes de la red","#2563eb"],["lideres","Líderes registrados","#0891b2"],["estimadoManual","Estimados manuales","#d97706"],["aporteCalculado","Aporte calculado de red","#7c3aed"],["lideresConActividad","Líderes con actividad reciente","#059669"]];
const fmt=(v:number)=>Number(v||0).toLocaleString("es-CO");
function Trend({points,metric,color}:{points:Point[];metric:Metric;color:string}){
 const values=points.map(p=>Math.max(0,Number(p[metric])||0)),max=Math.max(1,...values);
 const coords=values.map((v,i)=>({x:points.length===1?50:8+i*84/(points.length-1),y:87-v/max*70}));
 return <div className="overflow-x-auto"><svg viewBox="0 0 100 105" preserveAspectRatio="none" className="h-52 w-full min-w-[280px]" role="img" aria-label="Gráfica de evolución semanal">
 {[17,40,64,87].map(y=><line key={y} x1="8" x2="92" y1={y} y2={y} stroke="#e2e8f0" strokeWidth=".35"/>)}
 {coords.length>1&&<polyline points={coords.map(c=>c.x+","+c.y).join(" ")} fill="none" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>}
 {coords.map((c,i)=><circle key={i} cx={c.x} cy={c.y} r="1.2" fill={color}><title>{points[i].semana}: {fmt(values[i])}</title></circle>)}
 {points.map((p,i)=><text key={p.id} x={coords[i].x} y="101" textAnchor="middle" fontSize="3.1" fill="#64748b">{p.semana.slice(5)}</text>)}
 </svg></div>;
}
export default function HistoricoCampana(){
 const router=useRouter();const {canManage:canAccessGestion}=useMediosGestionAccess();
 const [cliente,setCliente]=useState<any>(null);const [campanas,setCampanas]=useState<any[]>([]);
 const menu=[{label:"Dashboard",icon:"dashboard",href:"/dashboard",active:false},{label:"Configuración de campaña",icon:"settings",href:"/configuracion-campana",active:false},{label:"Mi red",icon:"network",href:"/mired",active:false},{label:"Invitaciones a campañas",icon:"users",href:"/invitaciones",active:false},{label:"Evolución histórica",icon:"chart",href:"/historico-campana",active:true}];const [points,setPoints]=useState<Point[]>([]),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(""),[menuOpen,setMenuOpen]=useState(false),[metric,setMetric]=useState<Metric>("integrantes");
 const request=useCallback(async(method:"GET"|"POST")=>{const user=auth.currentUser;if(!user)throw Error("Sesión requerida");const response=await fetch("/api/historico-campana",{method,headers:{Authorization:"Bearer "+await user.getIdToken()},cache:"no-store"});const result=await response.json();if(!response.ok)throw Error(result.error||"Error consultando el histórico");return result;},[]);
 const load=useCallback(async()=>{setLoading(true);setError("");try{const result=await request("GET");setPoints(result.items||[]);}catch(e){setError(e instanceof Error?e.message:"Error de carga");}finally{setLoading(false);}},[request]);
 useEffect(()=>onAuthStateChanged(auth,user=>{if(!user){router.replace("/login");return;}void (async()=>{try{const u=await getDoc(doc(db,"usuarios",user.uid));const id=u.data()?.clienteId;if(id){const [c,cs]=await Promise.all([getDoc(doc(db,"clientes",id)),getDocs(collection(db,"clientes",id,"campanas"))]);setCliente(c.exists()?c.data():null);setCampanas(cs.docs.map(x=>x.data()));}}catch(e){console.warn("No se pudo cargar encabezado",e);}})();void load();}),[router,load]);
 const save=async()=>{setSaving(true);setError("");try{await request("POST");await load();}catch(e){setError(e instanceof Error?e.message:"No se pudo registrar el corte");}finally{setSaving(false);}};
 const selected=metrics.find(m=>m[0]===metric)!;const latest=points.at(-1);const previous=points.at(-2);
 const change=(key:Metric)=>previous&&latest?Number(latest[key]||0)-Number(previous[key]||0):null;
 return <main className="min-h-screen bg-[#f4f7fb] text-slate-900">

      {menuOpen && (
        <button
          aria-label="Cerrar menú"
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-[1px] lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col bg-gradient-to-b from-[#102f77] via-[#153f9a] to-[#071e52] text-white shadow-2xl transition-transform duration-300 lg:translate-x-0 ${
          menuOpen ? "translate-x-0" : "-translate-x-full"
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
            onClick={() => setMenuOpen(false)}
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
            {menu.map((item) => (
              <button
                key={item.label}
                onClick={() => item.href && router.push(item.href)}
                className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left text-sm font-medium transition ${
                  item.active
                    ? "bg-white text-[#082c2b] shadow-lg shadow-black/10"
                    : "text-white/65 hover:bg-white/[0.08] hover:text-white"
                }`}
              >
                <HistoryNavIcon name={item.icon} />
                {item.label}
                {item.active && (
                  <span className="ml-auto h-2 w-2 rounded-full bg-blue-500" />
                )}
              </button>
            ))}
            <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.04] p-2">
              <p className="px-3 py-2 text-xs font-extrabold uppercase tracking-wider text-blue-100">Medios</p>
              {[
                ...(canAccessGestion ? [{ label: "Autorizaciones y gestión", href: "/medios/gestion" }] : []),
                { label: "Medios", href: "/medios" },
                { label: "Galería", href: "/medios/galeria" },
              ].map(item => (
                <button
                  key={item.href}
                  onClick={() => { setMenuOpen(false); router.push(item.href); }}
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

 <div className="lg:pl-[280px]"><header className="sticky top-0 z-30 flex h-[76px] items-center gap-3 border-b border-slate-200 bg-white px-4 sm:px-7"><button className="rounded-lg border p-2 lg:hidden" onClick={()=>setMenuOpen(true)}>☰</button><div><p className="text-xs text-slate-400">Panel de campaña</p><h1 className="text-lg font-bold">Evolución histórica</h1></div></header>
 <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-7">
 <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-blue-100 bg-white p-5 shadow-sm"><div><p className="text-[11px] font-bold uppercase tracking-widest text-blue-700">Análisis semanal</p><h2 className="mt-1 text-xl font-extrabold">Evolución de la campaña</h2><p className="mt-2 max-w-2xl text-sm text-slate-500">Histórico de cortes semanales guardados en Firestore. Los periodos anteriores al primer corte no pueden reconstruirse automáticamente.</p></div><button disabled={saving} onClick={()=>void save()} className="rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-50">{saving?"Registrando corte…":"Actualizar corte de esta semana"}</button></section>
 {error&&<p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
 {loading?<p className="rounded-xl bg-white p-6 text-slate-500">Cargando registros…</p>:<>
 <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.slice(0,4).map(([key,label])=><div key={key} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-2xl font-black text-blue-950">{latest?fmt(latest[key]):"—"}</p><p className="mt-1 text-xs text-slate-500">{change(key)===null?"Sin semana anterior comparable":`Cambio semanal: ${change(key)!>=0?"+":""}${fmt(change(key)!)}`}</p></div>)}</div>
 <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-lg font-bold">Gráfica de crecimiento semanal</h3><p className="mt-1 text-xs text-slate-500">Selecciona el indicador para comparar los cortes registrados.</p></div><select value={metric} onChange={e=>setMetric(e.target.value as Metric)} className="max-w-full rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-950">{metrics.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></div>
 {points.length?<div className="mt-5"><div className="mb-2 flex items-center justify-between"><p className="text-sm font-semibold" style={{color:selected[2]}}>{selected[1]}</p><p className="text-sm font-bold">{latest?fmt(latest[metric]):"—"}</p></div><Trend points={points} metric={metric} color={selected[2]}/>{points.length===1&&<p className="mt-2 text-xs text-amber-700">Hay un solo corte. La línea de evolución aparecerá cuando exista un segundo registro semanal.</p>}</div>:<p className="mt-5 rounded-xl bg-slate-50 p-6 text-sm text-slate-500">Todavía no existen cortes históricos. Pulsa «Actualizar corte de esta semana» para comenzar.</p>}</section>
 <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="text-lg font-bold">Comparación entre semanas</h3><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-xs"><thead className="bg-slate-50 text-slate-600"><tr>{["Semana","Integrantes","Líderes","Estimados","Aporte calculado","Actividad 7 días"].map(h=><th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{[...points].reverse().map(p=><tr key={p.id} className="border-t border-slate-100"><td className="p-3 font-semibold">{p.semana}</td>{(["integrantes","lideres","estimadoManual","aporteCalculado"] as Metric[]).map(k=><td key={k} className="p-3">{fmt(p[k])}</td>)}<td className="p-3">{p.lideresConFechaActividad>0?`${fmt(p.lideresConActividad)} / ${fmt(p.lideresConFechaActividad)} con fecha`:"Sin fechas verificables"}</td></tr>)}</tbody></table></div></section>
 <p className="text-xs leading-5 text-slate-500">Nota metodológica: «aporte calculado» utiliza la misma fórmula de la multired del Dashboard y no equivale a votos electorales verificados. «Actividad» solo considera líderes con fecha de actividad o actualización disponible; la ausencia de fechas no significa inactividad. Los cortes se crean manualmente al visitar esta página y pulsar el botón; no existe todavía un proceso automático semanal.</p>
 </>}
 </div></div></main>;
}

function HistoryNavIcon({ name }: { name: string }) {
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
