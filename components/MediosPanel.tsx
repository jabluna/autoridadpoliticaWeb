"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useRouter } from "next/navigation";

type Scope={clienteId:string;campanaId:string;nombre:string;invitada:boolean};
type Entry={id:string;nombre:string;tipo?:string;bytes?:number;albumId?:string;creadoEn?:string;creadoPor?:string};
type Leader={id:string;uid:string;nombre:string;email:string;nivel:number};
type Mode="gestion"|"medios"|"galeria";
const endpoint="/api/medios";
const date=(s?:string)=>s?new Date(s).toLocaleDateString("es-CO"):"—";
async function optimizePhoto(file:File):Promise<File>{
  if(!file.type.startsWith("image/"))throw Error("Selecciona una imagen.");
  const image=await createImageBitmap(file);
  let width=Math.min(1600,image.width),height=Math.round(image.height*width/image.width);
  for(let round=0;round<5;round++){
    const canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;
    canvas.getContext("2d")?.drawImage(image,0,0,width,height);
    const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,"image/webp",Math.max(.35,.82-round*.12)));
    if(blob&&blob.size<=500*1024){image.close();return new File([blob],file.name.replace(/\.[^.]+$/,"")+".webp",{type:"image/webp"});}
    width=Math.max(400,Math.round(width*.75));height=Math.max(300,Math.round(height*.75));
  }
  image.close();throw Error("No fue posible reducir esta imagen a 500 KB.");
}
function PhotoPreview({scope,item}:{scope:Scope;item:Entry}){
  const [src,setSrc]=useState("");
  useEffect(()=>{let active=true;(async()=>{try{
    const user=auth.currentUser;if(!user)return;
    const q=new URLSearchParams({clienteId:scope.clienteId,campanaId:scope.campanaId,type:"download",collection:"photos",id:item.id});
    const response=await fetch(endpoint+"?"+q,{headers:{Authorization:`Bearer ${await user.getIdToken()}`},cache:"no-store"});
    if(!response.ok)return;const data=await response.json();if(active)setSrc(data.url);
  }catch{}})();return()=>{active=false};},[scope.clienteId,scope.campanaId,item.id]);
  return src?<img src={src} alt={item.nombre} loading="lazy" className="mb-3 h-44 w-full rounded-xl bg-slate-100 object-cover"/>:<div className="mb-3 flex h-44 items-center justify-center rounded-xl bg-slate-100 text-slate-400">Cargando foto…</div>;
}
export default function MediosPanel({mode}:{mode:Mode}){
  const router=useRouter();
  const [scopes,setScopes]=useState<Scope[]>([]),[scopeKey,setScopeKey]=useState("");
  const [items,setItems]=useState<Entry[]>([]),[albums,setAlbums]=useState<Entry[]>([]);
  const [leaders,setLeaders]=useState<Leader[]>([]),[authorized,setAuthorized]=useState<string[]>([]);
  const [search,setSearch]=useState(""),[level,setLevel]=useState("");
  const [name,setName]=useState(""),[description,setDescription]=useState(""),[albumId,setAlbumId]=useState("");
  const [file,setFile]=useState<File|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const [canManage,setCanManage]=useState(false),[owner,setOwner]=useState(false);
  const scope=scopes.find(s=>`${s.clienteId}:${s.campanaId}`===scopeKey);
  const call=useCallback(async(type:string,method="GET",payload?:FormData|object,extra="")=>{
    const user=auth.currentUser;if(!user)throw Error("Inicia sesión.");
    const headers:Record<string,string>={Authorization:`Bearer ${await user.getIdToken()}`};
    let body:BodyInit|undefined;
    if(payload instanceof FormData){body=payload;}
    else if(payload){headers["Content-Type"]="application/json";body=JSON.stringify(payload);}
    const response=await fetch(endpoint+(method==="GET"?`?clienteId=${encodeURIComponent(scope?.clienteId||"")}&campanaId=${encodeURIComponent(scope?.campanaId||"")}&type=${type}${extra}`:""),{method,headers,body,cache:"no-store"});
    const data=await response.json();if(!response.ok)throw Error(data.error||"Error en medios");return data;
  },[scope]);
  useEffect(()=>onAuthStateChanged(auth,async user=>{
    if(!user){router.replace("/login");return;}
    try{
      const profile=await getDoc(doc(db,"usuarios",user.uid));
      if(!profile.exists())throw Error("Perfil no encontrado.");
      const u=profile.data(), own:Scope[]=[];
      if(u.clienteId){
        if(u.rol==="cliente_admin"){
          const snap=await getDocs(collection(db,"clientes",u.clienteId,"campanas"));
          snap.docs.forEach(d=>own.push({clienteId:u.clienteId,campanaId:d.id,nombre:d.get("nombreCampana")||"Mi campaña",invitada:false}));
        }else if(u.rol==="red_usuario"&&u.campanaId){
          own.push({clienteId:u.clienteId,campanaId:u.campanaId,nombre:"Mi red",invitada:false});
        }
      }
      const response=await fetch("/api/invitaciones-red",{headers:{Authorization:`Bearer ${await user.getIdToken()}`},cache:"no-store"});
      if(response.ok){const data=await response.json();for(const i of data.invitaciones||[]){
        if(i.estado==="aceptada"&&i.clienteId&&i.campanaId)own.push({clienteId:i.clienteId,campanaId:i.campanaId,nombre:i.campanaNombre||"Campaña invitante",invitada:true});
      }}
      setScopes(own);setScopeKey(v=>v|| (own[0]?`${own[0].clienteId}:${own[0].campanaId}`:""));
    }catch(e){setError(e instanceof Error?e.message:"No fue posible cargar campañas");}
  }),[router]);
  const refresh=useCallback(async()=>{
    if(!scope)return;
    try{
      setError("");
      const type=mode==="galeria"?"photos":"media";
      const data=await call(type);
      setItems(data.items||[]);setCanManage(!!data.canManage);setOwner(!!data.owner);
      if(mode==="galeria"){const a=await call("albums");setAlbums(a.items||[]);}
      if(mode==="gestion"&&data.owner){const p=await call("leaders");setLeaders(p.leaders||[]);setAuthorized((p.autorizaciones||[]).map((a:{uid:string})=>a.uid));}
    }catch(e){setError(e instanceof Error?e.message:"Error cargando medios");}
  },[scope,call,mode]);
  useEffect(()=>{void refresh();},[refresh]);
  const filtered=useMemo(()=>leaders.filter(l=>(!level||String(l.nivel)===level)&&[l.nombre,l.email].join(" ").toLowerCase().includes(search.toLowerCase())),[leaders,search,level]);
  const mutate=async(action:()=>Promise<void>)=>{setBusy(true);setError("");setNotice("");try{await action();await refresh();setNotice("Cambios guardados correctamente.");}catch(e){setError(e instanceof Error?e.message:"No se pudo guardar");}finally{setBusy(false);}};
  const form=(type:string)=>{const f=new FormData();f.set("type",type);f.set("clienteId",scope?.clienteId||"");f.set("campanaId",scope?.campanaId||"");return f;};
  const upload=()=>mutate(async()=>{
    if(!file||!name.trim())throw Error("Escribe un nombre y selecciona un archivo.");
    const f=form(mode==="galeria"?"photo":"media");f.set("nombre",name.trim());f.set("albumId",albumId);
    f.set("file",mode==="galeria"?await optimizePhoto(file):file);
    await call("", "POST",f);setName("");setFile(null);
    const input=document.getElementById("media-file") as HTMLInputElement|null;if(input)input.value="";
  });
  const createAlbum=()=>mutate(async()=>{if(!name.trim())throw Error("Nombre requerido");const f=form("album");f.set("nombre",name);f.set("descripcion",description);await call("","POST",f);setName("");setDescription("");});
  const changeAuth=(leader:Leader,active:boolean)=>mutate(async()=>{const f=form("authorization");f.set("uid",leader.uid);f.set("nodoId",leader.id);f.set("activo",String(active));await call("","POST",f);});
  const edit=(item:Entry,type:string)=>{const nombre=prompt("Nuevo nombre",item.nombre);if(!nombre||nombre===item.nombre)return;void mutate(async()=>{await call("","PATCH",{clienteId:scope?.clienteId,campanaId:scope?.campanaId,type,id:item.id,nombre});});};
  const remove=(item:Entry,type:string)=>{if(!confirm(`¿Eliminar ${item.nombre}?`))return;void mutate(async()=>{await call("","DELETE",{clienteId:scope?.clienteId,campanaId:scope?.campanaId,type,id:item.id});});};
  const open=async(item:Entry,photo=false,share=false)=>{try{
    const data=await call("download","GET",undefined,`&collection=${photo?"photos":"media"}&id=${encodeURIComponent(item.id)}`);
    if(share){
      const url=`https://wa.me/?text=${encodeURIComponent(item.nombre+" "+data.url)}`;window.open(url,"_blank","noopener,noreferrer");
    }else window.open(data.url,"_blank","noopener,noreferrer");
  }catch(e){setError(e instanceof Error?e.message:"No fue posible abrir el archivo");}};
  const title=mode==="gestion"?"Autorizaciones y gestión":mode==="galeria"?"Galería":"Medios de campaña";
  return <main className="min-h-screen bg-slate-50 p-4 text-slate-900 sm:p-8"><div className="mx-auto max-w-6xl space-y-5">
    <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-blue-700">Medios</p><h1 className="text-2xl font-black">{title}</h1></div><button onClick={()=>router.push("/dashboard")} className="rounded-xl border bg-white px-4 py-2 text-sm">← Panel</button></div>
    <nav className="flex flex-wrap gap-2">{[["gestion","Autorizaciones y gestión"],["medios","Medios"],["galeria","Galería"]].map(([m,label])=><button key={m} onClick={()=>router.push(m==="medios"?"/medios":`/medios/${m}`)} className={`rounded-xl px-4 py-2 text-sm font-bold ${mode===m?"bg-blue-800 text-white":"border bg-white"}`}>{label}</button>)}</nav>
    <div className="rounded-2xl border bg-white p-4"><label className="block text-sm font-bold">Selecciona la red o campaña<select value={scopeKey} onChange={e=>{setScopeKey(e.target.value);setItems([]);setAlbums([]);}} className="mt-2 w-full max-w-lg rounded-xl border p-3 text-sm"><optgroup label="Medios de mi red">{scopes.filter(s=>!s.invitada).map(s=><option key={`${s.clienteId}:${s.campanaId}`} value={`${s.clienteId}:${s.campanaId}`}>{s.nombre}</option>)}</optgroup><optgroup label="Medios de donde estoy invitado">{scopes.filter(s=>s.invitada).map(s=><option key={`${s.clienteId}:${s.campanaId}`} value={`${s.clienteId}:${s.campanaId}`}>{s.nombre}</option>)}</optgroup></select></label>{scope?.invitada&&<p className="mt-2 text-xs text-blue-700">Campaña a la que estás vinculado como invitado: acceso de consulta.</p>}</div>
    {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}{notice&&<p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}
    {!scope?<p className="rounded-xl border bg-white p-5">No hay campañas disponibles.</p>:<>
      {mode==="gestion"&&<section className="rounded-2xl border bg-white p-5"><h2 className="text-lg font-bold">Autorizaciones de publicación</h2><p className="mt-1 text-sm text-slate-500">Solo el propietario del nivel 1 puede autorizar líderes activos de su propia red. Las redes retiradas no aparecen.</p>{owner?<><div className="mt-4 flex flex-wrap gap-2"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar nombre o correo" className="min-w-0 flex-1 rounded-xl border p-3 text-sm"/><input type="number" min="2" value={level} onChange={e=>setLevel(e.target.value)} placeholder="Nivel (ej. 2)" className="w-36 rounded-xl border p-3 text-sm"/></div><div className="mt-4 max-h-96 space-y-2 overflow-auto">{filtered.map(l=><div key={l.id} className="flex items-center justify-between gap-3 rounded-xl border p-3"><div className="min-w-0"><p className="truncate text-sm font-bold">{l.nombre}</p><p className="truncate text-xs text-slate-500">{l.email} · Nivel {l.nivel}</p></div><button disabled={busy||!l.uid} onClick={()=>changeAuth(l,!authorized.includes(l.uid))} className={`rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-50 ${authorized.includes(l.uid)?"bg-red-50 text-red-700":"bg-emerald-700 text-white"}`}>{authorized.includes(l.uid)?"Quitar permiso":"Autorizar"}</button></div>)}</div></>:<p className="mt-3 text-sm text-slate-500">La administración de autorizaciones corresponde al propietario de la campaña.</p>}</section>}
      {((mode==="gestion"&&canManage)||(mode==="galeria"&&!scope.invitada))&&<section className="rounded-2xl border bg-white p-5"><h2 className="font-bold">{mode==="galeria"?"Crear álbum o subir fotografías":"Subir material de campaña"}</h2>{mode==="galeria"&&<div className="mt-3 flex flex-wrap gap-2"><input value={name} onChange={e=>setName(e.target.value)} placeholder="Nombre del álbum o foto" className="min-w-0 flex-1 rounded-xl border p-3 text-sm"/><button disabled={busy} onClick={createAlbum} className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-bold text-white">Crear álbum</button></div>}{mode!=="galeria"&&<input value={name} onChange={e=>setName(e.target.value)} placeholder="Nombre del material" className="mt-3 w-full max-w-md rounded-xl border p-3 text-sm"/>}{mode==="galeria"&&<select value={albumId} onChange={e=>setAlbumId(e.target.value)} className="mt-3 w-full max-w-md rounded-xl border p-3 text-sm"><option value="">Selecciona álbum</option>{albums.map(a=><option key={a.id} value={a.id}>{a.nombre}</option>)}</select>}<div className="mt-3 flex flex-wrap items-center gap-3"><input id="media-file" type="file" accept={mode==="galeria"?"image/*":undefined} onChange={e=>setFile(e.target.files?.[0]||null)} className="max-w-full text-sm"/><button disabled={busy||!file||!name.trim()||(mode==="galeria"&&!albumId)} onClick={upload} className="rounded-xl bg-blue-800 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40">{busy?"Guardando…":"Subir archivo"}</button></div><p className="mt-2 text-xs text-slate-500">{mode==="galeria"?"Las fotos se comprimen automáticamente a WebP de máximo 500 KB.":"Archivos de cualquier formato, máximo 20 MB por archivo."}</p></section>}
      {mode==="galeria"&&<section className="space-y-3"><h2 className="text-lg font-bold">Álbumes ({albums.length})</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{albums.map(a=><button key={a.id} onClick={()=>setAlbumId(a.id)} className={`rounded-2xl border bg-white p-4 text-left ${albumId===a.id?"ring-2 ring-blue-500":""}`}><h3 className="font-bold">{a.nombre}</h3><p className="text-xs text-slate-500">{date(a.creadoEn)} · {items.filter(i=>i.albumId===a.id).length} fotos</p>{canManage&&<span className="mt-2 flex gap-3 text-xs text-blue-700"><span onClick={e=>{e.stopPropagation();edit(a,"album")}}>Editar</span><span onClick={e=>{e.stopPropagation();remove(a,"album")}}>Eliminar</span></span>}</button>)}</div></section>}
      {mode!=="gestion"&&<section className="space-y-3"><h2 className="text-lg font-bold">{mode==="galeria"?"Fotografías":"Archivos disponibles"} ({mode==="galeria"&&albumId?items.filter(i=>i.albumId===albumId).length:items.length})</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{items.filter(i=>mode!=="galeria"||!albumId||i.albumId===albumId).map(item=><article key={item.id} className="rounded-2xl border bg-white p-4">{mode==="galeria"&&scope&&<PhotoPreview scope={scope} item={item}/>}<div className="flex items-center gap-3"><span className="text-2xl">{mode==="galeria"?"▧":"📄"}</span><div className="min-w-0"><h3 className="truncate font-bold" title={item.nombre}>{item.nombre}</h3><p className="text-xs text-slate-500">{date(item.creadoEn)} · {item.bytes?Math.round(item.bytes/1024)+" KB":""}</p></div></div><div className="mt-4 flex flex-wrap gap-2"><button onClick={()=>void open(item,mode==="galeria")} className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-bold text-white">{mode==="galeria"?"Ver / descargar":"Descargar"}</button>{mode==="galeria"&&<button onClick={()=>void open(item,true,true)} className="rounded-lg border px-3 py-2 text-xs">Compartir WhatsApp</button>}{mode==="galeria"&&<button onClick={()=>void (async()=>{try{const d=await call("download","GET",undefined,`&collection=photos&id=${encodeURIComponent(item.id)}`);await navigator.clipboard.writeText(d.url);setNotice("Enlace temporal copiado (válido 10 minutos).");}catch(e){setError(e instanceof Error?e.message:"No se pudo copiar");}})()} className="rounded-lg border px-3 py-2 text-xs">Copiar enlace</button>}{canManage&&<><button onClick={()=>edit(item,mode==="galeria"?"photo":"media")} className="rounded-lg border px-3 py-2 text-xs">Editar</button><button onClick={()=>remove(item,mode==="galeria"?"photo":"media")} className="rounded-lg border border-red-200 px-3 py-2 text-xs text-red-700">Eliminar</button></>}</div></article>)}</div>{!items.length&&<p className="rounded-xl border bg-white p-5 text-sm text-slate-500">Todavía no hay archivos en esta sección.</p>}</section>}
      {mode==="gestion"&&<section className="rounded-2xl border bg-white p-5"><h2 className="font-bold">Archivos oficiales cargados</h2><p className="mt-1 text-xs text-slate-500">Puedes cambiar el nombre o eliminar materiales desde la sección Medios.</p><button onClick={()=>router.push("/medios")} className="mt-3 rounded-lg border px-4 py-2 text-sm">Ver archivos</button></section>}
    </>}
  </div></main>;
}
