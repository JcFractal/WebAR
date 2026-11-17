// Lets Node's type stripping run the API sources, which import siblings as `./x.js` (as Vercel needs).
import { register } from 'node:module';
register(new URL('./ts-resolve.mjs', import.meta.url));
