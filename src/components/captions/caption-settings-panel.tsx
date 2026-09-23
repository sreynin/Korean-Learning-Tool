"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { FieldSet, OptionGroup } from "@/components/ui/field";
import { ApiClientError, api } from "@/lib/api-client";
import { cn } from "@/lib/utils/cn";
import {
  CAPTION_ALIGNMENTS,
  CAPTION_ANIMATIONS,
  CAPTION_FONT_SIZES,
  CAPTION_POSITIONS,
  ENGLISH_SCALE,
  KOREAN_FONT_SIZE_CQW,
  ROMANIZATION_SCALE,
  segmentCaption,
} from "@/types/caption";
import type { CaptionSettings } from "@/types/caption";
import type { VideoProject } from "@/types/project";

const LABELS = {
  fontSize: { small: "Small", medium: "Medium", large: "Large", xlarge: "X-large" },
  position: { top: "Top", center: "Center", bottom: "Bottom" },
  alignment: { left: "Left", center: "Center", right: "Right" },
  animation: { none: "None", fade: "Fade", slide_up: "Slide up", pop: "Pop" },
} as const;

export function CaptionSettingsPanel({ project }: { project: VideoProject }) {
  const [settings, setSettings] = useState<CaptionSettings>(project.captionSettings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Preview against a real scene when there is one, so the sample reflects
  // this project's own text rather than a canned example.
  const sample = project.scenes?.scenes.find((scene) => scene.koreanText) ?? null;

  function update(changes: Partial<CaptionSettings>) {
    setSettings((current) => ({ ...current, ...changes }));
    setNotice(null);
  }

  async function save() {
    setSaving(true);
    setError(null);

    try {
      const updated = await api.captions.saveSettings(project.id, settings);
      setSettings(updated.captionSettings);
      setNotice("Caption settings saved.");
    } catch (cause) {
      setError(
        cause instanceof ApiClientError
          ? cause.message
          : "Could not save the caption settings.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-5">
        <div>
          <CardTitle>Captions</CardTitle>
          <p className="mt-1 text-sm text-foreground-muted">
            How each scene&apos;s Korean, romanization, and translation are drawn
            on the frame.
          </p>
        </div>

        {error ? <Alert tone="danger">{error}</Alert> : null}
        {notice ? <Alert tone="success">{notice}</Alert> : null}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_16rem]">
          <div className="flex flex-col gap-4">
            <FieldSet legend="Font size" disabled={saving}>
              <OptionGroup
                name="captionFontSize"
                value={settings.fontSize}
                onChange={(fontSize) => update({ fontSize })}
                options={CAPTION_FONT_SIZES.map((value) => ({
                  value,
                  label: LABELS.fontSize[value],
                }))}
                disabled={saving}
              />
            </FieldSet>

            <FieldSet legend="Position" disabled={saving}>
              <OptionGroup
                name="captionPosition"
                value={settings.position}
                onChange={(position) => update({ position })}
                options={CAPTION_POSITIONS.map((value) => ({
                  value,
                  label: LABELS.position[value],
                }))}
                disabled={saving}
              />
            </FieldSet>

            <FieldSet legend="Alignment" disabled={saving}>
              <OptionGroup
                name="captionAlignment"
                value={settings.alignment}
                onChange={(alignment) => update({ alignment })}
                options={CAPTION_ALIGNMENTS.map((value) => ({
                  value,
                  label: LABELS.alignment[value],
                }))}
                disabled={saving}
              />
            </FieldSet>

            <FieldSet legend="Animation" disabled={saving}>
              <OptionGroup
                name="captionAnimation"
                value={settings.animation}
                onChange={(animation) => update({ animation })}
                options={CAPTION_ANIMATIONS.map((value) => ({
                  value,
                  label: LABELS.animation[value],
                }))}
                disabled={saving}
              />
            </FieldSet>

            <fieldset disabled={saving} className="flex flex-col gap-2">
              <legend className="mb-1.5 text-sm font-medium text-foreground">
                Visible layers
              </legend>
              <Toggle
                label="Korean"
                checked={settings.showKorean}
                onChange={(showKorean) => update({ showKorean })}
              />
              <Toggle
                label="Romanization"
                checked={settings.showRomanization}
                onChange={(showRomanization) => update({ showRomanization })}
              />
              <Toggle
                label="English translation"
                checked={settings.showEnglish}
                onChange={(showEnglish) => update({ showEnglish })}
              />
            </fieldset>
          </div>

          <CaptionPreview settings={settings} sample={sample} />
        </div>

        <div className="flex justify-end">
          <Button loading={saving} onClick={save}>
            Save caption settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 accent-[var(--brand)]"
      />
      {label}
    </label>
  );
}

/** A miniature 9:16 frame so the settings can be judged without leaving the page. */
function CaptionPreview({
  settings,
  sample,
}: {
  settings: CaptionSettings;
  sample: { koreanText: string; romanization: string; englishText: string; highlightTerms: string[] } | null;
}) {
  const korean = sample?.koreanText || "저는 김치를 좋아해요.";
  const romanization = sample?.romanization || "jeoneun kimchireul joahaeyo.";
  const english = sample?.englishText || "I like kimchi.";
  const terms = sample?.highlightTerms.length ? sample.highlightTerms : ["김치"];

  const size = KOREAN_FONT_SIZE_CQW[settings.fontSize];

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold tracking-wide text-foreground-muted uppercase">
        Preview
      </p>
      <div
        className={cn(
          "relative flex w-full overflow-hidden rounded-lg bg-slate-900 px-[8cqw]",
          settings.position === "top" && "justify-start pt-[10cqh]",
          settings.position === "center" && "justify-center",
          settings.position === "bottom" && "justify-end pb-[10cqh]",
        )}
        style={{ aspectRatio: "9 / 16", containerType: "size", flexDirection: "column" }}
      >
        <div
          className={cn(
            "flex flex-col gap-[2cqh]",
            settings.alignment === "left" && "items-start text-left",
            settings.alignment === "center" && "items-center text-center",
            settings.alignment === "right" && "items-end text-right",
          )}
        >
          {settings.showKorean ? (
            <p
              lang="ko"
              className="font-bold text-white"
              style={{ fontSize: `${size}cqw`, lineHeight: 1.15 }}
            >
              {segmentCaption(korean, terms).map((segment, index) => (
                <span
                  key={index}
                  className={
                    segment.highlighted
                      ? "rounded-[0.15em] bg-[color-mix(in_oklab,var(--brand)_85%,white)] px-[0.12em]"
                      : undefined
                  }
                >
                  {segment.text}
                </span>
              ))}
            </p>
          ) : null}

          {settings.showRomanization ? (
            <p
              className="text-white/75 italic"
              style={{ fontSize: `${size * ROMANIZATION_SCALE}cqw` }}
            >
              {romanization}
            </p>
          ) : null}

          {settings.showEnglish ? (
            <p
              className="font-medium text-white/95"
              style={{ fontSize: `${size * ENGLISH_SCALE}cqw` }}
            >
              {english}
            </p>
          ) : null}
        </div>
      </div>
      <p className="text-[11px] text-foreground-muted">
        {sample
          ? "Using the first scene with Korean text."
          : "Sample text — generate a storyboard to preview your own."}
      </p>
    </div>
  );
}
