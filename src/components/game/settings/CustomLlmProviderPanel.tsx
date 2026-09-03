"use client";

import { useEffect, useState } from "react";
import { Check, Eye, EyeSlash, PencilSimple, Plus, TrashSimple, ArrowUUpLeft } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  deleteCustomLlmProvider,
  generateProviderId,
  LLM_PROVIDER_PRESETS,
  listCustomLlmProviders,
  probeCustomLlmProvider,
  saveCustomLlmProvider,
  setActiveCustomLlmProviderId,
  getActiveCustomLlmProviderId,
  type CustomLlmProvider,
} from "@/lib/custom-providers";

interface CustomLlmProviderPanelProps {
  onProvidersChanged: () => void;
}

interface DraftProvider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
}

const emptyDraft = (): DraftProvider => ({
  id: "",
  name: "",
  baseUrl: "",
  apiKey: "",
});

export function CustomLlmProviderPanel({ onProvidersChanged }: CustomLlmProviderPanelProps) {
  const t = useTranslations("customProviders");
  const [providers, setProviders] = useState<CustomLlmProvider[]>([]);
  const [activeId, setActiveIdState] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftProvider | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [probing, setProbing] = useState(false);
  const [probedModelIds, setProbedModelIds] = useState<string[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setProviders(listCustomLlmProviders());
    setActiveIdState(getActiveCustomLlmProviderId());
  }, []);

  const refresh = () => {
    setProviders(listCustomLlmProviders());
    setActiveIdState(getActiveCustomLlmProviderId());
    onProvidersChanged();
  };

  const handleProbe = async () => {
    if (!draft || probing || !draft.baseUrl.trim() || !draft.apiKey.trim()) return;
    setProbing(true);
    try {
      const result = await probeCustomLlmProvider({
        baseUrl: draft.baseUrl,
        apiKey: draft.apiKey,
      });
      if (result.ok) {
        setProbedModelIds(result.models ?? []);
        const count = result.models?.length ?? 0;
        if (result.fellBackToChatProbe) {
          toast.success(t("toasts.probeOkFallback"));
        } else if (count > 0) {
          toast.success(t("toasts.probeOkModels", { count }));
        } else {
          toast.success(t("toasts.probeOkNoModels"));
        }
      } else {
        setProbedModelIds([]);
        toast.error(t("toasts.probeFail"), { description: result.error });
      }
    } finally {
      setProbing(false);
    }
  };

  const handleSave = () => {
    if (!draft) return;
    if (!draft.baseUrl.trim() || !draft.apiKey.trim()) {
      toast.error(t("toasts.missingFields"));
      return;
    }
    const providerId = draft.id || generateProviderId();
    saveCustomLlmProvider({
      id: providerId,
      name: draft.name,
      baseUrl: draft.baseUrl,
      apiKey: draft.apiKey,
      modelIds: probedModelIds,
    });
    // 保存即自动设为使用中：否则用户只有保存、没有激活，开局依然回落到
    // 项目积分扣费分支（active 为空时 buildCustomProviderHeaders 拿不到凭据）
    if (!getActiveCustomLlmProviderId() || getActiveCustomLlmProviderId() === providerId) {
      setActiveCustomLlmProviderId(providerId);
    }
    setDraft(null);
    setProbedModelIds([]);
    refresh();
    toast.success(t("toasts.saved"));
  };

  const handleDelete = (id: string) => {
    deleteCustomLlmProvider(id);
    refresh();
    toast.success(t("toasts.deleted"));
  };

  const handleSetActive = (id: string | null) => {
    setActiveCustomLlmProviderId(id);
    refresh();
  };

  const startEdit = (provider: CustomLlmProvider) => {
    setDraft({
      id: provider.id,
      name: provider.name,
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
    });
    setProbedModelIds(provider.modelIds);
    setShowKey(false);
  };

  return (
    <section className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-4 space-y-4">
      <div>
        <h3 className="text-sm font-medium text-[var(--text-primary)]">{t("title")}</h3>
        <p className="text-xs text-[var(--text-muted)] mt-1">{t("description")}</p>
      </div>

      {/* 已保存的 Provider 列表 */}
      {providers.length > 0 && (
        <div className="space-y-2">
          {providers.map((provider) => {
            const isActive = provider.id === activeId;
            return (
              <div
                key={provider.id}
                className={`rounded-md border px-3 py-2.5 ${
                  isActive
                    ? "border-[var(--color-accent)] bg-[var(--color-accent-bg)]"
                    : "border-[var(--border-color)] bg-[var(--bg-secondary)]"
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-[var(--text-primary)] truncate">{provider.name}</span>
                      {isActive && (
                        <span className="rounded bg-[var(--color-accent)] px-1.5 py-0.5 text-[10px] font-medium text-white shrink-0">
                          {t("activeBadge")}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">
                      {provider.baseUrl}
                      {provider.modelIds.length > 0 && ` · ${t("modelCount", { count: provider.modelIds.length })}`}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleSetActive(isActive ? null : provider.id)}
                    title={isActive ? t("deactivate") : t("activate")}
                  >
                    {isActive ? <ArrowUUpLeft size={14} /> : <Check size={14} />}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => startEdit(provider)} aria-label={t("edit")}>
                    <PencilSimple size={14} />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(provider.id)}
                    aria-label={t("delete")}
                    className="text-[var(--color-danger, #ef4444)]"
                  >
                    <TrashSimple size={14} />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!draft ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setDraft(emptyDraft());
            setProbedModelIds([]);
            setShowKey(false);
          }}
        >
          <Plus size={14} className="mr-1" />
          {t("add")}
        </Button>
      ) : (
        <div className="space-y-3 rounded-md border border-[var(--border-color)] bg-[var(--bg-secondary)] p-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{t("preset")}</Label>
            <Select
              value=""
              onValueChange={(key) => {
                const preset = LLM_PROVIDER_PRESETS.find((p) => p.key === key);
                if (!preset) return;
                setDraft((prev) =>
                  prev
                    ? {
                        ...prev,
                        name: preset.key === "custom" ? prev.name || "" : preset.name,
                        baseUrl: preset.baseUrl,
                      }
                    : prev,
                );
              }}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder={t("presetPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {LLM_PROVIDER_PRESETS.map((preset) => (
                  <SelectItem key={preset.key} value={preset.key} className="text-xs">
                    {preset.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="custom-llp-name" className="text-xs">{t("name")}</Label>
            <Input
              id="custom-llp-name"
              value={draft.name}
              onChange={(e) => setDraft((prev) => (prev ? { ...prev, name: e.target.value } : prev))}
              placeholder={t("namePlaceholder")}
              className="h-8 text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="custom-llp-baseurl" className="text-xs">{t("baseUrl")}</Label>
            <Input
              id="custom-llp-baseurl"
              value={draft.baseUrl}
              onChange={(e) => setDraft((prev) => (prev ? { ...prev, baseUrl: e.target.value } : prev))}
              placeholder="https://api.deepseek.com/v1"
              className="h-8 text-xs font-mono"
            />
            <p className="text-[11px] text-[var(--text-muted)]">{t("baseUrlHint")}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="custom-llp-key" className="text-xs">{t("apiKey")}</Label>
            <div className="flex gap-2">
              <Input
                id="custom-llp-key"
                type={showKey ? "text" : "password"}
                autoComplete="new-password"
                value={draft.apiKey}
                onChange={(e) => setDraft((prev) => (prev ? { ...prev, apiKey: e.target.value } : prev))}
                className="flex-1 h-8 text-xs"
              />
              <Button type="button" variant="outline" size="sm" onClick={() => setShowKey((v) => !v)} aria-label={showKey ? t("hideKey") : t("showKey")}>
                {showKey ? <EyeSlash size={14} /> : <Eye size={14} />}
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleProbe}
              disabled={probing || !draft.baseUrl.trim() || !draft.apiKey.trim()}
            >
              {probing ? t("probing") : t("probe")}
            </Button>
            <Button type="button" size="sm" onClick={handleSave} disabled={!draft.baseUrl.trim() || !draft.apiKey.trim()}>
              {t("save")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setDraft(null);
                setProbedModelIds([]);
              }}
            >
              {t("cancel")}
            </Button>
          </div>

          {probedModelIds.length > 0 && (
            <p className="text-[11px] text-[var(--text-muted)]">
              {t("modelsPreview", { count: probedModelIds.length })}: {probedModelIds.slice(0, 5).join(", ")}
              {probedModelIds.length > 5 ? "…" : ""}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
