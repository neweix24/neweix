export default function Loading() {
  return (
    <main className="min-h-[60vh] grid place-items-center px-5 py-12" aria-live="polite">
      <div className="text-center">
        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4" style={{ borderColor: "var(--border)", borderTopColor: "var(--primary)" }} aria-hidden="true" />
        <p className="font-semibold">NEWEIX লোড হচ্ছে...</p>
      </div>
    </main>
  );
}
