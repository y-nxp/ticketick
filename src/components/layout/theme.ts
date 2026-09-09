export const THEME_STORAGE_KEY = "ticketick-theme";

/**
 * Script exécuté avant le premier rendu : pose la classe `dark` sur <html>
 * avant que le navigateur ne peigne, ce qui évite le flash de thème clair.
 * Doit rester synchrone et sans dépendance.
 */
export const themeInitScript = `(function(){try{var s=localStorage.getItem('${THEME_STORAGE_KEY}');var d=s?s==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light';}catch(e){}})();`;
