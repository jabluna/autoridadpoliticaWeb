import { NextResponse } from "next/server";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";

export const runtime = "nodejs";
export async function GET() {
  try {
    const app = getApps()[0] ?? initializeApp({credential: applicationDefault(),projectId:"autoridadpolitica"});
    const snapshot = await getDatabase(app,"https://autoridadpolitica-default-rtdb.firebaseio.com").ref("MUNICIPIOPUESTOS").get();
    if (!snapshot.exists()) return NextResponse.json({error:"Catálogo electoral no disponible."},{status:404});
    return NextResponse.json(snapshot.val(),{headers:{"Cache-Control":"public, s-maxage=3600, stale-while-revalidate=86400"}});
  } catch (e) {
    console.error("Error leyendo catálogo electoral:",e);
    return NextResponse.json({error:"No fue posible cargar el catálogo electoral."},{status:503});
  }
}
