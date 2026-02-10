/**
 * 分享工具函数
 */

import type { GameAnalysisData } from "@/types/analysis";

export interface ShareOptions {
  title?: string;
  text?: string;
  url?: string;
}

export async function shareViaWebAPI(options: ShareOptions): Promise<boolean> {
  if (!navigator.share) {
    return false;
  }

  try {
    await navigator.share({
      title: options.title || "狼人杀复盘",
      text: options.text || "来看看我的狼人杀战绩！",
      url: options.url || window.location.href,
    });
    return true;
  } catch (error) {
    if ((error as Error).name !== "AbortError") {
      console.error("Share failed:", error);
    }
    return false;
  }
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.error("Copy failed:", error);
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand("copy");
      return true;
    } catch {
      return false;
    } finally {
      document.body.removeChild(textArea);
    }
  }
}

export function generateShareText(data: GameAnalysisData): string {
  const resultText = data.result === "wolf_win" ? "狼人获胜" : "好人获胜";
  const roleText = data.personalStats.role;
  const tag = data.personalStats.tags[0] || "";
  const score = data.personalStats.totalScore;

  return `【狼人杀复盘】
🎮 对局结果：${resultText}
👤 我的角色：${roleText}
🏷️ 获得称号：${tag}
📊 综合评分：${score}分

${data.personalStats.highlightQuote ? `💬 金句：「${data.personalStats.highlightQuote}」` : ""}

来和我一起玩狼人杀吧！`;
}

export function generateShareUrl(gameId: string): string {
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  return `${baseUrl}/analysis/${gameId}`;
}

export interface ShareResult {
  success: boolean;
  method: "webshare" | "clipboard" | "none";
  message: string;
}

export async function shareAnalysis(data: GameAnalysisData): Promise<ShareResult> {
  const shareText = generateShareText(data);
  const shareUrl = generateShareUrl(data.gameId);

  const webShareSuccess = await shareViaWebAPI({
    title: "狼人杀复盘",
    text: shareText,
    url: shareUrl,
  });

  if (webShareSuccess) {
    return {
      success: true,
      method: "webshare",
      message: "分享成功",
    };
  }

  const clipboardSuccess = await copyToClipboard(`${shareText}\n\n${shareUrl}`);

  if (clipboardSuccess) {
    return {
      success: true,
      method: "clipboard",
      message: "已复制到剪贴板",
    };
  }

  return {
    success: false,
    method: "none",
    message: "分享失败，请手动复制",
  };
}

const ROLE_NAMES: Record<string, string> = {
  Werewolf: "狼人",
  Seer: "预言家",
  Witch: "女巫",
  Hunter: "猎人",
  Guard: "守卫",
  Villager: "平民",
};

const NIGHT_ACTION_LABELS: Record<string, string> = {
  guard: "守护",
  kill: "刀",
  save: "救",
  poison: "毒",
  check: "查验",
};

const DAY_EVENT_LABELS: Record<string, string> = {
  exile: "放逐",
  badge: "当选警长",
  hunter_shot: "猎人开枪",
};

const DEATH_CAUSE_LABELS: Record<string, string> = {
  killed: "被刀",
  exiled: "被票",
  poisoned: "被毒",
  shot: "被枪",
  milk: "毒奶",
};

const RADAR_LABELS_VILLAGE = ["逻辑严密", "发言清晰", "存活评分", "技能价值", "投票准确"];
const RADAR_LABELS_WOLF = ["逻辑严密", "发言清晰", "存活评分", "隐匿程度", "冲票贡献"];

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatNightAction(type: string, source: string, target: string): string {
  if (type === "kill") return `狼人刀${target}`;
  return `${source}${NIGHT_ACTION_LABELS[type] || type}${target}`;
}

export function generateAnalysisHTML(data: GameAnalysisData): string {
  const { personalStats, result, duration, playerCount, awards, timeline, reviews, players, roundStates } = data;
  const isVillageWin = result === "village_win";
  const isWolf = personalStats.alignment === "wolf";
  const primaryTag = personalStats.tags[0] || "待评估";
  const radarLabels = isWolf ? RADAR_LABELS_WOLF : RADAR_LABELS_VILLAGE;
  const { radarStats } = personalStats;
  const radarValues = [radarStats.logic, radarStats.speech, radarStats.survival, radarStats.skillOrHide, radarStats.voteOrTicket];

  // 玩家身份表
  const finalRound = roundStates[roundStates.length - 1];
  const playersHTML = finalRound?.players
    .sort((a, b) => a.seat - b.seat)
    .map((p) => {
      const isWolfPlayer = p.alignment === "wolf";
      const statusClass = p.isAlive ? "alive" : "dead";
      const deathInfo = !p.isAlive && p.deathCause ? ` (${DEATH_CAUSE_LABELS[p.deathCause] || p.deathCause})` : "";
      return `
        <div class="player-item ${statusClass} ${isWolfPlayer ? "wolf" : "village"}">
          <span class="seat">${p.seat + 1}号</span>
          <span class="name">${p.name}</span>
          <span class="role ${isWolfPlayer ? "wolf-role" : "village-role"}">${ROLE_NAMES[p.role] || p.role}</span>
          <span class="status">${p.isAlive ? "存活" : "出局"}${deathInfo}</span>
          ${p.isSheriff ? '<span class="sheriff">👑</span>' : ""}
        </div>
      `;
    })
    .join("") || "";

  // 雷达图数据
  const radarHTML = radarLabels
    .map((label, i) => `
      <div class="radar-item">
        <span class="radar-label">${label}</span>
        <div class="radar-bar-bg">
          <div class="radar-bar" style="width: ${radarValues[i]}%"></div>
        </div>
        <span class="radar-value">${radarValues[i]}</span>
      </div>
    `)
    .join("");

  // Timeline
  const timelineHTML = timeline
    .map((entry) => {
      const nightEventsHTML = entry.nightEvents
        .map((e) => {
          const actionText = formatNightAction(e.type, e.source, e.target);
          const resultBadge = e.result ? `<span class="result-badge">${e.result}</span>` : "";
          const blockedBadge = e.blocked ? `<span class="blocked-badge">已守护</span>` : "";
          return `<li class="night-event-item ${e.type}">${actionText}${resultBadge}${blockedBadge}</li>`;
        })
        .join("");

      // 使用 dayPhases 如果有的话
      let dayHTML = "";
      if (entry.dayPhases && entry.dayPhases.length > 0) {
        dayHTML = entry.dayPhases
          .map((phase) => {
            const phaseLabel = phase.type === "election" ? "竞选阶段" : phase.type === "pk" ? "PK阶段" : "发言阶段";
            let eventHTML = "";
            if (phase.event) {
              const e = phase.event;
              const eventLabel = DAY_EVENT_LABELS[e.type] || e.type;
              const voteInfo = e.voteCount != null ? ` (${Number.isInteger(e.voteCount) ? e.voteCount : e.voteCount.toFixed(1)}票)` : "";
              eventHTML = `<div class="day-event ${e.type}">${eventLabel}: ${e.target}${voteInfo}</div>`;
            }
            if (phase.hunterEvent) {
              const e = phase.hunterEvent;
              eventHTML += `<div class="day-event hunter">${DAY_EVENT_LABELS[e.type] || e.type}: ${e.target}</div>`;
            }
            const summaryHTML = phase.summary ? `<p class="phase-summary">${phase.summary}</p>` : "";
            const speechesHTML = phase.speeches?.length
              ? `<details class="speeches-details"><summary>发言详情 (${phase.speeches.length}条)</summary><div class="speeches-list">${phase.speeches.map((s) => `<div class="speech-item"><strong>${s.seat}号:</strong> ${s.content}</div>`).join("")}</div></details>`
              : "";
            return `<div class="day-phase"><div class="phase-header">${phaseLabel}</div>${summaryHTML}${eventHTML}${speechesHTML}</div>`;
          })
          .join("");
      } else if (entry.dayEvents?.length) {
        const eventsHTML = entry.dayEvents
          .map((e) => {
            const eventLabel = DAY_EVENT_LABELS[e.type] || e.type;
            const voteInfo = e.voteCount != null ? ` (${Number.isInteger(e.voteCount) ? e.voteCount : e.voteCount.toFixed(1)}票)` : "";
            return `<div class="day-event ${e.type}">${eventLabel}: ${e.target}${voteInfo}</div>`;
          })
          .join("");
        const speechesHTML = entry.speeches?.length
          ? `<details class="speeches-details"><summary>发言详情 (${entry.speeches.length}条)</summary><div class="speeches-list">${entry.speeches.map((s) => `<div class="speech-item"><strong>${s.seat}号:</strong> ${s.content}</div>`).join("")}</div></details>`
          : "";
        dayHTML = `<div class="day-section">${entry.summary ? `<p class="day-summary">${entry.summary}</p>` : ""}${eventsHTML}${speechesHTML}</div>`;
      }

      return `
      <div class="timeline-entry">
        ${entry.nightEvents.length > 0 ? `
        <div class="night-section">
          <div class="section-header night-header">第 ${entry.day} 夜</div>
          <ul class="night-events-list">${nightEventsHTML}</ul>
        </div>
        ` : ""}
        ${dayHTML ? `
        <div class="day-section-wrapper">
          <div class="section-header day-header">第 ${entry.day} 天</div>
          ${dayHTML}
        </div>
        ` : ""}
      </div>
    `;
    })
    .join("");

  const reviewsHTML = reviews
    .map(
      (review) => `
    <div class="review-card ${review.relation}">
      <div class="review-header">
        <strong>${review.fromCharacterName}</strong>
        <span class="role">${ROLE_NAMES[review.role] || review.role}</span>
        <span class="relation-badge">${review.relation === "ally" ? "队友" : "对手"}</span>
      </div>
      <p class="review-content">"${review.content}"</p>
    </div>
  `
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Wolfcha 复盘报告 - ${personalStats.userName}</title>
  <style>
    :root {
      --color-gold: #c5a059;
      --color-blood: #c53030;
      --bg-main: #1a1614;
      --bg-card: #242220;
      --text-primary: #f5f5f5;
      --text-secondary: #a3a3a3;
      --text-muted: #737373;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Noto Serif SC', 'PingFang SC', 'Microsoft YaHei', serif;
      background: var(--bg-main);
      color: var(--text-primary);
      line-height: 1.6;
      padding: 20px;
    }
    .container { max-width: 800px; margin: 0 auto; }
    .header {
      text-align: center;
      padding: 40px 20px;
      border-bottom: 1px solid rgba(197, 160, 89, 0.2);
      margin-bottom: 30px;
    }
    .header h1 {
      color: var(--color-gold);
      font-size: 2rem;
      margin-bottom: 10px;
      letter-spacing: 0.2em;
    }
    .result-banner {
      display: inline-block;
      padding: 8px 24px;
      border-radius: 50px;
      background: rgba(197, 160, 89, 0.1);
      border: 1px solid rgba(197, 160, 89, 0.4);
      color: var(--color-gold);
      font-weight: bold;
      margin: 20px 0;
    }
    .player-info {
      text-align: center;
      padding: 30px;
      background: var(--bg-card);
      border-radius: 12px;
      margin-bottom: 20px;
    }
    .player-name { font-size: 1.5rem; font-weight: bold; margin-bottom: 10px; }
    .player-meta { color: var(--text-muted); font-size: 0.875rem; }
    .player-meta span {
      display: inline-block;
      padding: 4px 12px;
      margin: 4px;
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 4px;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }
    .stat-card {
      background: var(--bg-card);
      border-radius: 12px;
      padding: 24px;
      text-align: center;
      border: 1px solid rgba(197, 160, 89, 0.1);
    }
    .stat-value { font-size: 2rem; font-weight: bold; color: var(--color-gold); }
    .stat-label { font-size: 0.75rem; color: var(--text-muted); margin-top: 8px; letter-spacing: 0.1em; }
    .section { margin-bottom: 40px; }
    .section-title {
      text-align: center;
      color: rgba(197, 160, 89, 0.6);
      font-size: 0.75rem;
      letter-spacing: 0.3em;
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 1px solid rgba(197, 160, 89, 0.1);
    }
    .timeline-entry {
      background: var(--bg-card);
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 16px;
      border: 1px solid rgba(197, 160, 89, 0.1);
    }
    .timeline-entry h3 {
      color: var(--color-gold);
      margin-bottom: 16px;
      font-size: 1rem;
    }
    .timeline-entry h4 {
      color: var(--text-secondary);
      font-size: 0.875rem;
      margin-bottom: 8px;
    }
    .timeline-entry ul { list-style: none; padding-left: 16px; }
    .timeline-entry li {
      color: var(--text-secondary);
      font-size: 0.875rem;
      padding: 4px 0;
      border-left: 2px solid rgba(197, 160, 89, 0.2);
      padding-left: 12px;
      margin-bottom: 4px;
    }
    .day-events { margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.05); }
    .day-events p { color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 8px; }
    .vote-result { color: var(--color-blood) !important; font-weight: bold; }
    .review-card {
      background: var(--bg-card);
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 16px;
      border: 1px solid rgba(197, 160, 89, 0.1);
      position: relative;
      overflow: hidden;
    }
    .review-header { margin-bottom: 12px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .review-header strong { color: var(--text-primary); }
    .role { font-size: 0.75rem; color: var(--color-gold); }
    .relation-badge {
      position: absolute;
      top: 0;
      left: 0;
      font-size: 0.625rem;
      padding: 4px 12px;
      border-radius: 0 0 8px 0;
      font-weight: bold;
    }
    .ally .relation-badge { background: rgba(47, 133, 90, 0.3); color: #2f855a; }
    .enemy .relation-badge { background: rgba(197, 48, 48, 0.3); color: #c53030; }
    .review-content {
      color: var(--text-secondary);
      font-style: italic;
      padding-left: 12px;
      border-left: 2px solid rgba(197, 160, 89, 0.2);
    }
    .awards { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 30px; }
    .award-card {
      background: var(--bg-card);
      border-radius: 12px;
      padding: 20px;
      text-align: center;
      border: 1px solid rgba(197, 160, 89, 0.1);
    }
    .award-title { color: var(--color-gold); font-size: 0.75rem; letter-spacing: 0.1em; margin-bottom: 8px; }
    .award-name { font-weight: bold; margin-bottom: 8px; }
    .award-reason { font-size: 0.75rem; color: var(--text-muted); }
    /* 玩家身份表 */
    .players-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 8px;
      margin-bottom: 30px;
    }
    .player-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: var(--bg-card);
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,0.05);
      font-size: 0.8rem;
    }
    .player-item.dead { opacity: 0.5; }
    .player-item .seat { color: var(--text-muted); min-width: 32px; }
    .player-item .name { flex: 1; color: var(--text-primary); }
    .player-item .role { font-size: 0.7rem; padding: 2px 6px; border-radius: 4px; }
    .player-item .wolf-role { background: rgba(197, 48, 48, 0.2); color: #ef4444; }
    .player-item .village-role { background: rgba(197, 160, 89, 0.2); color: var(--color-gold); }
    .player-item .status { font-size: 0.7rem; color: var(--text-muted); }
    .player-item .sheriff { margin-left: 4px; }
    /* 雷达图数据 */
    .radar-stats {
      background: var(--bg-card);
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 30px;
      border: 1px solid rgba(197, 160, 89, 0.1);
    }
    .radar-item {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
    }
    .radar-item:last-child { margin-bottom: 0; }
    .radar-label { width: 80px; font-size: 0.8rem; color: var(--text-secondary); }
    .radar-bar-bg {
      flex: 1;
      height: 8px;
      background: rgba(255,255,255,0.1);
      border-radius: 4px;
      overflow: hidden;
    }
    .radar-bar {
      height: 100%;
      background: linear-gradient(90deg, var(--color-gold), #e6c67a);
      border-radius: 4px;
      transition: width 0.3s;
    }
    .radar-value { width: 32px; text-align: right; font-size: 0.8rem; color: var(--color-gold); font-weight: bold; }
    /* 时间线改进 */
    .night-section, .day-section-wrapper {
      margin-bottom: 16px;
    }
    .section-header {
      font-size: 0.75rem;
      font-weight: bold;
      padding: 4px 12px;
      border-radius: 4px;
      margin-bottom: 12px;
      display: inline-block;
    }
    .night-header { background: rgba(79, 70, 229, 0.2); color: #a5b4fc; }
    .day-header { background: rgba(197, 160, 89, 0.2); color: var(--color-gold); }
    .night-events-list { list-style: none; padding: 0; }
    .night-event-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: rgba(255,255,255,0.03);
      border-radius: 6px;
      margin-bottom: 6px;
      font-size: 0.85rem;
      color: var(--text-secondary);
    }
    .night-event-item.kill { border-left: 3px solid #ef4444; }
    .night-event-item.save { border-left: 3px solid #22c55e; }
    .night-event-item.poison { border-left: 3px solid #a855f7; }
    .night-event-item.check { border-left: 3px solid #3b82f6; }
    .night-event-item.guard { border-left: 3px solid #f59e0b; }
    .result-badge, .blocked-badge {
      font-size: 0.65rem;
      padding: 2px 6px;
      border-radius: 4px;
      margin-left: auto;
    }
    .result-badge { background: rgba(255,255,255,0.1); color: var(--text-muted); }
    .blocked-badge { background: rgba(245, 158, 11, 0.2); color: #f59e0b; }
    .day-phase {
      background: rgba(255,255,255,0.03);
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 8px;
      border: 1px solid rgba(197, 160, 89, 0.1);
    }
    .phase-header {
      font-size: 0.75rem;
      font-weight: bold;
      color: var(--color-gold);
      margin-bottom: 8px;
      padding-bottom: 8px;
      border-bottom: 1px solid rgba(255,255,255,0.05);
    }
    .phase-summary, .day-summary { font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 8px; }
    .day-event {
      font-size: 0.85rem;
      padding: 6px 10px;
      border-radius: 4px;
      margin-bottom: 6px;
    }
    .day-event.badge { background: rgba(197, 160, 89, 0.1); color: var(--color-gold); }
    .day-event.exile { background: rgba(197, 48, 48, 0.1); color: #ef4444; }
    .day-event.hunter { background: rgba(245, 158, 11, 0.1); color: #f59e0b; }
    .speeches-details { margin-top: 8px; }
    .speeches-details summary {
      font-size: 0.75rem;
      color: var(--text-muted);
      cursor: pointer;
      padding: 4px 0;
    }
    .speeches-details summary:hover { color: var(--text-secondary); }
    .speeches-list { margin-top: 8px; }
    .speech-item {
      font-size: 0.8rem;
      padding: 8px 10px;
      background: rgba(255,255,255,0.03);
      border-radius: 6px;
      margin-bottom: 6px;
      color: var(--text-secondary);
    }
    .speech-item strong { color: var(--color-gold); }
    .footer {
      text-align: center;
      padding: 40px 20px;
      border-top: 1px solid rgba(197, 160, 89, 0.1);
      margin-top: 40px;
    }
    .footer-link { color: var(--color-gold); font-weight: bold; letter-spacing: 0.1em; }
    .footer-note { color: var(--text-muted); font-size: 0.75rem; margin-top: 8px; }
    @media (max-width: 600px) {
      .awards { grid-template-columns: 1fr; }
      .stats-grid { grid-template-columns: 1fr; }
      .players-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header class="header">
      <h1>Wolfcha</h1>
      <div class="result-banner">${isVillageWin ? "好人阵营获胜" : "狼人阵营获胜"}</div>
    </header>

    <section class="player-info">
      <div class="player-name">${personalStats.userName}</div>
      <div class="player-meta">
        <span>${ROLE_NAMES[personalStats.role] || personalStats.role}</span>
        <span>${formatDuration(duration)}</span>
        <span>${playerCount}人局</span>
      </div>
    </section>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${personalStats.totalScore}</div>
        <div class="stat-label">综合评分</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${primaryTag}</div>
        <div class="stat-label">获得称号</div>
      </div>
    </div>

    <section class="section">
      <h2 class="section-title">能力评估</h2>
      <div class="radar-stats">
        ${radarHTML}
      </div>
    </section>

    <div class="awards">
      <div class="award-card">
        <div class="award-title">最佳表现 MVP</div>
        <div class="award-name">${awards.mvp.playerName}</div>
        <div class="award-reason">${awards.mvp.reason}</div>
      </div>
      <div class="award-card">
        <div class="award-title">虽败犹荣 SVP</div>
        <div class="award-name">${awards.svp.playerName}</div>
        <div class="award-reason">${awards.svp.reason}</div>
      </div>
    </div>

    ${personalStats.highlightQuote ? `
    <section class="section">
      <h2 class="section-title">金句时刻</h2>
      <div class="review-card">
        <p class="review-content">"${personalStats.highlightQuote}"</p>
      </div>
    </section>
    ` : ""}

    <section class="section">
      <h2 class="section-title">玩家身份</h2>
      <div class="players-grid">
        ${playersHTML}
      </div>
    </section>

    <section class="section">
      <h2 class="section-title">对局回顾</h2>
      ${timelineHTML}
    </section>

    ${reviews.length > 0 ? `
    <section class="section">
      <h2 class="section-title">选手评价</h2>
      ${reviewsHTML}
    </section>
    ` : ""}

    <footer class="footer">
      <div class="footer-link">wolf-cha.com</div>
      <div class="footer-note">AI 狼人杀 · 随时开局</div>
    </footer>
  </div>
</body>
</html>`;
}
