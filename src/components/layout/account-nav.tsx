import { getTranslations } from "next-intl/server";
import { User, LogIn, ShieldCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth/dal";

/**
 * Entrée de connexion de l'en-tête.
 *
 * Composant serveur isolé, et non lecture faite dans le layout : la session
 * ne peut être lue qu'à la requête, or le layout enveloppe des pages
 * prérendues. Placé sous `Suspense`, il laisse le reste du site conserver sa
 * génération statique.
 */
export async function AccountNav() {
  const user = await getCurrentUser();
  const t = await getTranslations("auth");
  const ta = await getTranslations("account");

  if (!user) {
    return (
      <Link
        href="/login"
        className="inline-flex h-10 items-center gap-2 rounded-full px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground"
      >
        <LogIn className="size-5 shrink-0" />
        {/* Le libellé disparaît sur les petits écrans, où la place manque ;
            l'icône seule reste explicite grâce au nom accessible du lien. */}
        <span className="hidden sm:inline">{t("signIn")}</span>
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {user.role === "ADMIN" ? (
        <Link
          href="/admin"
          aria-label={ta("adminAccess")}
          title={ta("adminAccess")}
          className="inline-flex size-10 items-center justify-center rounded-full text-primary transition-colors hover:bg-primary/10"
        >
          <ShieldCheck className="size-5" />
        </Link>
      ) : null}

      <Link
        href="/account"
        className="inline-flex h-10 items-center gap-2 rounded-full px-2.5 text-sm font-medium transition-colors hover:bg-secondary/70"
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
          <User className="size-4" />
        </span>
        <span className="hidden max-w-32 truncate lg:inline">
          {user.name ?? user.email}
        </span>
      </Link>
    </div>
  );
}

/**
 * Affiché le temps que la session soit lue. Reprend la silhouette du lien
 * connecté pour que l'en-tête ne se réorganise pas sous les yeux.
 */
export function AccountNavFallback() {
  return (
    <span
      aria-hidden
      className="inline-flex h-10 items-center gap-2 rounded-full px-3"
    >
      <User className="size-5 text-muted-foreground/40" />
    </span>
  );
}
