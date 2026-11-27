"use client";
import { useMediosGestionAccess } from "@/components/useMediosGestionAccess";

import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { collection, doc, getDoc, getDocs, getCountFromServer, query, where } from "firebase/firestore";
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
  const {canManage:canAccessGestion}=useMediosGestionAccess();
  const [loading, setLoading] = useState(true);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [nombre, setNombre] = useState("");
  const [emailUsuario, setEmailUsuario] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  const [cortesProyeccion, setCortesProyeccion] = useState<Array<{fechaCorte:string;porCampana?:Array<{id:string;aporteCalculado:number;estimadoManual:number}>}>>([]);
  const [errorCortes, setErrorCortes] = useState(false);
  const [proyecciones, setProyecciones] = useState<Array<{id:string; nombre:string; fecha:string; inicio:number; metaElectoral:number; estimado:number; actual:number; altas:Array<{t:number;aporte:number;estimado:number;departamento:string;municipio:string;id:string;nombre:string}>}>>([]);
  const [filtroDepto,setFiltroDepto]=useState("");
  const [filtroMunicipio,setFiltroMunicipio]=useState("");
  const [filtroSemanas,setFiltroSemanas]=useState("");
  const [filtroLider,setFiltroLider]=useState("");
  const [desdeGrafica,setDesdeGrafica]=useState("");
  const [hastaGrafica,setHastaGrafica]=useState("");
  const [puntoProyeccion, setPuntoProyeccion] = useState<number | null>(null);
  const [campanaProyeccion, setCampanaProyeccion] = useState("");
  const [campanas, setCampanas] = useState<any[]>([]);
  const [lideresResumen, setLideresResumen] = useState<Array<{ id: string; nombre: string; ciudad: string; fotoUrl: string; votos: number; estimado: number; matrizDirectos: number; matrizProfundidad: number }>>([]);
  const [fichaUrl, setFichaUrl] = useState("");
  const [liderSeleccionado, setLiderSeleccionado] = useState("");
  const [busquedaLider, setBusquedaLider] = useState("");
  const [busquedaProyeccion, setBusquedaProyeccion] = useState("");
  const [paginaProyeccion, setPaginaProyeccion] = useState(1);
  const [tamanoPaginaProyeccion, setTamanoPaginaProyeccion] = useState(5);
  const [redMetricas, setRedMetricas] = useState({
    integrantes: 0,
    lideres: 0,
    votosEstimados: 0,
    votosRed: 0,
    matrizDirectos: 0,
    matrizProfundidad: 0,
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
              const av = a.fecha?.toMillis?.() ?? (a.fecha?.seconds != null ? a.fecha.seconds * 1000 : new Date(a.fecha || 0).getTime());
              const bv = b.fecha?.toMillis?.() ?? (b.fecha?.seconds != null ? b.fecha.seconds * 1000 : new Date(b.fecha || 0).getTime());
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

        // La multired utiliza nodos y personasRaiz; las estimaciones se guardan
        // en metricas/red y los registros se cuentan por responsable.
        let integrantes = 0;
        let lideres = 0;
        let votosEstimados = 0;
        let votosRed = 0;
        let matrizDirectos = 0;
        let matrizProfundidad = 0;
        const perfiles: Array<{ id: string; nombre: string; ciudad: string; fotoUrl: string; votos: number; estimado: number; matrizDirectos: number; matrizProfundidad: number }> = [];
        const proyeccionesCampana: Array<{id:string; nombre:string; fecha:string; inicio:number; metaElectoral:number; estimado:number; actual:number; altas:Array<{t:number;aporte:number;estimado:number;departamento:string;municipio:string;id:string;nombre:string}>}> = [];
        for (const camp of campRows) {
          try {
            const base = ["clientes", userData.clienteId, "campanas", camp.id] as const;
            const nodesSnap = await getDocs(collection(db, ...base, "nodos"));
            const activeNodes = nodesSnap.docs.filter(d => d.data().estado !== "inactivo");
            const nodeMap = new Map(activeNodes.map(n => [n.id, n.data()]));
            const directChildren = new Map<string, string[]>();
            for (const node of activeNodes) {
              const parent = String(node.data().padreId || "");
              directChildren.set(parent, [...(directChildren.get(parent) || []), node.id]);
            }
            // Matriz del nivel uno: cantidad de líderes directos × profundidad.
            matrizDirectos += (directChildren.get("") || []).length;
            const depthCache = new Map<string, number>();
            const depthOf = (id: string, seen = new Set<string>()): number => {
              if (depthCache.has(id)) return depthCache.get(id)!;
              if (seen.has(id)) return 0;
              const next = new Set(seen); next.add(id);
              const depth = 1 + Math.max(0, ...(directChildren.get(id) || []).map(child => depthOf(child, next)));
              depthCache.set(id, depth);
              return depth;
            };
            matrizProfundidad = Math.max(matrizProfundidad, 0, ...(directChildren.get("") || []).map(id => depthOf(id)));
            const voteCache = new Map<string, number>();
            const calculateVotes = (id: string, seen = new Set<string>()): number => {
              if (voteCache.has(id)) return voteCache.get(id)!;
              if (seen.has(id)) return 0;
              const data = nodeMap.get(id);
              if (!data) return 0;
              const next = new Set(seen); next.add(id);
              const own = data.multinodo === false ? Math.max(1, Number(data.estimacionVotos) || 1) : 1;
              const total = own + (directChildren.get(id) || []).reduce((sum, child) => sum + calculateVotes(child, next), 0);
              voteCache.set(id, total);
              return total;
            };
            for (const node of activeNodes) {
              const data = node.data();
              perfiles.push({
                id: `${camp.id}:${node.id}`,
                nombre: [data.nombre, data.apellido].filter(Boolean).join(" ") || "Líder",
                ciudad: String(data.municipio || data.ciudad || "Ciudad no registrada"),
                fotoUrl: String(data.fotoUrl || ""),
                votos: calculateVotes(node.id),
                estimado: Number(data.estimacionVotos || 0),
                matrizDirectos: (directChildren.get(node.id) || []).length,
                matrizProfundidad: Math.max(0, depthOf(node.id) - 1),
              });
            }
            lideres += activeNodes.length;
            const rootPeople = await getCountFromServer(collection(db, ...base, "personasRaiz"));
            let registrados = rootPeople.data().count;
            const counts = await Promise.all(activeNodes.map(n => getCountFromServer(collection(db, ...base, "nodos", n.id, "personas"))));
            registrados += counts.reduce((sum, count) => sum + count.data().count, 0);
            integrantes += registrados;
            proyeccionesCampana.push({id:camp.id,nombre:camp.nombreCampana || "Campaña",fecha:camp.fechaEleccion || "",metaElectoral:Math.max(0,Number(camp.metaVotos)||0),inicio:camp.creadoEn?.toMillis?.() ?? new Date(camp.creadoEn || camp.fechaCreacion || "").getTime(),altas:activeNodes.map(doc=>{const n=doc.data();return {id:doc.id,nombre:[n.nombre,n.apellido].filter(Boolean).join(" ")||doc.id,t:n.creadoEn?.toMillis?.() ?? new Date(n.creadoEn || n.createdAt || "").getTime(),aporte:n.multinodo===false?Math.max(1,Number(n.estimacionVotos)||1):1,estimado:Math.max(0,Number(n.estimacionVotos)||0),departamento:String(n.departamento||"Sin departamento").trim().toUpperCase(),municipio:String(n.ciudad||n.municipio||"Sin municipio").trim().toUpperCase()};}),estimado:activeNodes.reduce((sum,n)=>sum+Number(n.data().estimacionVotos || 0),0),actual:activeNodes.reduce((sum,n)=>sum+(n.data().multinodo===false?Math.max(1,Number(n.data().estimacionVotos)||1):1),0)});
            // Estimación propia de cada líder: evita sumar subárboles varias veces.
            votosEstimados += activeNodes.reduce((sum, n) => sum + Number(n.data().estimacionVotos || 0), 0);
            // Misma regla que Mi Red: un líder con multinodo aporta 1;
            // sin multinodo aporta el estimado comprometido (mínimo 1).
            // Cada nodo se suma una sola vez, independientemente de su profundidad.
            votosRed += activeNodes.reduce((sum, n) => {
              const data = n.data();
              return sum + (data.multinodo === false ? Math.max(1, Number(data.estimacionVotos) || 1) : 1);
            }, 0);
          } catch (networkError) {
            console.warn("No fue posible cargar la multired de campaña", camp.id, networkError);
          }
        }

        setProyecciones(proyeccionesCampana);
        try { const headers={Authorization:"Bearer "+await user.getIdToken()}; const [weekly,daily]=await Promise.all([fetch("/api/historico-campana",{headers,cache:"no-store"}),fetch("/api/historico-campana?diario=1",{headers,cache:"no-store"})]); if(!weekly.ok||!daily.ok)throw Error("Histórico no disponible");const [w,d]=await Promise.all([weekly.json(),daily.json()]);setCortesProyeccion([...(w.items||[]),...(d.items||[])]);setErrorCortes(false); } catch {setErrorCortes(true);}
        void user.getIdToken().then(token=>fetch("/api/historico-campana?diario=1",{method:"POST",headers:{Authorization:"Bearer "+token}})).then(r=>{if(!r.ok)console.warn("No se guardó el corte diario");}).catch(console.warn);
        setCampanaProyeccion(proyeccionesCampana.find(p=>campRows.find(c=>c.id===p.id)?.estado==="activa")?.id || proyeccionesCampana[0]?.id || "");
        setRedMetricas({ integrantes, lideres, votosEstimados, votosRed, matrizDirectos, matrizProfundidad });
        setLideresResumen(perfiles.sort((a,b) => a.nombre.localeCompare(b.nombre, "es")));
        setLiderSeleccionado(current => current && perfiles.some(p => p.id === current) ? current : (perfiles[0]?.id || ""));
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
    { label: "Mi red", icon: "network", href: "/mired" },
    { label: "Invitaciones a campañas", icon: "users", href: "/invitaciones" },
    { label: "Evolución histórica", icon: "chart", href: "/historico-campana" },

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
        className={`fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col bg-gradient-to-b from-[#102f77] via-[#153f9a] to-[#071e52] text-white shadow-2xl transition-transform duration-300 lg:translate-x-0 ${
          menuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-[76px] items-center gap-3 border-b border-white/10 px-5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white text-sm font-bold text-[#153f9a]">
            {cliente?.logoURL ? (
              <img src={cliente.logoURL} alt="Logo" className="h-full w-full object-contain p-1.5" />
            ) : (
              "AP"
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {campanas[0]?.nombreCampana || cliente?.nombreCampana || cliente?.nombreCliente}
            </p>
            <p className="mt-0.5 truncate text-[11px] text-blue-100/65">
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
                  <span className="ml-auto h-2 w-2 rounded-full bg-blue-500" />
                )}
              </button>
            ))}
            <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.04] p-2">
              <p className="px-3 py-2 text-xs font-extrabold uppercase tracking-wider text-blue-100">Medios</p>
              {[
                ...(canAccessGestion ? [{ label: "Autorizaciones y gestión", href: "/medios/gestion" }] : []),
                { label: "Medios", href: "/medios" },
                { label: "Galería", href: "/medios/galeria" },
              ].map(item => (
                <button
                  key={item.href}
                  onClick={() => { setMenuOpen(false); router.push(item.href); }}
                  className="block w-full rounded-lg px-3 py-2.5 text-left text-sm text-white/75 transition hover:bg-white/10 hover:text-white"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </nav>
        </div>

        <div className="mt-auto p-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[.15em] text-blue-200/80">
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

        <div className="space-y-3 px-3 py-3 sm:px-5 sm:py-4 xl:px-6">
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-100 bg-white px-4 py-3 shadow-sm sm:px-5">
            <div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Centro de control</p><div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2"><h2 className="text-lg font-extrabold text-slate-900 sm:text-xl">Bienvenido, {nombre}</h2>{(()=>{const activa=campanas.find(c=>c.estado==="activa");const lema=String((activa||campanas[0])?.lema||"").trim();return lema?<div className="max-w-full rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 shadow-sm"><span className="mr-2 text-[10px] font-extrabold uppercase tracking-wider text-blue-600">Lema de campaña</span><span className="text-sm font-extrabold italic text-blue-900">“{lema}”</span></div>:null;})()}</div><p className="mt-1 text-xs text-slate-500">Resumen de campaña y evolución de la red.</p></div>
            <button onClick={() => router.push("/mired")} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-800">Ver mi grupo de trabajo →</button>
          </section>

          {(() => {
            const activas = campanas.filter(c => (c.estado || "inactiva") === "activa");
            const estimadoTotal = redMetricas.votosEstimados;
            const votosRed = redMetricas.votosRed;
            const diferencia = estimadoTotal - votosRed;
            const avance = estimadoTotal > 0 ? Math.min(100, (votosRed / estimadoTotal) * 100) : 0;
            return (
              <>
                <section className="mt-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-base font-bold text-slate-900">Resumen de multired</h3><p className="mt-1 text-xs text-slate-500">Indicadores actuales de líderes, personas registradas en reuniones y votos.</p></div><button onClick={() => router.push("/mired")} className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100">Ver mi grupo de trabajo →</button></div>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
                <div className="rounded-xl bg-blue-50 p-3"><strong className="block text-xl font-black text-blue-800">{redMetricas.lideres.toLocaleString("es-CO")}</strong><span className="text-[11px] text-blue-700">Líderes</span></div>
                <div className="rounded-xl bg-cyan-50 p-3"><strong className="block text-xl font-black text-cyan-800">{redMetricas.integrantes.toLocaleString("es-CO")}</strong><span className="text-[11px] text-cyan-700">Personas registradas en reuniones</span></div>
                <div className="rounded-xl bg-emerald-50 p-3"><strong className="block text-xl font-black text-emerald-800">{redMetricas.votosRed.toLocaleString("es-CO")}</strong><span className="text-[11px] text-emerald-700">Consolidado equipo</span></div>
                <div className="rounded-xl bg-amber-50 p-3"><strong className="block text-xl font-black text-amber-800">{redMetricas.votosEstimados.toLocaleString("es-CO")}</strong><span className="text-[11px] text-amber-700">Estimado manual</span></div>
                <div className="rounded-xl bg-violet-50 p-3"><strong className="block text-xl font-black text-violet-800">{redMetricas.matrizDirectos}x{redMetricas.matrizProfundidad}</strong><span className="text-[11px] text-violet-700">Matriz</span></div>
              </div>
              {(() => {const gap=redMetricas.votosEstimados-redMetricas.votosRed;const pct=redMetricas.votosEstimados>0?redMetricas.votosRed/redMetricas.votosEstimados*100:0;return <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3"><div className="flex items-center justify-between gap-2 text-xs"><span className="font-semibold text-slate-700">Cumplimiento de la multired</span><strong className="text-blue-700">{pct.toFixed(1)}%</strong></div><div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500" style={{width:`${Math.max(0,Math.min(100,pct))}%`}} /></div><p className="mt-2 text-[11px] text-slate-500">Diferencia entre estimado y votos: <strong className="text-slate-800">{gap.toLocaleString("es-CO")}</strong></p></div>})()}
            </div>

                </section>

                <section className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-base font-bold text-slate-900">Ruta de proyección hacia las elecciones</h3><p className="mt-1 text-xs text-slate-500">Evolución acumulada del aporte calculado de los líderes y cortes registrados hasta la fecha electoral.</p></div><select aria-label="Campaña de proyección" value={campanaProyeccion} onChange={e=>{setCampanaProyeccion(e.target.value);setPuntoProyeccion(null);setFiltroDepto("");setFiltroMunicipio("");setFiltroSemanas("");setFiltroLider("");setDesdeGrafica("");setHastaGrafica("");}} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">{proyecciones.map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}</select></div>
                  {(()=>{
                    const p=proyecciones.find(v=>v.id===campanaProyeccion);
                    if(!p || !p.fecha || !Number.isFinite(p.metaElectoral) || p.metaElectoral<=0) return <p className="mt-4 rounded-xl bg-slate-50 p-5 text-sm text-slate-500">Configura la fecha de elección y la meta electoral en Configuración de campaña para visualizar la ruta.</p>;
                    const end=new Date(p.fecha+"T00:00:00");const now=new Date();now.setHours(0,0,0,0);
                    if(!Number.isFinite(end.getTime()))return <p className="p-4 text-sm">Fecha de elección inválida.</p>;
                    const days=Math.max(0,Math.round((end.getTime()-now.getTime())/86400000));
                    const colors=["#dc2626","#f97316","#eab308","#2563eb","#16a34a"];
                    const departamentos=Array.from(new Set(p.altas.map(n=>n.departamento))).sort((a,b)=>a.localeCompare(b,"es"));
                    const municipios=Array.from(new Set(p.altas.filter(n=>!filtroDepto||n.departamento===filtroDepto).map(n=>n.municipio))).sort((a,b)=>a.localeCompare(b,"es"));
                    const lideres=p.altas.filter(n=>(!filtroDepto||n.departamento===filtroDepto)&&(!filtroMunicipio||n.municipio===filtroMunicipio)).sort((a,b)=>a.nombre.localeCompare(b.nombre,"es"));
                    const filtrado=!!(filtroDepto||filtroMunicipio||filtroLider);
                    const altas=lideres.filter(n=>!filtroLider||n.id===filtroLider);
                    const actual=filtrado?altas.reduce((sum,n)=>sum+n.aporte,0):p.actual;
                    const estimado=filtrado?altas.reduce((sum,n)=>sum+n.estimado,0):p.estimado;
                    const pct=actual/p.metaElectoral*100;const color=colors[Math.min(4,Math.max(0,Math.ceil(pct/20)-1))];
                    const fmt=(v:number)=>Math.round(v).toLocaleString("es-CO");
                    const dateFmt=(d:Date)=>d.toLocaleDateString("es-CO",{day:"2-digit",month:"short",year:"numeric"});
                    const day=(t:number)=>{const d=new Date(t);d.setHours(0,0,0,0);return d.getTime();};
                    const inicio=Number.isFinite(p.inicio)?day(p.inicio):NaN;
                    const byDay=new Map<number,{t:number;v:number;meta:number}>();
                    if(!filtrado) for(const c of [...cortesProyeccion].sort((a,b)=>a.fechaCorte.localeCompare(b.fechaCorte))){const v=c.porCampana?.find(v=>v.id===p.id);const t=day(new Date(c.fechaCorte).getTime());if(v&&Number.isFinite(t)&&t<now.getTime()&&(!Number.isFinite(inicio)||t>=inicio)&&Number.isFinite(v.aporteCalculado))byDay.set(t,{t,v:v.aporteCalculado,meta:v.estimadoManual});}
                    const primerCorte=Math.min(now.getTime(),...byDay.keys());
                    const altasPorDia=new Map<number,{aporte:number;estimado:number}>();
                    for(const alta of altas){const t=day(alta.t);if(t<primerCorte&&(!Number.isFinite(inicio)||t>=inicio)){const prev=altasPorDia.get(t)||{aporte:0,estimado:0};altasPorDia.set(t,{aporte:prev.aporte+alta.aporte,estimado:prev.estimado+alta.estimado});}}
                    let acumulado=0,estimadoAcumulado=0;
                    if(Number.isFinite(inicio)&&inicio<primerCorte&&!altasPorDia.has(inicio))byDay.set(inicio,{t:inicio,v:0,meta:0});
                    for(const [t,aporte] of [...altasPorDia.entries()].sort((a,b)=>a[0]-b[0])){acumulado+=aporte.aporte;estimadoAcumulado+=aporte.estimado;byDay.set(t,{t,v:acumulado,meta:estimadoAcumulado});}
                    const allPoints=[...byDay.values()].sort((a,b)=>a.t-b.t);
                    allPoints.push({t:now.getTime(),v:actual,meta:estimado});
                    const monthAgo=(n:number)=>{const d=new Date(now);d.setDate(1);d.setMonth(d.getMonth()-n);const lastDay=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();d.setDate(Math.min(now.getDate(),lastDay));return d.getTime();};
                    const cutoff=filtroSemanas==="custom"?(desdeGrafica?new Date(desdeGrafica+"T00:00:00").getTime():-Infinity):filtroSemanas==="month"?monthAgo(1):filtroSemanas==="quarter"?monthAgo(3):filtroSemanas?new Date(now.getFullYear(),now.getMonth(),now.getDate()-Number(filtroSemanas)+1).getTime():-Infinity;
                    const until=filtroSemanas==="custom"&&hastaGrafica?Math.min(now.getTime(),new Date(hastaGrafica+"T00:00:00").getTime()):now.getTime();
                    const invalidRange=cutoff>until;const points=invalidRange?[]:allPoints.filter(v=>v.t>=cutoff&&v.t<=until);
                    const prior=allPoints.filter(v=>v.t<cutoff).at(-1);if(!invalidRange&&prior&&Number.isFinite(cutoff)&&!points.some(v=>v.t===cutoff))points.unshift({...prior,t:cutoff});
                    const emptyRange=points.length===0;if(emptyRange)points.push({t:Number.isFinite(cutoff)?Math.min(cutoff,until):until,v:0,meta:0});
                    const first=filtroSemanas?Math.min(until,Math.max(Number.isFinite(inicio)?inicio:points[0].t,cutoff)):Number.isFinite(inicio)?Math.min(inicio,points[0].t):points[0].t, last=filtroSemanas?until:Math.max(now.getTime(),end.getTime()), span=Math.max(86400000,last-first);
                    const max=Math.max(1,p.metaElectoral,...points.map(v=>Math.max(v.v,v.meta||0)));const y=(v:number)=>280-v/max*240;const x=(t:number)=>105+(t-first)/span*850;
                    const pointColor=(v:number)=>colors[Math.min(4,Math.max(0,Math.ceil(v/p.metaElectoral*5)-1))];
                    const selectedIndex=Math.max(0,points.findIndex(v=>v.t===puntoProyeccion));const index=puntoProyeccion!==null&&points.some(v=>v.t===puntoProyeccion)?selectedIndex:points.length-1;const selected=points[index];const previous=points[index-1];const selectedColor=pointColor(selected.v);
                    return <><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">{[["Meta electoral",fmt(p.metaElectoral)],["Estimados por líderes",fmt(estimado)],["Proyectados actuales",fmt(actual)],["Cumplimiento",pct.toFixed(1)+"%"],["Días para elecciones",String(days)]].map(([label,value])=><div key={label} className="rounded-xl bg-slate-50 p-3"><strong className="block text-lg font-black" style={{color:label==="Cumplimiento"?color:undefined}}>{value}</strong><span className="text-xs text-slate-500">{label}</span></div>)}</div>
                    <div className="mt-4 grid gap-3 lg:grid-cols-[3fr_2fr]"><div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3"><div className="mb-3 flex items-center justify-between"><h4 className="text-xs font-bold text-slate-700">Filtros de la gráfica</h4><button className="text-xs font-bold text-blue-700" onClick={()=>{setFiltroDepto("");setFiltroMunicipio("");setFiltroSemanas("");setFiltroLider("");setDesdeGrafica("");setHastaGrafica("");setPuntoProyeccion(null);}}>Limpiar filtros</button></div><div className="grid gap-3 sm:grid-cols-2">{[{label:"Departamento",value:filtroDepto,options:departamentos,change:(v:string)=>{setFiltroDepto(v);setFiltroMunicipio("");setFiltroLider("");}},{label:"Municipio / ciudad",value:filtroMunicipio,options:municipios,change:(v:string)=>{setFiltroMunicipio(v);setFiltroLider("");}}].map(item=><label key={item.label} className="min-w-0 text-xs font-semibold text-slate-600">{item.label}<select value={item.value} onChange={e=>{item.change(e.target.value);setPuntoProyeccion(null);}} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-xs"><option value="">Todos</option>{item.options.map(v=><option key={v} value={v}>{v}</option>)}</select></label>)}<label className="text-xs font-semibold text-slate-600">Período<select value={filtroSemanas} onChange={e=>{setFiltroSemanas(e.target.value);setPuntoProyeccion(null);}} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-xs"><option value="">Toda la campaña</option>{[["1","Hoy"],["7","Últimos 7 días"],["15","Últimos 15 días"],["month","Último mes"],["quarter","Últimos 3 meses"],["custom","Personalizar"]].map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label><label className="text-xs font-semibold text-slate-600">Líder<select value={filtroLider} onChange={e=>{setFiltroLider(e.target.value);setPuntoProyeccion(null);}} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-xs"><option value="">Todos los líderes</option>{lideres.map(n=><option key={n.id} value={n.id}>{n.nombre} · {n.municipio}</option>)}</select></label>{filtroSemanas==="custom"&&<>{[["Desde",desdeGrafica,setDesdeGrafica],["Hasta",hastaGrafica,setHastaGrafica]].map(([label,value,setter])=><label key={String(label)} className="text-xs font-semibold text-slate-600">{String(label)}<input type="date" value={String(value)} onChange={e=>{(setter as (v:string)=>void)(e.target.value);setPuntoProyeccion(null);}} className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs"/></label>)}</>}</div><p className="mt-3 text-xs text-slate-500">{altas.length} líderes activos coinciden. La meta electoral sigue siendo la de toda la campaña.</p>{filtrado&&<p className="mt-2 text-xs text-amber-700">Vista filtrada reconstruida según las fichas vigentes; los cortes históricos globales no tienen desglose geográfico.</p>}</div><div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3"><h4 className="mb-3 text-xs font-bold text-slate-700">Cómo interpretar la gráfica</h4><div className="grid gap-2">{[{label:"Meta electoral",description:"Objetivo de votos definido en la campaña.",stroke:"#15803d",dash:"9 5",width:3},{label:"Estimados por líderes",description:"Suma de las estimaciones de los líderes.",stroke:"#64748b",dash:"5 4",width:2},{label:"Proyectados acumulados",description:"Aporte calculado de la red; el color indica el cumplimiento de la meta.",stroke:color,dash:undefined,width:3}].map(item=><div key={item.label} className="flex items-start gap-2"><svg viewBox="0 0 42 22" className="mt-0.5 h-5 w-10 shrink-0" aria-hidden="true">{!item.dash&&<path d="M1 17 L14 11 L25 14 L41 3 V21 H1 Z" fill={item.stroke} opacity=".25"/>}<path d={item.dash?"M1 11 H41":"M1 17 L14 11 L25 14 L41 3"} fill="none" stroke={item.stroke} strokeWidth={item.width} strokeDasharray={item.dash}/></svg><div><p className="text-xs font-bold text-slate-800">{item.label}</p><p className="mt-0.5 text-[11px] leading-4 text-slate-500">{item.description}</p></div></div>)}</div></div></div>
                    {emptyRange?<p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">{invalidRange?"La fecha inicial debe ser anterior o igual a la final.":"No hay registros en el período seleccionado."}</p>:<><div className="mt-4 overflow-x-auto"><svg role="img" aria-label="Gráfica de evolución registrada electoral" viewBox="0 0 1000 345" className="h-auto w-full min-w-[560px]">
                    {[0,1,2,3,4,5].map(i=><g key={i}><line x1="105" x2="955" y1={y(max*i/5)} y2={y(max*i/5)} stroke="#e2e8f0"/><text x="95" y={y(max*i/5)+4} textAnchor="end" fontSize="11" fill="#475569">{fmt(max*i/5)}</text></g>)}
                    <line x1="105" x2="105" y1="25" y2="280" stroke="#94a3b8"/><line x1="105" x2="955" y1="280" y2="280" stroke="#94a3b8"/><text transform="translate(20 160) rotate(-90)" textAnchor="middle" fontSize="12" fill="#475569">Votos proyectados</text>
                    <line x1="105" x2="955" y1={y(p.metaElectoral)} y2={y(p.metaElectoral)} stroke="#15803d" strokeWidth="3" strokeDasharray="9 5"/><text x="950" y={y(p.metaElectoral)-9} textAnchor="end" fontSize="13" fontWeight="bold" fill="#15803d">Meta electoral: {fmt(p.metaElectoral)}</text>
                    {points.slice(1).map((v,i)=><line key={"estimado"+i} x1={x(points[i].t)} y1={y(points[i].meta||0)} x2={x(v.t)} y2={y(v.meta||0)} stroke="#64748b" strokeWidth="2" strokeDasharray="5 4"/>)}
                    {points.slice(1).map((v,i)=><path key={"area"+i} d={`M ${x(points[i].t)} 280 L ${x(points[i].t)} ${y(points[i].v)} L ${x(v.t)} ${y(v.v)} L ${x(v.t)} 280 Z`} fill={pointColor(v.v)} opacity=".28"/>)}
                    {points.slice(1).map((v,i)=><line key={i} x1={x(points[i].t)} y1={y(points[i].v)} x2={x(v.t)} y2={y(v.v)} stroke={pointColor(v.v)} strokeWidth="3" strokeLinecap="round"/>)}
                    {points.map((v,i)=><g key={v.t} role="button" tabIndex={0} aria-label={dateFmt(new Date(v.t))+": "+fmt(v.v)+" proyectados"} onMouseEnter={()=>setPuntoProyeccion(v.t)} onFocus={()=>setPuntoProyeccion(v.t)} onClick={()=>setPuntoProyeccion(v.t)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();setPuntoProyeccion(v.t);}}} className="cursor-pointer outline-none"><circle cx={x(v.t)} cy={y(v.v)} r="12" fill="transparent"/><circle cx={x(v.t)} cy={y(v.v)} r={i===index?7:4} fill={pointColor(v.v)} stroke={i===index?"#334155":"white"} strokeWidth="1.5" pointerEvents="none"/><title>{dateFmt(new Date(v.t))}: {fmt(v.v)} proyectados</title></g>)}
                    <text x={x(selected.t)} y={y(selected.v)-14} textAnchor={x(selected.t)>800?"end":"start"} fontSize="12" fontWeight="bold" fill={selectedColor} pointerEvents="none">{fmt(selected.v)} {selected.t===now.getTime()?"actuales":"proyectados"}</text>
                    {[0,1,2,3,4].map(i=><text key={i} x={105+850*i/4} y="303" textAnchor={i===0?"start":i===4?"end":"middle"} fontSize="11" fill="#475569">{dateFmt(new Date(first+span*i/4))}</text>)}<text x="530" y="330" textAnchor="middle" fontSize="12" fill="#475569">{Number.isFinite(inicio)?dateFmt(new Date(inicio)):"Creación sin fecha registrada"} — Elecciones: {dateFmt(end)}</text></svg></div>
                    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-bold text-slate-700">Detalle del punto · {dateFmt(new Date(selected.t))}</p><div className="flex gap-2"><button disabled={index===0} onClick={()=>setPuntoProyeccion(points[index-1].t)} className="rounded-lg border bg-white px-3 py-1 text-xs disabled:opacity-40">Anterior</button><button disabled={index===points.length-1} onClick={()=>setPuntoProyeccion(points[index+1].t)} className="rounded-lg border bg-white px-3 py-1 text-xs disabled:opacity-40">Siguiente</button></div></div><div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">{[["Proyectados acumulados",fmt(selected.v)],["Estimados por líderes",fmt(selected.meta)],["Cumplimiento",(selected.v/p.metaElectoral*100).toFixed(1)+"%"],["Variación frente al punto anterior",previous?(selected.v-previous.v>0?"+":"")+fmt(selected.v-previous.v):"—"]].map(([label,value])=><div key={label}><strong className="block text-lg font-bold" style={{color:label==="Cumplimiento"?selectedColor:undefined}}>{value}</strong><span className="text-xs text-slate-500">{label}</span></div>)}</div><p className="mt-2 text-[11px] text-slate-500">Pasa el cursor o toca un punto para consultar su información. Consulta la leyenda superior para interpretar las líneas.</p></div></>}
                    <p className="mt-3 text-xs text-slate-500">{filtrado?"Reconstrucción territorial aproximada según fecha de registro y valores vigentes de los líderes.":errorCortes?"No fue posible consultar los cortes guardados. Se muestra la reconstrucción aproximada por fecha de registro y el valor actual.":points.length===1?"Aún no hay cortes anteriores identificados para esta campaña. Se guardan cortes diarios al consultar el dashboard; los días sin registros no se reconstruyen.":"Antes del primer corte, la curva reconstruye el aporte acumulado de los líderes actualmente activos según su fecha de creación y estimado vigente. Desde el primer corte utiliza los valores guardados. No es un histórico exacto de modificaciones anteriores."}</p></>;
                  })()}
                </section>

                <section className="mt-3 grid gap-3 lg:grid-cols-2">
                  <div className="min-w-0"><section className="h-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-base font-semibold text-slate-900">Proyección electoral</p>
                      <p className="mt-1 text-xs text-slate-400">
                        Compara los votos acumulados de la multired con el estimado manual de los líderes.
                      </p>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="text-2xl font-semibold tracking-tight text-slate-950">{avance.toFixed(1)}%</p>
                      <p className="text-xs text-slate-400">del estimado manual</p>
                    </div>
                  </div>

                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all"
                      style={{ width: `${avance}%` }}
                    />
                  </div>

                                     <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50/40 p-3 sm:p-4">
                     <div className="flex flex-wrap items-center justify-between gap-3">
                       <div><h3 className="text-sm font-bold text-slate-900">Gráfica de proyección por líder</h3><p className="mt-1 text-[11px] text-slate-500">Consulta todos los líderes por aporte calculado, con búsqueda y paginación.</p></div>
                       <div className="flex flex-wrap items-center gap-3 text-[10px] font-semibold"><span className="flex items-center gap-1 text-blue-700"><i className="h-2.5 w-2.5 rounded-sm bg-blue-600"/> Aporte de red</span><span className="flex items-center gap-1 text-amber-700"><i className="h-2.5 w-2.5 rounded-sm bg-amber-400"/> Estimado manual</span></div>
                     </div>
                     <div className="mt-4 flex flex-wrap items-center gap-2">
                       <input type="search" aria-label="Buscar líder en gráfica de proyección" placeholder="Buscar por nombre o ciudad..." value={busquedaProyeccion} onChange={e=>{setBusquedaProyeccion(e.target.value);setPaginaProyeccion(1);}} className="h-10 w-full max-w-sm rounded-xl border border-blue-200 bg-white px-3 text-xs outline-none focus:border-blue-500" />
                       <label className="flex items-center gap-2 text-xs text-slate-600">Mostrar <select aria-label="Líderes por página" value={tamanoPaginaProyeccion} onChange={e=>{setTamanoPaginaProyeccion(Number(e.target.value));setPaginaProyeccion(1);}} className="h-10 rounded-lg border border-blue-200 bg-white px-2"><option value={5}>5</option><option value={10}>10</option><option value={50}>50</option><option value={100}>100</option></select></label>
                     </div>
                     {(()=>{
                       const term=busquedaProyeccion.trim().toLocaleLowerCase("es");
                       const filtrados=[...lideresResumen].filter(l=>!term||`${l.nombre} ${l.ciudad}`.toLocaleLowerCase("es").includes(term)).sort((a,b)=>b.votos-a.votos);
                       const paginas=Math.max(1,Math.ceil(filtrados.length/tamanoPaginaProyeccion));
                       const actual=Math.min(paginaProyeccion,paginas);
                       const visibles=filtrados.slice((actual-1)*tamanoPaginaProyeccion,actual*tamanoPaginaProyeccion);
                       const max=Math.max(1,...filtrados.flatMap(l=>[l.votos,l.estimado]));
                       return <>
                         {visibles.length?<div className="mt-4 space-y-3">{visibles.map(l=><div key={l.id} className="grid grid-cols-[minmax(90px,150px)_1fr_auto] items-center gap-3"><div className="min-w-0" title={`${l.nombre} · Matriz ${l.matrizDirectos}x${l.matrizProfundidad}`}><button type="button" onClick={()=>{const [campana,nodo]=l.id.split(":");setFichaUrl(`/mired?campana=${encodeURIComponent(campana)}&ficha=${encodeURIComponent(nodo)}`);}} className="block w-full truncate text-left text-xs font-bold text-blue-700 hover:underline">{l.nombre}</button><span className="mt-0.5 inline-block rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-800">Matriz {l.matrizDirectos}x{l.matrizProfundidad}</span></div><div className="space-y-1"><div className="flex items-center gap-2"><div className="h-2.5 flex-1 overflow-hidden rounded-full bg-blue-100"><div className="h-full rounded-full bg-blue-600" style={{width:`${Math.max(0,l.votos/max*100)}%`}}/></div><span className="w-12 text-right text-[11px] font-semibold tabular-nums text-blue-800">{l.votos.toLocaleString("es-CO")}</span></div><div className="flex items-center gap-2"><div className="h-2.5 flex-1 overflow-hidden rounded-full bg-amber-100"><div className="h-full rounded-full bg-amber-400" style={{width:`${Math.max(0,l.estimado/max*100)}%`}}/></div><span className="w-12 text-right text-[11px] font-semibold tabular-nums text-amber-800">{l.estimado.toLocaleString("es-CO")}</span></div></div><button type="button" onClick={()=>{const [campana,nodo]=l.id.split(":");setFichaUrl(`/mired?campana=${encodeURIComponent(campana)}&ficha=${encodeURIComponent(nodo)}`);}} className="whitespace-nowrap rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800 hover:bg-blue-100">Ver ficha ↗</button></div>)}</div>:<p className="mt-4 rounded-lg bg-white p-3 text-xs text-slate-500">{term?"No hay líderes que coincidan con la búsqueda.":"Aún no hay líderes con datos para representar."}</p>}
                         <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-blue-100 pt-3"><span className="text-xs text-slate-600">Mostrando {filtrados.length?(actual-1)*tamanoPaginaProyeccion+1:0}–{Math.min(actual*tamanoPaginaProyeccion,filtrados.length)} de {filtrados.length} líderes</span><div className="flex items-center gap-2"><button type="button" disabled={actual===1} onClick={()=>setPaginaProyeccion(actual-1)} className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-700 disabled:opacity-40">Anterior</button><span className="text-xs font-semibold text-slate-700">Página {actual} de {paginas}</span><button type="button" disabled={actual>=paginas} onClick={()=>setPaginaProyeccion(actual+1)} className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-700 disabled:opacity-40">Siguiente</button></div></div>
                       </>;
                     })()}
                   </div>

                </section></div>
                  <div className="min-w-0 rounded-2xl border border-sky-100 bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-bold text-slate-900">Líderes</h3><p className="text-xs text-slate-500">Consulta individual de votos y estimado</p></div><div className="relative w-full sm:w-[235px]"><input type="search" aria-label="Buscar líder por nombre o ciudad" placeholder="Buscar líder o ciudad..." value={busquedaLider} onChange={e=>setBusquedaLider(e.target.value)} className="w-full rounded-xl border border-sky-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />{busquedaLider.trim() && <div className="absolute right-0 top-full z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">{(() => {const term=busquedaLider.trim().toLocaleLowerCase("es");const matches=lideresResumen.filter(l=>`${l.nombre} ${l.ciudad}`.toLocaleLowerCase("es").includes(term));return matches.length ? <>{matches.slice(0,8).map(l=><button key={l.id} type="button" onClick={()=>{setLiderSeleccionado(l.id);setBusquedaLider("");}} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-blue-50"><span className="block truncate text-xs font-semibold text-slate-800">{l.nombre}</span><span className="block truncate text-[10px] text-slate-500">{l.ciudad}</span></button>)}{matches.length>8&&<p className="px-3 py-2 text-[10px] text-slate-500">Mostrando 8 de {matches.length}. Escribe más para precisar.</p>}</> : <p className="px-3 py-2 text-xs text-slate-500">Sin coincidencias</p>;})()}</div>}</div></div>
                    {(() => {const lider=lideresResumen.find(l=>l.id===liderSeleccionado);if(!lider)return <p className="mt-5 text-sm text-slate-500">No hay líderes registrados para mostrar.</p>;const porcentaje=lider.estimado>0?lider.votos/lider.estimado*100:0;return <><div className="mt-4 flex items-center gap-3">{lider.fotoUrl?<img src={lider.fotoUrl} alt={lider.nombre} className="h-16 w-16 rounded-2xl border border-sky-200 object-cover"/>:<div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-sky-100 text-xl font-bold text-sky-800">{lider.nombre.slice(0,2).toUpperCase()}</div>}<div className="min-w-0"><p className="truncate text-lg font-bold text-slate-900">{lider.nombre}</p><p className="text-xs text-slate-500">📍 {lider.ciudad}</p></div></div><div className="mt-4 grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-emerald-50 p-2"><strong className="block text-lg text-emerald-800">{lider.votos.toLocaleString("es-CO")}</strong><span className="text-[10px] text-emerald-700">Votos</span></div><div className="rounded-xl bg-amber-50 p-2"><strong className="block text-lg text-amber-800">{lider.estimado.toLocaleString("es-CO")}</strong><span className="text-[10px] text-amber-700">Estimado</span></div><div className="rounded-xl bg-violet-50 p-2"><strong className="block text-lg text-violet-800">{(lider.estimado-lider.votos).toLocaleString("es-CO")}</strong><span className="text-[10px] text-violet-700">Diferencia</span></div></div><div className="mt-3 flex justify-between text-xs text-slate-500"><span>Cumplimiento</span><strong>{lider.estimado>0?`${porcentaje.toFixed(1)}%`:"Sin estimado"}</strong></div><div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{width:`${Math.min(100,Math.max(0,porcentaje))}%`}} /></div>
                    <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50/40 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div><h4 className="text-sm font-bold text-slate-900">Estimado vs. votos del líder</h4><p className="mt-1 text-[11px] text-slate-500">Comparación individual de {lider.nombre}. El aporte de red es calculado, no un resultado electoral verificado.</p></div>
                        <span className="rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-blue-800">{lider.estimado>0?porcentaje.toFixed(1)+"%":"Sin estimado"}</span>
                      </div>
                      {(()=>{const max=Math.max(1,lider.estimado,lider.votos);return <div className="mt-5 space-y-5">
                        {[{label:"Estimado manual",value:lider.estimado,color:"bg-amber-400",track:"bg-amber-100",text:"text-amber-800"},{label:"Aporte calculado de votos",value:lider.votos,color:"bg-blue-600",track:"bg-blue-100",text:"text-blue-800"}].map(row=><div key={row.label}><div className="mb-2 flex items-center justify-between gap-3"><span className="text-xs font-semibold text-slate-700">{row.label}</span><strong className={`text-sm tabular-nums ${row.text}`}>{row.value.toLocaleString("es-CO")}</strong></div><div className={`h-7 overflow-hidden rounded-lg ${row.track}`}><div className={`h-full rounded-lg transition-all duration-300 ${row.color}`} style={{width:`${Math.max(0,row.value/max*100)}%`}}/></div></div>)}
                        <p className="border-t border-blue-100 pt-3 text-[11px] text-slate-600">{lider.estimado>0?(lider.votos>=lider.estimado?"El aporte calculado alcanza o supera el estimado manual.":`Faltan ${(lider.estimado-lider.votos).toLocaleString("es-CO")} aportes calculados para alcanzar el estimado manual.`):"Este líder no tiene un estimado manual registrado."}</p>
                      </div>;})()}
                    </div></>})()}
                  </div>
                </section>
              </>
            );
          })()}

          <section className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
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

            <div className="mt-3 grid gap-2 lg:grid-cols-3">
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

          <section className="mt-3 grid gap-3 xl:grid-cols-1">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-base font-semibold text-slate-900">Resumen de cuenta</p>
              <p className="mt-1 text-xs text-slate-400">Información principal de tu campaña.</p>

              <div className="mt-3 space-y-2">
                <InfoLine label="Cliente" value={cliente?.nombreCliente || "—"} />
                <InfoLine label="Campañas creadas" value={campanas.length ? campanas.map(c => c.nombreCampana).filter(Boolean).join(", ") : "Sin campañas"} />
                <InfoLine label="Plan" value={cliente?.plan?.nombre || "—"} />
                <InfoLine
                  label="Estado"
                  value={cliente?.planActivo === false ? "Pendiente" : "Activo"}
                  accent
                />
              </div>

              <button
                onClick={() => router.push("/perfil")}
                className="mt-3 flex h-9 w-full items-center justify-center rounded-xl bg-slate-900 text-xs font-semibold text-white transition hover:bg-slate-800"
              >
                Ver perfil completo
              </button>
            </div>
          </section>
        </div>
      </div>
    {fichaUrl && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-3"><section className="flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"><header className="flex items-center justify-between border-b p-4"><h2 className="font-bold">Ficha del líder</h2><button onClick={()=>setFichaUrl("")} className="rounded-lg border px-4 py-2 text-xs font-bold">Cerrar ×</button></header><iframe title="Ficha del líder de Mi red" src={fichaUrl} className="min-h-0 w-full flex-1 border-0" /></section></div>}</main>
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
          <p className="mt-1 text-2xl font-extrabold tracking-[-0.04em] text-slate-950">{value}</p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
          <Icon name={icon} />
        </div>
      </div>
      <p className="mt-1 text-[11px] text-slate-500">{foot}</p>
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
