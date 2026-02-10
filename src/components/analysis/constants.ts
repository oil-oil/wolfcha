import type { Role } from "@/types/game";

export const ROLE_ICONS: Record<Role, string> = {
  Werewolf: "/roles/werewolf.png",
  Seer: "/roles/seer.png",
  Witch: "/roles/witch.png",
  Hunter: "/roles/hunter.png",
  Guard: "/roles/guard.png",
  Villager: "/roles/guard.png",
};

export const ROLE_NAMES: Record<Role, string> = {
  Werewolf: "狼人",
  Seer: "预言家",
  Witch: "女巫",
  Hunter: "猎人",
  Guard: "守卫",
  Villager: "平民",
};

export const ROLE_SHORT: Record<Role, string> = {
  Werewolf: "狼",
  Seer: "预",
  Witch: "巫",
  Hunter: "猎",
  Guard: "守",
  Villager: "民",
};

export const NIGHT_EVENT_LABELS: Record<string, string> = {
  kill: "击杀",
  save: "解药",
  poison: "毒药",
  check: "查验",
  guard: "守护",
};

export const NIGHT_EVENT_COLORS: Record<string, { text: string; border: string }> = {
  kill: { text: "text-[#c53030]", border: "border-[#c53030]/30" },
  save: { text: "text-[#2f855a]", border: "border-[#2f855a]/30" },
  poison: { text: "text-[#6b46c1]", border: "border-[#6b46c1]/30" },
  check: { text: "text-[#2c5282]", border: "border-[#2c5282]/30" },
  guard: { text: "text-[#d97706]", border: "border-[#d97706]/30" },
};

export const DAY_EVENT_LABELS: Record<string, string> = {
  exile: "放逐",
  badge: "警长竞选",
  hunter_shot: "猎人开枪",
};

export const TAG_ILLUSTRATIONS: Record<string, string> = {
  // 预言家
  "洞悉之眼": "/tag_photo/预言家_洞悉之眼.png",
  "初露锋芒": "/tag_photo/预言家_初露锋芒.png",
  "天妒英才": "/tag_photo/预言家_天妒英才.png",
  // 女巫
  "致命毒药": "/tag_photo/女巫_致命毒药.png",
  "妙手回春": "/tag_photo/女巫_妙手回春.png",
  "助纣为虐": "/tag_photo/女巫_助纣为虐.png",
  "误入歧途": "/tag_photo/女巫_误入歧途.png",
  "药物冲突": "/tag_photo/女巫_药物冲突.png",
  // 守卫
  "铜墙铁壁": "/tag_photo/守卫_铜墙铁壁.png",
  "坚实盾牌": "/tag_photo/守卫_坚实盾牌.png",
  "生锈盾牌": "/tag_photo/守卫_生锈盾牌.png",
  "致命守护": "/tag_photo/守卫_致命守护.png",
  // 猎人
  "一枪致命": "/tag_photo/猎人_一枪致命.png",
  "擦枪走火": "/tag_photo/猎人_擦枪走火.png",
  "仁慈之枪": "/tag_photo/猎人_仁慈之枪.png",
  // 狼人
  "孤狼啸月": "/tag_photo/狼人_孤狼啸月.png",
  "完美猎杀": "/tag_photo/狼人_完美猎杀.png",
  "演技大师": "/tag_photo/狼人_演技大师.png",
  "绝命赌徒": "/tag_photo/狼人_绝命赌徒.png",
  "绝地反击": "/tag_photo/狼人_绝地反击.png",
  "出师未捷": "/tag_photo/狼人_出师未捷.png",
  "嗜血猎手": "/tag_photo/狼人_嗜血猎手.png",
  "长夜难明": "/tag_photo/狼人_长夜难明.png",
  // 通用
  "明察秋毫": "/tag_photo/平民_明察秋毫.png",
  "随波逐流": "/tag_photo/平民_随波逐流.png",
  "全场划水": "/tag_photo/平民_全场划水.png",
  default: "/lihui/analysis_bg.png",
};

export const TAG_CONDITIONS: Record<string, string> = {
  "洞悉之眼": "作为预言家查杀两只狼或以上",
  "初露锋芒": "作为预言家查杀一只狼",
  "天妒英才": "作为预言家首夜被刀",
  "致命毒药": "作为女巫毒死狼人",
  "妙手回春": "作为女巫救对人（救了好人）",
  "助纣为虐": "作为女巫救错人（救了狼）",
  "误入歧途": "作为女巫毒错人（毒了好人）",
  "药物冲突": "同守同救导致奶穿",
  "铜墙铁壁": "作为守卫成功守卫两人或以上",
  "坚实盾牌": "作为守卫成功守卫一人",
  "生锈盾牌": "作为守卫从未成功守卫",
  "致命守护": "同守同救导致奶穿",
  "一枪致命": "作为猎人带走狼人",
  "擦枪走火": "作为猎人带走好人",
  "仁慈之枪": "作为猎人未开枪",
  "孤狼啸月": "狼队友全部出局仅自己存活获胜",
  "完美猎杀": "没有狼队友出局赢得胜利",
  "演技大师": "悍跳拿到警徽",
  "绝命赌徒": "首夜自刀骗药",
  "绝地反击": "被预言家查杀后抗推好人",
  "出师未捷": "被首验查杀",
  "嗜血猎手": "狼人阵营获胜",
  "长夜难明": "狼人阵营失败",
  "明察秋毫": "投票准确率≥50%",
  "随波逐流": "投票准确率在35%~50%之间",
  "全场划水": "投票准确率≤35%",
  "待评估": "完成一局游戏即可获得称号",
};

export const ALL_TAGS = [
  { category: "预言家", tags: ["洞悉之眼", "初露锋芒", "天妒英才"] },
  { category: "女巫", tags: ["致命毒药", "妙手回春", "助纣为虐", "误入歧途", "药物冲突"] },
  { category: "守卫", tags: ["铜墙铁壁", "坚实盾牌", "生锈盾牌", "致命守护"] },
  { category: "猎人", tags: ["一枪致命", "擦枪走火", "仁慈之枪"] },
  { category: "狼人", tags: ["孤狼啸月", "完美猎杀", "演技大师", "绝命赌徒", "绝地反击", "出师未捷", "嗜血猎手", "长夜难明"] },
  { category: "通用", tags: ["明察秋毫", "随波逐流", "全场划水", "待评估"] },
] as const;
