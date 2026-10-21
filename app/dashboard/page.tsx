"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";

type Notificacion = {
  id: string;
  titulo: string;
  mensaje: string;
  origen: "master" | "red" | "sistema";
  leida: boolean;
  fecha?: any;
  href?: string;
};

type Cliente = {
  nombreCliente?: string;
  identificacion?: string;
  tipoCliente?: "agencia" | "candidato";
  nombreCampana?: string;
  partidoMovimiento?: string;
  cargoAspirado?: string;
  responsable?: string;
  email?: string;
  telefono?: string;
  logoURL?: string;
  estado?: string;
  planActivo?: boolean;
  nivelesRed?: number;
  observaciones?: string;
  ubicacion?: {
    ciudad?: string;
    departamento?: string;
    pais?: string;
    direccion?: string;
  };
  plan?: {
    nombre?: string;
    meses?: number;
    valor?: number;
    descuento?: number;
    valorFinal?: number;
  };
  pago?: {
    estado?: "pendiente" | "aprobado" | "rechazado";
    reciboURL?: string;
  };
};

export default function ClienteDashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [nombre, setNombre] = useState("");
  const [emailUsuario, setEmailUsuario] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  const [campanas, setCampanas] = useState<any[]>([]);
  const [redMetricas, setRedMetricas] = useState({
    integrantes: 0,
    lideres: 0,
    votosEstimados: 0,
  });

  useEffect(() => {
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

        const clientData = clientSnap.data() as Cliente;
        if (
          (clientData.estado || "activo") !== "activo" ||
          clientData.planActivo === false
        ) {
          throw new Error("Cliente o plan inactivo");
        }

        setCliente(clientData);
        setNombre(userData.nombre || clientData.nombreCliente || "Cliente");
        setEmailUsuario(user.email || clientData.email || "");

        // Bandeja única de notificaciones del cliente.
        // El Master debe guardar aquí sus avisos con origen: "master".
        // La multired podrá usar la misma bandeja con origen: "red" sin cambiar el dashboard.
        try {
          const notifSnap = await getDocs(
            collection(db, "clientes", userData.clienteId, "notificaciones")
          );
          const notifRows = notifSnap.docs
            .map((d) => {
              const n = d.data() as any;
              return {
                id: d.id,
                titulo: n.titulo || "Notificación",
                mensaje: n.mensaje || n.descripcion || "",
                origen: (["master", "red", "sistema"].includes(n.origen) ? n.origen : "sistema") as Notificacion["origen"],
                leida: n.leida === true,
                fecha: n.fecha || n.createdAt || n.creadoEn || null,
                href: n.href || n.url || undefined,
              } as Notificacion;
            })
            .sort((a, b) => {
              const av = a.fecha?.toMillis?.() ?? a.fecha?.seconds * 1000 ?? new Date(a.fecha || 0).getTime();
              const bv = b.fecha?.toMillis?.() ?? b.fecha?.seconds * 1000 ?? new Date(b.fecha || 0).getTime();
              return Number(bv || 0) - Number(av || 0);
            });
          setNotificaciones(notifRows);
        } catch (notifError) {
          console.warn("No fue posible cargar notificaciones", notifError);
          setNotificaciones([]);
        }

        const campSnap = await getDocs(collection(db, "clientes", userData.clienteId, "campanas"));
        const campRows = campSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
        setCampanas(campRows);

        // Estas métricas quedarán alimentadas por la multired.
        // Se intenta leer la subcolección "integrantes" de cada campaña;
        // mientras aún no exista, el dashboard muestra 0 sin fallar.
        let integrantes = 0;
        let lideres = 0;
        let votosEstimados = 0;

        for (const camp of campRows) {
          try {
            const miembrosSnap = await getDocs(
              collection(db, "clientes", userData.clienteId, "campanas", camp.id, "integrantes")
            );
            integrantes += miembrosSnap.size;

            miembrosSnap.docs.forEach(miembroDoc => {
              const m = miembroDoc.data() as any;
              if (m.esLider === true || m.rol === "lider") lideres += 1;

              // La multired podrá guardar aporteVotosEstimados por integrante/líder.
              // Si no existe aún, cada integrante confirmado aporta 1 voto base.
              const aporte = Number(m.aporteVotosEstimados ?? m.votosEstimados ?? 1);
              votosEstimados += Number.isFinite(aporte) ? aporte : 1;
            });
          } catch (networkError) {
            console.warn("Aún no hay multired para campaña", camp.id, networkError);
          }
        }

        setRedMetricas({ integrantes, lideres, votosEstimados });
        setLoading(false);
      } catch (error) {
        console.error(error);
        await signOut(auth);
        router.replace("/login");
      }
    });

    return unsubscribe;
  }, [router]);

  const salir = async () => {
    await signOut(auth);
    router.replace("/login");
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f4f7f8]">
        <div className="flex items-center gap-3 text-sm font-medium text-slate-500">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-emerald-600" />
          Cargando panel...
        </div>
      </div>
    );
  }

  const menu = [
    { label: "Dashboard", icon: "dashboard", active: true },
    { label: "Configuración de campaña", icon: "settings", href: "/configuracion-campana" },
    { label: "Mi red", icon: "network" },
    { label: "Integrantes", icon: "users" },
    { label: "Territorio", icon: "map" },
    { label: "Estadísticas", icon: "chart" },
  ];

  return (
    <main className="min-h-screen bg-[#f4f7f8] text-slate-900">
      {menuOpen && (
        <button
          aria-label="Cerrar menú"
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-[1px] lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col bg-[#082c2b] text-white shadow-2xl transition-transform duration-300 lg:translate-x-0 ${
          menuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-[76px] items-center gap-3 border-b border-white/10 px-5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white text-sm font-bold text-[#082c2b]">
            {cliente?.logoURL ? (
              <img src={cliente.logoURL} alt="Logo" className="h-full w-full object-contain p-1.5" />
            ) : (
              "AP"
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {cliente?.nombreCampana || cliente?.nombreCliente}
            </p>
            <p className="mt-0.5 truncate text-[11px] text-emerald-100/55">
              {cliente?.partidoMovimiento || "Gestión de campaña"}
            </p>
          </div>
          <button
            onClick={() => setMenuOpen(false)}
            className="ml-auto text-white/50 lg:hidden"
          >
            ✕
          </button>
        </div>

        <div className="px-4 pt-6">
          <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[.18em] text-white/35">
            Principal
          </p>
          <nav className="space-y-1.5">
            {menu.map((item) => (
              <button
                key={item.label}
                onClick={() => item.href && router.push(item.href)}
                className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left text-sm font-medium transition ${
                  item.active
                    ? "bg-white text-[#082c2b] shadow-lg shadow-black/10"
                    : "text-white/65 hover:bg-white/[0.08] hover:text-white"
                }`}
              >
                <Icon name={item.icon} />
                {item.label}
                {item.active && (
                  <span className="ml-auto h-2 w-2 rounded-full bg-emerald-500" />
                )}
              </button>
            ))}
          </nav>
        </div>

        <div className="mt-auto p-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[.15em] text-emerald-200/70">
              Plan actual
            </p>
            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="truncate text-sm font-semibold">
                {cliente?.plan?.nombre || "Plan activo"}
              </p>
              <span className="rounded-full bg-emerald-400/15 px-2 py-1 text-[10px] font-semibold text-emerald-300">
                ACTIVO
              </span>
            </div>
            <p className="mt-2 text-[11px] leading-5 text-white/40">
              {cliente?.nivelesRed || 1} niveles de red disponibles
            </p>
          </div>
        </div>
      </aside>

      <div className="min-h-screen lg:pl-[280px]">
        <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur">
          <div className="flex h-[76px] items-center justify-between px-4 sm:px-6 xl:px-8">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setMenuOpen(true)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600 lg:hidden"
                aria-label="Abrir menú"
              >
                ☰
              </button>
              <div>
                <p className="text-xs font-medium text-slate-400">Panel de campaña</p>
                <h1 className="text-base font-semibold tracking-tight text-slate-900 sm:text-lg">
                  Dashboard
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <button
                  onClick={() => {
                    setNotificationsOpen((v) => !v);
                    setProfileOpen(false);
                  }}
                  className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
                  aria-label="Notificaciones"
                >
                  <Icon name="bell" />
                  {notificaciones.some(n => !n.leida) && (
                    <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white ring-2 ring-white">
                      {Math.min(99, notificaciones.filter(n => !n.leida).length)}
                    </span>
                  )}
                </button>

                {notificationsOpen && (
                  <>
                    <button
                      onClick={() => setNotificationsOpen(false)}
                      className="fixed inset-0 z-30 cursor-default"
                      aria-label="Cerrar notificaciones"
                    />
                    <div className="absolute right-0 z-40 mt-2 w-[min(92vw,390px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10">
                      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">Notificaciones</p>
                          <p className="mt-0.5 text-[11px] text-slate-400">Master, sistema y próximamente tu red</p>
                        </div>
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-500">
                          {notificaciones.length}
                        </span>
                      </div>
                      <div className="max-h-[420px] overflow-y-auto p-2">
                        {notificaciones.length === 0 ? (
                          <div className="px-4 py-10 text-center">
                            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                              <Icon name="bell" />
                            </div>
                            <p className="mt-3 text-sm font-medium text-slate-600">Sin notificaciones</p>
                            <p className="mt-1 text-xs text-slate-400">Los avisos del Master aparecerán aquí.</p>
                          </div>
                        ) : (
                          notificaciones.slice(0, 20).map((n) => (
                            <button
                              key={n.id}
                              onClick={() => {
                                setNotificationsOpen(false);
                                if (n.href) router.push(n.href);
                              }}
                              className={`mb-1 w-full rounded-xl p-3 text-left transition hover:bg-slate-50 ${!n.leida ? "bg-emerald-50/60" : ""}`}
                            >
                              <div className="flex items-start gap-3">
                                <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${n.origen === "master" ? "bg-violet-500" : n.origen === "red" ? "bg-cyan-500" : "bg-emerald-500"}`} />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center justify-between gap-3">
                                    <p className="truncate text-xs font-semibold text-slate-800">{n.titulo}</p>
                                    <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-slate-400">
                                      {n.origen}
                                    </span>
                                  </div>
                                  {n.mensaje && <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-500">{n.mensaje}</p>}
                                  <p className="mt-1.5 text-[10px] text-slate-400">{formatNotificationDate(n.fecha)}</p>
                                </div>
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="relative">
              <button
                onClick={() => { setProfileOpen((v) => !v); setNotificationsOpen(false); }}
                className="flex items-center gap-3 rounded-2xl px-2 py-1.5 transition hover:bg-slate-50 sm:pr-3"
              >
                <div className="hidden text-right sm:block">
                  <p className="max-w-[180px] truncate text-sm font-semibold text-slate-800">
                    {nombre}
                  </p>
                  <p className="max-w-[180px] truncate text-[11px] text-slate-400">
                    {emailUsuario}
                  </p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-600 text-sm font-bold text-white shadow-sm">
                  {nombre.slice(0, 2).toUpperCase()}
                </div>
                <svg className="hidden text-slate-400 sm:block" width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>

              {profileOpen && (
                <>
                  <button
                    onClick={() => setProfileOpen(false)}
                    className="fixed inset-0 z-30 cursor-default"
                    aria-label="Cerrar opciones"
                  />
                  <div className="absolute right-0 z-40 mt-2 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-900/10">
                    <button
                      onClick={() => {
                        setProfileOpen(false);
                        router.push("/perfil");
                      }}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <Icon name="profile" />
                      Mi perfil
                    </button>
                    <div className="my-1 h-px bg-slate-100" />
                    <button
                      onClick={salir}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-red-600 hover:bg-red-50"
                    >
                      <Icon name="logout" />
                      Cerrar sesión
                    </button>
                  </div>
                </>
              )}
              </div>
            </div>
          </div>
        </header>

        <div className="px-4 py-6 sm:px-6 xl:px-8 xl:py-8">
          <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#073b38] via-[#075a53] to-[#0b8c7d] p-6 text-white shadow-lg shadow-emerald-900/10 sm:p-8">
            <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full border border-white/10" />
            <div className="absolute -right-5 -top-5 h-40 w-40 rounded-full border border-white/10" />
            <div className="relative max-w-3xl">
              <span className="inline-flex rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[.15em] text-emerald-100">
                Centro de control
              </span>
              <h2 className="mt-4 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
                Bienvenido, {nombre}
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/65">
                Aquí tendrás la visión general de tu campaña, crecimiento de la red,
                líderes, integrantes y comportamiento territorial.
              </p>
            </div>
          </section>

          {(() => {
            const activas = campanas.filter(c => (c.estado || "inactiva") === "activa");
            const metaTotal = activas.reduce((t, c) => t + Number(c.metaVotos || 0), 0);
            const avance = metaTotal > 0
              ? Math.min(100, (redMetricas.votosEstimados / metaTotal) * 100)
              : 0;
            const faltantes = Math.max(0, metaTotal - redMetricas.votosEstimados);

            return (
              <>
                <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <MetricCard
                    label="Votos estimados"
                    value={redMetricas.votosEstimados.toLocaleString("es-CO")}
                    foot="Proyección alimentada por la multired"
                    icon="chart"
                  />
                  <MetricCard
                    label="Meta de votos"
                    value={metaTotal.toLocaleString("es-CO")}
                    foot={`${activas.length} campaña${activas.length === 1 ? "" : "s"} activa${activas.length === 1 ? "" : "s"}`}
                    icon="levels"
                  />
                  <MetricCard
                    label="Avance estimado"
                    value={`${avance.toFixed(1)}%`}
                    foot={metaTotal > 0 ? `Faltan ${faltantes.toLocaleString("es-CO")} votos estimados` : "Define una meta en la campaña"}
                    icon="network"
                  />
                  <MetricCard
                    label="Integrantes / líderes"
                    value={`${redMetricas.integrantes} / ${redMetricas.lideres}`}
                    foot="Estructura registrada en la multired"
                    icon="users"
                  />
                </section>

                <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-base font-semibold text-slate-900">Proyección electoral</p>
                      <p className="mt-1 text-xs text-slate-400">
                        Compara la estimación generada por la multired contra la meta configurada.
                      </p>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="text-2xl font-semibold tracking-tight text-slate-950">{avance.toFixed(1)}%</p>
                      <p className="text-xs text-slate-400">de la meta estimada</p>
                    </div>
                  </div>

                  <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all"
                      style={{ width: `${avance}%` }}
                    />
                  </div>

                  <div className="mt-5 grid gap-3 md:grid-cols-3">
                    {activas.length === 0 ? (
                      <div className="md:col-span-3 rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
                        No hay campañas activas. Activa una campaña para empezar a comparar la multired contra su meta electoral.
                      </div>
                    ) : (
                      activas.map(c => (
                        <div key={c.id} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <p className="truncate text-sm font-semibold text-slate-800">{c.nombreCampana}</p>
                            <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">ACTIVA</span>
                          </div>
                          <p className="mt-2 text-xs text-slate-400">{c.candidato || "Campaña"}</p>
                          <div className="mt-4 flex items-end justify-between gap-3">
                            <div>
                              <p className="text-[10px] uppercase tracking-wide text-slate-400">Meta</p>
                              <p className="mt-1 text-lg font-semibold text-slate-900">
                                {Number(c.metaVotos || 0).toLocaleString("es-CO")}
                              </p>
                            </div>
                            <p className="text-[11px] text-slate-400">
                              {c.tipo === "nacional" ? "Nacional" : c.municipio || c.departamento || "Territorio"}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </>
            );
          })()}

          <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-base font-semibold text-slate-900">Centro de notificaciones</p>
                <p className="mt-1 text-xs text-slate-400">Avisos enviados por el Master y, a futuro, novedades generadas por tu multired.</p>
              </div>
              <button
                onClick={() => setNotificationsOpen(true)}
                className="shrink-0 rounded-xl border border-slate-200 px-3 py-2 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                Ver todas ({notificaciones.length})
              </button>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              {notificaciones.length === 0 ? (
                <div className="lg:col-span-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-6 text-center text-sm text-slate-400">
                  No hay notificaciones por ahora.
                </div>
              ) : (
                notificaciones.slice(0, 3).map((n) => (
                  <button
                    key={n.id}
                    onClick={() => n.href && router.push(n.href)}
                    className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 text-left transition hover:border-slate-200 hover:bg-slate-50"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-wide ${n.origen === "master" ? "bg-violet-100 text-violet-700" : n.origen === "red" ? "bg-cyan-100 text-cyan-700" : "bg-emerald-100 text-emerald-700"}`}>
                        {n.origen}
                      </span>
                      {!n.leida && <span className="h-2 w-2 rounded-full bg-red-500" />}
                    </div>
                    <p className="mt-3 truncate text-sm font-semibold text-slate-800">{n.titulo}</p>
                    <p className="mt-1 line-clamp-2 min-h-8 text-[11px] leading-4 text-slate-500">{n.mensaje || "Sin detalle adicional"}</p>
                    <p className="mt-3 text-[10px] text-slate-400">{formatNotificationDate(n.fecha)}</p>
                  </button>
                ))
              )}
            </div>
          </section>

          <section className="mt-5 grid gap-5 xl:grid-cols-[1.55fr_.85fr]">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-base font-semibold text-slate-900">Resultados de la multired</p>
                  <p className="mt-1 text-xs text-slate-400">
                    La estructura de líderes e integrantes alimentará automáticamente la estimación electoral.
                  </p>
                </div>
                <span className="rounded-full bg-slate-50 px-3 py-1.5 text-[11px] font-semibold text-slate-500">
                  Próximamente
                </span>
              </div>
              <div className="mt-8 flex min-h-[250px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/70">
                <div className="max-w-sm px-6 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                    <Icon name="chart" />
                  </div>
                  <p className="mt-4 text-sm font-semibold text-slate-700">
                    Evolución de votos estimados
                  </p>
                  <p className="mt-2 text-xs leading-5 text-slate-400">
                    Cuando construyamos la multired, aquí veremos crecimiento por nivel, líder, territorio, puesto y mesa.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <p className="text-base font-semibold text-slate-900">Resumen de cuenta</p>
              <p className="mt-1 text-xs text-slate-400">Información principal de tu campaña.</p>

              <div className="mt-5 space-y-4">
                <InfoLine label="Cliente" value={cliente?.nombreCliente || "—"} />
                <InfoLine label="Campaña" value={cliente?.nombreCampana || "—"} />
                <InfoLine label="Plan" value={cliente?.plan?.nombre || "—"} />
                <InfoLine
                  label="Estado"
                  value={cliente?.planActivo === false ? "Pendiente" : "Activo"}
                  accent
                />
              </div>

              <button
                onClick={() => router.push("/perfil")}
                className="mt-6 flex h-11 w-full items-center justify-center rounded-xl bg-slate-900 text-xs font-semibold text-white transition hover:bg-slate-800"
              >
                Ver perfil completo
              </button>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function formatNotificationDate(fecha: any) {
  if (!fecha) return "Fecha no disponible";
  try {
    const date = fecha?.toDate?.() ?? new Date(fecha?.seconds ? fecha.seconds * 1000 : fecha);
    if (Number.isNaN(date.getTime())) return "Fecha no disponible";
    return date.toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return "Fecha no disponible";
  }
}

function MetricCard({
  label,
  value,
  foot,
  icon,
}: {
  label: string;
  value: string;
  foot: string;
  icon: string;
}) {
  return (
    <div className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950">{value}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
          <Icon name={icon} />
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-400">{foot}</p>
    </div>
  );
}

function InfoLine({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3 last:border-0">
      <span className="text-xs text-slate-400">{label}</span>
      <span className={`max-w-[190px] truncate text-right text-xs font-semibold ${accent ? "text-emerald-600" : "text-slate-700"}`}>
        {value}
      </span>
    </div>
  );
}

function Icon({ name }: { name: string }) {
  const common = { width: 19, height: 19, viewBox: "0 0 24 24", fill: "none" };

  if (name === "dashboard") return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.7"/><rect x="14" y="3" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.7"/><rect x="3" y="14" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.7"/><rect x="14" y="14" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.7"/></svg>;
  if (name === "network") return <svg {...common}><circle cx="12" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.7"/><circle cx="5" cy="18" r="2.5" stroke="currentColor" strokeWidth="1.7"/><circle cx="19" cy="18" r="2.5" stroke="currentColor" strokeWidth="1.7"/><path d="M10.7 7.2L6.3 15.7M13.3 7.2L17.7 15.7M7.5 18H16.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>;
  if (name === "users") return <svg {...common}><circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.7"/><path d="M3.5 19C4.3 15.8 6.1 14 9 14C11.9 14 13.7 15.8 14.5 19" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/><path d="M15 5.5C17.1 5.5 18.5 6.9 18.5 9C18.5 11.1 17.1 12.5 15 12.5M16.5 14.5C18.8 15 20.1 16.5 20.5 19" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>;
  if (name === "map") return <svg {...common}><path d="M4 5L9 3L15 5L20 3V19L15 21L9 19L4 21V5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><path d="M9 3V19M15 5V21" stroke="currentColor" strokeWidth="1.7"/></svg>;
  if (name === "chart") return <svg {...common}><path d="M4 20V11M10 20V5M16 20V14M22 20V8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>;
  if (name === "levels") return <svg {...common}><path d="M5 7H19M7 12H17M9 17H15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>;
  if (name === "settings") return <svg {...common}><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7"/><path d="M19 13.5V10.5L16.9 9.8C16.7 9.2 16.4 8.7 16 8.2L16.5 6L14 4.5L12.4 6.1C11.8 6 11.2 6 10.6 6.1L9 4.5L6.5 6L7 8.2C6.6 8.7 6.3 9.2 6.1 9.8L4 10.5V13.5L6.1 14.2C6.3 14.8 6.6 15.3 7 15.8L6.5 18L9 19.5L10.6 17.9C11.2 18 11.8 18 12.4 17.9L14 19.5L16.5 18L16 15.8C16.4 15.3 16.7 14.8 16.9 14.2L19 13.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>;
  if (name === "profile") return <svg {...common}><circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.7"/><path d="M5 20C5.8 16.2 8.1 14 12 14C15.9 14 18.2 16.2 19 20" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>;
  if (name === "logout") return <svg {...common}><path d="M10 5H5V19H10M14 8L18 12L14 16M8 12H18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>;
  if (name === "bell") return <svg {...common}><path d="M18 8A6 6 0 0 0 6 8C6 15 3.5 16 3.5 16H20.5S18 15 18 8Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><path d="M10 20H14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>;
  return null;
}
