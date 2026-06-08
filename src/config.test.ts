import { test, expect } from "bun:test";
import { resolveSlackCreds } from "./config.ts";

test("resolveSlackCreds reads env first", () => {
  const creds = resolveSlackCreds({
    AGP_SLACK_BOT_TOKEN: "xoxb-env",
    AGP_SLACK_APP_TOKEN: "xapp-env",
    AGP_SLACK_CHANNEL: "C-env",
  });
  expect(creds).toEqual({ botToken: "xoxb-env", appToken: "xapp-env", channelId: "C-env" });
});

test("resolveSlackCreds falls back to the config file when env is unset", () => {
  const creds = resolveSlackCreds(
    {},
    { slack: { botToken: "xoxb-cfg", appToken: "xapp-cfg", channel: "C-cfg" } },
  );
  expect(creds).toEqual({ botToken: "xoxb-cfg", appToken: "xapp-cfg", channelId: "C-cfg" });
});

test("resolveSlackCreds prefers env over config per key", () => {
  const creds = resolveSlackCreds(
    { AGP_SLACK_BOT_TOKEN: "xoxb-env" },
    { slack: { botToken: "xoxb-cfg", appToken: "xapp-cfg", channel: "C-cfg" } },
  );
  expect(creds.botToken).toBe("xoxb-env");
  expect(creds.appToken).toBe("xapp-cfg");
});

test("resolveSlackCreds throws when any credential is missing", () => {
  expect(() => resolveSlackCreds({ AGP_SLACK_BOT_TOKEN: "xoxb", AGP_SLACK_APP_TOKEN: "xapp" })).toThrow(
    /slack creds incomplete/,
  );
  expect(() => resolveSlackCreds({})).toThrow(/slack creds incomplete/);
});
