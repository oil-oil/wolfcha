import type { GameScenario } from "@/types/game";
import { getI18n } from "@/i18n/translator";

/**
 * 简化版场景列表
 * - 移除复杂的角色背景设定
 * - 简化人物关联描述
 * - 保持场景多样性和随机性
 * - 角色提示更简洁，让 AI 自由发挥
 */
export const SCENARIOS: GameScenario[] = [
  // ========== 日常生活类（容易理解）==========
  {
    id: "high_school_reunion",
    title: "同学聚会",
    description: "十年后的同学聚会，老同学们重逢。有人混得好，有人不如意，往事和现实交织。",
    rolesHint: "角色类型：班长、学霸、班花/班草、老实人、社牛。对话风格：生活化、怀旧、偶尔攀比。",
  },
  {
    id: "family_dinner",
    title: "年夜饭",
    description: "一大家子围坐年夜饭，表面和气，但总有些话题容易擦枪走火。",
    rolesHint: "角色类型：长辈、晚辈、亲戚、配偶。对话风格：家常、关心中带刺、爱劝和。",
  },
  {
    id: "wedding_banquet",
    title: "婚礼酒席",
    description: "婚礼现场喜气洋洋，但亲友之间的老账新仇都在酒杯里。",
    rolesHint: "角色类型：新人、双方父母、伴郎伴娘、前任、爱挑事的亲戚。对话风格：客套、阴阳怪气。",
  },
  {
    id: "community_committee",
    title: "业委会开会",
    description: "小区业委会开会讨论物业费，业主们各执一词，火药味十足。",
    rolesHint: "角色类型：热心业主、物业经理、爱录音的大爷、带娃宝妈。对话风格：群聊语气、互怼。",
  },

  // ========== 职场类 ==========
  {
    id: "tech_startup",
    title: "创业公司",
    description: "创业公司团建，表面增强凝聚力，实则职场政治暗流涌动。",
    rolesHint: "角色类型：创始人、程序员、产品经理、实习生、行政。对话风格：互联网黑话、吐槽。",
  },
  {
    id: "hospital_oncall",
    title: "医院急诊",
    description: "急诊室值班夜，一起棘手的病例让所有人神经绷紧。",
    rolesHint: "角色类型：主治医生、实习医生、护士长、患者家属。对话风格：专业、压力大。",
  },
  {
    id: "esports_house",
    title: "电竞战队",
    description: "电竞战队成绩下滑，训练赛变成互相甩锅的现场。",
    rolesHint: "角色类型：选手、教练、经纪人、替补。对话风格：电竞黑话、节奏快。",
  },
  {
    id: "cooking_competition",
    title: "厨艺比赛",
    description: "厨艺比赛决赛后台，选手们表面客气，暗中较劲。",
    rolesHint: "角色类型：夺冠热门、新人、评委、导演。对话风格：客气但算计。",
  },

  // ========== 悬疑推理类 ==========
  {
    id: "detective_noir",
    title: "侦探事务所",
    description: "侦探事务所里，一桩悬案的相关人员聚集。每个人都有不愿说的秘密。",
    rolesHint: "角色类型：侦探、委托人、嫌疑人、证人、助手。对话风格：克制、爱试探、反问多。",
  },
  {
    id: "cruise_ship",
    title: "邮轮派对",
    description: "豪华邮轮上，一位重要乘客失踪。船已离港，没人能下船。",
    rolesHint: "角色类型：富豪、船长、服务生、神秘乘客。对话风格：上流社交、暗示。",
  },
  {
    id: "subway_night_shift",
    title: "地铁末班车",
    description: "末班地铁因故障停在隧道里，乘客们开始互相猜疑。",
    rolesHint: "角色类型：司机、上班族、学生、保安、神秘乘客。对话风格：都市口语、焦虑。",
  },
  {
    id: "museum_night",
    title: "博物馆夜班",
    description: "博物馆闭馆后，监控出现异常。展厅里有脚步声，钥匙不翼而飞。",
    rolesHint: "角色类型：保安、馆员、修复师、实习生。对话风格：谨慎、互相盘问。",
  },

  // ========== 现代都市类 ==========
  {
    id: "co_working_space",
    title: "共享办公",
    description: "共享办公区突发停电，项目临近发布，大家都在找责任人。",
    rolesHint: "角色类型：创业者、自由职业者、运维、投资人、实习生。对话风格：商务口吻、暗含火药味。",
  },
  {
    id: "escape_room",
    title: "密室逃脱",
    description: "密室逃脱进行到一半，有道具丢失导致卡关，玩家开始互相怀疑。",
    rolesHint: "角色类型：带队玩家、胆小队友、老玩家、店员、临时拼团。对话风格：紧张、推理、吐槽。",
  },
  {
    id: "music_festival_backstage",
    title: "音乐节后台",
    description: "演出临近，设备突然出故障，主办方与艺人团队紧急对峙。",
    rolesHint: "角色类型：乐队成员、主办方、舞台总监、灯光师、粉丝代表。对话风格：快节奏、情绪起伏。",
  },

  // ========== 特殊场景类 ==========
  {
    id: "airport_delay",
    title: "机场延误",
    description: "航班大面积延误，旅客情绪爆炸，各种矛盾集中爆发。",
    rolesHint: "角色类型：地勤、乘客、律师、带娃家长。对话风格：现实口语、投诉。",
  },
  {
    id: "train_sleeping_car",
    title: "火车卧铺",
    description: "长途卧铺车厢里，深夜有人翻箱倒柜，乘客们互相猜疑。",
    rolesHint: "角色类型：乘务员、商贩、背包客、大叔大妈。对话风格：生活化、疑心重。",
  },
  {
    id: "retirement_home",
    title: "养老院",
    description: "养老院活动室里，大爷大妈们进行脑力活动，谁也不服谁。",
    rolesHint: "角色类型：退休干部、广场舞领队、富豪、八卦老太。对话风格：啰嗦、倚老卖老。",
  },
  {
    id: "livestream_house",
    title: "主播合租屋",
    description: "几位主播合租直播，突然有人被曝黑料，互相怀疑是谁泄露的。",
    rolesHint: "角色类型：主播、运营、粉丝、剪辑师。对话风格：网络梗、公关话术。",
  },
  {
    id: "campfire_summer",
    title: "夏令营",
    description: "夏令营篝火晚会后，营地出现失窃事件，大家互相指责。",
    rolesHint: "角色类型：教官、孩子王、透明人、告状精。对话风格：少年感、嘴硬。",
  },
];

const localizeScenario = (scenario: GameScenario): GameScenario => {
  const { t } = getI18n();
  const baseKey = `scenarios.${scenario.id}`;
  return {
    ...scenario,
    title: t(`${baseKey}.title` as Parameters<typeof t>[0]),
    description: t(`${baseKey}.description` as Parameters<typeof t>[0]),
    rolesHint: t(`${baseKey}.rolesHint` as Parameters<typeof t>[0]),
  };
};

export const getScenarios = (): GameScenario[] => {
  return SCENARIOS.map(localizeScenario);
};

export const getRandomScenario = (): GameScenario => {
  const scenarios = getScenarios();
  const index = Math.floor(Math.random() * scenarios.length);
  return scenarios[index];
};
