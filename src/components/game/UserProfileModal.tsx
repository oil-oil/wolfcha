"use client";
 
import { useEffect, useMemo, useState } from "react";
import { UserCircle, Key, SignOut, ShareNetwork, Copy } from "@phosphor-icons/react";
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
 import { toast } from "sonner";
import {
  clearApiKeys,
  getDashscopeApiKey,
  getMinimaxApiKey,
  getMinimaxGroupId,
  getSelectedModels,
  getZenmuxApiKey,
  setMinimaxApiKey,
  setMinimaxGroupId,
  setSelectedModels,
  setZenmuxApiKey,
  setDashscopeApiKey,
  setCustomKeyEnabled,
  isCustomKeyEnabled as getCustomKeyEnabled,
} from "@/lib/api-keys";
import { AVAILABLE_MODELS, type ModelRef } from "@/types/game";

// All models including commented ones from game.ts
const ALL_MODELS: ModelRef[] = [
  // Dashscope models
  { provider: "dashscope", model: "deepseek-v3.2" },
  { provider: "dashscope", model: "qwen-plus-2025-12-01" },
  { provider: "dashscope", model: "Moonshot-Kimi-K2-Instruct" },
  { provider: "dashscope", model: "qwen3-vl-235b-a22b-instruct" },
  { provider: "dashscope", model: "qwen3-max" },

  // Zenmux models (including commented ones)
  { provider: "zenmux", model: "deepseek/deepseek-v3.2" },
  { provider: "zenmux", model: "google/gemini-3-flash-preview" },
  { provider: "zenmux", model: "moonshotai/kimi-k2-0905" },
  { provider: "zenmux", model: "qwen/qwen3-max" },
  { provider: "zenmux", model: "volcengine/doubao-seed-1.8" },
  { provider: "zenmux", model: "google/gemini-2.5-flash-lite-preview-09-2025" },
  { provider: "zenmux", model: "openai/gpt-5.2-chat" },
  {provider:"zenmux",model:"anthropic/claude-haiku-4.5"},
  { provider: "zenmux", model: "anthropic/claude-sonnet-4.5" },
  {provider:"zenmux",model:"anthropic/claude-opus-4.5"},
  { provider: "zenmux", model: "x-ai/grok-4" },
  { provider: "zenmux", model: "google/gemini-3-pro-preview" },
];
 
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
  const [isCustomKeyEnabled, setIsCustomKeyEnabled] = useState(false);
  const [selectedModels, setSelectedModelsState] = useState<string[]>([]);

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
    const storedCustomEnabled = getCustomKeyEnabled();
    if (mounted) {
      setZenmuxKeyState(nextZenmuxKey);
      setDashscopeKeyState(nextDashscopeKey);
      setMinimaxKeyState(nextMinimaxKey);
      setMinimaxGroupIdState(nextMinimaxGroupId);
      setSelectedModelsState(nextSelectedModels);
      setIsCustomKeyEnabled(storedCustomEnabled);
    }
    return () => {
      mounted = false;
    };
  }, [open]);

  const zenmuxConfigured = Boolean(zenmuxKey.trim());
  const dashscopeConfigured = Boolean(dashscopeKey.trim());
  const minimaxConfigured = Boolean(minimaxKey.trim()) && Boolean(minimaxGroupId.trim());
  const modelPool = useMemo(() => {
    return ALL_MODELS;
  }, []);

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
    setZenmuxApiKey(zenmuxKey);
    setDashscopeApiKey(dashscopeKey);
    setMinimaxApiKey(minimaxKey);
    setMinimaxGroupId(minimaxGroupId);
    setSelectedModels(selectedModels);
    toast("已保存 API Key", { description: "仅保存在当前浏览器" });
  };

  const handleClearKeys = () => {
    clearApiKeys();
    setZenmuxKeyState("");
    setDashscopeKeyState("");
    setMinimaxKeyState("");
    setMinimaxGroupIdState("");
    setSelectedModelsState([]);
    setIsCustomKeyEnabled(false);
    onCustomKeyEnabledChange?.(false);
    toast("已清除 API Key");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
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
            <div className="space-y-4">

                  <div className="rounded-lg border-2 border-[var(--border-color)] bg-[var(--bg-card)] p-3 space-y-4">
                    <div className="flex items-center justify-between gap-3 rounded-md border border-[var(--border-color)] bg-[var(--bg-secondary)] p-2">
                      <div>
                        <div className="text-sm font-medium text-[var(--text-primary)]">用我自己的 key 玩</div>
                        <div className="text-xs text-[var(--text-muted)]">开启后可填写并使用自定义 key，仅保存在本地浏览器</div>
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

                    {isCustomKeyEnabled && (
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="zenmux-key" className="text-xs">Zenmux API Key</Label>
                          <Input
                            id="zenmux-key"
                            name="wolfcha-zenmux-api-key"
                            type="password"
                            autoComplete="new-password"
                            placeholder="请输入 Zenmux API Key"
                            value={zenmuxKey}
                            onChange={(e) => setZenmuxKeyState(e.target.value)}
                          />
                          <a
                            href="https://zenmux.ai/invite/DMMBVZ"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group rounded-md border-2 border-[var(--border-color)] bg-[var(--bg-secondary)] p-2 flex items-center gap-3 hover:bg-[var(--bg-hover)] transition-colors"
                          >
                            <img src="/sponsor/zenmux.png" alt="Zenmux" className="h-8 w-8 rounded-md border border-[var(--border-color)] object-contain" />
                            <div className="min-w-0">
                              <div className="text-xs font-medium text-[var(--text-primary)]">获取 Zenmux Key</div>
                              <div className="text-[11px] text-[var(--text-muted)]">模型能力支持</div>
                            </div>
                          </a>
                        </div>

                        <div className="border-t border-[var(--border-color)]"></div>

                        <div className="space-y-2">
                          <Label htmlFor="dashscope-key" className="text-xs">百炼 API Key</Label>
                          <Input
                            id="dashscope-key"
                            name="wolfcha-dashscope-api-key"
                            type="password"
                            autoComplete="new-password"
                            placeholder="可选：请输入百炼（DashScope）API Key"
                            value={dashscopeKey}
                            onChange={(e) => setDashscopeKeyState(e.target.value)}
                          />
                          <a
                            href="https://bailian.console.aliyun.com/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group rounded-md border-2 border-[var(--border-color)] bg-[var(--bg-secondary)] p-2 flex items-center gap-3 hover:bg-[var(--bg-hover)] transition-colors"
                          >
                            <div className="h-8 w-8 rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] flex items-center justify-center text-xs font-medium text-[var(--text-primary)]">
                              百炼
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-medium text-[var(--text-primary)]">获取百炼 Key</div>
                              <div className="text-[11px] text-[var(--text-muted)]">DeepSeek / Qwen / Kimi 等模型</div>
                            </div>
                          </a>
                        </div>

                        <div className="border-t border-[var(--border-color)]"></div>

                        <div className="space-y-2">
                          <Label htmlFor="minimax-key" className="text-xs">Minimax API Key</Label>
                          <Input
                            id="minimax-key"
                            name="wolfcha-minimax-api-key"
                            type="password"
                            autoComplete="new-password"
                            placeholder="可选：请输入 Minimax API Key"
                            value={minimaxKey}
                            onChange={(e) => setMinimaxKeyState(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="minimax-group" className="text-xs">Minimax Group ID</Label>
                          <Input
                            id="minimax-group"
                            name="wolfcha-minimax-group-id"
                            type="password"
                            autoComplete="new-password"
                            placeholder="可选：请输入 Minimax Group ID"
                            value={minimaxGroupId}
                            onChange={(e) => setMinimaxGroupIdState(e.target.value)}
                          />
                          <a
                            href="https://platform.minimaxi.com/subscribe/coding-plan?code=I6GrZd4xLt&source=link"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group rounded-md border-2 border-[var(--border-color)] bg-[var(--bg-secondary)] p-2 flex items-center gap-3 hover:bg-[var(--bg-hover)] transition-colors"
                          >
                            <img src="/sponsor/minimax.png" alt="Minimax" className="h-8 w-8 rounded-md border border-[var(--border-color)] object-contain" />
                            <div className="min-w-0">
                              <div className="text-xs font-medium text-[var(--text-primary)]">获取 Minimax Key</div>
                              <div className="text-[11px] text-[var(--text-muted)]">语音与音效</div>
                            </div>
                          </a>
                        </div>

                        <div className="border-t border-[var(--border-color)]"></div>

                        <div className="space-y-2">
                          <div className="text-sm font-medium text-[var(--text-primary)]">可选模型</div>
                          <div className="text-xs text-[var(--text-muted)]">
                            选择后将从这些模型中抽取 AI 玩家。需要配置对应提供商的 Key 才能使用。
                          </div>
                          <div className="space-y-2 rounded-md border border-[var(--border-color)] bg-[var(--bg-secondary)] p-3 max-h-60 overflow-y-auto">
                            {modelPool.map((ref) => {
                              const selected = selectedModels.includes(ref.model);
                              const checkboxId = `model-${ref.provider}-${ref.model}`;
                              const isProviderConfigured =
                                (ref.provider === "zenmux" && zenmuxConfigured) ||
                                (ref.provider === "dashscope" && dashscopeConfigured);
                              const isDisabled = !isProviderConfigured;
                              return (
                                <div key={`${ref.provider}:${ref.model}`} className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    id={checkboxId}
                                    checked={selected}
                                    disabled={isDisabled}
                                    onChange={() => {
                                      if (isDisabled) return;
                                      setSelectedModelsState((prev) => {
                                        if (prev.includes(ref.model)) {
                                          return prev.filter((m) => m !== ref.model);
                                        }
                                        return [...prev, ref.model];
                                      });
                                    }}
                                    className="h-4 w-4 rounded border-[var(--border-color)] text-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)] focus:ring-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
                                  />
                                  <Label
                                    htmlFor={checkboxId}
                                    className={`text-sm cursor-pointer flex-1 ${
                                      isDisabled
                                        ? "text-[var(--text-muted)] cursor-not-allowed"
                                        : "text-[var(--text-primary)]"
                                    }`}
                                  >
                                    {ref.model}
                                    {isDisabled && (
                                      <span className="ml-2 text-xs text-[var(--text-muted)]">
                                        ({ref.provider === "zenmux" ? "需配置 Zenmux Key" : "需配置百炼 Key"})
                                      </span>
                                    )}
                                  </Label>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <Button type="button" variant="outline" onClick={handleClearKeys} className="flex-1">
                            清除
                          </Button>
                          <Button type="button" onClick={handleSaveKeys} className="flex-1">
                            保存
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
 }
