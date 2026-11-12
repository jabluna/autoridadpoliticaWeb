"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, createUserWithEmailAndPassword, getAuth, sendEmailVerification, signOut } from "firebase/auth";
import { deleteApp, getApp, initializeApp } from "firebase/app";
import { collection, deleteDoc, doc, getDoc, getDocs, getCountFromServer, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, startAfter, updateDoc, where, writeBatch, increment, type DocumentSnapshot, type QuerySnapshot, type Query, type DocumentData } from "firebase/firestore";
import { auth, db, rtdb, storage } from "@/lib/firebase";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import { get, ref } from "firebase/database";

type Etiqueta = { id: string; nombre: string; color: string; descripcion?: string; eliminada?: boolean };
const ETIQUETAS_PREDETERMINADAS: Etiqueta[] = [{"id":"predeterminada-0","nombre":"empresa","color":"#2563eb"},{"id":"predeterminada-1","nombre":"comerciante","color":"#d97706"},{"id":"predeterminada-2","nombre":"madre comunitaria","color":"#db2777"},{"id":"predeterminada-3","nombre":"comunal","color":"#059669"},{"id":"predeterminada-4","nombre":"transportador","color":"#0891b2"},{"id":"predeterminada-5","nombre":"constructor","color":"#78716c"},{"id":"predeterminada-6","nombre":"pensionado","color":"#7c3aed"},{"id":"predeterminada-7","nombre":"reservista","color":"#475569"},{"id":"predeterminada-8","nombre":"deportista","color":"#16a34a"},{"id":"predeterminada-9","nombre":"cultural","color":"#e11d48"},{"id":"predeterminada-10","nombre":"concejal","color":"#4f46e5"},{"id":"predeterminada-11","nombre":"alcalde","color":"#dc2626"},{"id":"predeterminada-12","nombre":"junta acción comunal","color":"#0d9488"},{"id":"predeterminada-13","nombre":"gobernador","color":"#9333ea"},{"id":"predeterminada-14","nombre":"diputado","color":"#ea580c"},{"id":"predeterminada-15","nombre":"presidente","color":"#1d4ed8"}];
type Campana = { id: string; nombreCampana: string; estado?: string };
type Nodo = { fotoUrl?: string; puntuacion?: number; puntuadoPor?: string; puntuadoEn?: unknown; departamento?: string; ciudad?: string; edad?: number; multinodo?: boolean; estimacionVotos?: number; votosRealesSubarbol?: number; votosEstimadosSubarbol?: number; id: string; nombre: string; apellido: string; email: string; telefono: string; identificacion: string; etiquetaId: string; campanaId: string; padreId: string | null; nivel: number; estado: "activo" | "inactivo"; uid: string; creadoEn?: unknown };
type Persona = { departamento?: string; ciudad?: string; multinodo?: boolean; id: string; nombre: string; apellido: string; telefono: string; identificacion: string; email: string; etiquetaId: string; responsableId: string | null; observaciones: string; creadoEn?: unknown };
type Form = { departamento: string; ciudad: string; edad: string; estimacionVotos: string; nombre: string; apellido: string; email: string; telefono: string; identificacion: string; etiquetaId: string; password: string; observaciones: string };
const EMPTY: Form = { departamento: "", ciudad: "", edad: "", estimacionVotos: "0", nombre: "", apellido: "", email: "", telefono: "", identificacion: "", etiquetaId: "", password: "", observaciones: "" };
const PAGE = 25;
const cls = "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-emerald-500";
const fullName = (n: { nombre: string; apellido: string }) => `${n.nombre} ${n.apellido}`.trim();

export default function MiRedPage({ leaderMode = false }: { leaderMode?: boolean } = {}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [leaderRoot, setLeaderRoot] = useState<string | null>(null);
  const [parentName, setParentName] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [gerente, setGerente] = useState("");
  const [niveles, setNiveles] = useState(1);
  const [campanas, setCampanas] = useState<Campana[]>([]);
  const [campanaId, setCampanaId] = useState("");
  const [etiquetas, setEtiquetas] = useState<Etiqueta[]>([]);
  const [vista, setVista] = useState<"grafica" | "tabla" | "comunidad">("grafica");
  const [focusId, setFocusId] = useState<string | null>(null);
  const [focusNode, setFocusNode] = useState<Nodo | null>(null);
  const [children, setChildren] = useState<Nodo[]>([]);
  const [childrenPage, setChildrenPage] = useState(1);
  const [ratingNode, setRatingNode] = useState<Nodo | null>(null);
  const [ratingValue, setRatingValue] = useState(5);
  const [ratingBusy, setRatingBusy] = useState(false);
  const [childrenLoading, setChildrenLoading] = useState(false);
  const [branchError, setBranchError] = useState("");
  const [directory, setDirectory] = useState<Nodo[]>([]);
  const [linkedNetworks, setLinkedNetworks] = useState<Array<{ id: string; nombre: string; categoria: string; estado: string; accesoCompartido: boolean }>>([]);
  const [linkedLoading, setLinkedLoading] = useState(false);
  const [tableRootExpanded, setTableRootExpanded] = useState(false);
  const [tableExpandedIds, setTableExpandedIds] = useState<string[]>([]);
  const [directoryCursor, setDirectoryCursor] = useState<DocumentSnapshot | null>(null);
  const [directoryHasMore, setDirectoryHasMore] = useState(false);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [people, setPeople] = useState<Persona[]>([]);
  const [peopleCursor, setPeopleCursor] = useState<DocumentSnapshot | null>(null);
  const [peopleHasMore, setPeopleHasMore] = useState(false);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [peopleOwner, setPeopleOwner] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [buscar, setBuscar] = useState("");
  const [directoryMatches, setDirectoryMatches] = useState<Nodo[] | null>(null);
  const [peopleMatches, setPeopleMatches] = useState<Persona[] | null>(null);
  const [tableSearching, setTableSearching] = useState(false);
  const [etiquetaFiltro, setEtiquetaFiltro] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [leaderPhoto, setLeaderPhoto] = useState<File | null>(null);
  const [leaderPhotoPreview, setLeaderPhotoPreview] = useState<string | null>(null);
  const [notaNodo, setNotaNodo] = useState<Nodo | null>(null);
  const [notaTexto, setNotaTexto] = useState("");
  const [notaGuardando, setNotaGuardando] = useState(false);
  const [notaEditandoId, setNotaEditandoId] = useState<string | null>(null);
  const [notasNodo, setNotasNodo] = useState<Array<{id:string; texto:string; fecha:Date|null}>>([]);
  const [notasCargando, setNotasCargando] = useState(false);
  const [labelOpen, setLabelOpen] = useState(false);
  const [labelName, setLabelName] = useState("");
  const [labelColor, setLabelColor] = useState("#0d9488");
  const [labelBusy, setLabelBusy] = useState(false);
  const [multinodo, setMultinodo] = useState(false);
  const [upgradeBusy, setUpgradeBusy] = useState(false);
  const [formType, setFormType] = useState<"nodo" | "persona">("nodo");
  const [editingNode, setEditingNode] = useState<Nodo | null>(null);
  const [editingPerson, setEditingPerson] = useState<Persona | null>(null);
  const [parentId, setParentId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [catalogo, setCatalogo] = useState<Record<string, Record<string, unknown>>>({});
  const [catalogoError, setCatalogoError] = useState("");
  const [searchCards, setSearchCards] = useState(false);
  const [tagSearch, setTagSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragNode, setDragNode] = useState<Nodo | null>(null);
  const [globalSearch, setGlobalSearch] = useState("");
  const [globalResults, setGlobalResults] = useState<Nodo[]>([]);
  const [globalSearching, setGlobalSearching] = useState(false);
  const [movePicker, setMovePicker] = useState<Nodo | null>(null);
  const [destination, setDestination] = useState<string | null>(null);
  const [destinationSearch, setDestinationSearch] = useState("");
  const [destinationResults, setDestinationResults] = useState<Nodo[]>([]);
  const [returnFocus, setReturnFocus] = useState<string | null>(null);
  const [totals, setTotals] = useState({ estimados: 0, registros: 0 });
  const [rebuilding, setRebuilding] = useState(false);
  const [metricsReady, setMetricsReady] = useState(false);
  const searchSeq = useRef(0);
  const departamentos = useMemo(() => Object.keys(catalogo).sort((a,b) => a.localeCompare(b,"es")), [catalogo]);
  const municipios = useMemo(() => Object.keys(catalogo[form.departamento] || {}).sort((a,b) => a.localeCompare(b,"es")), [catalogo, form.departamento]);
  useEffect(() => { let active = true; void get(ref(rtdb, "MUNICIPIOPUESTOS")).then(s => { if (active) setCatalogo(s.exists() ? s.val() : {}); }).catch(() => { if (active) setCatalogoError("No fue posible cargar departamentos y municipios. Revisa los permisos de MUNICIPIOPUESTOS."); }); return () => { active = false; }; }, []);

  useEffect(() => {
    if (!clienteId || !campanaId || leaderMode || !auth.currentUser) { setLinkedNetworks([]); return; }
    let active = true;
    setLinkedLoading(true);
    void (async () => {
      try {
        const token = await auth.currentUser!.getIdToken();
        const response = await fetch(`/api/redes-vinculadas?campanaId=${encodeURIComponent(campanaId)}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "No se pudieron cargar las redes vinculadas.");
        if (active) setLinkedNetworks(data.vinculaciones || []);
      } catch (error) { if (active) notify(error instanceof Error ? error.message : "No se pudieron cargar las redes vinculadas."); }
      finally { if (active) setLinkedLoading(false); }
    })();
    return () => { active = false; };
  }, [clienteId, campanaId, leaderMode]);
  const nodesRef = useCallback(() => collection(db, "clientes", clienteId, "campanas", campanaId, "nodos"), [clienteId, campanaId]);
  const peopleRef = useCallback((owner: string | null) => owner ? collection(db, "clientes", clienteId, "campanas", campanaId, "nodos", owner, "personas") : collection(db, "clientes", clienteId, "campanas", campanaId, "personasRaiz"), [clienteId, campanaId]);
  const ownerName = peopleOwner ? (focusNode?.id === peopleOwner ? fullName(focusNode) : directory.find(n => n.id === peopleOwner) ? fullName(directory.find(n => n.id === peopleOwner)!) : `Nodo ${peopleOwner.slice(0, 8)}`) : gerente;
  const showPeople = (owner: string | null) => {
    if (leaderMode && !owner) return notify("Selecciona un nodo de tu red."); setReturnFocus(focusId); setPeopleOwner(owner); setPeople([]); setPeopleCursor(null); setBuscar(""); setEtiquetaFiltro(""); setVista("comunidad"); };
  const metricsRef = useCallback(() => doc(db, "clientes", clienteId, "campanas", campanaId, "metricas", "red"), [clienteId, campanaId]);
  useEffect(() => {
    if (!clienteId || !campanaId || leaderMode) { setTotals({ estimados: 0, registros: 0 }); setMetricsReady(false); return; }
    return onSnapshot(metricsRef(), snap => { setMetricsReady(snap.data()?.reconciliado === true); setTotals({ estimados: Number(snap.data()?.votosEstimados || 0), registros: Number(snap.data()?.registros || 0) }); }, e => notify(`No se pudieron consultar las métricas: ${e.message}`));
  }, [clienteId, campanaId, metricsRef]);
  const ancestors = async (owner: string | null) => {
    const refs: string[] = []; const seen = new Set<string>(); let id = owner;
    while (id) {
      if (seen.has(id) || refs.length > 30) throw new Error("Jerarquía inconsistente.");
      seen.add(id); refs.push(id);
      const snap = await getDoc(doc(nodesRef(), id));
      if (!snap.exists()) throw new Error("No existe el nodo responsable.");
      id = snap.data().padreId || null;
    }
    return refs;
  };
  const addCounter = (batch: ReturnType<typeof writeBatch>, ids: string[], field: "votosRealesSubarbol" | "votosEstimadosSubarbol", amount: number) => {
    if (!amount) return;
    ids.forEach(id => batch.update(doc(nodesRef(), id), { [field]: increment(amount) }));
    batch.set(metricsRef(), { [field === "votosRealesSubarbol" ? "registros" : "votosEstimados"]: increment(amount) }, { merge: true });
  };
  // Recuento explícito de registros históricos: consulta COUNT por nodo sin descargar las personas.
  // Para redes masivas debe ejecutarse en Cloud Functions con bloqueo de escrituras concurrentes.
  const recalculateLeaderTotals = async () => {
    if (!leaderRoot || !clienteId || !campanaId || rebuilding) return;
    setRebuilding(true);
    try {
      const visited = new Set<string>();
      const queue = [leaderRoot];
      let registros = 0;
      let estimados = 0;
      while (queue.length) {
        const id = queue.shift()!;
        if (visited.has(id)) throw new Error("Se detectó una jerarquía circular.");
        visited.add(id);
        if (visited.size > 300) throw new Error("La red supera 300 nodos; el recálculo debe ejecutarse desde el servidor.");
        const nodeSnap = await getDoc(doc(nodesRef(), id));
        if (!nodeSnap.exists() || nodeSnap.data().estado === "inactivo") continue;
        estimados += Number(nodeSnap.data().estimacionVotos || 0);
        const count = await getCountFromServer(query(peopleRef(id)));
        registros += count.data().count;
        const descendants = await getDocs(query(nodesRef(), where("padreId", "==", id)));
        for (const child of descendants.docs) if (child.data().estado !== "inactivo") queue.push(child.id);
      }
      setTotals({ estimados, registros });
      setMetricsReady(true);
      notify("Conteo actualizado exclusivamente para tu red.", true);
    } catch (e) { notify(e instanceof Error ? e.message : "No fue posible contar tu red."); }
    finally { setRebuilding(false); }
  };
  useEffect(() => { if (leaderMode && leaderRoot && clienteId && campanaId) void recalculateLeaderTotals(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaderMode, leaderRoot, clienteId, campanaId]);
  const reconcileMetrics = async () => {
    if (leaderMode) { await recalculateLeaderTotals(); return; }
    if (!clienteId || !campanaId || rebuilding) return;
    if (!window.confirm("¿Recalcular los totales desde los registros guardados? Para evitar inconsistencias, no registres ni traslades personas durante el recálculo.")) return;
    setRebuilding(true); setBusy(true);
    try {
      const all: Nodo[] = [];
      let cursor: DocumentSnapshot | null = null;
      while (true) {
        const snap: QuerySnapshot<DocumentData> = await getDocs(query(nodesRef(), orderBy("nombre"), ...(cursor ? [startAfter(cursor)] : []), limit(200)));
        all.push(...snap.docs.map(d => ({ id: d.id, ...d.data() } as Nodo)));
        if (all.length > 300) throw new Error("La red supera los 300 nodos. El recálculo completo debe realizarse en el servidor para evitar resultados parciales.");
        if (snap.size < 200) break;
        cursor = snap.docs[snap.docs.length - 1];
      }
      const active = all.filter(n => n.estado !== "inactivo");
      const direct = new Map<string, number>();
      const counts = await Promise.all(active.map(async n => ({ id: n.id, count: (await getCountFromServer(query(peopleRef(n.id)))).data().count })));
      counts.forEach(x => direct.set(x.id, x.count));
      const rootCount = (await getCountFromServer(query(peopleRef(null)))).data().count;
      const byId = new Map(active.map(n => [n.id, n]));
      const aggregate = new Map<string, { real: number; estimate: number }>();
      const calc = (id: string, seen: Set<string>): { real: number; estimate: number } => {
        if (aggregate.has(id)) return aggregate.get(id)!;
        if (seen.has(id)) throw new Error("Se detectó un ciclo en la jerarquía. No se modificaron los contadores.");
        const node = byId.get(id);
        if (!node) throw new Error("Hay un nodo sin responsable válido. Corrige la jerarquía antes de recalcular.");
        const path = new Set(seen); path.add(id);
        const result = { real: direct.get(id) || 0, estimate: Number(node.estimacionVotos || 0) };
        active.filter(n => n.padreId === id).forEach(child => { const subtotal = calc(child.id, path); result.real += subtotal.real; result.estimate += subtotal.estimate; });
        aggregate.set(id, result); return result;
      };
      active.forEach(n => calc(n.id, new Set()));
      const root = { real: rootCount, estimate: 0 };
      active.filter(n => !n.padreId).forEach(n => { const value = aggregate.get(n.id)!; root.real += value.real; root.estimate += value.estimate; });
      // Un único lote: evita dejar contadores a medio reconstruir.
      const batch = writeBatch(db);
      active.forEach(n => { const value = aggregate.get(n.id)!; batch.update(doc(nodesRef(), n.id), { votosRealesSubarbol: value.real, votosEstimadosSubarbol: value.estimate }); });
      batch.set(metricsRef(), { registros: root.real, votosEstimados: root.estimate, reconciliado: true, reconciliadoEn: serverTimestamp() }, { merge: true });
      await batch.commit();
      notify(`Recuento completado: ${root.real.toLocaleString("es-CO")} personas registradas y ${root.estimate.toLocaleString("es-CO")} estimadas.`, true);
    } catch (e) { notify(e instanceof Error ? e.message : "No fue posible recalcular."); }
    finally { setRebuilding(false); setBusy(false); }
  };
  const tag = (id: string) => etiquetas.find(t => t.id === id);
  const abrirNotas = async (n: Nodo) => {
    setNotaNodo(n); setNotaTexto(""); setNotaEditandoId(null); setNotasNodo([]); setNotasCargando(true);
    try {
      const snap = await getDocs(collection(db, "clientes", clienteId, "campanas", campanaId, "nodos", n.id, "notas"));
      setNotasNodo(snap.docs.map(d => ({id:d.id, texto:String(d.data().texto||""), fecha:d.data().fecha?.toDate?.() || null})).sort((a,b)=>(b.fecha?.getTime()||0)-(a.fecha?.getTime()||0)));
    } catch(e) { setError(e instanceof Error ? e.message : "No fue posible consultar las notas."); }
    finally { setNotasCargando(false); }
  };
  const guardarNota = async () => {
    if (!notaNodo || !notaTexto.trim() || notaGuardando) return;
    setNotaGuardando(true);
    try {
      const notesCollection = collection(db, "clientes", clienteId, "campanas", campanaId, "nodos", notaNodo.id, "notas");
      if (notaEditandoId) {
        await updateDoc(doc(notesCollection, notaEditandoId), {texto:notaTexto.trim(), fechaEdicion:serverTimestamp()});
      } else {
        await setDoc(doc(notesCollection), {texto:notaTexto.trim(), fecha:serverTimestamp(), autorUid:auth.currentUser?.uid || ""});
      }
      setNotaTexto(""); setNotaEditandoId(null);
      const snap = await getDocs(collection(db, "clientes", clienteId, "campanas", campanaId, "nodos", notaNodo.id, "notas"));
      setNotasNodo(snap.docs.map(d => ({id:d.id, texto:String(d.data().texto||""), fecha:d.data().fecha?.toDate?.() || null})).sort((a,b)=>(b.fecha?.getTime()||0)-(a.fecha?.getTime()||0)));
      notify("Nota guardada correctamente.", true);
    } catch(e) { notify(e instanceof Error ? e.message : "No se pudo guardar la nota."); }
    finally { setNotaGuardando(false); }
  };
  const eliminarNota = async (id: string) => {
    if (!notaNodo || notaGuardando || !window.confirm("¿Eliminar esta nota definitivamente?")) return;
    setNotaGuardando(true);
    try {
      await deleteDoc(doc(db, "clientes", clienteId, "campanas", campanaId, "nodos", notaNodo.id, "notas", id));
      setNotasNodo(prev=>prev.filter(n=>n.id!==id));
      if (notaEditandoId===id) {setNotaEditandoId(null);setNotaTexto("");}
      notify("Nota eliminada.",true);
    } catch(e) {notify(e instanceof Error?e.message:"No fue posible eliminar la nota.");}
    finally {setNotaGuardando(false);}
  };
  const compartirResumen = (n: Nodo) => {
    const votos=statsFor(n).votos;
    const estimado=Number(n.estimacionVotos||0);
    const mensaje=`Resumen de la red de ${fullName(n)}\nVotos de la red: ${votos.toLocaleString("es-CO")}\nEstimado: ${estimado.toLocaleString("es-CO")}\nDiferencia: ${(estimado-votos).toLocaleString("es-CO")}\nFecha: ${new Date().toLocaleString("es-CO")}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(mensaje)}`,"_blank","noopener,noreferrer");
  };
  const notify = (text: string, success = false) => { setError(success ? "" : text); setOk(success ? text : ""); };
  const inviteToCampaign = async () => {
    if (!campanaId || !auth.currentUser) return notify("Selecciona primero una campaña.");
    const telefono = window.prompt("Número de WhatsApp del cliente registrado que deseas invitar (ejemplo: 3001234567):");
    if (!telefono?.trim()) return;
    try {
      const response = await fetch("/api/invitaciones-red", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await auth.currentUser.getIdToken()}` },
        body: JSON.stringify({ campanaId, telefono: telefono.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo crear la invitación.");
      const url = `https://autoridad-politica-web--autoridadpolitica.us-central1.hosted.app/invitaciones?invitacion=${encodeURIComponent(data.id)}`;
      const campaign = campanas.find(c => c.id === campanaId)?.nombreCampana || "mi campaña";
      const message = `Te han invitado a formar parte de mi grupo de trabajo en ${campaign}. Inicia sesión en Autoridad Política y revisa tu invitación: ${url}. La vinculación requiere tu aceptación y no comparte datos hasta su activación.`;
      const whatsapp = `https://wa.me/${data.telefono.startsWith("57") ? data.telefono : `57${data.telefono}`}?text=${encodeURIComponent(message)}`;
      window.open(whatsapp, "_blank", "noopener,noreferrer");
      notify("Invitación creada. Se abrió WhatsApp con el mensaje preparado.", true);
    } catch (error) { notify(error instanceof Error ? error.message : "No fue posible crear la invitación."); }
  };

  useEffect(() => {
    let live = true;
    const unsub = onAuthStateChanged(auth, async user => {
      if (!user) { router.replace("/login"); return; }
      try {
        const us = await getDoc(doc(db, "usuarios", user.uid));
        if (!us.exists()) throw new Error("No existe tu usuario.");
        const u = us.data();
        if (u.rol !== (leaderMode ? "red_usuario" : "cliente_admin") || u.estado === "inactivo" || !u.clienteId || (leaderMode && (!u.nodoId || !u.campanaId))) throw new Error("Acceso no autorizado.");
        const cs = await getDoc(doc(db, "clientes", u.clienteId));
        if (!cs.exists() || cs.data().estado === "inactivo" || cs.data().planActivo === false) throw new Error("Cliente o plan inactivo.");
        const c = cs.data();
        const campaigns = leaderMode ? null : await getDocs(collection(db, "clientes", u.clienteId, "campanas"));
        const leaderNode = leaderMode ? await getDoc(doc(db,"clientes",u.clienteId,"campanas",u.campanaId,"nodos",u.nodoId)) : null;
        if (leaderMode && (!leaderNode?.exists() || leaderNode.data()?.uid !== user.uid || leaderNode.data()?.estado === "inactivo")) throw new Error("Nodo de líder no autorizado.");
        const parentNode = leaderMode && leaderNode?.data()?.padreId ? await getDoc(doc(db,"clientes",u.clienteId,"campanas",u.campanaId,"nodos",leaderNode.data()!.padreId)) : null;
        if (!live) return;
        setClienteId(u.clienteId);
        setGerente(String(c.responsable || c.nombreCliente || user.email || "Gerente"));
        setNiveles(Number(c.plan?.meses ?? 0) > 0 ? Infinity : Math.max(1, Number(c.nivelesRed) || 3));
        const rows = leaderMode ? [{id:u.campanaId,nombreCampana:"Mi campaña",estado:"activa"} as Campana] : campaigns!.docs.map(d => ({ id: d.id, ...d.data() } as Campana));
        if (leaderMode) {setLeaderRoot(u.nodoId);setFocusId(u.nodoId);setParentName(parentNode?.exists()?`${parentNode.data()?.nombre||""} ${parentNode.data()?.apellido||""}`.trim():String(c.responsable||c.nombreCliente||"Gerencia"));}
        setCampanas(rows);
        setCampanaId(rows.find(x => x.estado === "activa")?.id || rows[0]?.id || "");
      } catch (e) { if (live) notify(e instanceof Error ? e.message : "No fue posible validar tu cuenta."); }
      finally { if (live) setLoading(false); }
    });
    return () => { live = false; unsub(); };
  }, [router, leaderMode]);

  useEffect(() => {
    if (!clienteId) return;
    return onSnapshot(collection(db, "clientes", clienteId, "etiquetasNodo"), snap => { const guardadas = snap.docs.map(d => ({ id: d.id, ...d.data() } as Etiqueta)); const ids = new Set(guardadas.map(t => t.id)); setEtiquetas([...ETIQUETAS_PREDETERMINADAS.filter(t => !ids.has(t.id)), ...guardadas].filter(t => !t.eliminada).sort((a,b) => a.nombre.localeCompare(b.nombre, "es"))); }, e => notify(`No se pudieron cargar etiquetas: ${e.message}`));
  }, [clienteId]);

  useEffect(() => {
    setFocusId(leaderMode ? leaderRoot : null); setChildrenPage(1); setFocusNode(null); setChildren([]); setDirectory([]); setPeople([]);
    setDirectoryCursor(null); setPeopleCursor(null); setPeopleOwner(null); setBuscar(""); setEtiquetaFiltro(""); setGlobalSearch(""); setGlobalResults([]); setSearchCards(false);
  }, [campanaId, leaderMode, leaderRoot]);

  useEffect(() => {
    if (!clienteId || !campanaId) return;
    let live = true;
    let unsubFocus = () => {};
    if (focusId) {
      unsubFocus = onSnapshot(doc(nodesRef(), focusId), s => { if (live) { if (!s.exists() || s.data().estado === "inactivo") { setFocusId(leaderMode ? leaderRoot : null); setFocusNode(null); } else setFocusNode({ id: s.id, ...s.data() } as Nodo); } }, e => notify(e.message));
    } else setFocusNode(null);
    setChildrenLoading(true); setBranchError("");
    setChildrenPage(1);
    const q: Query<DocumentData> = query(nodesRef(), where("padreId", "==", focusId));
    const unsub = onSnapshot(q, snap => {
      if (!live) return;
      const active = snap.docs.map(d => ({ id: d.id, ...d.data() } as Nodo)).filter(n => n.estado !== "inactivo");
      setChildren(active.sort((a,b) => fullName(a).localeCompare(fullName(b))));
      setChildrenLoading(false);

    }, e => { if (live) { setChildrenLoading(false); setBranchError(`No se pudo cargar el nodo: ${e.message}`); } });
    return () => { live = false; unsub(); unsubFocus(); };
  }, [clienteId, campanaId, focusId, nodesRef]);

  const loadDirectory = useCallback(async (append = false, cursor: DocumentSnapshot | null = null) => {
    if (!clienteId || !campanaId || leaderMode) return;
    setDirectoryLoading(true);
    try {
      const constraints = [orderBy("nombre"), limit(PAGE)];
      const q: Query<DocumentData> = query(nodesRef(), ...(append && cursor ? [orderBy("nombre"), startAfter(cursor), limit(PAGE)] : constraints));
      const snap: QuerySnapshot<DocumentData> = await getDocs(q);
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Nodo)).filter(n => n.estado !== "inactivo");
      setDirectory(prev => append ? [...prev, ...data] : data);
      setDirectoryCursor(snap.docs[snap.docs.length - 1] || null);
      setDirectoryHasMore(snap.size === PAGE);
    } catch (e) { notify(e instanceof Error ? e.message : "No fue posible cargar el directorio."); }
    finally { setDirectoryLoading(false); }
  }, [clienteId, campanaId, nodesRef]);

  const loadPeople = useCallback(async (append = false, cursor: DocumentSnapshot | null = null) => {
    if (!clienteId || !campanaId || (leaderMode && !peopleOwner)) return;
    setPeopleLoading(true);
    try {
      const q: Query<DocumentData> = query(peopleRef(peopleOwner), orderBy("nombre"), ...(append && cursor ? [startAfter(cursor)] : []), limit(PAGE));
      const snap: QuerySnapshot<DocumentData> = await getDocs(q);
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Persona));
      setPeople(prev => append ? [...prev, ...data] : data);
      setPeopleCursor(snap.docs[snap.docs.length - 1] || null);
      setPeopleHasMore(snap.size === PAGE);
    } catch (e) { notify(e instanceof Error ? e.message : "No fue posible cargar la comunidad."); }
    finally { setPeopleLoading(false); }
  }, [clienteId, campanaId, peopleRef, peopleOwner]);

  useEffect(() => { if (vista === "tabla") void loadDirectory(); if (vista === "comunidad") void loadPeople(); }, [vista, loadDirectory, loadPeople]);

  const normalizeSearch = (value: unknown) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").trim();
  const matchRecord = (record: Nodo | Persona, term: string) => {
    const words = normalizeSearch(term).split(/\s+/).filter(Boolean);
    const searchable = normalizeSearch([fullName(record), record.email, record.identificacion, record.telefono, record.departamento, record.ciudad, "nivel" in record ? record.nivel : "", "edad" in record ? record.edad : "", tag(record.etiquetaId)?.nombre].join(" "));
    return words.every(w => searchable.includes(w));
  };
  const filteredNodes = useMemo(() => (directoryMatches ?? directory).filter(n => matchRecord(n, buscar) && (!etiquetaFiltro || n.etiquetaId === etiquetaFiltro)), [directoryMatches, directory, buscar, etiquetaFiltro, etiquetas]);
  const hierarchicalNodes = useMemo(() => {
    const all = directoryMatches ?? directory;
    const byId = new Map(all.map(n => [n.id, n]));
    const children = new Map<string, Nodo[]>();
    for (const n of filteredNodes) {
      const parent = n.padreId && byId.has(n.padreId) ? n.padreId : "__root__";
      const group = children.get(parent) ?? [];
      group.push(n);
      children.set(parent, group);
    }
    const ordered: Nodo[] = [];
    const visited = new Set<string>();
    const visit = (id: string) => {
      for (const n of children.get(id) ?? []) {
        if (visited.has(n.id)) continue;
        visited.add(n.id);
        ordered.push(n);
        visit(n.id);
      }
    };
    visit("__root__");
    for (const n of filteredNodes) if (!visited.has(n.id)) { visited.add(n.id); ordered.push(n); visit(n.id); }
    return ordered;
  }, [directoryMatches, directory, filteredNodes]);
  const tableChildCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of directoryMatches ?? directory) if (n.padreId) counts.set(n.padreId, (counts.get(n.padreId) ?? 0) + 1);
    return counts;
  }, [directoryMatches, directory]);
  const tableVisibleNodes = useMemo(() => {
    if (buscar.trim() || etiquetaFiltro) return hierarchicalNodes;
    if (!tableRootExpanded) return [];
    const visible = new Set<string>();
    const available = new Set(hierarchicalNodes.map(n => n.id));
    for (const n of hierarchicalNodes) {
      if (!n.padreId || !available.has(n.padreId)) { visible.add(n.id); continue; }
      if (visible.has(n.padreId) && tableExpandedIds.includes(n.padreId)) visible.add(n.id);
    }
    return hierarchicalNodes.filter(n => visible.has(n.id));
  }, [hierarchicalNodes, tableRootExpanded, tableExpandedIds, buscar, etiquetaFiltro]);
  const toggleTableNode = (id: string) => setTableExpandedIds(current => current.includes(id) ? current.filter(x => x !== id) : [...current, id]);
  const parentOfNode = (n: Nodo) => {
    if (!n.padreId) return gerente;
    const parent = (directoryMatches ?? directory).find(p => p.id === n.padreId);
    return parent ? fullName(parent) : `Responsable · ${n.padreId.slice(0, 8)}`;
  };
  const filteredPeople = useMemo(() => (peopleMatches ?? people).filter(n => matchRecord(n, buscar) && (!etiquetaFiltro || n.etiquetaId === etiquetaFiltro)), [peopleMatches, people, buscar, etiquetaFiltro, etiquetas]);
  useEffect(() => {
    if (vista === "grafica" || buscar.trim().length < 2 || !clienteId || !campanaId) { setDirectoryMatches(null); setPeopleMatches(null); setTableSearching(false); return; }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setTableSearching(true);
      try {
        const foundNodes: Nodo[] = [];
        const foundPeople: Persona[] = [];
        let cursor: DocumentSnapshot | null = null;
        for (let page = 0; page < 10; page++) {
          const base = vista === "tabla" ? nodesRef() : peopleRef(peopleOwner);
          const snap: QuerySnapshot<DocumentData> = await getDocs(cursor ? query(base, orderBy("__name__"), startAfter(cursor), limit(300)) : query(base, orderBy("__name__"), limit(300)));
          snap.docs.forEach(d => {
            if (vista === "tabla") {
              const n = {id:d.id,...d.data()} as Nodo;
              if (n.estado !== "inactivo" && matchRecord(n,buscar)) foundNodes.push(n);
            } else {
              const p = {id:d.id,...d.data()} as Persona;
              if (matchRecord(p,buscar)) foundPeople.push(p);
            }
          });
          if (snap.size < 300 || foundNodes.length + foundPeople.length >= 200) break;
          cursor = snap.docs[snap.docs.length-1];
        }
        if (!cancelled) { if (vista === "tabla") setDirectoryMatches(foundNodes); else setPeopleMatches(foundPeople); }
      } catch (e) { if (!cancelled) notify(e instanceof Error ? e.message : "No fue posible buscar registros."); }
      finally { if (!cancelled) setTableSearching(false); }
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [buscar, vista, clienteId, campanaId, peopleOwner, nodesRef, peopleRef, etiquetas]);
  const [networkStats, setNetworkStats] = useState<Record<string, { votos: number; directos: number; profundidad: number }>>({});
  const [leaderFilter, setLeaderFilter] = useState("");
  const [leaderSort, setLeaderSort] = useState<"votos" | "nombre" | "estimado" | "calificacion">("votos");
  const [leaderPageSize, setLeaderPageSize] = useState(12);
  const filteredLeaders = children.filter(n => [fullName(n), n.email, n.identificacion, n.ciudad, n.departamento, tag(n.etiquetaId)?.nombre].join(" ").toLocaleLowerCase("es").includes(leaderFilter.trim().toLocaleLowerCase("es"))).sort((a,b) => leaderSort === "nombre" ? fullName(a).localeCompare(fullName(b),"es") : leaderSort === "estimado" ? Number(b.estimacionVotos || 0) - Number(a.estimacionVotos || 0) : leaderSort === "calificacion" ? Number(b.puntuacion || 0) - Number(a.puntuacion || 0) : (networkStats[b.id]?.votos || 1) - (networkStats[a.id]?.votos || 1));
  const childrenPages = Math.max(1, Math.ceil(filteredLeaders.length / leaderPageSize));
  const visibleChildren = filteredLeaders.slice((childrenPage - 1) * leaderPageSize, childrenPage * leaderPageSize);
  const tagsFiltered = etiquetas.filter(t => `${t.nombre} ${t.descripcion || ""}`.toLowerCase().includes(tagSearch.toLowerCase()));

  const openForm = (type: "nodo" | "persona", parent: string | null = focusId, node?: Nodo, person?: Persona) => {
    notify("", true); setLeaderPhoto(null); setLeaderPhotoPreview(null); setFormType(type); setEditingNode(node || null); setEditingPerson(person || null);
    setParentId(node ? node.padreId : person ? peopleOwner : parent);
    setForm(node ? { ...EMPTY, nombre: node.nombre, apellido: node.apellido, email: node.email, telefono: node.telefono, identificacion: node.identificacion, etiquetaId: node.etiquetaId, estimacionVotos: String(node.estimacionVotos || 0), departamento: node.departamento || "", ciudad: node.ciudad || "", edad: node.edad ? String(node.edad) : "" } : person ? { ...EMPTY, nombre: person.nombre, apellido: person.apellido, email: person.email || "", telefono: person.telefono, identificacion: person.identificacion, etiquetaId: person.etiquetaId, observaciones: person.observaciones || "", departamento: person.departamento || "", ciudad: person.ciudad || "" } : { ...EMPTY, etiquetaId: etiquetas[0]?.id || "" });
    setMultinodo(type === "nodo" ? (node?.multinodo ?? true) : (person?.multinodo ?? false)); setTagSearch(""); setFormOpen(true);
  };

  const requestMoreLevels = async () => {
    if (leaderMode) return notify("La ampliación de plan corresponde al administrador.");
    if (!Number.isFinite(niveles)) return notify("Tu plan ya permite niveles ilimitados.");
    if (!clienteId || upgradeBusy) return;
    if (!window.confirm(`Tu plan actual permite ${niveles} niveles. ¿Enviar una solicitud de ampliación para habilitar el nivel ${niveles + 1}?`)) return;
    setUpgradeBusy(true);
    try {
      await setDoc(doc(collection(db, "clientes", clienteId, "solicitudesPlan")), {
        tipo: "aumentar_niveles", campanaId, nivelesActuales: niveles,
        nivelesSolicitados: niveles + 1, estado: "pendiente",
        origen: "mired", creadoEn: serverTimestamp(),
      });
      notify("Solicitud de ampliación enviada. Puedes consultar su estado en peticiones.", true);
    } catch(e) { notify(e instanceof Error ? e.message : "No fue posible enviar la solicitud."); }
    finally { setUpgradeBusy(false); }
  };

  const save = async () => {
    notify("", true);
    if (leaderMode) return notify("Los registros de líderes requieren habilitar las reglas de seguridad por subárbol.");
    if (!clienteId || !campanaId) return;
    if (leaderPhoto && (!leaderPhoto.type.startsWith("image/") || leaderPhoto.size > 2 * 1024 * 1024)) return notify("La foto debe ser una imagen de máximo 2 MB.");
    if (!form.nombre.trim() || !form.apellido.trim() || !form.etiquetaId) return notify("Nombre, apellido y etiqueta son obligatorios.");
    if (!etiquetas.some(t => t.id === form.etiquetaId)) return notify("Selecciona una etiqueta válida.");
    if (formType === "nodo" && !editingNode && (!form.email.trim() || form.password.length < 6)) return notify("Para crear un nodo se requiere correo y contraseña de al menos 6 caracteres.");
    if (formType === "nodo" && form.edad && (!Number.isInteger(Number(form.edad)) || Number(form.edad) < 18 || Number(form.edad) > 120)) return notify("Ingresa una edad válida entre 18 y 120 años.");
    if (formType === "nodo" && (!/^\d+$/.test(form.estimacionVotos) || !Number.isSafeInteger(Number(form.estimacionVotos)))) return notify("La estimación debe ser un entero no negativo.");
    setBusy(true);
    try {
      let fotoUrl = editingNode?.fotoUrl || "";
      if (formType === "nodo" && leaderPhoto) {
        const photoId = editingNode?.id || crypto.randomUUID();
        const photoRef = storageRef(storage, `clientes/${clienteId}/campanas/${campanaId}/lideres/${photoId}/foto-${Date.now()}`);
        await uploadBytes(photoRef, leaderPhoto, { contentType: leaderPhoto.type });
        fotoUrl = await getDownloadURL(photoRef);
      }
      const payload = { departamento: form.departamento.trim(), ciudad: form.ciudad.trim(), ...(formType === "nodo" ? { edad: form.edad ? Number(form.edad) : null } : {}), nombre: form.nombre.trim(), apellido: form.apellido.trim(), telefono: form.telefono.trim(), identificacion: form.identificacion.trim(), etiquetaId: form.etiquetaId };
      if (formType === "persona") {
        const personPayload = { ...payload, multinodo: false, email: form.email.trim().toLowerCase(), observaciones: form.observaciones.trim() };
        if (editingPerson) await updateDoc(doc(peopleRef(parentId), editingPerson.id), { ...personPayload, actualizadoEn: serverTimestamp() });
        else {
          const batch = writeBatch(db);
          batch.set(doc(peopleRef(parentId)), { ...personPayload, responsableId: parentId, creadoEn: serverTimestamp(), actualizadoEn: serverTimestamp() });
          addCounter(batch, await ancestors(parentId), "votosRealesSubarbol", 1);
          await batch.commit();
        }
        await loadPeople(); notify(editingPerson ? "Registro actualizado sin perder su responsable." : "Persona registrada en la comunidad. No se consumió ningún cupo de nodos.", true);
      } else if (editingNode) {
        if (form.email.trim().toLowerCase() !== editingNode.email.toLowerCase()) throw new Error("El correo de acceso requiere actualizar Authentication mediante un proceso seguro.");
        const difference = Number(form.estimacionVotos) - Number(editingNode.estimacionVotos || 0);
        const batch = writeBatch(db);
        batch.update(doc(nodesRef(), editingNode.id), { ...payload, fotoUrl, multinodo, estimacionVotos: Number(form.estimacionVotos), votosEstimadosSubarbol: increment(difference), actualizadoEn: serverTimestamp() });
        const parentAncestors = await ancestors(editingNode.padreId);
        parentAncestors.forEach(id => batch.update(doc(nodesRef(), id), { votosEstimadosSubarbol: increment(difference) }));
        if (difference) batch.set(metricsRef(), { votosEstimados: increment(difference) }, { merge: true });
        await batch.commit();
        await loadDirectory(); notify("Nodo y etiqueta actualizados sin perder su estructura.", true);
      } else {
        const level = parentId ? (focusNode?.id === parentId ? focusNode.nivel : (await getDoc(doc(nodesRef(), parentId))).data()?.nivel || 1) + 1 : 2;
        if (level > niveles) throw new Error(`El plan permite ${niveles} niveles. Solicita una ampliación desde Mi Red para registrar más líderes.`);
        if (parentId) { const parent = await getDoc(doc(nodesRef(), parentId)); if (!parent.exists() || parent.data().multinodo === false) throw new Error("Este líder no tiene habilitado multinodo para registrar líderes descendientes."); }
        const secondary = initializeApp(getApp().options, `mired-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        const secondaryAuth = getAuth(secondary);
        let uid = "";
        try {
          const credential = await createUserWithEmailAndPassword(secondaryAuth, form.email.trim().toLowerCase(), form.password);
          uid = credential.user.uid;
          const nodeRef = doc(nodesRef());
          const batch = writeBatch(db);
          batch.set(nodeRef, { ...payload, multinodo, estimacionVotos: Number(form.estimacionVotos), votosEstimadosSubarbol: Number(form.estimacionVotos), votosRealesSubarbol: 0, email: form.email.trim().toLowerCase(), campanaId, padreId: parentId, nivel: level, uid, estado: "activo", creadoEn: serverTimestamp(), actualizadoEn: serverTimestamp() });
          batch.set(doc(db, "usuarios", uid), { uid, email: form.email.trim().toLowerCase(), nombre: payload.nombre, apellido: payload.apellido, rol: "red_usuario", estado: "activo", clienteId, campanaId, nodoId: nodeRef.id, creadoEn: serverTimestamp() });
          const parentAncestors = await ancestors(parentId);
          parentAncestors.forEach(id => batch.update(doc(nodesRef(), id), { votosEstimadosSubarbol: increment(Number(form.estimacionVotos)) }));
          batch.set(metricsRef(), { votosEstimados: increment(Number(form.estimacionVotos)) }, { merge: true });
          await batch.commit();
          try { await sendEmailVerification(credential.user); notify("Líder creado. Enviamos un correo de verificación a su dirección; debe confirmarlo antes de ingresar.", true); }
          catch { notify("Líder creado, pero no se pudo enviar el correo de verificación. El líder podrá solicitar un nuevo envío desde el inicio de sesión.", true); }
        } catch (e) { if (uid) notify("Authentication pudo crear la cuenta sin completar Firestore. Verifica antes de reintentar."); throw e; }
        finally { await signOut(secondaryAuth).catch(() => undefined); await deleteApp(secondary).catch(() => undefined); }
      }
      setFormOpen(false); setLeaderPhoto(null); setLeaderPhotoPreview(null); setEditingNode(null); setEditingPerson(null); setForm(EMPTY);
    } catch (e) { notify(e instanceof Error ? e.message : "No fue posible guardar."); }
    finally { setBusy(false); }
  };

  const removePerson = async (p: Persona) => {
    if (leaderMode) return notify("La eliminación de registros está restringida para líderes.");
    if (!window.confirm(`¿Eliminar el registro comunitario de ${fullName(p)}?`)) return;
    setBusy(true);
    try { const batch = writeBatch(db); batch.delete(doc(peopleRef(peopleOwner), p.id)); addCounter(batch, await ancestors(peopleOwner), "votosRealesSubarbol", -1); await batch.commit(); await loadPeople(); notify("Registro comunitario eliminado.", true); }
    catch (e) { notify(e instanceof Error ? e.message : "No fue posible eliminar."); }
    finally { setBusy(false); }
  };

  const removeNode = async (n: Nodo) => {
    if (leaderMode) return notify("La eliminación de nodos está restringida para líderes.");
    const descendants = await getDocs(query(nodesRef(), where("padreId", "==", n.id), limit(1)));
    if (!descendants.empty) return notify("Primero reasigna o retira sus nodos descendientes.");
    const registered = await getDocs(query(peopleRef(n.id), limit(1)));
    if (!registered.empty) return notify("Este líder tiene comunidad registrada. Reasigna esos registros antes de retirarlo.");
    if (!window.confirm(`¿Retirar a ${fullName(n)}? Su acceso se marcará como inactivo.`)) return;
    setBusy(true);
    try {
      const batch = writeBatch(db);
      batch.update(doc(nodesRef(), n.id), { estado: "inactivo", actualizadoEn: serverTimestamp() });
      batch.update(doc(db, "usuarios", n.uid), { estado: "inactivo", actualizadoEn: serverTimestamp() });
      const parentAncestors = await ancestors(n.padreId);
      parentAncestors.forEach(id => batch.update(doc(nodesRef(), id), { votosEstimadosSubarbol: increment(-Number(n.estimacionVotos || 0)) }));
      batch.set(metricsRef(), { votosEstimados: increment(-Number(n.estimacionVotos || 0)) }, { merge: true });
      await batch.commit(); if (focusId === n.id) setFocusId(n.padreId); await loadDirectory(); notify("Nodo inactivado. Las reglas deben impedir su acceso.", true);
    } catch (e) { notify(e instanceof Error ? e.message : "No fue posible retirar el nodo."); }
    finally { setBusy(false); }
  };

  const move = async (node: Nodo, targetId: string | null) => {
    if (leaderMode) return notify("La reasignación de nodos está restringida para líderes.");
    setDragId(null); setDragNode(null);
    if (node.id === targetId || node.padreId === targetId) return;
    setBusy(true);
    try {
      const target = targetId ? await getDoc(doc(nodesRef(), targetId)) : null;
      if (targetId && (!target?.exists() || target.data().estado === "inactivo")) throw new Error("El responsable de destino no está disponible.");
      if (targetId && target?.data()?.multinodo === false) throw new Error("No se puede realizar el traslado: esta persona no está habilitada como líder para formar una red. Primero debes habilitarla desde Editar.");
      const descendants: Nodo[] = [];
      const pending = [node.id];
      while (pending.length) {
        const id = pending.shift()!;
        const snap = await getDocs(query(nodesRef(), where("padreId", "==", id)));
        for (const d of snap.docs) {
          const child = { id: d.id, ...d.data() } as Nodo;
          if (child.estado === "inactivo") continue;
          if (child.id === targetId) throw new Error("No puedes trasladar un nodo debajo de su propia descendencia.");
          descendants.push(child); pending.push(child.id);
          if (descendants.length > 400) throw new Error("Este nodo tiene demasiados descendientes para trasladarla desde el navegador. Requiere una operación de servidor por lotes.");
        }
      }
      const level = target ? Number(target.data()?.nivel || 1) + 1 : 2;
      const shift = level - node.nivel;
      if ([node, ...descendants].some(n => n.nivel + shift > niveles || n.nivel + shift < 2)) throw new Error("El traslado excede los niveles permitidos.");
      if (!window.confirm(`¿Trasladar a ${fullName(node)} y ${descendants.length} descendientes bajo ${target ? fullName(target.data() as Nodo) : gerente}?`)) return;
      const batch = writeBatch(db);
      batch.update(doc(nodesRef(), node.id), { padreId: targetId, nivel: level, actualizadoEn: serverTimestamp() });
      descendants.forEach(n => batch.update(doc(nodesRef(), n.id), { nivel: n.nivel + shift, actualizadoEn: serverTimestamp() }));
      // Los totales del nodo se conservan; se descuentan y suman a sus antecesores.
      const oldAncestors = await ancestors(node.padreId);
      const newAncestors = await ancestors(targetId);
      const changes = new Map<string, { registros: number; estimados: number }>();
      const deltaReal = Number(node.votosRealesSubarbol || 0);
      const deltaEstimate = Number(node.votosEstimadosSubarbol ?? node.estimacionVotos ?? 0);
      oldAncestors.forEach(id => { const v = changes.get(id) || { registros: 0, estimados: 0 }; v.registros -= deltaReal; v.estimados -= deltaEstimate; changes.set(id, v); });
      newAncestors.forEach(id => { const v = changes.get(id) || { registros: 0, estimados: 0 }; v.registros += deltaReal; v.estimados += deltaEstimate; changes.set(id, v); });
      changes.forEach((v, id) => { if (v.registros || v.estimados) batch.update(doc(nodesRef(), id), { votosRealesSubarbol: increment(v.registros), votosEstimadosSubarbol: increment(v.estimados) }); });
      await batch.commit(); setFocusId(targetId); await loadDirectory(); notify("Nodo trasladado. Se conservaron las etiquetas, los registros y los accesos.", true);
    } catch (e) { notify(e instanceof Error ? e.message : "No fue posible trasladar el nodo."); }
    finally { setBusy(false); }
  };

  const lookupNodes = useCallback(async (value: string): Promise<Nodo[]> => {
    if (leaderMode) return [];
    const normalize = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").trim();
    const terms = normalize(value).split(/\s+/).filter(Boolean);
    if (!terms.length || !clienteId || !campanaId) return [];
    const results: Nodo[] = [];
    let cursor: DocumentSnapshot | null = null;
    // Paginación del índice de nodos: busca coincidencias parciales sin exigir prefijo exacto.
    // Límite preventivo para no generar lecturas ilimitadas en redes grandes.
    for (let page = 0; page < 10; page++) {
      const snap: QuerySnapshot<DocumentData> = await getDocs(cursor
        ? query(nodesRef(), orderBy("__name__"), startAfter(cursor), limit(300))
        : query(nodesRef(), orderBy("__name__"), limit(300)));
      snap.docs.forEach(d => {
        const n = { id: d.id, ...d.data() } as Nodo;
        if (n.estado === "inactivo") return;
        const fields = [fullName(n), n.email, n.identificacion, n.telefono, n.departamento, n.ciudad, n.edad, etiquetas.find(t => t.id === n.etiquetaId)?.nombre];
        const searchable = normalize(fields.join(" "));
        if (terms.every(t => searchable.includes(t))) results.push(n);
      });
      if (snap.size < 300 || results.length >= 200) break;
      cursor = snap.docs[snap.docs.length - 1];
    }
    return results.sort((x,y) => fullName(x).localeCompare(fullName(y), "es")).slice(0, 200);
  }, [clienteId, campanaId, nodesRef, etiquetas]);

  useEffect(() => {
    const seq = ++searchSeq.current;
    if (globalSearch.trim().length < 2) { setGlobalResults([]); setGlobalSearching(false); return; }
    setGlobalSearching(true);
    const timer = setTimeout(() => {
      void lookupNodes(globalSearch).then(result => { if (searchSeq.current === seq) setGlobalResults(result); })
        .catch(e => { if (searchSeq.current === seq) notify(e instanceof Error ? e.message : "Error buscando nodos."); })
        .finally(() => { if (searchSeq.current === seq) setGlobalSearching(false); });
    }, 300);
    return () => clearTimeout(timer);
  }, [globalSearch, lookupNodes]);

  useEffect(() => {
    if (!movePicker || destinationSearch.trim().length < 2) { setDestinationResults([]); return; }
    let active = true;
    const timer = setTimeout(() => { void lookupNodes(destinationSearch).then(results => { if (active) setDestinationResults(results); }).catch(e => notify(e instanceof Error ? e.message : "Error buscando destino.")); }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [movePicker, destinationSearch, lookupNodes]);

  const openMove = (node: Nodo) => { setMovePicker(node); setDestination(node.padreId); setDestinationSearch(""); setDestinationResults([]); };
  const finishMove = async () => {
    if (!movePicker) return;
    const node = movePicker;
    const target = destination;
    if (node.padreId === target || node.id === target) return;
    await move(node, target);
    setMovePicker(null);
  };

  const EXCEL_HEADERS = ["Nombre", "Apellido", "Documento", "Teléfono", "Correo", "Etiqueta", "Observaciones"] as const;
  const exportPeople = async () => {
    if (leaderMode) return notify("La exportación global corresponde al administrador.");
    if (!campanaId) return;
    setExporting(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const sheet = wb.addWorksheet("Personas");
      sheet.addRow([...EXCEL_HEADERS]);
      sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF075E54" } };
      sheet.columns = [22, 22, 20, 20, 32, 25, 48].map(width => ({ width }));
      // Exportación paginada: no descarga millones de documentos en una sola consulta.
      let cursor: DocumentSnapshot | null = null;
      let count = 0;
      do {
        const q: Query<DocumentData> = query(peopleRef(peopleOwner), orderBy("nombre"), ...(cursor ? [startAfter(cursor)] : []), limit(250));
        const snap: QuerySnapshot<DocumentData> = await getDocs(q);
        for (const d of snap.docs) {
          const p = d.data() as Persona;
          sheet.addRow([p.nombre, p.apellido, p.identificacion, p.telefono, p.email, tag(p.etiquetaId)?.nombre || "", p.observaciones]);
          count++;
        }
        cursor = snap.size === 250 ? snap.docs[snap.docs.length - 1] : null;
        if (count >= 10000) { notify("Se exportaron los primeros 10.000 registros del nodo. Para volúmenes mayores se requiere exportación en servidor."); break; }
      } while (cursor);
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `personas-${campanaId}-${peopleOwner || "raiz"}.xlsx`; a.click(); URL.revokeObjectURL(url);
    } catch (e) { notify(e instanceof Error ? e.message : "No se pudo exportar Excel."); }
    finally { setExporting(false); }
  };

  const downloadTemplate = async () => {
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const sheet = wb.addWorksheet("Personas");
      sheet.addRow([...EXCEL_HEADERS]);
      sheet.columns = [22, 22, 20, 20, 32, 25, 48].map(width => ({ width }));
      sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF075E54" } };
      const labels = wb.addWorksheet("Etiquetas disponibles");
      labels.addRow(["Etiqueta (copiar nombre exacto)"]);
      etiquetas.forEach(t => labels.addRow([t.nombre]));
      labels.getColumn(1).width = 38;
      const buffer = await wb.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buffer as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const a = document.createElement("a"); a.href = url; a.download = "formato-importacion-personas.xlsx"; a.click(); URL.revokeObjectURL(url);
    } catch (e) { notify(e instanceof Error ? e.message : "No se pudo crear el formato."); }
  };

  const importPeople = async (file?: File) => {
    if (!file || !campanaId) return;
    setImporting(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await file.arrayBuffer() as never);
      const sheet = wb.worksheets[0];
      if (!sheet) throw new Error("El archivo no contiene hojas.");
      const normalize = (v: unknown) => String(v ?? "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const header = new Map<string, number>();
      sheet.getRow(1).eachCell((cell, col) => header.set(normalize(cell.text), col));
      const required = ["nombre", "apellido", "documento", "telefono", "correo", "etiqueta", "observaciones"];
      const missing = required.filter(h => !header.has(h));
      if (missing.length) throw new Error(`Encabezados faltantes: ${missing.join(", ")}. Descarga el formato de Excel.`);
      if (sheet.rowCount - 1 > 400) throw new Error("Importa máximo 400 personas por archivo para evitar exceder el límite de escritura. Divide el Excel en varios archivos.");
      const records: { row: number; data: Record<string, string>; etiquetaId: string }[] = [];
      for (let i = 2; i <= sheet.rowCount; i++) {
        const row = sheet.getRow(i);
        const data: Record<string, string> = {};
        for (const h of required) data[h] = String(row.getCell(header.get(h)!).text || "").trim();
        if (!required.some(h => data[h])) continue;
        if (!data.nombre || !data.apellido || !data.etiqueta) throw new Error(`Fila ${i}: nombre, apellido y etiqueta son obligatorios.`);
        const matches = etiquetas.filter(t => normalize(t.nombre) === normalize(data.etiqueta));
        if (matches.length !== 1) throw new Error(`Fila ${i}: etiqueta «${data.etiqueta}» inexistente o ambigua. Configúrala antes de importar.`);
        records.push({ row: i, data, etiquetaId: matches[0].id });
      }
      if (!records.length) throw new Error("El Excel no contiene personas para importar.");
      if (!window.confirm(`¿Importar ${records.length} personas al nodo ${ownerName}? Se crearán registros nuevos; no se reemplazarán existentes.`)) return;
      const batch = writeBatch(db);
      for (const r of records) {
        const d = r.data;
        batch.set(doc(peopleRef(peopleOwner)), { nombre: d.nombre, apellido: d.apellido, identificacion: d.documento, telefono: d.telefono, email: d.correo.toLowerCase(), etiquetaId: r.etiquetaId, observaciones: d.observaciones, responsableId: peopleOwner, creadoEn: serverTimestamp(), actualizadoEn: serverTimestamp() });
      }
      addCounter(batch, await ancestors(peopleOwner), "votosRealesSubarbol", records.length);
      await batch.commit(); await loadPeople(); notify(`${records.length} personas importadas al nodo seleccionado.`, true);
    } catch (e) { notify(e instanceof Error ? e.message : "No se pudo importar el archivo."); }
    finally { setImporting(false); }
  };

  const exportNodes = async () => {
    if (leaderMode) return notify("La exportación global corresponde al administrador.");
    if (!campanaId) return;
    setExporting(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const sheet = wb.addWorksheet("Niveles de red");
      sheet.addRow(["ID nodo", "Nivel", "Nombre", "Apellido", "Documento", "Teléfono", "Correo", "Etiqueta", "ID responsable", "Estado"]);
      sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF075E54" } };
      sheet.columns = [30, 10, 22, 22, 20, 20, 32, 22, 30, 15].map(width => ({ width }));
      sheet.addRow(["RAIZ", 1, gerente, "", "", "", "", "Gerencia", "", "activo"]);
      let cursor: DocumentSnapshot | null = null;
      let count = 0;
      do {
        const q: Query<DocumentData> = query(nodesRef(), orderBy("nombre"), ...(cursor ? [startAfter(cursor)] : []), limit(250));
        const snap: QuerySnapshot<DocumentData> = await getDocs(q);
        for (const d of snap.docs) {
          const n = { id: d.id, ...d.data() } as Nodo;
          sheet.addRow([n.id, n.nivel, n.nombre, n.apellido, n.identificacion, n.telefono, n.email, tag(n.etiquetaId)?.nombre || "", n.padreId || "RAIZ", n.estado]);
          count++;
        }
        cursor = snap.size === 250 ? snap.docs[snap.docs.length - 1] : null;
        if (count >= 10000) { notify("Se exportaron los primeros 10.000 nodos. Para exportar más, se requiere un proceso de servidor."); break; }
      } while (cursor);
      const buffer = await wb.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buffer as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const a = document.createElement("a"); a.href = url; a.download = `niveles-red-${campanaId}.xlsx`; a.click(); URL.revokeObjectURL(url);
    } catch (e) { notify(e instanceof Error ? e.message : "No se pudieron exportar los niveles."); }
    finally { setExporting(false); }
  };

  // Votos: cada líder activo cuenta una sola vez. Matriz: líderes directos x profundidad descendiente.
  useEffect(() => {
    if (!clienteId || !campanaId) { setNetworkStats({}); setRootTotals({ votos: 0, estimados: 0, directos: 0, profundidad: 0 }); return; }
    // Mantener los votos sincronizados con altas, ediciones y eliminaciones de cualquier nivel.
    const refNodes = collection(db, "clientes", clienteId, "campanas", campanaId, "nodos");
    return onSnapshot(query(refNodes, limit(5001)), snap => {
      if (snap.size > 5000) { notify("La red supera 5.000 líderes: el cálculo debe migrarse al servidor."); return; }
      const active = snap.docs.map(d => ({ id: d.id, ...d.data() } as Nodo)).filter(n => n.estado !== "inactivo");
      const byParent = new Map<string, Nodo[]>();
      for (const n of active) { const k = n.padreId || ""; byParent.set(k, [...(byParent.get(k) || []), n]); }
      const computed: Record<string, { votos: number; directos: number; profundidad: number }> = {};
      const visiting = new Set<string>();
      const compute = (n: Nodo): { votos: number; directos: number; profundidad: number } => {
        if (computed[n.id]) return computed[n.id];
        if (visiting.has(n.id)) throw new Error("Jerarquía circular detectada.");
        visiting.add(n.id);
        const direct = byParent.get(n.id) || [];
        // Sin multinodo, el valor comprometido por el líder se contabiliza como aporte.
        // Con red, su aporte propio es 1 más los aportes de sus descendientes.
        let votos = n.multinodo === false ? Math.max(1, Number(n.estimacionVotos) || 1) : 1;
        let profundidad = 0;
        for (const child of direct) {
          const stats = compute(child);
          votos += stats.votos;
          profundidad = Math.max(profundidad, 1 + stats.profundidad);
        }
        visiting.delete(n.id);
        return computed[n.id] = { votos, directos: direct.length, profundidad };
      };
      try {
        for (const n of active) compute(n);
        const roots = byParent.get("") || [];
        setRootTotals({
          votos: roots.reduce((sum, n) => sum + computed[n.id].votos, 0),
          estimados: active.reduce((sum, n) => sum + Number(n.estimacionVotos || 0), 0),
          directos: roots.length,
          profundidad: roots.reduce((max, n) => Math.max(max, 1 + computed[n.id].profundidad), 0),
        });
        setNetworkStats(computed);
      } catch (e) { notify(e instanceof Error ? e.message : "No se pudo calcular la red."); }
    }, e => notify(e.message || "No se pudo consultar la red."));
  }, [clienteId, campanaId]);
  const statsFor = (n: Nodo) => networkStats[n.id] || { votos: 1, directos: 0, profundidad: 0 };
  const [rootTotals, setRootTotals] = useState({ votos: 0, estimados: 0, directos: 0, profundidad: 0 });
  const estimateGap = (n: Nodo) => Number(n.estimacionVotos || 0) - statsFor(n).votos;

  const graph = <section className={`flex flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm ${fullscreen ? "fixed inset-0 z-40 rounded-none" : ""}`}>
    <div className="flex-1 overflow-auto bg-[#f4faff] p-4" style={{ minHeight: fullscreen ? 0 : 420 }}>
      {!leaderMode && (linkedLoading || linkedNetworks.length > 0) && <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
        <h3 className="text-sm font-bold text-emerald-950">Redes vinculadas a mi campaña</h3>
        <p className="mt-1 text-xs text-emerald-900">Personas que aceptaron unirse con su propia red. Conservan la propiedad de sus datos.</p>
        {linkedLoading && <p className="mt-2 text-xs">Consultando vinculaciones…</p>}
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {linkedNetworks.map(network => <div key={network.id} className="rounded-xl border border-emerald-200 bg-white p-3 shadow-sm">
            <div className="font-bold text-slate-900">{network.nombre}</div>
            <div className="mt-1 text-xs text-slate-600">Campaña: {network.categoria}</div>
            <div className="mt-2 text-xs font-semibold text-emerald-700">✓ Vinculación aceptada</div>
            <div className="mt-1 text-xs text-slate-500">{network.accesoCompartido ? "Acceso a red habilitado" : "Vista completa de la red pendiente de habilitación segura"}</div>
          </div>)}
        </div>
      </div>}
      <div className="w-full">
        <div className="relative grid grid-cols-1 items-start justify-items-center gap-3 xl:grid-cols-[minmax(0,1fr)_300px_minmax(0,1fr)] xl:gap-4">
        <div className="relative w-full max-w-[380px] min-w-0 self-start rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:col-start-1 xl:row-start-1 xl:justify-self-start">
    <div className="space-y-3 border-b border-slate-100 pb-3">
      <div><h2 className="font-bold">Explorador de nodos · {campanas.find(c => c.id === campanaId)?.nombreCampana}</h2><p className="text-xs text-slate-500">Explora un nodo a la vez. Usa el buscador para localizar líderes de otros niveles.</p></div>
      <div className="grid grid-cols-2 gap-2"><button onClick={() => setFocusId(leaderMode ? leaderRoot : null)} title="Ir a la raíz" className="rounded-xl border px-3 py-2 text-xs font-bold">⌂ Raíz</button><button onClick={() => void exportNodes()} disabled={exporting} className="rounded-xl border px-3 py-2 text-xs font-bold disabled:opacity-40">{exporting ? "Exportando..." : "Exportar niveles Excel"}</button><button onClick={() => setFocusId(leaderMode && (!focusNode?.padreId || focusNode.id === leaderRoot) ? leaderRoot : focusNode?.padreId || null)} disabled={!focusNode || (leaderMode && focusNode.id === leaderRoot)} title="Subir un nivel" className="rounded-xl border px-3 py-2 text-xs font-bold disabled:opacity-40">↑ Subir</button><button onClick={() => setFullscreen(v => !v)} className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white">{fullscreen ? "Salir de pantalla completa" : "⛶ Pantalla completa"}</button></div>
    </div>
    <div className="relative pt-3">
      <input disabled={leaderMode} value={globalSearch} onChange={e => setGlobalSearch(e.target.value)} placeholder="⌕ Busca por fragmentos: fusa, nombre, departamento, edad, etiqueta..." aria-label="Buscar líderes de toda la campaña" className={`${cls} w-full min-w-0`} />
      {!leaderMode && globalSearch.trim().length >= 2 && <div className="absolute left-0 right-0 top-full z-30 max-h-72 overflow-auto rounded-xl border bg-white p-2 shadow-xl">
        {globalSearching && <p className="p-3 text-xs text-slate-500">Buscando...</p>}
        {!globalSearching && !globalResults.length && <p className="p-3 text-xs text-slate-500">No se encontraron líderes con esos datos.</p>}
        {globalResults.map(n => <button key={n.id} type="button" onClick={() => { setFocusId(n.id); setGlobalSearch(""); setGlobalResults([]); setSearchCards(false); }} className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-xs hover:bg-emerald-50"><span className="font-bold">{fullName(n)} <span className="font-normal text-slate-400">· {tag(n.etiquetaId)?.nombre || "Sin etiqueta"}</span></span><span className="shrink-0 text-emerald-700">Nivel {n.nivel} →</span></button>)}
      </div>}
      {globalSearch.trim().length >= 2 && !globalSearching && globalResults.length > 0 && <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3"><span className="text-xs font-bold text-emerald-950">{globalResults.length} líderes encontrados</span><button type="button" onClick={() => setSearchCards(v=>!v)} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white">{searchCards ? "Volver a lista" : "Ver tarjetas de resultados"}</button></div>}
      {globalSearch.trim().length >= 2 && searchCards && <div className="mt-3 grid max-h-[450px] grid-cols-1 gap-3 overflow-auto rounded-xl bg-slate-50 p-3 grid-cols-1">{globalResults.map(n => <div key={n.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between gap-2"><strong className="text-sm text-slate-900">{fullName(n)}</strong><span className="rounded-md bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-800">Nivel {n.nivel}</span></div><p className="mt-2 text-xs text-slate-600">{[n.ciudad,n.departamento,etiquetas.find(t=>t.id===n.etiquetaId)?.nombre].filter(Boolean).join(" · ")}</p><p className="mt-2 text-sm font-bold text-slate-700">★ {n.puntuacion ?? "—"}/10</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => { setFocusId(n.id); setGlobalSearch(""); setGlobalResults([]); setSearchCards(false); }} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white">Abrir en la red →</button><button type="button" onClick={() => {setRatingNode(n);setRatingValue(n.puntuacion ?? 5);}} className="rounded-lg border px-3 py-2 text-xs font-bold">✎ Calificar</button></div></div>)}</div>}
      <p className="mt-1 text-[10px] text-slate-400">Escribe parte de una palabra (ej.: «fusa» encuentra «Fusagasugá»). Puedes combinar términos. «Ver tarjetas» muestra coincidencias sin cambiar la estructura de la red.</p>
    </div>
        </div>

        <div onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect="move";}} onDrop={e=>{e.preventDefault();e.stopPropagation();if(dragNode)void move(dragNode,focusId);}} className="w-full max-w-[300px] rounded-[20px] border border-sky-200 bg-white p-3 text-center xl:col-start-2 xl:row-start-1 shadow-[0_12px_36px_rgba(14,85,130,.12)]">
          <div className="flex items-center justify-between text-[11px] font-bold text-sky-600"><span>{focusNode?`Nivel ${focusNode.nivel}`:"Gerencia · Nivel 1"}</span><div className="flex gap-1"><button onClick={()=>setFocusId(leaderMode&&focusNode?.id===leaderRoot?leaderRoot:focusNode?.padreId||(leaderMode?leaderRoot:null))} disabled={!focusNode||(leaderMode&&focusNode.id===leaderRoot)} className="rounded-lg border border-slate-200 px-2 py-1 disabled:opacity-30">↑ Superior</button><button onClick={()=>setFocusId(leaderMode?leaderRoot:null)} className="rounded-lg bg-sky-50 px-2 py-1">⌂ Inicio</button></div></div>
          <div className="mt-2 flex items-center gap-2 text-left"><div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border-[3px] border-sky-300 bg-sky-50 text-lg font-black text-sky-700">{focusNode?.fotoUrl?<img src={focusNode.fotoUrl} alt={fullName(focusNode)} className="h-full w-full object-cover" />:`${(focusNode?.nombre?.[0]||gerente?.[0]||"G").toUpperCase()}${(focusNode?.apellido?.[0]||"").toUpperCase()}`}</div><div className="min-w-0 flex-1"><h3 className="truncate text-sm font-black text-slate-900">{focusNode?fullName(focusNode):gerente}</h3><p className="truncate text-[10px] text-sky-600">{focusNode?tag(focusNode.etiquetaId)?.nombre||"Líder":"Candidato / gerente"}</p>{leaderMode&&focusNode?.id===leaderRoot&&<p className="text-[9px] text-slate-500">Superior: {parentName}</p>}{focusNode&&(!leaderMode||focusNode.id!==leaderRoot)&&<button onClick={()=>{setRatingNode(focusNode);setRatingValue(focusNode.puntuacion??5);}} className="mt-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">★ {focusNode.puntuacion??"—"}/10 ✎</button>}</div><div className="shrink-0 space-y-1 text-right"><div className="animate-pulse rounded-lg border border-emerald-300 bg-emerald-100 px-2 py-1 shadow-[0_0_12px_rgba(16,185,129,.20)]"><strong className="block text-lg font-black leading-none text-emerald-800">{(focusNode?statsFor(focusNode).votos:rootTotals.votos).toLocaleString("es-CO")}</strong><span className="text-[9px] text-slate-500">Votos</span></div><div className="rounded-lg border border-violet-300 bg-violet-100 px-2 py-1"><strong className="block text-sm font-black leading-none text-violet-800">{focusNode?statsFor(focusNode).directos:rootTotals.directos}×{focusNode?statsFor(focusNode).profundidad:rootTotals.profundidad}</strong><span className="text-[9px] text-slate-500">Matriz</span></div></div></div>
          {(() => {const votes=focusNode?statsFor(focusNode).votos:rootTotals.votos;const estimate=focusNode?Number(focusNode.estimacionVotos||0):rootTotals.estimados;const percent=estimate>0?Math.round(votes/estimate*100):0;return <div className="mt-3"><div className="flex justify-between text-[11px] font-semibold text-slate-500"><span>Avance de la meta</span><span className="font-black text-sky-600">{estimate>0?`${percent}%`:"Sin meta"}</span></div><div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-sky-400 to-emerald-400" style={{width:`${Math.min(100,Math.max(0,percent))}%`}} /></div></div>})()}
          
          <div className="mt-2 grid grid-cols-3 gap-1.5 text-left">{[["Estimado",(focusNode?Number(focusNode.estimacionVotos||0):rootTotals.estimados)],["Diferencia",(focusNode?estimateGap(focusNode):rootTotals.estimados-rootTotals.votos)],["Reuniones",(focusNode?Number(focusNode.votosRealesSubarbol||0):Number(totals.registros))]].map(([label,value])=><div key={String(label)} className={`min-w-0 rounded-lg border p-2 ${label === "Estimado" ? "border-amber-200 bg-amber-50 text-amber-900" : label === "Diferencia" ? "border-violet-200 bg-violet-50 text-violet-900" : "border-cyan-200 bg-cyan-50 text-cyan-900"}`}><strong className="block truncate text-sm font-black">{Number(value).toLocaleString("es-CO")}</strong><span className="text-[10px] text-slate-500">{label}</span></div>)}</div>
          <details className="mt-3 border-t border-slate-100 pt-2 text-left">
<summary className="cursor-pointer rounded-lg bg-sky-50 px-3 py-2 text-center text-xs font-bold text-sky-800">Acciones · Ver más ▾</summary>
<div className="mt-2 grid grid-cols-2 gap-1.5">
<button onClick={()=>openForm("persona",focusId)} className="rounded-lg border p-2 text-[11px]">+ Reuniones</button>
<button onClick={()=>showPeople(focusId)} className="rounded-lg border p-2 text-[11px]">Ver reuniones</button>
<button onClick={()=>openForm("nodo",focusId)} disabled={(focusNode?.nivel||1)>=niveles||focusNode?.multinodo===false} className="rounded-lg bg-emerald-600 p-2 text-[11px] font-bold text-white disabled:opacity-40">+ Líder</button>
{focusNode&&<button onClick={()=>openForm("nodo",focusNode.padreId,focusNode)} className="rounded-lg border p-2 text-[11px]">Editar</button>}
<button onClick={()=>void abrirNotas(focusNode || {id:"gerencia",nombre:gerente,apellido:"",email:"",telefono:"",identificacion:"",etiquetaId:"",campanaId,padreId:null,nivel:1,estado:"activo",uid:auth.currentUser?.uid||""})} className="rounded-lg border border-blue-200 bg-blue-50 p-2 text-[11px] font-semibold text-blue-800">Comentarios</button>
<button onClick={()=>{if(focusNode){compartirResumen(focusNode);}else{const mensaje=`Resumen de Gerencia: ${gerente}\nVotos de la red: ${rootTotals.votos.toLocaleString("es-CO")}\nEstimado: ${rootTotals.estimados.toLocaleString("es-CO")}\nFecha: ${new Date().toLocaleString("es-CO")}`;window.open(`https://wa.me/?text=${encodeURIComponent(mensaje)}`,"_blank","noopener,noreferrer");}}} className="flex items-center justify-center gap-1 rounded-lg border border-green-200 bg-green-50 p-2 text-[11px] font-semibold text-green-800"><span aria-hidden="true">✆</span> WhatsApp</button>
{(focusNode?.nivel||1)>=niveles&&!leaderMode&&<button onClick={()=>void requestMoreLevels()} className="rounded-lg border p-2 text-[11px]">Solicitar niveles</button>}
</div></details>
        </div>
        <aside className="w-full max-w-[380px] self-start rounded-2xl border border-slate-200 bg-white p-3 shadow-sm xl:col-start-3 xl:row-start-1 xl:justify-self-end">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-1">
            <div><h3 className="text-sm font-extrabold text-slate-900">Nivel {(focusNode?.nivel || 1) + 1} · Líderes de {focusNode ? fullName(focusNode) : "Gerencia"}</h3><p className="mt-0.5 text-[11px] text-slate-500">{children.length.toLocaleString("es-CO")} líderes en este nivel · {children.reduce((s,n)=>s+(networkStats[n.id]?.votos||1),0).toLocaleString("es-CO")} votos acumulados de sus redes</p></div>
            <span className="rounded-full bg-sky-50 px-2 py-1 text-[10px] font-bold text-sky-800">Nivel actual: {focusNode?.nivel || 1} → Nivel {(focusNode?.nivel || 1) + 1}</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <input aria-label="Buscar líderes de este nivel" value={leaderFilter} onChange={e=>{setLeaderFilter(e.target.value);setChildrenPage(1);}} placeholder="Buscar por nombre, correo, municipio o etiqueta..." className="col-span-full h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs outline-none focus:border-emerald-500" />
            <select aria-label="Ordenar líderes" value={leaderSort} onChange={e=>{setLeaderSort(e.target.value as typeof leaderSort);setChildrenPage(1);}} className="h-9 min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs"><option value="votos">Más votos</option><option value="nombre">Nombre A–Z</option><option value="estimado">Mayor estimado</option><option value="calificacion">Mejor calificación</option></select>
            <select aria-label="Tarjetas por página" value={leaderPageSize} onChange={e=>{setLeaderPageSize(Number(e.target.value));setChildrenPage(1);}} className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs"><option value={12}>12 por página</option><option value={24}>24 por página</option><option value={48}>48 por página</option></select>
          </div>
          <p className="mt-1.5 text-[10px] text-slate-500">Mostrando {filteredLeaders.length ? (childrenPage-1)*leaderPageSize+1 : 0}–{Math.min(childrenPage*leaderPageSize,filteredLeaders.length)} de {filteredLeaders.length} líderes encontrados</p>
        </aside>
        </div>
        <div aria-hidden="true" className="mx-auto h-9 w-[3px] rounded-full bg-sky-500" />
        {childrenLoading ? <p className="p-10 text-center text-sm">Cargando nodos...</p> : <div className="relative grid gap-x-3 gap-y-6 pt-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">{visibleChildren.length > 1 && <div aria-hidden="true" className="pointer-events-none absolute top-0 hidden h-[3px] rounded-full bg-sky-500 xl:block" style={{left:"10%",width:`${(Math.min(visibleChildren.length,5)-1)*20}%`}} />}{visibleChildren.map(n => <article key={n.id} className={`relative min-w-0 rounded-[20px] border-2 p-3 text-center shadow-[0_6px_20px_rgba(20,90,140,.08)] transition hover:shadow-lg ${n.multinodo !== false ? "border-emerald-300 bg-emerald-50/60 hover:border-emerald-500" : "border-sky-300 bg-sky-50/60 hover:border-sky-500"}`}>
<div aria-hidden="true" className="pointer-events-none absolute -top-5 left-1/2 hidden h-5 w-[3px] -translate-x-1/2 bg-sky-500 xl:block" /><div className="flex justify-between text-[10px] font-bold text-sky-500"><span>Nivel {n.nivel} · {n.multinodo !== false ? "● Crea red" : "● Sin red"}</span><button onClick={()=>setFocusId(n.id)} className="inline-flex items-center gap-2 rounded-xl border-2 border-sky-800 bg-sky-700 px-3 py-2 text-xs font-extrabold text-white shadow-md shadow-sky-900/20 transition hover:scale-[1.03] hover:bg-sky-800 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600">Ver mi red <span aria-hidden="true" className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white text-base font-black text-sky-800 shadow-sm">➜</span></button></div>
<div className="mt-2 flex items-center gap-2 text-left"><div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border-[3px] border-sky-300 bg-sky-50 text-sm font-black text-sky-700">{n.fotoUrl?<img src={n.fotoUrl} alt={fullName(n)} className="h-full w-full object-cover" />:`${(n.nombre?.[0]||"L").toUpperCase()}${(n.apellido?.[0]||"").toUpperCase()}`}</div><div className="min-w-0 flex-1"><button onClick={()=>setFocusId(n.id)} title={fullName(n)} className="block w-full truncate text-left text-xs font-extrabold text-slate-900 hover:text-sky-700">{fullName(n)}</button><p className="truncate text-[9px] text-slate-500" title={n.email}>{tag(n.etiquetaId)?.nombre||"Líder"} · {n.email}</p><button onClick={()=>{setRatingNode(n);setRatingValue(n.puntuacion??5);}} className="mt-1 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{backgroundColor:n.puntuacion==null?"#f1f5f9":`hsl(${Math.round((Math.max(1,Math.min(10,Number(n.puntuacion)))-1)/9*125)} 75% 92%)`,color:n.puntuacion==null?"#64748b":`hsl(${Math.round((Math.max(1,Math.min(10,Number(n.puntuacion)))-1)/9*125)} 75% 30%)`}}>★ {n.puntuacion??"—"}/10 ✎</button></div><div className="shrink-0 space-y-1 text-right"><div className="animate-pulse rounded-lg border border-emerald-300 bg-emerald-100 px-2 py-1 shadow-[0_0_12px_rgba(16,185,129,.20)]"><strong className="block text-lg font-black leading-none text-emerald-800">{statsFor(n).votos.toLocaleString("es-CO")}</strong><span className="text-[9px] text-slate-500">Votos</span></div><div className="rounded-lg border border-violet-300 bg-violet-100 px-2 py-1"><strong className="block text-sm font-black leading-none text-violet-800">{statsFor(n).directos}×{statsFor(n).profundidad}</strong><span className="text-[9px] text-slate-500">Matriz</span></div></div></div>
{(() => {const estimated=Number(n.estimacionVotos||0);const pct=estimated>0?Math.round(statsFor(n).votos/estimated*100):0;return <div className="mt-2"><div className="flex justify-between text-[10px] text-slate-500"><span>Avance</span><strong>{estimated>0?`${pct}%`:"Sin meta"}</strong></div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-sky-400 to-emerald-400" style={{width:`${Math.min(100,Math.max(0,pct))}%`}} /></div></div>})()}
<div className="mt-2 grid grid-cols-3 gap-1 text-left">{[["Estimado",Number(n.estimacionVotos||0)],["Diferencia",estimateGap(n)],["Reuniones",Number(n.votosRealesSubarbol||0)]].map(([label,value])=><div key={String(label)} className={`min-w-0 rounded-lg border p-1.5 ${label === "Estimado" ? "border-amber-200 bg-amber-50 text-amber-900" : label === "Diferencia" ? "border-violet-200 bg-violet-50 text-violet-900" : "border-cyan-200 bg-cyan-50 text-cyan-900"}`}><strong className="block truncate text-xs font-black">{Number(value).toLocaleString("es-CO")}</strong><span className="text-[9px] text-slate-500">{label}</span></div>)}</div>
<details className="mt-2 border-t border-slate-100 pt-2 text-left"><summary className="cursor-pointer rounded-lg bg-sky-50 px-3 py-2 text-center text-xs font-bold text-sky-800">Acciones · Ver más ▾</summary><div className="mt-2 grid grid-cols-2 gap-1.5"><button onClick={()=>openForm("persona",n.id)} className="rounded-lg border p-2 text-[11px]">+ Reuniones</button><button onClick={()=>showPeople(n.id)} className="rounded-lg border p-2 text-[11px]">Ver reuniones</button><button onClick={()=>{setFocusId(n.id);openForm("nodo",n.id);}} disabled={n.multinodo===false||n.nivel>=niveles} className="rounded-lg bg-emerald-600 p-2 text-[11px] font-bold text-white disabled:opacity-40">+ Líder</button><button onClick={()=>openForm("nodo",n.padreId,n)} className="rounded-lg border p-2 text-[11px]">Editar</button><button onClick={()=>void abrirNotas(n)} className="rounded-lg border border-blue-200 bg-blue-50 p-2 text-[11px] font-semibold text-blue-800">Comentarios</button><button onClick={()=>compartirResumen(n)} className="flex items-center justify-center gap-1 rounded-lg border border-green-200 bg-green-50 p-2 text-[11px] font-semibold text-green-800"><span aria-hidden="true">✆</span> WhatsApp</button>{!leaderMode&&<><button onClick={()=>openMove(n)} className="rounded-lg border p-2 text-[11px]">Mover</button><button onClick={()=>void removeNode(n)} className="rounded-lg border border-rose-200 p-2 text-[11px] text-rose-700">Eliminar</button></>}</div></details>
</article>)}</div>}{!childrenLoading && childrenPages > 1 && <div className="mt-5 flex flex-wrap items-center justify-center gap-3"><button type="button" disabled={childrenPage <= 1} onClick={() => setChildrenPage(p => Math.max(1,p-1))} className="rounded-xl border bg-white px-4 py-2 text-xs font-bold disabled:opacity-40">← Anterior</button><span className="text-xs font-semibold text-slate-600">Página {childrenPage} de {childrenPages} · {filteredLeaders.length} líderes</span><button type="button" disabled={childrenPage >= childrenPages} onClick={() => setChildrenPage(p => Math.min(childrenPages,p+1))} className="rounded-xl border bg-white px-4 py-2 text-xs font-bold disabled:opacity-40">Siguiente →</button></div>}
        {!childrenLoading && !filteredLeaders.length && <p className="mt-8 text-center text-sm text-slate-400">Este nodo aún no tiene nodos directos.</p>}{branchError && <p className="mt-3 text-center text-xs text-amber-700">{branchError}</p>}
      </div>
    </div>
    {dragNode && <div className="border-t border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Arrastras a <b>{fullName(dragNode)}</b>. Puedes soltarlo en la raíz o en una tarjeta visible. También puedes usar «⇄ Mover» en la tarjeta.</div>}
  </section>;

  if (loading) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Cargando mi red...</div>;
  return <main className="min-h-screen bg-[#f4f7f8] text-slate-800">{leaderMode && <aside className="fixed inset-y-0 left-0 z-40 hidden w-[280px] flex-col bg-[#082c2b] p-5 text-white lg:flex"><div className="border-b border-white/10 pb-5 text-lg font-bold">Autoridad Política</div><div className="mt-8 rounded-xl bg-white px-4 py-3 text-sm font-bold text-[#082c2b]">Mi red</div><button onClick={() => void signOut(auth).then(()=>router.replace("/login"))} className="mt-auto rounded-xl border border-white/20 p-3 text-left text-sm">Cerrar sesión</button></aside>}<div className={leaderMode ? "lg:pl-[280px]" : ""}><header className="border-b border-emerald-200 bg-emerald-50"><div className="mx-auto flex max-w-none flex-wrap items-center justify-between gap-3 px-5 py-5"><div className="flex items-center gap-3"><button onClick={() => router.push("/dashboard")} className="rounded-xl border px-3 py-2">←</button><div><p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">Organización territorial</p><h1 className="text-2xl font-bold">Mi grupo de trabajo</h1><p className="text-xs text-slate-500">Líderes, estructura y registros de comunidad por campaña.</p></div></div><div className="flex flex-wrap gap-2">{!leaderMode && <button onClick={() => void inviteToCampaign()} disabled={!campanaId} className="rounded-xl border border-emerald-300 bg-white px-4 py-3 text-xs font-bold text-emerald-800 disabled:opacity-50">Invitar a mi grupo de trabajo</button>}{!leaderMode && <button onClick={() => router.push("/configuracion-campana?etiquetas=1")} className="rounded-xl border px-4 py-3 text-xs font-bold">Configurar etiquetas</button>}<button onClick={() => openForm("nodo", leaderMode ? leaderRoot : null)} disabled={!campanaId || niveles < 2 || leaderMode} className="rounded-xl bg-[#073b38] px-4 py-3 text-xs font-bold text-white disabled:opacity-40">+ Crear nodo</button></div></div></header>
  <div className="mx-auto max-w-none space-y-3 px-3 py-3 sm:px-4">
    <section className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm sm:gap-3 sm:p-3">
      <div className="flex min-w-[105px] items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2"><span className="text-xl font-black text-emerald-800">{Number.isFinite(niveles) ? niveles : "∞"}</span><span className="text-[10px] font-semibold leading-tight text-emerald-800">Niveles</span></div>
      <div className="flex min-w-[105px] flex-1 items-center justify-between gap-2 rounded-xl bg-amber-50 px-3 py-2"><span className="text-[11px] font-semibold text-amber-800">Estimado</span><strong className="text-lg font-black tabular-nums text-amber-950">{metricsReady ? totals.estimados.toLocaleString("es-CO") : "—"}</strong></div>
      <div className="flex min-w-[105px] flex-1 items-center justify-between gap-2 rounded-xl bg-cyan-50 px-3 py-2"><span className="text-[11px] font-semibold text-cyan-800">Personas registradas en reuniones</span><strong className="text-lg font-black tabular-nums text-cyan-950">{metricsReady ? totals.registros.toLocaleString("es-CO") : "—"}</strong></div>
      <div className="flex min-w-[135px] flex-[1.3] flex-col justify-center gap-1 px-2"><div className="flex justify-between text-[10px] font-bold text-slate-600"><span>Registros / estimado</span><span>{metricsReady && totals.estimados > 0 ? `${(totals.registros / totals.estimados * 100).toFixed(1)}%` : "—"}</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-500" style={{width:`${metricsReady && totals.estimados > 0 ? Math.min(100, totals.registros / totals.estimados * 100) : 0}%`}} /></div></div>
      <button onClick={() => void reconcileMetrics()} disabled={rebuilding || busy || !campanaId || (leaderMode && !leaderRoot)} className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100 disabled:opacity-40">{rebuilding ? "Recalculando..." : "↻ Recalcular"}</button>
    </section>
    <section className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2"><label className="flex w-full min-w-0 items-center gap-2 text-xs font-bold text-slate-600 sm:w-1/2 sm:max-w-[50%]"><span>Campaña</span><select className="w-full min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-xs font-semibold text-slate-800" value={campanaId} onChange={e => setCampanaId(e.target.value)}><option value="">Selecciona campaña</option>{campanas.map(c => <option key={c.id} value={c.id}>{c.nombreCampana}</option>)}</select></label><div className="flex flex-wrap rounded-lg bg-slate-100 p-1">{([ ["grafica", "◎ Vista gráfica"], ["tabla", "☷ Vista tabla"] ] as const).map(([id, label]) => <button key={id} disabled={leaderMode && id !== "grafica"} onClick={() => { if (id === "comunidad") showPeople(focusId); else { setVista(id); setBuscar(""); setEtiquetaFiltro(""); } }} className={`rounded-md px-3 py-1.5 text-[11px] font-bold disabled:opacity-40 ${vista === id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>{label}</button>)}</div></section>
  {leaderMode && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Vista original de Mi Red limitada a tu nodo. Las operaciones de escritura están pendientes de reglas de seguridad específicas.</p>}
  {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}{ok && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{ok}</p>}
  {!campanaId ? <section className="rounded-3xl bg-white p-12 text-center">Primero crea o selecciona una campaña.</section> : vista === "grafica" ? graph : <section className="overflow-hidden rounded-3xl border bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b p-5"><div>{vista === "comunidad" && <button type="button" onClick={() => { setFocusId(returnFocus); setVista("grafica"); setBuscar(""); setEtiquetaFiltro(""); }} className="mb-3 inline-flex items-center gap-2 rounded-xl bg-[#073b38] px-5 py-3 text-sm font-bold text-white shadow-md hover:bg-emerald-800">← Volver a Mi Red</button>}<h2 className="font-bold">{vista === "tabla" ? "Directorio de nodos" : `Personas registradas · ${ownerName}`}</h2><p className="text-xs text-slate-400">Carga paginada de {PAGE} registros. La búsqueda consulta los registros del nodo seleccionado y admite fragmentos de palabras.</p></div><div className="flex flex-wrap gap-2"><input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar: fusa, municipio, departamento, nombre, documento..." className={`${cls} max-w-xs`} /><select value={etiquetaFiltro} onChange={e => setEtiquetaFiltro(e.target.value)} className={`${cls} max-w-[190px]`}><option value="">Todas las etiquetas</option>{etiquetas.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}</select><button onClick={() => vista === "tabla" ? void loadDirectory() : void loadPeople()} className="rounded-xl border px-3 py-2 text-xs font-bold">Actualizar</button>{vista === "comunidad" && <><button onClick={() => openForm("persona", peopleOwner)} className="rounded-xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white">+ Registrar</button><button onClick={() => void exportPeople()} disabled={exporting} className="rounded-xl border px-3 py-2 text-xs font-bold disabled:opacity-40">{exporting ? "Exportando..." : "Exportar personas"}</button><button onClick={() => void downloadTemplate()} className="rounded-xl border px-3 py-2 text-xs font-bold">Descargar formato</button><label className="cursor-pointer rounded-xl border px-3 py-2 text-xs font-bold">{importing ? "Importando..." : "Importar Excel"}<input type="file" accept=".xlsx" disabled={importing} className="hidden" onChange={e => { void importPeople(e.target.files?.[0]); e.currentTarget.value = ""; }} /></label></>}</div></div>{tableSearching && <p className="px-5 py-2 text-xs font-semibold text-emerald-700">Buscando registros...</p>}{buscar.trim().length >= 2 && !tableSearching && <p className="px-5 py-2 text-xs text-slate-500">{vista === "tabla" ? filteredNodes.length : filteredPeople.length} coincidencias encontradas</p>}<div className="overflow-x-auto"><table className="w-full min-w-[1150px] text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr>{(vista === "tabla" ? ["Persona", "Etiqueta", "Responsable", "Votos", "Estimado", "Matriz", "Diferencia", "Contacto", "Acciones"] : ["Persona", "Etiqueta", "Responsable", "Contacto", "Acciones"]).map(x => <th key={x} className="px-4 py-3">{x}</th>)}</tr></thead><tbody>{vista === "tabla" && !buscar.trim() && !etiquetaFiltro && <tr className="border-t bg-sky-50/70"><td className="px-4 py-3"><button type="button" onClick={() => setTableRootExpanded(v => !v)} className="flex items-center gap-3 text-left font-bold text-sky-900"><span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-sky-700 text-white">{tableRootExpanded ? "−" : "+"}</span><span>{leaderMode ? (focusNode ? fullName(focusNode) : "Mi red") : gerente}<span className="ml-2 text-[10px] font-medium text-sky-600">Raíz · {directory.length} nodos cargados</span></span></button></td><td className="px-4 py-3 text-slate-500">Red principal</td><td className="px-4 py-3">—</td><td className="px-4 py-3"><strong className="rounded-lg bg-emerald-100 px-2 py-1 text-emerald-800">{rootTotals.votos.toLocaleString("es-CO")}</strong></td><td className="px-4 py-3"><strong className="rounded-lg bg-amber-50 px-2 py-1 text-amber-800">{rootTotals.estimados.toLocaleString("es-CO")}</strong></td><td className="px-4 py-3"><strong className="rounded-lg bg-violet-100 px-2 py-1 text-violet-800">{rootTotals.directos}×{rootTotals.profundidad}</strong></td><td className="px-4 py-3"><strong className="rounded-lg bg-sky-50 px-2 py-1 text-sky-800">{(rootTotals.estimados-rootTotals.votos).toLocaleString("es-CO")}</strong></td><td className="px-4 py-3 text-slate-500">{tableRootExpanded ? "Ocultar subniveles" : "Desplegar subniveles"}</td><td className="px-4 py-3"><button type="button" onClick={() => setTableRootExpanded(v => !v)} className="font-bold text-sky-700">{tableRootExpanded ? "Contraer" : "Ver red"} ↓</button></td></tr>}{vista === "tabla" ? tableVisibleNodes.map(n => <tr key={n.id} className="border-t hover:bg-sky-50/60"><td className="px-4 py-3"><div className="flex items-center gap-2" style={{paddingLeft: `${Math.min(Math.max(n.nivel - 2, 0), 8) * 16}px`}}>{(tableChildCounts.get(n.id) ?? 0) > 0 ? <button type="button" aria-label={`${tableExpandedIds.includes(n.id) ? "Contraer" : "Desplegar"} subordinados de ${fullName(n)}`} onClick={() => toggleTableNode(n.id)} className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-sky-200 bg-sky-50 font-black text-sky-800 hover:bg-sky-100">{tableExpandedIds.includes(n.id) ? "−" : "+"}</button> : <span className="inline-flex w-6 shrink-0 justify-center text-sky-400">└</span>}<div><b>{fullName(n)}</b><p className="text-slate-400">Nivel {n.nivel} · {n.identificacion || "Sin documento"}</p></div></div></td><td className="px-4 py-3">{tag(n.etiquetaId)?.nombre || "Sin etiqueta"}</td><td className="px-4 py-3">{parentOfNode(n)}</td><td className="px-4 py-3"><strong className="rounded-lg bg-emerald-100 px-2 py-1 text-emerald-800">{statsFor(n).votos.toLocaleString("es-CO")}</strong></td><td className="px-4 py-3"><strong className="rounded-lg bg-amber-50 px-2 py-1 text-amber-800">{Number(n.estimacionVotos || 0).toLocaleString("es-CO")}</strong></td><td className="px-4 py-3"><strong className="rounded-lg bg-violet-100 px-2 py-1 text-violet-800">{statsFor(n).directos}×{statsFor(n).profundidad}</strong></td><td className="px-4 py-3"><strong className="rounded-lg bg-sky-50 px-2 py-1 text-sky-800">{estimateGap(n).toLocaleString("es-CO")}</strong></td><td className="px-4 py-3">{n.email}<p>{n.telefono}</p></td><td className="space-x-2 px-4 py-3"><button onClick={() => openForm("nodo", n.padreId, n)} className="font-bold text-blue-600">Editar</button><button onClick={() => { setFocusId(n.id); setVista("grafica"); }} className="font-bold text-emerald-700">Ver nodo</button><button onClick={() => void removeNode(n)} className="font-bold text-red-600">Retirar</button><button onClick={() => openForm("persona", n.id)} className="font-bold">+ Registro</button><button onClick={() => showPeople(n.id)} className="font-bold text-blue-700">Ver personas</button><button onClick={() => openMove(n)} className="font-bold text-amber-700">Mover</button></td></tr>) : filteredPeople.map(p => <tr key={p.id} className="border-t"><td className="px-4 py-3"><b>{fullName(p)}</b><p className="text-slate-400">{p.identificacion || "Sin documento"}</p></td><td className="px-4 py-3">{tag(p.etiquetaId)?.nombre || "Sin etiqueta"}</td><td className="px-4 py-3">{p.responsableId ? `Nodo ${p.responsableId.slice(0, 8)}` : gerente}</td><td className="px-4 py-3">{p.email}<p>{p.telefono}</p></td><td className="space-x-2 px-4 py-3"><button onClick={() => openForm("persona", peopleOwner, undefined, p)} className="font-bold text-blue-600">Editar</button><button onClick={() => void removePerson(p)} className="font-bold text-red-600">Eliminar</button></td></tr>)}</tbody></table></div><div className="flex items-center justify-between border-t p-4"><span className="text-xs text-slate-500">{vista === "tabla" ? directory.length : people.length} registros cargados</span><button disabled={vista === "tabla" ? !directoryHasMore || directoryLoading : !peopleHasMore || peopleLoading} onClick={() => vista === "tabla" ? void loadDirectory(true, directoryCursor) : void loadPeople(true, peopleCursor)} className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-40">Cargar 25 más</button></div></section>}
  <p className="text-xs text-slate-500">*«Registros reales» significa personas registradas, no votos emitidos ni confirmados. Usa «Recalcular» para incorporar registros anteriores. En redes de más de 300 nodos se requiere recálculo en servidor. Nivel 1: gerente. Los nodos empiezan en el nivel 2. Registrar personas dentro de cada nodo no consume cupos. Las búsquedas de directorio son filtros locales de páginas cargadas; una búsqueda global por millones de registros requiere índices y consultas específicas.</p></div>
   {movePicker && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/65 p-4"><div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Traslado entre nodos</p><h2 className="mt-1 text-xl font-bold">Mover a {fullName(movePicker)}</h2><p className="mt-1 text-xs text-slate-500">Busca un responsable habilitado para formar su red. Los destinos sin ese permiso aparecerán bloqueados; primero deben habilitarse desde Editar. Se conservarán los registros y descendientes.</p></div><button onClick={() => setMovePicker(null)} aria-label="Cerrar" className="text-xl">×</button></div><button onClick={() => setDestination(null)} className={`mt-5 w-full rounded-xl border p-3 text-left text-sm font-bold ${destination === null ? "border-emerald-500 bg-emerald-50" : "border-slate-200"}`}>⌂ Raíz · {gerente} {destination === null ? "✓" : ""}</button><input value={destinationSearch} onChange={e => setDestinationSearch(e.target.value)} placeholder="Buscar destino por nombre o apellido (mín. 2 letras)" className={`mt-3 ${cls}`} /><div className="mt-2 max-h-64 space-y-1 overflow-y-auto">{destinationResults.filter(n => n.id !== movePicker.id).map(n => <button key={n.id} type="button" disabled={n.multinodo === false} onClick={() => setDestination(n.id)} title={n.multinodo === false ? "No puede recibir personas: habilita su red desde Editar." : "Seleccionar destino"} className={`flex w-full justify-between gap-2 rounded-xl border p-3 text-left text-xs disabled:cursor-not-allowed disabled:bg-amber-50 disabled:text-amber-800 ${destination === n.id ? "border-emerald-500 bg-emerald-50" : "border-slate-100"}`}><span className="font-bold">{fullName(n)} · N{n.nivel}</span><span>{n.multinodo === false ? "No habilitado como líder · Editar primero" : destination === n.id ? "✓ Seleccionado" : "Seleccionar"}</span></button>)}</div><p className="mt-3 text-xs text-slate-500">Destino: {destination === null ? `Raíz · ${gerente}` : destinationResults.find(n => n.id === destination) ? fullName(destinationResults.find(n => n.id === destination)!) : destination === movePicker.padreId ? "Responsable actual" : `Nodo ${destination.slice(0,8)}`}</p><div className="mt-5 flex justify-end gap-2"><button onClick={() => setMovePicker(null)} className="rounded-xl border px-4 py-3 text-xs font-bold">Cancelar</button><button onClick={() => void finishMove()} disabled={busy || destination === movePicker.padreId} className="rounded-xl bg-emerald-700 px-5 py-3 text-xs font-bold text-white disabled:opacity-40">Confirmar traslado</button></div></div></div>}

  {ratingNode && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-4"><div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl"><h3 className="text-lg font-black text-slate-900">Calificar líder</h3><p className="mt-1 text-sm text-slate-500">{fullName(ratingNode)} · Nivel {ratingNode.nivel}</p><p className={`mt-5 text-center text-4xl font-black ${ratingValue >= 8 ? "text-lime-600" : ratingValue >= 5 ? "text-amber-600" : "text-red-600"}`}>★ {ratingValue}/10</p><div className="mt-4 grid grid-cols-5 gap-2">{Array.from({length:10},(_,i)=>i+1).map(v=><button type="button" key={v} onClick={()=>setRatingValue(v)} className={`rounded-lg border p-2 text-sm font-bold ${ratingValue===v?(v>=8?"border-lime-600 bg-lime-500 text-white":v>=5?"border-amber-600 bg-amber-500 text-white":"border-red-600 bg-red-500 text-white"):"bg-white text-slate-700"}`}>{v}</button>)}</div><p className="mt-3 text-xs text-slate-500">La calificación la asigna el responsable superior. No modifica la estimación de votos.</p><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={()=>setRatingNode(null)} disabled={ratingBusy} className="rounded-lg border px-4 py-2 text-sm">Cancelar</button><button type="button" disabled={ratingBusy} onClick={async()=>{if(!clienteId||!campanaId)return;if(leaderMode && (!leaderRoot || ratingNode.padreId !== focusId || ratingNode.id === leaderRoot)) return notify("Solo puedes calificar líderes directos.");setRatingBusy(true);try{await updateDoc(doc(nodesRef(),ratingNode.id),{puntuacion:ratingValue,puntuadoPor:ratingNode.padreId || "gerencia",puntuadoEn:serverTimestamp()});setRatingNode(null);notify("Calificación guardada.",true);}catch(e){notify(e instanceof Error?e.message:"No se pudo calificar.");}finally{setRatingBusy(false);}}} className={`rounded-lg px-4 py-2 text-sm font-bold text-white ${ratingValue>=8?"bg-lime-600":ratingValue>=5?"bg-amber-600":"bg-red-600"}`}>Guardar</button></div></div></div>}
  {labelOpen && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 p-4"><div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"><h3 className="text-lg font-bold text-slate-900">Crear etiqueta sin salir de Mi Red</h3><p className="mt-1 text-xs text-slate-500">Al guardarla, quedará seleccionada en el registro que estás diligenciando.</p><label className="mt-5 block text-xs font-bold text-slate-700">Nombre<input value={labelName} onChange={e => setLabelName(e.target.value)} className={`mt-2 ${cls}`} placeholder="Nombre de la etiqueta" /></label><label className="mt-4 flex items-center gap-3 text-xs font-bold text-slate-700">Color<input type="color" value={labelColor} onChange={e => setLabelColor(e.target.value)} className="h-10 w-14 cursor-pointer" /></label><div className="mt-6 flex justify-end gap-2"><button type="button" disabled={labelBusy} onClick={() => setLabelOpen(false)} className="rounded-xl border px-4 py-2 text-xs font-bold">Cancelar</button><button type="button" disabled={labelBusy || !labelName.trim()} onClick={async () => { if (!clienteId) return; const nombre = labelName.trim(); if (etiquetas.some(t => t.nombre.toLocaleLowerCase("es") === nombre.toLocaleLowerCase("es"))) return notify("Ya existe una etiqueta con ese nombre."); setLabelBusy(true); try { const target = doc(collection(db, "clientes", clienteId, "etiquetasNodo")); await setDoc(target, { nombre, color: labelColor, descripcion: "", creadoEn: serverTimestamp(), actualizadoEn: serverTimestamp() }); setForm(v => ({ ...v, etiquetaId: target.id })); setLabelName(""); setLabelOpen(false); notify("Etiqueta creada y seleccionada.", true); } catch(e) { notify(e instanceof Error ? e.message : "No fue posible crear la etiqueta."); } finally { setLabelBusy(false); } }} className="rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-40">Guardar etiqueta</button></div></div></div>}
  {notaNodo && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4"><div className="flex max-h-[90vh] w-full max-w-xl flex-col rounded-3xl bg-white p-5 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><h3 className="text-lg font-bold text-slate-900">Notas del líder</h3><p className="text-xs text-slate-500">{notaNodo.nombre} {notaNodo.apellido} · Historial con fecha y hora automáticas</p></div><button onClick={()=>setNotaNodo(null)} aria-label="Cerrar notas" className="rounded-lg bg-slate-100 px-3 py-2 text-sm">✕</button></div><textarea value={notaTexto} onChange={e=>setNotaTexto(e.target.value)} rows={4} maxLength={5000} placeholder="Escribe una nota sobre este líder..." className="mt-4 w-full resize-y rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-blue-500"/><div className="mt-2 flex items-center justify-between gap-2"><span className="text-[11px] text-slate-400">La fecha y hora se registran al guardar.</span><button disabled={!notaTexto.trim()||notaGuardando} onClick={()=>void guardarNota()} className="rounded-xl bg-blue-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-40">{notaGuardando?"Guardando...":notaEditandoId?"Guardar cambios":"Guardar nota"}</button></div>{notaEditandoId&&<button type="button" onClick={()=>{setNotaEditandoId(null);setNotaTexto("");}} className="mt-2 text-xs font-semibold text-slate-500 underline">Cancelar edición</button>}<div className="mt-4 min-h-0 overflow-y-auto border-t border-slate-100 pt-3"><p className="mb-2 text-xs font-bold text-slate-700">Historial de notas ({notasNodo.length})</p>{notasCargando?<p className="text-xs text-slate-500">Cargando notas...</p>:notasNodo.length===0?<p className="text-xs text-slate-500">Este líder todavía no tiene notas.</p>:notasNodo.map(n=><div key={n.id} className="mb-2 rounded-xl border border-slate-100 bg-slate-50 p-3"><p className="whitespace-pre-wrap break-words text-sm text-slate-700">{n.texto}</p><div className="mt-2 flex flex-wrap items-center justify-between gap-2"><p className="text-[11px] text-slate-500">{n.fecha?n.fecha.toLocaleString("es-CO",{dateStyle:"medium",timeStyle:"short"}):"Fecha pendiente de sincronización"}</p><div className="flex gap-2"><button disabled={notaGuardando} onClick={()=>{setNotaEditandoId(n.id);setNotaTexto(n.texto);}} className="text-xs font-semibold text-blue-700">Editar</button><button disabled={notaGuardando} onClick={()=>void eliminarNota(n.id)} className="text-xs font-semibold text-rose-600">Eliminar</button></div></div></div>)}</div></div></div>}
{formOpen && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4"><div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-sky-100 bg-white p-5 shadow-2xl sm:p-6"><div className="flex justify-between"><div><p className="text-[10px] font-bold uppercase text-emerald-600">{formType === "nodo" ? "Estructura de líderes" : "Registro de comunidad"}</p><h2 className="mt-1 text-xl font-bold">{editingNode || editingPerson ? "Editar persona" : formType === "nodo" ? "Crear nodo y acceso" : "Registrar persona"}</h2><p className="mt-1 text-xs text-slate-500">{formType === "persona" ? "El registro no crea acceso ni ocupa cupo de liderazgo." : "El nodo tendrá cuenta de acceso y ocupará un cupo."}</p></div><button onClick={() => setFormOpen(false)} disabled={busy} className="text-2xl">×</button></div><div className="mt-5 grid gap-3 sm:grid-cols-2">{formType === "nodo" && <label className="sm:col-span-2 flex items-center gap-3 rounded-xl border border-sky-100 bg-sky-50 p-3 text-xs font-bold text-slate-700"><span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-sky-200 bg-white text-xl">{(leaderPhotoPreview || editingNode?.fotoUrl) ? <img src={leaderPhotoPreview || editingNode?.fotoUrl} alt="Vista previa de foto" className="h-full w-full object-cover" /> : "👤"}</span><span className="flex-1">Foto del líder (opcional, JPG/PNG/WebP, máximo 2 MB)<input type="file" accept="image/jpeg,image/png,image/webp" className="mt-2 block w-full text-xs" onChange={e=>{const file=e.target.files?.[0]||null;if(file && (file.size>2*1024*1024 || !["image/jpeg","image/png","image/webp"].includes(file.type))){notify("Selecciona JPG, PNG o WebP de máximo 2 MB.");e.target.value="";return;}setLeaderPhoto(file);setLeaderPhotoPreview(file?URL.createObjectURL(file):null);}} /></span></label>}{([ ["Nombre *", "nombre"], ["Apellido *", "apellido"], [formType === "nodo" ? "Correo de acceso *" : "Correo opcional", "email"], ["Teléfono", "telefono"], ["Documento", "identificacion"] ] as [string, keyof Form][]).map(([label, key]) => <label key={key} className="text-xs font-bold text-slate-600">{label}<input type={key === "email" ? "email" : "text"} value={form[key]} disabled={!!editingNode && key === "email"} onChange={e => setForm(v => ({ ...v, [key]: e.target.value }))} className={`mt-1 ${cls} disabled:bg-slate-100`} /></label>)}<label className="text-xs font-bold text-slate-600">Departamento<select value={form.departamento} onChange={e => setForm(v => ({...v, departamento:e.target.value, ciudad:""}))} className={`mt-1 ${cls}`}><option value="">Selecciona departamento</option>{departamentos.map(d=><option key={d} value={d}>{d}</option>)}</select></label><label className="text-xs font-bold text-slate-600">Municipio<select value={form.ciudad} disabled={!form.departamento} onChange={e => setForm(v => ({...v, ciudad:e.target.value}))} className={`mt-1 ${cls}`}><option value="">Selecciona municipio</option>{form.ciudad && !municipios.includes(form.ciudad) && <option value={form.ciudad}>{form.ciudad}</option>}{municipios.map(m=><option key={m} value={m}>{m}</option>)}</select></label>{formType === "nodo" && <label className="text-xs font-bold text-slate-600">Edad<input type="number" min="18" max="120" value={form.edad} onChange={e => setForm(v => ({...v, edad:e.target.value}))} className={`mt-1 ${cls}`} placeholder="Edad" /></label>}{catalogoError && <p className="sm:col-span-2 text-xs text-red-600">{catalogoError}</p>}<div className="sm:col-span-2">{formType === "nodo" && <label className="mb-3 flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-xs font-semibold text-emerald-950"><input type="checkbox" checked={multinodo} onChange={e => setMultinodo(e.target.checked)} />Habilitar multinodo (permite a este líder registrar otros líderes, si dispone de niveles). Desactivado: puede registrar personas, pero no líderes.</label>}<div className="flex items-center justify-between"><label className="text-xs font-bold text-slate-600">Etiqueta *</label><button type="button" onClick={() => setLabelOpen(true)} className="text-xs font-bold text-emerald-700">+ Crear etiqueta aquí</button></div><select value={form.etiquetaId} onChange={e=>setForm(v=>({...v,etiquetaId:e.target.value}))} className={`mt-2 ${cls}`}><option value="">Seleccionar etiqueta...</option>{etiquetas.map(t=><option key={t.id} value={t.id}>{t.nombre}</option>)}</select></div>{formType === "nodo" && <label className="text-xs font-bold text-slate-600 sm:col-span-2">Estimación de votos del líder (sin sumar descendientes)<input type="number" min="0" step="1" value={form.estimacionVotos} onChange={e => setForm(v => ({ ...v, estimacionVotos: e.target.value }))} className={`mt-1 ${cls}`} /><span className="mt-1 block font-normal text-slate-400">La tarjeta mostrará también la suma de las estimaciones de sus nodos descendientes.</span></label>}{formType === "persona" && <label className="sm:col-span-2 text-xs font-bold text-slate-600">Observaciones<textarea value={form.observaciones} onChange={e => setForm(v => ({ ...v, observaciones: e.target.value }))} rows={3} className="mt-1 w-full rounded-xl border p-3 text-sm" /></label>}{formType === "nodo" && !editingNode && <label className="sm:col-span-2 text-xs font-bold text-slate-600">Contraseña inicial *<input type="password" autoComplete="new-password" value={form.password} onChange={e => setForm(v => ({ ...v, password: e.target.value }))} className={`mt-1 ${cls}`} /><span className="font-normal text-slate-400">No se guarda en Firestore. Entrega las credenciales por un canal seguro.</span></label>}</div>{error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-xs text-red-700">{error}</p>}<div className="mt-5 flex justify-end gap-2"><button onClick={() => setFormOpen(false)} disabled={busy} className="rounded-xl border px-4 py-3 text-xs font-bold">Cancelar</button><button onClick={() => void save()} disabled={busy || !etiquetas.length} className="rounded-xl bg-emerald-700 px-5 py-3 text-xs font-bold text-white disabled:opacity-40">{busy ? "Guardando..." : "Guardar"}</button></div></div></div>}
  </div></main>;
}

function Stat({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border bg-white p-5 shadow-sm"><p className="text-xs text-slate-400">{label}</p><p className="mt-2 text-xl font-bold">{value}</p></div>; }
