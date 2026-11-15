/** Shown instantly while a page loads, so a tap always gives feedback. */
export default function Loading() {
  return (
    <div role="status" aria-busy="true" className="animate-pulse">
      <div className="fixed inset-x-0 top-0 z-50 h-1 overflow-hidden bg-[var(--brand-soft)]">
        <div className="h-full w-1/3 animate-[loadbar_1s_ease-in-out_infinite] bg-[var(--brand)]" />
      </div>
      <div className="mb-6 h-8 w-48 rounded-lg bg-gray-200" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-28 rounded-2xl bg-gray-200/70" />
        ))}
      </div>
    </div>
  );
}
