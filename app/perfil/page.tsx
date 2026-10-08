"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { useRouter } from "next/navigation";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import { auth, db, storage } from "@/lib/firebase";

export default function PerfilClientePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [cliente, setCliente] = useState<any>(null);
  const [usuario, setUsuario] = useState<any>(null);
  const [clienteId, setClienteId] = useState("");
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeType, setUpgradeType] = useState<"campana" | "niveles">("campana");
  const [requestedCampaign, setRequestedCampaign] = useState("");
  const [requestedLevels, setRequestedLevels] = useState(0);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [solicitudes, setSolicitudes] = useState<any[]>([]);
  const [solicitudesLoading, setSolicitudesLoading] = useState(true);
  const [receiptUploadingId, setReceiptUploadingId] = useState<string | null>(null);
  const [requestNote, setRequestNote] = useState("");
  const [requestNoteId, setRequestNoteId] = useState<string | null>(null);
  const [messageFile, setMessageFile] = useState<File | null>(null);
  const [messageUploadingId, setMessageUploadingId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) return router.replace("/login");

      try {
        const us = await getDoc(doc(db, "usuarios", user.uid));
        if (!us.exists()) throw new Error();
        const u = us.data() as any;
        if (u.rol !== "cliente_admin" || u.estado === "inactivo" || !u.clienteId) throw new Error();

        const cs = await getDoc(doc(db, "clientes", u.clienteId));
        if (!cs.exists()) throw new Error();
        const c = cs.data() as any;
        if ((c.estado || "activo") !== "activo" || c.planActivo === false) throw new Error();

        setUsuario({ ...u, authEmail: user.email });
        setClienteId(u.clienteId);
        setCliente(c);
        setLoading(false);
      } catch {
        await signOut(auth);
        router.replace("/login");
      }
    });

    return unsubscribe;
  }, [router]);

  useEffect(() => {
    if (!clienteId) return;
    setSolicitudesLoading(true);

    const q = query(
      collection(db, "clientes", clienteId, "solicitudesPlan"),
      orderBy("creadoEn", "desc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setSolicitudes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setSolicitudesLoading(false);
      },
      (e) => {
        console.error("No fue posible escuchar solicitudes:", e);
        setSolicitudesLoading(false);
      }
    );

    return () => unsubscribe();
  }, [clienteId]);


  const requestTypeLabel = (sol:any) =>
    sol.tipo === "agregar_campana"
      ? `Agregar ${campaignOptions.find(x=>x.id===sol.campanaSolicitada)?.nombre || sol.campanaSolicitada || "campaña"}`
      : `Aumentar multired a ${sol.nivelesSolicitados || "—"} niveles`;

  const uploadReceipt = async (sol:any, file?: File) => {
    if (!file || !clienteId) return;
    try {
      setReceiptUploadingId(sol.id);
      setError("");
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `clientes/${clienteId}/solicitudesPlan/${sol.id}/comprobantes/${Date.now()}-${safeName}`;
      const refFile = storageRef(storage, path);
      await uploadBytes(refFile, file);
      const url = await getDownloadURL(refFile);

      await updateDoc(doc(db, "clientes", clienteId, "solicitudesPlan", sol.id), {
        comprobantePago: {
          nombre: file.name,
          url,
          storagePath: path,
          subidoEn: serverTimestamp(),
        },
        estadoPago: "comprobante_enviado",
        actualizadoEn: serverTimestamp(),
      });
      setMessage("Comprobante de pago enviado. El administrador podrá revisarlo en tiempo real.");
    } catch(e) {
      console.error(e);
      setError("No fue posible cargar el comprobante de pago.");
    } finally {
      setReceiptUploadingId(null);
    }
  };

  const sendRequestNote = async (sol:any) => {
    const text=requestNote.trim();
    if((!text && !messageFile) || !clienteId) return;

    try {
      setRequestNoteId(sol.id);
      setMessageUploadingId(sol.id);
      setError("");

      let adjunto:any = null;

      if (messageFile) {
        const safeName = messageFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `clientes/${clienteId}/solicitudesPlan/${sol.id}/mensajes/${Date.now()}-${safeName}`;
        const fileRef = storageRef(storage, path);
        await uploadBytes(fileRef, messageFile);
        const url = await getDownloadURL(fileRef);
        adjunto = {
          nombre: messageFile.name,
          url,
          storagePath: path,
          tipo: messageFile.type || "",
          tamano: messageFile.size || 0,
        };
      }

      const messageRef=doc(collection(db,"clientes",clienteId,"solicitudesPlan",sol.id,"mensajes"));
      await setDoc(messageRef,{
        autor:"cliente",
        autorNombre: cliente?.nombreCliente || "Cliente",
        mensaje:text,
        adjunto,
        creadoEn:serverTimestamp(),
      });

      await updateDoc(doc(db,"clientes",clienteId,"solicitudesPlan",sol.id),{
        ultimoMensajeCliente:text || (adjunto ? `Archivo adjunto: ${adjunto.nombre}` : ""),
        ultimoMensajeClienteAdjunto: adjunto,
        ultimoMensajeClienteEn:serverTimestamp(),
        actualizadoEn:serverTimestamp(),
      });

      setRequestNote("");
      setMessageFile(null);
      setMessage("Mensaje enviado al administrador.");
    } catch(e) {
      console.error(e);
      setError("No fue posible enviar el mensaje o archivo.");
    } finally {
      setMessageUploadingId(null);
    }
  };

  const campaignOptions = [
    { id: "edil", nombre: "Edil / JAL" },
    { id: "concejo", nombre: "Concejo" },
    { id: "alcaldia", nombre: "Alcaldía" },
    { id: "asamblea", nombre: "Asamblea" },
    { id: "gobernacion", nombre: "Gobernación" },
    { id: "presidencia", nombre: "Presidencia" },
  ];

  const activeCampaignIds = new Set(
    (Array.isArray(cliente?.plan?.preciosCampana) ? cliente.plan.preciosCampana : [])
      .filter((p:any)=>p?.activo !== false)
      .map((p:any)=>String(p.id || "").toLowerCase())
  );

  const availableUpgrades = campaignOptions.filter(p=>!activeCampaignIds.has(p.id));

  const openCampaignUpgrade = () => {
    setUpgradeType("campana");
    setRequestedCampaign(availableUpgrades[0]?.id || "");
    setMessage("");
    setError("");
    setUpgradeOpen(true);
  };

  const openLevelUpgrade = () => {
    setUpgradeType("niveles");
    setRequestedLevels(Number(cliente?.nivelesRed || 1) + 1);
    setMessage("");
    setError("");
    setUpgradeOpen(true);
  };

  const solicitarAmpliacion = async () => {
    setError("");
    if (!clienteId) return;
    if (upgradeType === "campana" && !requestedCampaign) {
      setError("No hay otro tipo de campaña disponible para solicitar.");
      return;
    }
    if (upgradeType === "niveles" && requestedLevels <= Number(cliente?.nivelesRed || 1)) {
      setError("Selecciona una cantidad superior a tus niveles actuales.");
      return;
    }
    try {
      setSending(true);
      const requestRef = doc(collection(db, "clientes", clienteId, "solicitudesPlan"));
      await setDoc(requestRef, {
        tipo: upgradeType === "campana" ? "agregar_campana" : "aumentar_niveles",
        campanaSolicitada: upgradeType === "campana" ? requestedCampaign : null,
        nivelesActuales: Number(cliente?.nivelesRed || 1),
        nivelesSolicitados: upgradeType === "niveles" ? requestedLevels : null,
        planActual: { id: cliente?.plan?.id || "", nombre: cliente?.plan?.nombre || "" },
        origen: "perfil",
        estado: "pendiente",
        creadoEn: serverTimestamp(),
      });
      setUpgradeOpen(false);
      setMessage("Solicitud enviada correctamente. El administrador Master podrá revisarla y responder a la ampliación.");
    } catch(e) {
      console.error(e);
      setError("No fue posible enviar la solicitud de ampliación.");
    } finally {
      setSending(false);
    }
  };
  if (loading) return <div className="flex min-h-screen items-center justify-center bg-[#f4f7f8] text-sm text-slate-500">Cargando perfil...</div>;

  const money = (v: any) =>
    new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(Number(v || 0));

  return (
    <main className="min-h-screen bg-[#f4f7f8]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1200px] items-center gap-4 px-4 py-5 sm:px-7">
          <button onClick={() => router.push("/dashboard")} className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50">←</button>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.15em] text-emerald-600">Mi cuenta</p>
            <h1 className="text-xl font-semibold text-slate-950">Perfil del cliente</h1>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1200px] px-4 py-7 sm:px-7">
        <section className="flex flex-col gap-5 rounded-3xl bg-gradient-to-br from-[#073b38] to-[#0a8377] p-6 text-white sm:flex-row sm:items-center sm:p-8">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-3xl bg-white text-xl font-bold text-emerald-700">
            {cliente?.logoURL ? <img src={cliente.logoURL} alt="Logo" className="h-full w-full object-contain p-2" /> : "AP"}
          </div>
          <div>
            <p className="text-sm text-emerald-100/70">{cliente?.tipoCliente === "agencia" ? "Agencia" : "Candidato"}</p>
            <h2 className="mt-1 text-2xl font-semibold">{cliente?.nombreCliente}</h2>
            <p className="mt-2 text-sm text-white/60">{cliente?.nombreCampana || "Sin nombre de campaña"}</p>
          </div>
        </section>

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <Card title="Datos del cliente">
            <Row label="Nombre / razón social" value={cliente?.nombreCliente} />
            <Row label="Identificación" value={cliente?.identificacion} />
            <Row label="Tipo de cliente" value={cliente?.tipoCliente === "agencia" ? "Agencia" : "Candidato"} />
            <Row label="Responsable" value={cliente?.responsable} />
            <Row label="Correo" value={cliente?.email || usuario?.authEmail} />
            <Row label="Teléfono" value={cliente?.telefono} />
          </Card>

          <Card title="Información política">
            <Row label="Campaña" value={cliente?.nombreCampana} />
            <Row label="Partido / movimiento" value={cliente?.partidoMovimiento} />
            <Row label="Cargo aspirado" value={cliente?.cargoAspirado} />
            <Row label="Niveles de multired permitidos" value={`${cliente?.nivelesRed || 1} niveles`} />
          </Card>

          <Card title="Ubicación">
            <Row label="País" value={cliente?.ubicacion?.pais} />
            <Row label="Departamento" value={cliente?.ubicacion?.departamento} />
            <Row label="Ciudad / municipio" value={cliente?.ubicacion?.ciudad} />
            <Row label="Dirección" value={cliente?.ubicacion?.direccion} />
          </Card>

          <Card title="Plan y membresía">
            <Row label="Plan" value={cliente?.plan?.nombre} />
            <Row label="Duración" value={cliente?.plan?.meses === 0 ? "Free" : cliente?.plan?.meses ? `${cliente.plan.meses} meses` : "—"} />
            <Row label="Valor" value={money(cliente?.plan?.valorBaseTotal ?? cliente?.plan?.valor)} />
            <Row label="Descuento" value={`${cliente?.plan?.descuento || 0}%`} />
            <Row label="Valor final" value={money(cliente?.plan?.valorFinal ?? cliente?.plan?.valor)} />
            <Row label="Estado del pago" value={cliente?.pago?.estado || "pendiente"} />
            <Row label="Estado del plan" value={cliente?.planActivo ? "Activo" : "Inactivo"} />

            {Array.isArray(cliente?.plan?.preciosCampana) && (
              <div className="mt-5 border-t border-slate-100 pt-5">
                <p className="text-[10px] font-bold uppercase tracking-[.13em] text-slate-400">Campañas incluidas</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {cliente.plan.preciosCampana.filter((p:any)=>p?.activo !== false).map((p:any)=>(
                    <span key={p.id} className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[10px] font-bold text-emerald-700">{p.nombre}</span>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-5 rounded-2xl bg-gradient-to-br from-[#0b1b30] to-[#1464d2] p-4 text-white">
              <p className="text-[10px] font-bold uppercase tracking-[.14em] text-blue-200">Amplía tu membresía</p>
              <p className="mt-2 text-sm font-bold">¿Necesitas más capacidad?</p>
              <p className="mt-1 text-[10px] leading-5 text-white/60">Solicita nuevas campañas o más niveles de multired. La solicitud llegará directamente al administrador Master.</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <button type="button" onClick={openCampaignUpgrade} disabled={availableUpgrades.length===0} className="rounded-xl bg-white px-3 py-2.5 text-[10px] font-bold text-[#0b1b30] disabled:cursor-not-allowed disabled:opacity-40">
                  + Agregar campaña
                </button>
                <button type="button" onClick={openLevelUpgrade} className="rounded-xl border border-white/20 bg-white/10 px-3 py-2.5 text-[10px] font-bold text-white">
                  + Aumentar niveles
                </button>
              </div>
              {availableUpgrades.length===0 && <p className="mt-2 text-[9px] text-emerald-200">Ya tienes todos los tipos de campaña disponibles.</p>}
            </div>
          </Card>
        </div>

        {(message || error) && (
          <div className="mt-5">
            {message && <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{message}</div>}
            {error && <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>}
          </div>
        )}

        <section className="mt-5 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-5 sm:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[.14em] text-blue-600">Canal con administración</p>
                <h3 className="mt-1 text-lg font-semibold text-slate-950">Mis solicitudes de ampliación</h3>
                <p className="mt-1 text-xs text-slate-400">Consulta la respuesta del Master, valores aprobados y envía el comprobante de pago cuando corresponda.</p>
              </div>
              <span className="w-fit rounded-full bg-slate-100 px-3 py-1.5 text-[10px] font-bold text-slate-600">{solicitudes.length} solicitudes</span>
            </div>
          </div>

          {solicitudesLoading ? (
            <div className="flex min-h-[150px] items-center justify-center text-xs text-slate-400">Cargando solicitudes...</div>
          ) : solicitudes.length===0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm font-semibold text-slate-700">Aún no tienes solicitudes</p>
              <p className="mt-1 text-xs text-slate-400">Cuando solicites una ampliación podrás seguir todo el proceso desde aquí.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {solicitudes.map((sol:any)=>{
                const status=String(sol.estado||"pendiente");
                const value=Number(sol.valorAdicional||0);
                return (
                  <article key={sol.id} className="p-5 sm:p-6">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-sm font-bold text-slate-900">{requestTypeLabel(sol)}</h4>
                          <span className={`rounded-full px-2.5 py-1 text-[9px] font-bold uppercase ${
                            status==="aprobada"?"bg-emerald-50 text-emerald-700":
                            status==="rechazada"?"bg-red-50 text-red-600":
                            status==="pago_pendiente"?"bg-blue-50 text-blue-700":
                            "bg-amber-50 text-amber-700"
                          }`}>{status.replaceAll("_"," ")}</span>
                        </div>
                        <p className="mt-1 text-[10px] text-slate-400">Plan: {sol.planActual?.nombre || cliente?.plan?.nombre || "Actual"}</p>
                      </div>

                      {value>0 && (
                        <div className="rounded-2xl bg-slate-950 px-4 py-3 text-white lg:text-right">
                          <p className="text-[9px] uppercase tracking-wide text-white/50">Valor adicional</p>
                          <p className="mt-1 text-base font-bold">{money(value)}</p>
                        </div>
                      )}
                    </div>

                    {(sol.respuestaAdmin || sol.observacionAdmin || sol.notaAdmin) && (
                      <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-4">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-blue-600">Respuesta del administrador</p>
                        <p className="mt-2 text-xs leading-5 text-blue-800">{sol.respuestaAdmin || sol.observacionAdmin || sol.notaAdmin}</p>
                      </div>
                    )}

                    {(sol.ultimoMensajeCliente || sol.ultimoMensajeClienteAdjunto?.url) && (
                      <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2.5">
                        <p className="text-[9px] font-bold uppercase text-slate-400">Tu último envío</p>
                        {sol.ultimoMensajeCliente && <p className="mt-1 text-[11px] text-slate-600">{sol.ultimoMensajeCliente}</p>}
                        {sol.ultimoMensajeClienteAdjunto?.url && (
                          <a href={sol.ultimoMensajeClienteAdjunto.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-[9px] font-bold text-blue-600 shadow-sm">
                            📎 {sol.ultimoMensajeClienteAdjunto.nombre || "Ver archivo"}
                          </a>
                        )}
                      </div>
                    )}

                    {sol.comprobantePago?.url ? (
                      <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-xs font-bold text-emerald-800">Comprobante enviado</p>
                          <p className="mt-1 max-w-[450px] truncate text-[10px] text-emerald-600">{sol.comprobantePago?.nombre || "Archivo adjunto"}</p>
                        </div>
                        <a href={sol.comprobantePago.url} target="_blank" rel="noreferrer" className="w-fit rounded-lg bg-white px-3 py-2 text-[10px] font-bold text-emerald-700 shadow-sm">Ver comprobante</a>
                      </div>
                    ) : value>0 && status!=="rechazada" ? (
                      <div className="mt-4 rounded-2xl border border-dashed border-blue-200 bg-blue-50/40 p-4">
                        <p className="text-xs font-bold text-blue-800">Adjuntar comprobante de pago</p>
                        <p className="mt-1 text-[10px] leading-5 text-blue-600">Cuando realices el pago de {money(value)}, adjunta el soporte para que el Master pueda verificarlo y completar la aprobación.</p>
                        <label className="mt-3 inline-flex cursor-pointer rounded-xl bg-blue-600 px-4 py-2.5 text-[10px] font-bold text-white">
                          {receiptUploadingId===sol.id?"Subiendo...":"Seleccionar comprobante"}
                          <input type="file" className="hidden" disabled={receiptUploadingId===sol.id} onChange={e=>uploadReceipt(sol,e.target.files?.[0])}/>
                        </label>
                      </div>
                    ) : null}

                    {status!=="rechazada" && (
                      <div className="mt-4 border-t border-slate-100 pt-4">
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Escribir al administrador</p>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2">
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <input
                              value={requestNoteId===sol.id ? requestNote : ""}
                              onFocus={()=>{if(requestNoteId!==sol.id){setRequestNoteId(sol.id);setRequestNote("");setMessageFile(null);}}}
                              onChange={e=>{setRequestNoteId(sol.id);setRequestNote(e.target.value);}}
                              placeholder="Escribe un mensaje al administrador..."
                              className="h-10 min-w-0 flex-1 rounded-xl border border-transparent bg-white px-3 text-xs outline-none focus:border-blue-300"
                            />
                            <div className="flex gap-2">
                              <label
                                onClick={()=>{if(requestNoteId!==sol.id){setRequestNoteId(sol.id);setRequestNote("");setMessageFile(null);}}}
                                title="Adjuntar archivo"
                                className="flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-bold text-slate-600 hover:border-blue-200 hover:text-blue-600"
                              >
                                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                                  <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                                </svg>
                                Adjuntar
                                <input
                                  type="file"
                                  className="hidden"
                                  onChange={e=>{
                                    setRequestNoteId(sol.id);
                                    setMessageFile(e.target.files?.[0] || null);
                                    e.currentTarget.value="";
                                  }}
                                />
                              </label>
                              <button
                                type="button"
                                onClick={()=>sendRequestNote(sol)}
                                disabled={requestNoteId!==sol.id || (!requestNote.trim() && !messageFile) || messageUploadingId===sol.id}
                                className="h-10 rounded-xl bg-slate-900 px-4 text-[10px] font-bold text-white disabled:opacity-40"
                              >
                                {messageUploadingId===sol.id ? "Enviando..." : "Enviar"}
                              </button>
                            </div>
                          </div>

                          {requestNoteId===sol.id && messageFile && (
                            <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2">
                              <div className="min-w-0">
                                <p className="truncate text-[10px] font-bold text-blue-800">{messageFile.name}</p>
                                <p className="mt-0.5 text-[9px] text-blue-500">{(messageFile.size/1024/1024).toFixed(2)} MB · Listo para enviar</p>
                              </div>
                              <button type="button" onClick={()=>setMessageFile(null)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-xs font-bold text-red-500">×</button>
                            </div>
                          )}

                          <p className="mt-2 px-1 text-[9px] leading-4 text-slate-400">
                            Puedes enviar solo un mensaje, solo un archivo o ambos. El archivo quedará asociado a esta solicitud.
                          </p>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {cliente?.observaciones && (
          <div className="mt-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="font-semibold text-slate-900">Observaciones</h3>
            <p className="mt-3 text-sm leading-6 text-slate-500">{cliente.observaciones}</p>
          </div>
        )}
      </div>

      {upgradeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="bg-gradient-to-r from-[#0b1b30] to-[#1464d2] p-6 text-white">
              <p className="text-[10px] font-bold uppercase tracking-[.15em] text-blue-200">Ampliar membresía</p>
              <h3 className="mt-2 text-xl font-bold">{upgradeType==="campana"?"Agregar tipo de campaña":"Aumentar niveles de multired"}</h3>
              <p className="mt-2 text-xs leading-5 text-white/60">Envía la solicitud sin salir de tu perfil. La ampliación se activará cuando sea revisada y aprobada.</p>
            </div>
            <div className="p-6">
              {upgradeType==="campana" ? (
                <div>
                  <label className="mb-2 block text-xs font-semibold text-slate-700">Nueva campaña</label>
                  <select value={requestedCampaign} onChange={e=>setRequestedCampaign(e.target.value)} className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-400">
                    {availableUpgrades.map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                  <div className="mt-4 rounded-2xl bg-slate-50 p-4">
                    <p className="text-[10px] font-bold uppercase text-slate-400">Actualmente incluidas</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(cliente?.plan?.preciosCampana || []).filter((p:any)=>p?.activo !== false).map((p:any)=><span key={p.id} className="rounded-lg bg-white px-2 py-1 text-[9px] font-semibold text-slate-600">{p.nombre}</span>)}
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="mb-2 block text-xs font-semibold text-slate-700">Niveles solicitados</label>
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={()=>setRequestedLevels(v=>Math.max(Number(cliente?.nivelesRed||1)+1,v-1))} className="h-12 w-12 rounded-xl bg-slate-100 text-lg font-bold text-slate-700">−</button>
                    <input type="number" min={Number(cliente?.nivelesRed||1)+1} value={requestedLevels} onChange={e=>setRequestedLevels(Number(e.target.value||0))} className="h-12 min-w-0 flex-1 rounded-xl border border-slate-200 text-center text-sm font-bold outline-none focus:border-blue-400"/>
                    <button type="button" onClick={()=>setRequestedLevels(v=>v+1)} className="h-12 w-12 rounded-xl bg-slate-100 text-lg font-bold text-slate-700">+</button>
                  </div>
                  <p className="mt-2 text-[10px] text-slate-400">Tu membresía actual permite {cliente?.nivelesRed||1} niveles.</p>
                </div>
              )}

              <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-4">
                <p className="text-xs font-bold text-blue-800">¿Qué ocurre después?</p>
                <p className="mt-1 text-[11px] leading-5 text-blue-600">El Master recibirá esta solicitud en tiempo real. Podrá revisarla, definir el valor adicional cuando corresponda y aprobarla o rechazarla.</p>
              </div>
              <div className="mt-6 grid grid-cols-2 gap-3">
                <button type="button" onClick={()=>setUpgradeOpen(false)} disabled={sending} className="rounded-xl border border-slate-200 px-4 py-3 text-xs font-bold text-slate-600">Cancelar</button>
                <button type="button" onClick={solicitarAmpliacion} disabled={sending} className="rounded-xl bg-blue-600 px-4 py-3 text-xs font-bold text-white disabled:opacity-50">{sending?"Enviando...":"Enviar solicitud"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><h3 className="mb-5 text-base font-semibold text-slate-900">{title}</h3><div>{children}</div></section>;
}

function Row({ label, value }: { label: string; value?: string }) {
  return <div className="flex flex-col gap-1 border-b border-slate-100 py-3 first:pt-0 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-5"><span className="text-xs text-slate-400">{label}</span><span className="break-words text-sm font-medium text-slate-700 sm:max-w-[60%] sm:text-right">{value || "—"}</span></div>;
}
