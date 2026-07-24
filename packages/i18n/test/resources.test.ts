import { describe, expect, it } from "vitest";

import { enXA, supportedLocales, zhCN } from "../src";

describe("shared language resources", () => {
  it("ships Chinese and pseudo-localization from the first milestone", () => {
    expect(supportedLocales).toEqual(["zh-CN", "en-XA"]);
    expect(enXA.nav.today).not.toBe(zhCN.nav.today);
    expect(enXA.nav.today).toContain("［");
    expect(enXA.app.name).toBe("NextOne");
  });
});
