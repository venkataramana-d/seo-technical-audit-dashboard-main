import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Drawn as plain shapes rather than the 🔍 emoji glyph: Satori (next/og's
// renderer) has no bundled emoji font, so an emoji character renders as a
// blurry fallback glyph instead of the magnifying glass.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #6366F1, #8B5CF6)",
        }}
      >
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: "50%",
            border: "16px solid #fff",
            position: "relative",
            display: "flex",
          }}
        >
          <div
            style={{
              position: "absolute",
              width: 16,
              height: 52,
              background: "#fff",
              borderRadius: 8,
              left: 62,
              top: 62,
              transform: "rotate(45deg)",
            }}
          />
        </div>
      </div>
    ),
    size,
  );
}
