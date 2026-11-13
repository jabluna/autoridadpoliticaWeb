"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import {onAuthStateChanged} from "firebase/auth";
import {auth} from "@/lib/firebase";
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
 const router=useRouter();const [points,setPoints]=useState<Point[]>([]),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(""),[menuOpen,setMenuOpen]=useState(false),[metric,setMetric]=useState<Metric>("integrantes");
 const request=useCallback(async(method:"GET"|"POST")=>{const user=auth.currentUser;if(!user)throw Error("Sesión requerida");const response=await fetch("/api/historico-campana",{method,headers:{Authorization:"Bearer "+await user.getIdToken()},cache:"no-store"});const result=await response.json();if(!response.ok)throw Error(result.error||"Error consultando el histórico");return result;},[]);
 const load=useCallback(async()=>{setLoading(true);setError("");try{const result=await request("GET");setPoints(result.items||[]);}catch(e){setError(e instanceof Error?e.message:"Error de carga");}finally{setLoading(false);}},[request]);
 useEffect(()=>onAuthStateChanged(auth,user=>{if(!user){router.replace("/login");return;}void load();}),[router,load]);
 const save=async()=>{setSaving(true);setError("");try{await request("POST");await load();}catch(e){setError(e instanceof Error?e.message:"No se pudo registrar el corte");}finally{setSaving(false);}};
 const selected=metrics.find(m=>m[0]===metric)!;const latest=points.at(-1);const previous=points.at(-2);
 const change=(key:Metric)=>previous&&latest?Number(latest[key]||0)-Number(previous[key]||0):null;
 return <main className="min-h-screen bg-[#f4f7fb] text-slate-900">
 {menuOpen&&<button aria-label="Cerrar menú" className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={()=>setMenuOpen(false)}/>}
 <aside className={`fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col bg-gradient-to-b from-[#102f77] via-[#153f9a] to-[#071e52] p-5 text-white transition-transform lg:translate-x-0 ${menuOpen?"translate-x-0":"-translate-x-full"}`}>
 <div className="border-b border-white/15 pb-6"><p className="text-base font-bold">Autoridad Política</p><p className="mt-1 text-xs text-blue-200">Gestión de campaña</p></div>
 <p className="mt-7 px-3 text-[10px] font-bold uppercase tracking-widest text-blue-200/70">Principal</p>
 <nav className="mt-3 space-y-1">{[["Dashboard","/dashboard"],["Configuración de campaña","/configuracion-campana"],["Mi red","/mired"],["Invitaciones a campañas","/invitaciones"],["Evolución histórica","/historico-campana"]].map(([name,url])=><button key={url} onClick={()=>router.push(url)} className={`w-full rounded-xl px-3 py-3 text-left text-sm ${url==="/historico-campana"?"bg-white font-bold text-blue-950":"text-blue-100 hover:bg-white/10"}`}>{name}</button>)}</nav>
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
