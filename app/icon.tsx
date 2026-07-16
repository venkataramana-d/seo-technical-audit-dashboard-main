import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// Drawn as plain shapes rather than the 🔍 emoji glyph: Satori (next/og's
// renderer) has no bundled emoji font, so an emoji character renders as a
// blurry fallback glyph instead of the magnifying glass.
export default function Icon() {
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
          borderRadius: "22%",
        }}
      >
        <div
          style={{
            width: 14,
            height: 14,
            borderRadius: "50%",
            border: "3px solid #fff",
            position: "relative",
            display: "flex",
          }}
        >
          <div
            style={{
              position: "absolute",
              width: 3,
              height: 9,
              background: "#fff",
              borderRadius: 2,
              left: 11,
              top: 11,
              transform: "rotate(45deg)",
            }}
          />
        </div>
      </div>
    ),
    size,
  );
}
