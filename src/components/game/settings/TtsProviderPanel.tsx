"use client";

import { useEffect, useRef, useState } from "react";
import { Check, SpeakerHigh } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { getLocale } from "@/i18n/locale-store";
import type { AppLocale } from "@/lib/voice-constants";
import {
  buildTtsRequestHeaders,
  getTtsSettings,
  getVoicePresetsForProvider,
  isCustomTtsActive,
  probeTtsProvider,
  saveTtsSettings,
  TTS_PROVIDER_LABELS,
  type TtsProviderId,
  type TtsSettings,
} from "@/lib/tts-client";

export function TtsProviderPanel() {
  const t = useTranslations("ttsProvider");
  const [settings, setSettings] = useState<TtsSettings | null>(null);
  const [probing, setProbing] = useState(false);
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
  const [locale, setLocale] = useState<AppLocale>("zh");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string>("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    setSettings(getTtsSettings());
    setLocale((getLocale() as AppLocale) === "en" ? "en" : "zh");
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  if (!settings) return null;

  const update = (patch: Partial<TtsSettings>) => {
    setSettings((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const handleSave = () => {
    saveTtsSettings(settings);
    toast.success(t("toasts.saved"));
  };

  const handleProbe = async () => {
    if (probing) return;
    setProbing(true);
    try {
      const result = await probeTtsProvider(settings);
      if (result.ok) {
        toast.success(t("toasts.probeOk"));
      } else {
        toast.error(t("toasts.probeFail"), { description: result.error });
      }
    } finally {
      setProbing(false);
    }
  };

  const handlePreview = async (voiceId: string) => {
    if (previewingVoice) return;
    setPreviewingVoice(voiceId);
    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...buildTtsRequestHeaders(settings),
        },
        body: JSON.stringify({
          text: locale === "zh" ? "你好，我是狼人杀里的一个角色。" : "Hello, I am a character in this game of Werewolf.",
          voiceId,
          locale,
        }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        toast.error(t("toasts.previewFail"), { description: data?.error || `HTTP ${response.status}` });
        return;
      }
      const blob = await response.blob();
      if (blob.type.includes("json") || blob.type.includes("text")) {
        const text = await blob.text();
        let message = text.slice(0, 300);
        try {
          message = (JSON.parse(text) as { error?: string }).error ?? message;
        } catch {
          // keep raw text
        }
        toast.error(t("toasts.previewFail"), { description: message });
        return;
      }
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;
      if (!audioRef.current) audioRef.current = new Audio();
      audioRef.current.src = url;
      await audioRef.current.play();
    } catch (error) {
      toast.error(t("toasts.previewFail"), {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setPreviewingVoice(null);
    }
  };

  const provider = settings.provider;
  const presets = getVoicePresetsForProvider(provider, locale);

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-4 space-y-4">
        <div>
          <h3 className="text-sm font-medium text-[var(--text-primary)]">{t("title")}</h3>
          <p className="text-xs text-[var(--text-muted)] mt-1">{t("description")}</p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">{t("provider")}</Label>
          <Select
            value={provider}
            onValueChange={(value: TtsProviderId) => update({ provider: value })}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(TTS_PROVIDER_LABELS) as TtsProviderId[]).map((id) => (
                <SelectItem key={id} value={id} className="text-xs">
                  {locale === "zh" ? TTS_PROVIDER_LABELS[id].zh : TTS_PROVIDER_LABELS[id].en}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {provider === "minimax" && (
          <p className="text-xs text-[var(--text-muted)]">{t("minimaxNote")}</p>
        )}

        {provider === "stepfun" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="tts-step-baseurl" className="text-xs">{t("stepfun.baseUrl")}</Label>
              <Input
                id="tts-step-baseurl"
                value={settings.stepfun.baseUrl}
                onChange={(e) => update({ stepfun: { ...settings.stepfun, baseUrl: e.target.value } })}
                placeholder="https://api.stepfun.com/v1"
                className="h-8 text-xs font-mono"
              />
              <p className="text-[11px] text-[var(--text-muted)]">{t("stepfun.baseUrlHint")}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tts-step-key" className="text-xs">{t("apiKey")}</Label>
              <Input
                id="tts-step-key"
                type="password"
                autoComplete="new-password"
                value={settings.stepfun.apiKey}
                onChange={(e) => update({ stepfun: { ...settings.stepfun, apiKey: e.target.value } })}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tts-step-model" className="text-xs">{t("stepfun.model")}</Label>
              <Input
                id="tts-step-model"
                value={settings.stepfun.model}
                onChange={(e) => update({ stepfun: { ...settings.stepfun, model: e.target.value } })}
                placeholder="step-tts-mini / step-tts-2 / stepaudio-2.5-tts"
                className="h-8 text-xs font-mono"
              />
            </div>
          </div>
        )}

        {provider === "openai-compatible" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="tts-openai-baseurl" className="text-xs">{t("openai.baseUrl")}</Label>
              <Input
                id="tts-openai-baseurl"
                value={settings.openai.baseUrl}
                onChange={(e) => update({ openai: { ...settings.openai, baseUrl: e.target.value } })}
                placeholder="https://api.siliconflow.cn/v1"
                className="h-8 text-xs font-mono"
              />
              <p className="text-[11px] text-[var(--text-muted)]">{t("openai.baseUrlHint")}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tts-openai-key" className="text-xs">{t("apiKey")}</Label>
              <Input
                id="tts-openai-key"
                type="password"
                autoComplete="new-password"
                value={settings.openai.apiKey}
                onChange={(e) => update({ openai: { ...settings.openai, apiKey: e.target.value } })}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tts-openai-model" className="text-xs">{t("openai.model")}</Label>
              <Input
                id="tts-openai-model"
                value={settings.openai.model}
                onChange={(e) => update({ openai: { ...settings.openai, model: e.target.value } })}
                placeholder="gpt-4o-mini-tts / FunAudioLLM/CosyVoice2-0.5B"
                className="h-8 text-xs font-mono"
              />
            </div>
          </div>
        )}

        {provider === "volcengine" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="tts-volc-appid" className="text-xs">{t("volcengine.appId")}</Label>
              <Input
                id="tts-volc-appid"
                value={settings.volcengine.appId}
                onChange={(e) => update({ volcengine: { ...settings.volcengine, appId: e.target.value } })}
                className="h-8 text-xs font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tts-volc-token" className="text-xs">{t("volcengine.accessToken")}</Label>
              <Input
                id="tts-volc-token"
                type="password"
                autoComplete="new-password"
                value={settings.volcengine.accessToken}
                onChange={(e) => update({ volcengine: { ...settings.volcengine, accessToken: e.target.value } })}
                className="h-8 text-xs"
              />
            </div>
            <p className="text-[11px] text-[var(--text-muted)]">{t("volcengine.hint")}</p>
          </div>
        )}

        {provider === "elevenlabs" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="tts-el-baseurl" className="text-xs">{t("elevenlabs.baseUrl")}</Label>
              <Input
                id="tts-el-baseurl"
                value={settings.elevenlabs.baseUrl}
                onChange={(e) => update({ elevenlabs: { ...settings.elevenlabs, baseUrl: e.target.value } })}
                placeholder="https://api.elevenlabs.io"
                className="h-8 text-xs font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tts-el-key" className="text-xs">{t("apiKey")}</Label>
              <Input
                id="tts-el-key"
                type="password"
                autoComplete="new-password"
                value={settings.elevenlabs.apiKey}
                onChange={(e) => update({ elevenlabs: { ...settings.elevenlabs, apiKey: e.target.value } })}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tts-el-model" className="text-xs">{t("elevenlabs.model")}</Label>
              <Input
                id="tts-el-model"
                value={settings.elevenlabs.model}
                onChange={(e) => update({ elevenlabs: { ...settings.elevenlabs, model: e.target.value } })}
                placeholder="eleven_multilingual_v2"
                className="h-8 text-xs font-mono"
              />
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleProbe}
            disabled={probing || (provider !== "minimax" && !isCustomTtsActive(settings))}
          >
            {probing ? t("probing") : <>{<SpeakerHigh size={14} className="mr-1" />}{t("test")}</>}
          </Button>
          <Button type="button" size="sm" onClick={handleSave}>
            {t("save")}
          </Button>
        </div>
        <p className="text-[11px] text-[var(--text-muted)]">{t("testHint")}</p>
      </section>

      {/* 音色试听 */}
      <section className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-4 space-y-3">
        <div>
          <h3 className="text-sm font-medium text-[var(--text-primary)]">{t("voices.title")}</h3>
          <p className="text-xs text-[var(--text-muted)] mt-1">{t("voices.description")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {presets.map((preset) => (
            <Button
              key={preset.id}
              type="button"
              variant="outline"
              size="sm"
              disabled={previewingVoice !== null || (provider !== "minimax" && !isCustomTtsActive(settings))}
              onClick={() => handlePreview(preset.id)}
              title={preset.id}
              className="text-xs"
            >
              {previewingVoice === preset.id ? t("voices.loading") : <>{preset.name}<span className="ml-1 text-[10px] text-[var(--text-muted)]">{preset.gender === "male" ? t("voices.male") : t("voices.female")}</span></>}
            </Button>
          ))}
        </div>
        {provider !== "minimax" && !isCustomTtsActive(settings) && (
          <p className="text-xs text-[var(--color-warning, #f59e0b)]">{t("voices.needConfig")}</p>
        )}
      </section>

      {/* 当前状态 */}
      <section className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
        <div className="flex items-center gap-2">
          {provider === "minimax" || isCustomTtsActive(settings) ? (
            <Check size={16} className="text-[var(--color-success)]" />
          ) : (
            <SpeakerHigh size={16} className="text-[var(--text-muted)]" />
          )}
          <p className="text-xs text-[var(--text-muted)]">
            {provider === "minimax" || isCustomTtsActive(settings)
              ? t("status.active", { provider: locale === "zh" ? TTS_PROVIDER_LABELS[provider].zh : TTS_PROVIDER_LABELS[provider].en })
              : t("status.incomplete")}
          </p>
        </div>
      </section>
    </div>
  );
}
