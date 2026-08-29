import type { MetadataRoute } from "next";
import { ko } from "@/content/ko";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: ko.common.appName,
    short_name: ko.common.appName,
    description: ko.portal.helpSections[0].body,
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#2456c9",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
