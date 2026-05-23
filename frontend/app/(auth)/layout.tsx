/**
 * Auth-screen shell. Centered card on a soft gradient — the goal is calm,
 * professional, and uncluttered. The card itself is the content; this
 * wrapper provides background + branding only.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-50">
      {/* Decorative gradient — kept subtle so it doesn't fight the form. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-40 -z-10 transform-gpu overflow-hidden blur-3xl sm:-top-80"
      >
        <div
          className="relative left-[calc(50%-11rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 rotate-[30deg] bg-gradient-to-tr from-emerald-200 to-sky-300 opacity-30 sm:left-[calc(50%-30rem)] sm:w-[72.1875rem]"
          style={{
            clipPath:
              'polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)',
          }}
        />
      </div>

      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12">
        <div className="mb-8 flex flex-col items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-white shadow-sm">
            <span className="font-mono text-sm font-semibold">M</span>
          </div>
          <p className="text-xs font-mono uppercase tracking-widest text-slate-500">
            Modular Furniture ERP
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
