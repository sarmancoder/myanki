import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      /**
       * Los adjuntos de las tarjetas (imágenes y audio) viajan dentro de la propia
       * Server Action en base64, no por multipart. 8 MB deja margen para el
       * audio de 6 MB más el sobre del JSON.
       */
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
