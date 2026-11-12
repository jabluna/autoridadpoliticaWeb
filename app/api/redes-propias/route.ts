import { NextRequest, NextResponse } from "next/server";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";

const getServices = () => {
  const app = getApps()[0] ?? initializeApp({ credential: applicationDefault(), projectId: "autoridadpolitica" });
  return { auth: getAuth(app), db: getFirestore(app) };
};

async function getOwner(request: NextRequest) {
  const bearer = request.headers.get("authorization") || "";
  if (!bearer.startsWith("Bearer ")) return null;
  const { auth, db } = getServices();
  const token = await auth.verifyIdToken(bearer.slice(7), true);
  const user = await db.doc(`usuarios/${token.uid}`).get();
  if (!user.exists || user.get("estado") === "inactivo" || user.get("rol") !== "cliente_admin") return null;
  const clienteId = String(user.get("clienteId") || "");
  if (!clienteId) return null;
  const client = await db.doc(`clientes/${clienteId}`).get();
  if (!client.exists || client.get("estado") === "inactivo" || client.get("planActivo") === false) return null;
  return { uid: token.uid, clienteId, db };
}

// Etapa 1: solo registra la titularidad. No migra, duplica ni comparte datos.
export async function GET(request: NextRequest) {
  try {
    const owner = await getOwner(request);
    if (!owner) return NextResponse.json({ error: "Acceso no autorizado." }, { status: 403 });
    const snap = await owner.db.collection("redesPropias").where("propietarioUid", "==", owner.uid).limit(50).get();
    return NextResponse.json({
      redes: snap.docs.map(d => ({ id: d.id, clienteOrigenId: d.get("clienteOrigenId"), campanaOrigenId: d.get("campanaOrigenId"), estado: d.get("estado"), version: d.get("version") })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("No se pudieron consultar redes propias", error);
    return NextResponse.json({ error: "No se pudieron consultar las redes propias." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const owner = await getOwner(request);
    if (!owner) return NextResponse.json({ error: "Acceso no autorizado." }, { status: 403 });
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
    const campanaId = (body as Record<string, unknown>).campanaId;
    if (typeof campanaId !== "string" || !/^[a-zA-Z0-9_-]{1,150}$/.test(campanaId)) return NextResponse.json({ error: "Campaña inválida." }, { status: 400 });
    const campanaRef = owner.db.doc(`clientes/${owner.clienteId}/campanas/${campanaId}`);
    const redId = `${owner.clienteId}__${campanaId}`;
    const redRef = owner.db.doc(`redesPropias/${redId}`);
    const result = await owner.db.runTransaction(async tx => {
      const [campana, red] = await Promise.all([tx.get(campanaRef), tx.get(redRef)]);
      if (!campana.exists) return { error: "La campaña no pertenece a este cliente.", status: 404 };
      if (red.exists) {
        if (red.get("propietarioUid") !== owner.uid) return { error: "La red ya tiene otro propietario. Requiere revisión administrativa.", status: 409 };
        return { id: redId, estado: red.get("estado"), existing: true };
      }
      tx.create(redRef, {
        version: 1,
        propietarioUid: owner.uid,
        clienteOrigenId: owner.clienteId,
        campanaOrigenId: campanaId,
        origen: "campana_existente",
        rutaDatos: campanaRef.path,
        estado: "origen_sin_migrar",
        accesoCompartido: false,
        creadoEn: FieldValue.serverTimestamp(),
      });
      return { id: redId, estado: "origen_sin_migrar", existing: false };
    });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result, { status: result.existing ? 200 : 201 });
  } catch (error) {
    console.error("No se pudo registrar la titularidad de la red", error);
    return NextResponse.json({ error: "No se pudo registrar la titularidad de la red." }, { status: 503 });
  }
}
