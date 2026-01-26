import { NextRequest, NextResponse } from "next/server";

const LOCALE_COOKIE = "wolfcha.locale";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip static files, API routes, and paths that already have locale
  if (
    pathname.startsWith("/zh") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // Check if user has a saved locale preference (cookie)
  const savedLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  if (savedLocale === "zh") {
    const url = new URL(pathname === "/" ? "/zh" : `/zh${pathname}`, request.url);
    url.search = request.nextUrl.search;
    return NextResponse.redirect(url);
  }
  if (savedLocale === "en") {
    // User explicitly chose English, stay on current path
    return NextResponse.next();
  }

  // No saved preference: detect browser language from Accept-Language header
  const acceptLanguage = request.headers.get("accept-language") || "";
  const prefersChinese = acceptLanguage
    .split(",")
    .some((lang) => lang.trim().toLowerCase().startsWith("zh"));

  if (prefersChinese) {
    const url = new URL(pathname === "/" ? "/zh" : `/zh${pathname}`, request.url);
    url.search = request.nextUrl.search;
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|api|.*\\..*).*)"],
};
