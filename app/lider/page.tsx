"use client";

import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { collection, doc, getDoc, getDocs, query, where, increment, serverTimestamp, writeBatch, updateDoc, type DocumentSnapshot, type DocumentData } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";

type Leader = { id: string; puntuacion?: number; votosRealesSubarbol?: number; votosEstimadosSubarbol?: number; estimacionVotos?: number; nombre?: string; apellido?: string; ciudad?: string; departamento?: string; nivel?: number; multinodo?: boolean; estado?: string; uid?: string };
export default function LeaderPage() {
  const router = useRouter();
  const [leader, setLeader] = useState<Leader | null>(null);
  const [owner, setOwner] = useState<Leader | null>(null);
  const [scope, setScope] = useState<{clienteId:string;campanaId:string;nodoId:string}|null>(null);
  const [people, setPeople] = useState<{id:string;nombre?:string;apellido?:string;ciudad?:string;departamento?:string}[]>([]);
  const [mode, setMode] = useState<"nodos"|"personas">("nodos");
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [personName, setPersonName] = useState("");
  const [personLast, setPersonLast] = useState("");
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [ratingTarget, setRatingTarget] = useState<Leader | null>(null);
  const [ratingValue, setRatingValue] = useState(5);
  const [children, setChildren] = useState<Leader[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    const unsub = onAuthStateChanged(auth, async user => {
      if (!user) { router.replace("/login"); return; }
      try {
        if (!user.emailVerified) throw new Error("Verifica tu correo electrónico antes de ingresar.");
        const account = await getDoc(doc(db, "usuarios", user.uid));
        const u = account.data();
        if (!u || u.rol !== "red_usuario" || u.estado === "inactivo" || !u.clienteId || !u.campanaId || !u.nodoId) throw new Error("No tienes un nodo de líder activo asignado.");
        const client = await getDoc(doc(db, "clientes", u.clienteId));
        if (!client.exists() || client.data().estado === "inactivo" || client.data().planActivo === false) throw new Error("La cuenta principal no está activa.");
        const nodes = collection(db, "clientes", u.clienteId, "campanas", u.campanaId, "nodos");
        const own = await getDoc(doc(nodes, u.nodoId));
        if (!own.exists() || own.data().estado === "inactivo" || own.data().uid !== user.uid) throw new Error("No tienes acceso a este nodo.");
        const descendants = await getDocs(query(nodes, where("padreId", "==", u.nodoId)));
        if (live) {
          setLeader({ id: own.id, ...own.data() } as Leader);
          setOwner({ id: own.id, ...own.data() } as Leader);
          setScope({clienteId:u.clienteId,campanaId:u.campanaId,nodoId:u.nodoId});
          setChildren(descendants.docs.map(d => ({ id: d.id, ...d.data() } as Leader)).filter(n => n.estado !== "inactivo"));
        }
      } catch (e) { if (live) setError(e instanceof Error ? e.message : "No fue posible abrir tu red."); }
      finally { if (live) setLoading(false); }
    });
    return () => { live = false; unsub(); };
  }, [router]);
  const openNode = useCallback(async (nodeId: string) => {
    if (!scope) return;
    setLoading(true); setError("");
    try {
      const base = collection(db,"clientes",scope.clienteId,"campanas",scope.campanaId,"nodos");
      const visited = new Set<string>();
      let cursor: string | null = nodeId;
      let allowed = false;
      while (cursor && !visited.has(cursor)) {
        if (cursor === scope.nodoId) { allowed = true; break; }
        visited.add(cursor);
        const current: DocumentSnapshot<DocumentData> = await getDoc(doc(base,cursor));
        if (!current.exists()) break;
        cursor = current.data()?.padreId || null;
      }
      if (!allowed) throw new Error("Este nodo no pertenece a tu red.");
      const current = await getDoc(doc(base,nodeId));
      if (!current.exists() || current.data().estado === "inactivo") throw new Error("Nodo no disponible.");
      const descendants = await getDocs(query(base,where("padreId","==",nodeId)));
      setOwner({id:current.id,...current.data()} as Leader);
      setChildren(descendants.docs.map(d=>({id:d.id,...d.data()} as Leader)).filter(n=>n.estado!=="inactivo"));
      setMode("nodos");setSearch("");
    } catch(e) {setError(e instanceof Error?e.message:"No fue posible cargar el nodo.");}
    finally {setLoading(false);}
  },[scope]);
  const showPeople = async () => {
    if (!scope || !owner) return;
    setLoading(true);setError("");
    try {
      const snap = await getDocs(collection(db,"clientes",scope.clienteId,"campanas",scope.campanaId,"nodos",owner.id,"personas"));
      setPeople(snap.docs.map(d=>({id:d.id,...d.data()})));
      setMode("personas");setSearch("");
    } catch(e) {setError(e instanceof Error?e.message:"No fue posible cargar personas.");}
    finally {setLoading(false);}
  };
  const registerPerson = async () => {
    if (!scope || !owner || !personName.trim() || !personLast.trim()) return;
    setBusy(true);setError("");
    try {
      const base = collection(db,"clientes",scope.clienteId,"campanas",scope.campanaId,"nodos");
      const batch = writeBatch(db);
      const newPerson = doc(collection(db,"clientes",scope.clienteId,"campanas",scope.campanaId,"nodos",owner.id,"personas"));
      batch.set(newPerson,{nombre:personName.trim(),apellido:personLast.trim(),responsableId:owner.id,creadoEn:serverTimestamp(),actualizadoEn:serverTimestamp()});
      let cursor: string|null=owner.id;
      const visited = new Set<string>();
      while(cursor && !visited.has(cursor)) {
        visited.add(cursor);
        batch.update(doc(base,cursor),{votosRealesSubarbol:increment(1)});
        if(cursor===scope.nodoId) break;
        const n: DocumentSnapshot<DocumentData> = await getDoc(doc(base,cursor));
        cursor=n.exists()?(n.data()?.padreId || null):null;
      }
      await batch.commit();
      setPersonName("");setPersonLast("");setFormOpen(false);await showPeople();
    } catch(e){setError(e instanceof Error?e.message:"No se pudo registrar la persona.");}
    finally{setBusy(false);}
  };
  const rateDirect = async () => { if(!scope || !owner || !ratingTarget || ratingTarget.id===scope.nodoId || !children.some(n=>n.id===ratingTarget.id)) return; setBusy(true); try { await updateDoc(doc(db,"clientes",scope.clienteId,"campanas",scope.campanaId,"nodos",ratingTarget.id),{puntuacion:ratingValue,puntuadoPor:auth.currentUser?.uid,puntuadoEn:serverTimestamp()});setChildren(items=>items.map(n=>n.id===ratingTarget.id?{...n,puntuacion:ratingValue}:n));setRatingTarget(null); }catch(e){setError(e instanceof Error?e.message:"No se pudo guardar la calificación.");}finally{setBusy(false);} };
  const filtered = (mode==="nodos"?children:people).filter(n=>{
    const text=[n.nombre,n.apellido,n.ciudad,n.departamento].join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
    return search.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").split(/\s+/).every(word=>text.includes(word));
  });
  return <main className="min-h-screen bg-[#f4f7f8] text-slate-900"><div className="lg:hidden"><button onClick={()=>setMenuOpen(v=>!v)} className="m-4 rounded-xl border bg-white px-4 py-2">☰ Menú</button></div>{menuOpen && <button aria-label="Cerrar menú" onClick={()=>setMenuOpen(false)} className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden"/>}<aside className={`fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col bg-[#082c2b] text-white shadow-2xl transition-transform lg:translate-x-0 ${menuOpen?"translate-x-0":"-translate-x-full"}`}><div className="flex h-[76px] items-center gap-3 border-b border-white/10 px-5"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white font-bold text-[#082c2b]">AP</div><div><p className="text-sm font-semibold">Autoridad Política</p><p className="text-xs text-emerald-200/70">Panel del líder</p></div></div><nav className="px-4 pt-7"><p className="mb-3 px-3 text-[10px] uppercase tracking-widest text-white/40">Principal</p><div className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-[#082c2b]">◉ Mi red</div></nav><div className="mt-auto p-4"><button className="w-full rounded-xl border border-white/20 p-3 text-left text-sm" onClick={()=>void signOut(auth).then(()=>router.replace("/login"))}>Cerrar sesión</button></div></aside><div className="min-h-screen lg:pl-[280px]"><div className="mx-auto max-w-6xl p-5">
    <header className="mb-6 flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase text-emerald-700">Organización territorial</p><h1 className="text-2xl font-bold text-emerald-950">Mi red</h1><p className="text-sm text-slate-500">Gestión de mi estructura y subniveles</p></div><button className="rounded-xl border bg-white px-4 py-2 text-sm" onClick={() => void signOut(auth).then(() => router.replace("/login"))}>Cerrar sesión</button></header>
    {loading && <p className="rounded-xl bg-white p-4">Cargando red...</p>}
    {error && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">{error}</p>}
    {leader && owner && <><section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 p-4"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="⌕ Busca por fragmentos: nombre, municipio, departamento..." className="h-11 w-full max-w-2xl rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500"/><p className="mt-2 text-[10px] text-slate-400">Busca exclusivamente en los líderes y personas del nodo seleccionado.</p></div><div className="min-h-[540px] bg-slate-50 px-4 py-5"><div className="mx-auto max-w-[420px] rounded-2xl border border-emerald-700 bg-gradient-to-br from-emerald-950 to-teal-700 p-4 text-white shadow-sm"><div className="flex items-center justify-between gap-2"><span className="text-[10px] font-bold uppercase tracking-wider text-emerald-200">Mi red · Nivel {owner.nivel}</span><div className="flex gap-1">{owner.id!==leader.id && <button className="rounded-md bg-white/20 px-2 py-1 text-xs font-bold" onClick={()=>void openNode((owner as Leader & {padreId?:string}).padreId||leader.id)}>↑ Subir</button>}<button className="rounded-md bg-violet-600 px-2 py-1 text-xs font-bold" onClick={()=>void openNode(leader.id)}>⌂ Inicio</button></div></div><h2 className="mt-2 text-center text-base font-bold uppercase">{owner.nombre} {owner.apellido}</h2><p className="mt-1 text-center text-xs text-emerald-100">Líder responsable</p><div className="mt-4 flex flex-wrap justify-center gap-2"><button className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-emerald-900" onClick={()=>setFormOpen(true)}>+ Registrar persona</button><button className="rounded-lg bg-white/20 px-3 py-2 text-xs font-bold" onClick={()=>void showPeople()}>Ver personas</button><button className="rounded-lg bg-white/20 px-3 py-2 text-xs font-bold" onClick={()=>{setMode("nodos");setSearch("");}}>Ver líderes</button></div><div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded-lg bg-white/15 p-2"><p className="text-[10px] text-white/80">Estimación</p><p className="text-xl font-black">{Number(owner.votosEstimadosSubarbol||0).toLocaleString("es-CO")}</p></div><div className="rounded-lg bg-white/15 p-2"><p className="text-[10px] text-white/80">Registros reales</p><p className="text-xl font-black">{Number(owner.votosRealesSubarbol||0).toLocaleString("es-CO")}</p></div></div><p className="mt-3 text-center text-[10px] text-emerald-100">{children.length} líderes directos · Sin límite horizontal</p></div><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{filtered.map(n=><article key={n.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"><div className="mb-3 text-[10px] font-semibold text-slate-400">N{(n as Leader).nivel||""}</div><h3 className="text-sm font-bold text-slate-900">{n.nombre} {n.apellido}</h3><p className="mt-1 text-[10px] text-slate-500">{[n.ciudad,n.departamento].filter(Boolean).join(" · ")}</p>{mode==="nodos" && <><div className="mt-3 rounded-xl border border-lime-300 bg-lime-50 p-3"><div className="flex items-center justify-between"><p className="text-[10px] font-bold uppercase text-slate-500">Valoración del líder</p><button className="rounded-lg border bg-white px-2 py-1 text-xs" onClick={()=>{setRatingTarget(n as Leader);setRatingValue((n as Leader).puntuacion??5);}}>✎</button></div><p className="text-lg font-bold text-lime-700">★ {(n as Leader).puntuacion??"—"} <span className="text-xs">/ 10</span></p><div className="mt-2 h-2 overflow-hidden rounded-full bg-lime-100"><div className={`h-full rounded-full ${((n as Leader).puntuacion||0)>=8?"bg-lime-500":((n as Leader).puntuacion||0)>=5?"bg-amber-400":"bg-red-500"}`} style={{width:`${((n as Leader).puntuacion||0)*10}%`}}/></div></div><div className="mt-3 grid grid-cols-2 gap-2"><div className="rounded-lg bg-amber-50 p-2"><p className="text-[10px] text-amber-800">Estimación acumulada</p><p className="text-sm font-bold text-amber-900">{Number((n as Leader).votosEstimadosSubarbol||0).toLocaleString("es-CO")}</p></div><div className="rounded-lg bg-blue-50 p-2"><p className="text-[10px] text-blue-700">Registros acumulados</p><p className="text-sm font-bold text-blue-900">{Number((n as Leader).votosRealesSubarbol||0).toLocaleString("es-CO")}</p></div></div><div className="mt-3 flex flex-wrap gap-2 border-t pt-3"><button onClick={()=>void openNode(n.id)} className="rounded-md bg-emerald-50 px-2 py-1.5 text-xs font-bold text-emerald-800">Ver subnivel →</button><button onClick={()=>{setRatingTarget(n as Leader);setRatingValue((n as Leader).puntuacion??5);}} className="rounded-md border px-2 py-1.5 text-xs">✎ Calificar</button></div></>}</article>)}</div>{!filtered.length && <p className="mt-8 text-center text-sm text-slate-400">Este nodo aún no tiene {mode==="nodos"?"líderes directos":"personas registradas"}.</p>}</div></section>
    {ratingTarget && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"><div className="w-full max-w-md rounded-2xl bg-white p-6"><h3 className="mb-4 text-lg font-bold">Calificar a {ratingTarget.nombre} {ratingTarget.apellido}</h3><label className="block text-sm">Puntuación de 1 a 10</label><input type="range" min={1} max={10} value={ratingValue} onChange={e=>setRatingValue(Number(e.target.value))} className="my-4 w-full"/><p className="mb-4 text-center text-2xl font-bold">{ratingValue}/10</p><div className="flex gap-2"><button disabled={busy} onClick={()=>void rateDirect()} className="rounded-lg bg-emerald-800 px-4 py-2 text-white">Guardar</button><button onClick={()=>setRatingTarget(null)} className="rounded-lg border px-4 py-2">Cancelar</button></div></div></div>}
    {formOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"><div className="w-full max-w-md rounded-2xl bg-white p-6"><h3 className="mb-4 text-lg font-bold">Registrar persona en {owner.nombre}</h3><input className="mb-3 w-full rounded-lg border p-3" placeholder="Nombre" value={personName} onChange={e=>setPersonName(e.target.value)}/><input className="mb-4 w-full rounded-lg border p-3" placeholder="Apellido" value={personLast} onChange={e=>setPersonLast(e.target.value)}/><div className="flex gap-2"><button disabled={busy} onClick={()=>void registerPerson()} className="rounded-lg bg-emerald-800 px-4 py-2 text-white disabled:opacity-50">Guardar</button><button onClick={()=>setFormOpen(false)} className="rounded-lg border px-4 py-2">Cancelar</button></div></div></div>}
    <p className="mt-5 text-xs text-slate-500">La creación de líderes y los permisos avanzados por nivel requieren reglas de seguridad de Firestore verificadas.</p></>}
  </div></div></main>;
}
