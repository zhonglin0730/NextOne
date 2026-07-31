import { describe, expect, it } from "vitest";

import { enXA, supportedLocales, zhCN } from "../src";

describe("task language model", () => {
  it("keeps the visible workflow limited to status, today, and the current task", () => {
    expect(zhCN.today.planned).toBe("今天待做");
    expect(zhCN.today.plannedDescription).toContain("安排在今天");
    expect(zhCN.project.doingGuidance).toContain("全部进行中任务");
    expect(zhCN.project.nextReadyTitle).toBe("下一项待开始");
    expect(zhCN.structure.packageResultHint).toContain("分组");
    expect(zhCN.structure.actionResultHint).toContain("待开始");
    expect(zhCN.structure.createPackageAction).toBe("创建工作包");
    expect(zhCN.structure.createActionAction).toBe("创建任务");
    expect(zhCN.structure.packageTypeLocked).toContain("不会进入任务看板");
    expect(zhCN.structure.assignPackage).toBe("选择工作包");
    expect(zhCN.structure.packagesDescription).toContain("阶段");
    expect(zhCN.structure.taskAssigned).toContain("{{package}}");
    expect(zhCN.zen.open).toBe("专注");
  });
});

describe("shared language resources", () => {
  it("ships Chinese and pseudo-localization from the first milestone", () => {
    expect(supportedLocales).toEqual(["zh-CN", "en-XA"]);
    expect(enXA.nav.today).not.toBe(zhCN.nav.today);
    expect(enXA.nav.today).toContain("［");
    expect(enXA.app.name).toBe("NextOne");
    expect(enXA.settings.region.locale).not.toBe(zhCN.settings.region.locale);
    expect(enXA.data.clearDescription).toContain("［");
  });
});
