import assert from "node:assert/strict";
import test from "node:test";
import {
  createSinglePlayerContextAuditState,
  isSinglePlayerContextAuditEntrypoint,
  redactAuditArtifact,
  runSinglePlayerContextAudit,
} from "./single-player-context-audit";

test("live 审计文件名不会误触发普通审计入口", () => {
  const state = createSinglePlayerContextAuditState();
  assert.equal(state.players.length, 11);
  assert.equal(state.phase, "DAY_BADGE_SIGNUP");
  assert.equal(
    isSinglePlayerContextAuditEntrypoint("/tmp/live-single-player-context-audit.ts"),
    false
  );
  assert.equal(
    isSinglePlayerContextAuditEntrypoint("/tmp/single-player-context-audit.ts"),
    true
  );
});

test("单人生产提示词链路覆盖所有角色且没有串视角", async () => {
  const report = await runSinglePlayerContextAudit();
  const failures = report.summary.checks.filter((check) => !check.passed);

  assert.deepEqual(failures, []);
  assert.equal(report.summary.playerCount, 11);
  assert.ok(report.summary.aiLogCount >= 90);
  assert.ok(report.summary.transportRequestCount >= report.summary.aiLogCount);
  assert.ok(report.summary.phaseRoleCoverage.length >= 79);
});

test("相同上下文的审计结果可重复", async () => {
  const first = await runSinglePlayerContextAudit();
  const second = await runSinglePlayerContextAudit();

  assert.equal(first.fingerprint, second.fingerprint);
});

test("审计产物会递归脱敏常见凭证", () => {
  const source = {
    prompt: "Authorization: Bearer abc.def.ghi",
    response: ["sk-testsecret123456", "eyJheader.payload.signature"],
  };
  const sanitized = redactAuditArtifact(source);
  const serialized = JSON.stringify(sanitized);

  assert.doesNotMatch(serialized, /abc\.def\.ghi/);
  assert.doesNotMatch(serialized, /sk-testsecret123456/);
  assert.doesNotMatch(serialized, /eyJheader\.payload\.signature/);
  assert.match(serialized, /REDACTED/);
});
