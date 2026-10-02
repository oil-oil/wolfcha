import type { Metadata } from "next";
import { MatchingPreview } from "@/components/matching/MatchingPreview";

export const metadata: Metadata = {
  title: "匹配动效预览",
  description: "猹杀人物匹配及左右头像无缝归位的动效预览。",
  robots: { index: false, follow: false },
};

export default function MatchingPreviewPage() {
  return <MatchingPreview />;
}
