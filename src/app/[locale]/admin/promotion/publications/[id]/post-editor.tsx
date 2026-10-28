"use client";

import * as React from "react";
import { useActionState } from "react";
import type { PromotionPostStatus } from "@prisma/client";
import { useTranslations } from "next-intl";
import { ChannelPreview } from "@/components/admin/promotion/previews";
import { Field, FormFeedback, TextInput } from "@/components/admin/fields";
import { Button } from "@/components/ui/button";
import { toZurichInput } from "@/lib/admin/datetime";
import { cancelPromotionPost, updatePromotionPost } from "@/lib/admin/promotion-actions";
import type { FormState } from "@/lib/admin/types";
import type { PromotionChannel } from "@/lib/promotion/channels";

export interface EditablePost {
  id: string;
  channel: PromotionChannel;
  status: PromotionPostStatus;
  message: string;
  imagePath: string | null;
  scheduledAt: string | null;
  accountName: string;
}

export function PostEditor({
  post,
  editable,
  readOnly,
  promotable,
}: {
  post: EditablePost;
  editable: boolean;
  readOnly: boolean;
  promotable: boolean;
}) {
  const t = useTranslations("admin.promotion");
  const [message, setMessage] = React.useState(post.message);
  const [state, action, pending] = useActionState<FormState, FormData>(updatePromotionPost, undefined);
  const [cancelState, cancel, cancelling] = useActionState<FormState, FormData>(
    cancelPromotionPost,
    undefined,
  );

  const preview = (
    <ChannelPreview
      channel={post.channel}
      accountName={post.accountName}
      message={message}
      image={post.imagePath}
    />
  );

  if (!editable) {
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3 rounded-card border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">
            {readOnly ? t("post.readOnly") : t("post.lockedHint")}
          </p>
          <pre className="whitespace-pre-wrap break-words rounded-control bg-secondary p-3 text-sm">
            {post.message}
          </pre>
        </div>
        <div className="max-w-md">{preview}</div>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4 rounded-card border border-border bg-card p-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
            const form = new FormData(e.currentTarget, submitter);
            React.startTransition(() => action(form));
          }}
          className="space-y-4"
        >
          <input type="hidden" name="id" value={post.id} />
          <div>
            <label htmlFor="post-message" className="text-sm font-medium">
              {t("post.message")}
            </label>
            <textarea
              id="post-message"
              name="message"
              rows={14}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="mt-1.5 w-full rounded-control border border-border bg-background p-3 text-sm outline-none focus:border-ring"
            />
          </div>
          <Field label={t("composer.when")} hint={t("composer.whenHint")}>
            <TextInput name="scheduledAt" type="datetime-local" defaultValue={toZurichInput(post.scheduledAt)} />
          </Field>
          {!promotable ? <p className="text-xs text-muted-foreground">{t("section.draftOnly")}</p> : null}
          <FormFeedback state={state} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" name="intent" value="schedule" disabled={pending || !promotable}>
              {t("composer.schedule")}
            </Button>
            <Button type="submit" name="intent" value="now" variant="outline" disabled={pending || !promotable}>
              {t("composer.publishNow")}
            </Button>
            <Button type="submit" name="intent" value="draft" variant="ghost" disabled={pending}>
              {post.status === "SCHEDULED" ? t("post.unschedule") : t("composer.saveDraft")}
            </Button>
          </div>
        </form>

        <form
          action={cancel}
          onSubmit={(e) => {
            if (!window.confirm(t("post.cancelConfirm"))) e.preventDefault();
          }}
          className="space-y-2 border-t border-border pt-4"
        >
          <input type="hidden" name="id" value={post.id} />
          <Button type="submit" variant="ghost" size="sm" disabled={cancelling} className="text-destructive">
            {t("post.cancel")}
          </Button>
          {cancelState && !cancelState.ok ? <FormFeedback state={cancelState} /> : null}
        </form>
      </div>
      <div className="max-w-md">{preview}</div>
    </div>
  );
}
