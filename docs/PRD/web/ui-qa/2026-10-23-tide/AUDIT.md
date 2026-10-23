# 专注操作体验复查

本轮沿用已确认的自然场景方向，只处理计时、声音、暂停、退出及其失败状态；不改任务状态模型、同步协议或主页面信息架构。使用 frontend-quality-loop、ui-ux-pro-max 与 vercel-react-best-practices，复用现有专注令牌。

## 修正与行为

- 计时：新增 `FocusClock` 保存毫秒精度，重复短暂停不丢零碎秒数。界面刷新或后台补算不影响实际累计；预设计时的记录不超过预设值。
- 暂停：暂停时间不计入投入；显示“计时已暂停”。此时选择声音只记住场景，继续计时才播放。
- 声音：快速切换以最后一次选择为准，复用一个 AudioContext，保持音量。音量为零标为“静音”，关闭挂起上下文，退出释放；音量区预留空间，切声不顶动计时区。
- 退出：页内确认显示实际将记录的分钟数；确认期间计时与声音暂停。取消后恢复此前的运行/暂停状态。默认聚焦“返回专注”，Esc 取消，Tab 限于确认内；不足一分钟明确不计记录。
- 保存失败：保留冻结的投入快照和原操作，显示原页重试/不保存退出；锁定继续计时与重复状态操作。重试成功后继续原本的退出或完成任务，不统一跳到休息页。
- 任务状态失败：在专注页内反馈，不把错误留在被覆盖的 Today 页面；成功写入的专注投入不重复保存。通知、起身提醒的可选存储失败不把成功记录误判为失败。
- IndexedDB：失败事务仍消费其完成 Promise，避免在原错误外额外产生未处理的 abort 异常。

## 文件

- `apps/web/src/today/ZenMode.tsx`、`TodayPage.tsx`
- `apps/web/src/today/focusClock.ts` 与测试
- `apps/web/src/today/AmbientSound.tsx`、`ambientAudio.ts` 与测试
- `apps/web/src/styles/zen.css`、`packages/i18n/src/index.ts`
- `apps/web/src/storage/indexedDb.ts`
- `apps/web/e2e/focus-controls.e2e.ts`、`zen-immersion.e2e.ts`

## 验证结果

- `pnpm --filter @nextone/web check`：通过。
- `pnpm --filter @nextone/web test`：10 个文件、28 项通过。
- `pnpm --filter @nextone/web build`：通过。
- `pnpm test:e2e`：9 项通过，1 项按现有开关跳过（在线跨浏览器同步）。
- 新回归包括：350ms 短暂停累计、暂停中切声不创建上下文、退出取消恢复状态、确认等待不计投入、保存失败并快速重复重试只记一次、后台补算上限、任务状态失败后再次完成不重复记账。
- 1280×800 与 390×844 实际渲染复查；截图 `audit-exit-1280x800.png`、`audit-exit-390x844.png`。原首版改前截图保留。退出框无横向溢出或遮挡，手机按钮热区可用。
- 内置浏览器实际检查：准备页选声、开始、暂停、暂停中切声、退出确认、Esc 返回保持暂停、确认退出。预览不写用户项目，测试使用隔离浏览器数据。

## 限制与交付

未验证 Safari/Firefox、真实手机及声卡听感。环境声仍是本地合成；浏览器强制刷新/关闭只提供未保存确认，不支持跨刷新恢复进行中的计时。

本轮未提交、未推送。建议提交信息：`fix: harden focus timing audio and exit interactions`。
