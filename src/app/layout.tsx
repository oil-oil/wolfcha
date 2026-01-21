import type { Metadata } from "next";
import Script from "next/script";
import { Cinzel, Noto_Serif_SC } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import { Analytics } from "@vercel/analytics/next"
import { I18nProvider } from "@/i18n/I18nProvider";
import { defaultLocale, localeToHtmlLang } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";

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

const defaultMessages = getMessages(defaultLocale);

export const metadata: Metadata = {
  title: defaultMessages.app.title,
  description: defaultMessages.app.description,
  icons: {
    icon: "/brand/wolfcha-favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang={localeToHtmlLang[defaultLocale]} suppressHydrationWarning>
      <Analytics />
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=IM+Fell+English:ital@0;1&display=swap" rel="stylesheet" />
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-3SSRH8KPLY"
          strategy="afterInteractive"
        />
        <Script id="ga-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-3SSRH8KPLY');
          `}
        </Script>
      </head>
      <body className={`${cinzel.variable} ${notoSerifSC.variable} antialiased`}>
        <I18nProvider>
          <Toaster position="top-center" closeButton />
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
