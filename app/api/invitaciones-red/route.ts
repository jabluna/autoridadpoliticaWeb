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
    const snap = await ctx.db.collection("invitacionesRed").where("destinatarioEmail", "==", ctx.email).limit(100).get();
    const now = Date.now();
    return NextResponse.json({ invitaciones: snap.docs.map(d => {
      const x = d.data(), expired = x.expiraEn?.toMillis?.() < now;
      return { id: d.id, campanaNombre: x.campanaNombre, categoria: x.categoria, estado: expired && x.estado === "pendiente" ? "expirada" : x.estado, emisorNombre: x.emisorNombre, expiraEn: x.expiraEn?.toDate?.()?.toISOString?.() };
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
    const campanaId = body?.campanaId, email = normalize(body?.email);
    if (typeof campanaId !== "string" || !/^[\w-]{1,150}$/.test(campanaId) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return fail("Campaña o correo inválido.", 400);
    if (email === ctx.email) return fail("No puedes invitarte a tu propia campaña.", 400);
    const [client, campaign] = await Promise.all([ctx.db.doc(`clientes/${clienteId}`).get(), ctx.db.doc(`clientes/${clienteId}/campanas/${campanaId}`).get()]);
    if (!client.exists || client.get("planActivo") === false || client.get("estado") === "inactivo" || !campaign.exists) return fail("Campaña no disponible.", 403);
    const category = categoryOf(campaign.get("cargoAspirado") || campaign.get("cargo") || campaign.get("tipoCampana") || client.get("cargoAspirado"));
    if (!category) return fail("Configura el cargo electoral de la campaña antes de invitar.", 422);
    const id = randomBytes(24).toString("hex");
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await ctx.db.doc(`invitacionesRed/${id}`).create({
      emisorUid: ctx.uid, emisorNombre: String(ctx.user.get("nombre") || client.get("nombreCliente") || "Administrador"),
      destinatarioEmail: email, clienteId, campanaId, campanaNombre: String(campaign.get("nombreCampana") || client.get("nombreCampana") || "Campaña"),
      categoria: category, estado: "pendiente", accesoCompartido: false,
      creadoEn: FieldValue.serverTimestamp(), expiraEn: expires,
    });
    return NextResponse.json({ id, expiraEn: expires.toISOString(), categoria: category }, { status: 201 });
  } catch (error) { console.error("Invitaciones POST", error); return fail("No fue posible crear la invitación.", 503); }
}
export async function PATCH(request: NextRequest) {
  try {
    const ctx = await context(request);
    if (!ctx) return fail("Inicia sesión con un correo verificado.", 401);
    const body = await request.json() as Record<string, unknown>;
    const id = body?.id, decision = body?.decision;
    if (typeof id !== "string" || !/^[a-f0-9]{48}$/.test(id) || !["aceptar", "rechazar"].includes(String(decision))) return fail("Solicitud inválida.", 400);
    const invitation = ctx.db.doc(`invitacionesRed/${id}`);
    const result = await ctx.db.runTransaction(async tx => {
      const snap = await tx.get(invitation);
      if (!snap.exists || snap.get("destinatarioEmail") !== ctx.email) return { status: 404, error: "Invitación no encontrada." };
      if (snap.get("estado") !== "pendiente" || (snap.get("expiraEn")?.toMillis?.() || 0) < Date.now()) return { status: 409, error: "La invitación ya no está disponible." };
      if (decision === "rechazar") { tx.update(invitation, { estado: "rechazada", respondidaEn: FieldValue.serverTimestamp() }); return { estado: "rechazada" }; }
      const categoria = snap.get("categoria") as string;
      const owner = ctx.db.doc(`vinculacionesPorUsuario/${ctx.uid}/categorias/${categoria}`);
      const current = await tx.get(owner);
      if (current.exists && current.get("estado") === "activa") return { status: 409, error: "Ya tienes una vinculación activa en esta categoría electoral." };
      // Reservar la categoría sin otorgar acceso a datos hasta implementar la etapa 3.
      tx.set(owner, { invitacionId: id, clienteId: snap.get("clienteId"), campanaId: snap.get("campanaId"), categoria, estado: "pendiente_activacion", creadoEn: FieldValue.serverTimestamp() });
      tx.update(invitation, { estado: "aceptada_pendiente_activacion", destinatarioUid: ctx.uid, respondidaEn: FieldValue.serverTimestamp(), accesoCompartido: false });
      return { estado: "aceptada_pendiente_activacion" };
    });
    if ("error" in result) return fail(result.error!, result.status!);
    return NextResponse.json(result);
  } catch (error) { console.error("Invitaciones PATCH", error); return fail("No fue posible responder la invitación.", 503); }
}
