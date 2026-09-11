import { getTranslations } from "next-intl/server";
import { ShieldX } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

/**
 * Servie à un utilisateur connecté qui n'a pas les droits demandés. Le
 * renvoyer vers la connexion laisserait croire à une session perdue et
 * l'inviterait à se reconnecter en boucle.
 */
export default async function ForbiddenPage() {
  const t = await getTranslations("auth");

  return (
    <div className="container-page max-w-md py-24 text-center">
      <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-destructive/10">
        <ShieldX className="size-7 text-destructive" />
      </div>
      <h1 className="mt-5 text-2xl font-bold">{t("forbiddenTitle")}</h1>
      <p className="mt-2 text-muted-foreground">{t("forbiddenBody")}</p>
      <Link href="/" className="mt-8 inline-block">
        <Button variant="outline">{t("backHome")}</Button>
      </Link>
    </div>
  );
}
