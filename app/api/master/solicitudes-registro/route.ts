import { NextRequest, NextResponse } from "next/server";
import { getApps, initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";

function adminApp() {
  return getApps()[0] ?? initializeApp({ credential: applicationDefault(), projectId: "autoridadpolitica" });
}

export async function POST(req: NextRequest) {
  try {
    const bearer = req.headers.get("authorization") || "";
    if (!bearer.startsWith("Bearer ")) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
    const app = adminApp();
    const auth = getAuth(app);
    const db = getFirestore(app);
    const token = await auth.verifyIdToken(bearer.slice(7), true);
    const signedEmail = String(token.email || "").trim().toLowerCase();
    if (!signedEmail || token.email_verified !== true) {
      return NextResponse.json({ error: "El correo de la sesión Master debe estar verificado." }, { status: 403 });
    }
    const [master, byEmail] = await Promise.all([
      db.doc(`administradoresMaster/${token.uid}`).get(),
      db.collection("administradoresMaster").where("email", "==", signedEmail).limit(10).get(),
    ]);
    const isOwner = Boolean(process.env.MASTER_OWNER_UID) && token.uid === process.env.MASTER_OWNER_UID;
    const isAdmin = [master, ...byEmail.docs].some(d => d.exists &&
      d.get("rol") === "master" && d.get("estado") === "activo" &&
      String(d.get("email") || "").trim().toLowerCase() === signedEmail);
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: "No tienes permisos de administrador Master. Comprueba el correo de la sesión." }, { status: 403 });
    }
    const { uid, action, uids } = await req.json() as { uid?: string; action?: string; uids?: string[] };
    if (action === "eliminar") {
      const ids = Array.isArray(uids) ? uids : uid ? [uid] : [];
      const unique = [...new Set(ids)];
      if (!unique.length || unique.length > 400 || unique.some(id => typeof id !== "string" || !/^[A-Za-z0-9_-]{8,128}$/.test(id))) {
        return NextResponse.json({ error: "Selecciona entre 1 y 400 solicitudes válidas." }, { status: 400 });
      }
      const batch = db.batch();
      for (const id of unique) batch.delete(db.doc(`solicitudesRegistro/${id}`));
      await batch.commit();
      // No eliminar Authentication, usuarios, clientes ni beneficiosDemo.
      return NextResponse.json({ ok: true, eliminadas: unique.length });
    }
    if (!uid || !["aprobar", "rechazar"].includes(action || "")) return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
    const user = await auth.getUser(uid);
    const requestRef = db.doc(`solicitudesRegistro/${uid}`);
    if (action === "aprobar" && !user.emailVerified) {
      return NextResponse.json({ error: "El solicitante todavía no verificó su correo electrónico." }, { status: 409 });
    }
    await db.runTransaction(async tx => {
      const requestSnap = await tx.get(requestRef);
      if (!requestSnap.exists) throw new Error("Solicitud no encontrada.");
      const data = requestSnap.data()!;
      if (data.estado !== "pendiente" || data.tipoCliente !== "candidato" || data.planSolicitado !== "Free" || data.authUid !== uid || data.email !== user.email) throw new Error("La solicitud no es válida o ya fue procesada.");
      if (action === "rechazar") {
        tx.update(requestRef, { estado: "rechazado", revisadoPor: token.uid, revisadoEn: FieldValue.serverTimestamp() });
        return;
      }
      const clientRef = db.collection("clientes").doc(uid);
      const userRef = db.doc(`usuarios/${uid}`);
      const [existingClient, existingUser] = await Promise.all([tx.get(clientRef), tx.get(userRef)]);
      if (existingClient.exists) throw new Error("Ya existe un cliente con este UID.");
      if (existingUser.exists && !["red_usuario", "cliente_admin"].includes(String(existingUser.get("rol")))) throw new Error("El perfil existente no permite una demo.");
      tx.create(clientRef, {
        authUid: uid, tipoCliente: "candidato", nombreCliente: data.nombreCliente,
        identificacion: data.identificacion, nombreCampana: data.nombreCampana || "",
        email: user.email, telefono: data.telefono, ubicacion: data.ubicacion || {},
        plan: { id: "free", nombre: "Free", meses: 0, tipo: "base", descuento: 0, valor: 0, valorFinal: 0, preciosCampana: [] },
        nivelesRed: 3, logoURL: "", estado: "activo", planActivo: true,
        pago: { estado: "aprobado", reciboURL: "", valorAprobado: 0 },
        creadoEn: FieldValue.serverTimestamp(),
      });
      if (existingUser.exists) {
        // No sobrescribir rol, clienteId ni nodoId: pueden pertenecer a otra red.
        tx.update(userRef, { demoClienteId: uid, actualizadoEn: FieldValue.serverTimestamp() });
      } else {
        tx.create(userRef, {
          uid, clienteId: uid, email: user.email, nombre: data.nombreCliente,
          rol: "cliente_admin", tipoCliente: "candidato", estado: "activo",
          creadoEn: FieldValue.serverTimestamp(),
        });
      }
      if (data.campanaInicial && typeof data.campanaInicial === "object") {
        const initial = data.campanaInicial as Record<string, unknown>;
        const validCorporations = ["edil", "concejo", "alcaldia", "asamblea", "gobernacion", "presidencia"];
        const validTypes = ["municipal", "departamental", "nacional"];
        if (!validCorporations.includes(String(initial.corporacion)) || !validTypes.includes(String(initial.tipo)) ||
            typeof initial.nombreCampana !== "string" || !initial.nombreCampana.trim() ||
            typeof initial.candidato !== "string" || !initial.candidato.trim()) {
          throw new Error("La configuración inicial de campaña no es válida.");
        }
        const campanaRef = clientRef.collection("campanas").doc();
        tx.create(campanaRef, {
          tipo: initial.tipo, corporacion: initial.corporacion,
          nombreCampana: initial.nombreCampana, candidato: initial.candidato,
          partidoMovimiento: String(initial.partidoMovimiento || ""), lema: String(initial.lema || ""),
          departamento: String(initial.departamento || ""), municipio: String(initial.municipio || ""),
          metaVotos: Number(initial.metaVotos) || 0, fechaEleccion: String(initial.fechaEleccion || ""),
          alcancePuestos: initial.alcancePuestos === "seleccionados" ? "seleccionados" : "todos",
          puestosSeleccionados: Array.isArray(initial.puestosSeleccionados) ? initial.puestosSeleccionados : [],
          totalPuestos: Number(initial.totalPuestos) || 0, totalMesas: Number(initial.totalMesas) || 0,
          nivelesMultiredPermitidos: 3, estado: "inactiva",
          creadoEn: FieldValue.serverTimestamp(),
        });
      }
      tx.update(requestRef, { estado: "aprobado", clienteId: uid, revisadoPor: token.uid, revisadoEn: FieldValue.serverTimestamp() });
      tx.set(db.doc(`beneficiosDemo/${uid}`), { uid, email: user.email, estado: "aprobada", actualizadoEn: FieldValue.serverTimestamp() }, { merge: true });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Registration review error", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "No fue posible procesar la solicitud." }, { status: 400 });
  }
}
