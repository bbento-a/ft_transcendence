import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: "standalone"
};
// next.config.js
module.exports = {
  allowedDevOrigins: ['192.168.1.212'],
}
export default nextConfig;
