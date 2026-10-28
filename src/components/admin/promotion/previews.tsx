"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Globe, Heart, MessageCircle, Send } from "lucide-react";
import type { PromotionChannel } from "@/lib/promotion/channels";
import {
  INSTAGRAM_RATIO_MAX,
  INSTAGRAM_RATIO_MIN,
  foldAt,
  messageLimit,
  previewWarnings,
} from "@/lib/promotion/preview";

/**
 * Aperçus « tel que sur Facebook / Instagram » (docs/module-promotion.md,
 * § 2.4). Approximation honnête, pas une copie conforme : repli du texte,
 * recadrage de l'image et lien non cliquable sont signalés à part, en clair.
 */

export interface PreviewProps {
  channel: PromotionChannel;
  /** Page ou compte qui publiera ; à défaut, l'organisateur. */
  accountName: string;
  message: string;
  image: string | null;
}

export function ChannelPreview(props: PreviewProps) {
  const t = useTranslations("admin.promotion");
  const [ratio, setRatio] = React.useState<number | null>(null);
  const warnings = previewWarnings({
    channel: props.channel,
    message: props.message,
    hasImage: Boolean(props.image),
    imageRatio: props.image ? ratio : null,
  });

  const onImage = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalHeight) setRatio(img.naturalWidth / img.naturalHeight);
  };

  return (
    <div className="min-w-0 flex-1">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t(props.channel === "facebook" ? "composer.previewFacebook" : "composer.previewInstagram")}
      </p>
      {props.channel === "facebook" ? (
        <FacebookCard {...props} onImage={onImage} />
      ) : (
        <InstagramCard {...props} ratio={ratio} onImage={onImage} />
      )}
      {warnings.length ? (
        <ul className="mt-3 space-y-1.5">
          {warnings.map((w) => (
            <li key={w} className="flex gap-2 text-xs text-muted-foreground">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
              <span>{t(`warnings.${w}`, { max: messageLimit(props.channel) })}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Folded({ channel, message }: { channel: PromotionChannel; message: string }) {
  const t = useTranslations("admin.promotion.composer");
  const fold = foldAt(channel, message);
  if (fold === null) return <>{message}</>;
  return (
    <>
      {message.slice(0, fold).trimEnd()}…{" "}
      <span className="font-medium text-muted-foreground">
        {t(channel === "facebook" ? "seeMore" : "more")}
      </span>
    </>
  );
}

function FacebookCard({
  accountName,
  message,
  image,
  onImage,
}: PreviewProps & { onImage: React.ReactEventHandler<HTMLImageElement> }) {
  const t = useTranslations("admin.promotion.composer");
  return (
    <div className="overflow-hidden rounded-card border border-border bg-background text-sm shadow-sm">
      <div className="flex items-center gap-2.5 p-3">
        <Avatar name={accountName} />
        <div className="min-w-0">
          <p className="truncate font-semibold">{accountName}</p>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            {t("now")} · <Globe className="size-3" />
          </p>
        </div>
      </div>
      <p className="whitespace-pre-line break-words px-3 pb-3">
        <Folded channel="facebook" message={message} />
      </p>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" onLoad={onImage} className="max-h-[28rem] w-full bg-muted object-cover" />
      ) : null}
    </div>
  );
}

function InstagramCard({
  accountName,
  message,
  image,
  ratio,
  onImage,
}: PreviewProps & { ratio: number | null; onImage: React.ReactEventHandler<HTMLImageElement> }) {
  // Le fil affiche entre 4:5 et 1,91:1 : au-delà, l'image est recadrée.
  const shown = ratio ? Math.min(INSTAGRAM_RATIO_MAX, Math.max(INSTAGRAM_RATIO_MIN, ratio)) : 1;
  const handle = accountName.replace(/\s+/g, "").toLowerCase();
  return (
    <div className="overflow-hidden rounded-card border border-border bg-background text-sm shadow-sm">
      <div className="flex items-center gap-2.5 p-3">
        <Avatar name={accountName} round />
        <p className="truncate font-semibold">{handle}</p>
      </div>
      <div className="w-full bg-muted" style={{ aspectRatio: shown }}>
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" onLoad={onImage} className="size-full object-cover" />
        ) : null}
      </div>
      <div className="flex gap-3 px-3 pt-3 text-foreground">
        <Heart className="size-5" />
        <MessageCircle className="size-5" />
        <Send className="size-5" />
      </div>
      <p className="whitespace-pre-line break-words p-3">
        <span className="font-semibold">{handle}</span>{" "}
        <Folded channel="instagram" message={message} />
      </p>
    </div>
  );
}

function Avatar({ name, round }: { name: string; round?: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex size-9 shrink-0 items-center justify-center bg-primary/10 text-sm font-semibold text-primary ${round ? "rounded-full" : "rounded-control"}`}
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
