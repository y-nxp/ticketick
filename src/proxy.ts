import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  matcher: [
    // Toutes les routes sauf les fichiers statiques, l'API et _next
    "/((?!api|_next|_vercel|.*\\..*).*)",
  ],
};
