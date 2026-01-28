"use client";

import { useState, useCallback, useMemo } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash, ArrowLeft, User, Shuffle, Eye, ClipboardText, Sparkle } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { CustomCharacter, CustomCharacterInput } from "@/types/custom-character";
import { MBTI_OPTIONS, GENDER_OPTIONS, FIELD_LIMITS, MAX_CUSTOM_CHARACTERS } from "@/types/custom-character";
import { buildAvatarUrl } from "@/lib/avatar-config";
import type { Gender } from "@/lib/character-generator";

interface CustomCharacterModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  characters: CustomCharacter[];
  loading: boolean;
  canAddMore: boolean;
  remainingSlots: number;
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  onCreateCharacter: (input: CustomCharacterInput) => Promise<CustomCharacter | null>;
  onUpdateCharacter: (id: string, input: Partial<CustomCharacterInput>) => Promise<CustomCharacter | null>;
  onDeleteCharacter: (id: string) => Promise<boolean>;
}

type ViewMode = "list" | "create" | "edit";

export function CustomCharacterModal({
  open,
  onOpenChange,
  characters,
  loading,
  canAddMore,
  remainingSlots,
  selectedIds,
  onSelectionChange,
  onCreateCharacter,
  onUpdateCharacter,
  onDeleteCharacter,
}: CustomCharacterModalProps) {
  const t = useTranslations();
  const [view, setView] = useState<ViewMode>("list");
  const [editingCharacter, setEditingCharacter] = useState<CustomCharacter | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [isAiHelpOpen, setIsAiHelpOpen] = useState(false);
  const [aiPromptDraft, setAiPromptDraft] = useState("");
  const [detailCharacter, setDetailCharacter] = useState<CustomCharacter | null>(null);
  const [formData, setFormData] = useState<CustomCharacterInput>({
    display_name: "",
    gender: "male",
    age: 25,
    mbti: "",
    basic_info: "",
    style_label: "",
    avatar_seed: "",
  });

  const resetForm = useCallback(() => {
    setFormData({
      display_name: "",
      gender: "male",
      age: 25,
      mbti: "",
      basic_info: "",
      style_label: "",
      avatar_seed: `custom-${Date.now()}`,
    });
  }, []);

  const handleCreate = useCallback(() => {
    resetForm();
    setEditingCharacter(null);
    setView("create");
  }, [resetForm]);

  const handleEdit = useCallback((char: CustomCharacter) => {
    setFormData({
      display_name: char.display_name,
      gender: char.gender,
      age: char.age,
      mbti: char.mbti,
      basic_info: char.basic_info || "",
      style_label: char.style_label || "",
      avatar_seed: char.avatar_seed || "",
    });
    setEditingCharacter(char);
    setView("edit");
  }, []);

  const handleBack = useCallback(() => {
    setView("list");
    setEditingCharacter(null);
    resetForm();
  }, [resetForm]);

  const handleSubmit = useCallback(async () => {
    if (!formData.display_name.trim()) {
      toast.error(t("customCharacter.errors.nameRequired"));
      return;
    }

    if (view === "create") {
      const result = await onCreateCharacter(formData);
      if (result) {
        toast.success(t("customCharacter.toast.createSuccess"));
        handleBack();
      }
    } else if (view === "edit" && editingCharacter) {
      const result = await onUpdateCharacter(editingCharacter.id, formData);
      if (result) {
        toast.success(t("customCharacter.toast.updateSuccess"));
        handleBack();
      }
    }
  }, [formData, view, editingCharacter, onCreateCharacter, onUpdateCharacter, handleBack, t]);

  const handleDelete = useCallback(async (id: string) => {
    const success = await onDeleteCharacter(id);
    if (success) {
      toast.success(t("customCharacter.toast.deleteSuccess"));
    }
  }, [onDeleteCharacter, t]);

  const randomizeSeed = useCallback(() => {
    setFormData(prev => ({
      ...prev,
      avatar_seed: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    }));
  }, []);

  const avatarUrl = useMemo(() => {
    const seed = formData.avatar_seed || formData.display_name || "preview";
    return buildAvatarUrl({
      seed,
      gender: formData.gender as Gender,
    });
  }, [formData.avatar_seed, formData.display_name, formData.gender]);

  const genderLabels = useMemo(() => ({
    male: t("customCharacter.gender.male"),
    female: t("customCharacter.gender.female"),
    nonbinary: t("customCharacter.gender.nonbinary"),
  }), [t]);

  const toggleSelection = useCallback((id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    onSelectionChange(newSet);
  }, [selectedIds, onSelectionChange]);

  const buildExportPayloadForCharacter = useCallback((char: CustomCharacter) => {
    return {
      display_name: char.display_name,
      gender: char.gender,
      age: char.age,
      mbti: char.mbti,
      basic_info: char.basic_info,
      style_label: char.style_label,
      avatar_seed: char.avatar_seed,
    };
  }, []);

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        ta.style.top = "-9999px";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand("copy");
        ta.remove();
        return ok;
      } catch {
        return false;
      }
    }
  }, []);

  const normalizeImportedCharacter = useCallback((raw: Record<string, unknown>, index: number): CustomCharacterInput | null => {
    const displayNameRaw = raw.display_name ?? raw.displayName ?? raw.name;
    if (typeof displayNameRaw !== "string" || !displayNameRaw.trim()) return null;
    const display_name = displayNameRaw.trim().slice(0, FIELD_LIMITS.display_name.max);

    const genderRaw = raw.gender;
    const gender = GENDER_OPTIONS.includes(genderRaw as Gender) ? (genderRaw as Gender) : "male";

    const ageRaw = raw.age;
    const ageParsed = typeof ageRaw === "number" ? ageRaw : Number.parseInt(String(ageRaw ?? ""), 10);
    const age = Math.min(FIELD_LIMITS.age.max, Math.max(FIELD_LIMITS.age.min, Number.isFinite(ageParsed) ? ageParsed : 25));

    const mbtiRaw = raw.mbti;
    const mbti = typeof mbtiRaw === "string" && MBTI_OPTIONS.includes(mbtiRaw.toUpperCase() as (typeof MBTI_OPTIONS)[number])
      ? mbtiRaw.toUpperCase()
      : "";

    const basicInfoRaw = raw.basic_info ?? raw.basicInfo;
    const basic_info = typeof basicInfoRaw === "string"
      ? basicInfoRaw.trim().slice(0, FIELD_LIMITS.basic_info.max)
      : "";

    const styleLabelRaw = raw.style_label ?? raw.styleLabel;
    const style_label = typeof styleLabelRaw === "string"
      ? styleLabelRaw.trim().slice(0, FIELD_LIMITS.style_label.max)
      : "";

    const avatarSeedRaw = raw.avatar_seed ?? raw.avatarSeed;
    const avatar_seed = typeof avatarSeedRaw === "string" && avatarSeedRaw.trim()
      ? avatarSeedRaw.trim()
      : `custom-import-${Date.now()}-${index}`;

    return {
      display_name,
      gender,
      age,
      mbti,
      basic_info,
      style_label,
      avatar_seed,
    };
  }, []);

  const parseImportText = useCallback((rawText: string): CustomCharacterInput[] | null => {
    const text = String(rawText ?? "").trim();
    if (!text) return null;
    const parsed = JSON.parse(text) as unknown;
    const list = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray((parsed as { characters?: unknown[] }).characters)
        ? (parsed as { characters?: unknown[] }).characters
        : parsed && typeof parsed === "object"
          ? [parsed]
          : null;
    if (!list) return null;

    return list
      .map((item, idx) => (item && typeof item === "object" ? normalizeImportedCharacter(item as Record<string, unknown>, idx) : null))
      .filter((item): item is CustomCharacterInput => !!item);
  }, [normalizeImportedCharacter]);

  const handleImportSubmit = useCallback(async () => {
    if (remainingSlots <= 0) {
      toast.error(t("customCharacter.limitReached"));
      return;
    }

    setIsImporting(true);
    try {
      const normalized = parseImportText(importText);
      if (!normalized || normalized.length === 0) {
        toast.error(t("customCharacter.errors.importInvalid"));
        return;
      }

      const maxToImport = Math.min(remainingSlots, normalized.length);
      let imported = 0;
      for (const input of normalized.slice(0, maxToImport)) {
        const result = await onCreateCharacter(input);
        if (result) imported += 1;
      }

      const skipped = normalized.length - imported;
      if (imported > 0 && skipped === 0) {
        toast.success(t("customCharacter.toast.importSuccess", { count: imported }));
      } else if (imported > 0) {
        toast.success(t("customCharacter.toast.importPartial", { imported, skipped }));
      } else {
        toast.error(t("customCharacter.toast.importFailed"));
      }

      if (imported > 0) {
        setImportText("");
        setIsImportOpen(false);
      }
    } catch {
      toast.error(t("customCharacter.toast.importFailed"));
    } finally {
      setIsImporting(false);
    }
  }, [importText, onCreateCharacter, parseImportText, remainingSlots, t]);

  const defaultAiPromptText = useMemo(() => {
    // Note: Keep prompt plain text so users can copy/paste into any LLM.
    return [
      "请帮我生成一个“自定义角色”的 JSON 对象（只生成 1 个对象，不要数组）。",
      "",
      "要求：",
      "- 输出必须是严格 JSON（不要 Markdown 代码块，不要解释文字）。",
      "- 只输出一个 JSON 对象，不要包在数组里。",
      "- 字段：",
      "  - display_name: string（1-20 字）",
      "  - gender: \"male\" | \"female\" | \"nonbinary\"",
      "  - age: number（16-70）",
      "  - mbti: string（可为空，或 4 位大写，例如 \"INTJ\"）",
      "  - basic_info: string（可为空，<=200 字，适合狼人杀对局身份/背景）",
      "  - style_label: string（可为空，<=50 字，用于说话风格/口吻，例如“冷静、短句、少废话”）",
      "  - avatar_seed: string（可为空；如不填我会自动生成）",
      "",
      "补充要求：这个角色要适合狼人杀对局发言（会分析、会站边、会投票），不要太中二。",
      "",
      "可选偏好（你可以自由发挥）：",
      "- 我希望角色偏好/关键词：{在这里写你想要的风格，比如：理性、强势归票、幽默但不油腻}",
      "- 我希望角色背景：{比如：产品经理/律师/老师/社恐程序员等}",
      "",
      "现在请直接输出 1 个 JSON 对象。",
    ].join("\n");
  }, []);

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[94vw] max-w-4xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            {view !== "list" && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleBack}
                className="h-8 w-8 p-0"
              >
                <ArrowLeft size={18} />
              </Button>
            )}

            <DialogTitle className="font-serif text-[var(--text-primary)] flex items-center gap-2">
              {view === "list" && <User size={18} weight="duotone" />}
              {view === "list"
                ? t("customCharacter.title")
                : view === "create"
                  ? t("customCharacter.createTitle")
                  : t("customCharacter.editTitle")}
            </DialogTitle>

            {view === "list" && (
              <div className="flex items-center gap-2 ml-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsImportOpen(true)}
                  disabled={loading || isImporting || remainingSlots <= 0}
                  className="text-xs"
                >
                  {t("customCharacter.actions.import")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAiHelpOpen(true)}
                  className="text-xs"
                >
                  {t("customCharacter.actions.aiPrompt")}
                </Button>
              </div>
            )}
          </div>

          <DialogDescription className="text-[var(--text-muted)]">
            {view === "list"
              ? t("customCharacter.description", { count: characters.length, max: MAX_CUSTOM_CHARACTERS })
              : view === "create"
                ? t("customCharacter.createDescription")
                : t("customCharacter.editDescription")}
          </DialogDescription>
        </DialogHeader>

        {view === "list" ? (
          <div className="space-y-4">
            {/* Selection hint */}
            {characters.length > 0 && (
              <div className="text-xs text-[var(--text-muted)] text-center">
                {t("customCharacter.selectionHint", { count: selectedIds.size })}
              </div>
            )}

            <div className="flex flex-wrap gap-2 max-h-[45vh] overflow-y-auto p-1">
              {characters.map((char) => {
                const isSelected = selectedIds.has(char.id);
                return (
                  <div
                    key={char.id}
                    className={`relative w-[110px] flex flex-col items-center p-2 rounded-lg border-2 transition-all cursor-pointer group ${
                      isSelected
                        ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10"
                        : "border-[var(--border-color)] bg-[var(--bg-card)] hover:border-[var(--text-muted)]"
                    }`}
                    onClick={() => toggleSelection(char.id)}
                  >
                    {/* Selection checkbox */}
                    <div className={`absolute top-1 left-1 w-4 h-4 rounded border-2 flex items-center justify-center text-xs ${
                      isSelected
                        ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-white"
                        : "border-[var(--border-color)] bg-[var(--bg-card)]"
                    }`}>
                      {isSelected && "✓"}
                    </div>

                    {/* Action buttons */}
                    <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleEdit(char); }}
                        className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); void handleDelete(char.id); }}
                        className="p-1 rounded hover:bg-red-50 text-[var(--text-muted)] hover:text-red-500"
                        disabled={loading}
                      >
                        <Trash size={12} />
                      </button>
                    </div>

                    {/* Avatar */}
                    <img
                      src={buildAvatarUrl({ seed: char.avatar_seed || char.display_name, gender: char.gender })}
                      alt={char.display_name}
                      className={`w-12 h-12 rounded-full border-2 mt-2 ${
                        isSelected ? "border-[var(--color-accent)]" : "border-[var(--border-color)]"
                      }`}
                    />

                    {/* Name */}
                    <div className="mt-1 text-xs font-medium text-[var(--text-primary)] truncate w-full text-center">
                      {char.display_name}
                    </div>

                    {/* Info: style or MBTI */}
                    <div className="text-[10px] text-[var(--text-muted)] truncate w-full text-center">
                      {char.style_label || char.mbti || t("customCharacter.noInfo")}
                    </div>

                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setDetailCharacter(char); }}
                      className="mt-2 w-full h-8 rounded-md border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[11px] font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Eye size={14} />
                      {t("customCharacter.actions.viewDetail")}
                    </button>
                  </div>
                );
              })}

              {/* Add new character card */}
              {canAddMore && (
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={loading}
                  className="w-[110px] flex flex-col items-center justify-center p-2 rounded-lg border-2 border-dashed border-[var(--border-color)] bg-transparent hover:border-[var(--color-accent)] hover:bg-[var(--color-accent)]/5 transition-all cursor-pointer min-h-[100px]"
                >
                  <Plus size={24} className="text-[var(--text-muted)]" />
                  <div className="mt-1 text-xs text-[var(--text-muted)]">
                    {t("customCharacter.addNew")}
                  </div>
                </button>
              )}
            </div>

            {characters.length === 0 && (
              <div className="text-center py-4 text-[var(--text-muted)] text-sm">
                {t("customCharacter.emptyState")}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Avatar Preview */}
            <div className="flex flex-col items-center gap-2">
              <img
                src={avatarUrl}
                alt="Avatar preview"
                className="w-20 h-20 rounded-full border-2 border-[var(--border-color)]"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={randomizeSeed}
                className="gap-1 text-xs"
              >
                <Shuffle size={14} />
                {t("customCharacter.randomizeAvatar")}
              </Button>
            </div>

            {/* Form Fields */}
            <div className="space-y-4">
              {/* Display Name */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
                  {t("customCharacter.fields.displayName")} *
                </label>
                <input
                  type="text"
                  value={formData.display_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, display_name: e.target.value }))}
                  maxLength={FIELD_LIMITS.display_name.max}
                  placeholder={t("customCharacter.placeholders.displayName")}
                  className="w-full px-3 py-2 rounded-md border-2 border-[var(--border-color)] bg-[var(--bg-card)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--color-accent)]"
                />
              </div>

              {/* Gender */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
                  {t("customCharacter.fields.gender")}
                </label>
                <div className="flex gap-2">
                  {GENDER_OPTIONS.map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, gender: g }))}
                      className={`flex-1 px-3 py-2 rounded-md border-2 text-sm transition-colors ${
                        formData.gender === g
                          ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                          : "border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:border-[var(--text-muted)]"
                      }`}
                    >
                      {genderLabels[g]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Age */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
                  {t("customCharacter.fields.age")}
                </label>
                <input
                  type="number"
                  value={formData.age}
                  onChange={(e) => setFormData(prev => ({ 
                    ...prev, 
                    age: Math.min(FIELD_LIMITS.age.max, Math.max(FIELD_LIMITS.age.min, parseInt(e.target.value) || FIELD_LIMITS.age.min))
                  }))}
                  min={FIELD_LIMITS.age.min}
                  max={FIELD_LIMITS.age.max}
                  className="w-full px-3 py-2 rounded-md border-2 border-[var(--border-color)] bg-[var(--bg-card)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--color-accent)]"
                />
              </div>

              {/* MBTI */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
                  MBTI
                </label>
                <select
                  value={formData.mbti}
                  onChange={(e) => setFormData(prev => ({ ...prev, mbti: e.target.value }))}
                  className="w-full px-3 py-2 rounded-md border-2 border-[var(--border-color)] bg-[var(--bg-card)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--color-accent)]"
                >
                  {MBTI_OPTIONS.map((m) => (
                    <option key={m || "none"} value={m}>{m || t("customCharacter.mbtiNotSet")}</option>
                  ))}
                </select>
              </div>

              {/* Basic Info */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
                  {t("customCharacter.fields.basicInfo")}
                </label>
                <textarea
                  value={formData.basic_info}
                  onChange={(e) => setFormData(prev => ({ ...prev, basic_info: e.target.value }))}
                  maxLength={FIELD_LIMITS.basic_info.max}
                  placeholder={t("customCharacter.placeholders.basicInfo")}
                  rows={2}
                  className="w-full px-3 py-2 rounded-md border-2 border-[var(--border-color)] bg-[var(--bg-card)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--color-accent)] resize-none"
                />
                <div className="text-xs text-[var(--text-muted)] text-right mt-1">
                  {formData.basic_info?.length || 0}/{FIELD_LIMITS.basic_info.max}
                </div>
              </div>

              {/* Style Label */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
                  {t("customCharacter.fields.styleLabel")}
                </label>
                <input
                  type="text"
                  value={formData.style_label}
                  onChange={(e) => setFormData(prev => ({ ...prev, style_label: e.target.value }))}
                  maxLength={FIELD_LIMITS.style_label.max}
                  placeholder={t("customCharacter.placeholders.styleLabel")}
                  className="w-full px-3 py-2 rounded-md border-2 border-[var(--border-color)] bg-[var(--bg-card)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--color-accent)]"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" onClick={handleBack} className="flex-1">
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={loading || !formData.display_name.trim()}
                className="flex-1"
              >
                {loading ? t("customCharacter.actions.saving") : t("common.confirm")}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>

    {/* Import Dialog (paste JSON) */}
    <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
      <DialogContent className="w-[92vw] max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif flex items-center gap-2">
            <ClipboardText size={18} weight="duotone" />
            {t("customCharacter.import.title")}
          </DialogTitle>
          <DialogDescription>{t("customCharacter.import.description")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder={t.raw("customCharacter.import.placeholder")}
            rows={10}
            className="w-full px-3 py-2 rounded-md border-2 border-[var(--border-color)] bg-[var(--bg-card)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--color-accent)] resize-y font-mono"
          />
          <div className="text-xs text-[var(--text-muted)]">
            {t("customCharacter.import.hint", { count: remainingSlots })}
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => setIsImportOpen(false)} className="flex-1">
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            onClick={() => void handleImportSubmit()}
            disabled={isImporting || !importText.trim() || remainingSlots <= 0}
            className="flex-1"
          >
            {isImporting ? t("customCharacter.actions.saving") : t("customCharacter.import.confirm")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    {/* AI Prompt Dialog */}
    <Dialog open={isAiHelpOpen} onOpenChange={setIsAiHelpOpen}>
      <DialogContent className="w-[92vw] max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif flex items-center gap-2">
            <Sparkle size={18} weight="duotone" />
            {t("customCharacter.aiPrompt.title")}
          </DialogTitle>
          <DialogDescription>{t("customCharacter.aiPrompt.description")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <textarea
            value={aiPromptDraft || defaultAiPromptText}
            onChange={(e) => setAiPromptDraft(e.target.value)}
            rows={12}
            className="w-full px-3 py-2 rounded-md border-2 border-[var(--border-color)] bg-[var(--bg-card)] text-sm text-[var(--text-primary)] focus:outline-none resize-y font-mono"
          />
          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              const text = aiPromptDraft || defaultAiPromptText;
              const ok = await copyToClipboard(text);
              if (ok) toast.success(t("customCharacter.toast.copied"));
              else toast.error(t("customCharacter.toast.copyFailed"));
            }}
            className="w-full"
          >
            {t("customCharacter.aiPrompt.copy")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    {/* Detail Dialog */}
    <Dialog open={detailCharacter !== null} onOpenChange={(o) => { if (!o) setDetailCharacter(null); }}>
      <DialogContent className="w-[92vw] max-w-lg max-h-[85vh] overflow-y-auto">
        {detailCharacter ? (
          <>
            <DialogHeader>
              <DialogTitle className="font-serif flex items-center gap-2">
                <Eye size={18} weight="duotone" />
                {t("customCharacter.detail.title")}
              </DialogTitle>
              <DialogDescription>{t("customCharacter.detail.description")}</DialogDescription>
            </DialogHeader>

            <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
              <div className="flex items-center gap-3">
                <img
                  src={buildAvatarUrl({ seed: detailCharacter.avatar_seed || detailCharacter.display_name, gender: detailCharacter.gender })}
                  alt={detailCharacter.display_name}
                  className="w-14 h-14 rounded-full border-2 border-[var(--border-color)]"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-base font-semibold text-[var(--text-primary)] truncate">
                    {detailCharacter.display_name}
                  </div>
                  <div className="text-xs text-[var(--text-muted)] truncate">
                    {(detailCharacter.style_label || detailCharacter.mbti || t("customCharacter.noInfo"))}
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-2">
                  <div className="text-[11px] text-[var(--text-muted)]">{t("customCharacter.fields.gender")}</div>
                  <div className="font-medium text-[var(--text-primary)]">{genderLabels[detailCharacter.gender]}</div>
                </div>
                <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-2">
                  <div className="text-[11px] text-[var(--text-muted)]">{t("customCharacter.fields.age")}</div>
                  <div className="font-medium text-[var(--text-primary)]">{detailCharacter.age}</div>
                </div>
                <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-2">
                  <div className="text-[11px] text-[var(--text-muted)]">MBTI</div>
                  <div className="font-medium text-[var(--text-primary)]">{detailCharacter.mbti || t("customCharacter.mbtiNotSet")}</div>
                </div>
                <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-2">
                  <div className="text-[11px] text-[var(--text-muted)]">{t("customCharacter.fields.styleLabel")}</div>
                  <div className="font-medium text-[var(--text-primary)] truncate">{detailCharacter.style_label || t("customCharacter.noInfo")}</div>
                </div>
              </div>

              <div className="mt-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-2">
                <div className="text-[11px] text-[var(--text-muted)]">{t("customCharacter.fields.basicInfo")}</div>
                <div className="text-sm text-[var(--text-primary)] whitespace-pre-wrap break-words">
                  {detailCharacter.basic_info?.trim() ? detailCharacter.basic_info : t("customCharacter.noInfo")}
                </div>
              </div>

              <div className="mt-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-2">
                <div className="text-[11px] text-[var(--text-muted)]">avatar_seed</div>
                <div className="text-xs text-[var(--text-primary)] break-words font-mono">
                  {detailCharacter.avatar_seed || t("customCharacter.noInfo")}
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDetailCharacter(null)}
                className="flex-1"
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                onClick={async () => {
                  const json = JSON.stringify(buildExportPayloadForCharacter(detailCharacter), null, 2);
                  const ok = await copyToClipboard(json);
                  if (ok) toast.success(t("customCharacter.toast.copied"));
                  else toast.error(t("customCharacter.toast.copyFailed"));
                }}
                className="flex-1"
              >
                {t("customCharacter.detail.copyJson")}
              </Button>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
    </>
  );
}
