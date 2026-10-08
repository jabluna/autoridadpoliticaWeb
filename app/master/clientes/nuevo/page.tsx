"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { createUserWithEmailAndPassword, getAuth, onAuthStateChanged, signOut } from "firebase/auth";
import { addDoc, collection, doc, getDoc, getDocs, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { deleteApp, initializeApp } from "firebase/app";
import { useRouter, useSearchParams } from "next/navigation";
import { auth, db, storage, firebaseConfig } from "@/lib/firebase";

type PrecioCampana = {
  id: string;
  nombre: string;
  categoria: "municipal" | "departamental" | "nacional" | "personalizada";
  valor: number;
  activo: boolean;
  esBase?: boolean;
};

type Plan = {
  id: string;
  nombre: string;
  meses: number;
  valor?: number;
  descuento?: number;
  estado: string;
  tipo?: string;
  descripcion?: string;
  preciosCampana?: PrecioCampana[];
};

export default function NuevoClientePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("id");
  const isEditing = !!editId;
  const [checking, setChecking] = useState(true);
  const [loadingClient, setLoadingClient] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logo, setLogo] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState("");
  const [reciboPago, setReciboPago] = useState<File | null>(null);
  const [reciboPagoURL, setReciboPagoURL] = useState("");
  const [estadoPago, setEstadoPago] = useState<"pendiente" | "aprobado" | "rechazado">("pendiente");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [customPlanOpen, setCustomPlanOpen] = useState(false);
  const [customPlan, setCustomPlan] = useState({
    nombre: "Personalizado",
    meses: "3",
    descuento: "0",
    descripcion: "",
  });
  const [customPrices, setCustomPrices] = useState<PrecioCampana[]>([
    { id: "edil", nombre: "Edil / JAL", categoria: "municipal", valor: 0, activo: false },
    { id: "concejo", nombre: "Concejo", categoria: "municipal", valor: 0, activo: false },
    { id: "alcaldia", nombre: "Alcaldía", categoria: "municipal", valor: 0, activo: false },
    { id: "asamblea", nombre: "Asamblea", categoria: "departamental", valor: 0, activo: false },
    { id: "gobernacion", nombre: "Gobernación", categoria: "departamental", valor: 0, activo: false },
    { id: "presidencia", nombre: "Presidencia", categoria: "nacional", valor: 0, activo: false },
  ]);
  const [usingCustomPlan, setUsingCustomPlan] = useState(false);
  const [planSearch, setPlanSearch] = useState("");
  const [planDurationFilter, setPlanDurationFilter] = useState("todos");
  const [planPickerOpen, setPlanPickerOpen] = useState(false);
  const [commercialRequests, setCommercialRequests] = useState<any[]>([]);
  const [channelRequest, setChannelRequest] = useState<any | null>(null);
  const [channelMessages, setChannelMessages] = useState<any[]>([]);
  const [adminReply, setAdminReply] = useState("");
  const [adminReplyFile, setAdminReplyFile] = useState<File | null>(null);
  const [channelSending, setChannelSending] = useState(false);
  const [commercialValue, setCommercialValue] = useState("");
  const [adminResponse, setAdminResponse] = useState("");
  const [commercialBusy, setCommercialBusy] = useState(false);

  const [form, setForm] = useState({
    tipoCliente: "candidato",
    nombreCliente: "",
    identificacion: "",
    nombreCampana: "",
    partidoMovimiento: "",
    cargoAspirado: "",
    responsable: "",
    email: "",
    telefono: "",
    ciudad: "",
    departamento: "",
    pais: "Colombia",
    direccion: "",
    planId: "",
    nivelesRed: "3",
    passwordTemporal: "",
    observaciones: "",
  });

  useEffect(() => onAuthStateChanged(auth, user => {
    if (!user) return router.replace("/master/login");
    setChecking(false);
  }), [router]);

  useEffect(() => {
    if (checking) return;
    (async () => {
      try {
        setLoadingPlans(true);
        const snap = await getDocs(query(collection(db, "planes"), orderBy("meses")));
        const rows = snap.docs
          .map(d => ({ id: d.id, ...d.data() } as Plan))
          .filter(p => p.estado === "activo");
        setPlans(rows);
        if (rows.length && !form.planId) {
          setForm(v => ({ ...v, planId: rows[0].id }));
        }
      } catch (e) {
        console.error(e);
        setError("No fue posible cargar los planes disponibles.");
      } finally {
        setLoadingPlans(false);
      }
    })();
  }, [checking]);

  const selectedPlan = useMemo(
    () => plans.find(p => p.id === form.planId),
    [plans, form.planId]
  );

  const money = (value: number) =>
    new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(value || 0);

  const finalPrice = (value: number, discount = 0) =>
    Math.max(0, Number(value || 0) * (1 - Number(discount || 0) / 100));

  const effectivePlan = useMemo(() => {
    if (usingCustomPlan) {
      return {
        id: "personalizado_cliente",
        nombre: customPlan.nombre.trim() || "Personalizado",
        meses: Number(customPlan.meses || 0),
        descuento: Number(customPlan.descuento || 0),
        descripcion: customPlan.descripcion.trim(),
        tipo: "personalizado_cliente",
        preciosCampana: customPrices,
      } as Plan;
    }
    return selectedPlan;
  }, [usingCustomPlan, customPlan, customPrices, selectedPlan]);

  const enabledPlanPrices = useMemo(
    () => (effectivePlan?.preciosCampana || []).filter(p => p.activo),
    [effectivePlan]
  );

  const filteredPlans = useMemo(() => {
    const q = planSearch.trim().toLowerCase();
    return plans.filter(p => {
      const campaigns = (p.preciosCampana || [])
        .filter(x => x.activo)
        .map(x => x.nombre)
        .join(" ")
        .toLowerCase();

      const matchesSearch =
        !q ||
        p.nombre.toLowerCase().includes(q) ||
        campaigns.includes(q) ||
        (p.descripcion || "").toLowerCase().includes(q);

      const matchesDuration =
        planDurationFilter === "todos" ||
        String(p.meses) === planDurationFilter;

      return matchesSearch && matchesDuration;
    });
  }, [plans, planSearch, planDurationFilter]);

  useEffect(() => {
    if (checking || !editId) return;

    (async () => {
      try {
        setLoadingClient(true);
        const snap = await getDoc(doc(db, "clientes", editId));
        if (!snap.exists()) {
          setError("El cliente que intentas editar no existe.");
          return;
        }

        const c: any = snap.data();
        setForm({
          tipoCliente: c.tipoCliente || "candidato",
          nombreCliente: c.nombreCliente || "",
          identificacion: c.identificacion || "",
          nombreCampana: c.nombreCampana || "",
          partidoMovimiento: c.partidoMovimiento || "",
          cargoAspirado: c.cargoAspirado || "",
          responsable: c.responsable || "",
          email: c.email || "",
          telefono: c.telefono || "",
          ciudad: c.ubicacion?.ciudad || "",
          departamento: c.ubicacion?.departamento || "",
          pais: c.ubicacion?.pais || "Colombia",
          direccion: c.ubicacion?.direccion || "",
          planId: c.plan?.id || "",
          nivelesRed: String(c.nivelesRed || 1),
          passwordTemporal: "",
          observaciones: c.observaciones || "",
        });
        setLogoPreview(c.logoURL || "");
        setReciboPagoURL(c.pago?.reciboURL || "");
        setEstadoPago(c.pago?.estado || "pendiente");
        if (c.plan?.tipo === "personalizado_cliente") {
          setUsingCustomPlan(true);
          setCustomPlanOpen(true);
          setCustomPlan({
            nombre: c.plan?.nombre || "Personalizado",
            meses: String(c.plan?.meses || 0),
            descuento: String(c.plan?.descuento || 0),
            descripcion: c.plan?.descripcion || "",
          });
          if (Array.isArray(c.plan?.preciosCampana)) {
            setCustomPrices(c.plan.preciosCampana);
          }
        }
      } catch (e) {
        console.error(e);
        setError("No fue posible cargar la información del cliente.");
      } finally {
        setLoadingClient(false);
      }
    })();
  }, [checking, editId]);

  useEffect(() => {
    if (!editId) {
      setCommercialRequests([]);
      return;
    }
    const q = query(
      collection(db, "clientes", editId, "solicitudesPlan"),
      orderBy("creadoEn", "desc")
    );
    return onSnapshot(q, snap => {
      const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setCommercialRequests(rows);
      setChannelRequest(prev => prev ? rows.find((x:any)=>x.id===prev.id) || prev : prev);
    }, e => console.error("Solicitudes en tiempo real:", e));
  }, [editId]);

  useEffect(() => {
    if (!editId || !channelRequest?.id) {
      setChannelMessages([]);
      return;
    }
    const q = query(
      collection(db, "clientes", editId, "solicitudesPlan", channelRequest.id, "mensajes"),
      orderBy("creadoEn", "asc")
    );
    return onSnapshot(q, snap => {
      setChannelMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, e => console.error("Mensajes del canal:", e));
  }, [editId, channelRequest?.id]);

  const campaignMeta = (id:string) => {
    const map:any = {
      edil: ["Edil / JAL", "municipal"],
      concejo: ["Concejo", "municipal"],
      alcaldia: ["Alcaldía", "municipal"],
      asamblea: ["Asamblea", "departamental"],
      gobernacion: ["Gobernación", "departamental"],
      presidencia: ["Presidencia", "nacional"],
    };
    return map[String(id||"").toLowerCase()] || [id || "Campaña", "personalizada"];
  };

  const requestLabel = (r:any) =>
    r?.tipo === "agregar_campana"
      ? `Agregar ${campaignMeta(r?.campanaSolicitada)[0]}`
      : `Aumentar multired a ${r?.nivelesSolicitados || "—"} niveles`;

  const openCommercialChannel = (r:any) => {
    setChannelRequest(r);
    setCommercialValue(String(r?.valorAdicional || ""));
    setAdminResponse(r?.respuestaAdmin || r?.observacionAdmin || r?.notaAdmin || "");
    setAdminReply("");
    setAdminReplyFile(null);
  };

  const saveCommercialResponse = async (r:any) => {
    if (!editId) return;
    try {
      setCommercialBusy(true);
      const value = Math.max(0, Number(commercialValue || 0));
      await updateDoc(doc(db, "clientes", editId, "solicitudesPlan", r.id), {
        valorAdicional: value,
        respuestaAdmin: adminResponse.trim(),
        estado: value > 0 ? "pago_pendiente" : (r.estado || "pendiente"),
        respondidoEn: serverTimestamp(),
        actualizadoEn: serverTimestamp(),
      });
      setMessage("Cotización / respuesta enviada al cliente.");
    } catch(e) {
      console.error(e);
      setError("No fue posible guardar la respuesta comercial.");
    } finally {
      setCommercialBusy(false);
    }
  };

  const sendAdminChannelMessage = async () => {
    if (!editId || !channelRequest?.id || (!adminReply.trim() && !adminReplyFile)) return;
    try {
      setChannelSending(true);
      let adjunto:any = null;
      if (adminReplyFile) {
        const safe = adminReplyFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `clientes/${editId}/solicitudesPlan/${channelRequest.id}/mensajes/${Date.now()}-${safe}`;
        const fileRef = ref(storage, path);
        await uploadBytes(fileRef, adminReplyFile);
        const url = await getDownloadURL(fileRef);
        adjunto = {
          nombre: adminReplyFile.name,
          url,
          storagePath: path,
          tipo: adminReplyFile.type || "",
          tamano: adminReplyFile.size || 0,
        };
      }
      const mref = doc(collection(db, "clientes", editId, "solicitudesPlan", channelRequest.id, "mensajes"));
      await setDoc(mref, {
        autor: "master",
        autorNombre: auth.currentUser?.email || "Administrador",
        mensaje: adminReply.trim(),
        adjunto,
        creadoEn: serverTimestamp(),
      });
      await updateDoc(doc(db, "clientes", editId, "solicitudesPlan", channelRequest.id), {
        ultimoMensajeAdmin: adminReply.trim() || (adjunto ? `Archivo adjunto: ${adjunto.nombre}` : ""),
        ultimoMensajeAdminAdjunto: adjunto,
        ultimoMensajeAdminEn: serverTimestamp(),
        actualizadoEn: serverTimestamp(),
      });
      setAdminReply("");
      setAdminReplyFile(null);
    } catch(e) {
      console.error(e);
      setError("No fue posible enviar el mensaje.");
    } finally {
      setChannelSending(false);
    }
  };

  const approveCommercialRequest = async (r:any) => {
    if (!editId) return;
    if (Number(r?.valorAdicional || commercialValue || 0) > 0 && !r?.comprobantePago?.url) {
      setError("Esta solicitud tiene valor adicional y todavía no tiene comprobante de pago.");
      return;
    }
    if (!window.confirm("¿Aprobar esta solicitud y aplicar la ampliación a la membresía del cliente?")) return;
    try {
      setCommercialBusy(true);
      const clientSnap = await getDoc(doc(db, "clientes", editId));
      if (!clientSnap.exists()) throw new Error("Cliente no encontrado");
      const c:any = clientSnap.data();

      if (r.tipo === "aumentar_niveles") {
        const requested = Number(r.nivelesSolicitados || 0);
        if (requested <= Number(c.nivelesRed || 1)) throw new Error("Los niveles solicitados no superan los actuales.");
        await updateDoc(doc(db, "clientes", editId), {
          nivelesRed: requested,
          actualizadoEn: serverTimestamp(),
        });
        setForm(v=>({...v, nivelesRed:String(requested)}));
      } else if (r.tipo === "agregar_campana") {
        const id = String(r.campanaSolicitada || "").toLowerCase();
        const [nombre, categoria] = campaignMeta(id);
        const prices = Array.isArray(c.plan?.preciosCampana) ? [...c.plan.preciosCampana] : [];
        const idx = prices.findIndex((x:any)=>String(x.id||"").toLowerCase()===id);
        const priceRow = {
          id,
          nombre,
          categoria,
          valor: Number(r.valorAdicional || commercialValue || 0),
          activo: true,
          esBase: ["edil","concejo","alcaldia","asamblea","gobernacion","presidencia"].includes(id),
        };
        if (idx >= 0) prices[idx] = { ...prices[idx], ...priceRow, activo:true };
        else prices.push(priceRow);
        await updateDoc(doc(db, "clientes", editId), {
          "plan.preciosCampana": prices,
          actualizadoEn: serverTimestamp(),
        });
      }

      await updateDoc(doc(db, "clientes", editId, "solicitudesPlan", r.id), {
        estado: "aprobada",
        estadoPago: r.comprobantePago?.url ? "aprobado" : (Number(r.valorAdicional || commercialValue || 0) > 0 ? "aprobado" : "no_requerido"),
        respuestaAdmin: adminResponse.trim() || r.respuestaAdmin || "Solicitud aprobada y aplicada a la membresía.",
        resueltoEn: serverTimestamp(),
        resueltoPor: auth.currentUser?.email || "",
        actualizadoEn: serverTimestamp(),
      });
      setMessage("Solicitud aprobada y ampliación aplicada correctamente.");
    } catch(e:any) {
      console.error(e);
      setError(e?.message || "No fue posible aprobar la solicitud.");
    } finally {
      setCommercialBusy(false);
    }
  };

  const rejectCommercialRequest = async (r:any) => {
    if (!editId) return;
    if (!window.confirm("¿Rechazar esta solicitud?")) return;
    try {
      setCommercialBusy(true);
      await updateDoc(doc(db, "clientes", editId, "solicitudesPlan", r.id), {
        estado: "rechazada",
        respuestaAdmin: adminResponse.trim() || r.respuestaAdmin || "Solicitud rechazada por administración.",
        resueltoEn: serverTimestamp(),
        resueltoPor: auth.currentUser?.email || "",
        actualizadoEn: serverTimestamp(),
      });
      setMessage("Solicitud rechazada.");
    } catch(e) {
      console.error(e);
      setError("No fue posible rechazar la solicitud.");
    } finally {
      setCommercialBusy(false);
    }
  };

  const setField = (key: string, value: string) => {
    setForm(v => ({ ...v, [key]: value }));
    setError("");
    setMessage("");
  };

  const generateTemporaryPassword = () => {
    const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const lower = "abcdefghijkmnopqrstuvwxyz";
    const numbers = "23456789";
    const symbols = "!@#$%*";
    const all = upper + lower + numbers + symbols;
    const pick = (chars: string) => chars[Math.floor(Math.random() * chars.length)];
    const chars = [pick(upper), pick(lower), pick(numbers), pick(symbols)];
    while (chars.length < 10) chars.push(pick(all));
    chars.sort(() => Math.random() - 0.5);
    setField("passwordTemporal", chars.join(""));
  };

  const handleLogo = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Selecciona una imagen válida para el logo.");
      return;
    }
    setLogo(file);
    setLogoPreview(URL.createObjectURL(file));
    setError("");
  };


  const handleReceipt = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (!file) return;
    setReciboPago(file);
    setError("");
    setMessage("");
  };

  const saveClient = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");

    const niveles = Number(form.nivelesRed);
    if (!form.nombreCliente.trim() || !form.identificacion.trim() || !form.email.trim() || !form.telefono.trim()) {
      return setError("Completa los campos obligatorios del cliente.");
    }
    if (!usingCustomPlan && !form.planId) return setError("Selecciona un plan de membresía.");
    if (usingCustomPlan) {
      if (!customPlan.nombre.trim()) return setError("Escribe el nombre del plan personalizado.");
      const customMonths = Number(customPlan.meses);
      if (!Number.isInteger(customMonths) || customMonths < 0) return setError("La duración del plan personalizado no es válida.");
      const customDiscount = Number(customPlan.descuento || 0);
      if (!Number.isFinite(customDiscount) || customDiscount < 0 || customDiscount > 100) return setError("El descuento personalizado debe estar entre 0% y 100%.");
      if (!customPrices.some(p => p.activo)) return setError("Activa al menos un tipo de campaña en el plan personalizado.");
    }
    if (!isEditing && (!form.passwordTemporal || form.passwordTemporal.length < 8 ||
        !/[A-Z]/.test(form.passwordTemporal) || !/[a-z]/.test(form.passwordTemporal) ||
        !/\d/.test(form.passwordTemporal) || !/[^A-Za-z0-9]/.test(form.passwordTemporal))) {
      return setError("Genera o escribe una contraseña temporal válida: mínimo 8 caracteres, mayúscula, minúscula, número y símbolo.");
    }
    if (!Number.isInteger(niveles) || niveles < 1) {
      return setError("Los niveles de red deben ser un número entero mayor o igual a 1.");
    }

    setSaving(true);
    let secondaryApp: ReturnType<typeof initializeApp> | null = null;
    try {
      if (isEditing && editId) {
        const currentSnap = await getDoc(doc(db, "clientes", editId));
        if (!currentSnap.exists()) throw new Error("Cliente no encontrado");
        const current: any = currentSnap.data();

        let logoURL = current.logoURL || "";
        if (logo) {
          const safe = logo.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const logoRef = ref(storage, `clientes/${editId}/logo-${Date.now()}-${safe}`);
          await uploadBytes(logoRef, logo);
          logoURL = await getDownloadURL(logoRef);
        }

        const planElegido = effectivePlan || current.plan;
        const descuento = Number(planElegido?.descuento || 0);
        const tarifasActivas = (planElegido?.preciosCampana || []).filter((p: PrecioCampana) => p.activo);
        const valor = tarifasActivas.length === 1 ? Number(tarifasActivas[0].valor || 0) : 0;
        const valorFinal = tarifasActivas.length === 1 ? finalPrice(valor, descuento) : 0;

        let reciboURL = current.pago?.reciboURL || "";
        if (reciboPago) {
          const safeReceipt = reciboPago.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const receiptRef = ref(storage, `clientes/${editId}/pagos/recibo-${Date.now()}-${safeReceipt}`);
          await uploadBytes(receiptRef, reciboPago);
          reciboURL = await getDownloadURL(receiptRef);
        }

        await updateDoc(doc(db, "clientes", editId), {
          tipoCliente: form.tipoCliente,
          nombreCliente: form.nombreCliente.trim(),
          identificacion: form.identificacion.trim(),
          nombreCampana: form.nombreCampana.trim(),
          partidoMovimiento: form.partidoMovimiento.trim(),
          cargoAspirado: form.cargoAspirado.trim(),
          responsable: form.responsable.trim(),
          email: form.email.trim().toLowerCase(),
          telefono: form.telefono.trim(),
          ubicacion: {
            ciudad: form.ciudad.trim(),
            departamento: form.departamento.trim(),
            pais: form.pais.trim(),
            direccion: form.direccion.trim(),
          },
          plan: {
            id: planElegido?.id || form.planId,
            nombre: planElegido?.nombre || current.plan?.nombre || "",
            meses: planElegido?.meses ?? current.plan?.meses ?? 0,
            tipo: planElegido?.tipo || "base",
            descripcion: planElegido?.descripcion || "",
            descuento,
            preciosCampana: tarifasActivas,
            valor,
            valorFinal,
          },
          nivelesRed: niveles,
          observaciones: form.observaciones.trim(),
          logoURL,
          pago: {
            estado: estadoPago,
            reciboURL,
            valorAprobado: estadoPago === "aprobado" ? valorFinal : 0,
          },
          planActivo: estadoPago === "aprobado",
          actualizadoEn: serverTimestamp(),
        });

        if (current.authUid) {
          await updateDoc(doc(db, "usuarios", current.authUid), {
            nombre: form.nombreCliente.trim(),
            tipoCliente: form.tipoCliente,
            actualizadoEn: serverTimestamp(),
          });
        }

        setMessage("Cliente actualizado correctamente.");
        setTimeout(() => router.push("/master/clientes"), 700);
        return;
      }

      secondaryApp = initializeApp(firebaseConfig, `clienteCreator-${Date.now()}`);
      const secondaryAuth = getAuth(secondaryApp);
      const credential = await createUserWithEmailAndPassword(
        secondaryAuth,
        form.email.trim().toLowerCase(),
        form.passwordTemporal
      );
      const uidCliente = credential.user.uid;

      const temp = await addDoc(collection(db, "clientes"), {
        authUid: uidCliente,
        tipoCliente: form.tipoCliente,
        nombreCliente: form.nombreCliente.trim(),
        identificacion: form.identificacion.trim(),
        nombreCampana: form.nombreCampana.trim(),
        partidoMovimiento: form.partidoMovimiento.trim(),
        cargoAspirado: form.cargoAspirado.trim(),
        responsable: form.responsable.trim(),
        email: form.email.trim().toLowerCase(),
        telefono: form.telefono.trim(),
        ubicacion: {
          ciudad: form.ciudad.trim(),
          departamento: form.departamento.trim(),
          pais: form.pais.trim(),
          direccion: form.direccion.trim(),
        },
        plan: {
          id: effectivePlan?.id || form.planId,
          nombre: effectivePlan?.nombre || "",
          meses: effectivePlan?.meses ?? 0,
          tipo: effectivePlan?.tipo || "base",
          descripcion: effectivePlan?.descripcion || "",
          descuento: Number(effectivePlan?.descuento || 0),
          preciosCampana: (effectivePlan?.preciosCampana || []).filter(p => p.activo),
        },
        nivelesRed: niveles,
        observaciones: form.observaciones.trim(),
        logoURL: "",
        pago: {
          estado: estadoPago,
          reciboURL: "",
          valorAprobado: 0,
        },
        planActivo: false,
        acceso: {
          email: form.email.trim().toLowerCase(),
          credencialesPendientesEnvio: true,
          passwordTemporalCreada: true,
        },
        estado: "activo",
        creadoEn: serverTimestamp(),
      });

      let logoURL = "";
      if (logo) {
        const safe = logo.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const logoRef = ref(storage, `clientes/${temp.id}/logo-${Date.now()}-${safe}`);
        await uploadBytes(logoRef, logo);
        logoURL = await getDownloadURL(logoRef);
        await updateDoc(doc(db, "clientes", temp.id), { logoURL });
      }


      let reciboURL = "";
      if (reciboPago) {
        const safeReceipt = reciboPago.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const receiptRef = ref(storage, `clientes/${temp.id}/pagos/recibo-${Date.now()}-${safeReceipt}`);
        await uploadBytes(receiptRef, reciboPago);
        reciboURL = await getDownloadURL(receiptRef);
      }

      const tarifasPlan = (effectivePlan?.preciosCampana || []).filter(p => p.activo);
      const descuentoPlan = Number(effectivePlan?.descuento || 0);
      const valorPlan = tarifasPlan.length === 1 ? Number(tarifasPlan[0].valor || 0) : 0;
      const valorFinalPlan = tarifasPlan.length === 1 ? finalPrice(valorPlan, descuentoPlan) : 0;

      await updateDoc(doc(db, "clientes", temp.id), {
        "plan.valor": valorPlan,
        "plan.descuento": descuentoPlan,
        "plan.valorFinal": valorFinalPlan,
        "plan.preciosCampana": tarifasPlan,
        pago: {
          estado: estadoPago,
          reciboURL,
          valorAprobado: estadoPago === "aprobado" ? valorFinalPlan : 0,
        },
        planActivo: estadoPago === "aprobado",
      });

      await setDoc(doc(db, "usuarios", uidCliente), {
        uid: uidCliente,
        clienteId: temp.id,
        email: form.email.trim().toLowerCase(),
        nombre: form.nombreCliente.trim(),
        rol: "cliente_admin",
        tipoCliente: form.tipoCliente,
        estado: "activo",
        creadoEn: serverTimestamp(),
      });

      await signOut(secondaryAuth);

      setMessage("Cliente y acceso creados correctamente. Las credenciales quedan listas para el futuro envío por EmailJS.");
      setLogo(null);
      setLogoPreview("");
      setReciboPago(null);
      setReciboPagoURL("");
      setEstadoPago("pendiente");
      setForm({
        tipoCliente: "candidato", nombreCliente: "", identificacion: "",
        nombreCampana: "", partidoMovimiento: "", cargoAspirado: "",
        responsable: "", email: "", telefono: "", ciudad: "", departamento: "",
        pais: "Colombia", direccion: "", planId: plans[0]?.id || "",
        nivelesRed: "3", passwordTemporal: "", observaciones: ""
      });
    } catch (e: any) {
      console.error(e);
      if (e?.code === "auth/email-already-in-use") {
        setError("Ya existe un usuario registrado con este correo electrónico.");
      } else if (e?.code === "auth/invalid-email") {
        setError("El correo electrónico no es válido.");
      } else {
        setError("No fue posible crear el cliente. Revisa los permisos de Firebase.");
      }
    } finally {
      if (secondaryApp) {
        try { await deleteApp(secondaryApp); } catch {}
      }
      setSaving(false);
    }
  };

  if (checking || loadingClient) return <div className="flex min-h-screen items-center justify-center bg-[#f5f8ff] text-sm text-slate-500">{checking ? "Validando sesión..." : "Cargando cliente..."}</div>;

  return (
    <main className="min-h-screen bg-[#f5f8ff]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1450px] items-center justify-between gap-4 px-4 py-5 sm:px-7">
          <div className="flex items-center gap-4">
            <button onClick={() => router.push("/master/dashboard")} className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50">←</button>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.16em] text-[#1464d2]">Clientes</p>
              <h1 className="text-xl font-semibold tracking-tight text-slate-950">{isEditing ? "Editar cliente" : "Crear nuevo cliente"}</h1>
            </div>
          </div>
          <span className="hidden rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 sm:block">{isEditing ? "Editando registro" : "Nuevo registro"}</span>
        </div>
      </header>

      <form onSubmit={saveClient} className="mx-auto max-w-[1450px] px-4 py-7 sm:px-7">
        <div className="grid gap-6 xl:grid-cols-[1fr_390px]">
          <div className="space-y-6">
            <Card title="Tipo de cliente" subtitle="Define quién será el titular de la cuenta.">
              <div className="grid gap-3 sm:grid-cols-2">
                <TypeButton active={form.tipoCliente === "candidato"} title="Candidato" text="Campaña gestionada directamente por un candidato o su equipo." onClick={() => setField("tipoCliente", "candidato")} />
                <TypeButton active={form.tipoCliente === "agencia"} title="Agencia" text="Empresa u organización que administra una o varias campañas." onClick={() => setField("tipoCliente", "agencia")} />
              </div>
            </Card>

            <Card title="Información principal" subtitle="Datos básicos de identificación y contacto.">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label={form.tipoCliente === "agencia" ? "Nombre / razón social *" : "Nombre completo del candidato *"} value={form.nombreCliente} onChange={v => setField("nombreCliente", v)} />
                <Field label={form.tipoCliente === "agencia" ? "NIT / identificación *" : "Documento de identidad *"} value={form.identificacion} onChange={v => setField("identificacion", v)} />
                <Field label="Correo electrónico *" type="email" value={form.email} onChange={v => setField("email", v)} />
                <Field label="Teléfono / WhatsApp *" value={form.telefono} onChange={v => setField("telefono", v)} />
                <Field label="Responsable principal" value={form.responsable} onChange={v => setField("responsable", v)} />
                <Field label="País" value={form.pais} onChange={v => setField("pais", v)} />
              </div>
            </Card>

            <Card title="Información política" subtitle="Identifica la campaña y su organización política.">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Nombre de la campaña" value={form.nombreCampana} onChange={v => setField("nombreCampana", v)} placeholder="Ej. Unidos por Fusagasugá" />
                <Field label="Partido / movimiento político" value={form.partidoMovimiento} onChange={v => setField("partidoMovimiento", v)} />
                <Field label="Cargo al que aspira" value={form.cargoAspirado} onChange={v => setField("cargoAspirado", v)} placeholder="Ej. Alcaldía, Concejo, Gobernación..." />
              </div>
            </Card>

            <Card title="Ubicación" subtitle="Referencia territorial principal del cliente.">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Departamento" value={form.departamento} onChange={v => setField("departamento", v)} />
                <Field label="Ciudad / municipio" value={form.ciudad} onChange={v => setField("ciudad", v)} />
                <div className="md:col-span-2">
                  <Field label="Dirección" value={form.direccion} onChange={v => setField("direccion", v)} />
                </div>
              </div>
            </Card>

            {isEditing && (
              <Card title="Canal comercial y solicitudes" subtitle="Conversación, comprobantes y aprobaciones de ampliación de este cliente.">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-slate-700">Solicitudes del cliente</p>
                    <p className="mt-1 text-[10px] text-slate-400">Se actualizan en tiempo real. Abre una solicitud para responder, revisar archivos y aprobar.</p>
                  </div>
                  <span className="rounded-full bg-blue-50 px-3 py-1.5 text-[10px] font-bold text-blue-700">
                    {commercialRequests.length} SOLICITUDES
                  </span>
                </div>

                {commercialRequests.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
                    <p className="text-xs font-semibold text-slate-600">Este cliente aún no tiene solicitudes de ampliación.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {commercialRequests.map((r:any) => (
                      <button
                        type="button"
                        key={r.id}
                        onClick={()=>openCommercialChannel(r)}
                        className="flex w-full flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-blue-300 hover:bg-blue-50/30 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-bold text-slate-800">{requestLabel(r)}</p>
                            <span className={`rounded-full px-2 py-1 text-[8px] font-bold uppercase ${
                              r.estado==="aprobada" ? "bg-emerald-50 text-emerald-700" :
                              r.estado==="rechazada" ? "bg-red-50 text-red-600" :
                              r.estado==="pago_pendiente" ? "bg-blue-50 text-blue-700" :
                              "bg-amber-50 text-amber-700"
                            }`}>{String(r.estado||"pendiente").replaceAll("_"," ")}</span>
                          </div>
                          <p className="mt-1 truncate text-[10px] text-slate-400">
                            {r.ultimoMensajeCliente || (r.comprobantePago?.url ? "Comprobante de pago recibido" : "Abrir canal")}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {Number(r.valorAdicional||0)>0 && <span className="text-xs font-bold text-slate-700">{money(Number(r.valorAdicional))}</span>}
                          {r.comprobantePago?.url && <span className="rounded-lg bg-emerald-50 px-2 py-1 text-[9px] font-bold text-emerald-700">PAGO ADJUNTO</span>}
                          <span className="text-blue-500">→</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </Card>
            )}

            <Card title="Observaciones" subtitle="Información interna adicional sobre este cliente.">
              <textarea value={form.observaciones} onChange={e => setField("observaciones", e.target.value)} rows={4} className="w-full resize-none rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-blue-400" placeholder="Notas opcionales..." />
            </Card>
          </div>

          <aside className="space-y-6">
            <Card title="Identidad visual" subtitle="Logo de campaña, partido o agencia.">
              <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center">
                <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-400">
                  {logoPreview ? <img src={logoPreview} alt="Logo" className="h-full w-full object-contain p-2" /> : "LOGO"}
                </div>
                <label className="mt-4 cursor-pointer rounded-xl bg-[#1464d2] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#0f54b5]">
                  Seleccionar logo
                  <input type="file" accept="image/*" onChange={handleLogo} className="hidden" />
                </label>
              </div>
            </Card>

            {!isEditing && <Card title="Acceso del cliente" subtitle="Credenciales iniciales para ingresar a la plataforma.">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Usuario</label>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                  {form.email || "El correo electrónico será el usuario"}
                </div>
              </div>
              <div className="mt-4">
                <label className="mb-2 block text-sm font-medium text-slate-700">Contraseña temporal *</label>
                <div className="flex gap-2">
                  <input
                    value={form.passwordTemporal}
                    onChange={e => setField("passwordTemporal", e.target.value)}
                    placeholder="Contraseña temporal"
                    className="h-12 min-w-0 flex-1 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-400"
                  />
                  <button type="button" onClick={generateTemporaryPassword} className="shrink-0 rounded-xl bg-blue-50 px-3 text-xs font-semibold text-blue-600 hover:bg-blue-100">
                    Generar
                  </button>
                </div>
                <p className="mt-2 text-[11px] leading-5 text-slate-400">
                  Mínimo 8 caracteres, mayúscula, minúscula, número y símbolo. Esta contraseña se usa para crear el acceso en Firebase y no se almacena en Firestore.
                </p>
              </div>
            </Card>}

            <Card title="Pago de membresía" subtitle="Comprobante y aprobación para activar el plan.">
              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Recibo / comprobante de pago</label>
                  <label className="flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-center text-xs font-semibold text-slate-600 hover:bg-slate-100">
                    {reciboPago ? reciboPago.name : reciboPagoURL ? "Reemplazar comprobante existente" : "Seleccionar comprobante"}
                    <input type="file" onChange={handleReceipt} className="hidden" />
                  </label>
                  {reciboPagoURL && !reciboPago && (
                    <a href={reciboPagoURL} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-semibold text-blue-600 hover:underline">
                      Ver comprobante actual
                    </a>
                  )}
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Estado del pago</label>
                  <select
                    value={estadoPago}
                    onChange={e => setEstadoPago(e.target.value as "pendiente" | "aprobado" | "rechazado")}
                    className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400"
                  >
                    <option value="pendiente">Pendiente</option>
                    <option value="aprobado">Aprobado</option>
                    <option value="rechazado">Rechazado</option>
                  </select>
                </div>

                <div className={`rounded-xl px-4 py-3 text-xs font-medium ${
                  estadoPago === "aprobado"
                    ? "bg-emerald-50 text-emerald-700"
                    : estadoPago === "rechazado"
                    ? "bg-red-50 text-red-600"
                    : "bg-amber-50 text-amber-700"
                }`}>
                  {estadoPago === "aprobado"
                    ? "Pago aprobado: el plan quedará activo."
                    : estadoPago === "rechazado"
                    ? "Pago rechazado: el plan permanecerá inactivo."
                    : "Pago pendiente de revisión: el plan permanecerá inactivo."}
                </div>
              </div>
            </Card>

            <section className="overflow-hidden rounded-3xl border-2 border-blue-200 bg-white shadow-[0_16px_50px_rgba(20,100,210,0.10)]">
              <div className="bg-gradient-to-r from-[#0b1b30] via-[#123e73] to-[#1464d2] p-5 text-white sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="mb-2 flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/15 text-base">★</span>
                      <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-blue-100">
                        Configuración comercial
                      </p>
                    </div>
                    <h2 className="text-xl font-semibold">Membresía del cliente</h2>
                    <p className="mt-1 max-w-md text-xs leading-5 text-white/65">
                      Selecciona el plan contratado y revisa exactamente qué campañas, duración y tarifas tendrá habilitadas.
                    </p>
                  </div>
                  {effectivePlan && (
                    <span className="hidden rounded-full bg-emerald-400/15 px-3 py-1.5 text-[10px] font-semibold text-emerald-200 sm:block">
                      PLAN SELECCIONADO
                    </span>
                  )}
                </div>
              </div>

              <div className="p-4 sm:p-5">
                {loadingPlans ? (
                  <p className="py-8 text-center text-sm text-slate-400">Cargando planes...</p>
                ) : (
                  <div className="space-y-4">
                    {/* Resumen del plan actualmente seleccionado */}
                    {effectivePlan && (
                      <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-blue-500">
                              Selección actual
                            </p>
                            <h3 className="mt-1 truncate text-lg font-bold text-slate-900">{effectivePlan.nombre}</h3>
                            <p className="mt-1 text-xs text-slate-500">
                              {effectivePlan.meses === 0 ? "Plan gratuito" : `${effectivePlan.meses} ${effectivePlan.meses === 1 ? "mes" : "meses"}`}
                              {(effectivePlan.descuento || 0) > 0 ? ` · ${effectivePlan.descuento}% de descuento` : ""}
                            </p>
                          </div>
                          {usingCustomPlan && (
                            <span className="shrink-0 rounded-full bg-violet-100 px-2.5 py-1 text-[9px] font-bold text-violet-700">
                              PERSONALIZADO
                            </span>
                          )}
                        </div>

                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {enabledPlanPrices.length ? enabledPlanPrices.map(price => (
                            <span key={price.id} className="rounded-lg border border-blue-100 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600">
                              {price.nombre} · {money(finalPrice(price.valor, effectivePlan.descuento || 0))}
                            </span>
                          )) : (
                            <span className="text-[11px] text-slate-400">Sin tarifas configuradas</span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Selector compacto: no muestra todos los planes permanentemente */}
                    {!usingCustomPlan && (
                      <div>
                        <button
                          type="button"
                          onClick={() => setPlanPickerOpen(v => !v)}
                          className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-left transition hover:border-blue-300 hover:bg-blue-50/40"
                        >
                          <div>
                            <p className="text-xs font-bold text-slate-800">
                              {planPickerOpen ? "Cerrar catálogo de planes" : "Cambiar / buscar plan"}
                            </p>
                            <p className="mt-0.5 text-[10px] text-slate-400">
                              {plans.length} {plans.length === 1 ? "plan disponible" : "planes disponibles"}
                            </p>
                          </div>
                          <span className={`text-lg text-slate-400 transition ${planPickerOpen ? "rotate-180" : ""}`}>⌄</span>
                        </button>

                        {planPickerOpen && (
                          <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
                            <div className="sticky top-0 z-10 bg-slate-50/95 pb-3 backdrop-blur">
                              <div className="relative">
                                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">⌕</span>
                                <input
                                  value={planSearch}
                                  onChange={e => setPlanSearch(e.target.value)}
                                  placeholder="Buscar por plan, campaña o descripción..."
                                  className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                />
                              </div>

                              <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                                {[
                                  ["todos", "Todos"],
                                  ["0", "Free"],
                                  ["1", "1 mes"],
                                  ["3", "3 meses"],
                                  ["6", "6 meses"],
                                  ["12", "12 meses"],
                                ].map(([value, label]) => (
                                  <button
                                    key={value}
                                    type="button"
                                    onClick={() => setPlanDurationFilter(value)}
                                    className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[10px] font-semibold ${
                                      planDurationFilter === value
                                        ? "bg-blue-600 text-white"
                                        : "border border-slate-200 bg-white text-slate-500 hover:bg-slate-100"
                                    }`}
                                  >
                                    {label}
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
                              {filteredPlans.length === 0 ? (
                                <div className="rounded-xl bg-white px-4 py-8 text-center">
                                  <p className="text-xs font-semibold text-slate-600">No encontramos planes</p>
                                  <p className="mt-1 text-[10px] text-slate-400">Prueba otro nombre, campaña o duración.</p>
                                </div>
                              ) : filteredPlans.map(p => {
                                const enabled = (p.preciosCampana || []).filter(x => x.activo);
                                const finals = enabled.map(x => finalPrice(x.valor, p.descuento || 0));
                                const min = finals.length ? Math.min(...finals) : 0;
                                const max = finals.length ? Math.max(...finals) : 0;
                                const selected = form.planId === p.id;

                                return (
                                  <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => {
                                      setUsingCustomPlan(false);
                                      setField("planId", p.id);
                                      setPlanPickerOpen(false);
                                    }}
                                    className={`w-full rounded-xl border bg-white p-3 text-left transition ${
                                      selected
                                        ? "border-blue-500 ring-2 ring-blue-100"
                                        : "border-slate-200 hover:border-blue-300 hover:shadow-sm"
                                    }`}
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                          <p className="truncate text-sm font-bold text-slate-800">{p.nombre}</p>
                                          {selected && (
                                            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[8px] font-bold text-blue-700">
                                              ACTUAL
                                            </span>
                                          )}
                                        </div>
                                        <p className="mt-0.5 text-[10px] text-slate-400">
                                          {p.meses === 0 ? "Free" : `${p.meses} ${p.meses === 1 ? "mes" : "meses"}`}
                                          {(p.descuento || 0) > 0 ? ` · ${p.descuento}% dto.` : ""}
                                        </p>
                                      </div>
                                      {enabled.length > 0 && (
                                        <div className="shrink-0 text-right">
                                          <p className="text-[9px] uppercase text-slate-400">Precio final</p>
                                          <p className="text-xs font-bold text-emerald-700">
                                            {min === max ? money(min) : `${money(min)} – ${money(max)}`}
                                          </p>
                                        </div>
                                      )}
                                    </div>

                                    <div className="mt-2 flex flex-wrap gap-1">
                                      {enabled.slice(0, 4).map(x => (
                                        <span key={x.id} className="rounded-md bg-slate-50 px-1.5 py-1 text-[9px] font-medium text-slate-500">
                                          {x.nombre}
                                        </span>
                                      ))}
                                      {enabled.length > 4 && (
                                        <span className="rounded-md bg-blue-50 px-1.5 py-1 text-[9px] font-semibold text-blue-600">
                                          +{enabled.length - 4}
                                        </span>
                                      )}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                      <div className="h-px bg-slate-100" />
                      <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-300">o</span>
                      <div className="h-px bg-slate-100" />
                    </div>

                    {!usingCustomPlan ? (
                      <button
                        type="button"
                        onClick={() => {
                          setUsingCustomPlan(true);
                          setCustomPlanOpen(true);
                          setPlanPickerOpen(false);
                        }}
                        className="flex w-full items-center justify-between rounded-2xl border border-dashed border-violet-300 bg-violet-50/50 px-4 py-3 text-left transition hover:bg-violet-50"
                      >
                        <div>
                          <p className="text-xs font-bold text-violet-700">Crear membresía personalizada</p>
                          <p className="mt-0.5 text-[10px] text-violet-500">Condiciones especiales únicamente para este cliente</p>
                        </div>
                        <span className="text-lg font-light text-violet-500">＋</span>
                      </button>
                    ) : (
                      <div className="rounded-2xl border border-violet-200 bg-violet-50/40 p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-bold text-violet-800">Membresía personalizada</p>
                            <p className="mt-0.5 text-[10px] text-violet-500">Configura solo lo necesario.</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setUsingCustomPlan(false);
                              setCustomPlanOpen(false);
                              setPlanPickerOpen(true);
                            }}
                            className="rounded-lg bg-white px-2.5 py-1.5 text-[10px] font-semibold text-slate-500 shadow-sm"
                          >
                            Usar plan existente
                          </button>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                          <input
                            value={customPlan.nombre}
                            onChange={e => setCustomPlan(v => ({ ...v, nombre: e.target.value }))}
                            placeholder="Nombre del plan"
                            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-violet-400"
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="number"
                              min="0"
                              value={customPlan.meses}
                              onChange={e => setCustomPlan(v => ({ ...v, meses: e.target.value }))}
                              placeholder="Meses"
                              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs"
                            />
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={customPlan.descuento}
                              onChange={e => setCustomPlan(v => ({ ...v, descuento: e.target.value }))}
                              placeholder="Descuento %"
                              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs"
                            />
                          </div>
                        </div>

                        <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
                          {customPrices.map(price => (
                            <div key={price.id} className="grid grid-cols-[26px_1fr_105px] items-center gap-2 border-b border-slate-100 px-3 py-2 last:border-0">
                              <input
                                type="checkbox"
                                checked={price.activo}
                                onChange={() =>
                                  setCustomPrices(v => v.map(x => x.id === price.id ? { ...x, activo: !x.activo } : x))
                                }
                                className="h-4 w-4 accent-violet-600"
                              />
                              <p className="truncate text-[11px] font-semibold text-slate-700">{price.nombre}</p>
                              <input
                                type="number"
                                min="0"
                                step="1000"
                                disabled={!price.activo}
                                value={price.valor}
                                onChange={e =>
                                  setCustomPrices(v => v.map(x => x.id === price.id ? { ...x, valor: Number(e.target.value || 0) } : x))
                                }
                                className="h-9 w-full rounded-lg border border-slate-200 px-2 text-[10px] disabled:bg-slate-50"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>

            <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-[#1464d2] via-[#1678d4] to-[#08a6a6] p-6 text-white shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[.15em] text-white/70">Estructura</p>
              <h2 className="mt-2 text-lg font-semibold">Niveles de red disponibles</h2>
              <p className="mt-2 text-sm leading-6 text-white/80">Define hasta cuántos niveles descendentes podrá construir la red de este cliente.</p>
              <div className="mt-5 flex items-center gap-3">
                <button type="button" onClick={() => setField("nivelesRed", String(Math.max(1, Number(form.nivelesRed || 1) - 1)))} className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 text-xl hover:bg-white/25">−</button>
                <input type="number" min="1" step="1" value={form.nivelesRed} onChange={e => setField("nivelesRed", e.target.value)} className="h-12 min-w-0 flex-1 rounded-xl border border-white/20 bg-white px-3 text-center text-xl font-semibold text-slate-900 outline-none" />
                <button type="button" onClick={() => setField("nivelesRed", String(Number(form.nivelesRed || 0) + 1))} className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 text-xl hover:bg-white/25">+</button>
              </div>
            </div>

            {error && <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
            {message && <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-700">{message}</div>}

            <button disabled={saving} className="h-14 w-full rounded-2xl bg-[#0b1b30] text-sm font-semibold text-white shadow-lg shadow-slate-900/10 transition hover:bg-[#102a49] disabled:opacity-50">
              {saving ? (isEditing ? "Guardando cambios..." : "Creando cliente...") : (isEditing ? "Guardar cambios" : "Guardar nuevo cliente")}
            </button>
          </aside>
        </div>
      </form>

      {isEditing && channelRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm">
          <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 bg-gradient-to-r from-[#0b1b30] to-[#1464d2] p-5 text-white sm:p-6">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[.16em] text-blue-200">Canal cliente ↔ Master</p>
                <h3 className="mt-1 text-xl font-bold">{requestLabel(channelRequest)}</h3>
                <p className="mt-1 text-xs text-white/60">{form.nombreCliente} · {form.email}</p>
              </div>
              <button type="button" onClick={()=>setChannelRequest(null)} className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-lg hover:bg-white/20">×</button>
            </div>

            <div className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[1.25fr_.75fr]">
              <div className="flex min-h-0 flex-col border-r border-slate-100">
                <div className="min-h-[260px] flex-1 space-y-3 overflow-y-auto bg-slate-50/70 p-4 sm:p-5">
                  {channelMessages.length===0 ? (
                    <div className="py-12 text-center text-xs text-slate-400">Aún no hay mensajes en este canal.</div>
                  ) : channelMessages.map((m:any)=>(
                    <div key={m.id} className={`flex ${m.autor==="master"?"justify-end":"justify-start"}`}>
                      <div className={`max-w-[82%] rounded-2xl px-3.5 py-3 shadow-sm ${m.autor==="master"?"bg-blue-600 text-white":"border border-slate-200 bg-white text-slate-700"}`}>
                        <p className={`text-[8px] font-bold uppercase ${m.autor==="master"?"text-blue-100":"text-slate-400"}`}>
                          {m.autor==="master"?"Master":"Cliente"}
                        </p>
                        {m.mensaje && <p className="mt-1 text-xs leading-5">{m.mensaje}</p>}
                        {m.adjunto?.url && (
                          <a href={m.adjunto.url} target="_blank" rel="noreferrer" className={`mt-2 block truncate rounded-lg px-2.5 py-2 text-[10px] font-bold ${m.autor==="master"?"bg-white/10 text-white":"bg-blue-50 text-blue-600"}`}>
                            📎 {m.adjunto.nombre || "Ver archivo"}
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t border-slate-100 bg-white p-4">
                  {adminReplyFile && (
                    <div className="mb-2 flex items-center justify-between rounded-xl bg-blue-50 px-3 py-2">
                      <p className="min-w-0 truncate text-[10px] font-bold text-blue-700">📎 {adminReplyFile.name}</p>
                      <button type="button" onClick={()=>setAdminReplyFile(null)} className="ml-2 text-red-500">×</button>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input value={adminReply} onChange={e=>setAdminReply(e.target.value)} placeholder="Responder al cliente..." className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 px-3 text-xs outline-none focus:border-blue-400"/>
                    <label className="flex h-11 cursor-pointer items-center justify-center rounded-xl border border-slate-200 px-3 text-sm" title="Adjuntar archivo">
                      📎
                      <input type="file" className="hidden" onChange={e=>{setAdminReplyFile(e.target.files?.[0]||null);e.currentTarget.value="";}}/>
                    </label>
                    <button type="button" onClick={sendAdminChannelMessage} disabled={channelSending || (!adminReply.trim()&&!adminReplyFile)} className="rounded-xl bg-slate-900 px-4 text-[10px] font-bold text-white disabled:opacity-40">
                      {channelSending?"Enviando...":"Enviar"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="overflow-y-auto p-4 sm:p-5">
                <p className="text-[10px] font-bold uppercase tracking-[.13em] text-slate-400">Gestión de la solicitud</p>
                <div className="mt-4 space-y-4">
                  <div>
                    <label className="mb-2 block text-xs font-semibold text-slate-700">Valor adicional</label>
                    <input type="number" min="0" step="1000" value={commercialValue} onChange={e=>setCommercialValue(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-400" placeholder="0"/>
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-semibold text-slate-700">Respuesta / condiciones para el cliente</label>
                    <textarea rows={4} value={adminResponse} onChange={e=>setAdminResponse(e.target.value)} className="w-full resize-none rounded-xl border border-slate-200 p-3 text-xs outline-none focus:border-blue-400" placeholder="Ej. La ampliación tiene un valor de... Adjunta el comprobante para continuar."/>
                  </div>
                  <button type="button" onClick={()=>saveCommercialResponse(channelRequest)} disabled={commercialBusy} className="w-full rounded-xl bg-blue-600 px-4 py-3 text-xs font-bold text-white disabled:opacity-50">
                    Enviar cotización / respuesta
                  </button>

                  {channelRequest.comprobantePago?.url ? (
                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                      <p className="text-xs font-bold text-emerald-800">Comprobante recibido</p>
                      <p className="mt-1 truncate text-[10px] text-emerald-600">{channelRequest.comprobantePago.nombre || "Archivo de pago"}</p>
                      <a href={channelRequest.comprobantePago.url} target="_blank" rel="noreferrer" className="mt-3 inline-block rounded-lg bg-white px-3 py-2 text-[10px] font-bold text-emerald-700 shadow-sm">Ver comprobante</a>
                    </div>
                  ) : Number(commercialValue||channelRequest.valorAdicional||0)>0 ? (
                    <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                      <p className="text-xs font-bold text-amber-800">Esperando comprobante</p>
                      <p className="mt-1 text-[10px] leading-5 text-amber-600">El cliente todavía no ha adjuntado el soporte del pago.</p>
                    </div>
                  ) : null}

                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-[9px] font-bold uppercase text-slate-400">Estado actual</p>
                    <p className="mt-1 text-sm font-bold capitalize text-slate-800">{String(channelRequest.estado||"pendiente").replaceAll("_"," ")}</p>
                  </div>

                  {channelRequest.estado!=="aprobada" && channelRequest.estado!=="rechazada" && (
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={()=>rejectCommercialRequest(channelRequest)} disabled={commercialBusy} className="rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-[10px] font-bold text-red-600">Rechazar</button>
                      <button type="button" onClick={()=>approveCommercialRequest(channelRequest)} disabled={commercialBusy} className="rounded-xl bg-emerald-600 px-3 py-3 text-[10px] font-bold text-white">Aprobar y aplicar</button>
                    </div>
                  )}

                  <p className="text-[9px] leading-4 text-slate-400">
                    Al aprobar, el sistema aplica la ampliación: agrega el tipo de campaña solicitado o actualiza los niveles de multired. Si existe un valor adicional, exige comprobante antes de aprobar.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="mb-5"><h2 className="text-lg font-semibold text-slate-950">{title}</h2><p className="mt-1 text-sm text-slate-500">{subtitle}</p></div>{children}</section>;
}
function Field({ label, value, onChange, type = "text", placeholder = "" }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return <div><label className="mb-2 block text-sm font-medium text-slate-700">{label}</label><input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="h-12 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-400" /></div>;
}
function TypeButton({ active, title, text, onClick }: { active: boolean; title: string; text: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`rounded-2xl border p-4 text-left transition ${active ? "border-blue-400 bg-blue-50 ring-2 ring-blue-100" : "border-slate-200 hover:bg-slate-50"}`}><div className="flex items-center justify-between"><p className="font-semibold text-slate-900">{title}</p><span className={`h-4 w-4 rounded-full border-4 ${active ? "border-blue-500 bg-white" : "border-slate-300"}`} /></div><p className="mt-2 text-xs leading-5 text-slate-500">{text}</p></button>;
}
