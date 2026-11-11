// Point d'entrée Vercel : toute l'API Express tient dans une seule fonction.
// Le code TypeScript est compilé dans dist/ par `npm run vercel-build`.
import { app } from "../dist/application.js";

export default app;
