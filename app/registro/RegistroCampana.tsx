"use client";
import { useEffect, useMemo, useState } from "react";
import { get, ref } from "firebase/database";
import { rtdb } from "@/lib/firebase";

export type CampanaInicial = {
 tipo: "municipal" | "departamental" | "nacional"; corporacion: string;
 nombreCampana: string; candidato: string; partidoMovimiento: string; lema: string;
 departamento: string; municipio: string; fechaEleccion: string; metaVotos: number;
 alcancePuestos: "todos" | "seleccionados"; puestosSeleccionados: string[];
 totalPuestos: number; totalMesas: number; nivelesMultiredPermitidos: number; estado: "inactiva";
};
type Draft = Omit<CampanaInicial,"metaVotos"|"puestosSeleccionados"|"totalPuestos"|"totalMesas"|"nivelesMultiredPermitidos"|"estado"> & {metaVotos:string};
const choices = [
 {id:"edil",name:"Edil / JAL",tipo:"municipal"},
 {id:"concejo",name:"Concejo",tipo:"municipal"},
 {id:"alcaldia",name:"Alcaldía",tipo:"municipal"},
 {id:"asamblea",name:"Asamblea",tipo:"departamental"},
 {id:"gobernacion",name:"Gobernación",tipo:"departamental"},
 {id:"presidencia",name:"Presidencia",tipo:"nacional"}
] as const;
export default function RegistroCampana({nombre,initialName,onFinish,busy,submitError}:{nombre:string;initialName:string;onFinish:(value:CampanaInicial)=>void;busy:boolean;submitError?:string}) {
 const [step,setStep]=useState(1);
 const [error,setError]=useState("");
 const [catalogo,setCatalogo]=useState<Record<string,Record<string,Record<string,number>>>>({});
 const [catalogoLoading,setCatalogoLoading]=useState(true);
 const [catalogoUnavailable,setCatalogoUnavailable]=useState(false);
 const [retryCatalogo,setRetryCatalogo]=useState(0);
 const [draft,setDraft]=useState<Draft>({tipo:"municipal",corporacion:"alcaldia",nombreCampana:initialName,candidato:nombre,partidoMovimiento:"",lema:"",departamento:"",municipio:"",fechaEleccion:"",metaVotos:"",alcancePuestos:"todos"});
 const [selected,setSelected]=useState<string[]>([]);
 useEffect(()=>{
  let cancelled=false;
  setCatalogoLoading(true);
  setCatalogoUnavailable(false);
  const load=async()=>{
   try {
    // Leer la fuente original directamente desde Firebase RTDB, como el resto del proyecto.
    // El endpoint de Firebase Admin puede fallar en localhost sin credenciales de servicio.
    const snapshot=await get(ref(rtdb,"MUNICIPIOPUESTOS"));
    if(!snapshot.exists())throw new Error("No existe MUNICIPIOPUESTOS en RTDB");
    const data=snapshot.val();
    if(!data || typeof data!=="object" || Array.isArray(data) || !Object.keys(data).length)throw new Error("Catálogo electoral vacío");
    if(!cancelled){setCatalogo(data);setError("");}
   }catch(e){
    console.error("Error cargando MUNICIPIOPUESTOS desde Realtime Database:",e);
    if(!cancelled){setCatalogoUnavailable(true);setError("No fue posible cargar el catálogo electoral desde Realtime Database. Comprueba permisos de lectura o reintenta.");}
   }finally{if(!cancelled)setCatalogoLoading(false);}
  };
  void load();
  return ()=>{cancelled=true;};
 },[retryCatalogo]);
 const departamentos=useMemo(()=>Object.keys(catalogo).sort(),[catalogo]);
 const municipios=useMemo(()=>Object.keys(catalogo[draft.departamento]||{}).sort(),[catalogo,draft.departamento]);
 const puestos=useMemo(()=>Object.entries(catalogo[draft.departamento]?.[draft.municipio]||{}).map(([nombre,mesas])=>({nombre,mesas:Number(mesas)||0})).sort((a,b)=>a.nombre.localeCompare(b.nombre)),[catalogo,draft.departamento,draft.municipio]);
 const change=(key:keyof Draft,value:string)=>setDraft(d=>({...d,[key]:value}));
 const input=(key:keyof Draft,label:string,type="text")=><label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span><input type={type} value={draft[key]} onChange={e=>change(key,e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-500"/></label>;
 const advance=()=>{
  setError("");
  if(step===2&&(!draft.nombreCampana.trim()||!draft.candidato.trim()))return setError("Nombre de campaña y candidato son obligatorios.");
  if(step===3&&draft.tipo!=="nacional"&&(!draft.departamento.trim()||(draft.tipo==="municipal"&&!draft.municipio.trim())))return setError("Indica el departamento y, para campañas municipales, el municipio.");
  if(step===4&&draft.tipo==="municipal"&&draft.alcancePuestos==="seleccionados"&&!selected.length)return setError("Selecciona al menos un puesto.");
  setStep(s=>Math.min(5,s+1));
 };
 const finish=()=>{
  const chosen= draft.tipo==="municipal"?(draft.alcancePuestos==="todos"?puestos.map(p=>p.nombre):selected):[];
  onFinish({...draft,metaVotos:Number(draft.metaVotos)||0,puestosSeleccionados:chosen,totalPuestos:chosen.length,totalMesas:puestos.filter(p=>chosen.includes(p.nombre)).reduce((sum,p)=>sum+p.mesas,0),nivelesMultiredPermitidos:3,estado:"inactiva"});
 };
 return <div className="space-y-6 p-6 sm:p-10">
  <div><p className="text-xs font-bold uppercase tracking-wider text-blue-700">Paso {step} de 5 · Configuración de campaña</p><div className="mt-3 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-blue-600 transition-all" style={{width:step*20+"%"}}/></div></div>
  {step===1&&<section><h2 className="text-2xl font-bold">¿Qué campaña quieres configurar?</h2><p className="mt-2 text-sm text-slate-500">Elige la corporación electoral de tu primera campaña.</p><div className="mt-5 grid gap-3 sm:grid-cols-3">{choices.map(c=><button type="button" key={c.id} onClick={()=>{setDraft(d=>({...d,corporacion:c.id,tipo:c.tipo,departamento:"",municipio:""}));setSelected([]);}} className={`rounded-2xl border p-5 text-left ${draft.corporacion===c.id?"border-blue-600 bg-blue-50":"border-slate-200"}`}><span className="block text-sm font-bold">{c.name}</span><span className="mt-2 block text-xs capitalize text-slate-500">{c.tipo}</span></button>)}</div></section>}
  {step===2&&<section><h2 className="text-2xl font-bold">Datos principales</h2><div className="mt-5 grid gap-4 sm:grid-cols-2">{input("nombreCampana","Nombre de campaña *")}{input("candidato","Candidato o cabeza de lista *")}{input("partidoMovimiento","Partido o movimiento")}{input("lema","Lema")}{input("metaVotos","Meta de votos","number")}{input("fechaEleccion","Fecha de elección","date")}</div></section>}
  {step===3&&<section><h2 className="text-2xl font-bold">{draft.tipo==="nacional"?"Capacidad de multired":"Territorio electoral"}</h2>{draft.tipo==="nacional"?<p className="mt-5 rounded-xl bg-blue-50 p-5 text-sm">Tu plan Free permite tres niveles de red.</p>:<div className="mt-5 grid gap-4 sm:grid-cols-2">{catalogoLoading?<p className="sm:col-span-2 text-sm text-slate-500">Cargando departamentos y municipios…</p>:catalogoUnavailable?<div className="sm:col-span-2 space-y-3"><p className="text-sm text-amber-700">El catálogo electoral no está disponible. Puedes continuar ingresando tu ubicación manualmente; los puestos de votación no se cargarán hasta que el servicio se restablezca.</p><button type="button" onClick={()=>setRetryCatalogo(n=>n+1)} className="rounded-lg border border-blue-200 px-3 py-2 text-xs font-semibold text-blue-700">Reintentar catálogo</button><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold">Departamento *<input value={draft.departamento} onChange={e=>setDraft(d=>({...d,departamento:e.target.value,municipio:""}))} placeholder="Ej. Cundinamarca" className="mt-2 h-11 w-full rounded-xl border px-3"/></label>{draft.tipo==="municipal"&&<label className="text-sm font-semibold">Municipio *<input value={draft.municipio} onChange={e=>change("municipio",e.target.value)} placeholder="Ej. Soacha" className="mt-2 h-11 w-full rounded-xl border px-3"/></label>}</div></div>:<><label className="text-sm font-semibold">Departamento *<select className="mt-2 h-11 w-full rounded-xl border p-2" value={draft.departamento} onChange={e=>{setDraft(d=>({...d,departamento:e.target.value,municipio:""}));setSelected([]);}}><option value="">Seleccionar departamento</option>{departamentos.map(d=><option key={d} value={d}>{d}</option>)}</select></label>{draft.tipo==="municipal"&&<label className="text-sm font-semibold">Municipio *<select className="mt-2 h-11 w-full rounded-xl border p-2" value={draft.municipio} disabled={!draft.departamento} onChange={e=>{change("municipio",e.target.value);setSelected([]);}}><option value="">Seleccionar municipio</option>{municipios.map(m=><option key={m} value={m}>{m}</option>)}</select></label>}</>}</div>}</section>}
  {step===4&&<section><h2 className="text-2xl font-bold">{draft.tipo==="municipal"?"Puestos de votación y mesas":"Capacidad de multired"}</h2>{draft.tipo!=="municipal"?<p className="mt-5 rounded-xl bg-blue-50 p-5 text-sm">Tu plan Free incluye tres niveles de red.</p>:<><div className="mt-5 flex gap-2">{(["todos","seleccionados"] as const).map(v=><button type="button" key={v} onClick={()=>change("alcancePuestos",v)} className={`rounded-xl px-4 py-2 text-sm ${draft.alcancePuestos===v?"bg-blue-600 text-white":"bg-slate-100"}`}>{v==="todos"?"Todo el municipio":"Elegir puestos"}</button>)}</div><div className="mt-4 max-h-64 overflow-auto rounded-xl border">{puestos.map(p=><label key={p.nombre} className="flex items-center gap-3 border-b p-3 text-sm"><input type="checkbox" disabled={draft.alcancePuestos==="todos"} checked={draft.alcancePuestos==="todos"||selected.includes(p.nombre)} onChange={()=>setSelected(s=>s.includes(p.nombre)?s.filter(x=>x!==p.nombre):[...s,p.nombre])}/><span>{p.nombre} · {p.mesas} mesas</span></label>)}</div></>}</section>}
  {step===5&&<section><h2 className="text-2xl font-bold">Revisa antes de finalizar</h2><div className="mt-5 space-y-2 rounded-xl bg-slate-50 p-5 text-sm"><p><b>Campaña:</b> {draft.nombreCampana}</p><p><b>Candidato:</b> {draft.candidato}</p><p><b>Corporación:</b> {choices.find(c=>c.id===draft.corporacion)?.name}</p><p><b>Territorio:</b> {[draft.departamento,draft.municipio].filter(Boolean).join(" / ")||"Nacional"}</p><p><b>Plan:</b> Free · 3 niveles</p></div><p className="mt-4 text-sm text-slate-600">Al finalizar crearemos tu cuenta, enviaremos el correo de verificación y dejaremos la campaña pendiente de aprobación Master.</p></section>}
  {(error||submitError)&&<p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error||submitError}</p>}
  <div className="flex justify-between gap-3 border-t pt-5"><button type="button" disabled={step===1||busy} onClick={()=>{setStep(s=>s-1);setError("");}} className="rounded-xl border px-5 py-3 text-sm disabled:opacity-30">← Anterior</button><button type="button" disabled={busy} onClick={step===5?finish:advance} className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white disabled:opacity-50">{busy?"Registrando...":step===5?"Finalizar y verificar correo →":"Continuar →"}</button></div>
 </div>;
}
