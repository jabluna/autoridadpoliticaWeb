"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";

type PrecioCampana = {
  id: string;
  nombre: string;
  categoria: "municipal" | "departamental" | "nacional" | "personalizada";
  valor: number;
  activo: boolean;
  esBase: boolean;
};

type Plan = {
  id: string;
  nombre: string;
  meses: number;
  descripcion?: string;
  descuento?: number;
  estado: "activo" | "inactivo";
  tipo: "base" | "personalizado";
  preciosCampana?: PrecioCampana[];
};

const TIPOS_BASE: PrecioCampana[] = [
  { id: "edil", nombre: "Edil / JAL", categoria: "municipal", valor: 0, activo: true, esBase: true },
  { id: "concejo", nombre: "Concejo", categoria: "municipal", valor: 0, activo: true, esBase: true },
  { id: "alcaldia", nombre: "Alcaldía", categoria: "municipal", valor: 0, activo: true, esBase: true },
  { id: "asamblea", nombre: "Asamblea", categoria: "departamental", valor: 0, activo: true, esBase: true },
  { id: "gobernacion", nombre: "Gobernación", categoria: "departamental", valor: 0, activo: true, esBase: true },
  { id: "presidencia", nombre: "Presidencia", categoria: "nacional", valor: 0, activo: true, esBase: true },
];

const DEFAULT_PLANS = [
  { nombre: "Free", meses: 0, descripcion: "Plan gratuito", descuento: 0, estado: "activo", tipo: "base" },
  { nombre: "Trimestral", meses: 3, descripcion: "Membresía por 3 meses", descuento: 0, estado: "activo", tipo: "base" },
  { nombre: "Semestral", meses: 6, descripcion: "Membresía por 6 meses", descuento: 0, estado: "activo", tipo: "base" },
  { nombre: "Anual", meses: 12, descripcion: "Membresía por 12 meses", descuento: 0, estado: "activo", tipo: "base" },
] as const;

const money = (value: number) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value || 0);

const finalPrice = (value: number, discount = 0) =>
  Math.max(0, Number(value || 0) * (1 - Number(discount || 0) / 100));

export default function PlanesPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [form, setForm] = useState({
    nombre: "",
    meses: "",
    descuento: "0",
    descripcion: "",
  });

  const [precios, setPrecios] = useState<PrecioCampana[]>(TIPOS_BASE);
  const [customName, setCustomName] = useState("");
  const [customCategory, setCustomCategory] =
    useState<PrecioCampana["categoria"]>("personalizada");
  const [customValue, setCustomValue] = useState("");
  const [priceGroup, setPriceGroup] = useState<
    "municipal" | "departamental" | "nacional" | "personalizada"
  >("municipal");

  useEffect(
    () =>
      onAuthStateChanged(auth, (user) => {
        if (!user) return router.replace("/master/login");
        setChecking(false);
      }),
    [router]
  );

  const normalizePrices = (source?: PrecioCampana[]) => {
    const existing = source || [];
    const bases = TIPOS_BASE.map((base) => {
      const found = existing.find((p) => p.id === base.id);
      return found ? { ...base, ...found, esBase: true } : { ...base };
    });
    const customs = existing.filter((p) => !TIPOS_BASE.some((b) => b.id === p.id));
    return [...bases, ...customs];
  };

  const loadPlans = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, "planes"), orderBy("meses")));
      let rows = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Plan));

      if (rows.length === 0) {
        for (const p of DEFAULT_PLANS) {
          await addDoc(collection(db, "planes"), {
            ...p,
            preciosCampana: TIPOS_BASE,
            creadoEn: serverTimestamp(),
          });
        }
        const snap2 = await getDocs(query(collection(db, "planes"), orderBy("meses")));
        rows = snap2.docs.map((d) => ({ id: d.id, ...d.data() } as Plan));
      }

      setPlans(
        rows.map((p) => ({
          ...p,
          preciosCampana: normalizePrices(p.preciosCampana),
        }))
      );
    } catch (e) {
      console.error(e);
      setError("No fue posible cargar los planes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!checking) loadPlans();
  }, [checking]);

  const clearForm = () => {
    setEditing(null);
    setForm({
      nombre: "",
      meses: "",
      descuento: "0",
      descripcion: "",
    });
    setPrecios(TIPOS_BASE.map((x) => ({ ...x })));
    setCustomName("");
    setCustomCategory("personalizada");
    setCustomValue("");
  };

  const editPlan = (p: Plan) => {
    setEditing(p);
    setForm({
      nombre: p.nombre,
      meses: String(p.meses),
      descuento: String(p.descuento ?? 0),
      descripcion: p.descripcion || "",
    });
    setPrecios(normalizePrices(p.preciosCampana));
    setError("");
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const updatePrice = (id: string, value: string) => {
    const number = Number(value || 0);
    setPrecios((current) =>
      current.map((p) => (p.id === id ? { ...p, valor: number } : p))
    );
  };

  const togglePrice = (id: string) => {
    setPrecios((current) =>
      current.map((p) =>
        p.id === id ? { ...p, activo: !p.activo } : p
      )
    );
  };

  const addCustomType = () => {
    setError("");

    const nombre = customName.trim();
    const valor = Number(customValue || 0);

    if (!nombre) {
      setError("Escribe el nombre del tipo de campaña personalizado.");
      return;
    }

    if (!Number.isFinite(valor) || valor < 0) {
      setError("El valor del tipo personalizado no es válido.");
      return;
    }

    const id = `custom_${Date.now()}`;

    setPrecios((current) => [
      ...current,
      {
        id,
        nombre,
        categoria: customCategory,
        valor,
        activo: true,
        esBase: false,
      },
    ]);

    setCustomName("");
    setCustomCategory("personalizada");
    setCustomValue("");
  };

  const removeCustomType = (id: string) => {
    setPrecios((current) => current.filter((p) => p.id !== id));
  };

  const savePlan = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");

    const meses = Number(form.meses);
    const descuento = Number(form.descuento || 0);

    if (!form.nombre.trim()) return setError("Escribe el nombre del plan.");
    if (!Number.isInteger(meses) || meses < 0)
      return setError("Los meses deben ser un número entero igual o mayor a 0.");
    if (!Number.isFinite(descuento) || descuento < 0 || descuento > 100)
      return setError("El descuento debe estar entre 0% y 100%.");

    const invalidPrice = precios.some(
      (p) => !Number.isFinite(Number(p.valor)) || Number(p.valor) < 0
    );
    if (invalidPrice)
      return setError("Revisa los valores configurados por tipo de campaña.");

    setSaving(true);

    try {
      const payload = {
        nombre: form.nombre.trim(),
        meses,
        descripcion: form.descripcion.trim(),
        descuento,
        preciosCampana: precios.map((p) => ({
          ...p,
          valor: Number(p.valor || 0),
        })),
        actualizadoEn: serverTimestamp(),
      };

      if (editing) {
        await updateDoc(doc(db, "planes", editing.id), payload);
        setMessage("Plan actualizado correctamente.");
      } else {
        await addDoc(collection(db, "planes"), {
          ...payload,
          estado: "activo",
          tipo: "personalizado",
          creadoEn: serverTimestamp(),
        });
        setMessage("Plan creado correctamente.");
      }

      clearForm();
      await loadPlans();
    } catch (e) {
      console.error(e);
      setError("No fue posible guardar el plan.");
    } finally {
      setSaving(false);
    }
  };

  const togglePlan = async (p: Plan) => {
    try {
      const estado = p.estado === "activo" ? "inactivo" : "activo";
      await updateDoc(doc(db, "planes", p.id), {
        estado,
        actualizadoEn: serverTimestamp(),
      });
      await loadPlans();
    } catch (e) {
      console.error(e);
      setError("No fue posible cambiar el estado.");
    }
  };

  const removePlan = async (p: Plan) => {
    if (!window.confirm(`¿Eliminar el plan "${p.nombre}"?`)) return;

    try {
      await deleteDoc(doc(db, "planes", p.id));
      setMessage("Plan eliminado.");
      await loadPlans();
    } catch (e) {
      console.error(e);
      setError("No fue posible eliminar el plan.");
    }
  };

  const categoryLabel = (category: PrecioCampana["categoria"]) => {
    if (category === "municipal") return "Municipal";
    if (category === "departamental") return "Departamental";
    if (category === "nacional") return "Nacional";
    return "Personalizada";
  };

  if (checking)
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f8ff] text-sm text-slate-500">
        Validando sesión...
      </div>
    );

  return (
    <main className="min-h-screen bg-[#f5f8ff]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1550px] items-center justify-between px-4 py-5 sm:px-7">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/master/dashboard")}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            >
              ←
            </button>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.16em] text-[#1464d2]">
                Membresías
              </p>
              <h1 className="text-xl font-semibold tracking-tight text-slate-950">
                Planes y tarifas por campaña
              </h1>
            </div>
          </div>

          <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-600">
            {plans.filter((p) => p.estado === "activo").length} activos
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-[1550px] px-4 py-7 sm:px-7">
        <section className="mb-7">
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-slate-950">
              Planes configurados
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">
              Cada registro es una oferta independiente: puedes tener varios “Trimestral” con combinaciones distintas de campañas y precios.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {plans.map((p, i) => {
              const styles = [
                "from-sky-500 to-blue-600",
                "from-emerald-400 to-teal-600",
                "from-violet-500 to-fuchsia-600",
                "from-amber-400 to-orange-500",
              ];

              const enabled = (p.preciosCampana || []).filter((x) => x.activo);

              return (
                <article
                  key={p.id}
                  className="relative overflow-hidden rounded-3xl border border-slate-200/70 bg-white p-5 shadow-sm"
                >
                  <div
                    className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${styles[i % styles.length]}`}
                  />

                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{p.nombre}</p>
                      <p className="mt-3 text-3xl font-semibold tracking-tight">
                        {p.meses === 0 ? "Free" : p.meses}
                      </p>
                      <p className="text-xs text-slate-400">
                        {p.meses === 0 ? "Sin duración de pago" : p.meses === 1 ? "mes" : "meses"}
                      </p>
                    </div>

                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase ${
                        p.estado === "activo"
                          ? "bg-emerald-50 text-emerald-600"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {p.estado}
                    </span>
                  </div>

                  <div className="mt-5 rounded-2xl bg-slate-950 p-4 text-white">
                    <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-white/50">
                      Precio final
                    </p>
                    {enabled.length > 0 ? (
                      <>
                        {(() => {
                          const finals = enabled.map(x => finalPrice(x.valor, p.descuento || 0));
                          const min = Math.min(...finals);
                          const max = Math.max(...finals);
                          return (
                            <p className="mt-1 text-xl font-semibold tracking-tight">
                              {min === max ? money(min) : `${money(min)} – ${money(max)}`}
                            </p>
                          );
                        })()}
                        <p className="mt-1 text-[10px] text-white/45">
                          Según tipo de campaña
                        </p>
                      </>
                    ) : (
                      <p className="mt-1 text-sm font-semibold">Sin campañas habilitadas</p>
                    )}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {enabled.map(price => (
                      <span key={price.id} className="rounded-lg bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700">
                        {price.nombre}
                      </span>
                    ))}
                  </div>

                  {(p.descuento || 0) > 0 && (
                    <p className="mt-3 text-xs font-semibold text-emerald-600">
                      {p.descuento}% de descuento aplicado al precio final
                    </p>
                  )}

                  <div className="mt-5 flex gap-2">
                    <button
                      onClick={() => editPlan(p)}
                      className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => togglePlan(p)}
                      className="flex-1 rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200"
                    >
                      {p.estado === "activo" ? "Inactivar" : "Activar"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[470px_1fr]">
          <section className="h-fit rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5">
              <span className="rounded-full bg-blue-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-blue-600">
                {editing ? "Edición" : "Nuevo"}
              </span>
              <h2 className="mt-3 text-lg font-semibold text-slate-950">
                {editing ? `Editar ${editing.nombre}` : "Crear nuevo plan"}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                El plan define la duración; cada tipo de campaña tiene su propio valor.
              </p>
            </div>

            <form onSubmit={savePlan} className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Nombre del plan
                </label>
                <input
                  value={form.nombre}
                  onChange={(e) => setForm((v) => ({ ...v, nombre: e.target.value }))}
                  placeholder="Ej. Trimestral"
                  className="h-12 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-400"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Duración en meses
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.meses}
                    onChange={(e) => setForm((v) => ({ ...v, meses: e.target.value }))}
                    placeholder="Ej. 3"
                    className="h-12 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-400"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Descuento general (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={form.descuento}
                    onChange={(e) => setForm((v) => ({ ...v, descuento: e.target.value }))}
                    className="h-12 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-400"
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Descripción
                </label>
                <textarea
                  value={form.descripcion}
                  onChange={(e) => setForm((v) => ({ ...v, descripcion: e.target.value }))}
                  rows={3}
                  placeholder="Descripción opcional..."
                  className="w-full resize-none rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-blue-400"
                />
              </div>

              <div className="border-t border-slate-100 pt-4">
                <div className="mb-3">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Tarifas por tipo de campaña
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-slate-400">
                    Estos precios pertenecen únicamente a este plan.
                  </p>
                </div>

                <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-2 2xl:grid-cols-4">
                  {[
                    ["municipal", "Municipales"],
                    ["departamental", "Departamentales"],
                    ["nacional", "Nacional"],
                    ["personalizada", "Personalizadas"],
                  ].map(([value, label]) => {
                    const count = precios.filter(p => p.categoria === value && p.activo).length;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setPriceGroup(value as typeof priceGroup)}
                        className={`rounded-xl border px-3 py-2.5 text-left transition ${
                          priceGroup === value
                            ? "border-blue-500 bg-blue-50 text-blue-700"
                            : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                        }`}
                      >
                        <p className="text-xs font-semibold">{label}</p>
                        <p className="mt-0.5 text-[10px] opacity-60">{count} activos</p>
                      </button>
                    );
                  })}
                </div>

                <div className="overflow-hidden rounded-2xl border border-slate-200">
                  {precios.filter(price => price.categoria === priceGroup).length === 0 ? (
                    <div className="p-5 text-center text-xs text-slate-400">
                      No hay tipos de campaña en esta categoría.
                    </div>
                  ) : (
                    precios
                      .filter(price => price.categoria === priceGroup)
                      .map((price) => (
                        <div
                          key={price.id}
                          className={`grid items-center gap-3 border-b border-slate-100 p-3 last:border-0 sm:grid-cols-[36px_1fr_145px_auto] ${
                            price.activo ? "bg-white" : "bg-slate-50 opacity-60"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => togglePrice(price.id)}
                            className={`h-5 w-9 rounded-full p-0.5 transition ${
                              price.activo ? "bg-emerald-500" : "bg-slate-300"
                            }`}
                            aria-label={price.activo ? "Desactivar tarifa" : "Activar tarifa"}
                          >
                            <span
                              className={`block h-4 w-4 rounded-full bg-white transition ${
                                price.activo ? "translate-x-4" : ""
                              }`}
                            />
                          </button>

                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-800">{price.nombre}</p>
                            <p className="text-[10px] uppercase tracking-wide text-slate-400">
                              {categoryLabel(price.categoria)}
                            </p>
                          </div>

                          <div>
                            <input
                              type="number"
                              min="0"
                              step="1000"
                              disabled={!price.activo}
                              value={price.valor}
                              onChange={(e) => updatePrice(price.id, e.target.value)}
                              className="h-10 w-full rounded-lg border border-slate-200 px-2 text-sm outline-none focus:border-blue-400 disabled:bg-slate-100"
                            />
                            {price.activo && (Number(form.descuento) || 0) > 0 && (
                              <p className="mt-1 text-[10px] font-semibold text-emerald-600">
                                Final {money(finalPrice(price.valor, Number(form.descuento || 0)))}
                              </p>
                            )}
                          </div>

                          {!price.esBase ? (
                            <button
                              type="button"
                              onClick={() => removeCustomType(price.id)}
                              className="rounded-lg bg-red-50 px-2.5 py-2 text-[10px] font-semibold text-red-600"
                            >
                              Eliminar
                            </button>
                          ) : (
                            <span className="hidden text-[10px] font-medium text-slate-300 sm:block">Base</span>
                          )}
                        </div>
                      ))
                  )}
                </div>

                {priceGroup === "personalizada" && (
                <div className="mt-4 rounded-2xl border border-dashed border-blue-200 bg-blue-50/40 p-4">
                  <h4 className="text-sm font-semibold text-slate-800">
                    Agregar tipo de campaña personalizado
                  </h4>

                  <div className="mt-3 space-y-3">
                    <input
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      placeholder="Ej. Consulta popular / Senado / Otro"
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400"
                    />

                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                      <select
                        value={customCategory}
                        onChange={(e) =>
                          setCustomCategory(
                            e.target.value as PrecioCampana["categoria"]
                          )
                        }
                        className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-600"
                      >
                        <option value="municipal">Municipal</option>
                        <option value="departamental">Departamental</option>
                        <option value="nacional">Nacional</option>
                        <option value="personalizada">Personalizada</option>
                      </select>

                      <input
                        type="number"
                        min="0"
                        step="1000"
                        value={customValue}
                        onChange={(e) => setCustomValue(e.target.value)}
                        placeholder="Valor COP"
                        className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={addCustomType}
                      className="h-11 w-full rounded-xl bg-blue-100 text-xs font-semibold text-blue-700 hover:bg-blue-200"
                    >
                      + Agregar tipo personalizado
                    </button>
                  </div>
                </div>
                )}
              </div>

              {error && (
                <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
                  {error}
                </div>
              )}

              {message && (
                <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {message}
                </div>
              )}

              <button
                disabled={saving}
                className="h-12 w-full rounded-xl bg-[#1464d2] text-sm font-semibold text-white hover:bg-[#0f54b5] disabled:opacity-50"
              >
                {saving ? "Guardando..." : editing ? "Guardar cambios" : "Crear plan"}
              </button>

              {editing && (
                <button
                  type="button"
                  onClick={clearForm}
                  className="h-11 w-full rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancelar edición
                </button>
              )}
            </form>
          </section>

          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-5 sm:p-6">
              <h2 className="text-lg font-semibold text-slate-950">
                Matriz comercial
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Compara los valores de cada tipo de campaña según la duración del plan.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1180px] text-left">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-5 py-4">Plan</th>
                    <th className="px-5 py-4">Duración</th>
                    <th className="px-5 py-4">Edil</th>
                    <th className="px-5 py-4">Concejo</th>
                    <th className="px-5 py-4">Alcaldía</th>
                    <th className="px-5 py-4">Asamblea</th>
                    <th className="px-5 py-4">Gobernación</th>
                    <th className="px-5 py-4">Presidencia</th>
                    <th className="px-5 py-4">Descuento</th>
                    <th className="px-5 py-4">Estado</th>
                    <th className="px-5 py-4">Acciones</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td
                        colSpan={11}
                        className="px-5 py-12 text-center text-sm text-slate-400"
                      >
                        Cargando planes...
                      </td>
                    </tr>
                  ) : (
                    plans.map((p) => {
                      const getValue = (id: string) => {
                        const item = (p.preciosCampana || []).find((x) => x.id === id);
                        if (!item?.activo) return null;
                        return {
                          base: item.valor,
                          final: finalPrice(item.valor, p.descuento || 0),
                        };
                      };

                      return (
                        <tr key={p.id} className="hover:bg-slate-50/60">
                          <td className="px-5 py-4">
                            <p className="text-sm font-semibold text-slate-800">
                              {p.nombre}
                            </p>
                            <p className="mt-1 max-w-[190px] truncate text-xs text-slate-400">
                              {p.descripcion || "Sin descripción"}
                            </p>
                          </td>

                          <td className="px-5 py-4 text-sm font-medium text-slate-700">
                            {p.meses === 0
                              ? "Free"
                              : `${p.meses} ${p.meses === 1 ? "mes" : "meses"}`}
                          </td>

                          {["edil", "concejo", "alcaldia", "asamblea", "gobernacion", "presidencia"].map(
                            (id) => {
                              const price = getValue(id);
                              return (
                                <td key={id} className="px-5 py-4">
                                  {price ? (
                                    <>
                                      {(p.descuento || 0) > 0 && (
                                        <p className="text-[10px] text-slate-400 line-through">
                                          {money(price.base)}
                                        </p>
                                      )}
                                      <p className="text-xs font-bold text-slate-800">
                                        {money(price.final)}
                                      </p>
                                    </>
                                  ) : (
                                    <span className="text-xs text-slate-300">—</span>
                                  )}
                                </td>
                              );
                            }
                          )}

                          <td className="px-5 py-4 text-sm text-slate-600">
                            {p.descuento || 0}%
                          </td>

                          <td className="px-5 py-4">
                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                                p.estado === "activo"
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-slate-100 text-slate-500"
                              }`}
                            >
                              {p.estado}
                            </span>
                          </td>

                          <td className="px-5 py-4">
                            <div className="flex gap-2">
                              <button
                                onClick={() => editPlan(p)}
                                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                              >
                                Editar
                              </button>
                              <button
                                onClick={() => togglePlan(p)}
                                className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100"
                              >
                                {p.estado === "activo" ? "Inactivar" : "Activar"}
                              </button>
                              <button
                                onClick={() => removePlan(p)}
                                className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-100"
                              >
                                Eliminar
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {!loading && (
              <div className="border-t border-slate-100 p-5 sm:p-6">
                <p className="text-xs leading-5 text-slate-400">
                  Los tipos personalizados se guardan dentro de cada plan y aparecen
                  al editarlo. Así puedes crear tarifas especiales sin afectar los
                  tipos electorales base.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
