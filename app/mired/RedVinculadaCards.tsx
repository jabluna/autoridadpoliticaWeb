"use client";
import { useMemo, useState } from "react";

export type NodoVinculado = {
  id: string; padreId: string; nombre: string; apellido: string; nivel: number;
  estimacionVotos: number; votosRealesSubarbol?: number; puntuacion?: number;
  multinodo?: boolean; etiquetaId?: string; fotoUrl?: string;
};
export type RedVinculada = { id: string; nombre: string; categoria: string; estado: string; accesoCompartido: boolean; aviso?: string; red: NodoVinculado[] };
export default function RedVinculadaCards({ network }: { network: RedVinculada }) {
  const [focus, setFocus] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("votos");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(12);
  const byId = useMemo(() => new Map(network.red.map(n => [n.id, n])), [network.red]);
  const children = useMemo(() => network.red.filter(n => focus ? n.padreId === focus : !n.padreId || !byId.has(n.padreId)), [network.red, focus, byId]);
  const descendants = (id: string) => {
    const seen = new Set<string>([id]);
    let frontier = [id];
    for (let i = 0; i < 50 && frontier.length; i++) {
      const next = network.red.filter(n => !seen.has(n.id) && frontier.includes(n.padreId)).map(n => n.id);
      next.forEach(n => seen.add(n)); frontier = next;
    }
    return network.red.filter(n => seen.has(n.id));
  };
  const total = (id: string) => descendants(id).reduce((sum, n) => sum + Number(n.votosRealesSubarbol || 0), 0);
  const filtered = children.filter(n => `${n.nombre} ${n.apellido}`.toLocaleLowerCase("es").includes(search.toLocaleLowerCase("es")))
    .sort((a,b) => sort === "nombre" ? `${a.nombre} ${a.apellido}`.localeCompare(`${b.nombre} ${b.apellido}`,"es") : sort === "estimado" ? b.estimacionVotos - a.estimacionVotos : sort === "calificacion" ? Number(b.puntuacion || 0) - Number(a.puntuacion || 0) : total(b.id) - total(a.id));
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const shown = filtered.slice((page-1)*size,page*size);
  const current = focus ? byId.get(focus) : null;
  const changeFocus = (id: string | null) => { setFocus(id); setPage(1); setSearch(""); };
  return <section className="col-span-full space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><div className="text-xs font-bold text-emerald-700">Red vinculada · {current ? `Nivel ${current.nivel + 2}` : "Nivel 2"}</div><h3 className="text-lg font-black text-slate-900">{network.nombre}</h3><p className="text-xs text-slate-500">Propiedad del invitado · {network.categoria} · Solo lectura</p></div>
      <div className="flex gap-2"><button type="button" onClick={() => changeFocus(current?.padreId || null)} disabled={!focus} className="rounded-xl border bg-white px-3 py-2 text-xs font-bold disabled:opacity-40">↑ Superior</button><button type="button" onClick={() => changeFocus(null)} className="rounded-xl border bg-white px-3 py-2 text-xs font-bold">⌂ Inicio</button></div>
    </div>
    {network.aviso && <p className="text-xs text-amber-700">{network.aviso}</p>}
    <div className="flex flex-wrap gap-2">
      <input aria-label="Buscar líderes de red vinculada" value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} placeholder="Buscar por nombre…" className="min-w-[180px] flex-1 rounded-xl border bg-white px-3 py-2 text-xs" />
      <select aria-label="Ordenar red vinculada" value={sort} onChange={e=>setSort(e.target.value)} className="rounded-xl border bg-white px-3 py-2 text-xs"><option value="votos">Más votos</option><option value="nombre">Nombre A–Z</option><option value="estimado">Mayor estimado</option><option value="calificacion">Mejor calificación</option></select>
      <select aria-label="Tarjetas por página de red vinculada" value={size} onChange={e=>{setSize(Number(e.target.value));setPage(1);}} className="rounded-xl border bg-white px-3 py-2 text-xs"><option value={12}>12 por página</option><option value={24}>24 por página</option><option value={48}>48 por página</option></select>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {shown.map(n => {
        const subtree = descendants(n.id);
        const votes = total(n.id);
        const estimate = Number(n.estimacionVotos || 0);
        const childrenCount = network.red.filter(x=>x.padreId===n.id).length;
        return <article key={n.id} className={`min-w-0 rounded-[20px] border-2 p-3 text-center shadow-[0_6px_20px_rgba(20,90,140,.08)] ${n.multinodo !== false ? "border-emerald-300 bg-emerald-50/60" : "border-sky-300 bg-sky-50/60"}`}>
          <div className="flex items-center justify-between gap-2 text-[10px] font-bold text-sky-500"><span>Nivel {n.nivel + 1} · {n.multinodo !== false ? "● Crea red" : "● Sin red"}</span><button type="button" onClick={()=>changeFocus(n.id)} className="rounded-xl bg-sky-700 px-3 py-2 text-xs font-extrabold text-white shadow">Ver mi red ➜</button></div>
          <div className="mt-3 flex items-center gap-2 text-left"><div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border-[3px] border-sky-300 bg-sky-50 font-black text-sky-700">{n.fotoUrl ? <img src={n.fotoUrl} alt="" className="h-full w-full object-cover"/> : (n.nombre?.[0] || "L").toUpperCase()}</div><div className="min-w-0 flex-1"><div className="truncate text-xs font-extrabold text-slate-900">{n.nombre} {n.apellido}</div><div className="text-[10px] text-slate-500">{childrenCount} líderes directos · {subtree.length} en su rama</div></div><div className="rounded-lg border border-emerald-300 bg-emerald-100 p-2 text-xs font-black text-emerald-800">{votes}<div className="text-[9px] font-normal">Votos</div></div></div>
          <div className="mt-3 text-left text-[10px] text-slate-500">Avance de la meta <span className="float-right">{estimate ? Math.min(100,Math.round(votes/estimate*100)) : 0}%</span></div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-emerald-400" style={{width:`${estimate ? Math.min(100,votes/estimate*100) : 0}%`}}/></div>
          <div className="mt-3 grid grid-cols-3 gap-1 text-left">{[["Estimado",estimate],["Diferencia",estimate-votes],["Reuniones",Number(n.votosRealesSubarbol||0)]].map(([label,value])=><div key={String(label)} className="min-w-0 rounded-lg border border-slate-200 bg-white p-1.5"><strong className="block truncate text-xs font-black">{Number(value).toLocaleString("es-CO")}</strong><span className="text-[9px] text-slate-500">{label}</span></div>)}</div>
          <details className="mt-3 border-t pt-2 text-left"><summary className="cursor-pointer rounded-lg bg-sky-50 px-3 py-2 text-center text-xs font-bold text-sky-800">Acciones · Ver más ▾</summary><div className="mt-2 space-y-2"><button type="button" onClick={()=>changeFocus(n.id)} className="w-full rounded-lg border bg-white p-2 text-xs">Ver mi red</button><p className="text-[10px] text-slate-500">Editar, mover, eliminar y registrar personas son acciones exclusivas del propietario. La consulta de reuniones y comentarios se habilitará con sus permisos.</p></div></details>
        </article>;
      })}
    </div>
    {!filtered.length && <p className="p-5 text-center text-xs text-slate-500">No hay líderes directos en este nivel.</p>}
    {pages > 1 && <div className="flex justify-center gap-3 text-xs"><button disabled={page===1} onClick={()=>setPage(p=>p-1)} className="rounded-lg border bg-white px-3 py-2 disabled:opacity-40">Anterior</button><span className="py-2">{page} / {pages}</span><button disabled={page>=pages} onClick={()=>setPage(p=>p+1)} className="rounded-lg border bg-white px-3 py-2 disabled:opacity-40">Siguiente</button></div>}
  </section>;
}
