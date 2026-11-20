/**
 * Assainissement du corps HTML des articles (liste blanche).
 *
 * Le Manager envoie un HTML simple (paragraphes, titres, listes, tableaux,
 * liens). On ne garde que les balises et attributs de la liste blanche ; une
 * balise inconnue disparaît mais son texte reste, sauf pour les balises dont le
 * contenu n'est pas du texte (script, style, iframe…), supprimées entières.
 *
 * Liens réécrits au passage :
 * - lien vers un autre article (`slug`, `/blog/slug`, `https://ticketick.ch/blog/slug`)
 *   → adresse de la langue de cet article ; article inconnu (pas encore validé)
 *   → lien retiré, texte gardé ;
 * - `https://ticketick.ch/pricing`, `/de/organizer#contact`… → adresse relative
 *   et traduite (`/tarifs`, `/de/veranstalter#contact`), sans détour par une redirection ;
 * - lien externe → nouvel onglet, `rel="noopener noreferrer"` ;
 * - schéma autre que http(s), mailto ou tel → lien retiré.
 *
 * Module pur, sans dépendance : testé dans `sanitize.test.ts`.
 */
import { localizePath } from "../../i18n/pathnames";
import { routing } from "../../i18n/routing";

const ALLOWED = new Set([
  "p", "h2", "h3", "h4", "ul", "ol", "li", "table", "thead", "tbody", "tr", "th", "td",
  "a", "strong", "em", "b", "i", "blockquote", "img", "code", "br", "hr",
]);

/** Balises renommées : un seul H1 par page (le titre de l'article). */
const RENAMED: Record<string, string> = { h1: "h2", h5: "h4", h6: "h4" };

const VOID = new Set(["img", "br", "hr"]);

const SELF_CLOSING_SIBLINGS = new Set(["li", "p", "tr", "td", "th"]);

/** Balises dont le contenu est supprimé avec elles. */
const DROP_CONTENT = new Set([
  "script", "style", "iframe", "object", "embed", "noscript", "template", "textarea",
  "select", "svg", "math", "title", "head", "frameset", "frame", "applet", "xmp", "noembed",
]);

const ATTRIBUTES: Record<string, Set<string>> = {
  a: new Set(["href", "title"]),
  img: new Set(["src", "alt", "width", "height", "title"]),
  th: new Set(["colspan", "rowspan", "scope"]),
  td: new Set(["colspan", "rowspan"]),
  ol: new Set(["start"]),
};

const SITE_HOSTS = new Set(["ticketick.ch", "www.ticketick.ch"]);
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LOCALE_PREFIX = new RegExp(`^/(${routing.locales.join("|")})(?=/|$)`);

export interface SanitizeOptions {
  /** Slug → adresse publique de chaque article connu (`/blog/x`, `/de/blog/y`). */
  articlePaths?: ReadonlyMap<string, string>;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", colon: ":", tab: "\t", newline: "\n",
};

function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);?/gi, (match, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? match;
  });
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Texte entre les balises : un `<` ou `>` isolé devient une entité. */
function escapeText(value: string): string {
  return value.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function parseAttributes(source: string): [string, string][] {
  const out: [string, string][] = [];
  const re = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    out.push([m[1].toLowerCase(), decodeEntities(m[2] ?? m[3] ?? m[4] ?? "")]);
  }
  return out;
}

type Href = { href: string; external: boolean } | null;

/** Adresse interne au site (sans origine) → adresse affichée, ou `null` pour retirer le lien. */
function internalHref(pathWithSuffix: string, articlePaths: ReadonlyMap<string, string>): Href {
  const at = pathWithSuffix.search(/[?#]/);
  const path = at === -1 ? pathWithSuffix : pathWithSuffix.slice(0, at);
  const suffix = at === -1 ? "" : pathWithSuffix.slice(at);

  const prefix = path.match(LOCALE_PREFIX);
  const locale = prefix ? prefix[1] : routing.defaultLocale;
  const rest = (prefix ? path.slice(prefix[0].length) : path) || "/";

  const blog = rest.match(/^\/blog\/([^/]+)\/?$/);
  if (blog) {
    const target = articlePaths.get(blog[1].toLowerCase());
    return target ? { href: target + suffix, external: false } : null;
  }
  if (/^\/blog\/?$/.test(rest)) {
    return { href: (locale === routing.defaultLocale ? "/blog" : `/${locale}/blog`) + suffix, external: false };
  }
  const shown = localizePath(rest, locale);
  const localized = locale === routing.defaultLocale ? shown : `/${locale}${shown === "/" ? "" : shown}`;
  return { href: localized + suffix, external: false };
}

export function rewriteHref(raw: string, articlePaths: ReadonlyMap<string, string> = new Map()): Href {
  // Les navigateurs ignorent les blancs et caractères de contrôle dans le schéma.
  const href = raw.replace(/[\u0000-\u001f\u007f\s]+/g, "");
  if (!href) return null;
  if (href.startsWith("#")) return { href, external: false };

  // Slug seul, relatif à la page de l'article (`organiser-festival-suisse-romande`).
  const bare = href.match(/^(?:\.\/)?([^/?#:]+)([?#].*)?$/);
  if (bare && SLUG.test(bare[1].toLowerCase())) {
    const target = articlePaths.get(bare[1].toLowerCase());
    return target ? { href: target + (bare[2] ?? ""), external: false } : null;
  }

  if (href.startsWith("/") && !href.startsWith("//")) return internalHref(href, articlePaths);

  let url: URL;
  try {
    url = new URL(href.startsWith("//") ? `https:${href}` : href);
  } catch {
    return null;
  }
  if (url.protocol === "mailto:" || url.protocol === "tel:") return { href: url.toString(), external: false };
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (SITE_HOSTS.has(url.hostname)) return internalHref(`${url.pathname}${url.search}${url.hash}`, articlePaths);
  return { href: url.toString(), external: true };
}

function safeImageSrc(raw: string): string | null {
  const src = raw.trim();
  if (src.startsWith("/") && !src.startsWith("//")) return src;
  try {
    const url = new URL(src);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function openTag(name: string, rawAttributes: string, options: SanitizeOptions): string | null {
  const allowed = ATTRIBUTES[name];
  const attributes: string[] = [];
  let externalLink = false;

  for (const [key, value] of parseAttributes(rawAttributes)) {
    if (!allowed?.has(key)) continue;
    if (name === "a" && key === "href") {
      const target = rewriteHref(value, options.articlePaths);
      if (!target) return null;
      externalLink = target.external;
      attributes.push(`href="${escapeAttribute(target.href)}"`);
    } else if (name === "img" && key === "src") {
      const src = safeImageSrc(value);
      if (!src) return null;
      attributes.push(`src="${escapeAttribute(src)}"`);
    } else if (["colspan", "rowspan", "start", "width", "height"].includes(key)) {
      if (/^\d{1,4}$/.test(value.trim())) attributes.push(`${key}="${value.trim()}"`);
    } else if (key === "scope") {
      if (/^(row|col|rowgroup|colgroup)$/.test(value)) attributes.push(`scope="${value}"`);
    } else {
      attributes.push(`${key}="${escapeAttribute(value)}"`);
    }
  }

  if (name === "a") {
    if (!attributes.some((a) => a.startsWith("href="))) return null;
    if (externalLink) attributes.push('target="_blank"', 'rel="noopener noreferrer"');
  }
  if (name === "img") {
    if (!attributes.some((a) => a.startsWith("src="))) return null;
    if (!attributes.some((a) => a.startsWith("alt="))) attributes.push('alt=""');
    attributes.push('loading="lazy"', 'decoding="async"');
  }
  return `<${name}${attributes.length ? " " + attributes.join(" ") : ""}>`;
}

/** Les tableaux défilent dans leur cadre sur mobile. */
const TABLE_OPEN = '<div class="article-table">';

/**
 * HTML reçu → HTML sûr à injecter. Les balises restent équilibrées : une
 * fermeture sans ouverture est ignorée, une ouverture non fermée est fermée
 * à la fin.
 */
export function sanitizeArticleHtml(html: string, options: SanitizeOptions = {}): string {
  const out: string[] = [];
  const stack: string[] = [];
  /** Liens retirés dont la fermeture n'est pas encore passée : elle sera ignorée. */
  let droppedAnchors = 0;
  const token = /<!--[\s\S]*?(?:-->|$)|<!\[CDATA\[[\s\S]*?(?:\]\]>|$)|<![^>]*>|<\?[^>]*>|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;

  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = token.exec(html))) {
    if (m.index > last) out.push(escapeText(html.slice(last, m.index)));
    last = token.lastIndex;
    if (!m[2]) continue; // commentaire, doctype, instruction

    const closing = m[1] === "/";
    const raw = m[2].toLowerCase();

    if (!closing && DROP_CONTENT.has(raw)) {
      // Tout jusqu'à la fermeture correspondante disparaît.
      const end = new RegExp(`</${raw}\\s*>`, "ig");
      end.lastIndex = last;
      const found = end.exec(html);
      last = found ? end.lastIndex : html.length;
      token.lastIndex = last;
      continue;
    }

    const name = RENAMED[raw] ?? raw;
    if (!ALLOWED.has(name)) continue;

    if (closing) {
      if (VOID.has(name)) continue;
      if (name === "a" && droppedAnchors > 0) {
        droppedAnchors--;
        continue;
      }
      const at = stack.lastIndexOf(name);
      if (at === -1) continue;
      while (stack.length > at) {
        const open = stack.pop()!;
        out.push(`</${open}>`);
        if (open === "table") out.push("</div>");
      }
      continue;
    }

    // Lien refusé, ou lien dans un lien : le texte reste, la balise et sa fermeture disparaissent.
    const tag = name === "a" && stack.includes("a") ? null : openTag(name, m[3], options);
    if (!tag) {
      if (name === "a") droppedAnchors++;
      continue;
    }
    // `<li>` qui suit un `<li>` non fermé : le précédent se ferme (idem p, tr, td, th).
    if (SELF_CLOSING_SIBLINGS.has(name) && stack[stack.length - 1] === name) out.push(`</${stack.pop()}>`);
    if (name === "table") out.push(TABLE_OPEN);
    out.push(tag);
    if (!VOID.has(name)) stack.push(name);
  }
  if (last < html.length) out.push(escapeText(html.slice(last)));
  while (stack.length) {
    const open = stack.pop()!;
    out.push(`</${open}>`);
    if (open === "table") out.push("</div>");
  }
  return out.join("");
}
