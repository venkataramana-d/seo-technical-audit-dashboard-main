import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SEO Technical Audit Dashboard",
    short_name: "SEO Audit",
    description: "Enterprise-grade SEO technical audit tool",
    start_url: "/",
    display: "standalone",
    background_color: "#0F172A",
    theme_color: "#6366F1",
    icons: [
      { src: "/icon", sizes: "32x32", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
