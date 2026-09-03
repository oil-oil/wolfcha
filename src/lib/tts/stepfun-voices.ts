import type { VoicePreset } from "@/lib/voice-constants";

/**
 * StepFun 官方音色预设（纯数据，客户端可用；不要在此引入服务端适配器）。
 * 音色与描述来自 StepFun system_voices 接口与官方文档。
 */

export const STEPFUN_VOICE_PRESETS: VoicePreset[] = [
  // --- 男性音色 ---
  { id: "cixingnansheng", name: "磁性男声", styles: ["deep", "霸总"], gender: "male" },
  { id: "zhengpaiqingnian", name: "正派青年", styles: ["cheerful", "balanced"], gender: "male" },
  { id: "zixinnansheng", name: "自信男声", styles: ["balanced", "logic"], gender: "male" },
  { id: "yuanqinansheng", name: "元气男声", styles: ["cheerful", "energetic"], gender: "male" },
  { id: "boyinnansheng", name: "播音男声", styles: ["calm", "logic"], gender: "male" },
  { id: "wenrougongzi", name: "温柔公子", styles: ["calm", "gentle"], gender: "male" },
  { id: "shenchennanyin", name: "深沉男音", styles: ["deep", "steady"], gender: "male" },
  { id: "wenrounansheng", name: "温柔男声", styles: ["safe", "gentle"], gender: "male" },
  { id: "qingniandaxuesheng", name: "青年大学生", styles: ["young", "logic"], gender: "male" },
  { id: "ruyananshi", name: "儒雅男士", styles: ["calm", "scholar"], gender: "male" },
  { id: "shuangkuainansheng", name: "爽快男声", styles: ["aggressive", "balanced"], gender: "male" },

  // --- 女性音色 ---
  { id: "linjiajiejie", name: "邻家姐姐", styles: ["safe", "warm"], gender: "female" },
  { id: "linjiameimei", name: "邻家妹妹", styles: ["cheerful", "cute"], gender: "female" },
  { id: "ruanmengnvsheng", name: "软萌女声", styles: ["cute", "soft"], gender: "female" },
  { id: "shuangkuaijiejie", name: "爽快姐姐", styles: ["cheerful", "balanced"], gender: "female" },
  { id: "wenjingxuejie", name: "文静学姐", styles: ["calm", "logic"], gender: "female" },
  { id: "qingchunshaonv", name: "清纯少女", styles: ["soft", "young"], gender: "female" },
  { id: "tianmeinvsheng", name: "甜美女声", styles: ["sweet", "safe"], gender: "female" },
  { id: "lengyanyujie", name: "冷艳御姐", styles: ["aggressive", "cool"], gender: "female" },
  { id: "jilingshaonv", name: "机灵少女", styles: ["cheerful", "young"], gender: "female" },
  { id: "huolinvsheng", name: "活力女声", styles: ["cheerful", "energetic"], gender: "female" },
  { id: "yuanqishaonv", name: "元气少女", styles: ["cheerful", "cute"], gender: "female" },
  { id: "youyanvsheng", name: "优雅女声", styles: ["calm", "elegant"], gender: "female" },
  { id: "qinqienvsheng", name: "亲切女声", styles: ["safe", "warm"], gender: "female" },
  { id: "wenroushunv", name: "温柔熟女", styles: ["calm", "mature"], gender: "female" },
  { id: "ganliannvsheng", name: "干练女声", styles: ["logic", "professional"], gender: "female" },
];

export const STEPFUN_ENGLISH_VOICE_PRESETS: VoicePreset[] = [
  { id: "vibrant-youth", name: "Vibrant Youth", styles: ["balanced"], gender: "male" },
  { id: "soft-spoken-gentleman", name: "Soft-spoken Gentleman", styles: ["calm"], gender: "male" },
  { id: "magnetic-voiced-male", name: "Magnetic-voiced Male", styles: ["deep"], gender: "male" },
  { id: "energeticconfident-female", name: "Energetic Confident", styles: ["cheerful"], gender: "female" },
  { id: "lively-girl", name: "Lively Girl", styles: ["cheerful"], gender: "female" },
  { id: "elegantgentle-female", name: "Elegant Gentle", styles: ["calm"], gender: "female" },
];
