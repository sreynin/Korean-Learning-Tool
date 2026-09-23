"use client";

import { useEffect, useState } from "react";
import { SceneAudioControls } from "@/components/voice/scene-audio-controls";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, FieldSet, OptionGroup, Select } from "@/components/ui/field";
import { SCENE_TYPE_META } from "@/lib/constants";
import { ApiClientError, api } from "@/lib/api-client";
import {
  MAX_PITCH,
  MAX_SPEED,
  MAX_VOLUME,
  MIN_PITCH,
  MIN_SPEED,
  MIN_VOLUME,
  VOICE_LANGUAGES,
} from "@/types/voice";
import type { VoiceLanguage, VoiceOption, VoiceSettings } from "@/types/voice";
import type { VideoProject } from "@/types/project";

interface ProviderInfo {
  provider: string;
  capabilities: { speed: boolean; pitch: boolean; volume: boolean };
}

const LANGUAGE_LABELS: Record<VoiceLanguage, string> = {
  korean: "Korean",
  english: "English",
};

export function VoiceSettingsPanel({ project }: { project: VideoProject }) {
  const [settings, setSettings] = useState<VoiceSettings>(project.voiceSettings);
  const [scenes, setScenes] = useState(project.scenes?.scenes ?? []);
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [info, setInfo] = useState<ProviderInfo | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sceneBusy, setSceneBusy] = useState<Record<string, "generating" | "deleting">>({});
  const [sceneErrors, setSceneErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;

    api.voices
      .list()
      .then((result) => {
        if (cancelled) return;
        setVoices(result.voices);
        setInfo({ provider: result.provider, capabilities: result.capabilities });
      })
      .catch(() => {
        if (!cancelled) setError("Could not load the available voices.");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const languageVoices = voices.filter((voice) => voice.language === settings.language);

  function update(changes: Partial<VoiceSettings>) {
    setSettings((current) => {
      const next = { ...current, ...changes };

      // Switching language invalidates the selected voice.
      if (changes.language && changes.language !== current.language) {
        const firstForLanguage = voices.find((v) => v.language === changes.language);
        next.voiceId = firstForLanguage?.id ?? next.voiceId;
      }
      return next;
    });
    setNotice(null);
  }

  async function saveSettings() {
    setSavingSettings(true);
    setError(null);

    try {
      const updated = await api.voices.saveSettings(project.id, settings);
      setSettings(updated.voiceSettings);
      setNotice("Voice settings saved.");
    } catch (cause) {
      setError(
        cause instanceof ApiClientError
          ? cause.message
          : "Could not save the voice settings.",
      );
    } finally {
      setSavingSettings(false);
    }
  }

  async function runSceneAction(
    sceneId: string,
    action: "generating" | "deleting",
  ) {
    setSceneBusy((current) => ({ ...current, [sceneId]: action }));
    setSceneErrors((current) => {
      const next = { ...current };
      delete next[sceneId];
      return next;
    });

    try {
      const updated =
        action === "generating"
          ? await api.voices.generate(project.id, sceneId)
          : await api.voices.remove(project.id, sceneId);

      setScenes(updated.scenes?.scenes ?? []);
    } catch (cause) {
      setSceneErrors((current) => ({
        ...current,
        [sceneId]:
          cause instanceof ApiClientError
            ? cause.message
            : "That did not work. Please try again.",
      }));
    } finally {
      setSceneBusy((current) => {
        const next = { ...current };
        delete next[sceneId];
        return next;
      });
    }
  }

  const generatedCount = scenes.filter((scene) => scene.audio).length;

  return (
    <Card>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Narration</CardTitle>
            <p className="mt-1 text-sm text-foreground-muted">
              {scenes.length > 0
                ? `${generatedCount} of ${scenes.length} scenes have voice`
                : "No storyboard yet"}
              {info ? ` · ${info.provider}` : ""}
            </p>
          </div>
        </div>

        {info?.provider === "mock" ? (
          <Alert tone="warning">
            No <code>ELEVENLABS_API_KEY</code> is configured, so the mock voice
            provider is used. Clips are silent but correctly timed, which is
            enough to check scene pacing.
          </Alert>
        ) : null}

        {error ? <Alert tone="danger">{error}</Alert> : null}
        {notice ? <Alert tone="success">{notice}</Alert> : null}

        <div className="flex flex-col gap-4 rounded-lg border border-border-subtle p-4">
          <FieldSet legend="Language" disabled={savingSettings}>
            <OptionGroup
              name="voiceLanguage"
              value={settings.language}
              onChange={(value) => update({ language: value })}
              options={VOICE_LANGUAGES.map((language) => ({
                value: language,
                label: LANGUAGE_LABELS[language],
              }))}
              disabled={savingSettings}
            />
          </FieldSet>

          <Field label="Voice">
            {({ id, describedBy, invalid }) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                invalid={invalid}
                value={settings.voiceId}
                disabled={savingSettings || languageVoices.length === 0}
                onChange={(event) => update({ voiceId: event.target.value })}
              >
                {languageVoices.length === 0 ? (
                  <option value={settings.voiceId}>Loading voices…</option>
                ) : (
                  languageVoices.map((voice) => (
                    <option key={voice.id} value={voice.id}>
                      {voice.name}
                    </option>
                  ))
                )}
              </Select>
            )}
          </Field>

          <SliderField
            label="Speed"
            value={settings.speed}
            min={MIN_SPEED}
            max={MAX_SPEED}
            step={0.05}
            suffix="×"
            disabled={savingSettings}
            unsupported={info ? !info.capabilities.speed : false}
            onChange={(speed) => update({ speed })}
          />

          <SliderField
            label="Pitch"
            value={settings.pitch}
            min={MIN_PITCH}
            max={MAX_PITCH}
            step={1}
            suffix=" st"
            disabled={savingSettings}
            unsupported={info ? !info.capabilities.pitch : false}
            onChange={(pitch) => update({ pitch })}
          />

          <SliderField
            label="Volume"
            value={settings.volume}
            min={MIN_VOLUME}
            max={MAX_VOLUME}
            step={0.05}
            suffix="×"
            disabled={savingSettings}
            // Volume is applied on playback even when synthesis ignores it.
            unsupported={false}
            onChange={(volume) => update({ volume })}
          />

          <div className="flex justify-end">
            <Button loading={savingSettings} onClick={saveSettings}>
              Save voice settings
            </Button>
          </div>
        </div>

        {scenes.length === 0 ? (
          <EmptyState
            title="Generate a storyboard first"
            description="Narration is generated per scene, so there is nothing to voice yet."
          />
        ) : (
          <ol className="flex flex-col gap-3">
            {scenes.map((scene, index) => (
              <li key={scene.id} className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-foreground-muted">
                    {index + 1}
                  </span>
                  <span className="text-xs text-foreground-muted">
                    {SCENE_TYPE_META[scene.type].label}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                    {scene.narration || "No narration"}
                  </span>
                </div>

                <SceneAudioControls
                  audio={scene.audio}
                  busy={sceneBusy[scene.id] ?? null}
                  error={sceneErrors[scene.id] ?? null}
                  disabled={Boolean(sceneBusy[scene.id])}
                  onGenerate={() => runSceneAction(scene.id, "generating")}
                  onDelete={() => runSceneAction(scene.id, "deleting")}
                />
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  suffix,
  disabled,
  unsupported,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  disabled?: boolean;
  unsupported: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <label className="text-sm font-medium text-foreground">{label}</label>
        <span className="font-mono text-xs text-foreground-muted tabular-nums">
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-[var(--brand)]"
        aria-label={label}
      />
      {unsupported ? (
        <p className="text-[11px] text-warning">
          The current voice provider does not apply {label.toLowerCase()}. The
          value is saved but has no effect on the generated audio.
        </p>
      ) : null}
    </div>
  );
}
