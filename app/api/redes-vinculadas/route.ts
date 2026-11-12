import { NextRequest, NextResponse } from "next/server";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

export const runtime = "nodejs";
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
export async function GET(request: NextRequest) {
  try {
    const bearer = request.headers.get("authorization") || "";
    if (!bearer.startsWith("Bearer ")) return fail("Sesión requerida.", 401);
    const app = getApps()[0] ?? initializeApp({ credential: applicationDefault(), projectId: "autoridadpolitica" });
    const token = await getAuth(app).verifyIdToken(bearer.slice(7), true);
    const db = getFirestore(app);
    const user = await db.doc(`usuarios/${token.uid}`).get();
    if (!user.exists || user.get("estado") === "inactivo" || user.get("rol") !== "cliente_admin") return fail("Acceso no autorizado.", 403);
    const clienteId = String(user.get("clienteId") || "");
    const campanaId = request.nextUrl.searchParams.get("campanaId") || "";
    if (!clienteId || !/^[a-zA-Z0-9_-]{1,150}$/.test(campanaId)) return fail("Campaña inválida.", 400);
    const [client, campaign] = await Promise.all([db.doc(`clientes/${clienteId}`).get(), db.doc(`clientes/${clienteId}/campanas/${campanaId}`).get()]);
    if (!client.exists || client.get("estado") === "inactivo" || client.get("planActivo") === false || !campaign.exists) return fail("Campaña no autorizada.", 403);
    const links = await db.collection("vinculacionesCampana").where("clienteReceptorId", "==", clienteId).limit(150).get();
    const selected = links.docs.filter(d => d.get("campanaReceptoraId") === campanaId && d.get("estado") === "activa");
    const rows = await Promise.all(selected.map(async link => {
      const ownerUid = String(link.get("propietarioUid") || "");
      const ownerClientId = String(link.get("clientePropietarioId") || "");
      const category = String(link.get("categoria") || "");
      const [owner, client, reservation, invite] = await Promise.all([
        db.doc(`usuarios/${ownerUid}`).get(), db.doc(`clientes/${ownerClientId}`).get(),
        db.doc(`vinculacionesPorUsuario/${ownerUid}/categorias/${category}`).get(),
        db.doc(`invitacionesRed/${link.id}`).get(),
      ]);
      if (!owner.exists || owner.get("estado") === "inactivo" || owner.get("clienteId") !== ownerClientId ||
          !client.exists || client.get("estado") === "inactivo" ||
          !reservation.exists || reservation.get("estado") !== "activa" || reservation.get("invitacionId") !== link.id ||
          !invite.exists || invite.get("estado") !== "aceptada" || invite.get("destinatarioUid") !== ownerUid) return null;
      // No expose contact information through this listing.
      return { id: link.id, nombre: String(client.get("nombreCliente") || owner.get("nombre") || "Red vinculada"), categoria: category, estado: "activa", accesoCompartido: link.get("accesoCompartido") === true };
    }));
    return NextResponse.json({ vinculaciones: rows.filter(Boolean) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { console.error("Error consultando redes vinculadas", error); return fail("No se pudieron consultar las redes vinculadas.", 503); }
}
