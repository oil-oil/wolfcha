"use client";

import { useEffect, useMemo, useState } from "react";
import { UserCircle, Key, SignOut, ShareNetwork, Copy, CaretDown, Check, ArrowRight, Eye, EyeSlash } from "@phosphor-icons/react";
 import {
   Dialog,
   DialogContent,
   DialogDescription,
   DialogHeader,
   DialogTitle,
 } from "@/components/ui/dialog";
 import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
 import { toast } from "sonner";
import {
  clearApiKeys,
  getDashscopeApiKey,
  getGeneratorModel,
  getMinimaxApiKey,
  getMinimaxGroupId,
  getSelectedModels,
  getSummaryModel,
  getZenmuxApiKey,
  getValidatedZenmuxKey,
  getValidatedDashscopeKey,
  setGeneratorModel,
  setMinimaxApiKey,
  setMinimaxGroupId,
  setSelectedModels,
  setSummaryModel,
  setZenmuxApiKey,
  setDashscopeApiKey,
  setCustomKeyEnabled,
  setValidatedZenmuxKey,
  setValidatedDashscopeKey,
  isCustomKeyEnabled as getCustomKeyEnabled,
} from "@/lib/api-keys";
import { getModelLogoPath } from "@/lib/model-logo";
import { ALL_MODELS, AVAILABLE_MODELS, GENERATOR_MODEL, SUMMARY_MODEL, type ModelRef } from "@/types/game";
 
 interface UserProfileModalProps {
   open: boolean;
   onOpenChange: (open: boolean) => void;
   email?: string | null;
   credits?: number | null;
   referralCode?: string | null;
   totalReferrals?: number | null;
   onChangePassword: () => void;
   onShareInvite: () => void;
  onSignOut: () => void | Promise<void>;
  onCustomKeyEnabledChange?: (value: boolean) => void;
 }
 
 export function UserProfileModal({
   open,
   onOpenChange,
   email,
   credits,
   referralCode,
   totalReferrals,
   onChangePassword,
   onShareInvite,
   onSignOut,
  onCustomKeyEnabledChange,
 }: UserProfileModalProps) {
  const [zenmuxKey, setZenmuxKeyState] = useState("");
  const [dashscopeKey, setDashscopeKeyState] = useState("");
  const [minimaxKey, setMinimaxKeyState] = useState("");
  const [minimaxGroupId, setMinimaxGroupIdState] = useState("");
  const [showZenmuxKey, setShowZenmuxKey] = useState(false);
  const [showDashscopeKey, setShowDashscopeKey] = useState(false);
  const [showMinimaxKey, setShowMinimaxKey] = useState(false);
  const [showMinimaxGroupId, setShowMinimaxGroupId] = useState(false);
  const [isCustomKeyEnabled, setIsCustomKeyEnabled] = useState(false);
  const [selectedModels, setSelectedModelsState] = useState<string[]>([]);
  const [generatorModel, setGeneratorModelState] = useState("");
  const [summaryModel, setSummaryModelState] = useState("");
  const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);
  const [isValidatingZenmux, setIsValidatingZenmux] = useState(false);
  const [isValidatingDashscope, setIsValidatingDashscope] = useState(false);
  const [validatedKeys, setValidatedKeys] = useState<{ zenmux: string; dashscope: string }>({
    zenmux: "",
    dashscope: "",
  });

   const displayCredits = useMemo(() => {
     if (credits === null || credits === undefined) return "—";
     return `${credits}`;
   }, [credits]);
 
  useEffect(() => {
    if (!open) return;
    let mounted = true;
    const nextZenmuxKey = getZenmuxApiKey();
    const nextDashscopeKey = getDashscopeApiKey();
    const nextMinimaxKey = getMinimaxApiKey();
    const nextMinimaxGroupId = getMinimaxGroupId();
    const nextSelectedModels = getSelectedModels();
    const nextGeneratorModel = getGeneratorModel();
    const nextSummaryModel = getSummaryModel();
    const storedCustomEnabled = getCustomKeyEnabled();
    if (mounted) {
      setZenmuxKeyState(nextZenmuxKey);
      setDashscopeKeyState(nextDashscopeKey);
      setMinimaxKeyState(nextMinimaxKey);
      setMinimaxGroupIdState(nextMinimaxGroupId);
      setSelectedModelsState(nextSelectedModels);
      setGeneratorModelState(nextGeneratorModel);
      setSummaryModelState(nextSummaryModel);
      setIsCustomKeyEnabled(storedCustomEnabled);
      const z = nextZenmuxKey;
      const d = nextDashscopeKey;
      setValidatedKeys({
        zenmux: z && getValidatedZenmuxKey() === z ? z : "",
        dashscope: d && getValidatedDashscopeKey() === d ? d : "",
      });
    }
    return () => {
      mounted = false;
    };
  }, [open]);

  const zenmuxConfigured = Boolean(zenmuxKey.trim());
  const dashscopeConfigured = Boolean(dashscopeKey.trim());
  const modelPool = useMemo(() => {
    return ALL_MODELS;
  }, []);
  const defaultModelPool = useMemo(() => {
    return AVAILABLE_MODELS;
  }, []);
  const availableModelPool = useMemo(() => {
    const providers = new Set<ModelRef["provider"]>();
    if (zenmuxConfigured) providers.add("zenmux");
    if (dashscopeConfigured) providers.add("dashscope");
    if (providers.size === 0) return [];
    return modelPool.filter((ref) => providers.has(ref.provider));
  }, [dashscopeConfigured, modelPool, zenmuxConfigured]);
  const defaultAvailableModels = useMemo(() => {
    const providers = new Set<ModelRef["provider"]>();
    if (zenmuxConfigured) providers.add("zenmux");
    if (dashscopeConfigured) providers.add("dashscope");
    if (providers.size === 0) return [];
    return defaultModelPool.filter((ref) => providers.has(ref.provider));
  }, [dashscopeConfigured, defaultModelPool, zenmuxConfigured]);

  useEffect(() => {
    if (!isCustomKeyEnabled) return;
    const availableSet = new Set(availableModelPool.map((ref) => ref.model));
    setSelectedModelsState((prev) => {
      const filtered = prev.filter((m) => availableSet.has(m));
      if (filtered.length > 0) return filtered;
      return defaultAvailableModels.map((ref) => ref.model).filter((m) => availableSet.has(m));
    });
    setGeneratorModelState((prev) => {
      if (prev && availableSet.has(prev)) return prev;
      if (availableSet.has(GENERATOR_MODEL)) return GENERATOR_MODEL;
      return availableModelPool[0]?.model ?? "";
    });
    setSummaryModelState((prev) => {
      if (prev && availableSet.has(prev)) return prev;
      if (availableSet.has(SUMMARY_MODEL)) return SUMMARY_MODEL;
      return availableModelPool[0]?.model ?? "";
    });
  }, [availableModelPool, defaultAvailableModels, isCustomKeyEnabled]);

  const selectedModelSummary = useMemo(() => {
    if (selectedModels.length === 0) return "选择模型";
    const preview = selectedModels.slice(0, 2).join("、");
    if (selectedModels.length <= 2) return preview;
    return `${preview} 等 ${selectedModels.length} 个`;
  }, [selectedModels]);

  // Close model selector when modal closes
  useEffect(() => {
    if (!open) setIsModelSelectorOpen(false);
  }, [open]);

   const handleCopyReferral = async () => {
     if (!referralCode) return;
     try {
       await navigator.clipboard.writeText(referralCode);
       toast("邀请码已复制");
     } catch {
       toast("复制失败", { description: "当前环境不支持剪贴板或权限被拒绝" });
     }
   };
 
  const handleSignOut = async () => {
    try {
      await onSignOut();
    } finally {
      onOpenChange(false);
    }
  };

  const handleSaveKeys = () => {
    if (isCustomKeyEnabled) {
      const zenmuxOk = !zenmuxKey.trim() || validatedKeys.zenmux === zenmuxKey.trim();
      const dashscopeOk = !dashscopeKey.trim() || validatedKeys.dashscope === dashscopeKey.trim();
      if (!zenmuxOk || !dashscopeOk) {
        toast("未通过验证，无法保存", { description: "请先点击“验证配置”" });
        return;
      }
    }
    const availableSet = new Set(availableModelPool.map((ref) => ref.model));
    if (isCustomKeyEnabled && availableSet.size === 0) {
      // Prevent saving an unusable custom-key state with no LLM keys.
      toast("请至少配置一个 LLM Key", { description: "Zenmux 或百炼二选一即可" });
      return;
    }
    const nextSelectedModels = selectedModels.filter((m) => availableSet.has(m));
    const fallbackGenerator = availableSet.has(GENERATOR_MODEL)
      ? GENERATOR_MODEL
      : availableModelPool[0]?.model ?? "";
    const fallbackSummary = availableSet.has(SUMMARY_MODEL)
      ? SUMMARY_MODEL
      : availableModelPool[0]?.model ?? "";
    const nextGeneratorModel = availableSet.has(generatorModel) ? generatorModel : fallbackGenerator;
    const nextSummaryModel = availableSet.has(summaryModel) ? summaryModel : fallbackSummary;
    const removedSelected = selectedModels.filter((m) => !availableSet.has(m));
    const generatorAdjusted = Boolean(generatorModel) && !availableSet.has(generatorModel);
    const summaryAdjusted = Boolean(summaryModel) && !availableSet.has(summaryModel);

    if (
      isCustomKeyEnabled &&
      (availableSet.size === 0 || removedSelected.length > 0 || generatorAdjusted || summaryAdjusted)
    ) {
      toast("部分模型不可用，已自动调整", {
        description: "请检查所选模型与已配置的 Key 是否匹配",
      });
    }
    setZenmuxApiKey(zenmuxKey);
    setDashscopeApiKey(dashscopeKey);
    setMinimaxApiKey(minimaxKey);
    setMinimaxGroupId(minimaxGroupId);
    setSelectedModels(nextSelectedModels);
    setGeneratorModel(nextGeneratorModel);
    setSummaryModel(nextSummaryModel);
    setSelectedModelsState(nextSelectedModels);
    setGeneratorModelState(nextGeneratorModel);
    setSummaryModelState(nextSummaryModel);
    toast("已保存 API Key", { description: "仅保存在当前浏览器" });
    onOpenChange(false);
  };

  const validateProviderKey = async (options: {
    provider: "zenmux" | "dashscope";
    key: string;
    model: string;
  }) => {
    const { provider, key, model } = options;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (provider === "zenmux") {
      headers["X-Zenmux-Api-Key"] = key;
    } else {
      headers["X-Dashscope-Api-Key"] = key;
    }

    const response = await fetch("/api/chat", {
      method: "POST",
      headers,
      body: JSON.stringify({
        provider,
        model,
        messages: [{ role: "user", content: "ping" }],
        temperature: 0,
        max_tokens: 1,
      }),
    });

    if (!response.ok) {
      let detail = "";
      try {
        const data = await response.json();
        detail = typeof data?.error === "string" ? data.error : JSON.stringify(data);
      } catch {
        detail = await response.text();
      }
      throw new Error(detail || "验证失败");
    }
  };

  const handleValidateZenmux = async () => {
    if (isValidatingZenmux || !zenmuxKey.trim()) return;
    setIsValidatingZenmux(true);
    try {
      await validateProviderKey({
        provider: "zenmux",
        key: zenmuxKey.trim(),
        model: "google/gemini-3-flash-preview",
      });
      setValidatedKeys((prev) => ({ ...prev, zenmux: zenmuxKey.trim() }));
      setValidatedZenmuxKey(zenmuxKey.trim());
    } catch (error) {
      setValidatedKeys((prev) => ({ ...prev, zenmux: "" }));
      if (zenmuxKey.trim() === getValidatedZenmuxKey()) setValidatedZenmuxKey("");
      toast("验证失败", {
        description: "请检查当前API Key 是否填写错误或是否有充足额度。",
      });
    } finally {
      setIsValidatingZenmux(false);
    }
  };

  const handleValidateDashscope = async () => {
    if (isValidatingDashscope || !dashscopeKey.trim()) return;
    setIsValidatingDashscope(true);
    try {
      await validateProviderKey({
        provider: "dashscope",
        key: dashscopeKey.trim(),
        model: "deepseek-v3.2",
      });
      setValidatedKeys((prev) => ({ ...prev, dashscope: dashscopeKey.trim() }));
      setValidatedDashscopeKey(dashscopeKey.trim());
    } catch (error) {
      setValidatedKeys((prev) => ({ ...prev, dashscope: "" }));
      if (dashscopeKey.trim() === getValidatedDashscopeKey()) setValidatedDashscopeKey("");
      toast("验证失败", {
        description: "请检查当前API Key 是否填写错误或是否有充足额度。",
      });
    } finally {
      setIsValidatingDashscope(false);
    }
  };

  const handleClearKeys = () => {
    clearApiKeys();
    setZenmuxKeyState("");
    setDashscopeKeyState("");
    setMinimaxKeyState("");
    setMinimaxGroupIdState("");
    setSelectedModelsState([]);
    setGeneratorModelState(getGeneratorModel());
    setSummaryModelState(getSummaryModel());
    setIsCustomKeyEnabled(false);
    setValidatedKeys({ zenmux: "", dashscope: "" });
    onCustomKeyEnabledChange?.(false);
    toast("已清除 API Key");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-xl max-h-[85vh] overflow-y-auto"
        onScroll={() => { if (isModelSelectorOpen) setIsModelSelectorOpen(false); }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCircle size={20} />
            账号信息
          </DialogTitle>
          <DialogDescription>查看账号信息与账户操作</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="profile">
          <TabsList>
            <TabsTrigger value="profile">信息</TabsTrigger>
            <TabsTrigger value="custom">用我自己的 key 玩</TabsTrigger>
          </TabsList>

          <TabsContent value="profile">
                <div className="space-y-4">
                  <div className="rounded-lg border-2 border-[var(--border-color)] bg-[var(--bg-card)] p-3 space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--text-muted)]">邮箱</span>
                      <span className="text-[var(--text-primary)]">{email ?? "已登录"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--text-muted)]">剩余额度</span>
                      <span className="text-[var(--text-primary)]">{displayCredits}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--text-muted)]">邀请人数</span>
                      <span className="text-[var(--text-primary)]">{totalReferrals ?? 0}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[var(--text-muted)]">邀请码</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[var(--text-primary)]">{referralCode ?? "—"}</span>
                        {referralCode && (
                          <button
                            type="button"
                            onClick={handleCopyReferral}
                            className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                            title="复制邀请码"
                          >
                            <Copy size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Button type="button" variant="outline" onClick={onChangePassword} className="gap-2">
                      <Key size={16} />
                      修改密码
                    </Button>
                    <Button type="button" variant="outline" onClick={onShareInvite} className="gap-2">
                      <ShareNetwork size={16} />
                      分享邀请
                    </Button>
                  </div>

                  <Button type="button" variant="outline" onClick={handleSignOut} className="w-full gap-2">
                    <SignOut size={16} />
                    退出登录
                  </Button>
                </div>
              </TabsContent>

          <TabsContent value="custom">
            <div className="space-y-5">
              {/* 1. Enable custom key */}
              <section className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-medium text-[var(--text-primary)]">用我自己的 key 玩</h3>
                    <p className="text-xs text-[var(--text-muted)] mt-1">开启后填写 API Key，仅保存在本地浏览器</p>
                  </div>
                  <Switch
                    checked={isCustomKeyEnabled}
                    onCheckedChange={(value) => {
                      setIsCustomKeyEnabled(value);
                      setCustomKeyEnabled(value);
                      onCustomKeyEnabledChange?.(value);
                    }}
                  />
                </div>
              </section>

              {isCustomKeyEnabled && (
                <>
                  {/* 2. LLM Keys — at least one required */}
                  <section className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-4 space-y-4">
                    <div>
                      <h3 className="text-sm font-medium text-[var(--text-primary)]">语言模型 Key</h3>
                      <p className="text-xs text-[var(--text-muted)] mt-1">至少配置 Zenmux 或百炼其一，用于对局与人物生成</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="zenmux-key" className="text-xs">Zenmux API Key</Label>
                     
                      <div className="flex gap-2">
                        <Input
                          id="zenmux-key"
                          name="wolfcha-zenmux-api-key"
                          type={showZenmuxKey ? "text" : "password"}
                          autoComplete="new-password"
                          placeholder="请输入 Zenmux API Key"
                          value={zenmuxKey}
                          onChange={(e) => {
                            setZenmuxKeyState(e.target.value);
                            setValidatedKeys((prev) => ({ ...prev, zenmux: "" }));
                          }}
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setShowZenmuxKey((v) => !v)}
                          aria-label={showZenmuxKey ? "隐藏 Zenmux API Key" : "显示 Zenmux API Key"}
                        >
                          {showZenmuxKey ? <EyeSlash size={16} /> : <Eye size={16} />}
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={handleValidateZenmux} disabled={isValidatingZenmux || !zenmuxKey.trim() || (!!validatedKeys.zenmux && validatedKeys.zenmux === zenmuxKey.trim())}>
                          {isValidatingZenmux ? "验证中" : validatedKeys.zenmux && validatedKeys.zenmux === zenmuxKey.trim() ? <Check size={16} className="text-[var(--color-success)]" /> : "验证"}
                        </Button>
                      </div>
                      <a href="https://zenmux.ai/invite/DMMBVZ" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-md border-2 border-[var(--color-accent)] bg-[var(--color-accent-bg)] px-2.5 py-2 transition-all hover:shadow-md">
                        <img src="/sponsor/zenmux.png" alt="" className="h-6 w-6 shrink-0 rounded object-contain" />
                        <div className="min-w-0 flex-1">
                          <span className="text-xs font-medium text-[var(--text-primary)]">获取 Zenmux Key</span>
                          <span className="text-[11px] text-[var(--text-muted)] ml-1.5">支持国内外大部分模型</span>
                        </div>
                        <ArrowRight size={14} className="shrink-0 text-[var(--color-accent)]" />
                      </a>
                    </div>

                    <div className="border-t border-[var(--border-color)] pt-3 space-y-2">
                      <Label htmlFor="dashscope-key" className="text-xs">百炼 API Key</Label>
                     
                      <div className="flex gap-2">
                        <Input
                          id="dashscope-key"
                          name="wolfcha-dashscope-api-key"
                          type={showDashscopeKey ? "text" : "password"}
                          autoComplete="new-password"
                          placeholder="可选：百炼（DeepSeek / Qwen / Kimi）"
                          value={dashscopeKey}
                          onChange={(e) => {
                            setDashscopeKeyState(e.target.value);
                            setValidatedKeys((prev) => ({ ...prev, dashscope: "" }));
                          }}
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setShowDashscopeKey((v) => !v)}
                          aria-label={showDashscopeKey ? "隐藏百炼 API Key" : "显示百炼 API Key"}
                        >
                          {showDashscopeKey ? <EyeSlash size={16} /> : <Eye size={16} />}
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={handleValidateDashscope} disabled={isValidatingDashscope || !dashscopeKey.trim() || (!!validatedKeys.dashscope && validatedKeys.dashscope === dashscopeKey.trim())}>
                          {isValidatingDashscope ? "验证中" : validatedKeys.dashscope && validatedKeys.dashscope === dashscopeKey.trim() ? <Check size={16} className="text-[var(--color-success)]" /> : "验证"}
                        </Button>
                      </div>

                      <a href="https://bailian.console.aliyun.com/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-md border border-[var(--border-color)] bg-[var(--bg-secondary)] px-2.5 py-2 transition-colors hover:bg-[var(--bg-hover)]">
                        <img src="/sponsor/bailian.png" alt="" className="h-6 w-6 shrink-0 rounded object-contain" />
                        <div className="min-w-0 flex-1">
                          <span className="text-xs font-medium text-[var(--text-primary)]">获取百炼 Key</span>
                          <span className="text-[11px] text-[var(--text-muted)] ml-1.5">DeepSeek / Qwen / Kimi 等</span>
                        </div>
                        <ArrowRight size={14} className="shrink-0 text-[var(--text-muted)]" />
                      </a>
                    </div>
                  </section>

                  {/* 3. Model config — only when at least one LLM key is configured */}
                  {availableModelPool.length > 0 && (
                    <section className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-4 space-y-4">
                      <div>
                        <h3 className="text-sm font-medium text-[var(--text-primary)]">模型配置</h3>
                        <p className="text-xs text-[var(--text-muted)] mt-1">人物生成、每日总结与 AI 玩家抽选</p>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label htmlFor="generator-model" className="text-xs">人物生成模型</Label>
                          <Select
                            value={availableModelPool.some((r) => r.model === generatorModel) ? generatorModel : ""}
                            onValueChange={(v) => setGeneratorModelState(v)}
                          >
                            <SelectTrigger id="generator-model"><SelectValue placeholder="选择模型" /></SelectTrigger>
                            <SelectContent className="max-h-60">
                              {availableModelPool.map((r) => (
                                <SelectItem key={`${r.provider}:${r.model}`} value={r.model} label={r.model} description={r.provider === "zenmux" ? "Zenmux" : "百炼"} icon={getModelLogoPath(r)} />
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="summary-model" className="text-xs">每日总结模型</Label>
                          <Select
                            value={availableModelPool.some((r) => r.model === summaryModel) ? summaryModel : ""}
                            onValueChange={(v) => setSummaryModelState(v)}
                          >
                            <SelectTrigger id="summary-model"><SelectValue placeholder="选择模型" /></SelectTrigger>
                            <SelectContent className="max-h-60">
                              {availableModelPool.map((r) => (
                                <SelectItem key={`${r.provider}:${r.model}`} value={r.model} label={r.model} description={r.provider === "zenmux" ? "Zenmux" : "百炼"} icon={getModelLogoPath(r)} />
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs">AI 玩家候选</Label>
                        <p className="text-xs text-[var(--text-muted)]">从中抽取 AI 玩家，可多选</p>
                        <DropdownMenu open={isModelSelectorOpen} onOpenChange={setIsModelSelectorOpen}>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className="flex h-9 w-full items-center justify-between gap-2 rounded-md border-2 border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)] transition-colors focus-visible:outline-none focus-visible:border-[var(--color-accent)]"
                            >
                              <span className="min-w-0 truncate text-left">{selectedModelSummary}</span>
                              <CaretDown size={16} className={`shrink-0 transition-transform ${isModelSelectorOpen ? "rotate-180" : ""}`} />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
                            {availableModelPool.map((r) => (
                              <DropdownMenuCheckboxItem
                                key={`${r.provider}:${r.model}`}
                                checked={selectedModels.includes(r.model)}
                                onSelect={(e) => e.preventDefault()}
                                onCheckedChange={(checked) =>
                                  setSelectedModelsState((prev) =>
                                    checked ? [...prev, r.model] : prev.filter((m) => m !== r.model)
                                  )
                                }
                              >
                                <img src={getModelLogoPath(r)} alt="" className="h-4 w-4 shrink-0 rounded object-contain" />
                                <span className="min-w-0 flex-1 truncate text-[var(--text-primary)]">{r.model}</span>
                                <span className="shrink-0 text-xs text-[var(--text-muted)]">({r.provider === "zenmux" ? "Zenmux" : "百炼"})</span>
                              </DropdownMenuCheckboxItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </section>
                  )}

                  {/* 4. Voice — optional Minimax */}
                  <section className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-4 space-y-3">
                    <div>
                      <h3 className="text-sm font-medium text-[var(--text-primary)]">语音与音效（可选）</h3>
                      <p className="text-xs text-[var(--text-muted)] mt-1">配置 Minimax 后可启用语音播报与音效</p>
                    </div>
                    <a href="https://platform.minimaxi.com/subscribe/coding-plan?code=I6GrZd4xLt&source=link" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-md border border-[var(--border-color)] bg-[var(--bg-secondary)] px-2.5 py-2 transition-colors hover:bg-[var(--bg-hover)]">
                      <img src="/sponsor/minimax.png" alt="" className="h-6 w-6 shrink-0 rounded object-contain" />
                      <div className="min-w-0 flex-1">
                        <span className="text-xs font-medium text-[var(--text-primary)]">获取 Minimax Key</span>
                        <span className="text-[11px] text-[var(--text-muted)] ml-1.5">语音与音效</span>
                      </div>
                      <ArrowRight size={14} className="shrink-0 text-[var(--text-muted)]" />
                    </a>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="minimax-key" className="text-xs">Minimax API Key</Label>
                        <div className="flex gap-2">
                          <Input
                            id="minimax-key"
                            name="wolfcha-minimax-api-key"
                            type={showMinimaxKey ? "text" : "password"}
                            autoComplete="new-password"
                            placeholder="可选"
                            value={minimaxKey}
                            onChange={(e) => setMinimaxKeyState(e.target.value)}
                            className="flex-1"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setShowMinimaxKey((v) => !v)}
                            aria-label={showMinimaxKey ? "隐藏 Minimax API Key" : "显示 Minimax API Key"}
                          >
                            {showMinimaxKey ? <EyeSlash size={16} /> : <Eye size={16} />}
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="minimax-group" className="text-xs">Minimax Group ID</Label>
                        <div className="flex gap-2">
                          <Input
                            id="minimax-group"
                            name="wolfcha-minimax-group-id"
                            type={showMinimaxGroupId ? "text" : "password"}
                            autoComplete="new-password"
                            placeholder="可选"
                            value={minimaxGroupId}
                            onChange={(e) => setMinimaxGroupIdState(e.target.value)}
                            className="flex-1"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setShowMinimaxGroupId((v) => !v)}
                            aria-label={showMinimaxGroupId ? "隐藏 Minimax Group ID" : "显示 Minimax Group ID"}
                          >
                            {showMinimaxGroupId ? <EyeSlash size={16} /> : <Eye size={16} />}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* 5. Actions */}
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={handleClearKeys} className="flex-1">清除</Button>
                    <Button type="button" onClick={handleSaveKeys} className="flex-1">保存</Button>
                  </div>
                </>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
 }
