"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, createUserWithEmailAndPassword, getAuth, signOut } from "firebase/auth";
import { deleteApp, getApp, initializeApp } from "firebase/app";
import { collection, deleteDoc, doc, getDoc, getDocs, getCountFromServer, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, startAfter, updateDoc, where, writeBatch, increment, type DocumentSnapshot, type QuerySnapshot, type Query, type DocumentData } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

type Etiqueta = { id: string; nombre: string; color: string; descripcion?: string; eliminada?: boolean };
const ETIQUETAS_PREDETERMINADAS: Etiqueta[] = [{"id":"predeterminada-0","nombre":"empresa","color":"#2563eb"},{"id":"predeterminada-1","nombre":"comerciante","color":"#d97706"},{"id":"predeterminada-2","nombre":"madre comunitaria","color":"#db2777"},{"id":"predeterminada-3","nombre":"comunal","color":"#059669"},{"id":"predeterminada-4","nombre":"transportador","color":"#0891b2"},{"id":"predeterminada-5","nombre":"constructor","color":"#78716c"},{"id":"predeterminada-6","nombre":"pensionado","color":"#7c3aed"},{"id":"predeterminada-7","nombre":"reservista","color":"#475569"},{"id":"predeterminada-8","nombre":"deportista","color":"#16a34a"},{"id":"predeterminada-9","nombre":"cultural","color":"#e11d48"},{"id":"predeterminada-10","nombre":"concejal","color":"#4f46e5"},{"id":"predeterminada-11","nombre":"alcalde","color":"#dc2626"},{"id":"predeterminada-12","nombre":"junta acción comunal","color":"#0d9488"},{"id":"predeterminada-13","nombre":"gobernador","color":"#9333ea"},{"id":"predeterminada-14","nombre":"diputado","color":"#ea580c"},{"id":"predeterminada-15","nombre":"presidente","color":"#1d4ed8"}];
type Campana = { id: string; nombreCampana: string; estado?: string };
type Nodo = { puntuacion?: number; puntuadoPor?: string; puntuadoEn?: unknown; departamento?: string; ciudad?: string; edad?: number; multinodo?: boolean; estimacionVotos?: number; votosRealesSubarbol?: number; votosEstimadosSubarbol?: number; id: string; nombre: string; apellido: string; email: string; telefono: string; identificacion: string; etiquetaId: string; campanaId: string; padreId: string | null; nivel: number; estado: "activo" | "inactivo"; uid: string; creadoEn?: unknown };
type Persona = { multinodo?: boolean; id: string; nombre: string; apellido: string; telefono: string; identificacion: string; email: string; etiquetaId: string; responsableId: string | null; observaciones: string; creadoEn?: unknown };
type Form = { departamento: string; ciudad: string; edad: string; estimacionVotos: string; nombre: string; apellido: string; email: string; telefono: string; identificacion: string; etiquetaId: string; password: string; observaciones: string };
const EMPTY: Form = { departamento: "", ciudad: "", edad: "", estimacionVotos: "0", nombre: "", apellido: "", email: "", telefono: "", identificacion: "", etiquetaId: "", password: "", observaciones: "" };
const PAGE = 25;
const cls = "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-emerald-500";
const fullName = (n: { nombre: string; apellido: string }) => `${n.nombre} ${n.apellido}`.trim();

export default function MiRedPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
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
  const [etiquetaFiltro, setEtiquetaFiltro] = useState("");
  const [formOpen, setFormOpen] = useState(false);
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

  const nodesRef = useCallback(() => collection(db, "clientes", clienteId, "campanas", campanaId, "nodos"), [clienteId, campanaId]);
  const peopleRef = useCallback((owner: string | null) => owner ? collection(db, "clientes", clienteId, "campanas", campanaId, "nodos", owner, "personas") : collection(db, "clientes", clienteId, "campanas", campanaId, "personasRaiz"), [clienteId, campanaId]);
  const ownerName = peopleOwner ? (focusNode?.id === peopleOwner ? fullName(focusNode) : directory.find(n => n.id === peopleOwner) ? fullName(directory.find(n => n.id === peopleOwner)!) : `Nodo ${peopleOwner.slice(0, 8)}`) : gerente;
  const showPeople = (owner: string | null) => { setReturnFocus(focusId); setPeopleOwner(owner); setPeople([]); setPeopleCursor(null); setBuscar(""); setEtiquetaFiltro(""); setVista("comunidad"); };
  const metricsRef = useCallback(() => doc(db, "clientes", clienteId, "campanas", campanaId, "metricas", "red"), [clienteId, campanaId]);
  useEffect(() => {
    if (!clienteId || !campanaId) { setTotals({ estimados: 0, registros: 0 }); setMetricsReady(false); return; }
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
  const reconcileMetrics = async () => {
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
  const notify = (text: string, success = false) => { setError(success ? "" : text); setOk(success ? text : ""); };

  useEffect(() => {
    let live = true;
    const unsub = onAuthStateChanged(auth, async user => {
      if (!user) { router.replace("/login"); return; }
      try {
        const us = await getDoc(doc(db, "usuarios", user.uid));
        if (!us.exists()) throw new Error("No existe tu usuario.");
        const u = us.data();
        if (u.rol !== "cliente_admin" || u.estado === "inactivo" || !u.clienteId) throw new Error("Acceso no autorizado.");
        const cs = await getDoc(doc(db, "clientes", u.clienteId));
        if (!cs.exists() || cs.data().estado === "inactivo" || cs.data().planActivo === false) throw new Error("Cliente o plan inactivo.");
        const c = cs.data();
        const campaigns = await getDocs(collection(db, "clientes", u.clienteId, "campanas"));
        if (!live) return;
        setClienteId(u.clienteId);
        setGerente(String(c.responsable || c.nombreCliente || user.email || "Gerente"));
        setNiveles(Math.max(1, Number(c.nivelesRed || (String(c.plan?.id || "").toLowerCase() === "free" ? 3 : 1))));
        const rows = campaigns.docs.map(d => ({ id: d.id, ...d.data() } as Campana));
        setCampanas(rows);
        setCampanaId(rows.find(x => x.estado === "activa")?.id || rows[0]?.id || "");
      } catch (e) { if (live) notify(e instanceof Error ? e.message : "No fue posible validar tu cuenta."); }
      finally { if (live) setLoading(false); }
    });
    return () => { live = false; unsub(); };
  }, [router]);

  useEffect(() => {
    if (!clienteId) return;
    return onSnapshot(collection(db, "clientes", clienteId, "etiquetasNodo"), snap => { const guardadas = snap.docs.map(d => ({ id: d.id, ...d.data() } as Etiqueta)); const ids = new Set(guardadas.map(t => t.id)); setEtiquetas([...ETIQUETAS_PREDETERMINADAS.filter(t => !ids.has(t.id)), ...guardadas].filter(t => !t.eliminada).sort((a,b) => a.nombre.localeCompare(b.nombre, "es"))); }, e => notify(`No se pudieron cargar etiquetas: ${e.message}`));
  }, [clienteId]);

  useEffect(() => {
    setFocusId(null); setChildrenPage(1); setFocusNode(null); setChildren([]); setDirectory([]); setPeople([]);
    setDirectoryCursor(null); setPeopleCursor(null); setPeopleOwner(null); setBuscar(""); setEtiquetaFiltro(""); setGlobalSearch(""); setGlobalResults([]);
  }, [campanaId]);

  useEffect(() => {
    if (!clienteId || !campanaId) return;
    let live = true;
    let unsubFocus = () => {};
    if (focusId) {
      unsubFocus = onSnapshot(doc(nodesRef(), focusId), s => { if (live) { if (!s.exists() || s.data().estado === "inactivo") { setFocusId(null); setFocusNode(null); } else setFocusNode({ id: s.id, ...s.data() } as Nodo); } }, e => notify(e.message));
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
    if (!clienteId || !campanaId) return;
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
    if (!clienteId || !campanaId) return;
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

  const filteredNodes = useMemo(() => directory.filter(n => `${fullName(n)} ${n.email} ${n.identificacion} ${n.telefono} ${tag(n.etiquetaId)?.nombre || ""}`.toLocaleLowerCase().includes(buscar.toLocaleLowerCase()) && (!etiquetaFiltro || n.etiquetaId === etiquetaFiltro)), [directory, buscar, etiquetaFiltro, etiquetas]);
  const filteredPeople = useMemo(() => people.filter(n => `${fullName(n)} ${n.email} ${n.identificacion} ${n.telefono} ${tag(n.etiquetaId)?.nombre || ""}`.toLocaleLowerCase().includes(buscar.toLocaleLowerCase()) && (!etiquetaFiltro || n.etiquetaId === etiquetaFiltro)), [people, buscar, etiquetaFiltro, etiquetas]);
  const childrenPages = Math.max(1, Math.ceil(children.length / 10));
  const visibleChildren = children.slice((childrenPage - 1) * 10, childrenPage * 10);
  const tagsFiltered = etiquetas.filter(t => `${t.nombre} ${t.descripcion || ""}`.toLowerCase().includes(tagSearch.toLowerCase()));

  const openForm = (type: "nodo" | "persona", parent: string | null = focusId, node?: Nodo, person?: Persona) => {
    notify("", true); setFormType(type); setEditingNode(node || null); setEditingPerson(person || null);
    setParentId(node ? node.padreId : person ? peopleOwner : parent);
    setForm(node ? { ...EMPTY, nombre: node.nombre, apellido: node.apellido, email: node.email, telefono: node.telefono, identificacion: node.identificacion, etiquetaId: node.etiquetaId, estimacionVotos: String(node.estimacionVotos || 0), departamento: node.departamento || "", ciudad: node.ciudad || "", edad: node.edad ? String(node.edad) : "" } : person ? { ...EMPTY, nombre: person.nombre, apellido: person.apellido, email: person.email || "", telefono: person.telefono, identificacion: person.identificacion, etiquetaId: person.etiquetaId, observaciones: person.observaciones || "" } : { ...EMPTY, etiquetaId: etiquetas[0]?.id || "" });
    setMultinodo(type === "nodo" ? (node?.multinodo ?? true) : (person?.multinodo ?? false)); setTagSearch(""); setFormOpen(true);
  };

  const requestMoreLevels = async () => {
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
    if (!clienteId || !campanaId) return;
    if (!form.nombre.trim() || !form.apellido.trim() || !form.etiquetaId) return notify("Nombre, apellido y etiqueta son obligatorios.");
    if (!etiquetas.some(t => t.id === form.etiquetaId)) return notify("Selecciona una etiqueta válida.");
    if (formType === "nodo" && !editingNode && (!form.email.trim() || form.password.length < 6)) return notify("Para crear un nodo se requiere correo y contraseña de al menos 6 caracteres.");
    if (formType === "nodo" && form.edad && (!Number.isInteger(Number(form.edad)) || Number(form.edad) < 18 || Number(form.edad) > 120)) return notify("Ingresa una edad válida entre 18 y 120 años.");
    if (formType === "nodo" && (!/^\d+$/.test(form.estimacionVotos) || !Number.isSafeInteger(Number(form.estimacionVotos)))) return notify("La estimación debe ser un entero no negativo.");
    setBusy(true);
    try {
      const payload = { ...(formType === "nodo" ? { departamento: form.departamento.trim(), ciudad: form.ciudad.trim(), edad: form.edad ? Number(form.edad) : null } : {}), nombre: form.nombre.trim(), apellido: form.apellido.trim(), telefono: form.telefono.trim(), identificacion: form.identificacion.trim(), etiquetaId: form.etiquetaId };
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
        batch.update(doc(nodesRef(), editingNode.id), { ...payload, multinodo, estimacionVotos: Number(form.estimacionVotos), votosEstimadosSubarbol: increment(difference), actualizadoEn: serverTimestamp() });
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
          batch.set(nodeRef, { ...payload, estimacionVotos: Number(form.estimacionVotos), votosEstimadosSubarbol: Number(form.estimacionVotos), votosRealesSubarbol: 0, email: form.email.trim().toLowerCase(), campanaId, padreId: parentId, nivel: level, uid, estado: "activo", creadoEn: serverTimestamp(), actualizadoEn: serverTimestamp() });
          batch.set(doc(db, "usuarios", uid), { uid, email: form.email.trim().toLowerCase(), nombre: payload.nombre, apellido: payload.apellido, rol: "red_usuario", estado: "activo", clienteId, campanaId, nodoId: nodeRef.id, creadoEn: serverTimestamp() });
          const parentAncestors = await ancestors(parentId);
          parentAncestors.forEach(id => batch.update(doc(nodesRef(), id), { votosEstimadosSubarbol: increment(Number(form.estimacionVotos)) }));
          batch.set(metricsRef(), { votosEstimados: increment(Number(form.estimacionVotos)) }, { merge: true });
          await batch.commit(); notify("Nodo y cuenta de acceso creados. Entrega las credenciales por un canal seguro.", true);
        } catch (e) { if (uid) notify("Authentication pudo crear la cuenta sin completar Firestore. Verifica antes de reintentar."); throw e; }
        finally { await signOut(secondaryAuth).catch(() => undefined); await deleteApp(secondary).catch(() => undefined); }
      }
      setFormOpen(false); setEditingNode(null); setEditingPerson(null); setForm(EMPTY);
    } catch (e) { notify(e instanceof Error ? e.message : "No fue posible guardar."); }
    finally { setBusy(false); }
  };

  const removePerson = async (p: Persona) => {
    if (!window.confirm(`¿Eliminar el registro comunitario de ${fullName(p)}?`)) return;
    setBusy(true);
    try { const batch = writeBatch(db); batch.delete(doc(peopleRef(peopleOwner), p.id)); addCounter(batch, await ancestors(peopleOwner), "votosRealesSubarbol", -1); await batch.commit(); await loadPeople(); notify("Registro comunitario eliminado.", true); }
    catch (e) { notify(e instanceof Error ? e.message : "No fue posible eliminar."); }
    finally { setBusy(false); }
  };

  const removeNode = async (n: Nodo) => {
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
    setDragId(null); setDragNode(null);
    if (node.id === targetId || node.padreId === targetId) return;
    setBusy(true);
    try {
      const target = targetId ? await getDoc(doc(nodesRef(), targetId)) : null;
      if (targetId && (!target?.exists() || target.data().estado === "inactivo")) throw new Error("El responsable de destino no está disponible.");
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
    const term = value.trim();
    if (!term || !clienteId || !campanaId) return [];
    const variants = [...new Set([term, term.toLowerCase(), term.charAt(0).toUpperCase() + term.slice(1).toLowerCase()])];
    const fields = ["nombre", "apellido", "departamento", "ciudad", "identificacion", "telefono", "email"];
    const requests = variants.flatMap(prefix => fields.map(field =>
      getDocs(query(nodesRef(), orderBy(field), where(field, ">=", prefix), where(field, "<=", prefix + "\uf8ff"), limit(20)))));
    if (/^\d{1,3}$/.test(term)) requests.push(getDocs(query(nodesRef(), where("edad", "==", Number(term)), limit(30))));
    const matchingTags = etiquetas.filter(t => t.nombre.toLocaleLowerCase("es").includes(term.toLocaleLowerCase("es")));
    matchingTags.forEach(t => requests.push(getDocs(query(nodesRef(), where("etiquetaId", "==", t.id), limit(30)))));
    const results = await Promise.allSettled(requests);
    const unique = new Map<string, Nodo>();
    results.forEach(result => {
      if (result.status !== "fulfilled") return;
      result.value.docs.forEach(d => {
        const n = { id: d.id, ...d.data() } as Nodo;
        if (n.estado !== "inactivo") unique.set(n.id, n);
      });
    });
    const needle = term.toLocaleLowerCase("es");
    return [...unique.values()].filter(n =>
      [fullName(n), n.email, n.identificacion, n.telefono, n.departamento, n.ciudad, String(n.edad || ""), tag(n.etiquetaId)?.nombre]
        .some(v => String(v || "").toLocaleLowerCase("es").includes(needle)))
      .sort((x,y) => fullName(x).localeCompare(fullName(y))).slice(0, 50);
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

  const graph = <section className={`flex flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm ${fullscreen ? "fixed inset-0 z-40 rounded-none" : ""}`}>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
      <div><h2 className="font-bold">Explorador de nodos · {campanas.find(c => c.id === campanaId)?.nombreCampana}</h2><p className="text-xs text-slate-500">Explora un nodo a la vez. Usa el buscador para localizar líderes de otros niveles.</p></div>
      <div className="flex flex-wrap gap-2"><button onClick={() => setFocusId(null)} title="Ir a la raíz" className="rounded-xl border px-3 py-2 text-xs font-bold">⌂ Raíz</button><button onClick={() => void exportNodes()} disabled={exporting} className="rounded-xl border px-3 py-2 text-xs font-bold disabled:opacity-40">{exporting ? "Exportando..." : "Exportar niveles Excel"}</button><button onClick={() => setFocusId(focusNode?.padreId || null)} disabled={!focusNode} title="Subir un nivel" className="rounded-xl border px-3 py-2 text-xs font-bold disabled:opacity-40">↑ Subir</button><button onClick={() => setFullscreen(v => !v)} className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white">{fullscreen ? "Salir de pantalla completa" : "⛶ Pantalla completa"}</button></div>
    </div>
    <div className="relative border-b border-slate-100 bg-white px-4 py-3">
      <input value={globalSearch} onChange={e => setGlobalSearch(e.target.value)} placeholder="⌕ Nombre, etiqueta, ciudad, departamento, edad, documento, teléfono o correo..." aria-label="Buscar líderes de toda la campaña" className={`${cls} max-w-2xl`} />
      {globalSearch.trim().length >= 2 && <div className="absolute left-4 right-4 top-full z-30 max-h-72 max-w-2xl overflow-auto rounded-xl border bg-white p-2 shadow-xl">
        {globalSearching && <p className="p-3 text-xs text-slate-500">Buscando...</p>}
        {!globalSearching && !globalResults.length && <p className="p-3 text-xs text-slate-500">No se encontraron líderes con esos datos.</p>}
        {globalResults.map(n => <button key={n.id} type="button" onClick={() => { setFocusId(n.id); setGlobalSearch(""); setGlobalResults([]); }} className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-xs hover:bg-emerald-50"><span className="font-bold">{fullName(n)} <span className="font-normal text-slate-400">· {tag(n.etiquetaId)?.nombre || "Sin etiqueta"}</span></span><span className="shrink-0 text-emerald-700">Nivel {n.nivel} →</span></button>)}
      </div>}
      <p className="mt-1 text-[10px] text-slate-400">Busca líderes de cualquier nivel por nombre, etiqueta, ubicación, edad, documento, teléfono o correo. La edad se busca como número exacto.</p>
    </div>
    <div className="flex-1 overflow-auto bg-slate-50/60 p-4" style={{ minHeight: fullscreen ? 0 : 420 }}>
      <div className="mx-auto max-w-6xl">
        <div onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect="move"; }} onDrop={e => { e.preventDefault(); e.stopPropagation(); if (dragNode) void move(dragNode, focusId); }} className={`mx-auto max-w-md rounded-2xl border-2 bg-gradient-to-br from-[#073b38] to-[#0a8377] p-4 text-center text-white ${dragId ? "border-dashed border-amber-300" : "border-transparent"}`}>
          <div className="flex items-center justify-between gap-2"><span className="text-[10px] uppercase tracking-widest text-emerald-200">{focusNode ? `Nivel ${focusNode.nivel}` : "Gerencia · Nivel 1"}</span><div className="flex gap-1"><button type="button" onClick={() => setFocusId(focusNode?.padreId || null)} disabled={!focusNode} title="Volver al nivel superior" aria-label="Volver al nivel superior" className="rounded-md border border-white bg-white px-2 py-1 text-sm font-black text-emerald-950 shadow disabled:opacity-30">↑ Subir</button><button type="button" onClick={() => setFocusId(null)} title="Ir a Gerencia, nivel 1" aria-label="Ir a Gerencia, nivel 1" className="rounded-md border border-violet-300 bg-violet-600 px-2 py-1 text-sm font-black text-white shadow">⌂ Inicio</button></div></div>
          <h3 className="mt-1 truncate text-base font-bold">{focusNode ? fullName(focusNode) : gerente}</h3><p className="mt-1 truncate text-xs">{focusNode ? <span className="inline-block rounded-md border px-2 py-1 font-bold" style={{ color: tag(focusNode.etiquetaId)?.color || "#FFFFFF", backgroundColor: tag(focusNode.etiquetaId)?.color ? `${tag(focusNode.etiquetaId)?.color}35` : "#FFFFFF22", borderColor: tag(focusNode.etiquetaId)?.color || "#FFFFFF55" }}>{tag(focusNode.etiquetaId)?.nombre || "Sin etiqueta"}</span> : "Candidato / gerente"}</p>
          {focusNode && <div className={`mt-3 rounded-xl border px-3 py-2 text-center ${focusNode.puntuacion == null ? "border-white/20 bg-white/10" : focusNode.puntuacion >= 8 ? "border-lime-300 bg-lime-500/20" : focusNode.puntuacion >= 5 ? "border-amber-300 bg-amber-500/20" : "border-red-300 bg-red-500/20"}`}><div className="flex items-center justify-center gap-3"><span className="text-xs font-semibold">★ Calificación del líder: <strong className="text-lg">{focusNode.puntuacion ?? "—"}/10</strong></span><button type="button" onClick={() => { setRatingNode(focusNode); setRatingValue(focusNode.puntuacion ?? 5); }} className="rounded-lg border border-white/30 bg-white/20 px-2 py-1 text-sm" title="Editar calificación" aria-label="Editar calificación del líder">✎</button></div><div className="mx-auto mt-1 h-1.5 max-w-xs overflow-hidden rounded-full bg-white/20"><div className={`h-full rounded-full ${(focusNode.puntuacion ?? 0) >= 8 ? "bg-lime-400" : (focusNode.puntuacion ?? 0) >= 5 ? "bg-amber-400" : "bg-red-400"}`} style={{width:`${(focusNode.puntuacion ?? 0)*10}%`}} /></div></div>}
          <div className="mt-3 flex flex-wrap justify-center gap-2"><button onClick={() => openForm("persona", focusId)} className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-emerald-900">+ Registrar persona</button><button onClick={() => showPeople(focusId)} className="rounded-lg bg-white/20 px-3 py-2 text-xs font-bold">Ver personas</button>{!focusId && <button onClick={() => void exportNodes()} disabled={exporting} className="rounded-lg bg-white/20 px-3 py-2 text-xs font-bold">Excel niveles</button>}<button onClick={() => openForm("nodo", focusId)} disabled={(focusNode?.nivel || 1) >= niveles || focusNode?.multinodo === false} className="rounded-lg bg-white/20 px-3 py-2 text-xs font-bold disabled:opacity-30">+ Registrar como líder</button></div>{(focusNode?.nivel || 1) >= niveles && <button type="button" onClick={() => void requestMoreLevels()} disabled={upgradeBusy} className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-950 disabled:opacity-40">Límite de {niveles} niveles alcanzado · Solicitar ampliación ↗</button>}
          <div className="mt-3 grid grid-cols-2 gap-2 text-left"><div className="rounded-lg bg-white/15 p-2"><p className="text-[10px] text-white/80">Estimación</p><p className="text-xl font-black">{(metricsReady ? Number(focusNode ? focusNode.votosEstimadosSubarbol ?? 0 : totals.estimados).toLocaleString("es-CO") : "Por recalcular")}</p></div><div className="rounded-lg bg-white/15 p-2"><p className="text-[10px] text-white/80">Registros reales*</p><p className="text-xl font-black">{(metricsReady ? Number(focusNode ? focusNode.votosRealesSubarbol ?? 0 : totals.registros).toLocaleString("es-CO") : "Por recalcular")}</p></div></div>
          {focusNode && <div className="mt-3 rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-xs text-white"><div className="flex items-center justify-between gap-2"><span>Permiso multinodo: <strong>{focusNode.multinodo === false ? "Deshabilitado" : "Habilitado"}</strong></span><button type="button" onClick={() => openForm("nodo", focusNode.padreId, focusNode)} className="rounded-lg bg-white px-3 py-1.5 font-bold text-emerald-900">✎ Editar líder</button></div></div>}
          <p className="mt-2 text-[10px] text-white/70">{children.length} líderes directos · Sin límite horizontal · Suelta aquí para reasignar</p>
        </div>
        {childrenLoading ? <p className="p-10 text-center text-sm">Cargando nodos...</p> : <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{visibleChildren.map(n => <div key={n.id} draggable={!busy} onDragStart={e => { setDragId(n.id); setDragNode(n); e.dataTransfer.setData("text/plain", n.id); e.dataTransfer.effectAllowed="move"; }} onDragEnd={() => { setDragId(null); setDragNode(null); }} onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect="move"; }} onDrop={e => { e.preventDefault(); e.stopPropagation(); if (dragNode) void move(dragNode, n.id); }} className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm hover:border-emerald-400">
          <div className="flex items-center justify-between gap-1"><span className="text-[10px] font-bold text-slate-400">N{n.nivel}</span><div className="flex items-center gap-1"><button type="button" title="Abrir nodo" aria-label={`Abrir ${fullName(n)}`} onClick={() => setFocusId(n.id)} className="rounded-md border border-emerald-700 bg-emerald-700 px-2 py-1 text-sm font-black text-white shadow">↓</button><button type="button" title="Subir al nodo superior" aria-label="Subir" onClick={() => setFocusId(n.padreId)} className="rounded-md border border-slate-400 bg-slate-800 px-2 py-1 text-sm font-black text-white shadow">↑</button><button type="button" title="Ir a raíz" aria-label="Raíz" onClick={() => setFocusId(null)} className="rounded-md border border-violet-700 bg-violet-700 px-2 py-1 text-sm font-black text-white shadow">⌂</button><span title="Arrastrar nodo" className="cursor-grab px-1 text-slate-400">⠿</span></div></div>
          <button type="button" onClick={() => setFocusId(n.id)} className="mt-1 block w-full truncate text-left text-sm font-bold hover:text-emerald-700" title={fullName(n)}>{fullName(n)}</button><div className="mt-1 flex min-w-0 items-center gap-1"><span className="max-w-[48%] shrink-0 truncate rounded-md border px-2 py-0.5 text-[10px] font-extrabold" style={{ color: tag(n.etiquetaId)?.color || "#475569", backgroundColor: tag(n.etiquetaId)?.color ? `${tag(n.etiquetaId)?.color}22` : "#F1F5F9", borderColor: tag(n.etiquetaId)?.color || "#CBD5E1" }}>{tag(n.etiquetaId)?.nombre || "Sin etiqueta"}</span><span className="min-w-0 truncate text-[10px] text-slate-500" title={n.email}>{n.email}</span></div>
          <div className={`mt-3 rounded-xl border px-3 py-3 ${n.puntuacion == null ? "border-slate-200 bg-slate-50" : n.puntuacion >= 8 ? "border-lime-300 bg-lime-50" : n.puntuacion >= 5 ? "border-amber-200 bg-amber-50" : "border-red-200 bg-red-50"}`}>
            <div className="flex items-center justify-between gap-2">
              <div><p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-600">Valoración del líder</p><p className={`mt-1 text-xl font-black ${n.puntuacion == null ? "text-slate-500" : n.puntuacion >= 8 ? "text-lime-700" : n.puntuacion >= 5 ? "text-amber-700" : "text-red-700"}`}>★ {n.puntuacion ?? "—"} <span className="text-xs font-medium">/ 10</span></p></div>
              <button type="button" title={n.puntuacion ? "Editar calificación" : "Calificar líder"} aria-label={`Calificar a ${fullName(n)}`} onClick={() => { setRatingNode(n); setRatingValue(n.puntuacion ?? 5); }} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-base text-slate-700 shadow-sm hover:border-lime-500 hover:text-lime-700">✎</button>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/80"><div className={`h-full rounded-full transition-all ${(n.puntuacion ?? 0) >= 8 ? "bg-lime-500" : (n.puntuacion ?? 0) >= 5 ? "bg-amber-400" : "bg-red-500"}`} style={{width:`${(n.puntuacion ?? 0)*10}%`}} /></div>
          </div>
          {n.nivel >= niveles && <button type="button" onClick={() => void requestMoreLevels()} className="mt-2 w-full rounded-lg border border-amber-200 bg-amber-50 px-2 py-2 text-left text-[10px] font-bold text-amber-900">Nivel {n.nivel}: límite del plan ({niveles} niveles). Solicitar ampliación ↗</button>}
          {n.nivel < niveles && n.multinodo === false && <button type="button" onClick={() => openForm("nodo", n.padreId, n)} className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-left text-[10px] font-bold text-slate-700">Multinodo deshabilitado · Editar líder para activarlo ✎</button>}
          <p className="mt-1 truncate text-[10px] text-slate-500">{[n.ciudad, n.departamento, n.edad ? `${n.edad} años` : ""].filter(Boolean).join(" · ")}</p>
          <div className="mt-2 grid grid-cols-2 gap-1 text-[10px]"><div className="rounded-md bg-amber-50 p-2 text-amber-900"><span className="block">Estimación acumulada</span><strong className="text-sm">{metricsReady ? Number(n.votosEstimadosSubarbol ?? 0).toLocaleString("es-CO") : "—"}</strong></div><div className="rounded-md bg-blue-50 p-2 text-blue-900"><span className="block">Registros acumulados</span><strong className="text-sm">{metricsReady ? Number(n.votosRealesSubarbol ?? 0).toLocaleString("es-CO") : "—"}</strong></div></div><div className="mt-2 flex flex-wrap gap-1 border-t pt-2"><button onClick={() => showPeople(n.id)} title="Ver personas" className="rounded-md bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-700">♧ Personas</button><button onClick={() => openForm("persona", n.id)} title="Registrar persona" className="rounded-md bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">+ Registrar persona</button><button type="button" disabled={n.nivel >= niveles || n.multinodo === false} onClick={() => { setFocusId(n.id); openForm("nodo", n.id); }} title={n.nivel >= niveles ? `Límite de ${niveles} niveles del plan. Solicita ampliación.` : n.multinodo === false ? "Habilita multinodo editando este líder" : "Registrar líder descendiente"} className="rounded-md bg-teal-50 px-2 py-1 text-[10px] font-bold text-teal-800 disabled:cursor-not-allowed disabled:opacity-50">+ Registrar como líder</button><button onClick={() => openMove(n)} title="Mover a otro nodo, incluso fuera de esta vista" className="rounded-md bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-800">⇄ Mover</button><button onClick={() => openForm("nodo", n.padreId, n)} title="Editar" className="rounded-md border px-2 py-1 text-[10px]">✎</button><button onClick={() => void removeNode(n)} title="Retirar" className="rounded-md border border-red-100 px-2 py-1 text-[10px] text-red-600">×</button></div>
        </div>)}</div>}{!childrenLoading && childrenPages > 1 && <div className="mt-5 flex flex-wrap items-center justify-center gap-3"><button type="button" disabled={childrenPage <= 1} onClick={() => setChildrenPage(p => Math.max(1,p-1))} className="rounded-xl border bg-white px-4 py-2 text-xs font-bold disabled:opacity-40">← Anterior</button><span className="text-xs font-semibold text-slate-600">Página {childrenPage} de {childrenPages} · {children.length} líderes</span><button type="button" disabled={childrenPage >= childrenPages} onClick={() => setChildrenPage(p => Math.min(childrenPages,p+1))} className="rounded-xl border bg-white px-4 py-2 text-xs font-bold disabled:opacity-40">Siguiente →</button></div>}
        {!childrenLoading && !children.length && <p className="mt-8 text-center text-sm text-slate-400">Este nodo aún no tiene nodos directos.</p>}{branchError && <p className="mt-3 text-center text-xs text-amber-700">{branchError}</p>}
      </div>
    </div>
    {dragNode && <div className="border-t border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Arrastras a <b>{fullName(dragNode)}</b>. Puedes soltarlo en la raíz o en una tarjeta visible. También puedes usar «⇄ Mover» en la tarjeta.</div>}
  </section>;

  if (loading) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Cargando mi red...</div>;
  return <main className="min-h-screen bg-[#f4f7f8] text-slate-800"><header className="border-b bg-white"><div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3 px-5 py-5"><div className="flex items-center gap-3"><button onClick={() => router.push("/dashboard")} className="rounded-xl border px-3 py-2">←</button><div><p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">Organización territorial</p><h1 className="text-2xl font-bold">Mi red</h1><p className="text-xs text-slate-500">Líderes, estructura y registros de comunidad por campaña.</p></div></div><div className="flex flex-wrap gap-2"><button onClick={() => router.push("/configuracion-campana?etiquetas=1")} className="rounded-xl border px-4 py-3 text-xs font-bold">Configurar etiquetas</button><button onClick={() => openForm("persona", null)} disabled={!campanaId} className="rounded-xl bg-emerald-600 px-4 py-3 text-xs font-bold text-white disabled:opacity-40">+ Registrar persona</button><button onClick={() => openForm("nodo", null)} disabled={!campanaId || niveles < 2} className="rounded-xl bg-[#073b38] px-4 py-3 text-xs font-bold text-white disabled:opacity-40">+ Crear nodo</button></div></div></header>
  <div className="mx-auto max-w-[1500px] space-y-5 px-5 py-6"><div className="grid gap-4 lg:grid-cols-[minmax(210px,0.7fr)_minmax(0,2fr)]"><div className="rounded-3xl border border-emerald-100 bg-gradient-to-br from-emerald-950 to-teal-800 p-5 text-white shadow-sm"><p className="text-xs font-semibold uppercase tracking-wider text-emerald-200">Profundidad de la red</p><p className="mt-3 text-4xl font-black">{niveles} <span className="text-base font-medium text-emerald-100">niveles</span></p><p className="mt-3 text-xs leading-5 text-emerald-100">Puedes registrar tantos líderes como necesites en cada nivel. El límite aplica únicamente a la profundidad contratada.</p></div><div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Avance de la red</p><h2 className="mt-1 text-lg font-black text-slate-900">Estimación frente a registros reales*</h2></div><button onClick={() => void reconcileMetrics()} disabled={rebuilding || busy || !campanaId} className="rounded-xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">{rebuilding ? "Recalculando..." : "↻ Recalcular"}</button></div>{metricsReady ? <><div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="rounded-2xl border border-amber-100 bg-amber-50 p-4"><p className="text-xs font-semibold text-amber-800">Estimación de votos</p><p className="mt-2 text-3xl font-black tabular-nums text-amber-950">{totals.estimados.toLocaleString("es-CO")}</p></div><div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4"><p className="text-xs font-semibold text-emerald-800">Personas registradas</p><p className="mt-2 text-3xl font-black tabular-nums text-emerald-950">{totals.registros.toLocaleString("es-CO")}</p></div></div><div className="mt-4 flex items-center justify-between gap-3 text-xs font-semibold text-slate-600"><span>Progreso de registros</span><span className="text-base font-black text-emerald-700">{totals.estimados > 0 ? `${(totals.registros / totals.estimados * 100).toFixed(1)}%` : "Sin estimación"}</span></div><div className="mt-2 h-4 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 transition-all" style={{width:`${totals.estimados > 0 ? Math.min(100, totals.registros / totals.estimados * 100) : 0}%`}} /></div></> : <p className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">Totales pendientes. Pulsa «Recalcular» para contar los registros existentes.</p>}</div></div><section className="flex flex-wrap items-end justify-between gap-3 rounded-3xl border bg-white p-5"><label className="min-w-[220px] flex-1 text-xs font-bold">Campaña<select className={`mt-2 ${cls}`} value={campanaId} onChange={e => setCampanaId(e.target.value)}><option value="">Selecciona campaña</option>{campanas.map(c => <option key={c.id} value={c.id}>{c.nombreCampana}</option>)}</select></label><div className="flex flex-wrap rounded-xl bg-slate-100 p-1">{([ ["grafica", "◎ Gráfica"], ["tabla", "☷ Nodos"], ["comunidad", "♧ Personas por nodo"] ] as const).map(([id, label]) => <button key={id} onClick={() => { if (id === "comunidad") showPeople(focusId); else { setVista(id); setBuscar(""); setEtiquetaFiltro(""); } }} className={`rounded-lg px-4 py-2 text-xs font-bold ${vista === id ? "bg-white shadow" : "text-slate-500"}`}>{label}</button>)}</div></section>
  {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}{ok && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{ok}</p>}
  {!campanaId ? <section className="rounded-3xl bg-white p-12 text-center">Primero crea o selecciona una campaña.</section> : vista === "grafica" ? graph : <section className="overflow-hidden rounded-3xl border bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b p-5"><div>{vista === "comunidad" && <button type="button" onClick={() => { setFocusId(returnFocus); setVista("grafica"); setBuscar(""); setEtiquetaFiltro(""); }} className="mb-3 inline-flex items-center gap-2 rounded-xl bg-[#073b38] px-5 py-3 text-sm font-bold text-white shadow-md hover:bg-emerald-800">← Volver a Mi Red</button>}<h2 className="font-bold">{vista === "tabla" ? "Directorio de nodos" : `Personas registradas · ${ownerName}`}</h2><p className="text-xs text-slate-400">Carga paginada de {PAGE} registros. Los filtros actúan sobre los registros cargados.</p></div><div className="flex flex-wrap gap-2"><input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Filtrar nombre, documento, teléfono..." className={`${cls} max-w-xs`} /><select value={etiquetaFiltro} onChange={e => setEtiquetaFiltro(e.target.value)} className={`${cls} max-w-[190px]`}><option value="">Todas las etiquetas</option>{etiquetas.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}</select><button onClick={() => vista === "tabla" ? void loadDirectory() : void loadPeople()} className="rounded-xl border px-3 py-2 text-xs font-bold">Actualizar</button>{vista === "comunidad" && <><button onClick={() => openForm("persona", peopleOwner)} className="rounded-xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white">+ Registrar</button><button onClick={() => void exportPeople()} disabled={exporting} className="rounded-xl border px-3 py-2 text-xs font-bold disabled:opacity-40">{exporting ? "Exportando..." : "Exportar personas"}</button><button onClick={() => void downloadTemplate()} className="rounded-xl border px-3 py-2 text-xs font-bold">Descargar formato</button><label className="cursor-pointer rounded-xl border px-3 py-2 text-xs font-bold">{importing ? "Importando..." : "Importar Excel"}<input type="file" accept=".xlsx" disabled={importing} className="hidden" onChange={e => { void importPeople(e.target.files?.[0]); e.currentTarget.value = ""; }} /></label></>}</div></div><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr>{["Persona", "Etiqueta", "Responsable", "Contacto", "Acciones"].map(x => <th key={x} className="px-4 py-3">{x}</th>)}</tr></thead><tbody>{vista === "tabla" ? filteredNodes.map(n => <tr key={n.id} className="border-t"><td className="px-4 py-3"><b>{fullName(n)}</b><p className="text-slate-400">Nivel {n.nivel} · {n.identificacion || "Sin documento"}</p></td><td className="px-4 py-3">{tag(n.etiquetaId)?.nombre || "Sin etiqueta"}</td><td className="px-4 py-3">{n.padreId ? `Nodo ${n.padreId.slice(0, 8)}` : gerente}</td><td className="px-4 py-3">{n.email}<p>{n.telefono}</p></td><td className="space-x-2 px-4 py-3"><button onClick={() => openForm("nodo", n.padreId, n)} className="font-bold text-blue-600">Editar</button><button onClick={() => { setFocusId(n.id); setVista("grafica"); }} className="font-bold text-emerald-700">Ver nodo</button><button onClick={() => void removeNode(n)} className="font-bold text-red-600">Retirar</button><button onClick={() => openForm("persona", n.id)} className="font-bold">+ Registro</button><button onClick={() => showPeople(n.id)} className="font-bold text-blue-700">Ver personas</button><button onClick={() => openMove(n)} className="font-bold text-amber-700">Mover</button></td></tr>) : filteredPeople.map(p => <tr key={p.id} className="border-t"><td className="px-4 py-3"><b>{fullName(p)}</b><p className="text-slate-400">{p.identificacion || "Sin documento"}</p></td><td className="px-4 py-3">{tag(p.etiquetaId)?.nombre || "Sin etiqueta"}</td><td className="px-4 py-3">{p.responsableId ? `Nodo ${p.responsableId.slice(0, 8)}` : gerente}</td><td className="px-4 py-3">{p.email}<p>{p.telefono}</p></td><td className="space-x-2 px-4 py-3"><button onClick={() => openForm("persona", peopleOwner, undefined, p)} className="font-bold text-blue-600">Editar</button><button onClick={() => void removePerson(p)} className="font-bold text-red-600">Eliminar</button></td></tr>)}</tbody></table></div><div className="flex items-center justify-between border-t p-4"><span className="text-xs text-slate-500">{vista === "tabla" ? directory.length : people.length} registros cargados</span><button disabled={vista === "tabla" ? !directoryHasMore || directoryLoading : !peopleHasMore || peopleLoading} onClick={() => vista === "tabla" ? void loadDirectory(true, directoryCursor) : void loadPeople(true, peopleCursor)} className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-40">Cargar 25 más</button></div></section>}
  <p className="text-xs text-slate-500">*«Registros reales» significa personas registradas, no votos emitidos ni confirmados. Usa «Recalcular» para incorporar registros anteriores. En redes de más de 300 nodos se requiere recálculo en servidor. Nivel 1: gerente. Los nodos empiezan en el nivel 2. Registrar personas dentro de cada nodo no consume cupos. Las búsquedas de directorio son filtros locales de páginas cargadas; una búsqueda global por millones de registros requiere índices y consultas específicas.</p></div>
   {movePicker && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/65 p-4"><div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Traslado entre nodos</p><h2 className="mt-1 text-xl font-bold">Mover a {fullName(movePicker)}</h2><p className="mt-1 text-xs text-slate-500">Busca un responsable de cualquier nivel, aunque no esté visible. Se conservarán sus personas registradas y descendientes.</p></div><button onClick={() => setMovePicker(null)} aria-label="Cerrar" className="text-xl">×</button></div><button onClick={() => setDestination(null)} className={`mt-5 w-full rounded-xl border p-3 text-left text-sm font-bold ${destination === null ? "border-emerald-500 bg-emerald-50" : "border-slate-200"}`}>⌂ Raíz · {gerente} {destination === null ? "✓" : ""}</button><input value={destinationSearch} onChange={e => setDestinationSearch(e.target.value)} placeholder="Buscar destino por nombre o apellido (mín. 2 letras)" className={`mt-3 ${cls}`} /><div className="mt-2 max-h-64 space-y-1 overflow-y-auto">{destinationResults.filter(n => n.id !== movePicker.id).map(n => <button key={n.id} onClick={() => setDestination(n.id)} className={`flex w-full justify-between rounded-xl border p-3 text-left text-xs ${destination === n.id ? "border-emerald-500 bg-emerald-50" : "border-slate-100"}`}><span className="font-bold">{fullName(n)} · N{n.nivel}</span><span>{destination === n.id ? "✓ Seleccionado" : "Seleccionar"}</span></button>)}</div><p className="mt-3 text-xs text-slate-500">Destino: {destination === null ? `Raíz · ${gerente}` : destinationResults.find(n => n.id === destination) ? fullName(destinationResults.find(n => n.id === destination)!) : destination === movePicker.padreId ? "Responsable actual" : `Nodo ${destination.slice(0,8)}`}</p><div className="mt-5 flex justify-end gap-2"><button onClick={() => setMovePicker(null)} className="rounded-xl border px-4 py-3 text-xs font-bold">Cancelar</button><button onClick={() => void finishMove()} disabled={busy || destination === movePicker.padreId} className="rounded-xl bg-emerald-700 px-5 py-3 text-xs font-bold text-white disabled:opacity-40">Confirmar traslado</button></div></div></div>}

  {ratingNode && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-4"><div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl"><h3 className="text-lg font-black text-slate-900">Calificar líder</h3><p className="mt-1 text-sm text-slate-500">{fullName(ratingNode)} · Nivel {ratingNode.nivel}</p><p className={`mt-5 text-center text-4xl font-black ${ratingValue >= 8 ? "text-lime-600" : ratingValue >= 5 ? "text-amber-600" : "text-red-600"}`}>★ {ratingValue}/10</p><div className="mt-4 grid grid-cols-5 gap-2">{Array.from({length:10},(_,i)=>i+1).map(v=><button type="button" key={v} onClick={()=>setRatingValue(v)} className={`rounded-lg border p-2 text-sm font-bold ${ratingValue===v?(v>=8?"border-lime-600 bg-lime-500 text-white":v>=5?"border-amber-600 bg-amber-500 text-white":"border-red-600 bg-red-500 text-white"):"bg-white text-slate-700"}`}>{v}</button>)}</div><p className="mt-3 text-xs text-slate-500">La calificación la asigna el responsable superior. No modifica la estimación de votos.</p><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={()=>setRatingNode(null)} disabled={ratingBusy} className="rounded-lg border px-4 py-2 text-sm">Cancelar</button><button type="button" disabled={ratingBusy} onClick={async()=>{if(!clienteId||!campanaId)return;setRatingBusy(true);try{await updateDoc(doc(nodesRef(),ratingNode.id),{puntuacion:ratingValue,puntuadoPor:ratingNode.padreId || "gerencia",puntuadoEn:serverTimestamp()});setRatingNode(null);notify("Calificación guardada.",true);}catch(e){notify(e instanceof Error?e.message:"No se pudo calificar.");}finally{setRatingBusy(false);}}} className={`rounded-lg px-4 py-2 text-sm font-bold text-white ${ratingValue>=8?"bg-lime-600":ratingValue>=5?"bg-amber-600":"bg-red-600"}`}>Guardar</button></div></div></div>}
  {labelOpen && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 p-4"><div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"><h3 className="text-lg font-bold text-slate-900">Crear etiqueta sin salir de Mi Red</h3><p className="mt-1 text-xs text-slate-500">Al guardarla, quedará seleccionada en el registro que estás diligenciando.</p><label className="mt-5 block text-xs font-bold text-slate-700">Nombre<input value={labelName} onChange={e => setLabelName(e.target.value)} className={`mt-2 ${cls}`} placeholder="Nombre de la etiqueta" /></label><label className="mt-4 flex items-center gap-3 text-xs font-bold text-slate-700">Color<input type="color" value={labelColor} onChange={e => setLabelColor(e.target.value)} className="h-10 w-14 cursor-pointer" /></label><div className="mt-6 flex justify-end gap-2"><button type="button" disabled={labelBusy} onClick={() => setLabelOpen(false)} className="rounded-xl border px-4 py-2 text-xs font-bold">Cancelar</button><button type="button" disabled={labelBusy || !labelName.trim()} onClick={async () => { if (!clienteId) return; const nombre = labelName.trim(); if (etiquetas.some(t => t.nombre.toLocaleLowerCase("es") === nombre.toLocaleLowerCase("es"))) return notify("Ya existe una etiqueta con ese nombre."); setLabelBusy(true); try { const target = doc(collection(db, "clientes", clienteId, "etiquetasNodo")); await setDoc(target, { nombre, color: labelColor, descripcion: "", creadoEn: serverTimestamp(), actualizadoEn: serverTimestamp() }); setForm(v => ({ ...v, etiquetaId: target.id })); setLabelName(""); setLabelOpen(false); notify("Etiqueta creada y seleccionada.", true); } catch(e) { notify(e instanceof Error ? e.message : "No fue posible crear la etiqueta."); } finally { setLabelBusy(false); } }} className="rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-40">Guardar etiqueta</button></div></div></div>}
  {formOpen && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4"><div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl"><div className="flex justify-between"><div><p className="text-[10px] font-bold uppercase text-emerald-600">{formType === "nodo" ? "Estructura de líderes" : "Registro de comunidad"}</p><h2 className="mt-1 text-xl font-bold">{editingNode || editingPerson ? "Editar persona" : formType === "nodo" ? "Crear nodo y acceso" : "Registrar persona"}</h2><p className="mt-1 text-xs text-slate-500">{formType === "persona" ? "El registro no crea acceso ni ocupa cupo de liderazgo." : "El nodo tendrá cuenta de acceso y ocupará un cupo."}</p></div><button onClick={() => setFormOpen(false)} disabled={busy} className="text-2xl">×</button></div><div className="mt-5 grid gap-3 sm:grid-cols-2">{([ ["Nombre *", "nombre"], ["Apellido *", "apellido"], [formType === "nodo" ? "Correo de acceso *" : "Correo opcional", "email"], ["Teléfono", "telefono"], ["Documento", "identificacion"] ] as [string, keyof Form][]).map(([label, key]) => <label key={key} className="text-xs font-bold text-slate-600">{label}<input type={key === "email" ? "email" : "text"} value={form[key]} disabled={!!editingNode && key === "email"} onChange={e => setForm(v => ({ ...v, [key]: e.target.value }))} className={`mt-1 ${cls} disabled:bg-slate-100`} /></label>)}{formType === "nodo" && <><label className="text-xs font-bold text-slate-600">Departamento<input value={form.departamento} onChange={e => setForm(v => ({...v, departamento:e.target.value}))} className={`mt-1 ${cls}`} placeholder="Departamento" /></label><label className="text-xs font-bold text-slate-600">Ciudad / municipio<input value={form.ciudad} onChange={e => setForm(v => ({...v, ciudad:e.target.value}))} className={`mt-1 ${cls}`} placeholder="Ciudad" /></label><label className="text-xs font-bold text-slate-600">Edad<input type="number" min="18" max="120" value={form.edad} onChange={e => setForm(v => ({...v, edad:e.target.value}))} className={`mt-1 ${cls}`} placeholder="Edad" /></label></>}<div className="sm:col-span-2">{formType === "nodo" && <label className="mb-3 flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-xs font-semibold text-emerald-950"><input type="checkbox" checked={multinodo} onChange={e => setMultinodo(e.target.checked)} />Habilitar multinodo (permite a este líder registrar otros líderes, si dispone de niveles). Desactivado: puede registrar personas, pero no líderes.</label>}<div className="flex items-center justify-between"><label className="text-xs font-bold text-slate-600">Etiqueta *</label><button type="button" onClick={() => setLabelOpen(true)} className="text-xs font-bold text-emerald-700">+ Crear etiqueta aquí</button></div><input value={tagSearch} onChange={e => setTagSearch(e.target.value)} placeholder="Buscar etiqueta..." className={`mt-2 ${cls}`} /><div className="mt-2 flex max-h-36 flex-wrap gap-2 overflow-y-auto">{tagsFiltered.map(t => <button type="button" key={t.id} onClick={() => setForm(v => ({ ...v, etiquetaId: t.id }))} className={`rounded-full border px-3 py-2 text-xs font-bold ${form.etiquetaId === t.id ? "border-emerald-600 ring-2 ring-emerald-100" : "border-slate-200"}`} style={{ color: t.color || "#334155" }}>{t.nombre} {form.etiquetaId === t.id ? "✓" : ""}</button>)}</div></div>{formType === "nodo" && <label className="text-xs font-bold text-slate-600 sm:col-span-2">Estimación de votos del líder (sin sumar descendientes)<input type="number" min="0" step="1" value={form.estimacionVotos} onChange={e => setForm(v => ({ ...v, estimacionVotos: e.target.value }))} className={`mt-1 ${cls}`} /><span className="mt-1 block font-normal text-slate-400">La tarjeta mostrará también la suma de las estimaciones de sus nodos descendientes.</span></label>}{formType === "persona" && <label className="sm:col-span-2 text-xs font-bold text-slate-600">Observaciones<textarea value={form.observaciones} onChange={e => setForm(v => ({ ...v, observaciones: e.target.value }))} rows={3} className="mt-1 w-full rounded-xl border p-3 text-sm" /></label>}{formType === "nodo" && !editingNode && <label className="sm:col-span-2 text-xs font-bold text-slate-600">Contraseña inicial *<input type="password" autoComplete="new-password" value={form.password} onChange={e => setForm(v => ({ ...v, password: e.target.value }))} className={`mt-1 ${cls}`} /><span className="font-normal text-slate-400">No se guarda en Firestore. Entrega las credenciales por un canal seguro.</span></label>}</div>{error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-xs text-red-700">{error}</p>}<div className="mt-5 flex justify-end gap-2"><button onClick={() => setFormOpen(false)} disabled={busy} className="rounded-xl border px-4 py-3 text-xs font-bold">Cancelar</button><button onClick={() => void save()} disabled={busy || !etiquetas.length} className="rounded-xl bg-emerald-700 px-5 py-3 text-xs font-bold text-white disabled:opacity-40">{busy ? "Guardando..." : "Guardar"}</button></div></div></div>}
  </main>;
}

function Stat({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border bg-white p-5 shadow-sm"><p className="text-xs text-slate-400">{label}</p><p className="mt-2 text-xl font-bold">{value}</p></div>; }
