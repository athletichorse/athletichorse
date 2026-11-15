import type { MetadataRoute } from "next";

/** Lets staff "Add to Home Screen": the Cashier opens full screen, also without internet. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Alhisan Alriyadi — Staff Portal",
    short_name: "Alhisan POS",
    description: "Cashier, stock, products and sales",
    start_url: "/pos",
    scope: "/",
    display: "standalone",
    background_color: "#f6f7f9",
    theme_color: "#0f6b4f",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
