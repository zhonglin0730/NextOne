import "@nextone/design-tokens/tokens.css";
import "../styles/foundation.css";
import "../styles/zen.css";
import "../i18n";
import type { Task } from "@nextone/domain";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { ZenMode } from "../today/ZenMode";

// Vite-only entry, deliberately excluded from the production index/build inputs.
// The production component is used with in-memory callbacks; no task or preference writes.
const sample: Task = {
  id: "focus-preview",
  userId: "preview",
  title: "梳理下一版的核心流程",
  status: "DOING",
  visibility: "ACTIVE",
  sortKey: "preview",
  revision: 1,
  createdAt: "2026-10-23T08:00:00Z",
  updatedAt: "2026-10-23T08:00:00Z",
  note: "这是一项预览任务。计时和声音可以体验，操作不会保存到你的项目。",
};

function Preview() {
  const [open, setOpen] = useState(true);
  return open ? (
    <ZenMode
      task={sample}
      preferences={{
        focusDurationMinutes: 25,
        breakDurationMinutes: 5,
        movementReminderMinutes: 50,
        focusNotificationsEnabled: false,
      }}
      onClose={() => setOpen(false)}
      onRecordFocus={async () => {}}
      onTransition={async () => true}
    />
  ) : (
    <main className="page">
      <h1>专注体验预览</h1>
      <p>本页操作没有保存到你的项目。</p>
      <button className="button button-primary" onClick={() => setOpen(true)}>
        重新体验
      </button>{" "}
      <a href="/today">进入 NextOne 今天页</a>
    </main>
  );
}
if (import.meta.env.DEV) createRoot(document.getElementById("root")!).render(<Preview />);
