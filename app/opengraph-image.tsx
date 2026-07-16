import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The magnifying glass is drawn as plain shapes rather than the 🔍 emoji
// glyph: Satori (next/og's renderer) has no bundled emoji font, so an emoji
// character renders as a blurry fallback glyph instead.
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 24,
          background: "#0F172A",
          color: "#fff",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            width: 90,
            height: 90,
            borderRadius: "50%",
            border: "18px solid #8B5CF6",
            position: "relative",
            display: "flex",
          }}
        >
          <div
            style={{
              position: "absolute",
              width: 18,
              height: 58,
              background: "#8B5CF6",
              borderRadius: 9,
              left: 68,
              top: 68,
              transform: "rotate(45deg)",
            }}
          />
        </div>
        <div
          style={{
            fontSize: 64,
            fontWeight: 700,
            backgroundImage: "linear-gradient(135deg, #6366F1, #8B5CF6)",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          SEO Audit
        </div>
        <div style={{ fontSize: 30, color: "#94A3B8" }}>Technical Audit Dashboard</div>
      </div>
    ),
    size,
  );
}
