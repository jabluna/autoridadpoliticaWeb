import { NextRequest, NextResponse } from "next/server";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { randomBytes } from "node:crypto";

export const runtime = "nodejs";
const categories = ["alcaldia", "gobernacion", "presidencia", "senado", "camara", "concejo", "asamblea", "jal"] as const;
type Category = typeof categories[number];
const normalize = (value: unknown) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
function categoryOf(value: unknown): Category | null {
  const raw = normalize(value);
  if (raw.includes("alcald")) return "alcaldia";
  if (raw.includes("gobern")) return "gobernacion";
  if (raw.includes("presiden")) return "presidencia";
  if (raw.includes("senad")) return "senado";
  if (raw.includes("camara") || raw.includes("representante")) return "camara";
  if (raw.includes("concejo") || raw.includes("concejal")) return "concejo";
  if (raw.includes("asamblea") || raw.includes("diputad")) return "asamblea";
  if (raw.includes("jal") || raw.includes("edil")) return "jal";
  return null;
}
async function context(request: NextRequest) {
  const header = request.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ")) return null;
  const app = getApps()[0] ?? initializeApp({ credential: applicationDefault(), projectId: "autoridadpolitica" });
  const auth = getAuth(app), db = getFirestore(app);
  const token = await auth.verifyIdToken(header.slice(7), true);
  if (!token.email_verified || !token.email) return null;
  const user = await db.doc(`usuarios/${token.uid}`).get();
  if (!user.exists || user.get("estado") === "inactivo") return null;
  return { uid: token.uid, email: token.email.toLowerCase(), user, db };
}
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
export async function GET(request: NextRequest) {
  try {
    const ctx = await context(request);
    if (!ctx) return fail("Inicia sesión con un correo verificado.", 401);
    const term = String(request.nextUrl.searchParams.get("buscar") || "").trim();
    if (term) {
      if (ctx.user.get("rol") !== "cliente_admin") return fail("Solo el propietario puede buscar cuentas para invitar.",403);
      if (term.length < 3 || term.length > 100) return fail("Escribe entre 3 y 100 caracteres.",400);
      const normalized = normalize(term);
      const digits = term.replace(/\D/g,"");
      const candidates = new Map<string,FirebaseFirestore.QueryDocumentSnapshot>();
      const add = (snap: FirebaseFirestore.QuerySnapshot) => snap.docs.forEach(d => candidates.set(d.id,d));
      const searches: Promise<FirebaseFirestore.QuerySnapshot>[] = [];
      if (term.includes("@")) searches.push(ctx.db.collection("clientes").where("email","==",term.toLowerCase()).limit(10).get());
      if (digits.length >= 7) for (const phone of new Set([digits,digits.startsWith("57")?digits.slice(2):`57${digits}`,`+${digits.startsWith("57")?digits:`57${digits}`}`])) searches.push(ctx.db.collection("clientes").where("telefono","==",phone).limit(10).get());
      // Búsqueda por nombre visible. No se exponen datos de redes ni cuentas de acceso.
      searches.push(ctx.db.collection("clientes").orderBy("nombreCliente").startAt(term).endAt(term+"\uf8ff").limit(20).get());
      for (const result of await Promise.all(searches)) add(result);
      const filtered = [...candidates.values()].filter(d => d.get("estado") !== "inactivo" && d.get("planActivo") !== false && d.id !== ctx.user.get("clienteId") && d.get("authUid"));
      const users = await Promise.all(filtered.slice(0,20).map(async d => ({d,u:await ctx.db.doc(`usuarios/${d.get("authUid")}`).get()})));
      const resultados = users.filter(({d,u}) => u.exists && u.get("rol") === "cliente_admin" && u.get("estado") !== "inactivo" && u.get("clienteId") === d.id).map(({d,u}) => ({id:d.id,nombre:String(d.get("nombreCliente") || [u.get("nombre"),u.get("apellido")].filter(Boolean).join(" ") || "Cliente"),telefono:String(d.get("telefono")||""),correo:String(d.get("email")||"")}));
      return NextResponse.json({resultados},{headers:{"Cache-Control":"no-store"}});
    }
    const snap = await ctx.db.collection("invitacionesRed").where("destinatarioUid", "==", ctx.uid).limit(100).get();
    const now = Date.now();
    return NextResponse.json({ invitaciones: snap.docs.map(d => {
      const x = d.data(), expired = x.expiraEn?.toMillis?.() < now;
      return { id: d.id, campanaNombre: x.campanaNombre, clienteId: x.clienteId, campanaId: x.campanaId, categoria: x.categoria, estado: expired && x.estado === "pendiente" ? "expirada" : x.estado, emisorNombre: x.emisorNombre, expiraEn: x.expiraEn?.toDate?.()?.toISOString?.(), aceptadaEn: x.respondidaEn?.toDate?.()?.toISOString?.(), retiradaEn: x.retiradaEn?.toDate?.()?.toISOString?.() };
    }) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { console.error("Invitaciones GET", error); return fail("No fue posible consultar las invitaciones.", 503); }
}
export async function POST(request: NextRequest) {
  try {
    const ctx = await context(request);
    if (!ctx) return fail("Inicia sesión con un correo verificado.", 401);
    if (ctx.user.get("rol") !== "cliente_admin") return fail("Solo el administrador de campaña puede invitar en esta etapa.", 403);
    const clienteId = String(ctx.user.get("clienteId") || "");
    const body = await request.json() as Record<string, unknown>;
    const campanaId = body?.campanaId, phone = String(body?.telefono || "").replace(/[^0-9]/g, ""), destinatarioClienteId = String(body?.destinatarioClienteId || "");
    if (typeof campanaId !== "string" || !/^[a-zA-Z0-9_-]{1,150}$/.test(campanaId) || (!destinatarioClienteId && (phone.length < 10 || phone.length > 15))) return fail("Campaña o número de WhatsApp inválido.", 400);
    const localPhone = phone.startsWith("57") && phone.length === 12 ? phone.slice(2) : phone;
    const candidates = [...new Set([phone, localPhone, `57${localPhone}`, `+57${localPhone}`])];
    const found = await Promise.all(candidates.map(telefono => ctx.db.collection("clientes").where("telefono", "==", telefono).limit(3).get()));
    const matched = new Map(found.flatMap(s => s.docs).map(d => [d.id, d]));
    if (destinatarioClienteId) {
      if (!/^[a-zA-Z0-9_-]{1,150}$/.test(destinatarioClienteId)) return fail("Destinatario inválido.",400);
      const selected = await ctx.db.doc(`clientes/${destinatarioClienteId}`).get();
      matched.clear();
      if (selected.exists) matched.set(selected.id,selected as FirebaseFirestore.QueryDocumentSnapshot);
    }
    if (matched.size !== 1) return fail("No se encontró un único cliente registrado con ese número de WhatsApp.", 404);
    const recipient = [...matched.values()][0];
    if (recipient.get("estado") === "inactivo" || recipient.get("planActivo") === false) return fail("El destinatario no tiene un cliente activo.", 403);
    const recipientUid = String(recipient.get("authUid") || "");
    if (!recipientUid || recipientUid === ctx.uid) return fail("El destinatario debe tener una cuenta de cliente independiente.", 422);
    const recipientUser = await ctx.db.doc(`usuarios/${recipientUid}`).get();
    if (!recipientUser.exists || recipientUser.get("rol") !== "cliente_admin" || recipientUser.get("clienteId") !== recipient.id || recipientUser.get("estado") === "inactivo") return fail("No se pudo verificar la cuenta del destinatario.", 422);
    const email = normalize(recipient.get("email"));
    const [client, campaign] = await Promise.all([ctx.db.doc(`clientes/${clienteId}`).get(), ctx.db.doc(`clientes/${clienteId}/campanas/${campanaId}`).get()]);
    if (!client.exists || client.get("planActivo") === false || client.get("estado") === "inactivo" || !campaign.exists) return fail("Campaña no disponible.", 403);
    const category = categoryOf(campaign.get("corporacion") || campaign.get("cargoAspirado") || campaign.get("cargo") || campaign.get("tipoCampana") || client.get("corporacion") || client.get("cargoAspirado"));
    if (!category) return fail("Configura el cargo electoral de la campaña antes de invitar.", 422);
    const id = randomBytes(24).toString("hex");
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await ctx.db.doc(`invitacionesRed/${id}`).create({
      emisorUid: ctx.uid, emisorNombre: String(ctx.user.get("nombre") || client.get("nombreCliente") || "Administrador"),
      destinatarioEmail: email, destinatarioUid: recipientUid, destinatarioTelefono: String(recipient.get("telefono") || phone), clienteId, campanaId, campanaNombre: String(campaign.get("nombreCampana") || client.get("nombreCampana") || "Campaña"),
      categoria: category, estado: "pendiente", accesoCompartido: false,
      creadoEn: FieldValue.serverTimestamp(), expiraEn: expires,
    });
    return NextResponse.json({ id, expiraEn: expires.toISOString(), categoria: category, telefono: String(recipient.get("telefono") || phone) }, { status: 201 });
  } catch (error) { console.error("Invitaciones POST", error); return fail("No fue posible crear la invitación.", 503); }
}
// La copia se almacena bajo el ID de la invitación; no se consulta la red viva tras el retiro.
async function congelarRed(db: ReturnType<typeof getFirestore>, id: string, clienteId: string, categoria: string) {
  const archive = db.doc(`historicosRedesVinculadas/${id}`);
  const existing = await archive.get();
  if (existing.exists && existing.get("estado") === "listo") return;
  const campaigns = await db.collection(`clientes/${clienteId}/campanas`).get();
  const matching = campaigns.docs.filter(d => categoryOf(d.get("corporacion") || d.get("cargoAspirado") || d.get("cargo") || d.get("tipoCampana")) === categoria);
  const source = matching.length === 1 ? matching[0] : campaigns.docs.length === 1 ? campaigns.docs[0] : null;
  if (!source) throw new Error("No se pudo identificar una única campaña de origen para congelar el histórico.");
  const base = `clientes/${clienteId}/campanas/${source.id}`;
  const nodes = await db.collection(`${base}/nodos`).get();
  const rootPeople = await db.collection(`${base}/personasRaiz`).get();
  const meetings = await db.collection(`${base}/reuniones`).get();
  const records: Array<{ tipo: string; id: string; responsableId?: string; datos: Record<string, unknown> }> = [];
  const clean = (value: unknown): unknown => {
    if (value && typeof value === "object" && "toDate" in value && typeof (value as {toDate?: unknown}).toDate === "function") return (value as {toDate: () => Date}).toDate().toISOString();
    if (Array.isArray(value)) return value.map(clean);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,clean(v)]));
    return value ?? null;
  };
  const add = (tipo: string, id: string, datos: Record<string, unknown>, responsableId?: string) => records.push({tipo,id,...(responsableId ? {responsableId} : {}),datos:clean(datos) as Record<string,unknown>});
  for (const n of nodes.docs) {
    add("lider",n.id,n.data());
    const people = await db.collection(`${base}/nodos/${n.id}/personas`).get();
    for (const p of people.docs) add("persona",p.id,p.data(),n.id);
  }
  for (const p of rootPeople.docs) add("persona",p.id,p.data());
  for (const m of meetings.docs) add("reunion",m.id,m.data());
  // Fragmentos pequeños para respetar el límite de 1 MiB por documento.
  const chunks: typeof records[] = [];
  let current: typeof records = []; let size = 0;
  for (const record of records) {
    const bytes = Buffer.byteLength(JSON.stringify(record),"utf8");
    if (bytes > 450000) throw new Error("Un registro excede el tamaño permitido para el histórico.");
    if (size + bytes > 450000 && current.length) { chunks.push(current); current=[]; size=0; }
    current.push(record); size+=bytes;
  }
  if (current.length) chunks.push(current);
  await archive.set({estado:"preparando",campanaOrigenId:source.id,clientePropietarioId:clienteId,cantidadRegistros:records.length,cantidadFragmentos:chunks.length,actualizadoEn:FieldValue.serverTimestamp()});
  for (let i=0;i<chunks.length;i++) await archive.collection("fragmentos").doc(String(i).padStart(7,"0")).set({registros:chunks[i]});
  await archive.update({estado:"listo",congeladoEn:FieldValue.serverTimestamp()});
}
export async function PATCH(request: NextRequest) {
  try {
    const ctx = await context(request);
    if (!ctx) return fail("Inicia sesión con un correo verificado.", 401);
    const body = await request.json() as Record<string, unknown>;
    const id = body?.id, decision = body?.decision;
    if (typeof id !== "string" || !/^[a-f0-9]{48}$/.test(id) || !["aceptar", "rechazar", "retirar"].includes(String(decision))) return fail("Solicitud inválida.", 400);
    const invitation = ctx.db.doc(`invitacionesRed/${id}`);
    if (decision === "retirar") {
      const pre = await invitation.get();
      if (!pre.exists || pre.get("destinatarioUid") !== ctx.uid || pre.get("estado") !== "aceptada" || ctx.user.get("rol") !== "cliente_admin") return fail("No hay una vinculación activa que puedas retirar.", 409);
      const link = await ctx.db.doc(`vinculacionesCampana/${id}`).get();
      if (!link.exists || link.get("estado") !== "activa" || link.get("propietarioUid") !== ctx.uid || link.get("clientePropietarioId") !== ctx.user.get("clienteId")) return fail("La vinculación no es consistente.",409);
      try { await congelarRed(ctx.db,id,String(ctx.user.get("clienteId")),String(pre.get("categoria")||"")); }
      catch(e) { return fail(e instanceof Error ? e.message : "No fue posible conservar el histórico; el retiro no se realizó.", 409); }
    }
    const result = await ctx.db.runTransaction(async tx => {
      const snap = await tx.get(invitation);
      if (!snap.exists || snap.get("destinatarioUid") !== ctx.uid) return { status: 404, error: "Invitación no encontrada." };
      if (decision === "retirar") {
        if (snap.get("estado") !== "aceptada") return { status: 409, error: "Esta invitación no tiene una vinculación activa." };
        if (ctx.user.get("rol") !== "cliente_admin") return { status: 403, error: "Solo el propietario puede retirarse." };
        const categoria = String(snap.get("categoria") || "");
        const ownerRef = ctx.db.doc(`vinculacionesPorUsuario/${ctx.uid}/categorias/${categoria}`);
        const linkRef = ctx.db.doc(`vinculacionesCampana/${id}`);
        const [owner, link, ownerHistory] = await Promise.all([tx.get(ownerRef), tx.get(linkRef), tx.get(ctx.db.doc(`clientes/${String(ctx.user.get("clienteId"))}`))]);
        if (!owner.exists || owner.get("estado") !== "activa" || owner.get("invitacionId") !== id ||
            !link.exists || link.get("estado") !== "activa" || link.get("propietarioUid") !== ctx.uid ||
            link.get("clientePropietarioId") !== ctx.user.get("clienteId") ||
            link.get("clienteReceptorId") !== snap.get("clienteId") ||
            link.get("campanaReceptoraId") !== snap.get("campanaId")) {
          return { status: 409, error: "No se encontró una vinculación activa y consistente." };
        }
        const archive = await tx.get(ctx.db.doc(`historicosRedesVinculadas/${id}`));
        if (!archive.exists || archive.get("estado") !== "listo") return { status: 409, error: "No se completó el histórico. No se puede retirar la red." };
        const historicName = String((ownerHistory.exists ? ownerHistory.get("nombreCliente") : "") || ctx.user.get("nombre") || "Red desvinculada");
        // Revocar el acceso y liberar la categoría en una sola transacción.
        tx.update(ownerRef, { estado: "retirada", accesoCompartido: false, retiradaEn: FieldValue.serverTimestamp() });
        tx.update(linkRef, { estado: "retirada", accesoCompartido: false, nombreHistorico: historicName, retiradaEn: FieldValue.serverTimestamp() });
        tx.update(invitation, { estado: "retirada", accesoCompartido: false, retiradaEn: FieldValue.serverTimestamp() });
        return { estado: "retirada", accesoCompartido: false };
      }
      if (snap.get("estado") !== "pendiente" || (snap.get("expiraEn")?.toMillis?.() || 0) < Date.now()) return { status: 409, error: "La invitación ya no está disponible." };
      if (decision === "rechazar") { tx.update(invitation, { estado: "rechazada", respondidaEn: FieldValue.serverTimestamp() }); return { estado: "rechazada" }; }
      const categoria = snap.get("categoria") as string;
      const recipientClientId = String(ctx.user.get("clienteId") || "");
      if (ctx.user.get("rol") !== "cliente_admin" || !recipientClientId) return { status: 403, error: "La vinculación requiere una cuenta de cliente con red propia." };
      const recipientClientRef = ctx.db.doc(`clientes/${recipientClientId}`);
      const sourceClientRef = ctx.db.doc(`clientes/${snap.get("clienteId")}`);
      const sourceCampaignRef = ctx.db.doc(`clientes/${snap.get("clienteId")}/campanas/${snap.get("campanaId")}`);
      const owner = ctx.db.doc(`vinculacionesPorUsuario/${ctx.uid}/categorias/${categoria}`);
      const [recipientClient, sourceClient, sourceCampaign, current] = await Promise.all([
        tx.get(recipientClientRef), tx.get(sourceClientRef), tx.get(sourceCampaignRef), tx.get(owner),
      ]);
      if (!recipientClient.exists || recipientClient.get("planActivo") === false || recipientClient.get("estado") === "inactivo") return { status: 403, error: "Tu cuenta de cliente no está activa." };
      if (!sourceClient.exists || sourceClient.get("planActivo") === false || sourceClient.get("estado") === "inactivo" || !sourceCampaign.exists) return { status: 409, error: "La campaña que invita ya no está disponible." };
      if (String(snap.get("clienteId")) === recipientClientId) return { status: 409, error: "No puedes vincularte a una campaña de tu propio cliente." };
      if (current.exists && ["activa", "pendiente_activacion"].includes(String(current.get("estado")))) return { status: 409, error: "Ya tienes una vinculación activa en esta categoría electoral." };
      // La aceptación es real y auditable; la consulta de datos compartidos sigue deshabilitada.
      const linkRef = ctx.db.doc(`vinculacionesCampana/${id}`);
      tx.set(owner, { invitacionId: id, clienteId: snap.get("clienteId"), campanaId: snap.get("campanaId"), categoria, estado: "activa", accesoCompartido: false, creadoEn: FieldValue.serverTimestamp() });
      tx.create(linkRef, {
        invitacionId: id, propietarioUid: ctx.uid, clientePropietarioId: recipientClientId,
        clienteReceptorId: snap.get("clienteId"), campanaReceptoraId: snap.get("campanaId"),
        categoria, estado: "activa", accesoCompartido: false,
        creadaEn: FieldValue.serverTimestamp(),
      });
      tx.update(invitation, { estado: "aceptada", destinatarioUid: ctx.uid, respondidaEn: FieldValue.serverTimestamp(), accesoCompartido: false });
      return { estado: "aceptada", accesoCompartido: false };
    });
    if ("error" in result) return fail(result.error!, result.status!);
    return NextResponse.json(result);
  } catch (error) { console.error("Invitaciones PATCH", error); return fail("No fue posible responder la invitación.", 503); }
}
