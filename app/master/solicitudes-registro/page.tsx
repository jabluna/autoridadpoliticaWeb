"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useRouter } from "next/navigation";

type RequestRow = { id: string; nombreCliente: string; email: string; telefono: string; identificacion: string; estado: string; nombreCampana?: string };

export default function SolicitudesRegistroPage() {
 const router = useRouter();
 const [rows,setRows] = useState<RequestRow[]>([]);
 const [loading,setLoading] = useState(true);
 const [busy,setBusy] = useState("");
 const [error,setError] = useState("");
 const [message,setMessage] = useState("");
 const load = async () => {
  setLoading(true);
  try {
   const snap = await getDocs(query(collection(db,"solicitudesRegistro"),orderBy("creadoEn","desc")));
   setRows(snap.docs.map(d=>({id:d.id,...d.data()} as RequestRow)));
  } catch {setError("No fue posible cargar solicitudes. Revisa los permisos.");}
  finally {setLoading(false);}
 };
 useEffect(()=>onAuthStateChanged(auth,u=>{if(!u)router.replace("/master/login");else void load();}),[router]);
 const review = async (uid:string, action:"aprobar"|"rechazar") => {
  if(!window.confirm(action==="aprobar"?"¿Aprobar el plan Free?":"¿Rechazar solicitud?"))return;
  setBusy(uid);setError("");setMessage("");
  try {
   const token = await auth.currentUser?.getIdToken();
   if(!token)throw new Error("Sesión requerida.");
   const response = await fetch("/api/master/solicitudes-registro",{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+token},body:JSON.stringify({uid,action})});
   const result = await response.json();
   if(!response.ok)throw new Error(result.error||"Error de aprobación.");
   setMessage(action==="aprobar"?"Cliente Free aprobado.":"Solicitud rechazada.");
   await load();
  }catch(e){setError(e instanceof Error?e.message:"Error inesperado.");}
  finally {setBusy("");}
 };
 return <main className="min-h-screen bg-slate-50 p-6 text-slate-900"><div className="mx-auto max-w-5xl">
  <Link href="/master/dashboard" className="text-sm font-semibold text-blue-700">← Volver al Master</Link>
  <div className="mt-5 flex items-center justify-between gap-4"><div><h1 className="text-2xl font-bold">Solicitudes de registro</h1><p className="mt-1 text-sm text-slate-500">Plan Free · Registro individual · Verificación por correo obligatoria</p></div><button onClick={()=>void load()} className="rounded-xl border bg-white px-4 py-2 text-sm">Actualizar</button></div>
  {error&&<p className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
  {message&&<p className="mt-4 rounded-xl bg-green-50 p-4 text-sm text-green-700">{message}</p>}
  <div className="mt-6 divide-y rounded-2xl border bg-white">{loading?<p className="p-6">Cargando...</p>:rows.length===0?<p className="p-6 text-slate-500">No hay solicitudes.</p>:rows.map(r=><div key={r.id} className="flex flex-wrap items-center justify-between gap-4 p-5"><div><p className="font-semibold">{r.nombreCliente} <span className="ml-2 text-xs font-normal text-slate-500">{r.estado}</span></p><p className="mt-1 text-sm text-slate-600">{r.email} · {r.telefono}</p><p className="mt-1 text-xs text-slate-400">{r.identificacion} · {r.nombreCampana||"Sin campaña"} · Free / 3 niveles</p></div>{r.estado==="pendiente"&&<div className="flex gap-2"><button disabled={!!busy} onClick={()=>void review(r.id,"rechazar")} className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50">Rechazar</button><button disabled={!!busy} onClick={()=>void review(r.id,"aprobar")} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy===r.id?"Procesando...":"Aprobar"}</button></div>}</div>)}</div>
 </div></main>;
}
