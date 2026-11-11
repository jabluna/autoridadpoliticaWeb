import { NextRequest, NextResponse } from "next/server";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";

function adminServices() {
  const app = getApps()[0] || initializeApp({
    credential: applicationDefault(),
    projectId: "autoridadpolitica",
  });
  return { adminAuth: getAuth(app), adminDb: getFirestore(app) };
}

export async function POST(request: NextRequest) {
  try {
    const bearer = request.headers.get("authorization") || "";
    if (!bearer.startsWith("Bearer ")) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
    const { adminAuth, adminDb } = adminServices();
    let decoded;
    try { decoded = await adminAuth.verifyIdToken(bearer.slice(7), true); }
    catch (e) {
      console.error("Firebase Admin token validation failed:", e instanceof Error ? e.message : "Unknown");
      return NextResponse.json({ error: "Firebase Admin no pudo validar la sesión. En localhost configura credenciales de servicio de Firebase (GOOGLE_APPLICATION_CREDENTIALS); en App Hosting verifica la cuenta de servicio." }, { status: 503 });
    }
    // La identidad se verifica con Firebase Auth; el correo verificado identifica al administrador.
    // Los documentos históricos pueden tener UID o correo diferentes a su ID de Firestore.
    const signedEmail = typeof decoded.email === "string" ? decoded.email.trim().toLowerCase() : "";
    if (!signedEmail || decoded.email_verified !== true) {
      return NextResponse.json({ error: "El correo de tu sesión Master no está verificado en Firebase Authentication." }, { status: 403 });
    }
    const adminCollection = adminDb.collection("administradoresMaster");
    const byUid = await adminCollection.doc(decoded.uid).get();
    const byEmail = await adminCollection.where("email", "==", signedEmail).limit(10).get();
    const candidates = [byUid, ...byEmail.docs];
    const matchingAdmin = candidates.map(d => d.exists ? d.data() : undefined).find(data =>
      data &&
      String(data.email || "").trim().toLowerCase() === signedEmail &&
      data.estado === "activo" &&
      data.rol === "master"
    );
    if (!matchingAdmin) {
      const reason = !byUid.exists && byEmail.empty
        ? "No existe un administrador con el correo de tu sesión."
        : "El registro encontrado no coincide con el correo, rol master y estado activo.";
      console.warn("Master access denied", {
        authenticatedUid: decoded.uid,
        authenticatedEmail: signedEmail,
        uidDocumentExists: byUid.exists,
        emailDocumentCount: byEmail.size,
        reason,
      });
      return NextResponse.json({
        error: `Acceso denegado: ${reason} Sesión autenticada: ${signedEmail}. Comprueba que esa misma cuenta aparezca en Master → Administradores.`,
      }, { status: 403 });
    }

    const { clienteId } = await request.json() as { clienteId?: string };
    if (typeof clienteId !== "string" || !/^[A-Za-z0-9_-]{8,128}$/.test(clienteId)) {
      return NextResponse.json({ error: "Cliente inválido." }, { status: 400 });
    }
    const clienteRef = adminDb.collection("clientes").doc(clienteId);
    let clienteSnap;
    try { clienteSnap = await clienteRef.get(); }
    catch (e) {
      console.error("Firestore Admin read failed:", e instanceof Error ? e.message : "Unknown");
      return NextResponse.json({ error: "Firebase Admin no pudo consultar Firestore. Verifica las credenciales de servicio." }, { status: 503 });
    }
    if (!clienteSnap.exists) return NextResponse.json({ error: "Cliente no encontrado." }, { status: 404 });
    const cliente = clienteSnap.data()!;
    if (cliente.pago?.estado !== "aprobado") {
      return NextResponse.json({ error: "El pago debe estar aprobado." }, { status: 400 });
    }
    const email = String(cliente.email || "").trim().toLowerCase();
    if (!email) return NextResponse.json({ error: "Cliente sin correo." }, { status: 400 });
    let user;
    try { user = await adminAuth.getUserByEmail(email); }
    catch (e) {
      console.error("Firebase user lookup failed:", e instanceof Error ? e.message : "Unknown");
      return NextResponse.json({ error: "Firebase Admin no pudo consultar el usuario de Authentication. Verifica credenciales y permisos." }, { status: 503 });
    }
    if (cliente.authUid && cliente.authUid !== user.uid) {
      // No reemplazar automáticamente el UID: podría asociar un cliente a otra identidad.
      console.warn("Client Auth UID mismatch", {
        clienteId,
        storedUid: String(cliente.authUid),
        authUid: user.uid,
        email,
      });
      return NextResponse.json({
        error: "El cliente tiene un UID distinto al usuario registrado en Firebase Authentication. Comprueba en Firestore clientes/" + clienteId + " → authUid y en Authentication → Usuarios busca " + email + ". No se envió ningún enlace.",
      }, { status: 409 });
    }

    const privateKey = process.env.EMAILJS_PRIVATE_KEY;
    if (!privateKey) return NextResponse.json({ error: "Falta EMAILJS_PRIVATE_KEY en el servidor." }, { status: 503 });
    let resetLink: string;
    try { resetLink = await adminAuth.generatePasswordResetLink(email); }
    catch (e) {
      console.error("Firebase reset link generation failed:", e instanceof Error ? e.message : "Unknown");
      return NextResponse.json({ error: "Firebase Admin no pudo generar el enlace de recuperación. Verifica credenciales y permisos de Firebase Authentication." }, { status: 503 });
    }
    const emailResponse = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_id: "service_j9mgk6s",
        template_id: "template_tkxpukx",
        user_id: "cOIC7T0gD-Ft9gCNh",
        accessToken: privateKey,
        template_params: {
          nombre: String(cliente.nombreCliente || "cliente"),
          email,
          to_email: email,
          reset_link: resetLink,
          login_url: "https://autoridad-politica-web--autoridadpolitica.us-central1.hosted.app/login",
          password: "Utiliza el enlace para establecer tu contraseña.",
        },
      }),
      cache: "no-store",
    });
    if (!emailResponse.ok) {
      const raw = await emailResponse.text();
      // EmailJS can return a text error. Never echo links, tokens, or secrets.
      const sanitized = raw
        .replaceAll("https://", "[enlace] ")
        .replaceAll("http://", "[enlace] ")
        .slice(0, 240);
      console.error("EmailJS rejected send", { status: emailResponse.status, detail: sanitized });
      return NextResponse.json({
        error: `EmailJS rechazó el envío (HTTP ${emailResponse.status}): ${sanitized || "sin detalle"}`,
      }, { status: 502 });
    }
    await clienteRef.update({
      "acceso.credencialesPendientesEnvio": false,
      "acceso.estadoEmail": "enviado",
      "acceso.emailEnviadoEn": FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error enviando acceso Master:", error instanceof Error ? error.message : "Error desconocido");
    return NextResponse.json({ error: "No se pudo enviar el correo. Revisa la configuración del servidor." }, { status: 500 });
  }
}
