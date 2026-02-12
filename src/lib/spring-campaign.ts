export const SPRING_CAMPAIGN_CODE = "spring_2026_login_quota";
export const SPRING_CAMPAIGN_TIMEZONE = "Asia/Shanghai";
export const SPRING_CAMPAIGN_DAILY_QUOTA = 10;

const SPRING_CAMPAIGN_START_ISO = "2026-02-12T00:00:00+08:00";
const SPRING_CAMPAIGN_END_ISO = "2026-02-18T00:00:00+08:00";

export type SpringCampaignSnapshot = {
  code: string;
  active: boolean;
  timezone: string;
  startsAt: string;
  endsAt: string;
  quotaDate: string | null;
  claimedToday: boolean;
  justClaimed: boolean;
  dailyQuota: number;
  totalQuota: number;
  remainingQuota: number;
  expiresAt: string | null;
};

export function getSpringCampaignWindow() {
  return {
    startsAt: SPRING_CAMPAIGN_START_ISO,
    endsAt: SPRING_CAMPAIGN_END_ISO,
    startDate: new Date(SPRING_CAMPAIGN_START_ISO),
    endDate: new Date(SPRING_CAMPAIGN_END_ISO),
  };
}

export function getShanghaiDateKey(input: Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SPRING_CAMPAIGN_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(input);
}

export function getSpringQuotaExpiresAtIso(quotaDate: string) {
  const [year, month, day] = quotaDate.split("-").map(Number);
  const nextDayMidnightUtc = new Date(Date.UTC(year, month - 1, day + 1, -8, 0, 0));
  const { endDate } = getSpringCampaignWindow();
  const expiresAt = Math.min(nextDayMidnightUtc.getTime(), endDate.getTime());
  return new Date(expiresAt).toISOString();
}

export function isSpringCampaignActive(now: Date = new Date()) {
  const { startDate, endDate } = getSpringCampaignWindow();
  return now >= startDate && now < endDate;
}

export function buildSpringCampaignBase(now: Date = new Date()): SpringCampaignSnapshot {
  const { startsAt, endsAt } = getSpringCampaignWindow();
  return {
    code: SPRING_CAMPAIGN_CODE,
    active: isSpringCampaignActive(now),
    timezone: SPRING_CAMPAIGN_TIMEZONE,
    startsAt,
    endsAt,
    quotaDate: isSpringCampaignActive(now) ? getShanghaiDateKey(now) : null,
    claimedToday: false,
    justClaimed: false,
    dailyQuota: SPRING_CAMPAIGN_DAILY_QUOTA,
    totalQuota: 0,
    remainingQuota: 0,
    expiresAt: null,
  };
}
