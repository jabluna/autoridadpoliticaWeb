import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-6 py-16 text-white">
      <div className="w-full max-w-2xl text-center">
        <div className="mx-auto mb-7 inline-flex rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-blue-200">
          Plataforma de gestión de campañas
        </div>
        <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">Autoridad Política</h1>
        <p className="mx-auto mt-5 max-w-lg text-base leading-7 text-slate-300">
          Estamos preparando una nueva experiencia para organizar, conectar y gestionar campañas políticas.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Link href="/login" className="rounded-xl bg-blue-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-400">
            Ingreso de clientes
          </Link>
          <Link href="/master/login" className="rounded-xl border border-white/20 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10">
            Acceso Master
          </Link>
        </div>
        <p className="mt-12 text-xs text-slate-500">Próximamente, nuestro sitio oficial.</p>
      </div>
    </main>
  );
}
