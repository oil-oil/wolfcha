import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WolfStrikePreview } from "@/components/game/WolfStrikePreview";

export const metadata: Metadata = {
  title: "角色技能预览",
  robots: { index: false, follow: false },
};

export default async function SkillPreviewPage({ searchParams }: { searchParams: Promise<{ skill?: string; day?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const params = await searchParams;
  const skill = params.skill;
  const initialSkill = skill === "seer" || skill === "witch-save" || skill === "witch-poison" || skill === "hunter-ready" || skill === "idiot" || skill === "guard" || skill === "white-wolf-king" ? skill : "wolf";
  return <WolfStrikePreview initialSkill={initialSkill} initialNight={params.day !== "1"} />;
}
