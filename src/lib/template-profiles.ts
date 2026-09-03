import type { GameScenario } from "@/types/game";

/**
 * 角色基础档案本地模板库。
 *
 * 进场提速的关键：基础档案（姓名/性别/年龄/MBTI/一句话背景）由本地模板
 * 确定性生成，不再消耗一次 LLM 生成调用。模板从各场景 rolesHint 演化而来，
 * 数量足够覆盖 6-12 人，且保证姓名唯一。
 */

export interface BaseProfile {
  displayName: string;
  gender: "male" | "female" | "nonbinary";
  age: number;
  mbti: string;
  basicInfo: string;
}

interface TemplatePerson {
  name: string;
  gender: "male" | "female" | "nonbinary";
  age: number;
  mbti: string;
  info: string;
}

const NB: "nonbinary" = "nonbinary";

const COMMON_TEMPLATES: TemplatePerson[] = [
  { name: "张建国", gender: "male", age: 55, mbti: "ISTJ", info: "在小区的退休老干部，爱组织棋牌室活动" },
  { name: "刘芳", gender: "female", age: 48, mbti: "ISFJ", info: "退休的幼儿园老师，细心体贴" },
  { name: "李梅", gender: "female", age: 35, mbti: "ENFP", info: "带娃的宝妈，全职在家照顾家庭" },
  { name: "王磊", gender: "male", age: 35, mbti: "ISTP", info: "物业公司经理，八面玲珑但话不多" },
  { name: "陈悦", gender: "female", age: 26, mbti: "INFJ", info: "街道办工作的年轻女孩" },
  { name: "吴哥", gender: "male", age: 42, mbti: "ESTJ", info: "小区门口水果店老板，嗓门大热心肠" },
  { name: "周婷", gender: "female", age: 31, mbti: "ESFP", info: "专打物业纠纷的律师，能说会道" },
  { name: "赵阳", gender: "male", age: 22, mbti: "ENTP", info: "互联网公司运营，刚毕业两年" },
  { name: "孙丽", gender: "female", age: 29, mbti: "ENTJ", info: "社区来来往往的接待委员，爱张罗" },
  { name: "何军", gender: "male", age: 47, mbti: "ISFP", info: "小区保安队长，踏实寡言" },
  { name: "郑晓", gender: "female", age: 24, mbti: "INFP", info: "刚毕业的职场新人，敏感但善良" },
  { name: "钱峰", gender: "male", age: 33, mbti: "INTJ", info: "电商公司的运营专员，逻辑性强" },
];

const SCENARIO_ROLE_HINTS: Record<string, string[]> = {
  high_school_reunion: ["班级里爱出风头的", "当年低调的学霸", "混得风生水起的生意人", "一直单身的老实人", "早早就结婚的班花"],
  family_dinner: ["爱说话的亲戚", "饭桌上不喝酒的长辈", "总催婚的姑姑", "默默干活的小辈", "话不多但毒舌的舅妈"],
  wedding_banquet: ["新人的发小", "双方都认识的伴郎", "爱张罗的婚礼主家", "来凑热闹的表亲"],
  community_committee: ["热心业主代表", "物业经理", "爱录音的老大爷", "带娃的宝妈", "刚搬来的新业主"],
  tech_startup: ["创业公司 CEO", "技术总监", "运维工程师", "产品经理", "市场部负责人"],
};

function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** 确定性生成 count 个基础档案（性别、年龄、MBTI 交错分布），姓名保证唯一。 */
export function buildTemplateBaseProfiles(count: number, scenario?: GameScenario): BaseProfile[] {
  const templates = [...COMMON_TEMPLATES];
  // 用场景 id 做哈希选取偏移，保证不同场景随机但同场景可复现
  const seed = hashString(scenario?.id ?? "default");
  const ordered = [...templates];
  for (let i = ordered.length - 1; i > 0; i--) {
    const j = hashString(`${seed}:${i}`) % (i + 1);
    [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
  }
  const picked = ordered.slice(0, count);
  return picked.map((p, i) => ({
    displayName: p.name,
    gender: p.gender,
    age: p.age,
    mbti: p.mbti,
    basicInfo: `${p.info}，${SCENARIO_ROLE_HINTS[scenario?.id ?? ""]?.[i % 5] ?? "普通住家居民"}`,
  }));
}
