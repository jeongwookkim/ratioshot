import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";

// HTTPS is required for getUserMedia on a phone over LAN (iOS Safari refuses insecure origins).
export default defineConfig({
  base: "./",
  plugins: [react(), basicSsl()],
  server: { port: 5180 },
  test: { environment: "node" },
});
