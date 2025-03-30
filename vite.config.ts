import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    global: "window",
    // Provide a fallback for util.debuglog to suppress the warning
    "process.env.NODE_DEBUG": "false", // Disable debug logging
    "util.debuglog": "(() => () => {})", // Stub util.debuglog as a no-op function
  },
  resolve: {
    alias: {
      events: "events", // Already resolved the events warnings
      util: "util/", // Ensure Vite resolves to the browser-compatible util package
    },
  },
});