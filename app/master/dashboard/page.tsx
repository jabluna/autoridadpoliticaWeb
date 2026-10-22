"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

const Icon = ({ name, className = "h-5 w-5" }: { name: string; className?: string }) => {
  const common = { className, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8 };
  if (name === "home") return <svg {...common}><path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V21h13V9.5"/><path d="M9.5 21v-7h5v7"/></svg>;
  if (name === "plus") return <svg {...common}><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg>;
  if (name === "users") return <svg {...common}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
  if (name === "chart") return <svg {...common}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" strokeLinecap="round"/></svg>;
  if (name === "menu") return <svg {...common}><path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round"/></svg>;
  if (name === "logout") return <svg {...common}><path d="M10 17l5-5-5-5M15 12H3"/><path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5"/></svg>;
  if (name === "building") return <svg {...common}><path d="M3 21h18M6 21V4h9v17M15 9h3v12M9 8h3M9 12h3M9 16h3"/></svg>;
  if (name === "network") return <svg {...common}><circle cx="12" cy="5" r="2.5"/><circle cx="5" cy="18" r="2.5"/><circle cx="19" cy="18" r="2.5"/><path d="M10.8 7.2 6.2 15.8M13.2 7.2l4.6 8.6M7.5 18h9"/></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="9"/></svg>;
};


type DashboardClient = {
  id: string;
  nombreCliente: string;
  identificacion: string;
  tipoCliente: string;
  responsable: string;
  email: string;
  telefono: string;
  nombreCampana: string;
  cargoAspirado: string;
  estado: string;
  logoURL: string;
  plan?: {
    nombre?: string;
    meses?: number;
    tipo?: string;
    valorFinal?: number;
    descuento?: number;
    valor?: number;
    preciosCampana?: Array<{
      id: string;
      nombre: string;
      valor: number;
      activo: boolean;
    }>;
  };
  pago?: {
    estado?: string;
    valorAprobado?: number;
  };
  creadoEn?: any;
};

type CommercialRequest = {
  id: string;
  clienteId: string;
  clienteNombre: string;
  tipo: "agregar_campana" | "aumentar_niveles";
  campanaSolicitada?: string | null;
  nivelesActuales?: number;
  nivelesSolicitados?: number | null;
  planActual?: { id?: string; nombre?: string };
  estado: "pendiente" | "aprobada" | "rechazada";
  creadoEn?: any;
};

export default function MasterDashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [metrics, setMetrics] = useState({
    clientes: 0,
    activos: 0,
    campanas: 0,
    monetizacion: 0,
  });
  const [mobileMenu, setMobileMenu] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [recentClients, setRecentClients] = useState<DashboardClient[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [clientSearch, setClientSearch] = useState("");
  const [commercialRequests, setCommercialRequests] = useState<CommercialRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [requestModal, setRequestModal] = useState<CommercialRequest | null>(null);
  const [requestValue, setRequestValue] = useState("");
  const [requestSaving, setRequestSaving] = useState(false);
  const [requestMessage, setRequestMessage] = useState("");
  const [requestSearch, setRequestSearch] = useState("");
  const [requestStatusFilter, setRequestStatusFilter] = useState("todos");
  const [requestPage, setRequestPage] = useState(1);
  const [editRequest, setEditRequest] = useState<CommercialRequest | null>(null);
  const [editLevels, setEditLevels] = useState("");
  const [editCampaign, setEditCampaign] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [dismissedNotifications, setDismissedNotifications] = useState<string[]>([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        router.replace("/master/login");
        return;
      }
      setUser(currentUser);
      setChecking(false);
    });
    return unsubscribe;
  }, [router]);

  const logout = async () => {
    await signOut(auth);
    router.replace("/master/login");
  };


  useEffect(() => {
    if (checking) return;

    const cargarMetricas = async () => {
      try {
        const snap = await getDocs(collection(db, "clientes"));
        const rows = snap.docs.map(d => ({ id: d.id, ...d.data() } as DashboardClient));

        const sortedClients = [...rows].sort((a, b) => {
          const aTime = a.creadoEn?.toMillis?.() ?? (a.creadoEn?.seconds != null ? a.creadoEn.seconds * 1000 : 0);
          const bTime = b.creadoEn?.toMillis?.() ?? (b.creadoEn?.seconds != null ? b.creadoEn.seconds * 1000 : 0);
          return bTime - aTime;
        });

        setRecentClients(sortedClients);
        setClientsLoading(false);

        const clientes = rows.length;
        const activos = rows.filter(c => (c.estado || "activo") === "activo").length;
        const campanas = rows.filter(c => String(c.nombreCampana || "").trim().length > 0).length;

        // Solo suma ventas cuyo pago fue aprobado.
        // Con el nuevo modelo, un plan puede incluir varias campañas con valores independientes.
        // Si valorAprobado/valorFinal vienen en 0, calculamos el total desde preciosCampana.
        const monetizacion = rows.reduce((total, c) => {
          if (c.pago?.estado !== "aprobado") return total;

          const valorAprobado = Number(c.pago?.valorAprobado || 0);
          if (Number.isFinite(valorAprobado) && valorAprobado > 0) {
            return total + valorAprobado;
          }

          const valorFinalGuardado = Number(c.plan?.valorFinal || 0);
          if (Number.isFinite(valorFinalGuardado) && valorFinalGuardado > 0) {
            return total + valorFinalGuardado;
          }

          const tarifasActivas = Array.isArray(c.plan?.preciosCampana)
            ? c.plan.preciosCampana.filter((p: any) => p?.activo !== false)
            : [];

          if (tarifasActivas.length > 0) {
            const subtotal = tarifasActivas.reduce((sum: number, p: any) => {
              const valor = Number(p?.valor || 0);
              return sum + (Number.isFinite(valor) ? valor : 0);
            }, 0);

            const descuento = Number(c.plan?.descuento || 0);
            const descuentoValido =
              Number.isFinite(descuento) && descuento >= 0 && descuento <= 100
                ? descuento
                : 0;

            const totalPlan = subtotal * (1 - descuentoValido / 100);
            return total + totalPlan;
          }

          const valorLegacy = Number(c.plan?.valor || 0);
          return total + (Number.isFinite(valorLegacy) ? valorLegacy : 0);
        }, 0);

        setMetrics({ clientes, activos, campanas, monetizacion });
      } catch (e) {
        console.error("No fue posible cargar métricas del dashboard:", e);
        setClientsLoading(false);
      }
    };

    cargarMetricas();
  }, [checking]);

  useEffect(() => {
    if (checking) return;

    setRequestsLoading(true);
    const unsubscribe = onSnapshot(
      collectionGroup(db, "solicitudesPlan"),
      (snap) => {
        const rows: CommercialRequest[] = snap.docs.map((d) => {
          const pathParts = d.ref.path.split("/");
          return {
            id: d.id,
            clienteId: pathParts[1] || "",
            clienteNombre: "",
            ...(d.data() as any),
          };
        });

        const clientNameMap = new Map(recentClients.map(c => [c.id, c.nombreCliente]));
        const enriched = rows.map(r => ({
          ...r,
          clienteNombre: clientNameMap.get(r.clienteId) || r.clienteNombre || "Cliente",
        })).sort((a,b)=>{
          const at=a.creadoEn?.toMillis?.() ?? (a.creadoEn?.seconds != null ? a.creadoEn.seconds * 1000 : 0);
          const bt=b.creadoEn?.toMillis?.() ?? (b.creadoEn?.seconds != null ? b.creadoEn.seconds * 1000 : 0);
          return bt-at;
        });

        setCommercialRequests(enriched);
        setRequestsLoading(false);
      },
      (e) => {
        console.error("No fue posible escuchar solicitudes comerciales:", e);
        setRequestsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [checking, recentClients]);

  const campaignLabel = (id?: string | null) => ({
    edil: "Edil / JAL", concejo: "Concejo", alcaldia: "Alcaldía",
    asamblea: "Asamblea", gobernacion: "Gobernación", presidencia: "Presidencia",
  } as Record<string,string>)[String(id || "")] || String(id || "Campaña");

  const resolverSolicitud = async (sol: CommercialRequest, aprobar: boolean) => {
    if (!sol.clienteId) return;
    setRequestSaving(true);
    setRequestMessage("");
    try {
      const clienteRef = doc(db, "clientes", sol.clienteId);
      const solicitudRef = doc(db, "clientes", sol.clienteId, "solicitudesPlan", sol.id);

      if (aprobar) {
        const clienteSnap = await getDoc(clienteRef);
        if (!clienteSnap.exists()) throw new Error("Cliente no encontrado");
        const cliente = clienteSnap.data() as any;

        if (sol.tipo === "aumentar_niveles") {
          const nuevos = Number(sol.nivelesSolicitados || 0);
          if (nuevos <= Number(cliente.nivelesRed || 1)) throw new Error("Los niveles solicitados no son válidos.");
          await updateDoc(clienteRef, { nivelesRed: nuevos, actualizadoEn: serverTimestamp() });
        } else {
          const id = String(sol.campanaSolicitada || "");
          const actuales = Array.isArray(cliente.plan?.preciosCampana) ? cliente.plan.preciosCampana : [];
          const valor = Number(requestValue || 0);
          const categorias: Record<string,string> = {
            edil:"municipal", concejo:"municipal", alcaldia:"municipal",
            asamblea:"departamental", gobernacion:"departamental", presidencia:"nacional"
          };
          const existe = actuales.some((p:any)=>String(p.id)===id);
          const nuevosPrecios = existe
            ? actuales.map((p:any)=>String(p.id)===id ? {...p, activo:true, valor: valor || Number(p.valor||0)} : p)
            : [...actuales, { id, nombre: campaignLabel(id), categoria: categorias[id] || "personalizada", valor, activo:true, esBase:true }];

          await updateDoc(clienteRef, {
            "plan.preciosCampana": nuevosPrecios,
            actualizadoEn: serverTimestamp(),
          });
        }
      }

      await updateDoc(solicitudRef, {
        estado: aprobar ? "aprobada" : "rechazada",
        valorAdicional: sol.tipo === "agregar_campana" && aprobar ? Number(requestValue || 0) : 0,
        resueltoEn: serverTimestamp(),
        resueltoPor: user?.email || "",
      });

      setCommercialRequests(v => v.map(r => r.id === sol.id && r.clienteId === sol.clienteId
        ? {...r, estado: aprobar ? "aprobada" : "rechazada"} : r));
      setRequestMessage(aprobar ? "Solicitud aprobada y membresía actualizada." : "Solicitud rechazada.");
      setRequestModal(null);
      setRequestValue("");
    } catch(e:any) {
      console.error(e);
      setRequestMessage(e?.message || "No fue posible procesar la solicitud.");
    } finally {
      setRequestSaving(false);
    }
  };

  const pendingNotifications = commercialRequests
    .filter(r => r.estado === "pendiente")
    .filter(r => !dismissedNotifications.includes(`${r.clienteId}-${r.id}`));

  const dismissNotification = (sol: CommercialRequest) => {
    setDismissedNotifications(v => [...new Set([...v, `${sol.clienteId}-${sol.id}`])]);
  };

  const dismissAllNotifications = () => {
    setDismissedNotifications(v => [
      ...new Set([...v, ...pendingNotifications.map(r => `${r.clienteId}-${r.id}`)])
    ]);
  };

  const filteredRequests = commercialRequests.filter((r) => {
    const q = requestSearch.trim().toLowerCase();
    const matchesStatus = requestStatusFilter === "todos" || r.estado === requestStatusFilter;
    const matchesSearch = !q || [
      r.clienteNombre,
      r.planActual?.nombre,
      r.tipo,
      campaignLabel(r.campanaSolicitada),
      r.estado,
      r.nivelesActuales,
      r.nivelesSolicitados,
    ].some(v => String(v || "").toLowerCase().includes(q));
    return matchesStatus && matchesSearch;
  });

  const REQUESTS_PER_PAGE = 5;
  const requestPages = Math.max(1, Math.ceil(filteredRequests.length / REQUESTS_PER_PAGE));
  const safeRequestPage = Math.min(requestPage, requestPages);
  const paginatedRequests = filteredRequests.slice(
    (safeRequestPage - 1) * REQUESTS_PER_PAGE,
    safeRequestPage * REQUESTS_PER_PAGE
  );

  const eliminarSolicitud = async (sol: CommercialRequest) => {
    if (!window.confirm(`¿Eliminar esta solicitud de ${sol.clienteNombre}?\n\nEsta acción elimina únicamente el registro de la solicitud.`)) return;
    try {
      setRequestSaving(true);
      await deleteDoc(doc(db, "clientes", sol.clienteId, "solicitudesPlan", sol.id));
      setCommercialRequests(v => v.filter(r => !(r.id === sol.id && r.clienteId === sol.clienteId)));
      setRequestMessage("Solicitud eliminada correctamente.");
    } catch(e) {
      console.error(e);
      setRequestMessage("No fue posible eliminar la solicitud.");
    } finally {
      setRequestSaving(false);
    }
  };

  const abrirEditarSolicitud = (sol: CommercialRequest) => {
    setEditRequest(sol);
    setEditCampaign(String(sol.campanaSolicitada || ""));
    setEditLevels(String(sol.nivelesSolicitados || ""));
  };

  const guardarEdicionSolicitud = async () => {
    if (!editRequest) return;
    try {
      setRequestSaving(true);
      const changes:any = { actualizadoEn: serverTimestamp() };
      if (editRequest.tipo === "agregar_campana") changes.campanaSolicitada = editCampaign;
      else changes.nivelesSolicitados = Number(editLevels || 0);
      await updateDoc(doc(db, "clientes", editRequest.clienteId, "solicitudesPlan", editRequest.id), changes);
      setCommercialRequests(v => v.map(r =>
        r.id === editRequest.id && r.clienteId === editRequest.clienteId ? {...r, ...changes} : r
      ));
      setEditRequest(null);
      setRequestMessage("Solicitud editada correctamente.");
    } catch(e) {
      console.error(e);
      setRequestMessage("No fue posible editar la solicitud.");
    } finally {
      setRequestSaving(false);
    }
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f8ff]">
        <div className="flex items-center gap-3 text-sm font-medium text-slate-500">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-[#0b1b30]" />
          Cargando panel...
        </div>
      </div>
    );
  }

  const displayName = user?.displayName || "Administrador Master";
  const email = user?.email || "";
  const initials = displayName.split(" ").filter(Boolean).slice(0, 2).map((x) => x[0]?.toUpperCase()).join("") || "AM";

  const filteredClients = recentClients.filter((client) => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) return true;
    return [
      client.nombreCliente,
      client.identificacion,
      client.responsable,
      client.email,
      client.nombreCampana,
      client.cargoAspirado,
      client.plan?.nombre,
    ].some(value => String(value || "").toLowerCase().includes(q));
  });

  const money = (value: number) =>
    new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(value || 0);

  return (
    <div className="min-h-screen bg-[#f5f8ff] text-slate-900">
      {mobileMenu && (
        <button aria-label="Cerrar menú" onClick={() => setMobileMenu(false)} className="fixed inset-0 z-30 bg-slate-950/40 lg:hidden" />
      )}

      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[270px] flex-col bg-gradient-to-b from-[#123a73] via-[#0b5f86] to-[#087f8c] text-white shadow-2xl transition-transform duration-300 lg:translate-x-0 ${mobileMenu ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-20 items-center gap-3 border-b border-white/[0.07] px-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[#08182b]">
            <Icon name="network" className="h-6 w-6" />
          </div>
          <div>
            <p className="font-semibold tracking-tight">Autoridad Política</p>
            <p className="text-[11px] text-slate-400">Administración Master</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-4 py-6">
          <p className="px-3 pb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Administración</p>

          <button
            onClick={() => router.push("/master/administradores")}
            className="mb-3 flex w-full items-center gap-3 rounded-xl border border-white/15 bg-white/[0.14] px-3.5 py-3 text-left text-sm font-medium text-white transition hover:bg-white/[0.22]"
          >
            <Icon name="users" />
            Administradores Master
          </button>

          <p className="px-3 pb-3 pt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Principal</p>

          <button className="mb-1 flex w-full items-center gap-3 rounded-xl bg-white/[0.16] px-3.5 py-3 text-left text-sm font-medium text-white">
            <Icon name="home" />
            Dashboard
          </button>

          <button
            onClick={() => router.push("/master/planes")}
            className="mb-1 flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left text-sm font-medium text-slate-300 transition hover:bg-white/[0.12] hover:text-white"
          >
            <Icon name="chart" />
            Planes
          </button>

          <button
            onClick={() => router.push("/master/solicitudes-registro")}
            className="mb-1 flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left text-sm font-medium text-slate-300 transition hover:bg-white/[0.12] hover:text-white"
          >
            <Icon name="users" />
            Solicitudes de registro
          </button>

          <button
            onClick={() => router.push("/master/clientes")}
            className="mb-1 flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left text-sm font-medium text-slate-300 transition hover:bg-white/[0.12] hover:text-white"
          >
            <Icon name="users" />
            Clientes
          </button>

          <button
            onClick={() => document.getElementById("solicitudes-comerciales")?.scrollIntoView({ behavior: "smooth" })}
            className="mb-1 flex w-full items-center justify-between rounded-xl px-3.5 py-3 text-left text-sm font-medium text-slate-300 transition hover:bg-white/[0.12] hover:text-white"
          >
            <span className="flex items-center gap-3"><Icon name="network" /> Solicitudes comerciales</span>
            {commercialRequests.filter(r=>r.estado==="pendiente").length > 0 && (
              <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[9px] font-bold text-slate-950">
                {commercialRequests.filter(r=>r.estado==="pendiente").length}
              </span>
            )}
          </button>

          <button
            onClick={() => router.push("/master/clientes/nuevo")}
            className="mb-1 flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left text-sm font-medium text-slate-300 transition hover:bg-white/[0.12] hover:text-white"
          >
            <Icon name="plus" />
            Crear nuevo cliente
          </button>

          <div className="my-5 border-t border-white/[0.06]" />
          <p className="px-3 pb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Próximamente</p>

          <div className="flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm text-slate-500">
            <Icon name="chart" /> Métricas generales
          </div>
        </nav>

        <div className="border-t border-white/[0.07] p-4">
          <div className="rounded-2xl bg-white/[0.05] p-4">
            <p className="text-xs font-medium text-slate-300">Panel central</p>
            <p className="mt-1 text-[11px] leading-5 text-white/90">Gestión general de clientes y estructura de la plataforma.</p>
          </div>
        </div>
      </aside>

      <div className="lg:pl-[270px]">
        <header className="sticky top-0 z-20 flex h-20 items-center justify-between border-b border-slate-200/80 bg-white/95 px-4 backdrop-blur-xl sm:px-7 lg:px-9">
          <div className="flex items-center gap-4">
            <button onClick={() => setMobileMenu(true)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 lg:hidden">
              <Icon name="menu" />
            </button>
            <div>
              <h1 className="text-lg font-semibold tracking-tight sm:text-xl">Dashboard Master</h1>
              <p className="hidden text-xs text-slate-500 sm:block">Vista general de la plataforma</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => { setNotificationsOpen(v=>!v); setProfileOpen(false); }}
                className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
                aria-label="Notificaciones"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/>
                  <path d="M10 21h4"/>
                </svg>
                {pendingNotifications.length > 0 && (
                  <span className="absolute -right-1 -top-1 flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white ring-2 ring-white">
                    {pendingNotifications.length > 99 ? "99+" : pendingNotifications.length}
                  </span>
                )}
              </button>

              {notificationsOpen && (
                <div className="absolute right-0 top-[52px] z-50 w-[min(92vw,390px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/15">
                  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5">
                    <div>
                      <p className="text-sm font-bold text-slate-800">Notificaciones</p>
                      <p className="mt-0.5 text-[10px] text-slate-400">Solicitudes comerciales en tiempo real</p>
                    </div>
                    {pendingNotifications.length > 0 && (
                      <button onClick={dismissAllNotifications} className="text-[10px] font-bold text-red-500 hover:text-red-600">
                        Borrar todas
                      </button>
                    )}
                  </div>

                  {pendingNotifications.length === 0 ? (
                    <div className="px-5 py-10 text-center">
                      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-slate-50 text-slate-300">
                        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>
                      </div>
                      <p className="mt-3 text-xs font-semibold text-slate-600">Sin notificaciones pendientes</p>
                    </div>
                  ) : (
                    <div className="max-h-[390px] divide-y divide-slate-100 overflow-y-auto">
                      {pendingNotifications.map(sol=>(
                        <div key={`notif-${sol.clienteId}-${sol.id}`} className="group flex gap-3 px-4 py-3.5 hover:bg-slate-50">
                          <button
                            type="button"
                            onClick={() => {
                              setNotificationsOpen(false);
                              document.getElementById("solicitudes-comerciales")?.scrollIntoView({behavior:"smooth"});
                            }}
                            className="min-w-0 flex-1 text-left"
                          >
                            <div className="flex items-center gap-2">
                              <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500"/>
                              <p className="truncate text-xs font-bold text-slate-800">{sol.clienteNombre}</p>
                            </div>
                            <p className="ml-4 mt-1 text-[10px] leading-4 text-slate-500">
                              {sol.tipo==="agregar_campana"
                                ? <>Solicita agregar <b>{campaignLabel(sol.campanaSolicitada)}</b>.</>
                                : <>Solicita aumentar la multired a <b>{sol.nivelesSolicitados}</b> niveles.</>}
                            </p>
                          </button>
                          <button
                            type="button"
                            onClick={()=>dismissNotification(sol)}
                            title="Borrar notificación"
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-300 hover:bg-red-50 hover:text-red-500"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setNotificationsOpen(false);
                      document.getElementById("solicitudes-comerciales")?.scrollIntoView({behavior:"smooth"});
                    }}
                    className="w-full border-t border-slate-100 bg-slate-50 px-4 py-3 text-center text-[10px] font-bold text-blue-600 hover:bg-blue-50"
                  >
                    Ver solicitudes comerciales
                  </button>
                </div>
              )}
            </div>

            <div className="relative">
            <button onClick={() => { setProfileOpen((v) => !v); setNotificationsOpen(false); }} className="flex items-center gap-3 rounded-2xl px-2 py-2 transition hover:bg-slate-50">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1464d2] text-xs font-semibold text-white">{initials}</div>
              <div className="hidden text-left sm:block">
                <p className="max-w-[180px] truncate text-sm font-semibold text-slate-800">{displayName}</p>
                <p className="max-w-[180px] truncate text-[11px] text-slate-500">{email}</p>
              </div>
              <svg className="hidden h-4 w-4 text-slate-400 sm:block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m7 10 5 5 5-5"/></svg>
            </button>

            {profileOpen && (
              <div className="absolute right-0 top-[58px] w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-900/10">
                <div className="border-b border-slate-100 px-3 py-3">
                  <p className="truncate text-sm font-semibold">{displayName}</p>
                  <p className="mt-1 truncate text-xs text-slate-500">{email}</p>
                </div>
                <button onClick={logout} className="mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50">
                  <Icon name="logout" className="h-4 w-4" /> Cerrar sesión
                </button>
              </div>
            )}
            </div>
          </div>
        </header>

        <main className="p-4 sm:p-7 lg:p-9">
          <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#1464d2]">Administración</p>
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-slate-950 sm:text-3xl">Resumen general</h2>
              <p className="mt-2 text-sm text-slate-500">Información inicial de clientes y actividad de la plataforma.</p>
            </div>
            <button onClick={() => router.push("/master/clientes/nuevo")} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#1464d2] px-5 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 transition hover:bg-[#0f54b5]">
              <Icon name="plus" className="h-4 w-4" />
              Nuevo cliente
            </button>
          </div>

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Clientes creados", String(metrics.clientes), "building", "Total registrados", "from-blue-500 to-cyan-400", "bg-blue-50 text-blue-600"],
              ["Clientes activos", String(metrics.activos), "users", "Actualmente habilitados", "from-emerald-500 to-teal-400", "bg-emerald-50 text-emerald-600"],
              ["Campañas", String(metrics.campanas), "chart", "Campañas registradas", "from-violet-500 to-fuchsia-400", "bg-violet-50 text-violet-600"],
              ["Monetización", new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(metrics.monetizacion), "network", "Pagos aprobados", "from-amber-400 to-orange-500", "bg-amber-50 text-amber-600"],
            ].map(([label, value, icon, foot, accent, iconStyle]) => (
              <div key={label} className="relative overflow-hidden rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md">
                <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${accent}`} />
                <div className="flex items-start justify-between">
                  <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${iconStyle}`}><Icon name={icon} /></div>
                  <span className="rounded-full bg-slate-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Inicial</span>
                </div>
                <p className="mt-6 text-sm font-medium text-slate-500">{label}</p>
                <p className="mt-1 text-3xl font-semibold tracking-tight">{value}</p>
                <p className="mt-3 text-xs text-slate-400">{foot}</p>
              </div>
            ))}
          </section>

          <section id="solicitudes-comerciales" className="mt-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-5 sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-slate-900">Solicitudes comerciales</h3>
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                      {commercialRequests.filter(r=>r.estado==="pendiente").length} pendientes
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Historial y gestión de ampliaciones solicitadas por los clientes.</p>
                </div>
                <span className="text-[10px] font-semibold text-slate-400">{filteredRequests.length} registros</span>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_160px]">
                <div className="relative">
                  <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>
                  <input value={requestSearch} onChange={e=>{setRequestSearch(e.target.value);setRequestPage(1);}} placeholder="Buscar cliente, plan, campaña, estado..." className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs outline-none focus:border-blue-400"/>
                </div>
                <select value={requestStatusFilter} onChange={e=>{setRequestStatusFilter(e.target.value);setRequestPage(1);}} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-600 outline-none">
                  <option value="todos">Todos los estados</option>
                  <option value="pendiente">Pendientes</option>
                  <option value="aprobada">Aprobadas</option>
                  <option value="rechazada">Rechazadas</option>
                </select>
              </div>
            </div>

            {requestMessage && <div className="mx-5 mt-4 rounded-xl bg-blue-50 px-4 py-3 text-xs font-semibold text-blue-700">{requestMessage}</div>}

            {requestsLoading ? (
              <div className="flex min-h-[150px] items-center justify-center text-xs text-slate-400">Cargando solicitudes...</div>
            ) : paginatedRequests.length === 0 ? (
              <div className="flex min-h-[150px] flex-col items-center justify-center p-6 text-center">
                <p className="text-sm font-semibold text-slate-700">No hay solicitudes para mostrar</p>
                <p className="mt-1 text-xs text-slate-400">Cambia el término de búsqueda o el filtro de estado.</p>
              </div>
            ) : (
              <>
                <div className="divide-y divide-slate-100">
                  {paginatedRequests.map(sol=>(
                    <div key={`${sol.clienteId}-${sol.id}`} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-bold text-slate-800">{sol.clienteNombre}</p>
                          <span className={`rounded-full px-2 py-0.5 text-[8px] font-bold uppercase ${sol.estado==="pendiente"?"bg-amber-50 text-amber-700":sol.estado==="aprobada"?"bg-emerald-50 text-emerald-700":"bg-red-50 text-red-600"}`}>{sol.estado}</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {sol.tipo==="agregar_campana"
                            ? <>Solicita agregar <b>{campaignLabel(sol.campanaSolicitada)}</b> a su membresía.</>
                            : <>Solicita aumentar la multired de <b>{sol.nivelesActuales || 1}</b> a <b>{sol.nivelesSolicitados || "—"}</b> niveles.</>}
                        </p>
                        <p className="mt-1 text-[10px] text-slate-400">Plan: {sol.planActual?.nombre || "Actual"}</p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-1.5">
                        <button onClick={()=>router.push(`/master/clientes/nuevo?id=${sol.clienteId}`)} className="rounded-lg border border-slate-200 px-2.5 py-2 text-[10px] font-semibold text-slate-600">Cliente</button>
                        <button onClick={()=>abrirEditarSolicitud(sol)} className="rounded-lg border border-blue-100 bg-blue-50 px-2.5 py-2 text-[10px] font-bold text-blue-600">Editar</button>
                        <button onClick={()=>eliminarSolicitud(sol)} disabled={requestSaving} className="rounded-lg border border-red-100 bg-red-50 px-2.5 py-2 text-[10px] font-bold text-red-600">Eliminar</button>
                        {sol.estado==="pendiente" && <>
                          <button onClick={()=>resolverSolicitud(sol,false)} disabled={requestSaving} className="rounded-lg border border-slate-200 px-2.5 py-2 text-[10px] font-bold text-slate-500">Rechazar</button>
                          <button onClick={()=>{setRequestModal(sol);setRequestValue("");}} className="rounded-lg bg-emerald-600 px-2.5 py-2 text-[10px] font-bold text-white">Aprobar</button>
                        </>}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-5 py-3">
                  <p className="text-[10px] text-slate-400">Página {safeRequestPage} de {requestPages} · Máximo 5 por página</p>
                  <div className="flex gap-1">
                    <button disabled={safeRequestPage<=1} onClick={()=>setRequestPage(p=>Math.max(1,p-1))} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-bold text-slate-600 disabled:opacity-30">← Anterior</button>
                    <button disabled={safeRequestPage>=requestPages} onClick={()=>setRequestPage(p=>Math.min(requestPages,p+1))} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-bold text-slate-600 disabled:opacity-30">Siguiente →</button>
                  </div>
                </div>
              </>
            )}
          </section>

          <section className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
            <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
              <div className="border-b border-slate-100 p-5 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-slate-900">Clientes creados</h3>
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-600">
                        {recentClients.length}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      Acceso rápido a los clientes registrados, ordenados del más reciente al más antiguo.
                    </p>
                  </div>

                  <button
                    onClick={() => router.push("/master/clientes")}
                    className="shrink-0 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    Ver todos →
                  </button>
                </div>

                {recentClients.length > 0 && (
                  <div className="relative mt-4">
                    <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="7" />
                      <path d="m20 20-4-4" />
                    </svg>
                    <input
                      value={clientSearch}
                      onChange={(e) => setClientSearch(e.target.value)}
                      placeholder="Buscar cliente, NIT/cédula, campaña, responsable o plan..."
                      className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-xs outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                )}
              </div>

              {clientsLoading ? (
                <div className="flex min-h-[230px] items-center justify-center">
                  <div className="flex items-center gap-3 text-xs font-medium text-slate-400">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-blue-500" />
                    Cargando clientes...
                  </div>
                </div>
              ) : recentClients.length === 0 ? (
                <div className="flex min-h-[230px] flex-col items-center justify-center p-6 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-500">
                    <Icon name="building" className="h-7 w-7" />
                  </div>
                  <p className="mt-4 text-sm font-semibold text-slate-700">Aún no hay clientes</p>
                  <p className="mt-1 max-w-xs text-xs leading-5 text-slate-400">
                    Cuando registres el primer cliente aparecerá automáticamente en este panel.
                  </p>
                </div>
              ) : filteredClients.length === 0 ? (
                <div className="flex min-h-[190px] flex-col items-center justify-center p-6 text-center">
                  <p className="text-sm font-semibold text-slate-700">No encontramos coincidencias</p>
                  <p className="mt-1 text-xs text-slate-400">Prueba con otro nombre, documento, campaña o plan.</p>
                </div>
              ) : (
                <div className="max-h-[520px] overflow-y-auto">
                  <div className="divide-y divide-slate-100">
                    {filteredClients.slice(0, 12).map((client) => {
                      const activePrices = (client.plan?.preciosCampana || []).filter(p => p.activo);
                      const approved = client.pago?.estado === "aprobado";
                      const active = (client.estado || "activo") === "activo";

                      return (
                        <button
                          key={client.id}
                          type="button"
                          onClick={() => router.push(`/master/clientes/nuevo?id=${client.id}`)}
                          className="group flex w-full items-center gap-3 px-4 py-4 text-left transition hover:bg-slate-50 sm:px-6"
                        >
                          {client.logoURL ? (
                            <img
                              src={client.logoURL}
                              alt=""
                              className="h-11 w-11 shrink-0 rounded-xl border border-slate-100 bg-white object-contain p-1"
                            />
                          ) : (
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-sm font-bold text-blue-600">
                              {(client.nombreCliente || "C").trim().charAt(0).toUpperCase()}
                            </div>
                          )}

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-sm font-bold text-slate-800 group-hover:text-blue-700">
                                {client.nombreCliente || "Cliente sin nombre"}
                              </p>
                              <span className={`rounded-full px-2 py-0.5 text-[8px] font-bold uppercase ${
                                active
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-slate-100 text-slate-500"
                              }`}>
                                {active ? "Activo" : "Inactivo"}
                              </span>
                            </div>

                            <p className="mt-1 truncate text-[10px] text-slate-400">
                              {client.identificacion || "Sin identificación"}
                              {client.responsable ? ` · ${client.responsable}` : ""}
                            </p>

                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {client.plan?.nombre && (
                                <span className="rounded-md bg-violet-50 px-2 py-1 text-[9px] font-semibold text-violet-700">
                                  {client.plan.nombre}
                                </span>
                              )}
                              {activePrices.slice(0, 2).map(price => (
                                <span key={price.id} className="rounded-md bg-blue-50 px-2 py-1 text-[9px] font-semibold text-blue-600">
                                  {price.nombre}
                                </span>
                              ))}
                              {activePrices.length > 2 && (
                                <span className="rounded-md bg-blue-50 px-2 py-1 text-[9px] font-semibold text-blue-600">
                                  +{activePrices.length - 2}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="hidden shrink-0 text-right md:block">
                            <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">Pago</p>
                            <p className={`mt-1 text-[10px] font-bold ${
                              approved ? "text-emerald-600" : client.pago?.estado === "rechazado" ? "text-red-500" : "text-amber-600"
                            }`}>
                              {client.pago?.estado || "pendiente"}
                            </p>
                            {approved && Number(client.pago?.valorAprobado || 0) > 0 && (
                              <p className="mt-0.5 text-[10px] font-semibold text-slate-600">
                                {money(Number(client.pago?.valorAprobado || 0))}
                              </p>
                            )}
                          </div>

                          <span className="shrink-0 text-lg text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-blue-500">
                            ›
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {filteredClients.length > 12 && (
                    <div className="border-t border-slate-100 bg-slate-50/60 p-3 text-center">
                      <button
                        onClick={() => router.push("/master/clientes")}
                        className="text-[11px] font-bold text-blue-600 hover:text-blue-700"
                      >
                        Ver los {filteredClients.length} clientes encontrados →
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-2xl bg-gradient-to-br from-[#1464d2] via-[#1678d4] to-[#08a6a6] p-6 text-white shadow-lg shadow-slate-900/10">
              <span className="inline-flex rounded-full bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-300">Acceso rápido</span>
              <h3 className="mt-5 text-xl font-semibold tracking-tight">Crear nuevo cliente</h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">Registra los datos básicos de una empresa para comenzar a configurar su operación dentro de la plataforma.</p>
              <button onClick={() => router.push("/master/clientes/nuevo")} className="mt-7 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-white text-sm font-semibold text-[#0b1b30] transition hover:bg-slate-100">
                <Icon name="plus" className="h-4 w-4" /> Comenzar registro
              </button>
            </div>
          </section>
        </main>
      </div>

      {editRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="bg-[#0b1b30] p-5 text-white">
              <p className="text-[10px] font-bold uppercase tracking-[.15em] text-blue-300">Editar solicitud</p>
              <h3 className="mt-2 text-lg font-bold">{editRequest.clienteNombre}</h3>
              <p className="mt-1 text-[10px] text-white/50">Estado actual: {editRequest.estado}</p>
            </div>
            <div className="p-5">
              {editRequest.tipo==="agregar_campana" ? (
                <div>
                  <label className="mb-2 block text-xs font-semibold text-slate-700">Campaña solicitada</label>
                  <select value={editCampaign} onChange={e=>setEditCampaign(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs">
                    <option value="edil">Edil / JAL</option><option value="concejo">Concejo</option><option value="alcaldia">Alcaldía</option><option value="asamblea">Asamblea</option><option value="gobernacion">Gobernación</option><option value="presidencia">Presidencia</option>
                  </select>
                </div>
              ) : (
                <div>
                  <label className="mb-2 block text-xs font-semibold text-slate-700">Niveles solicitados</label>
                  <input type="number" min={Number(editRequest.nivelesActuales||1)+1} value={editLevels} onChange={e=>setEditLevels(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"/>
                </div>
              )}
              {editRequest.estado!=="pendiente" && <div className="mt-4 rounded-xl bg-amber-50 px-3 py-2.5 text-[10px] leading-5 text-amber-700">Estás editando el historial de una solicitud ya resuelta. Esto no revierte automáticamente cambios que ya se hayan aplicado a la membresía.</div>}
              <div className="mt-5 grid grid-cols-2 gap-2">
                <button onClick={()=>setEditRequest(null)} className="rounded-xl border border-slate-200 px-3 py-3 text-xs font-bold text-slate-600">Cancelar</button>
                <button onClick={guardarEdicionSolicitud} disabled={requestSaving} className="rounded-xl bg-blue-600 px-3 py-3 text-xs font-bold text-white disabled:opacity-50">{requestSaving?"Guardando...":"Guardar cambio"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {requestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="bg-gradient-to-r from-[#0b1b30] to-[#1464d2] p-6 text-white">
              <p className="text-[10px] font-bold uppercase tracking-[.15em] text-blue-200">Solicitud comercial</p>
              <h3 className="mt-2 text-xl font-bold">{requestModal.clienteNombre}</h3>
              <p className="mt-1 text-xs text-white/60">{requestModal.planActual?.nombre || "Membresía actual"}</p>
            </div>
            <div className="p-6">
              {requestModal.tipo==="agregar_campana" ? (
                <>
                  <div className="rounded-2xl bg-amber-50 p-4">
                    <p className="text-[10px] font-bold uppercase text-amber-600">Agregar campaña</p>
                    <p className="mt-1 text-lg font-bold text-slate-900">{campaignLabel(requestModal.campanaSolicitada)}</p>
                  </div>
                  <label className="mb-1 mt-5 block text-xs font-semibold text-slate-700">Valor adicional aprobado</label>
                  <input type="number" min="0" step="1000" value={requestValue} onChange={e=>setRequestValue(e.target.value)} placeholder="Ej. 300000" className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-400"/>
                  <p className="mt-2 text-[10px] text-slate-400">Este valor quedará guardado en la nueva tarifa de campaña del cliente.</p>
                </>
              ):(
                <div className="rounded-2xl bg-blue-50 p-4">
                  <p className="text-[10px] font-bold uppercase text-blue-600">Ampliación de multired</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">{requestModal.nivelesActuales || 1} → {requestModal.nivelesSolicitados} niveles</p>
                  <p className="mt-2 text-[11px] text-slate-500">Al aprobar se actualizará inmediatamente el límite del cliente.</p>
                </div>
              )}
              <div className="mt-6 grid grid-cols-2 gap-3">
                <button onClick={()=>setRequestModal(null)} disabled={requestSaving} className="rounded-xl border border-slate-200 px-4 py-3 text-xs font-bold text-slate-600">Cancelar</button>
                <button onClick={()=>resolverSolicitud(requestModal,true)} disabled={requestSaving} className="rounded-xl bg-emerald-600 px-4 py-3 text-xs font-bold text-white disabled:opacity-50">{requestSaving?"Procesando...":"Aprobar solicitud"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}