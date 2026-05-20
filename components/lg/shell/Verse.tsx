export function Verse() {
  return (
    <div
      style={{
        padding: 14,
        borderRadius: 10,
        background: "var(--c-sageTint)",
        border: "1px solid var(--c-line)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 9.5,
          letterSpacing: 1.8,
          textTransform: "uppercase",
          fontWeight: 700,
          color: "var(--c-clay)",
          marginBottom: 8,
        }}
      >
        Why we&rsquo;re here
      </div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 15,
          lineHeight: 1.3,
          color: "var(--c-ink)",
          fontWeight: 500,
        }}
      >
        Telling and{" "}
        <span style={{ fontStyle: "italic" }}>showing</span> the story of Jesus.
      </div>
      <div
        style={{
          marginTop: 10,
          paddingTop: 10,
          borderTop: "1px solid var(--c-sageSoft)",
          fontFamily: "var(--font-display)",
          fontSize: 11.5,
          lineHeight: 1.5,
          color: "var(--c-ink2)",
          fontStyle: "italic",
        }}
      >
        &ldquo;Jesus Christ is the one we proclaim&hellip; so that we may
        present everyone fully mature in Christ.&rdquo;
      </div>
      <div
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 9.5,
          letterSpacing: 1.4,
          textTransform: "uppercase",
          color: "var(--c-ink4)",
          marginTop: 6,
          fontWeight: 600,
        }}
      >
        Colossians 1:28
      </div>
    </div>
  );
}
