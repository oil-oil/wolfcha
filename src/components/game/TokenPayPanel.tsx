"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowClockwise, ArrowSquareOut, CheckCircle, CreditCard, LinkSimple, QrCode, Trash, WarningCircle } from "@phosphor-icons/react";
import { QRCodeSVG } from "qrcode.react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toTokenPayTimestampMs, useTokenPay } from "@/hooks/useTokenPay";

interface TokenPayPanelProps {
  onConnectionChange?: (connected: boolean) => void;
}

function formatMicroCredits(value: number) {
  return `¥${new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }).format(value / 1_000_000)}`;
}

function formatDate(value: string | number) {
  const timestamp = toTokenPayTimestampMs(value);
  if (!Number.isFinite(timestamp)) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(timestamp);
}

export function TokenPayPanel({ onConnectionChange }: TokenPayPanelProps) {
  const t = useTranslations("tokenPay");
  const [amountInput, setAmountInput] = useState("10");
  const [amountError, setAmountError] = useState<string | null>(null);
  const [redemptionCode, setRedemptionCode] = useState("");
  const [redemptionSuccess, setRedemptionSuccess] = useState<number | null>(null);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [disconnectError, setDisconnectError] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [oauthError, setOauthError] = useState(false);
  const [expiryTick, setExpiryTick] = useState(0);
  const {
    connection,
    balance,
    paymentSession,
    connectionLoading,
    connectionRefreshing,
    balanceLoading,
    balanceRefreshing,
    oauthLoading,
    paymentCreating,
    paymentRefreshing,
    redemptionLoading,
    connectionError,
    balanceError,
    paymentError,
    redemptionError,
    refreshConnection,
    refreshBalance,
    startOAuth,
    disconnect,
    createPaymentSession,
    refreshPaymentSession,
    redeemTokenPayCode,
  } = useTokenPay();

  const reauthorizationRequired = connection?.status === "reauthorize_required";
  const connected = Boolean(connection?.connected && !reauthorizationRequired);

  useEffect(() => {
    if (connection) onConnectionChange?.(connected);
  }, [connected, connection, onConnectionChange]);

  useEffect(() => {
    if (!paymentSession) return;
    const expiresAt = toTokenPayTimestampMs(paymentSession.expiredAt);
    if (!Number.isFinite(expiresAt)) return;
    if (expiresAt <= Date.now()) {
      setExpiryTick(Date.now());
      return;
    }
    const timeoutId = window.setTimeout(() => setExpiryTick(Date.now()), expiresAt - Date.now());
    return () => window.clearTimeout(timeoutId);
  }, [paymentSession]);

  const paymentExpired = useMemo(() => {
    if (!paymentSession) return false;
    const expiresAt = toTokenPayTimestampMs(paymentSession.expiredAt);
    return Number.isFinite(expiresAt) && expiresAt <= (expiryTick || Date.now());
  }, [expiryTick, paymentSession]);
  const paymentStatus = paymentSession?.status ?? "";
  const paymentCanContinue = paymentStatus === "pending" && !paymentExpired;
  const paymentStatusMessage = paymentSession
    ? paymentStatus === "paid"
      ? t("paymentPaid", { refresh: balanceRefreshing ? t("paidRefreshing") : "" })
      : paymentStatus === "failed"
        ? t("paymentFailed")
        : paymentStatus === "closed"
          ? t("paymentClosed")
          : paymentStatus === "refunded"
            ? t("paymentRefunded")
            : paymentExpired
              ? t("paymentExpired")
              : t("paymentPending")
    : "";

  const handleStartOAuth = async () => {
    setOauthError(false);
    try {
      await startOAuth();
    } catch {
      setOauthError(true);
    }
  };

  const handleRefreshConnection = async () => {
    const nextConnection = await refreshConnection();
    if (nextConnection?.connected) void refreshBalance();
  };

  const handleDisconnect = async () => {
    if (disconnecting) return;
    setDisconnectError(null);
    setDisconnecting(true);
    try {
      await disconnect();
      setDisconnectOpen(false);
    } catch (error) {
      setDisconnectError(error instanceof Error ? error.message : t("unknownError"));
    } finally {
      setDisconnecting(false);
    }
  };

  const handleCreatePayment = async () => {
    const amount = Number(amountInput);
    if (!Number.isInteger(amount) || amount < 1 || amount > 100000) {
      setAmountError(t("amountError"));
      return;
    }

    setAmountError(null);
    await createPaymentSession(amount);
  };

  const handleRedeem = async () => {
    setRedemptionSuccess(null);
    const creditsMicro = await redeemTokenPayCode(redemptionCode);
    if (creditsMicro !== null) {
      setRedemptionCode("");
      setRedemptionSuccess(creditsMicro);
    }
  };

  if (connectionLoading && !connection) {
    return (
      <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-4 text-sm text-[var(--text-muted)]">
        {t("loading")}
      </div>
    );
  }

  if (!connection || (!connection.connected && !reauthorizationRequired)) {
    return (
      <div className="space-y-4">
        <section className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-4 space-y-3">
          <div className="flex items-start gap-3">
            <LinkSimple size={20} className="mt-0.5 shrink-0 text-[var(--color-accent)]" />
            <div>
              <h3 className="text-sm font-medium text-[var(--text-primary)]">{t("disconnectedTitle")}</h3>
              <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">{t("disconnectedDescription")}</p>
            </div>
          </div>
          {(connectionError || oauthError) && <p className="text-xs text-[var(--color-danger)]">{t("connectionError")}</p>}
          <div className="flex gap-2">
            <Button type="button" onClick={() => void handleStartOAuth()} disabled={connectionRefreshing || oauthLoading} className="flex-1 gap-2">
              <LinkSimple size={16} />
              {connectionRefreshing || oauthLoading ? t("connecting") : t("connect")}
            </Button>
            {connectionError && (
              <Button type="button" variant="outline" onClick={() => void handleRefreshConnection()} disabled={connectionRefreshing || oauthLoading} aria-label={t("refresh")}>
                <ArrowClockwise size={16} />
              </Button>
            )}
          </div>
        </section>
      </div>
    );
  }

  if (reauthorizationRequired) {
    return (
      <section className="rounded-lg border border-[var(--color-accent)]/50 bg-[var(--bg-card)] p-4 space-y-3">
        <div className="flex items-start gap-3">
          <WarningCircle size={20} className="mt-0.5 shrink-0 text-[var(--color-accent)]" />
          <div>
            <h3 className="text-sm font-medium text-[var(--text-primary)]">{t("reauthorizeTitle")}</h3>
            <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">{t("reauthorizeDescription")}</p>
          </div>
        </div>
        <Button type="button" onClick={() => void handleStartOAuth()} disabled={oauthLoading} className="w-full gap-2">
          <LinkSimple size={16} />
          {oauthLoading ? t("connecting") : t("reauthorize")}
        </Button>
        {(connectionError || oauthError) && <p className="text-xs text-[var(--color-danger)]">{t("connectionError")}</p>}
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-4 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <CheckCircle size={20} className="mt-0.5 shrink-0 text-[var(--color-success)]" />
            <div>
              <h3 className="text-sm font-medium text-[var(--text-primary)]">{t("connectedTitle")}</h3>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {connection.keyFingerprint ? t("keyFingerprint", { value: connection.keyFingerprint }) : t("connected")}
              </p>
            </div>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setDisconnectOpen(true)} className="gap-1.5">
            <Trash size={14} />
            {t("disconnect")}
          </Button>
        </div>

        {connection.connectedAt && <p className="text-xs text-[var(--text-muted)]">{t("connectedAt", { value: formatDate(connection.connectedAt) })}</p>}

        <div className="rounded-md border border-[var(--border-color)] bg-[var(--bg-secondary)] p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-[var(--text-muted)]">{t("available")}</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => void refreshBalance()} disabled={balanceLoading || balanceRefreshing} className="gap-1.5">
              <ArrowClockwise size={14} />
              {balanceRefreshing ? t("refreshing") : t("refresh")}
            </Button>
          </div>
          {balanceLoading && !balance ? (
            <p className="mt-2 text-2xl font-semibold text-[var(--color-accent)]">{t("loading")}</p>
          ) : balance ? (
            <>
              <p className="mt-2 text-2xl font-semibold text-[var(--color-accent)]">{formatMicroCredits(balance.availableMicro)}</p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-[var(--text-muted)]">
                <span>{t("total")}: {formatMicroCredits(balance.creditsMicro)}</span>
                <span>{t("used")}: {formatMicroCredits(balance.creditsUsedMicro)}</span>
              </div>
            </>
          ) : null}
          {balanceError && <p className="mt-2 text-xs text-[var(--color-danger)]">{t("balanceError")}</p>}
        </div>
      </section>

      <section className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-4 space-y-4">
        <div>
          <h3 className="text-sm font-medium text-[var(--text-primary)]">{t("paymentTitle")}</h3>
          <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">{t("paymentDescription")}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="tokenpay-amount" className="text-xs">{t("amountLabel")}</Label>
          <div className="flex gap-2">
            <Input
              id="tokenpay-amount"
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
              disabled={paymentCreating}
              className="flex-1"
            />
            <Button type="button" onClick={() => void handleCreatePayment()} disabled={paymentCreating} className="gap-2">
              <CreditCard size={16} />
              {paymentCreating ? t("creatingPayment") : t("createPayment")}
            </Button>
          </div>
          <p className="text-xs text-[var(--text-muted)]">{t("amountHint")}</p>
          {amountError && <p className="text-xs text-[var(--color-danger)]">{amountError}</p>}
          {paymentError && <p className="text-xs text-[var(--color-danger)]">{t("paymentError")}</p>}
        </div>

        {paymentSession && (
          <div className="border-t border-[var(--border-color)] pt-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
                <QrCode size={17} />
                {t("scanToPay")}
              </div>
              <span className="text-xs text-[var(--text-muted)]">{t("amount", { value: paymentSession.amount })}</span>
            </div>
            {paymentCanContinue && (
              <>
                <div className="flex justify-center rounded-md bg-white p-3">
                  <QRCodeSVG value={paymentSession.paymentUrl} size={192} includeMargin />
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button asChild variant="outline" className="flex-1 gap-2">
                    <a href={paymentSession.paymentUrl} target="_blank" rel="noopener noreferrer">
                      <ArrowSquareOut size={16} />
                      {t("openPayment")}
                    </a>
                  </Button>
                  <Button type="button" variant="outline" onClick={() => void refreshPaymentSession(paymentSession.id)} disabled={paymentRefreshing} className="flex-1 gap-2">
                    <ArrowClockwise size={16} />
                    {paymentRefreshing ? t("refreshing") : t("refreshPayment")}
                  </Button>
                </div>
              </>
            )}
            <p className="text-xs text-[var(--text-muted)]">{paymentStatusMessage}</p>
            <p className="text-xs text-[var(--text-muted)]">{t("expiresAt", { value: formatDate(paymentSession.expiredAt) })}</p>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-4 space-y-3">
        <div>
          <h3 className="text-sm font-medium text-[var(--text-primary)]">{t("redemptionTitle")}</h3>
          <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">{t("redemptionDescription")}</p>
        </div>
        <div className="flex gap-2">
          <Input
            value={redemptionCode}
            onChange={(event) => {
              setRedemptionCode(event.target.value);
              setRedemptionSuccess(null);
            }}
            maxLength={256}
            placeholder={t("redemptionPlaceholder")}
            disabled={redemptionLoading}
            className="flex-1"
          />
          <Button type="button" variant="outline" onClick={() => void handleRedeem()} disabled={redemptionLoading || !redemptionCode.trim()}>
            {redemptionLoading ? t("redemptionLoading") : t("redemptionAction")}
          </Button>
        </div>
        {redemptionError && <p className="text-xs text-[var(--color-danger)]">{t("redemptionError")}</p>}
        {redemptionSuccess !== null && (
          <p className="text-xs text-[var(--color-success)]">
            {t("redemptionSuccess", { value: formatMicroCredits(redemptionSuccess) })}
          </p>
        )}
      </section>

      <Dialog open={disconnectOpen} onOpenChange={(open) => { if (!disconnecting) setDisconnectOpen(open); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("disconnectTitle")}</DialogTitle>
            <DialogDescription>{t("disconnectDescription")}</DialogDescription>
          </DialogHeader>
          {disconnectError && <p className="text-sm text-[var(--color-danger)]">{t("disconnectError")}</p>}
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setDisconnectOpen(false)} disabled={disconnecting} className="flex-1">
              {t("disconnectCancel")}
            </Button>
            <Button type="button" variant="destructive" onClick={() => void handleDisconnect()} disabled={disconnecting} className="flex-1">
              {disconnecting ? t("disconnecting") : t("disconnectConfirm")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
