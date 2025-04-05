import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    global: "window",
    "process.env.NODE_DEBUG": "false", // Disable debug logging
  },
  resolve: {
    alias: {
      events: "events", // Already resolved the events warnings
      util: "util/", // Ensure Vite resolves to the browser-compatible util package
    },
  },
});