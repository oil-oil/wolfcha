export interface VoicePreset {
  id: string;
  name: string;
  styles: string[]; // 对应的 persona styleLabel 或 traits
  gender: "male" | "female";
  minAge?: number;
  maxAge?: number;
}

// MiniMax T2A V2 推荐音色 (根据官方文档或常用音色)
// 注意：实际 ID 需要根据 MiniMax 控制台获取，这里使用一些常见的预设 ID 或示例 ID
export const VOICE_PRESETS: VoicePreset[] = [
  // --- 男性音色 ---
  { id: "Cantonese_PlayfulMan", name: "活泼男声", styles: ["cheerful", "balanced", "活泼", "阳光"], gender: "male", minAge: 18, maxAge: 20 },
  { id: "Chinese (Mandarin)_Stubborn_Friend", name: "嘴硬竹马", styles: ["aggressive", "balanced", "嘴硬", "竹马"], gender: "male", minAge: 21, maxAge: 23 },
  { id: "Chinese (Mandarin)_Southern_Young_Man", name: "南方小哥", styles: ["cheerful", "safe", "南方", "随和"], gender: "male", minAge: 24, maxAge: 27 },
  { id: "Chinese (Mandarin)_Gentle_Youth", name: "温润青年", styles: ["calm", "balanced", "温润", "儒雅"], gender: "male", minAge: 28, maxAge: 31 },
  { id: "male-qn-jingying", name: "精英青年音色", styles: ["logic", "balanced", "精英", "青年"], gender: "male", minAge: 32, maxAge: 35 },
  { id: "Chinese (Mandarin)_Sincere_Adult", name: "真诚青年", styles: ["balanced", "safe", "真诚", "热情"], gender: "male", minAge: 36, maxAge: 40 },
  { id: "Chinese (Mandarin)_Radio_Host", name: "电台男主播", styles: ["calm", "logic", "电台", "播音"], gender: "male", minAge: 41, maxAge: 44 },
  { id: "Chinese (Mandarin)_Humorous_Elder", name: "搞笑大爷", styles: ["cheerful", "aggressive", "搞笑", "大爷"], gender: "male", minAge: 45 },
  
  // --- 女性音色 ---
  { id: "Chinese (Mandarin)_Cute_Spirit", name: "憨憨萌兽", styles: ["cheerful", "balanced", "憨憨", "萌"], gender: "female", minAge: 18, maxAge: 21 },
  { id: "Chinese (Mandarin)_Warm_Girl", name: "温暖少女", styles: ["cheerful", "safe", "温暖", "少女"], gender: "female", minAge: 22, maxAge: 25 },
  { id: "Chinese (Mandarin)_Soft_Girl", name: "软软女孩", styles: ["balanced", "safe", "软软", "可爱"], gender: "female", minAge: 26, maxAge: 29 },
  { id: "Chinese (Mandarin)_HK_Flight_Attendant", name: "港普空姐", styles: ["balanced", "safe", "港普", "空姐"], gender: "female", minAge: 30, maxAge: 32 },
  { id: "Chinese (Mandarin)_Gentle_Senior", name: "温柔学姐", styles: ["calm", "safe", "学姐", "温柔"], gender: "female", minAge: 33, maxAge: 34 },
  { id: "Chinese (Mandarin)_Warm_Bestie", name: "温暖闺蜜", styles: ["balanced", "safe", "闺蜜", "温暖"], gender: "female", minAge: 35, maxAge: 44 },
  { id: "Chinese (Mandarin)_Kind-hearted_Antie", name: "热心大婶", styles: ["cheerful", "aggressive", "热心", "大婶"], gender: "female", minAge: 45 },
];

export const DEFAULT_VOICE_ID = {
  male: "male-qn-jingying",
  female: "Chinese (Mandarin)_Warm_Girl",
};

export function resolveVoiceId(
  input: string | undefined,
  gender: "male" | "female" | "nonbinary" | undefined,
  age?: number
) {
  const trimmed = (input || "").trim();
  const exists = trimmed ? VOICE_PRESETS.some((p) => p.id === trimmed) : false;
  if (exists) return trimmed;

  const normGender: "male" | "female" = gender === "female" ? "female" : "male";
  const baseCandidates = VOICE_PRESETS.filter((p) => p.gender === normGender);
  const hasAge = typeof age === "number" && Number.isFinite(age);
  const ageCandidates = hasAge
    ? baseCandidates.filter((p) => {
        const minOk = typeof p.minAge === "number" ? age >= p.minAge : true;
        const maxOk = typeof p.maxAge === "number" ? age <= p.maxAge : true;
        return minOk && maxOk;
      })
    : baseCandidates;

  const picked = (ageCandidates[0] ?? baseCandidates[0])?.id;
  if (picked) return picked;

  return normGender === "female" ? DEFAULT_VOICE_ID.female : DEFAULT_VOICE_ID.male;
}
