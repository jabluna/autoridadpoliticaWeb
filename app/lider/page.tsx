"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";

type Leader = { id: string; nombre?: string; apellido?: string; ciudad?: string; departamento?: string; nivel?: number; multinodo?: boolean; estado?: string; uid?: string };
export default function LeaderPage() {
  const router = useRouter();
  const [leader, setLeader] = useState<Leader | null>(null);
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
          setChildren(descendants.docs.map(d => ({ id: d.id, ...d.data() } as Leader)).filter(n => n.estado !== "inactivo"));
        }
      } catch (e) { if (live) setError(e instanceof Error ? e.message : "No fue posible abrir tu red."); }
      finally { if (live) setLoading(false); }
    });
    return () => { live = false; unsub(); };
  }, [router]);
  return <main className="min-h-screen bg-slate-50 p-5 text-slate-900"><div className="mx-auto max-w-5xl">
    <header className="mb-6 flex items-center justify-between gap-3"><h1 className="text-2xl font-bold text-emerald-900">Mi red de liderazgo</h1><button className="rounded-xl border bg-white px-4 py-2 text-sm" onClick={() => void signOut(auth).then(() => router.replace("/login"))}>Cerrar sesión</button></header>
    {loading && <p>Validando tu cuenta y cargando tu nodo...</p>}
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">{error}</p>}
    {leader && <><section className="rounded-2xl border bg-white p-6 shadow-sm"><p className="text-xs font-bold uppercase text-emerald-700">Mi nodo · Nivel {leader.nivel}</p><h2 className="mt-2 text-xl font-bold">{leader.nombre} {leader.apellido}</h2><p className="text-sm text-slate-500">{[leader.ciudad, leader.departamento].filter(Boolean).join(" · ")}</p><p className="mt-3 text-sm">Multinivel: {leader.multinodo === false ? "No habilitado" : "Habilitado según el plan"}</p></section>
      <h3 className="mb-3 mt-8 text-lg font-bold">Líderes directos ({children.length})</h3><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children.map(n => <article key={n.id} className="rounded-xl border bg-white p-4"><strong>{n.nombre} {n.apellido}</strong><p className="text-sm text-slate-500">Nivel {n.nivel} · {[n.ciudad,n.departamento].filter(Boolean).join(", ")}</p></article>)}</div><p className="mt-6 text-xs text-slate-500">Vista inicial de consulta para líderes. Las operaciones de registro, calificación y administración requieren permisos específicos por nivel.</p></>}
  </div></main>;
}
