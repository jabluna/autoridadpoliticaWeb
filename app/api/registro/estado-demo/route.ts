import { NextRequest, NextResponse } from "next/server";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const bearer = request.headers.get("authorization") || "";
    if (!bearer.startsWith("Bearer ")) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
    const app = getApps()[0] ?? initializeApp({ credential: applicationDefault(), projectId: "autoridadpolitica" });
    const token = await getAuth(app).verifyIdToken(bearer.slice(7), true);
    const db = getFirestore(app);
    const [benefit, application, clients] = await Promise.all([
      db.doc(`beneficiosDemo/${token.uid}`).get(),
      db.doc(`solicitudesRegistro/${token.uid}`).get(),
      db.collection("clientes").where("authUid", "==", token.uid).get(),
    ]);
    const historical = clients.docs.some(d => String(d.get("plan.id") || "").toLowerCase() === "free" || String(d.get("plan.nombre") || "").toLowerCase() === "free");
    const used = benefit.exists || application.exists || historical;
    return NextResponse.json({ used, status: application.exists ? String(application.get("estado") || "pendiente") : benefit.exists ? String(benefit.get("estado") || "utilizada") : historical ? "aprobada" : "disponible" }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("Error comprobando demo:", e);
    return NextResponse.json({ error: "No fue posible verificar el historial de demos." }, { status: 503 });
  }
}
