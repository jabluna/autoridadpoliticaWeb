import Link from "next/link";

const benefits = [
  { number: "01", title: "Construye tu red", text: "Organiza líderes, equipos y contactos en una estructura territorial fácil de visualizar." },
  { number: "02", title: "Gestiona tu campaña", text: "Centraliza información, actividades y seguimiento desde un solo espacio." },
  { number: "03", title: "Crece a tu ritmo", text: "Explora la plataforma con el plan Free y amplía tu membresía cuando lo necesites." },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f7f9fc] text-[#122238]">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-6 sm:px-10">
        <Link href="/" className="flex items-center gap-3 font-bold tracking-tight"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#123c60] text-xl font-bold text-white">A</span><span>Autoridad <span className="text-[#1374b9]">Política</span></span></Link>
        <div className="flex items-center gap-3"><Link href="/login" className="hidden text-sm font-semibold text-slate-600 hover:text-blue-700 sm:inline">Iniciar sesión</Link><Link href="/registro" className="rounded-xl bg-[#126db2] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#0c578f]">Probar gratis →</Link></div>
      </header>

      <section className="relative overflow-hidden border-b border-slate-200 bg-[#f0f6fb]">
        <div className="pointer-events-none absolute -right-28 -top-44 h-[520px] w-[520px] rounded-full bg-blue-200/40 blur-3xl" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 pb-20 pt-16 sm:px-10 lg:grid-cols-[1.08fr_.92fr] lg:py-28">
          <div>
            <span className="inline-flex rounded-full border border-blue-200 bg-white px-4 py-2 text-xs font-bold uppercase tracking-widest text-blue-700">Tecnología para organizar campañas</span>
            <h1 className="mt-7 max-w-2xl text-5xl font-extrabold leading-[1.08] tracking-[-.05em] sm:text-6xl lg:text-7xl">Tu campaña merece <span className="text-[#1374b9]">una red más fuerte.</span></h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-slate-600">Organiza personas, líderes y equipos territoriales desde una plataforma diseñada para ayudarte a tomar mejores decisiones.</p>
            <div className="mt-9 flex flex-wrap items-center gap-4"><Link href="/registro" className="rounded-2xl bg-[#126db2] px-7 py-4 text-base font-bold text-white shadow-lg shadow-blue-900/15 transition hover:bg-[#0c578f]">Crear mi cuenta gratis →</Link><span className="text-sm font-medium text-slate-500">Sin pago inicial · Plan Free</span></div>
            <p className="mt-5 text-sm text-slate-500">Registro individual. La cuenta se habilita después de su aprobación.</p>
          </div>
          <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-2xl shadow-slate-900/10 sm:p-7">
            <div className="flex items-center justify-between border-b border-slate-100 pb-5"><div><p className="text-xs font-bold uppercase tracking-widest text-slate-400">Vista de plataforma</p><h2 className="mt-1 text-xl font-bold">Tu red, bajo control</h2></div><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">Plan Free</span></div>
            <div className="mt-6 grid grid-cols-3 gap-3">{[{n:"01",l:"Tu campaña"},{n:"02",l:"Tus líderes"},{n:"03",l:"Tu red"}].map(item=><div key={item.n} className="rounded-2xl bg-[#f0f6fb] p-4 text-center"><p className="text-3xl font-extrabold text-[#1374b9]">{item.n}</p><p className="mt-2 text-xs font-semibold text-slate-600">{item.l}</p></div>)}</div>
            <div className="mt-5 rounded-2xl bg-[#123c60] p-6 text-white"><p className="text-xs font-bold uppercase tracking-widest text-blue-200">Comienza con lo esencial</p><p className="mt-3 text-2xl font-bold">3 niveles de red</p><p className="mt-2 text-sm leading-6 text-slate-300">Conoce la organización territorial digital y descubre el potencial de tu comunidad.</p><Link href="/registro" className="mt-5 inline-block rounded-lg bg-white px-4 py-2.5 text-sm font-bold text-[#123c60]">Solicitar acceso gratuito</Link></div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20 sm:px-10"><div className="max-w-xl"><p className="text-xs font-bold uppercase tracking-widest text-[#1374b9]">Una plataforma, más posibilidades</p><h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">Menos desorden. Más organización.</h2></div><div className="mt-10 grid gap-5 md:grid-cols-3">{benefits.map(b=><article key={b.number} className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm"><span className="text-sm font-bold text-[#1374b9]">{b.number}</span><h3 className="mt-5 text-xl font-bold">{b.title}</h3><p className="mt-3 text-sm leading-7 text-slate-600">{b.text}</p></article>)}</div></section>
      <section className="bg-[#123c60] px-5 py-16 text-center text-white"><h2 className="text-3xl font-extrabold">Empieza hoy con el plan Free.</h2><p className="mx-auto mt-3 max-w-xl text-slate-300">Regístrate como usuario individual y solicita acceso para evaluar la plataforma.</p><Link href="/registro" className="mt-7 inline-flex rounded-xl bg-white px-7 py-3.5 font-bold text-[#123c60]">Quiero probar gratis →</Link></section>
      <footer className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-7 text-xs text-slate-500 sm:px-10"><span>© {new Date().getFullYear()} Autoridad Política</span><div className="flex gap-5"><Link href="/login">Acceso clientes</Link><Link href="/master/login">Acceso Master</Link></div></footer>
    </main>
  );
}
