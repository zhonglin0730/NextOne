# NextOne Mobile / 移动端

NextOne Mobile is a native Expo / React Native client. It does not use WebView
for its core screens.

NextOne Mobile 是原生 Expo / React Native 客户端，核心页面不使用 WebView。

## Run / 运行

From the repository root / 在仓库根目录执行：

```bash
pnpm install
pnpm mobile:dev
```

Scan the QR code with Expo Go on Android. The first launch creates
`nextone.db`; capture and task decisions work without a server. The Settings
tab stores the API endpoint, token, and device identity in Expo SecureStore.

使用 Android 版 Expo Go 扫描二维码。首次启动会创建 `nextone.db`；即使没有服务端，
快速记录和任务决策仍可使用。“设置”页会把 API 地址、令牌和设备标识写入
Expo SecureStore。

For an Android emulator, the default local API is `http://10.0.2.2:8080`.
For a physical device, enter an address the phone can reach. Production should
use HTTPS.

Android 模拟器默认通过 `http://10.0.2.2:8080` 访问本机 API。真机需填写手机可访问的
地址；生产环境应使用 HTTPS。

## Verification / 验证

```bash
pnpm --filter @nextone/mobile check
pnpm --filter @nextone/mobile test
pnpm --filter @nextone/mobile build
```

The Android export verifies Metro bundling only; it does not create a signed
APK. Signed builds and store distribution remain a later release task.

Android 导出用于验证 Metro 打包链路，不会生成签名 APK。签名构建和应用商店分发属于
后续发布工作。
