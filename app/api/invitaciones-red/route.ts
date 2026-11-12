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
    const snap = await ctx.db.collection("invitacionesRed").where("destinatarioUid", "==", ctx.uid).limit(100).get();
    const now = Date.now();
    return NextResponse.json({ invitaciones: snap.docs.map(d => {
      const x = d.data(), expired = x.expiraEn?.toMillis?.() < now;
      return { id: d.id, campanaNombre: x.campanaNombre, categoria: x.categoria, estado: expired && x.estado === "pendiente" ? "expirada" : x.estado, emisorNombre: x.emisorNombre, expiraEn: x.expiraEn?.toDate?.()?.toISOString?.(), aceptadaEn: x.respondidaEn?.toDate?.()?.toISOString?.(), retiradaEn: x.retiradaEn?.toDate?.()?.toISOString?.() };
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
    const campanaId = body?.campanaId, phone = String(body?.telefono || "").replace(/[^0-9]/g, "");
    if (typeof campanaId !== "string" || !/^[a-zA-Z0-9_-]{1,150}$/.test(campanaId) || phone.length < 10 || phone.length > 15) return fail("Campaña o número de WhatsApp inválido.", 400);
    const localPhone = phone.startsWith("57") && phone.length === 12 ? phone.slice(2) : phone;
    const candidates = [...new Set([phone, localPhone, `57${localPhone}`, `+57${localPhone}`])];
    const found = await Promise.all(candidates.map(telefono => ctx.db.collection("clientes").where("telefono", "==", telefono).limit(3).get()));
    const matched = new Map(found.flatMap(s => s.docs).map(d => [d.id, d]));
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
      destinatarioEmail: email, destinatarioUid: recipientUid, destinatarioTelefono: phone, clienteId, campanaId, campanaNombre: String(campaign.get("nombreCampana") || client.get("nombreCampana") || "Campaña"),
      categoria: category, estado: "pendiente", accesoCompartido: false,
      creadoEn: FieldValue.serverTimestamp(), expiraEn: expires,
    });
    return NextResponse.json({ id, expiraEn: expires.toISOString(), categoria: category, telefono: phone }, { status: 201 });
  } catch (error) { console.error("Invitaciones POST", error); return fail("No fue posible crear la invitación.", 503); }
}
export async function PATCH(request: NextRequest) {
  try {
    const ctx = await context(request);
    if (!ctx) return fail("Inicia sesión con un correo verificado.", 401);
    const body = await request.json() as Record<string, unknown>;
    const id = body?.id, decision = body?.decision;
    if (typeof id !== "string" || !/^[a-f0-9]{48}$/.test(id) || !["aceptar", "rechazar", "retirar"].includes(String(decision))) return fail("Solicitud inválida.", 400);
    const invitation = ctx.db.doc(`invitacionesRed/${id}`);
    const result = await ctx.db.runTransaction(async tx => {
      const snap = await tx.get(invitation);
      if (!snap.exists || snap.get("destinatarioUid") !== ctx.uid) return { status: 404, error: "Invitación no encontrada." };
      if (decision === "retirar") {
        if (snap.get("estado") !== "aceptada") return { status: 409, error: "Esta invitación no tiene una vinculación activa." };
        if (ctx.user.get("rol") !== "cliente_admin") return { status: 403, error: "Solo el propietario puede retirarse." };
        const categoria = String(snap.get("categoria") || "");
        const ownerRef = ctx.db.doc(`vinculacionesPorUsuario/${ctx.uid}/categorias/${categoria}`);
        const linkRef = ctx.db.doc(`vinculacionesCampana/${id}`);
        const [owner, link] = await Promise.all([tx.get(ownerRef), tx.get(linkRef)]);
        if (!owner.exists || owner.get("estado") !== "activa" || owner.get("invitacionId") !== id ||
            !link.exists || link.get("estado") !== "activa" || link.get("propietarioUid") !== ctx.uid ||
            link.get("clientePropietarioId") !== ctx.user.get("clienteId") ||
            link.get("clienteReceptorId") !== snap.get("clienteId") ||
            link.get("campanaReceptoraId") !== snap.get("campanaId")) {
          return { status: 409, error: "No se encontró una vinculación activa y consistente." };
        }
        // Revocar el acceso y liberar la categoría en una sola transacción.
        tx.update(ownerRef, { estado: "retirada", accesoCompartido: false, retiradaEn: FieldValue.serverTimestamp() });
        tx.update(linkRef, { estado: "retirada", accesoCompartido: false, retiradaEn: FieldValue.serverTimestamp() });
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
