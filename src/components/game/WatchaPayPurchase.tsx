"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

type Purchase = { purchaseUrl: string; qrCodeUrl?: string };

export function WatchaPayPurchase({ onCreditsChange }: { onCreditsChange?: () => void }) {
  const t = useTranslations("customKey.payAsYouGo");
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [qrFailed, setQrFailed] = useState(false);
  const activeRequest = useRef<AbortController | null>(null);
  useEffect(() => () => activeRequest.current?.abort(), []);

  const handlePurchase = async () => {
    if (activeRequest.current) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    const timeout = setTimeout(() => controller.abort(), 15_000);
    setLoading(true);
    setError(false);
    setPurchase(null);
    setQrFailed(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || controller.signal.aborted) throw new Error("Unauthorized");
      const response = await fetch("/api/watcha-pay/access", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok || data.access === "unavailable" || !data.purchaseUrl) throw new Error("Unavailable");
      if (controller.signal.aborted) return;
      setPurchase(data);
      if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        window.location.assign(data.purchaseUrl);
      }
    } catch {
      setError(true);
    } finally {
      clearTimeout(timeout);
      activeRequest.current = null;
      setLoading(false);
    }
  };

  // 支付宝 Scheme 不能直接作为通用扫码内容，使用官方 HTTPS 唤起入口兜底。
  const qrValue = purchase?.purchaseUrl.startsWith("alipays:")
    ? `https://render.alipay.com/p/s/i/?scheme=${encodeURIComponent(purchase.purchaseUrl)}`
    : purchase?.purchaseUrl;

  return (
    <section className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-4 space-y-4">
      <div>
        <h3 className="text-sm font-medium">{t("watchaPayTitle")}</h3>
        <p className="mt-1 text-xs text-[var(--text-muted)]">{t("watchaPayDescription")}</p>
      </div>
      <p className="text-xs text-[var(--text-muted)]">{t("watchaPayHint")}</p>
      <Button type="button" onClick={handlePurchase} disabled={loading} className="w-full">
        {loading ? t("redirecting") : t("watchaPayPurchase")}
      </Button>
      {error && <p role="alert" className="text-sm text-red-500">{t("error")}</p>}
      {purchase && qrValue && (
        <div className="flex flex-col items-center gap-3" aria-live="polite">
          <p className="text-sm">{t("watchaPayScan")}</p>
          <div className="rounded-lg bg-white p-3">
            {purchase.qrCodeUrl && !qrFailed ? (
              // 平台动态生成的二维码不可经过图片优化服务或缓存。
              // eslint-disable-next-line @next/next/no-img-element
              <img src={purchase.qrCodeUrl} alt={t("watchaPayScan")} width={208} height={208}
                referrerPolicy="no-referrer" onError={() => setQrFailed(true)} />
            ) : <QRCodeSVG value={qrValue} size={208} marginSize={1} />}
          </div>
          <a href={purchase.purchaseUrl} className="text-sm underline">{t("watchaPayOpen")}</a>
          <p className="text-xs text-[var(--text-muted)]">{t("watchaPayRefreshHint")}</p>
          <Button type="button" variant="outline" onClick={() => onCreditsChange?.()}>
            {t("watchaPayRefresh")}
          </Button>
        </div>
      )}
    </section>
  );
}
