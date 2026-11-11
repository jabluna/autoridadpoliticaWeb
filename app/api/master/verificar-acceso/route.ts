import { NextRequest, NextResponse } from "next/server";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const bearer = request.headers.get("authorization") || "";
    if (!bearer.startsWith("Bearer ")) return NextResponse.json({ autorizado: false }, { status: 401 });
    const app = getApps()[0] ?? initializeApp({ credential: applicationDefault(), projectId: "autoridadpolitica" });
    const token = await getAuth(app).verifyIdToken(bearer.slice(7), true);
    const email = String(token.email || "").trim().toLowerCase();
    if (!email || token.email_verified !== true) return NextResponse.json({ autorizado: false }, { status: 403 });
    const db = getFirestore(app);
    const [byUid, byEmail] = await Promise.all([
      db.doc(`administradoresMaster/${token.uid}`).get(),
      db.collection("administradoresMaster").where("email", "==", email).limit(10).get(),
    ]);
    const valid = [byUid, ...byEmail.docs].some(d => d.exists &&
      d.get("rol") === "master" && d.get("estado") === "activo" &&
      String(d.get("email") || "").trim().toLowerCase() === email);
    const owner = Boolean(process.env.MASTER_OWNER_UID) && token.uid === process.env.MASTER_OWNER_UID;
    if (!valid && !owner) return NextResponse.json({ autorizado: false }, { status: 403 });
    return NextResponse.json({ autorizado: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Error validando Master:", error);
    return NextResponse.json({ autorizado: false, error: "No fue posible verificar los permisos Master." }, { status: 503 });
  }
}
