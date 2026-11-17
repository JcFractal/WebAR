import { defineConfig, loadEnv, type Plugin } from 'vite';

/** Dev only: serve api/greeting.ts like the Vercel function, so `?g=` links work with `npm run dev`. */
function devApi(): Plugin {
  return {
    name: 'dev-api',
    apply: 'serve',
    configureServer(server) {
      Object.assign(process.env, loadEnv(server.config.mode, process.cwd(), ''));
      server.middlewares.use('/api/greeting', async (req, res) => {
        const mod = (await server.ssrLoadModule('/api/greeting.ts')) as { GET: (r: Request) => Promise<Response> };
        const response = await mod.GET(new Request(`http://localhost/api/greeting${req.url ?? ''}`));
        res.statusCode = response.status;
        response.headers.forEach((v, k) => res.setHeader(k, v));
        res.end(await response.text());
      });
    },
  };
}

export default defineConfig({
  plugins: [devApi()],
  build: {
    // Three.js alone is ~500 kB minified; it is lazy-loaded only by the player route.
    chunkSizeWarningLimit: 700,
  },
});
