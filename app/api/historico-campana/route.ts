import {NextRequest,NextResponse} from "next/server";
import {applicationDefault,getApps,initializeApp} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";
import {getFirestore,FieldValue} from "firebase-admin/firestore";
export const runtime="nodejs";
const app=()=>getApps()[0]??initializeApp({credential:applicationDefault(),projectId:"autoridadpolitica"});
const db=()=>getFirestore(app());
const error=(message:string,status=403)=>NextResponse.json({error:message},{status});
function weekKey(date:Date){const d=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()));const day=d.getUTCDay()||7;d.setUTCDate(d.getUTCDate()+4-day);const year=d.getUTCFullYear();const start=new Date(Date.UTC(year,0,1));const week=Math.ceil((((d.getTime()-start.getTime())/86400000)+1)/7);return year+"-S"+String(week).padStart(2,"0");}
async function access(req:NextRequest){
 const bearer=req.headers.get("authorization")||"";if(!bearer.startsWith("Bearer "))throw Error("Sesión requerida");
 const token=await getAuth(app()).verifyIdToken(bearer.slice(7),true);
 const user=await db().doc("usuarios/"+token.uid).get();
 if(!user.exists||user.get("rol")!=="cliente_admin"||user.get("estado")==="inactivo")throw Error("Solo el propietario de campaña puede consultar este histórico");
 const id=String(user.get("clienteId")||"").trim();if(!id||id.length>150||id.includes("/")||id==="."||id===".."||id.includes("\\0"))throw Error("Identificador de cliente inválido");
 const client=await db().collection("clientes").doc(id).get();if(!client.exists||client.get("estado")==="inactivo")throw Error("Cliente inactivo");
 return id;
}
export async function GET(req:NextRequest){
 try{const id=await access(req);const snap=await db().collection("clientes").doc(id).collection("historicoCampana").orderBy("semana","asc").limit(156).get();
 return NextResponse.json({items:snap.docs.map(d=>({id:d.id,...d.data(),registradoEn:d.get("registradoEn")?.toDate?.()?.toISOString?.()||null})),semanaActual:weekKey(new Date())});}
 catch(e){return error(e instanceof Error?e.message:"Error de acceso");}
}
export async function POST(req:NextRequest){
 try{
 const id=await access(req);const today=new Date();const semana=weekKey(today);
 const clientRef=db().collection("clientes").doc(id);const target=clientRef.collection("historicoCampana").doc(semana);
 const camps=await clientRef.collection("campanas").get();
 let lideres=0,integrantes=0,estimado=0,aporte=0,meta=0,actividad=0,actividadConFecha=0;
 const start=new Date(today);start.setUTCDate(start.getUTCDate()-7);
 for(const camp of camps.docs){
  const data=camp.data();if(data.estado==="activa")meta+=Math.max(0,Number(data.metaVotos)||0);
  const base=camp.ref;const nodes=await base.collection("nodos").get();
  const active=nodes.docs.filter(n=>n.get("estado")!=="inactivo");lideres+=active.length;
  for(const node of active){
   const n=node.data();const manual=Math.max(0,Number(n.estimacionVotos)||0);
   estimado+=manual;aporte+=n.multinodo===false?Math.max(1,manual):1;
   const raw=n.ultimaActividadEn||n.ultimaActividad||n.actualizadoEn||n.updatedAt;
   if(raw){const date=raw.toDate?.()??new Date(raw);if(!Number.isNaN(date.getTime())){actividadConFecha++;if(date>=start&&date<=today)actividad++;}}
   const people=await node.ref.collection("personas").count().get();integrantes+=people.data().count;
  }
  const root=await base.collection("personasRaiz").count().get();integrantes+=root.data().count;
 }
 // El documento de la semana actual se actualiza; las semanas cerradas permanecen intactas.
 await target.set({semana,fechaCorte:today.toISOString(),lideres,integrantes,estimadoManual:estimado,aporteCalculado:aporte,metaElectoral:meta,lideresConActividad:actividad,lideresConFechaActividad:actividadConFecha,registradoEn:FieldValue.serverTimestamp(),version:1});
 return NextResponse.json({ok:true,semana});
 }catch(e){return error(e instanceof Error?e.message:"No se pudo guardar el corte");}
}
