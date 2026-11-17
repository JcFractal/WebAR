import { defineConfig, loadEnv, type Plugin } from 'vite';

/** Dev only: serve the api/ functions like Vercel does, so `npm run dev` covers links and processing. */
function devApi(): Plugin {
  return {
    name: 'dev-api',
    apply: 'serve',
    configureServer(server) {
      Object.assign(process.env, loadEnv(server.config.mode, process.cwd(), ''));
      // Same handlers Vercel runs (api/*.ts exporting GET/POST); fal webhooks cannot reach localhost.
      for (const name of ['greeting', 'process', 'fal-webhook']) {
        server.middlewares.use(`/api/${name}`, async (req, res) => {
          const mod = (await server.ssrLoadModule(`/api/${name}.ts`)) as Record<string, (r: Request) => Promise<Response>>;
          const handler = mod[req.method ?? 'GET'];
          if (!handler) {
            res.statusCode = 405;
            return res.end();
          }
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
          const response = await handler(new Request(`http://localhost/api/${name}${req.url ?? ''}`, {
            method: req.method,
            headers,
            body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
          }));
          res.statusCode = response.status;
          response.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(await response.text());
        });
      }
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
