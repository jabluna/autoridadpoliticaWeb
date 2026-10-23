"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { get, ref } from "firebase/database";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { useRouter, useSearchParams } from "next/navigation";
import { auth, db, rtdb } from "@/lib/firebase";

type TipoCampana = "municipal" | "departamental" | "nacional";
type Corporacion =
  | "edil"
  | "alcaldia"
  | "concejo"
  | "gobernacion"
  | "asamblea"
  | "presidencia";
type EstadoCampana = "activa" | "inactiva";
type EtiquetaNodo = { id: string; nombre: string; color: string; descripcion?: string; creadoEn?: unknown; eliminada?: boolean };
// Catálogo inicial disponible para todos los clientes; cada cliente puede personalizarlo.
const ETIQUETAS_PREDETERMINADAS: EtiquetaNodo[] = [{"id":"predeterminada-0","nombre":"empresa","color":"#2563eb"},{"id":"predeterminada-1","nombre":"comerciante","color":"#d97706"},{"id":"predeterminada-2","nombre":"madre comunitaria","color":"#db2777"},{"id":"predeterminada-3","nombre":"comunal","color":"#059669"},{"id":"predeterminada-4","nombre":"transportador","color":"#0891b2"},{"id":"predeterminada-5","nombre":"constructor","color":"#78716c"},{"id":"predeterminada-6","nombre":"pensionado","color":"#7c3aed"},{"id":"predeterminada-7","nombre":"reservista","color":"#475569"},{"id":"predeterminada-8","nombre":"deportista","color":"#16a34a"},{"id":"predeterminada-9","nombre":"cultural","color":"#e11d48"},{"id":"predeterminada-10","nombre":"concejal","color":"#4f46e5"},{"id":"predeterminada-11","nombre":"alcalde","color":"#dc2626"},{"id":"predeterminada-12","nombre":"junta acción comunal","color":"#0d9488"},{"id":"predeterminada-13","nombre":"gobernador","color":"#9333ea"},{"id":"predeterminada-14","nombre":"diputado","color":"#ea580c"},{"id":"predeterminada-15","nombre":"presidente","color":"#1d4ed8"}];


type Campana = {
  id: string;
  tipo: TipoCampana;
  corporacion: Corporacion;
  departamento?: string;
  municipio?: string;
  nombreCampana: string;
  candidato: string;
  partidoMovimiento?: string;
  lema?: string;
  metaVotos?: number;
  fechaEleccion?: string;
  alcancePuestos?: "todos" | "seleccionados";
  puestosSeleccionados?: string[];
  totalPuestos?: number;
  totalMesas?: number;
  nivelesMultiredPermitidos?: number;
  estado?: EstadoCampana;
};

const OPCIONES: Record<
  TipoCampana,
  { value: Corporacion; label: string }[]
> = {
  municipal: [
    { value: "edil", label: "Edil / JAL" },
    { value: "alcaldia", label: "Alcaldía" },
    { value: "concejo", label: "Concejo municipal" },
  ],
  departamental: [
    { value: "gobernacion", label: "Gobernación" },
    { value: "asamblea", label: "Asamblea departamental" },
  ],
  nacional: [{ value: "presidencia", label: "Presidencia" }],
};

const EMPTY_FORM = {
  tipo: "municipal" as TipoCampana,
  corporacion: "alcaldia" as Corporacion,
  departamento: "",
  municipio: "",
  nombreCampana: "",
  candidato: "",
  partidoMovimiento: "",
  lema: "",
  metaVotos: "",
  fechaEleccion: "",
  alcancePuestos: "todos" as "todos" | "seleccionados",
};

export default function ConfiguracionCampanaPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [clienteId, setClienteId] = useState("");
  const [cliente, setCliente] = useState<any>(null);
  const [catalogo, setCatalogo] = useState<any>({});
  const [campanas, setCampanas] = useState<Campana[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [puestosSeleccionados, setPuestosSeleccionados] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState<"campana" | "niveles">("campana");
  const [requestedCampaign, setRequestedCampaign] = useState<Corporacion | null>(null);
  const [requestedLevels, setRequestedLevels] = useState(0);
  const [step, setStep] = useState(1);
  const [etiquetasOpen, setEtiquetasOpen] = useState(false);
  useEffect(() => { if (searchParams.get("etiquetas") === "1") setEtiquetasOpen(true); }, [searchParams]);
  const [etiquetas, setEtiquetas] = useState<EtiquetaNodo[]>([]);
  const [etiquetaId, setEtiquetaId] = useState<string | null>(null);
  const [etiquetaNombre, setEtiquetaNombre] = useState("");
  const [etiquetaColor, setEtiquetaColor] = useState("#0d9488");
  const [etiquetaDescripcion, setEtiquetaDescripcion] = useState("");
  const [etiquetaBusy, setEtiquetaBusy] = useState(false);
  const [etiquetaError, setEtiquetaError] = useState("");

  useEffect(() => {
    let mounted = true;
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }

      try {
        const userSnap = await getDoc(doc(db, "usuarios", user.uid));
        if (!userSnap.exists()) throw new Error("Usuario no encontrado");

        const userData = userSnap.data() as any;
        if (
          userData.rol !== "cliente_admin" ||
          userData.estado === "inactivo" ||
          !userData.clienteId
        ) {
          throw new Error("Acceso no autorizado");
        }

        const clientSnap = await getDoc(doc(db, "clientes", userData.clienteId));
        if (!clientSnap.exists()) throw new Error("Cliente no encontrado");

        const clientData = clientSnap.data() as any;
        if (
          (clientData.estado || "activo") !== "activo" ||
          clientData.planActivo === false
        ) {
          throw new Error("Cliente o plan inactivo");
        }

        if (!mounted) return;
        setClienteId(userData.clienteId);
        setCliente(clientData);

        // La geografía es un recurso independiente: un fallo de sus reglas
        // no debe cerrar la sesión ni bloquear el listado de campañas.
        try {
          const rt = await get(ref(rtdb, "MUNICIPIOPUESTOS"));
          if (mounted) setCatalogo(rt.exists() ? rt.val() : {});
        } catch (catalogError) {
          console.error("No se pudo leer MUNICIPIOPUESTOS en RTDB:", catalogError);
          if (mounted) {
            setCatalogo({});
            setError("Firebase Realtime Database denegó la lectura de MUNICIPIOPUESTOS. Puedes consultar tus campañas, pero los departamentos, municipios y puestos requieren habilitar permisos de lectura para usuarios autorizados en las reglas de RTDB.");
          }
        }

        await cargarCampanas(userData.clienteId);
      } catch (e) {
        console.error("Error al cargar configuración de campañas:", e);
        if (mounted) setError(e instanceof Error ? e.message : "No fue posible cargar la configuración de campañas. Comprueba los permisos de Firestore.");
      } finally {
        if (mounted) setLoading(false);
      }
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [router]);

  // Catálogo compartido por las campañas de este cliente; los nodos guardarán el ID de la etiqueta.
  useEffect(() => {
    if (!clienteId) return;
    return onSnapshot(collection(db, "clientes", clienteId, "etiquetasNodo"), (snap) => {
      const guardadas = snap.docs.map((item) => ({ id: item.id, ...item.data() } as EtiquetaNodo));
      const ids = new Set(guardadas.map((item) => item.id));
      setEtiquetas([...ETIQUETAS_PREDETERMINADAS.filter((item) => !ids.has(item.id)), ...guardadas]
        .filter((item) => !item.eliminada)
        .sort((a, b) => a.nombre.localeCompare(b.nombre, "es")));
    }, (e) => {
      console.error("Error cargando etiquetas:", e);
      setEtiquetaError("No se pudieron cargar las etiquetas. Revisa los permisos de Firestore.");
    });
  }, [clienteId]);

  const limpiarEtiqueta = () => {
    setEtiquetaId(null);
    setEtiquetaNombre("");
    setEtiquetaColor("#0d9488");
    setEtiquetaDescripcion("");
    setEtiquetaError("");
  };

  const guardarEtiqueta = async () => {
    const nombre = etiquetaNombre.trim();
    if (!clienteId || !nombre) {
      setEtiquetaError("Escribe un nombre para la etiqueta.");
      return;
    }
    if (etiquetas.some((e) => e.id !== etiquetaId && e.nombre.trim().toLocaleLowerCase("es") === nombre.toLocaleLowerCase("es"))) {
      setEtiquetaError("Ya existe una etiqueta con ese nombre.");
      return;
    }
    try {
      setEtiquetaBusy(true);
      setEtiquetaError("");
      const destino = etiquetaId
        ? doc(db, "clientes", clienteId, "etiquetasNodo", etiquetaId)
        : doc(collection(db, "clientes", clienteId, "etiquetasNodo"));
      await setDoc(destino, {
        nombre,
        color: etiquetaColor,
        descripcion: etiquetaDescripcion.trim(),
        eliminada: false,
        actualizadoEn: serverTimestamp(),
        ...(!etiquetaId ? { creadoEn: serverTimestamp() } : {}),
      }, { merge: true });
      limpiarEtiqueta();
      setMessage(etiquetaId ? "Etiqueta actualizada correctamente." : "Etiqueta creada correctamente.");
    } catch (e) {
      console.error("Error guardando etiqueta:", e);
      setEtiquetaError("No se pudo guardar la etiqueta. Comprueba los permisos de Firestore.");
    } finally {
      setEtiquetaBusy(false);
    }
  };

  const editarEtiqueta = (etiqueta: EtiquetaNodo) => {
    setEtiquetaId(etiqueta.id);
    setEtiquetaNombre(etiqueta.nombre);
    setEtiquetaColor(etiqueta.color || "#0d9488");
    setEtiquetaDescripcion(etiqueta.descripcion || "");
    setEtiquetaError("");
  };

  const eliminarEtiqueta = async (etiqueta: EtiquetaNodo) => {
    if (!clienteId || !window.confirm(`¿Eliminar la etiqueta "${etiqueta.nombre}"? Los nodos que ya la tengan asignada podrían conservar una referencia sin etiqueta.`)) return;
    try {
      setEtiquetaBusy(true);
      setEtiquetaError("");
      if (etiqueta.id.startsWith("predeterminada-")) {
        await setDoc(doc(db, "clientes", clienteId, "etiquetasNodo", etiqueta.id), { eliminada: true, nombre: etiqueta.nombre, color: etiqueta.color, actualizadoEn: serverTimestamp() }, { merge: true });
      } else {
        await deleteDoc(doc(db, "clientes", clienteId, "etiquetasNodo", etiqueta.id));
      }
      if (etiquetaId === etiqueta.id) limpiarEtiqueta();
      setMessage("Etiqueta eliminada.");
    } catch (e) {
      console.error("Error eliminando etiqueta:", e);
      setEtiquetaError("No se pudo eliminar la etiqueta.");
    } finally {
      setEtiquetaBusy(false);
    }
  };

  async function cargarCampanas(id: string) {
    const snap = await getDocs(collection(db, "clientes", id, "campanas"));
    const rows = snap.docs.map(
      (d) => ({ id: d.id, ...d.data() } as Campana)
    );
    rows.sort((a, b) => {
      if ((a.estado || "inactiva") === "activa" && (b.estado || "inactiva") !== "activa")
        return -1;
      if ((b.estado || "inactiva") === "activa" && (a.estado || "inactiva") !== "activa")
        return 1;
      return a.nombreCampana.localeCompare(b.nombreCampana);
    });
    setCampanas(rows);
  }

  const planCampaigns = useMemo(() => {
    const prices = Array.isArray(cliente?.plan?.preciosCampana) ? cliente.plan.preciosCampana : [];
    return prices.filter((p: any) => p?.activo !== false);
  }, [cliente]);

  const licensedCampaignIds = useMemo(
    () => new Set(planCampaigns.map((p: any) => String(p.id || "").toLowerCase())),
    [planCampaigns]
  );

  const campaignLicensed = (corporacion: Corporacion) => {
    if (!Array.isArray(cliente?.plan?.preciosCampana)) return true;
    // Las campañas existentes, incluidas las configuradas durante el registro Free, son editables.
    if (campanas.some((campana) => campana.corporacion === corporacion)) return true;
    return licensedCampaignIds.has(corporacion);
  };

  const requestCampaignUpgrade = (corporacion: Corporacion) => {
    setRequestedCampaign(corporacion);
    setUpgradeReason("campana");
    setUpgradeOpen(true);
  };

  const requestLevelUpgrade = () => {
    setRequestedLevels(Number(cliente?.nivelesRed || 1) + 1);
    setUpgradeReason("niveles");
    setUpgradeOpen(true);
  };

  const solicitarAmpliacion = async () => {
    if (!clienteId) return;
    try {
      const requestRef = doc(collection(db, "clientes", clienteId, "solicitudesPlan"));
      await setDoc(requestRef, {
        tipo: upgradeReason === "campana" ? "agregar_campana" : "aumentar_niveles",
        campanaSolicitada: upgradeReason === "campana" ? requestedCampaign : null,
        nivelesActuales: Number(cliente?.nivelesRed || 1),
        nivelesSolicitados: upgradeReason === "niveles" ? requestedLevels : null,
        planActual: { id: cliente?.plan?.id || "", nombre: cliente?.plan?.nombre || "" },
        estado: "pendiente",
        creadoEn: serverTimestamp(),
      });
      setUpgradeOpen(false);
      setMessage("Solicitud de ampliación enviada. El administrador podrá revisar el ajuste de tu membresía.");
    } catch (e) {
      console.error(e);
      setError("No fue posible enviar la solicitud de ampliación.");
    }
  };

  const departamentos = useMemo(
    () => Object.keys(catalogo || {}).sort(),
    [catalogo]
  );

  const municipios = useMemo(() => {
    if (!form.departamento || !catalogo?.[form.departamento]) return [];
    return Object.keys(catalogo[form.departamento]).sort();
  }, [catalogo, form.departamento]);

  const puestos = useMemo(() => {
    if (!form.departamento || !form.municipio) return [];
    const data =
      catalogo?.[form.departamento]?.[form.municipio] || {};

    return Object.entries(data)
      .map(([nombre, mesas]) => ({
        nombre,
        mesas: Number(mesas || 0),
      }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [catalogo, form.departamento, form.municipio]);

  const totalMesas = useMemo(() => {
    const visibles =
      form.alcancePuestos === "todos"
        ? puestos
        : puestos.filter((p) => puestosSeleccionados.includes(p.nombre));

    return visibles.reduce((total, p) => total + p.mesas, 0);
  }, [puestos, puestosSeleccionados, form.alcancePuestos]);

  const setField = (key: string, value: any) => {
    setForm((v) => ({ ...v, [key]: value }));
    setError("");
    setMessage("");
  };

  const nuevaCampana = () => {
    setEditingId(null);
    setForm({
      ...EMPTY_FORM,
      nombreCampana: "",
      candidato: cliente?.responsable || cliente?.nombreCliente || "",
      partidoMovimiento: cliente?.partidoMovimiento || "",
    });
    setPuestosSeleccionados([]);
    setError("");
    setMessage("");
    setShowForm(true);
    setStep(1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const editarCampana = (c: Campana) => {
    setEditingId(c.id);
    setForm({
      tipo: c.tipo || "municipal",
      corporacion: c.corporacion || "alcaldia",
      departamento: c.departamento || "",
      municipio: c.municipio || "",
      nombreCampana: c.nombreCampana || "",
      candidato: c.candidato || "",
      partidoMovimiento: c.partidoMovimiento || "",
      lema: c.lema || "",
      metaVotos: String(c.metaVotos || ""),
      fechaEleccion: c.fechaEleccion || "",
      alcancePuestos: c.alcancePuestos || "todos",
    });
    setPuestosSeleccionados(c.puestosSeleccionados || []);
    setError("");
    setMessage("");
    setShowForm(true);
    setStep(2);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelarEdicion = () => {
    setEditingId(null);
    setShowForm(false);
    setForm(EMPTY_FORM);
    setPuestosSeleccionados([]);
    setError("");
  };

  const cambiarTipo = (tipo: TipoCampana) => {
    setForm((v) => ({
      ...v,
      tipo,
      corporacion: OPCIONES[tipo][0].value,
      departamento: tipo === "nacional" ? "" : v.departamento,
      municipio: tipo === "municipal" ? v.municipio : "",
      alcancePuestos: "todos",
    }));
    setPuestosSeleccionados([]);
  };

  const totalSteps = form.tipo === "municipal" ? 5 : 4;

  const stepTitle = (n: number) => {
    if (n === 1) return "Tipo de campaña";
    if (n === 2) return "Datos generales";
    if (n === 3) return form.tipo === "nacional" ? "Multired" : "Territorio";
    if (n === 4) return form.tipo === "municipal" ? "Puestos y mesas" : "Revisión";
    return "Revisión";
  };

  const validateStep = (current: number) => {
    setError("");
    if (current === 1) {
      if (!campaignLicensed(form.corporacion)) { requestCampaignUpgrade(form.corporacion); return false; }
      return true;
    }
    if (current === 2) {
      if (!form.nombreCampana.trim()) { setError("Escribe el nombre de la campaña para continuar."); return false; }
      if (!form.candidato.trim()) { setError("Escribe el candidato o cabeza de lista para continuar."); return false; }
      return true;
    }
    if (current === 3 && form.tipo !== "nacional") {
      if (!form.departamento) { setError("Selecciona el departamento para continuar."); return false; }
      if (form.tipo === "municipal" && !form.municipio) { setError("Selecciona el municipio para continuar."); return false; }
      return true;
    }
    if (current === 4 && form.tipo === "municipal") {
      if (form.alcancePuestos === "seleccionados" && puestosSeleccionados.length === 0) { setError("Selecciona al menos un puesto de votación para continuar."); return false; }
      return true;
    }
    return true;
  };

  const nextStep = () => {
    if (!validateStep(step)) return;
    setStep((v) => Math.min(totalSteps, v + 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const prevStep = () => {
    setError("");
    setStep((v) => Math.max(1, v - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const guardar = async () => {
    setError("");
    setMessage("");

    if (!campaignLicensed(form.corporacion) && !(editingId && campanas.some((c) => c.id === editingId && c.corporacion === form.corporacion))) {
      requestCampaignUpgrade(form.corporacion);
      return;
    }
    if (!form.nombreCampana.trim())
      return setError("Escribe el nombre de la campaña.");
    if (!form.candidato.trim())
      return setError("Escribe el candidato o cabeza de lista.");
    if (form.tipo !== "nacional" && !form.departamento)
      return setError("Selecciona el departamento.");
    if (form.tipo === "municipal" && !form.municipio)
      return setError("Selecciona el municipio.");
    if (
      form.tipo === "municipal" &&
      form.alcancePuestos === "seleccionados" &&
      puestosSeleccionados.length === 0
    ) {
      return setError("Selecciona al menos un puesto de votación.");
    }

    try {
      setSaving(true);

      const campanaRef = editingId
        ? doc(db, "clientes", clienteId, "campanas", editingId)
        : doc(collection(db, "clientes", clienteId, "campanas"));

      const existente = editingId
        ? campanas.find((c) => c.id === editingId)
        : null;

      await setDoc(
        campanaRef,
        {
          tipo: form.tipo,
          corporacion: form.corporacion,
          departamento:
            form.tipo === "nacional" ? "" : form.departamento,
          municipio:
            form.tipo === "municipal" ? form.municipio : "",
          nombreCampana: form.nombreCampana.trim(),
          candidato: form.candidato.trim(),
          partidoMovimiento: form.partidoMovimiento.trim(),
          lema: form.lema.trim(),
          metaVotos: Number(form.metaVotos || 0),
          fechaEleccion: form.fechaEleccion,
          alcancePuestos:
            form.tipo === "municipal" ? form.alcancePuestos : "todos",
          puestosSeleccionados:
            form.tipo === "municipal" &&
            form.alcancePuestos === "seleccionados"
              ? puestosSeleccionados
              : [],
          totalPuestos:
            form.tipo === "municipal"
              ? form.alcancePuestos === "todos"
                ? puestos.length
                : puestosSeleccionados.length
              : 0,
          totalMesas:
            form.tipo === "municipal" ? totalMesas : 0,
          nivelesMultiredPermitidos: Number(cliente?.nivelesRed || 1),
          estado: existente?.estado || "inactiva",
          ...(editingId
            ? { actualizadoEn: serverTimestamp() }
            : {
                creadoEn: serverTimestamp(),
                actualizadoEn: serverTimestamp(),
              }),
        },
        { merge: true }
      );

      await cargarCampanas(clienteId);
      setMessage(
        editingId
          ? "Campaña actualizada correctamente."
          : "Campaña creada correctamente. Puedes activarla desde el listado."
      );
      setEditingId(null);
      setShowForm(false);
      setForm(EMPTY_FORM);
      setPuestosSeleccionados([]);
    } catch (e) {
      console.error(e);
      setError("No fue posible guardar la campaña.");
    } finally {
      setSaving(false);
    }
  };

  const cambiarEstado = async (campana: Campana) => {
    try {
      setActionId(campana.id);
      setError("");
      setMessage("");

      const nuevoEstado: EstadoCampana =
        (campana.estado || "inactiva") === "activa"
          ? "inactiva"
          : "activa";

      await updateDoc(
        doc(db, "clientes", clienteId, "campanas", campana.id),
        {
          estado: nuevoEstado,
          actualizadoEn: serverTimestamp(),
        }
      );

      await cargarCampanas(clienteId);
      setMessage(
        nuevoEstado === "activa"
          ? "Campaña activada correctamente."
          : "Campaña inactivada correctamente."
      );
    } catch (e) {
      console.error(e);
      setError("No fue posible cambiar el estado de la campaña.");
    } finally {
      setActionId(null);
    }
  };

  const eliminarCampana = async (campana: Campana) => {
    const confirmacion = window.confirm(
      `¿Eliminar la campaña "${campana.nombreCampana}"?\n\nEsta acción elimina su configuración.`
    );
    if (!confirmacion) return;

    try {
      setActionId(campana.id);
      setError("");
      setMessage("");

      await deleteDoc(
        doc(db, "clientes", clienteId, "campanas", campana.id)
      );

      if (editingId === campana.id) cancelarEdicion();

      await cargarCampanas(clienteId);
      setMessage("Campaña eliminada correctamente.");
    } catch (e) {
      console.error(e);
      setError("No fue posible eliminar la campaña.");
    } finally {
      setActionId(null);
    }
  };

  const togglePuesto = (nombre: string) => {
    setPuestosSeleccionados((v) =>
      v.includes(nombre)
        ? v.filter((x) => x !== nombre)
        : [...v, nombre]
    );
  };

  const tipoLabel = (tipo: TipoCampana) =>
    tipo === "municipal"
      ? "Municipal"
      : tipo === "departamental"
      ? "Departamental"
      : "Nacional";

  const corporacionLabel = (c: Campana) =>
    OPCIONES[c.tipo]?.find((x) => x.value === c.corporacion)?.label ||
    c.corporacion;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f4f7f8] text-sm text-slate-500">
        Cargando campañas...
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#f4f7f8]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1450px] flex-col gap-4 px-4 py-5 sm:px-7 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/dashboard")}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
            >
              ←
            </button>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.15em] text-emerald-600">
                Campañas
              </p>
              <h1 className="text-xl font-semibold text-slate-950">
                Configuración de campaña
              </h1>
              <p className="mt-1 text-xs text-slate-400">
                Crea y administra las campañas vinculadas a este cliente.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => { limpiarEtiqueta(); setEtiquetasOpen(true); }} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-semibold text-emerald-800 hover:bg-emerald-100">
              <span aria-hidden="true">◈</span> Configuración de etiquetas
              <span className="rounded-full bg-white px-2 py-0.5 text-[10px]">{etiquetas.length}</span>
            </button>
            <button onClick={nuevaCampana} className="flex h-11 items-center justify-center rounded-xl bg-[#082c2b] px-5 text-sm font-semibold text-white shadow-sm hover:bg-[#0b3a38]">
              + Nueva campaña
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1450px] px-4 py-7 sm:px-7">
        <section className="mb-5 overflow-hidden rounded-3xl bg-gradient-to-br from-[#073b38] to-[#0a8377] p-6 text-white sm:p-7">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.15em] text-emerald-200">
                Cuenta de campaña
              </p>
              <h2 className="mt-2 text-2xl font-semibold">
                {cliente?.nombreCliente}
              </h2>
              <p className="mt-2 text-sm text-white/60">
                Cada campaña tendrá su propia configuración territorial y
                posteriormente su propia multired.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:min-w-[290px]">
              <MiniStat label="Campañas" value={String(campanas.length)} />
              <MiniStat
                label="Multired"
                value={`${cliente?.nivelesRed || 1} niveles`}
              />
            </div>
          </div>
        </section>

        {(error || message) && (
          <div className="mb-5">
            {error && (
              <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}
            {message && (
              <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {message}
              </div>
            )}
          </div>
        )}

        {showForm && (
          <section className="mb-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-gradient-to-r from-slate-950 to-[#0b5f86] px-5 py-5 text-white sm:px-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[.16em] text-cyan-200">{editingId ? "Edición guiada" : "Asistente de configuración"}</p>
                  <h2 className="mt-1 text-xl font-bold">{editingId ? "Editar campaña paso a paso" : "Crear campaña paso a paso"}</h2>
                  <p className="mt-1 text-xs text-white/60">Completa una etapa a la vez. Puedes volver atrás sin perder la información.</p>
                </div>
                <button onClick={cancelarEdicion} className="w-fit rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold text-white">Cerrar asistente</button>
              </div>
              <div className="mt-5 grid gap-2 sm:grid-cols-4 lg:grid-cols-5">
                {Array.from({ length: totalSteps }, (_, i) => i + 1).map((n) => {
                  const active=n===step; const done=n<step;
                  return <button key={n} type="button" onClick={()=>{if(n<step)setStep(n);}} className={`rounded-2xl border px-3 py-3 text-left ${active?"border-white/50 bg-white text-slate-900":done?"border-emerald-300/30 bg-emerald-400/15 text-white":"border-white/10 bg-white/5 text-white/45"}`}>
                    <div className="flex items-center gap-2"><span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${active?"bg-slate-900 text-white":done?"bg-emerald-400 text-slate-950":"bg-white/10"}`}>{done?"✓":n}</span><div className="min-w-0"><p className="text-[9px] font-bold uppercase">Paso {n}</p><p className="truncate text-[10px] font-semibold">{stepTitle(n)}</p></div></div>
                  </button>;
                })}
              </div>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-emerald-400 transition-all" style={{width:`${(step/totalSteps)*100}%`}} /></div>
            </div>
            <div className="p-5 sm:p-6">
              {step===1 && <div className="mx-auto max-w-5xl">
                <p className="text-xs font-bold uppercase tracking-[.14em] text-emerald-600">Paso 1 de {totalSteps}</p><h3 className="mt-1 text-2xl font-bold text-slate-950">¿Qué campaña quieres configurar?</h3><p className="mt-2 text-sm text-slate-500">Elige una opción incluida en tu membresía. Las demás pueden solicitarse como ampliación.</p>
                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{([["edil","Edil / JAL","Municipal"],["concejo","Concejo","Municipal"],["alcaldia","Alcaldía","Municipal"],["asamblea","Asamblea","Departamental"],["gobernacion","Gobernación","Departamental"],["presidencia","Presidencia","Nacional"]] as [Corporacion,string,string][]).map(([value,label,level])=>{const licensed=campaignLicensed(value) || (Boolean(editingId) && form.corporacion===value);const selected=form.corporacion===value;return <button type="button" key={value} onClick={()=>{if(!licensed){requestCampaignUpgrade(value);return;}const tipo:TipoCampana=value==="presidencia"?"nacional":value==="asamblea"||value==="gobernacion"?"departamental":"municipal";setForm(v=>({...v,tipo,corporacion:value,departamento:tipo==="nacional"?"":v.departamento,municipio:tipo==="municipal"?v.municipio:"",alcancePuestos:"todos"}));setPuestosSeleccionados([]);}} className={`min-h-[125px] rounded-2xl border p-4 text-left ${selected&&licensed?"border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/10":licensed?"border-slate-200 bg-white hover:border-emerald-300":"border-slate-200 bg-slate-50"}`}><div className="flex items-start justify-between gap-2"><div><p className={`text-base font-bold ${licensed?"text-slate-900":"text-slate-400"}`}>{label}</p><p className="mt-1 text-[11px] text-slate-400">{level}</p></div><span className={`rounded-full px-2 py-1 text-[8px] font-bold ${licensed?"bg-emerald-50 text-emerald-700":"bg-amber-50 text-amber-700"}`}>{licensed?"INCLUIDA":"AMPLIAR"}</span></div><p className="mt-5 text-[10px] text-slate-500">{licensed?(selected?"Seleccionada. Continúa al siguiente paso.":"Disponible en tu membresía."):"Solicita agregarla a tu plan."}</p></button>})}</div>
              </div>}
              {step===2 && <div className="mx-auto max-w-4xl"><p className="text-xs font-bold uppercase tracking-[.14em] text-emerald-600">Paso 2 de {totalSteps}</p><h3 className="mt-1 text-2xl font-bold text-slate-950">Datos principales</h3><p className="mt-2 text-sm text-slate-500">Identifica la campaña. Nombre y candidato son obligatorios.</p><div className="mt-6 grid gap-4 rounded-2xl border border-slate-200 bg-slate-50/50 p-5 sm:grid-cols-2"><Field label="Nombre de la campaña *" value={form.nombreCampana} onChange={(v)=>setField("nombreCampana",v)}/><Field label="Candidato / cabeza de lista *" value={form.candidato} onChange={(v)=>setField("candidato",v)}/><Field label="Partido / movimiento" value={form.partidoMovimiento} onChange={(v)=>setField("partidoMovimiento",v)}/><Field label="Lema de campaña" value={form.lema} onChange={(v)=>setField("lema",v)}/><Field label="Meta estimada de votos" type="number" value={form.metaVotos} onChange={(v)=>setField("metaVotos",v)}/><Field label="Fecha de elección" type="date" value={form.fechaEleccion} onChange={(v)=>setField("fechaEleccion",v)}/></div></div>}
              {step===3 && form.tipo!=="nacional" && <div className="mx-auto max-w-4xl"><p className="text-xs font-bold uppercase tracking-[.14em] text-emerald-600">Paso 3 de {totalSteps}</p><h3 className="mt-1 text-2xl font-bold text-slate-950">Territorio electoral</h3><p className="mt-2 text-sm text-slate-500">Selecciona dónde funcionará esta campaña.</p><div className={`mt-6 grid gap-4 rounded-2xl border border-slate-200 p-5 ${form.tipo==="municipal"?"sm:grid-cols-2":""}`}><div><Label>Departamento *</Label><select value={form.departamento} onChange={(e)=>{setField("departamento",e.target.value);setField("municipio","");setPuestosSeleccionados([]);}} className="input"><option value="">Seleccionar departamento</option>{departamentos.map(d=><option key={d} value={d}>{d}</option>)}</select></div>{form.tipo==="municipal"&&<div><Label>Municipio *</Label><select value={form.municipio} disabled={!form.departamento} onChange={(e)=>{setField("municipio",e.target.value);setPuestosSeleccionados([]);}} className="input disabled:bg-slate-50"><option value="">Seleccionar municipio</option>{municipios.map(m=><option key={m} value={m}>{m}</option>)}</select></div>}</div></div>}
              {step===3 && form.tipo==="nacional" && <div className="mx-auto max-w-4xl"><p className="text-xs font-bold uppercase tracking-[.14em] text-emerald-600">Paso 3 de {totalSteps}</p><h3 className="mt-1 text-2xl font-bold text-slate-950">Capacidad de multired</h3><div className="mt-6 rounded-3xl border border-blue-100 bg-blue-50 p-6"><p className="text-[10px] font-bold uppercase text-blue-500">Capacidad actual</p><p className="mt-2 text-3xl font-bold text-slate-950">{cliente?.nivelesRed||1} niveles</p><button type="button" onClick={requestLevelUpgrade} className="mt-5 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white">Solicitar más niveles</button></div></div>}
              {step===4 && form.tipo==="municipal" && <div className="mx-auto max-w-5xl"><p className="text-xs font-bold uppercase tracking-[.14em] text-emerald-600">Paso 4 de {totalSteps}</p><h3 className="mt-1 text-2xl font-bold text-slate-950">Puestos de votación y mesas</h3><div className="mt-5 flex gap-2"><button type="button" onClick={()=>setField("alcancePuestos","todos")} className={`rounded-xl px-4 py-3 text-xs font-bold ${form.alcancePuestos==="todos"?"bg-emerald-600 text-white":"bg-slate-100 text-slate-600"}`}>Todo el municipio</button><button type="button" onClick={()=>setField("alcancePuestos","seleccionados")} className={`rounded-xl px-4 py-3 text-xs font-bold ${form.alcancePuestos==="seleccionados"?"bg-emerald-600 text-white":"bg-slate-100 text-slate-600"}`}>Elegir puestos</button></div><div className="mt-5 max-h-[350px] overflow-auto rounded-2xl border border-slate-200">{puestos.map(p=><label key={p.nombre} className="flex cursor-pointer items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0"><input type="checkbox" disabled={form.alcancePuestos==="todos"} checked={form.alcancePuestos==="todos"||puestosSeleccionados.includes(p.nombre)} onChange={()=>togglePuesto(p.nombre)} className="h-4 w-4 accent-emerald-600"/><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-700">{p.nombre}</p><p className="text-[10px] text-slate-400">{p.mesas} mesas</p></div></label>)}</div><div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-2xl bg-slate-50 p-4"><p className="text-[10px] uppercase text-slate-400">Puestos</p><p className="mt-1 text-2xl font-bold">{form.alcancePuestos==="todos"?puestos.length:puestosSeleccionados.length}</p></div><div className="rounded-2xl bg-slate-50 p-4"><p className="text-[10px] uppercase text-slate-400">Mesas</p><p className="mt-1 text-2xl font-bold">{totalMesas}</p></div></div></div>}
              {((step===4&&form.tipo!=="municipal")||step===5)&&<div className="mx-auto max-w-4xl"><p className="text-xs font-bold uppercase tracking-[.14em] text-emerald-600">Último paso</p><h3 className="mt-1 text-2xl font-bold text-slate-950">Revisa antes de guardar</h3><div className="mt-6 grid gap-5 lg:grid-cols-[1fr_.75fr]"><div className="rounded-2xl border border-slate-200 p-5"><Summary label="Campaña" value={form.nombreCampana||"Pendiente"}/><Summary label="Candidato" value={form.candidato||"Pendiente"}/><Summary label="Tipo" value={tipoLabel(form.tipo)}/><Summary label="Corporación" value={OPCIONES[form.tipo].find(x=>x.value===form.corporacion)?.label||"—"}/>{form.tipo!=="nacional"&&<Summary label="Departamento" value={form.departamento||"Pendiente"}/>} {form.tipo==="municipal"&&<Summary label="Municipio" value={form.municipio||"Pendiente"}/>}<Summary label="Multired" value={`${cliente?.nivelesRed||1} niveles permitidos`}/></div><div className="rounded-2xl bg-gradient-to-br from-[#073b38] to-[#0a8377] p-5 text-white"><p className="text-[10px] font-bold uppercase text-emerald-200">Todo listo</p><h4 className="mt-2 text-lg font-bold">Guardar configuración</h4><p className="mt-2 text-xs leading-5 text-white/60">La campaña quedará creada como inactiva y podrás activarla desde el listado.</p><button type="button" onClick={guardar} disabled={saving} className="mt-6 w-full rounded-xl bg-white px-4 py-3 text-xs font-bold text-[#073b38] disabled:opacity-60">{saving?"Guardando...":editingId?"Guardar cambios":"Crear campaña"}</button></div></div></div>}
              {error&&<div className="mx-auto mt-5 max-w-5xl rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>}
              <div className="mx-auto mt-7 flex max-w-5xl items-center justify-between border-t border-slate-100 pt-5"><button type="button" onClick={prevStep} disabled={step===1} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 disabled:opacity-30">← Anterior</button><p className="hidden text-[10px] font-semibold text-slate-400 sm:block">Paso {step} de {totalSteps}</p>{step<totalSteps&&<button type="button" onClick={nextStep} className="rounded-xl bg-[#082c2b] px-5 py-2.5 text-xs font-bold text-white">Continuar →</button>}</div>
            </div>
          </section>
        )}

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">
                Campañas creadas
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                Cada campaña será independiente y tendrá su propia multired.
              </p>
            </div>
            <span className="w-fit rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">
              {campanas.length} registradas
            </span>
          </div>

          {campanas.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-2xl text-emerald-600">
                +
              </div>
              <p className="mt-4 text-sm font-semibold text-slate-700">
                Todavía no hay campañas
              </p>
              <p className="mt-2 text-xs text-slate-400">
                Crea la primera para comenzar a estructurar la multired.
              </p>
              <button
                onClick={nuevaCampana}
                className="mt-5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white"
              >
                Crear primera campaña
              </button>
            </div>
          ) : (
            <div className="grid gap-4 p-5 sm:p-6 lg:grid-cols-2 2xl:grid-cols-3">
              {campanas.map((c) => (
                <article
                  key={c.id}
                  className="rounded-2xl border border-slate-200 p-5 transition hover:border-slate-300 hover:shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-blue-600">
                          {tipoLabel(c.tipo)}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                            (c.estado || "inactiva") === "activa"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {c.estado || "inactiva"}
                        </span>
                      </div>
                      <h3 className="mt-3 truncate text-base font-semibold text-slate-900">
                        {c.nombreCampana}
                      </h3>
                      <p className="mt-1 truncate text-xs text-slate-400">
                        {c.candidato}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 space-y-2 rounded-xl bg-slate-50 p-3">
                    <CardLine
                      label="Cargo"
                      value={corporacionLabel(c)}
                    />
                    <CardLine
                      label="Territorio"
                      value={
                        c.tipo === "nacional"
                          ? "Colombia"
                          : c.tipo === "departamental"
                          ? c.departamento || "—"
                          : `${c.municipio || "—"}, ${
                              c.departamento || "—"
                            }`
                      }
                    />
                    {c.tipo === "municipal" && (
                      <>
                        <CardLine
                          label="Puestos"
                          value={String(c.totalPuestos || 0)}
                        />
                        <CardLine
                          label="Mesas"
                          value={String(c.totalMesas || 0)}
                        />
                      </>
                    )}
                    <CardLine
                      label="Meta votos"
                      value={Number(c.metaVotos || 0).toLocaleString("es-CO")}
                    />
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <button
                      onClick={() => editarCampana(c)}
                      className="rounded-xl border border-slate-200 px-2 py-2.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      Editar
                    </button>
                    <button
                      disabled={actionId === c.id}
                      onClick={() => cambiarEstado(c)}
                      className={`rounded-xl px-2 py-2.5 text-[11px] font-semibold disabled:opacity-50 ${
                        (c.estado || "inactiva") === "activa"
                          ? "bg-amber-50 text-amber-700 hover:bg-amber-100"
                          : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                      }`}
                    >
                      {(c.estado || "inactiva") === "activa"
                        ? "Inactivar"
                        : "Activar"}
                    </button>
                    <button
                      disabled={actionId === c.id}
                      onClick={() => eliminarCampana(c)}
                      className="rounded-xl bg-red-50 px-2 py-2.5 text-[11px] font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50"
                    >
                      Eliminar
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      {etiquetasOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Configuración de etiquetas">
          <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 bg-gradient-to-r from-[#073b38] to-[#0a8377] p-5 text-white sm:p-6">
              <div><p className="text-[10px] font-bold uppercase tracking-widest text-emerald-100">Identificación de nodos</p><h2 className="mt-1 text-xl font-bold">Configuración de etiquetas</h2><p className="mt-2 text-xs text-white/70">Crea etiquetas reutilizables para identificar a las personas de tu equipo.</p></div>
              <button type="button" onClick={() => setEtiquetasOpen(false)} className="rounded-xl bg-white/15 px-3 py-2 text-sm font-bold" aria-label="Cerrar">✕</button>
            </div>
            <div className="min-h-0 overflow-y-auto p-5 sm:p-6">
              {etiquetaError && <div role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-xs text-red-700">{etiquetaError}</div>}
              <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <h3 className="text-sm font-bold text-slate-900">{etiquetaId ? "Editar etiqueta" : "Nueva etiqueta"}</h3>
                  <label className="mt-4 block text-xs font-semibold text-slate-600" htmlFor="etiqueta-nombre">Nombre *</label>
                  <input id="etiqueta-nombre" maxLength={60} value={etiquetaNombre} onChange={e => setEtiquetaNombre(e.target.value)} placeholder="Ej. Coordinador" className="input mt-1" />
                  <label className="mt-4 block text-xs font-semibold text-slate-600" htmlFor="etiqueta-descripcion">Descripción opcional</label>
                  <textarea id="etiqueta-descripcion" maxLength={240} value={etiquetaDescripcion} onChange={e => setEtiquetaDescripcion(e.target.value)} rows={3} placeholder="Uso o función de esta etiqueta" className="mt-1 w-full resize-none rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-emerald-400" />
                  <label className="mt-4 block text-xs font-semibold text-slate-600" htmlFor="etiqueta-color">Color identificador</label>
                  <div className="mt-1 flex items-center gap-3"><input id="etiqueta-color" type="color" value={etiquetaColor} onChange={e => setEtiquetaColor(e.target.value)} className="h-11 w-14 cursor-pointer rounded-lg border border-slate-200 bg-white p-1"/><span className="rounded-full px-3 py-1.5 text-xs font-bold text-white" style={{ backgroundColor: etiquetaColor }}>{etiquetaNombre.trim() || "Vista previa"}</span></div>
                  <div className="mt-5 flex flex-wrap gap-2"><button type="button" disabled={etiquetaBusy} onClick={guardarEtiqueta} className="rounded-xl bg-[#073b38] px-4 py-3 text-xs font-bold text-white disabled:opacity-50">{etiquetaBusy ? "Guardando..." : etiquetaId ? "Guardar cambios" : "Crear etiqueta"}</button>{etiquetaId && <button type="button" onClick={limpiarEtiqueta} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-semibold text-slate-600">Cancelar edición</button>}</div>
                </div>
                <div>
                  <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-bold text-slate-900">Etiquetas guardadas</h3><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">{etiquetas.length}</span></div>
                  {etiquetas.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-xs text-slate-400">Todavía no hay etiquetas. Crea la primera.</div> : <div className="max-h-[410px] space-y-2 overflow-y-auto pr-1">{etiquetas.map(etiqueta => <div key={etiqueta.id} className="rounded-2xl border border-slate-200 p-3"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><span className="inline-block max-w-full truncate rounded-full px-3 py-1 text-[11px] font-bold text-white" style={{ backgroundColor: etiqueta.color || "#0d9488" }}>{etiqueta.nombre}</span>{etiqueta.descripcion && <p className="mt-2 break-words text-[11px] text-slate-500">{etiqueta.descripcion}</p>}</div><div className="flex shrink-0 gap-1"><button type="button" disabled={etiquetaBusy} onClick={() => editarEtiqueta(etiqueta)} className="rounded-lg bg-blue-50 px-2.5 py-2 text-[10px] font-bold text-blue-700 disabled:opacity-50">Editar</button><button type="button" disabled={etiquetaBusy} onClick={() => eliminarEtiqueta(etiqueta)} className="rounded-lg bg-red-50 px-2.5 py-2 text-[10px] font-bold text-red-600 disabled:opacity-50">Eliminar</button></div></div></div>)}</div>}
                </div>
              </div>
              <p className="mt-5 rounded-xl bg-emerald-50 p-3 text-[11px] leading-5 text-emerald-800">Las etiquetas se guardan para este cliente y podrán seleccionarse al crear o editar nodos. Esta pantalla configura el catálogo; la asignación se conectará desde el formulario de personas de la multired.</p>
            </div>
          </div>
        </div>
      )}

      {upgradeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="bg-gradient-to-r from-[#0b1b30] to-[#1464d2] p-6 text-white">
              <p className="text-[10px] font-bold uppercase tracking-[.15em] text-blue-200">Ampliar membresía</p>
              <h3 className="mt-2 text-xl font-bold">{upgradeReason==="campana"?"Agregar tipo de campaña":"Aumentar niveles de multired"}</h3>
              <p className="mt-2 text-xs leading-5 text-white/60">Esta capacidad no está incluida actualmente. Puedes solicitar la ampliación sin salir de esta pantalla.</p>
            </div>
            <div className="p-6">
              {upgradeReason==="campana"?(
                <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                  <p className="text-[10px] font-bold uppercase text-amber-600">Campaña solicitada</p>
                  <p className="mt-1 text-base font-bold text-slate-900">{requestedCampaign ? ([...OPCIONES.municipal,...OPCIONES.departamental,...OPCIONES.nacional].find(o=>o.value===requestedCampaign)?.label||requestedCampaign):"—"}</p>
                  <p className="mt-2 text-[11px] text-slate-500">No está incluida actualmente en {cliente?.plan?.nombre||"tu plan"}.</p>
                </div>
              ):(
                <div>
                  <label className="mb-2 block text-xs font-semibold text-slate-700">Niveles solicitados</label>
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={()=>setRequestedLevels(v=>Math.max(Number(cliente?.nivelesRed||1)+1,v-1))} className="h-11 w-11 rounded-xl bg-slate-100 text-lg font-bold">−</button>
                    <input type="number" min={Number(cliente?.nivelesRed||1)+1} value={requestedLevels} onChange={e=>setRequestedLevels(Number(e.target.value||0))} className="input text-center font-bold"/>
                    <button type="button" onClick={()=>setRequestedLevels(v=>v+1)} className="h-11 w-11 rounded-xl bg-slate-100 text-lg font-bold">+</button>
                  </div>
                  <p className="mt-2 text-[10px] text-slate-400">Actualmente tienes {cliente?.nivelesRed||1} niveles.</p>
                </div>
              )}
              <div className="mt-5 rounded-2xl bg-blue-50 p-4"><p className="text-xs font-bold text-blue-800">Solicitud de ampliación</p><p className="mt-1 text-[11px] leading-5 text-blue-600">Se enviará al panel Master. La capacidad no se activa hasta que sea revisada y aprobada.</p></div>
              <div className="mt-6 grid grid-cols-2 gap-3">
                <button type="button" onClick={()=>setUpgradeOpen(false)} className="rounded-xl border border-slate-200 px-4 py-3 text-xs font-bold text-slate-600">Cancelar</button>
                <button type="button" onClick={solicitarAmpliacion} className="rounded-xl bg-blue-600 px-4 py-3 text-xs font-bold text-white">Solicitar ampliación</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        .input {
          height: 48px;
          width: 100%;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
          background: white;
          padding: 0 12px;
          font-size: 14px;
          outline: none;
          color: #334155;
        }
        .input:focus {
          border-color: #34d399;
          box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.08);
        }
      `}</style>
    </main>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 p-3">
      <p className="text-[10px] uppercase tracking-wide text-white/50">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      {subtitle && (
        <p className="mt-1 text-xs leading-5 text-slate-400">{subtitle}</p>
      )}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-2 block text-sm font-medium text-slate-700">
      {children}
    </label>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input"
      />
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 py-3 first:pt-0 last:border-0 last:pb-0">
      <span className="text-xs text-slate-400">{label}</span>
      <span className="max-w-[65%] text-right text-sm font-semibold text-slate-700">
        {value}
      </span>
    </div>
  );
}

function CardLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[11px] text-slate-400">{label}</span>
      <span className="max-w-[65%] truncate text-right text-xs font-semibold text-slate-600">
        {value}
      </span>
    </div>
  );
}
