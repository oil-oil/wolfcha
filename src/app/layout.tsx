import type { Metadata } from "next";
import { Cinzel, Noto_Serif_SC } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";

const cinzel = Cinzel({
  weight: ["700"],
  subsets: ["latin"],
  variable: "--font-title",
});

const notoSerifSC = Noto_Serif_SC({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-chinese",
});

export const metadata: Metadata = {
  title: "Wolfcha - 猹人杀",
  description: "单人沉浸式复古童话狼人杀",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=IM+Fell+English:ital@0;1&display=swap" rel="stylesheet" />
      </head>
      <body className={`${cinzel.variable} ${notoSerifSC.variable} antialiased`}>
        <Toaster richColors position="top-center" closeButton />
        {children}
      </body>
    </html>
  );
}
