import { NextRequest, NextResponse } from "next/server";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

export const runtime = "nodejs";

function services() {
  const app = getApps()[0] ?? initializeApp({ credential: applicationDefault(), projectId: "autoridadpolitica" });
  return { auth: getAuth(app), db: getFirestore(app) };
}

export async function POST(request: NextRequest) {
  try {
    const bearer = request.headers.get("authorization") || "";
    if (!bearer.startsWith("Bearer ")) return NextResponse.json({ error: "Debes iniciar sesión para solicitar tu demo." }, { status: 401 });
    const { auth, db } = services();
    const identity = await auth.verifyIdToken(bearer.slice(7), true);
    const email = String(identity.email || "").trim().toLowerCase();
    if (!email) return NextResponse.json({ error: "La cuenta no tiene un correo válido." }, { status: 400 });
    const payload = await request.json();
    const { nombre, identificacion, telefono, campana, ciudad, campanaInicial } = payload;
    if (![nombre, identificacion, telefono].every(v => typeof v === "string" && v.trim().length > 0) ||
        !campanaInicial || typeof campanaInicial !== "object" ||
        typeof campanaInicial.nombreCampana !== "string" || !campanaInicial.nombreCampana.trim() ||
        typeof campanaInicial.candidato !== "string" || !campanaInicial.candidato.trim() ||
        !["municipal", "departamental", "nacional"].includes(campanaInicial.tipo) ||
        !["edil", "concejo", "alcaldia", "asamblea", "gobernacion", "presidencia"].includes(campanaInicial.corporacion)) {
      return NextResponse.json({ error: "Completa los datos de la campaña y del solicitante." }, { status: 400 });
    }
    const user = await auth.getUser(identity.uid);
    if (user.email?.toLowerCase() !== email) return NextResponse.json({ error: "La sesión no coincide con el correo." }, { status: 403 });
    const requestRef = db.doc(`solicitudesRegistro/${identity.uid}`);
    const entitlementRef = db.doc(`beneficiosDemo/${identity.uid}`);
    const existingClients = await db.collection("clientes").where("authUid", "==", identity.uid).get();
    if (existingClients.docs.some(d => d.get("plan.id") === "free" || d.get("plan.nombre") === "Free")) {
      return NextResponse.json({ error: "Ya utilizaste tu demo gratuita. Solo se permite una por cuenta." }, { status: 409 });
    }
    await db.runTransaction(async tx => {
      const [entitlement, previous] = await Promise.all([tx.get(entitlementRef), tx.get(requestRef)]);
      if (entitlement.exists || previous.exists) throw new Error("Ya existe una solicitud o demo para esta cuenta. Solo se permite una por correo.");
      tx.create(entitlementRef, { uid: identity.uid, email, estado: "solicitada", creadoEn: FieldValue.serverTimestamp() });
      tx.create(requestRef, {
        authUid: identity.uid, tipoCliente: "candidato",
        nombreCliente: nombre.trim(), identificacion: identificacion.trim(),
        telefono: telefono.trim(), email, nombreCampana: String(campana || "").trim(),
        ubicacion: { ciudad: String(ciudad || "").trim(), pais: "Colombia" },
        planSolicitado: "Free", nivelesRed: 3, estado: "pendiente",
        campanaInicial, creadoEn: FieldValue.serverTimestamp(),
      });
    });
    return NextResponse.json({ ok: true, emailVerified: user.emailVerified });
  } catch (e) {
    console.error("Demo registration error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "No fue posible solicitar la demo." }, { status: 400 });
  }
}
