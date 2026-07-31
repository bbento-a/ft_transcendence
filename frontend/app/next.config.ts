import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin(
	"./i18n/request.ts"
);

const nextConfig: NextConfig = {
  // Self-contained server + minimal node_modules for the Docker runtime stage.
  output: "standalone",

  // Let the dev server accept cross-origin requests from a LAN device
  // (e.g. a phone hitting the Mac's IP for mobile testing). Only affects
  // `next dev`; ignored in production.
  allowedDevOrigins: ["192.168.1.212"],

  images: {
    domains: ["cdn.intra.42.fr"],
  }
};

export default withNextIntl(nextConfig);