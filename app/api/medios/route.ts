import { NextRequest, NextResponse } from "next/server";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
const app = () => getApps()[0] ?? initializeApp({ credential: applicationDefault(), projectId: "autoridadpolitica", storageBucket: "autoridadpolitica.firebasestorage.app" });
const db = () => getFirestore(app());
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });
type Context = { uid: string; clienteId: string; campanaId: string; owner: boolean; canManage: boolean; nodoId: string };
async function identify(req: NextRequest) {
  const bearer = req.headers.get("authorization") || "";
  if (!bearer.startsWith("Bearer ")) throw Error("Autenticación requerida");
  const token = await getAuth(app()).verifyIdToken(bearer.slice(7), true);
  const user = await db().doc(`usuarios/${token.uid}`).get();
  if (!user.exists || user.get("estado") === "inactivo") throw Error("Usuario no autorizado");
  return { uid: token.uid, user };
}
async function context(req: NextRequest, campanaId: string, clienteId: string): Promise<Context> {
  if (!/^[\w-]{1,150}$/.test(campanaId) || !/^[\w-]{1,150}$/.test(clienteId)) throw Error("Identificador inválido");
  const { uid, user } = await identify(req);
  const own = user.get("clienteId") === clienteId && (user.get("rol") === "cliente_admin" || (user.get("rol") === "red_usuario" && user.get("campanaId") === campanaId));
  const isOwner = own && user.get("rol") === "cliente_admin";
  let invited = false;
  if (!own && user.get("rol") === "cliente_admin") {
    const links = await db().collection("vinculacionesCampana").where("propietarioUid", "==", uid).where("clienteReceptorId", "==", clienteId).limit(100).get();
    invited = links.docs.some(d => d.get("estado") === "activa" && d.get("campanaReceptoraId") === campanaId);
  }
  if (!own && !invited) throw Error("No perteneces a esta campaña");
  const [campaign, client] = await Promise.all([db().doc(`clientes/${clienteId}/campanas/${campanaId}`).get(), db().doc(`clientes/${clienteId}`).get()]);
  if (!campaign.exists || !client.exists || client.get("estado") === "inactivo") throw Error("Campaña no disponible");
  const authorization = own && !isOwner ? await db().doc(`clientes/${clienteId}/campanas/${campanaId}/autorizacionesMedios/${uid}`).get() : null;
  return { uid, clienteId, campanaId, owner: isOwner, canManage: isOwner || Boolean(authorization?.exists && authorization.get("activo") === true), nodoId: own ? String(user.get("nodoId") || "") : "" };
}
const base = (c: Context) => db().collection("clientes").doc(c.clienteId).collection("campanas").doc(c.campanaId);
const safe = (doc: FirebaseFirestore.QueryDocumentSnapshot) => ({ id: doc.id, ...doc.data(), creadoEn: doc.get("creadoEn")?.toDate?.()?.toISOString?.() || null });
const clean = (v: unknown, max = 150) => String(v || "").trim().slice(0, max);
function parseScope(req: NextRequest) {
  return { clienteId: req.nextUrl.searchParams.get("clienteId") || "", campanaId: req.nextUrl.searchParams.get("campanaId") || "" };
}
export async function GET(req: NextRequest) {
  try {
    const c = await context(req, parseScope(req).campanaId, parseScope(req).clienteId);
    const type = req.nextUrl.searchParams.get("type") || "media";
    if (type === "download") {
      const collectionName = req.nextUrl.searchParams.get("collection") === "photos" ? "fotosMedios" : "archivosMedios";
      const id = req.nextUrl.searchParams.get("id") || "";
      if (!/^[\\w-]{1,150}$/.test(id)) return fail("Archivo inválido");
      const record = await base(c).collection(collectionName).doc(id).get();
      if (!record.exists || !record.get("storagePath")) return fail("Archivo no encontrado",404);
      const [url] = await getStorage(app()).bucket().file(record.get("storagePath")).getSignedUrl({
        action:"read",expires:Date.now()+10*60*1000
      });
      return NextResponse.json({url, nombre:record.get("nombreOriginal")||record.get("nombre")});
    }
    if (type === "leaders") {
      if (!c.owner) return fail("Solo nivel 1 administra autorizaciones", 403);
      const nodes = await base(c).collection("nodos").limit(500).get();
      const leaders = nodes.docs.filter(d => d.get("estado") !== "inactivo").map(d => ({ id:d.id, uid:d.get("uid"), nombre:[d.get("nombre"),d.get("apellido")].filter(Boolean).join(" "), email:d.get("email")||"", nivel:Number(d.get("nivel")||2) }));
      const auths = await base(c).collection("autorizacionesMedios").get();
      return NextResponse.json({ leaders, autorizaciones:auths.docs.filter(d=>d.get("activo")===true).map(d=>({uid:d.id,...d.data()})) });
    }
    if (type === "permissions") return NextResponse.json({ canManage:c.canManage, owner:c.owner });
    if (!["media","albums","photos"].includes(type)) return fail("Consulta inválida");
    const collectionName = type === "media" ? "archivosMedios" : type === "albums" ? "albumesMedios" : "fotosMedios";
    const snap = await base(c).collection(collectionName).orderBy("creadoEn","desc").limit(200).get();
    return NextResponse.json({ items:snap.docs.map(safe), canManage:c.canManage, owner:c.owner });
  } catch(e) { return fail(e instanceof Error?e.message:"Error",403); }
}
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const clienteId=clean(form.get("clienteId")), campanaId=clean(form.get("campanaId"));
    const c=await context(req,campanaId,clienteId);
    const type=clean(form.get("type"));
    if (type==="album") {
      if (!c.canManage && !c.nodoId) return fail("No puedes crear álbumes",403);
      const name=clean(form.get("nombre")); if (!name) return fail("Nombre requerido");
      const ref=base(c).collection("albumesMedios").doc();
      await ref.set({ nombre:name, descripcion:clean(form.get("descripcion"),500), creadoPor:c.uid, creadoEn:FieldValue.serverTimestamp() });
      return NextResponse.json({id:ref.id});
    }
    if (type==="authorization") {
      if (!c.owner) return fail("Solo nivel 1 puede autorizar",403);
      const uid=clean(form.get("uid")); const nodeId=clean(form.get("nodoId")); const active=form.get("activo")==="true";
      const node=await base(c).collection("nodos").doc(nodeId).get();
      if (!node.exists || node.get("uid")!==uid || node.get("estado")==="inactivo") return fail("El líder no pertenece a la red",403);
      await base(c).collection("autorizacionesMedios").doc(uid).set({activo:active,nodoId,nombre:[node.get("nombre"),node.get("apellido")].filter(Boolean).join(" "),email:node.get("email")||"",actualizadoPor:c.uid,actualizadoEn:FieldValue.serverTimestamp()});
      return NextResponse.json({ok:true});
    }
    if (type!=="media" && type!=="photo") return fail("Tipo inválido");
    if (type==="media" && !c.canManage) return fail("No tienes permiso para gestionar medios",403);
    if (type==="photo" && !c.canManage && !c.nodoId) return fail("No perteneces a la red activa",403);
    const name=clean(form.get("nombre")); const file=form.get("file");
    if (!(file instanceof File) || !name) return fail("Nombre y archivo requeridos");
    const limit=type==="photo"?500*1024:20*1024*1024;
    if (!file.size || file.size>limit) return fail(type==="photo"?"La foto debe pesar máximo 500 KB":"Archivo máximo de 20 MB");
    if (type==="photo" && !["image/jpeg","image/webp","image/png"].includes(file.type)) return fail("Formato de imagen inválido");
    const albumId=clean(form.get("albumId"));
    if (type==="photo" && (!albumId || !(await base(c).collection("albumesMedios").doc(albumId).get()).exists)) return fail("Álbum inválido");
    const collectionName=type==="photo"?"fotosMedios":"archivosMedios";
    const ref=base(c).collection(collectionName).doc();
    const ext=clean(file.name.split(".").pop(),12).replace(/[^a-z0-9]/gi,"")||"bin";
    const storagePath=`medios/${clienteId}/${campanaId}/${collectionName}/${ref.id}.${ext}`;
    const bucket=getStorage(app()).bucket();
    await bucket.file(storagePath).save(Buffer.from(await file.arrayBuffer()),{contentType:file.type||"application/octet-stream",resumable:false,metadata:{cacheControl:"private, max-age=0"}});
    await ref.set({nombre:name,nombreOriginal:clean(file.name,250),tipo:file.type||"application/octet-stream",bytes:file.size,storagePath,albumId:type==="photo"?albumId:null,creadoPor:c.uid,creadoEn:FieldValue.serverTimestamp()});
    return NextResponse.json({id:ref.id});
  } catch(e) { return fail(e instanceof Error?e.message:"Error",403); }
}
export async function PATCH(req: NextRequest) {
  try {
    const body=await req.json();const c=await context(req,clean(body.campanaId),clean(body.clienteId));
    const type=clean(body.type);const coll=type==="media"?"archivosMedios":type==="album"?"albumesMedios":type==="photo"?"fotosMedios":"";
    if (!coll) return fail("Tipo inválido");
    const ref=base(c).collection(coll).doc(clean(body.id));const snap=await ref.get();
    if (!snap.exists) return fail("No encontrado",404);
    if (!c.canManage) return fail("Solo autorizados pueden editar",403);
    const nombre=clean(body.nombre);if (!nombre) return fail("Nombre requerido");
    await ref.update({nombre,actualizadoPor:c.uid,actualizadoEn:FieldValue.serverTimestamp()});
    return NextResponse.json({ok:true});
  }catch(e){return fail(e instanceof Error?e.message:"Error",403)}
}
export async function DELETE(req: NextRequest) {
  try {
    const body=await req.json();const c=await context(req,clean(body.campanaId),clean(body.clienteId));
    if (!c.canManage) return fail("Solo autorizados pueden eliminar",403);
    const type=clean(body.type), coll=type==="media"?"archivosMedios":type==="album"?"albumesMedios":type==="photo"?"fotosMedios":"";
    if (!coll) return fail("Tipo inválido");
    const ref=base(c).collection(coll).doc(clean(body.id));const snap=await ref.get();
    if (!snap.exists) return fail("No encontrado",404);
    if (type==="album") {
      const photos=await base(c).collection("fotosMedios").where("albumId","==",ref.id).limit(1).get();
      if (!photos.empty) return fail("El álbum tiene fotos. Elimínalas primero.",409);
    }
    if (snap.get("storagePath")) await getStorage(app()).bucket().file(snap.get("storagePath")).delete({ignoreNotFound:true});
    await ref.delete();return NextResponse.json({ok:true});
  }catch(e){return fail(e instanceof Error?e.message:"Error",403)}
}
