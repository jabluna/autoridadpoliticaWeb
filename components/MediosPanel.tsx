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
  const [permissionsOpen,setPermissionsOpen]=useState(false),[sidebarOpen,setSidebarOpen]=useState(false),[uploadProgress,setUploadProgress]=useState<number|null>(null);
  const [galleryModal,setGalleryModal]=useState(false),[galleryFiles,setGalleryFiles]=useState<File[]>([]),[galleryAlbumName,setGalleryAlbumName]=useState(""),[galleryBatch,setGalleryBatch]=useState(false),[galleryIndex,setGalleryIndex]=useState(0),[galleryTotal,setGalleryTotal]=useState(0),[selectedAlbum,setSelectedAlbum]=useState<string|null>(null),[creatorNames,setCreatorNames]=useState<Record<string,string>>({});
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
      if(mode==="galeria"){const a=await call("albums");setAlbums(a.items||[]);const ids=[...new Set((a.items||[]).map((x:Entry)=>x.creadoPor).filter(Boolean))] as string[];const names:Record<string,string>={};await Promise.all(ids.map(async uid=>{try{const d=await getDoc(doc(db,"usuarios",uid));if(d.exists()){const u=d.data();names[uid]=String(u.nombre||u.nombreCompleto||u.email||"Usuario");}}catch{}}));setCreatorNames(names);}
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
    setUploadProgress(0);
    try {
      const user=auth.currentUser;if(!user)throw Error("Inicia sesión.");
      const token=await user.getIdToken();
      await new Promise<void>((resolve,reject)=>{
        const xhr=new XMLHttpRequest();
        xhr.open("POST",endpoint);
        xhr.setRequestHeader("Authorization",`Bearer ${token}`);
        xhr.upload.onprogress=e=>{if(e.lengthComputable)setUploadProgress(Math.min(99,Math.round(e.loaded/e.total*100)));};
        xhr.onerror=()=>reject(Error("No se pudo conectar con el servidor."));
        xhr.onload=()=>{let data:{error?:string}={};try{data=JSON.parse(xhr.responseText);}catch{}if(xhr.status>=200&&xhr.status<300){setUploadProgress(100);resolve();}else reject(Error(data.error||"Error al subir el archivo"));};
        xhr.send(f);
      });
    }finally{setUploadProgress(null);}
    setName("");setFile(null);
    const input=document.getElementById("media-file") as HTMLInputElement|null;if(input)input.value="";
  });
  const sendPhoto=async(fileToSend:File,targetAlbum:string,index:number,total:number)=>{
    const user=auth.currentUser;if(!user)throw Error("Inicia sesión.");
    const optimized=await optimizePhoto(fileToSend);
    const f=form("photo");f.set("nombre",fileToSend.name.replace(/\.[^.]+$/,""));f.set("albumId",targetAlbum);f.set("file",optimized);
    setGalleryIndex(index);setGalleryTotal(total);setUploadProgress(0);
    await new Promise<void>((resolve,reject)=>{
      const xhr=new XMLHttpRequest();xhr.open("POST",endpoint);
      xhr.upload.onprogress=e=>{if(e.lengthComputable)setUploadProgress(Math.min(99,Math.round(e.loaded/e.total*100)));};
      xhr.onerror=()=>reject(Error("Falló la conexión al subir "+fileToSend.name));
      xhr.onload=()=>{let d:{error?:string}={};try{d=JSON.parse(xhr.responseText);}catch{}if(xhr.status>=200&&xhr.status<300){setUploadProgress(100);resolve();}else reject(Error(d.error||"No se pudo subir "+fileToSend.name));};
      void user.getIdToken().then(token=>{xhr.setRequestHeader("Authorization",`Bearer ${token}`);xhr.send(f);}).catch(reject);
    });
  };
  const uploadGallery=()=>mutate(async()=>{
    if(!galleryAlbumName.trim()||!galleryFiles.length)throw Error("Escribe el nombre del álbum y selecciona fotografías.");
    const f=form("album");f.set("nombre",galleryAlbumName.trim());const created=await call("","POST",f);
    if(!created.id)throw Error("No se pudo crear el álbum.");
    setSelectedAlbum(created.id);
    try{for(let i=0;i<galleryFiles.length;i++)await sendPhoto(galleryFiles[i],created.id,i+1,galleryFiles.length);}
    catch(e){throw Error((e instanceof Error?e.message:"Error")+"; el álbum se creó y puedes completar las fotos después.");}
    setGalleryModal(false);setGalleryFiles([]);setGalleryAlbumName("");setUploadProgress(null);
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
  const nav=[["Panel principal","/dashboard"],["Mi red","/mired"],["Invitaciones","/invitaciones"],["Configuración de campaña","/configuracion-campana"],["Autorizaciones y gestión","/medios/gestion"],["Medios","/medios"],["Galería","/medios/galeria"]];
  return <main className="min-h-screen bg-[#f4f7fb] text-slate-900">
    {sidebarOpen&&<button aria-label="Cerrar menú" onClick={()=>setSidebarOpen(false)} className="fixed inset-0 z-40 bg-black/50 lg:hidden"/>}
    <aside className={`fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col bg-gradient-to-b from-[#102f77] via-[#153f9a] to-[#071e52] text-white shadow-xl transition-transform lg:translate-x-0 ${sidebarOpen?"translate-x-0":"-translate-x-full"}`}><div className="flex h-20 items-center gap-3 border-b border-white/10 px-5"><div className="rounded-2xl bg-white p-3 font-black text-blue-900">AP</div><div><p className="font-bold">Autoridad Política</p><p className="text-xs text-blue-200">Gestión de campaña</p></div><button className="ml-auto lg:hidden" onClick={()=>setSidebarOpen(false)}>✕</button></div><nav className="flex-1 space-y-1 overflow-y-auto p-4">{nav.map(([label,href],i)=><div key={href}>{i===4&&<p className="mb-2 mt-5 px-3 text-xs font-bold uppercase tracking-wider text-blue-200">Medios</p>}<button onClick={()=>{setSidebarOpen(false);router.push(href)}} className={`w-full rounded-xl px-4 py-3 text-left text-sm ${href===(mode==="gestion"?"/medios/gestion":mode==="galeria"?"/medios/galeria":"/medios")?"bg-white font-bold text-blue-900":"text-white/80 hover:bg-white/10"}`}>{label}</button></div>)}</nav></aside>
    <div className="min-h-screen lg:ml-[280px]"><header className="sticky top-0 z-20 flex items-center gap-3 border-b bg-white px-5 py-4"><button onClick={()=>setSidebarOpen(true)} className="rounded-xl border px-3 py-2 lg:hidden">☰</button><div><p className="text-xs font-bold uppercase tracking-widest text-blue-700">Centro de medios</p><h1 className="text-xl font-black">{title}</h1></div></header><div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-8">
    <div className="rounded-3xl bg-gradient-to-r from-[#102f77] to-[#3167c5] p-6 text-white"><p className="text-xs uppercase tracking-widest text-blue-200">Comunicación y contenidos</p><h2 className="mt-2 text-2xl font-black">{title}</h2><p className="mt-2 text-sm text-blue-100">Publicaciones, archivos, permisos y galería de campaña.</p></div>
    <nav className="flex flex-wrap gap-2">{[["gestion","Autorizaciones y gestión"],["medios","Medios"],["galeria","Galería"]].map(([m,label])=><button key={m} onClick={()=>router.push(m==="medios"?"/medios":`/medios/${m}`)} className={`rounded-xl px-4 py-2 text-sm font-bold ${mode===m?"bg-blue-800 text-white":"border bg-white"}`}>{label}</button>)}</nav>
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-white p-5 shadow-sm"><label className="block text-sm font-bold">Selecciona la red o campaña<select value={scopeKey} onChange={e=>{setScopeKey(e.target.value);setItems([]);setAlbums([]);}} className="mt-2 block w-full min-w-[200px] max-w-lg rounded-xl border p-3 text-sm"><optgroup label="Medios de mi red">{scopes.filter(s=>!s.invitada).map(s=><option key={`${s.clienteId}:${s.campanaId}`} value={`${s.clienteId}:${s.campanaId}`}>{s.nombre}</option>)}</optgroup><optgroup label="Medios donde estoy invitado">{scopes.filter(s=>s.invitada).map(s=><option key={`${s.clienteId}:${s.campanaId}`} value={`${s.clienteId}:${s.campanaId}`}>{s.nombre}</option>)}</optgroup></select>{scope?.invitada&&<p className="mt-2 text-xs text-blue-700">Campaña vinculada como invitado: acceso de consulta.</p>}</label>{mode==="galeria"&&!scope?.invitada&&<button title="Crear álbum y subir fotografías" aria-label="Crear álbum y subir fotografías" onClick={()=>{setGalleryModal(true);setGalleryFiles([]);setGalleryAlbumName("");}} className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-blue-800 text-4xl font-light text-white shadow-lg transition hover:bg-blue-900">+</button>}</div>
    {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}{notice&&<p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}
    {!scope?<p className="rounded-xl border bg-white p-5">No hay campañas disponibles.</p>:<>
      {mode==="gestion"&&<section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-xl font-black">Autorizaciones de publicación</h2><p className="mt-1 text-sm text-slate-500">Controla qué líderes pueden publicar en tu campaña.</p></div>{owner&&<button onClick={()=>setPermissionsOpen(true)} className="rounded-xl bg-blue-800 px-5 py-3 text-sm font-bold text-white">Gestionar permisos →</button>}</div><div className="mt-6 grid grid-cols-3 gap-3">{[["Líderes",leaders.length],["Autorizados",leaders.filter(l=>authorized.includes(l.uid)).length],["Pendientes",leaders.filter(l=>!authorized.includes(l.uid)).length]].map(([label,value])=><div key={String(label)} className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-2xl font-black">{value}</p></div>)}</div>{!owner&&<p className="mt-4 text-sm text-slate-500">Solo el propietario puede administrar los permisos.</p>}</section>}
      {permissionsOpen&&owner&&<div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-3" onMouseDown={e=>{if(e.target===e.currentTarget)setPermissionsOpen(false)}}><section role="dialog" aria-modal="true" aria-label="Gestionar permisos" className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"><div className="flex items-center justify-between border-b p-5"><div><h2 className="text-xl font-black">Permisos de publicación</h2><p className="text-xs text-slate-500">Autoriza o revoca el acceso de tus líderes.</p></div><button aria-label="Cerrar" onClick={()=>setPermissionsOpen(false)} className="rounded-xl bg-slate-100 px-3 py-2">✕</button></div><div className="flex gap-2 border-b p-4"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar nombre o correo" className="min-w-0 flex-1 rounded-xl border p-3 text-sm"/><input type="number" min="1" value={level} onChange={e=>setLevel(e.target.value)} placeholder="Nivel" className="w-24 rounded-xl border p-3 text-sm"/></div><div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">{filtered.map(l=><div key={l.id} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-4"><div className="min-w-0"><p className="truncate text-sm font-bold">{l.nombre}</p><p className="truncate text-xs text-slate-500">{l.email} · Nivel {l.nivel}</p></div><button disabled={busy||!l.uid} onClick={()=>changeAuth(l,!authorized.includes(l.uid))} className={`shrink-0 rounded-xl px-3 py-2 text-xs font-bold disabled:opacity-50 ${authorized.includes(l.uid)?"bg-emerald-100 text-emerald-800":"bg-blue-800 text-white"}`}>{authorized.includes(l.uid)?"✓ Autorizado":"Autorizar"}</button></div>)}{!filtered.length&&<p className="py-10 text-center text-sm text-slate-500">Sin resultados.</p>}</div><div className="flex justify-between border-t p-4"><span className="text-xs text-slate-500">{filtered.length} líderes</span><button onClick={()=>setPermissionsOpen(false)} className="rounded-xl bg-slate-900 px-5 py-2 text-sm font-bold text-white">Cerrar</button></div></section></div>}
      {galleryModal&&mode==="galeria"&&<div className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-950/60 p-3"><section role="dialog" aria-modal="true" aria-label="Crear álbum" className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl"><div className="flex items-center justify-between"><h2 className="text-xl font-black">Nuevo álbum fotográfico</h2><button disabled={busy} onClick={()=>setGalleryModal(false)} className="rounded-xl bg-slate-100 px-3 py-2">✕</button></div><p className="mt-2 text-sm text-slate-500">Selecciona cómo deseas cargar tus fotografías.</p><div className="mt-5 grid grid-cols-2 gap-3"><button disabled={busy} onClick={()=>{setGalleryBatch(false);setGalleryFiles([])}} className={`rounded-2xl border-2 p-5 text-center ${!galleryBatch?"border-blue-700 bg-blue-50":"border-slate-200"}`}><span className="block text-3xl">▧</span><span className="mt-2 block text-sm font-bold">Una foto</span></button><button disabled={busy} onClick={()=>{setGalleryBatch(true);setGalleryFiles([])}} className={`rounded-2xl border-2 p-5 text-center ${galleryBatch?"border-blue-700 bg-blue-50":"border-slate-200"}`}><span className="block text-3xl">▦</span><span className="mt-2 block text-sm font-bold">Varias fotos en lote</span></button></div><label className="mt-5 block text-sm font-bold">Nombre del álbum<input disabled={busy} value={galleryAlbumName} onChange={e=>setGalleryAlbumName(e.target.value)} placeholder="Ej. Reunión comunitaria" className="mt-2 w-full rounded-xl border p-3 font-normal"/></label><label className="mt-4 block text-sm font-bold">Fotografías<input key={String(galleryBatch)} disabled={busy} type="file" accept="image/*" multiple={galleryBatch} onChange={e=>setGalleryFiles(Array.from(e.target.files||[]))} className="mt-2 block w-full rounded-xl border p-3 text-sm font-normal"/></label><p className="mt-2 text-xs text-slate-500">{galleryFiles.length} foto(s) seleccionada(s). Se optimizarán a un máximo de 500 KB por foto.</p>{busy&&galleryTotal>0&&<div role="status" className="mt-4"><div className="flex justify-between text-xs font-bold text-blue-800"><span>Subiendo foto {galleryIndex} de {galleryTotal}</span><span>{uploadProgress??0}%</span></div><div className="mt-2 h-3 overflow-hidden rounded-full bg-blue-100"><div className="h-full bg-blue-700 transition-all" style={{width:`${uploadProgress??0}%`}}/></div></div>}<div className="mt-6 flex justify-end gap-3"><button disabled={busy} onClick={()=>setGalleryModal(false)} className="rounded-xl border px-4 py-3 text-sm">Cancelar</button><button disabled={busy||!galleryAlbumName.trim()||!galleryFiles.length} onClick={uploadGallery} className="rounded-xl bg-blue-800 px-5 py-3 text-sm font-bold text-white disabled:opacity-40">{busy?"Cargando fotografías…":"Crear álbum y subir"}</button></div></section></div>}
      {mode==="gestion"&&canManage&&<section className="rounded-2xl border bg-white p-5"><h2 className="font-bold">{false?"Crear álbum o subir fotografías":"Subir material de campaña"}</h2>{false&&<div className="mt-3 flex flex-wrap gap-2"><input value={name} onChange={e=>setName(e.target.value)} placeholder="Nombre del álbum o foto" className="min-w-0 flex-1 rounded-xl border p-3 text-sm"/><button disabled={busy} onClick={createAlbum} className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-bold text-white">Crear álbum</button></div>}{true&&<input value={name} onChange={e=>setName(e.target.value)} placeholder="Nombre del material" className="mt-3 w-full max-w-md rounded-xl border p-3 text-sm"/>}{false&&<select value={albumId} onChange={e=>setAlbumId(e.target.value)} className="mt-3 w-full max-w-md rounded-xl border p-3 text-sm"><option value="">Selecciona álbum</option>{albums.map(a=><option key={a.id} value={a.id}>{a.nombre}</option>)}</select>}<div className="mt-3 flex flex-wrap items-center gap-3"><input id="media-file" type="file" accept={false?"image/*":undefined} onChange={e=>setFile(e.target.files?.[0]||null)} className="max-w-full text-sm"/><button disabled={busy||!file||!name.trim()||(false&&!albumId)} onClick={upload} className="rounded-xl bg-blue-800 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40">{uploadProgress!==null?`Subiendo ${uploadProgress}%`:busy?"Procesando…":"Subir archivo"}</button></div>{uploadProgress!==null&&<div role="status" className="mt-4"><div className="flex justify-between text-xs font-bold text-blue-800"><span>Subiendo archivo…</span><span>{uploadProgress}%</span></div><div className="mt-2 h-2.5 overflow-hidden rounded-full bg-blue-100"><div className="h-full bg-blue-700 transition-all" style={{width:`${uploadProgress}%`}}/></div></div>}<p className="mt-2 text-xs text-slate-500">{false?"Las fotos se comprimen automáticamente a WebP de máximo 500 KB.":"Archivos de cualquier formato, máximo 20 MB por archivo."}</p></section>}
      {mode==="galeria"&&<section className="space-y-4"><div className="flex items-center justify-between"><h2 className="text-lg font-black">{selectedAlbum?"Fotografías del álbum":"Álbumes fotográficos"}</h2>{selectedAlbum&&<button onClick={()=>setSelectedAlbum(null)} className="rounded-xl border bg-white px-4 py-2 text-sm font-bold">← Volver a álbumes</button>}</div>{!selectedAlbum&&<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{albums.map(a=><article key={a.id} className="overflow-hidden rounded-3xl border bg-white shadow-sm"><button onClick={()=>setSelectedAlbum(a.id)} className="flex h-40 w-full items-center justify-center bg-gradient-to-br from-blue-100 to-indigo-200 text-6xl text-blue-800">▧</button><div className="p-5"><button onClick={()=>setSelectedAlbum(a.id)} className="text-left text-lg font-black hover:text-blue-700">{a.nombre}</button><p className="mt-1 text-xs text-slate-500">Creado por: {creatorNames[a.creadoPor||""]||"Usuario de la campaña"}</p><p className="mt-1 text-xs text-slate-500">{date(a.creadoEn)} · {items.filter(i=>i.albumId===a.id).length} fotos</p><div className="mt-4 flex flex-wrap gap-2"><button onClick={()=>setSelectedAlbum(a.id)} className="rounded-xl bg-blue-800 px-4 py-2 text-xs font-bold text-white">Abrir álbum</button>{canManage&&<><button onClick={()=>edit(a,"album")} className="rounded-xl border px-3 py-2 text-xs">Editar</button><button onClick={()=>remove(a,"album")} className="rounded-xl border border-red-200 px-3 py-2 text-xs text-red-700">Eliminar</button></>}</div></div></article>)}</div>}{!selectedAlbum&&!albums.length&&<p className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500">Aún no hay álbumes. Pulsa + para crear el primero.</p>}</section>}
      {(mode==="medios"||(mode==="galeria"&&selectedAlbum))&&<section className="space-y-3"><h2 className="text-lg font-bold">{mode==="galeria"?"Fotografías":"Archivos disponibles"} ({mode==="galeria"?items.filter(i=>i.albumId===selectedAlbum).length:items.length})</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{items.filter(i=>mode!=="galeria"||i.albumId===selectedAlbum).map(item=><article key={item.id} className="rounded-2xl border bg-white p-4">{mode==="galeria"&&scope&&<PhotoPreview scope={scope} item={item}/>}<div className="flex items-center gap-3"><span className="text-2xl">{mode==="galeria"?"▧":"📄"}</span><div className="min-w-0"><h3 className="truncate font-bold" title={item.nombre}>{item.nombre}</h3><p className="text-xs text-slate-500">{date(item.creadoEn)} · {item.bytes?Math.round(item.bytes/1024)+" KB":""}</p></div></div><div className="mt-4 flex flex-wrap gap-2"><button onClick={()=>void open(item,mode==="galeria")} className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-bold text-white">{mode==="galeria"?"Ver / descargar":"Descargar"}</button>{mode==="galeria"&&<button onClick={()=>void open(item,true,true)} className="rounded-lg border px-3 py-2 text-xs">Compartir WhatsApp</button>}{mode==="galeria"&&<button onClick={()=>void (async()=>{try{const d=await call("download","GET",undefined,`&collection=photos&id=${encodeURIComponent(item.id)}`);await navigator.clipboard.writeText(d.url);setNotice("Enlace temporal copiado (válido 10 minutos).");}catch(e){setError(e instanceof Error?e.message:"No se pudo copiar");}})()} className="rounded-lg border px-3 py-2 text-xs">Copiar enlace</button>}{canManage&&<><button onClick={()=>edit(item,mode==="galeria"?"photo":"media")} className="rounded-lg border px-3 py-2 text-xs">Editar</button><button onClick={()=>remove(item,mode==="galeria"?"photo":"media")} className="rounded-lg border border-red-200 px-3 py-2 text-xs text-red-700">Eliminar</button></>}</div></article>)}</div>{!items.length&&<p className="rounded-xl border bg-white p-5 text-sm text-slate-500">Todavía no hay archivos en esta sección.</p>}</section>}
      {mode==="gestion"&&<section className="rounded-2xl border bg-white p-5"><h2 className="font-bold">Archivos oficiales cargados</h2><p className="mt-1 text-xs text-slate-500">Puedes cambiar el nombre o eliminar materiales desde la sección Medios.</p><button onClick={()=>router.push("/medios")} className="mt-3 rounded-lg border px-4 py-2 text-sm">Ver archivos</button></section>}
    </>}
  </div></div></main>;
}
