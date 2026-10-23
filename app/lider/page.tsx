"use client";

import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { collection, doc, getDoc, getDocs, query, where, updateDoc, increment, serverTimestamp, writeBatch } from "firebase/firestore";
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
        const current = await getDoc(doc(base,cursor));
        if (!current.exists()) break;
        cursor = current.data().padreId || null;
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
        const n=await getDoc(doc(base,cursor));
        cursor=n.exists()?n.data().padreId||null:null;
      }
      await batch.commit();
      setPersonName("");setPersonLast("");setFormOpen(false);await showPeople();
    } catch(e){setError(e instanceof Error?e.message:"No se pudo registrar la persona.");}
    finally{setBusy(false);}
  };
  const filtered = (mode==="nodos"?children:people).filter(n=>{
    const text=[n.nombre,n.apellido,n.ciudad,n.departamento].join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
    return search.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").split(/\s+/).every(word=>text.includes(word));
  });
  return <main className="min-h-screen bg-[#f4f7f8] p-5 text-slate-900"><div className="mx-auto max-w-6xl">
    <header className="mb-6 flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase text-emerald-700">Organización territorial</p><h1 className="text-2xl font-bold text-emerald-950">Mi red</h1><p className="text-sm text-slate-500">Gestión de mi estructura y subniveles</p></div><button className="rounded-xl border bg-white px-4 py-2 text-sm" onClick={() => void signOut(auth).then(() => router.replace("/login"))}>Cerrar sesión</button></header>
    {loading && <p className="rounded-xl bg-white p-4">Cargando red...</p>}
    {error && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">{error}</p>}
    {leader && owner && <><section className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex flex-wrap justify-between gap-3"><div><p className="text-xs font-bold uppercase text-emerald-700">{owner.id===leader.id?"Mi nodo principal":"Subnivel seleccionado"} · Nivel {owner.nivel}</p><h2 className="mt-2 text-xl font-bold">{owner.nombre} {owner.apellido}</h2><p className="text-sm text-slate-500">{[owner.ciudad,owner.departamento].filter(Boolean).join(" · ")}</p></div><div className="flex gap-2"><button className="rounded-lg border px-3 py-2 text-sm" onClick={()=>void openNode(leader.id)}>⌂ Mi raíz</button>{owner.id!==leader.id && <button className="rounded-lg border px-3 py-2 text-sm" onClick={()=>void openNode(owner.id===leader.id?leader.id:(owner as Leader & {padreId?:string}).padreId||leader.id)}>↑ Subir</button>}</div></div><div className="mt-4 flex flex-wrap gap-3 text-sm"><span className="rounded-lg bg-emerald-50 px-3 py-2">Registros en rama: {owner.votosRealesSubarbol||0}</span><span className="rounded-lg bg-slate-100 px-3 py-2">Estimación: {owner.votosEstimadosSubarbol||0}</span><span className="rounded-lg bg-slate-100 px-3 py-2">Calificación: {owner.puntuacion??"—"}/10</span></div></section>
    <section className="mt-5 overflow-hidden rounded-2xl border bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b p-5"><div><h3 className="text-lg font-bold">{mode==="nodos"?"Líderes de este nivel":"Personas registradas"}</h3><p className="text-xs text-slate-500">Solo la estructura que depende de tu nodo</p></div><div className="flex flex-wrap gap-2"><button className="rounded-lg bg-emerald-800 px-3 py-2 text-xs font-bold text-white" onClick={()=>setMode("nodos")}>Vista nodos</button><button className="rounded-lg border px-3 py-2 text-xs font-bold" onClick={()=>void showPeople()}>Personas por nodo</button><button className="rounded-lg border px-3 py-2 text-xs font-bold" onClick={()=>setFormOpen(true)}>+ Registrar persona</button></div></div><div className="p-5"><input className="mb-4 w-full rounded-xl border px-4 py-3 text-sm" placeholder="Buscar por nombre, ciudad o departamento..." value={search} onChange={e=>setSearch(e.target.value)}/><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{filtered.map(n=><article key={n.id} className="rounded-xl border bg-white p-4"><strong>{n.nombre} {n.apellido}</strong><p className="mt-2 text-xs text-slate-500">{[n.ciudad,n.departamento].filter(Boolean).join(" · ")}</p>{mode==="nodos" && <div className="mt-3 flex flex-wrap gap-2"><button onClick={()=>void openNode(n.id)} className="rounded-lg bg-emerald-800 px-3 py-2 text-xs font-bold text-white">Ver subnivel →</button><button onClick={()=>void updateDoc(doc(db,"clientes",scope!.clienteId,"campanas",scope!.campanaId,"nodos",n.id),{puntuacion:8,puntuadoPor:auth.currentUser?.uid,puntuadoEn:serverTimestamp()}).then(()=>openNode(owner.id)).catch(e=>setError(e.message))} className="rounded-lg border px-3 py-2 text-xs" title="Calificación de prueba; pendiente formulario y reglas de permisos">★ 8/10</button></div>}</article>)}</div>{filtered.length===0 && <p className="text-sm text-slate-500">No hay registros para mostrar.</p>}</div></section>
    {formOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"><div className="w-full max-w-md rounded-2xl bg-white p-6"><h3 className="mb-4 text-lg font-bold">Registrar persona en {owner.nombre}</h3><input className="mb-3 w-full rounded-lg border p-3" placeholder="Nombre" value={personName} onChange={e=>setPersonName(e.target.value)}/><input className="mb-4 w-full rounded-lg border p-3" placeholder="Apellido" value={personLast} onChange={e=>setPersonLast(e.target.value)}/><div className="flex gap-2"><button disabled={busy} onClick={()=>void registerPerson()} className="rounded-lg bg-emerald-800 px-4 py-2 text-white disabled:opacity-50">Guardar</button><button onClick={()=>setFormOpen(false)} className="rounded-lg border px-4 py-2">Cancelar</button></div></div></div>}
    <p className="mt-5 text-xs text-slate-500">La creación de líderes y los permisos avanzados por nivel requieren reglas de seguridad de Firestore verificadas.</p></>}
  </div></main>;
}
