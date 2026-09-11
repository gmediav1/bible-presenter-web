import { defineConfig } from "vite"

// Relative paths make the same Vite build work both on Netlify and from an
// installed Electron application opened with the local file protocol.
export default defineConfig({
  base: "./"
})
