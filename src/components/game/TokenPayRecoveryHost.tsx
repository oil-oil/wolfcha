"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowSquareOut, CreditCard, QrCode } from "@phosphor-icons/react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toTokenPayTimestampMs, useTokenPay } from "@/hooks/useTokenPay";
import {
  settleTokenPayTopUp,
  TOKENPAY_TOP_UP_REQUEST_EVENT,
  type TokenPayTopUpRequestDetail,
} from "@/lib/tokenpay-recovery";

function formatDate(value: string | number) {
  const timestamp = toTokenPayTimestampMs(value);
  if (!Number.isFinite(timestamp)) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}

function TokenPayRecoveryDialog({
  requestId,
  onComplete,
}: {
  requestId: string;
  onComplete: () => void;
}) {
  const t = useTranslations("tokenPay");
  const [amountInput, setAmountInput] = useState("10");
  const [amountError, setAmountError] = useState<string | null>(null);
  const [expiryTick, setExpiryTick] = useState<number | null>(null);
  const settledRef = useRef(false);
  const {
    paymentSession,
    paymentCreating,
    paymentRefreshing,
    paymentError,
    createPaymentSession,
    refreshPaymentSession,
  } = useTokenPay();

  useEffect(() => {
    if (!paymentSession) return;
    const expiresAt = toTokenPayTimestampMs(paymentSession.expiredAt);
    if (!Number.isFinite(expiresAt)) return;
    const timeoutId = window.setTimeout(
      () => setExpiryTick(Date.now()),
      Math.max(0, expiresAt - Date.now()),
    );
    return () => window.clearTimeout(timeoutId);
  }, [paymentSession]);

  useEffect(() => {
    if (paymentSession?.status !== "paid" || settledRef.current) return;
    settledRef.current = true;
    settleTokenPayTopUp(requestId, true);
    toast.success(t("recoveryPaid"));
    onComplete();
  }, [onComplete, paymentSession?.status, requestId, t]);

  const paymentExpired = useMemo(() => {
    if (!paymentSession) return false;
    const expiresAt = toTokenPayTimestampMs(paymentSession.expiredAt);
    return expiryTick !== null && Number.isFinite(expiresAt) && expiresAt <= expiryTick;
  }, [expiryTick, paymentSession]);
  const paymentCanContinue = paymentSession?.status === "pending" && !paymentExpired;
  const paymentStatusMessage = paymentSession
    ? paymentSession.status === "paid"
      ? t("paymentPaid", { refresh: t("paidRefreshing") })
      : paymentSession.status === "failed"
        ? t("paymentFailed")
        : paymentSession.status === "closed"
          ? t("paymentClosed")
          : paymentSession.status === "refunded"
            ? t("paymentRefunded")
            : paymentExpired
              ? t("paymentExpired")
              : t("paymentPending")
    : "";

  const handleCreatePayment = async () => {
    const amount = Number(amountInput);
    if (!Number.isInteger(amount) || amount < 1 || amount > 100000) {
      setAmountError(t("amountError"));
      return;
    }
    setAmountError(null);
    await createPaymentSession(amount);
  };

  const handleCancel = () => {
    if (paymentCreating || settledRef.current) return;
    settledRef.current = true;
    settleTokenPayTopUp(requestId, false);
    onComplete();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && handleCancel()}>
      <DialogContent
        className="max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] max-w-sm overflow-y-auto"
        onEscapeKeyDown={(event) => paymentCreating && event.preventDefault()}
        onPointerDownOutside={(event) => paymentCreating && event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{t("recoveryTitle")}</DialogTitle>
          <DialogDescription>{t("recoveryDescription")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="tokenpay-recovery-amount" className="text-xs">
            {t("amountLabel")}
          </Label>
          <div className="flex gap-2">
            <Input
              id="tokenpay-recovery-amount"
              type="number"
              min={1}
              max={100000}
              step={1}
              inputMode="numeric"
              value={amountInput}
              onChange={(event) => {
                setAmountInput(event.target.value);
                setAmountError(null);
              }}
              placeholder={t("amountPlaceholder")}
              disabled={paymentCreating || paymentCanContinue}
              className="flex-1"
            />
            <Button
              type="button"
              onClick={() => void handleCreatePayment()}
              disabled={paymentCreating || paymentCanContinue}
            >
              <CreditCard />
              {paymentCreating ? t("creatingPayment") : t("createPayment")}
            </Button>
          </div>
          {amountError && <p className="text-xs text-[var(--color-danger)]">{amountError}</p>}
          {paymentError && (
            <p className="text-xs text-[var(--color-danger)]">{t("paymentError")}</p>
          )}
        </div>

        {paymentSession && (
          <div className="space-y-3 border-t border-[var(--border-color)] pt-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
                <QrCode />
                {t("scanToPay")}
              </div>
              <span className="text-xs text-[var(--text-muted)]">
                {t("amount", { value: paymentSession.amount })}
              </span>
            </div>
            {paymentCanContinue && (
              <>
                <div className="flex justify-center rounded-md bg-white p-3">
                  <QRCodeSVG value={paymentSession.paymentUrl} size={192} includeMargin />
                </div>
                <Button asChild variant="outline" className="w-full">
                  <a href={paymentSession.paymentUrl} target="_blank" rel="noopener noreferrer">
                    <ArrowSquareOut />
                    {t("openPayment")}
                  </a>
                </Button>
              </>
            )}
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-[var(--text-muted)]">{paymentStatusMessage}</p>
              {paymentCanContinue && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void refreshPaymentSession(paymentSession.id)}
                  disabled={paymentRefreshing}
                >
                  {paymentRefreshing ? t("refreshing") : t("refreshPayment")}
                </Button>
              )}
            </div>
            {paymentCanContinue && (
              <p className="text-xs text-[var(--text-muted)]">
                {t("expiresAt", { value: formatDate(paymentSession.expiredAt) })}
              </p>
            )}
          </div>
        )}

        <Button
          type="button"
          variant="ghost"
          onClick={handleCancel}
          disabled={paymentCreating}
          className="w-full"
        >
          {t("recoveryCancel")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export function TokenPayRecoveryHost() {
  const [requestId, setRequestId] = useState<string | null>(null);
  const handleComplete = useCallback(() => setRequestId(null), []);

  useEffect(() => {
    const handleRequest = (event: Event) => {
      const detail = (event as CustomEvent<TokenPayTopUpRequestDetail>).detail;
      if (detail?.requestId) setRequestId(detail.requestId);
    };
    window.addEventListener(TOKENPAY_TOP_UP_REQUEST_EVENT, handleRequest);
    return () => window.removeEventListener(TOKENPAY_TOP_UP_REQUEST_EVENT, handleRequest);
  }, []);

  if (!requestId) return null;
  return (
    <TokenPayRecoveryDialog
      key={requestId}
      requestId={requestId}
      onComplete={handleComplete}
    />
  );
}
