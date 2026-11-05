export default function Loading() {
  const block = {
    borderRadius: 14,
    background: "linear-gradient(100deg, #edf2ed 20%, #f7faf7 38%, #edf2ed 56%)",
    backgroundSize: "220% 100%",
  } as const;

  return (
    <main
      role="status"
      aria-live="polite"
      aria-label="Loading page"
      style={{
        minHeight: "100svh",
        padding: "24px clamp(16px, 5vw, 64px)",
        background: "#f8fff5",
        color: "#17211a",
      }}
    >
      <div style={{ maxWidth: 1160, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, paddingBottom: 20, borderBottom: "1px solid #e2e8e3" }}>
          <div style={{ ...block, width: 132, height: 34 }} />
          <div style={{ ...block, width: 180, height: 38 }} />
        </div>
        <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(120px, .8fr)", alignItems: "center", gap: 24, minHeight: 280, marginTop: 24, padding: "clamp(22px, 5vw, 52px)", border: "1px solid #e2e8e3", borderRadius: 24, background: "#ffffff" }}>
          <div>
            <div style={{ ...block, width: 112, height: 12, marginBottom: 18 }} />
            <div style={{ ...block, width: "min(100%, 440px)", height: 42, marginBottom: 12 }} />
            <div style={{ ...block, width: "min(88%, 360px)", height: 16, marginBottom: 8 }} />
            <div style={{ ...block, width: "min(72%, 300px)", height: 16, marginBottom: 22 }} />
            <div style={{ ...block, width: 150, height: 44 }} />
          </div>
          <div style={{ ...block, width: "min(100%, 220px)", aspectRatio: "1", justifySelf: "center", borderRadius: 28 }} />
        </section>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, margin: "30px 0 16px" }}>
          <div style={{ ...block, width: 190, height: 26 }} />
          <div style={{ ...block, width: 90, height: 20 }} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 210px), 1fr))", gap: 16 }}>
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} style={{ padding: 12, border: "1px solid #e2e8e3", borderRadius: 18, background: "#fff" }}>
              <div style={{ ...block, width: "100%", aspectRatio: "4 / 3" }} />
              <div style={{ ...block, width: "78%", height: 15, marginTop: 14 }} />
              <div style={{ ...block, width: "42%", height: 18, marginTop: 10 }} />
            </div>
          ))}
        </div>
        <p style={{ marginTop: 22, color: "#59665d", fontSize: 13 }}>NEWEIX is preparing this page…</p>
      </div>
    </main>
  );
}
