export const THEME_STORAGE_KEY = "ticketick-theme";

/**
 * Script exécuté avant le premier rendu : pose la classe `dark` sur <html>
 * avant que le navigateur ne peigne, ce qui évite le flash de thème clair.
 * Doit rester synchrone et sans dépendance.
 */
export const themeInitScript = `(function(){try{var p=location.pathname.replace(/^\\/(en|de|it)(?=\\/|$)/,'');var go=/^\\/go(\\/|$)/.test(p);var checkout=p==='/cart'||p.indexOf('/cart/')===0||p==='/checkout'||p.indexOf('/checkout/')===0;var shop=/(?:^|; )ticketick\\.shopOrigin\\.v1=/.test(document.cookie);if(go||(shop&&checkout)){document.documentElement.classList.remove('dark');document.documentElement.style.colorScheme='light';return;}var s=localStorage.getItem('${THEME_STORAGE_KEY}');var d=s?s==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light';}catch(e){}})();`;
