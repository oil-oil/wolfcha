"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";

interface TutorialModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TutorialModal({ open, onOpenChange }: TutorialModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="wc-tutorial-modal max-w-[720px] p-0 overflow-hidden">
        <div className="px-6 pt-6 pb-4 border-b border-[var(--border-color)] bg-[var(--bg-card)]">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">新手教学：狼人杀怎么玩？</DialogTitle>
          </DialogHeader>
          <div className="mt-2 text-sm text-[var(--text-secondary)] leading-relaxed">
            这是一个“隐藏身份 + 推理 + 讲话博弈”的阵营游戏。你只需要跟随系统提示，在需要你行动或发言时做选择即可。
          </div>
        </div>

        <ScrollArea className="wc-tutorial-scroll max-h-[70vh]">
          <div className="px-6 py-5 space-y-6 bg-[var(--bg-main)]">
            <section className="space-y-2">
              <div className="text-sm font-bold text-[var(--text-primary)]">1. 阵营与胜利条件</div>
              <div className="text-sm text-[var(--text-secondary)] leading-relaxed">
                - 好人阵营：村民、预言家、女巫、猎人、守卫。目标是找出并投票放逐所有狼人。
                <br />
                - 狼人阵营：狼人。目标是让好人数量不足以继续对抗（通常是狼人数量 ≥ 存活好人数量）。
              </div>
            </section>

            <section className="space-y-2">
              <div className="text-sm font-bold text-[var(--text-primary)]">2. 游戏流程（夜晚 → 白天循环）</div>
              <div className="text-sm text-[var(--text-secondary)] leading-relaxed">
                - 夜晚：部分角色按顺序行动（守卫/狼人/女巫/预言家等）。
                <br />
                - 白天：公布昨夜结果，然后依次发言，最后投票放逐。
                <br />
                - 特殊：若猎人被放逐/死亡，可能触发“开枪带走一人”。
              </div>
            </section>

            <section className="space-y-2">
              <div className="text-sm font-bold text-[var(--text-primary)]">3. 发言与投票（新手建议）</div>
              <div className="text-sm text-[var(--text-secondary)] leading-relaxed">
                - 先听：关注每个人的发言逻辑、前后是否矛盾。
                <br />
                - 讲清楚：你为什么怀疑/相信某人（基于谁的发言、哪些细节）。
                <br />
                - 投票前复盘：谁的说法最站不住脚，谁在“带节奏”。
              </div>
            </section>

            <section className="space-y-3">
              <div className="text-sm font-bold text-[var(--text-primary)]">4. 职业说明（本局：预女猎守）</div>

              <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]/70 p-4">
                <div className="font-semibold text-[var(--text-primary)] mb-1">狼人</div>
                <div className="text-sm text-[var(--text-secondary)] leading-relaxed">
                  夜晚选择一名玩家击杀。狼人之间互为队友（夜晚可能需要协作）。白天要隐藏身份、制造混乱。
                </div>
              </div>

              <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]/70 p-4">
                <div className="font-semibold text-[var(--text-primary)] mb-1">预言家</div>
                <div className="text-sm text-[var(--text-secondary)] leading-relaxed">
                  夜晚查验一名玩家是“狼人”还是“好人”。白天通常需要用发言建立可信度，带领好人阵营。
                </div>
              </div>

              <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]/70 p-4">
                <div className="font-semibold text-[var(--text-primary)] mb-1">女巫</div>
                <div className="text-sm text-[var(--text-secondary)] leading-relaxed">
                  有解药与毒药（通常各一次）：解药可救昨夜被杀的玩家；毒药可毒杀一名玩家。注意节奏与信息量。
                </div>
              </div>

              <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]/70 p-4">
                <div className="font-semibold text-[var(--text-primary)] mb-1">猎人</div>
                <div className="text-sm text-[var(--text-secondary)] leading-relaxed">
                  若死亡/被放逐，可能获得一次开枪机会，带走一名玩家。关键在于死前给出明确的“枪口信息”。
                </div>
              </div>

              <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]/70 p-4">
                <div className="font-semibold text-[var(--text-primary)] mb-1">守卫</div>
                <div className="text-sm text-[var(--text-secondary)] leading-relaxed">
                  夜晚守护一名玩家，使其免受狼人击杀（具体规则以本局提示为准）。通常用于保护关键角色。
                </div>
              </div>

              <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]/70 p-4">
                <div className="font-semibold text-[var(--text-primary)] mb-1">村民</div>
                <div className="text-sm text-[var(--text-secondary)] leading-relaxed">
                  没有夜晚技能，但白天的发言与投票同样关键：用逻辑与信息站队，帮助找狼。
                </div>
              </div>
            </section>

            <section className="space-y-2">
              <div className="text-sm font-bold text-[var(--text-primary)]">5. 小提示</div>
              <div className="text-sm text-[var(--text-secondary)] leading-relaxed">
                - 如果你是狼人：尽量让自己像好人，制造“合理的怀疑链”，避免同一夜聊崩。
                <br />
                - 如果你是好人：少做“无根据的情绪票”，多用“可验证的信息”做推理。
              </div>
            </section>
          </div>
        </ScrollArea>

        <div className="px-6 py-4 border-t border-[var(--border-color)] bg-[var(--bg-card)] flex items-center justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            我知道了
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
