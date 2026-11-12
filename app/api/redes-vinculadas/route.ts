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
    const selected = links.docs.filter(d => d.get("campanaReceptoraId") === campanaId && ["activa", "retirada"].includes(String(d.get("estado"))));
    const rows = await Promise.all(selected.map(async link => {
      const ownerUid = String(link.get("propietarioUid") || "");
      const ownerClientId = String(link.get("clientePropietarioId") || "");
      const category = String(link.get("categoria") || "");
      const withdrawn = link.get("estado") === "retirada";
      const [owner, client, reservation, invite] = await Promise.all([
        db.doc(`usuarios/${ownerUid}`).get(), db.doc(`clientes/${ownerClientId}`).get(),
        db.doc(`vinculacionesPorUsuario/${ownerUid}/categorias/${category}`).get(),
        db.doc(`invitacionesRed/${link.id}`).get(),
      ]);
      if (!invite.exists || invite.get("destinatarioUid") !== ownerUid) return null;
      if (withdrawn) {
        // La ficha sombra no depende de que la persona conserve su cuenta o categoría reservada.
        if (invite.get("estado") !== "retirada") return null;
        return {
          id: link.id, nombre: String(link.get("nombreHistorico") || invite.get("destinatarioNombre") || "Red desvinculada"),
          categoria: category, estado: "retirada", accesoCompartido: false, red: [],
          retiradaEn: link.get("retiradaEn")?.toDate?.()?.toISOString?.(),
          aviso: "El propietario se retiró. Sin acceso a su estructura ni aporte electoral."
        };
      }
      if (!owner.exists || owner.get("estado") === "inactivo" || owner.get("clienteId") !== ownerClientId ||
          !client.exists || client.get("estado") === "inactivo" ||
          !reservation.exists || reservation.get("estado") !== "activa" || reservation.get("invitacionId") !== link.id ||
          invite.get("estado") !== "aceptada") return null;
      // Lectura mediada por servidor: nunca se entregan rutas de Firestore para acceso directo.
      const campaigns = await db.collection(`clientes/${ownerClientId}/campanas`).limit(50).get();
      const sameCategory = (value: unknown) => {
        const raw = String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        return raw.includes(category) || (category === "alcaldia" && raw.includes("alcald")) || (category === "gobernacion" && raw.includes("gobern")) || (category === "presidencia" && raw.includes("presiden")) || (category === "camara" && raw.includes("representante")) || (category === "concejo" && raw.includes("concejal")) || (category === "asamblea" && raw.includes("diputad"));
      };
      const matching = campaigns.docs.filter(d => sameCategory(d.get("corporacion") || d.get("cargoAspirado") || d.get("cargo") || d.get("tipoCampana") || client.get("corporacion") || client.get("cargoAspirado")));
      // No asumir una campaña cuando hay varias del mismo tipo: podría exponer datos de otra campaña.
      const source = matching.length === 1 ? matching[0] : campaigns.docs.length === 1 ? campaigns.docs[0] : null;
      const nodes = source ? await db.collection(`clientes/${ownerClientId}/campanas/${source.id}/nodos`).limit(501).get() : null;
      const complete = !!nodes && nodes.size <= 500;
      const activeNodes = complete ? nodes!.docs.filter(n => n.get("estado") !== "inactivo") : [];
      const tree = activeNodes.map(n => ({
        id: n.id, padreId: String(n.get("padreId") || ""), nombre: String(n.get("nombre") || ""),
        apellido: String(n.get("apellido") || ""), nivel: Number(n.get("nivel") || 1),
        estimacionVotos: Number(n.get("estimacionVotos") || 0), votosRealesSubarbol: Number(n.get("votosRealesSubarbol") || 0), puntuacion: Number(n.get("puntuacion") || 0), multinodo: n.get("multinodo") !== false, etiquetaId: String(n.get("etiquetaId") || ""), fotoUrl: String(n.get("fotoUrl") || ""),
      }));
      return {
        id: link.id, nombre: String(client.get("nombreCliente") || owner.get("nombre") || "Red vinculada"),
        categoria: category, estado: "activa", accesoCompartido: complete,
        red: complete ? tree : [],
        aviso: !source ? "El propietario tiene varias campañas posibles. Debe seleccionar explícitamente cuál red compartir." : !complete ? "La red supera el límite de consulta inicial de 500 nodos." : undefined,
      };
    }));
    return NextResponse.json({ vinculaciones: rows.filter(Boolean) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { console.error("Error consultando redes vinculadas", error); return fail("No se pudieron consultar las redes vinculadas.", 503); }
}
