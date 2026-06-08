import { test, expect } from "bun:test";
import { parseBlockAction } from "./socket-mode.ts";
import { ACTION_APPROVE, ACTION_DENY } from "./blocks.ts";

function blockActions(actionId: string, value: unknown, user: unknown): unknown {
  return {
    type: "block_actions",
    user,
    actions: [{ type: "button", action_id: actionId, value }],
  };
}

const operator = { id: "U-operator", is_bot: false };

test("an approve click parses to an approved interaction with the nonce + user", () => {
  const r = parseBlockAction(blockActions(ACTION_APPROVE, "nonce-1", operator));
  expect(r).toEqual({ nonce: "nonce-1", approved: true, userId: "U-operator", isBot: false });
});

test("a deny click parses to approved:false", () => {
  const r = parseBlockAction(blockActions(ACTION_DENY, "nonce-2", operator));
  expect(r?.approved).toBe(false);
  expect(r?.nonce).toBe("nonce-2");
});

test("a bot actor is carried through as isBot:true", () => {
  const r = parseBlockAction(blockActions(ACTION_APPROVE, "n", { id: "B-bot", is_bot: true }));
  expect(r?.isBot).toBe(true);
});

test("an unknown action_id parses to null (ignored as noise)", () => {
  expect(parseBlockAction(blockActions("agp_more", "n", operator))).toBeNull();
  expect(parseBlockAction(blockActions("totally_unrelated", "n", operator))).toBeNull();
});

test("a non-block_actions payload parses to null", () => {
  expect(parseBlockAction({ type: "view_submission", user: operator, actions: [] })).toBeNull();
  expect(parseBlockAction({ type: "hello" })).toBeNull();
});

test("missing or empty actions parses to null", () => {
  expect(parseBlockAction({ type: "block_actions", user: operator, actions: [] })).toBeNull();
  expect(parseBlockAction({ type: "block_actions", user: operator })).toBeNull();
  expect(parseBlockAction({ type: "block_actions", user: operator, actions: [null] })).toBeNull();
});

test("a missing or non-string nonce (button value) parses to null", () => {
  expect(parseBlockAction(blockActions(ACTION_APPROVE, undefined, operator))).toBeNull();
  expect(parseBlockAction(blockActions(ACTION_APPROVE, 123, operator))).toBeNull();
  expect(parseBlockAction(blockActions(ACTION_APPROVE, "", operator))).toBeNull();
});

test("a missing or anonymous user parses to null (no actor to attribute)", () => {
  expect(parseBlockAction(blockActions(ACTION_APPROVE, "n", undefined))).toBeNull();
  expect(parseBlockAction(blockActions(ACTION_APPROVE, "n", { is_bot: false }))).toBeNull();
  expect(parseBlockAction(blockActions(ACTION_APPROVE, "n", { id: "", is_bot: false }))).toBeNull();
});

test("non-object payloads parse to null", () => {
  expect(parseBlockAction(null)).toBeNull();
  expect(parseBlockAction(undefined)).toBeNull();
  expect(parseBlockAction("string")).toBeNull();
  expect(parseBlockAction(42)).toBeNull();
});
