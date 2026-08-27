import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const css = readFileSync(join(process.cwd(), "src/components/multiplayer/multiplayer.module.css"), "utf8");
const globalCss = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
const shell = readFileSync(join(process.cwd(), "src/components/multiplayer/MultiplayerGameShell.tsx"), "utf8");
const entry = readFileSync(join(process.cwd(), "src/components/multiplayer/RoomEntry.tsx"), "utf8");
const lobby = readFileSync(join(process.cwd(), "src/components/multiplayer/RoomLobby.tsx"), "utf8");
const hook = readFileSync(join(process.cwd(), "src/hooks/useMultiplayerRoom.ts"), "utf8");
const audio = readFileSync(join(process.cwd(), "src/lib/audio-manager.ts"), "utf8");
const roomPage = readFileSync(join(process.cwd(), "src/app/rooms/[code]/page.tsx"), "utf8");
const roleReveal = readFileSync(join(process.cwd(), "src/components/game/RoleRevealOverlay.tsx"), "utf8");

test("多人牌桌响应式覆盖常见手机宽度且动作栏避让安全区", () => {
  assert.match(css, /@media \(max-width: 980px\)/);
  assert.match(css, /@media \(max-width: 600px\)/);
  assert.doesNotMatch(css, /@media \(max-width: 390px\)/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /\.actionDockContent/);
});

test("多人消息流自动跟随新消息，并突出当前发言者", () => {
  assert.match(shell, /feed\.scrollTo/);
  assert.match(shell, /activeMessages\.length/);
  assert.match(shell, /feedAtBottomRef/);
  assert.match(shell, /feedUnread/);
  assert.match(shell, /gamePlayerSpeaking/);
});

test("多人请求不使用固定超时，连接中断时保留可恢复错误", () => {
  assert.doesNotMatch(hook, /45_000|服务器响应超时/);
  assert.match(hook, /连接中断，操作结果尚未确认/);
  assert.match(hook, /retryConnection/);
});

test("多人语音按稳定 playerId 匹配并按房间作用域清理", () => {
  assert.match(shell, /message\.playerId/);
  assert.doesNotMatch(shell, /item\.displayName === message\.playerName/);
  assert.match(shell, /clearTasks/);
  assert.match(audio, /clearTasks/);
  assert.match(shell, /if \(!enabled\)[\s\S]*for \(const message of activeMessages\) spokenMessageIds\.current\.add\(message\.id\)/);
});

test("异步危险确认处理中不能取消，房主同时拥有退出移交与关闭入口", () => {
  assert.match(lobby, /disabled=\{actionLoading\} onClick=\{\(\) => setConfirmAction\(null\)\}/);
  assert.match(lobby, /退出并移交房主/);
  assert.match(lobby, /关闭房间/);
  assert.match(shell, /<Dialog open=\{confirmLeave\}/);
  assert.doesNotMatch(shell, /role="alertdialog"/);
});

test("身份揭晓使用模态语义并约束键盘焦点", () => {
  assert.match(roleReveal, /role="dialog"/);
  assert.match(roleReveal, /aria-modal="true"/);
  assert.match(roleReveal, /continueButtonRef/);
  assert.match(roleReveal, /event\.key !== "Tab"/);
});

test("房间入口和单行发言统一使用表单提交并阻止重复请求", () => {
  assert.match(entry, /<form className=\{styles\.form\} onSubmit=\{submitRoom\}>/);
  assert.match(entry, /submitInFlightRef\.current/);
  assert.match(entry, /<Button type="submit"/);
  assert.match(shell, /<form className=\{styles\.speechAction\} onSubmit=\{submitSpeech\}>/);
  assert.match(shell, /commandInFlightRef\.current/);
});

test("多人牌局使用单人模式的昼夜 BGM 并响应共享声音设置", () => {
  assert.match(shell, /const DAY_BGM_SRC = "\/bgm\/day\.mp3"/);
  assert.match(shell, /const NIGHT_BGM_SRC = "\/bgm\/night\.mp3"/);
  assert.match(shell, /useGameBgm\(\{/);
  assert.match(shell, /volume: audioSettings\.bgmVolume/);
  assert.match(shell, /enabled: audioSettings\.isSoundEnabled/);
  assert.match(shell, /if \(isSoundEnabled\) unlockBgm\(\)/);
  assert.match(shell, /audioSettings\.isSoundEnabled && !bgmUnlocked/);
  assert.match(shell, />开启声音<\/button>/);
  assert.ok((shell.match(/unlockedRef\.current = false;\s*setUnlocked\(false\)/g) ?? []).length >= 3);
});

test("身份揭示在低高度视口拥有单一滚动容器", () => {
  assert.match(roleReveal, /overflow-hidden wc-role-reveal-overlay/);
  assert.match(roleReveal, /h-full min-h-0[\s\S]*wc-role-reveal-scroll-frame/);
  assert.match(globalCss, /\.wc-role-reveal-card\s*\{[^}]*100dvh/);
  assert.match(globalCss, /\.wc-role-reveal-card \.glass-panel\s*\{[^}]*overflow-y:\s*auto/);
});

test("动作栏用真实高度避让内容并使用动态视口", () => {
  assert.match(shell, /ResizeObserver/);
  assert.match(shell, /visualViewport/);
  assert.match(shell, /--multiplayer-action-bar-height/);
  assert.match(css, /100dvh/);
  assert.match(css, /var\(--multiplayer-action-bar-height/);
  assert.match(
    css,
    /@media \(max-width: 600px\)[\s\S]*?\.gameShell\s*\{[^}]*padding-bottom:\s*calc\([^;]*--multiplayer-action-bar-height[^;]*--multiplayer-keyboard-inset/,
  );
});

test("多人交互复用项目的兼容复制与 UUID 工具", () => {
  assert.match(lobby, /copyToClipboard/);
  assert.match(shell, /generateUUID/);
  assert.doesNotMatch(shell, /crypto\.randomUUID/);
});

test("开局额度 session 可跨刷新恢复且有明确过期时间", () => {
  assert.match(roomPage, /sessionStorage/);
  assert.match(roomPage, /PENDING_MULTIPLAYER_SESSION_TTL_MS/);
  assert.match(roomPage, /writePendingMultiplayerSession/);
  assert.match(roomPage, /clearPendingMultiplayerSession/);
});
