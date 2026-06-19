import type { MetadataRoute } from "next";

// Web app manifest — makes the app installable (Android Chrome "Add to home
// screen", standalone launch) and is the source Bubblewrap/TWA reads when
// packaging for Google Play. Next serves this at /manifest.webmanifest and
// auto-injects <link rel="manifest">.
//
// `id` is kept name-independent ("/") so the install identity survives a future
// rename (e.g. broadening beyond Life Groups). `name` / `short_name` are plain
// display strings and can change with a redeploy; the permanent store
// identifiers (Android package / iOS bundle id) are decided later at packaging.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Fox Valley Church Life Groups",
    short_name: "LifeGroups",
    description:
      "Ministry operations for Life Group shepherds and oversight teams.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fbfaf4",
    theme_color: "#fbfaf4",
    icons: [
      {
        src: "/icons/icon-192",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/maskable",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
