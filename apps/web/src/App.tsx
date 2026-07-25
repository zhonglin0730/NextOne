import { supportedLocales, type SupportedLocale } from "@nextone/i18n";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BrowserRouter, Navigate, NavLink, Route, Routes } from "react-router";

import { BoardPage } from "./board/BoardPage";
import { ProjectDetailPage } from "./projects/ProjectDetailPage";
import { ProjectsPage } from "./projects/ProjectsPage";
import { DailyClosePage } from "./review/DailyClosePage";
import { ReviewCenterPage } from "./review/ReviewCenterPage";
import { SyncIndicator } from "./sync/SyncIndicator";
import { startAutomaticSync } from "./sync/syncService";
import { SyncStatusPage } from "./sync/SyncStatusPage";
import { DataManagementPage } from "./settings/DataManagementPage";
import { SettingsPage } from "./settings/SettingsPage";
import { loadPreferences, localeStorageKey, savePreferences } from "./settings/preferences";
import { CaptureDialog } from "./tasks/CaptureDialog";
import { InboxPage } from "./tasks/InboxPage";
import { TodayPage } from "./today/TodayPage";

const navigation = [
  { key: "today", path: "/today" },
  { key: "inbox", path: "/inbox" },
  { key: "board", path: "/board" },
  { key: "projects", path: "/projects" },
  { key: "review", path: "/review" },
  { key: "settings", path: "/settings/general" },
] as const;

type NavigationKey = (typeof navigation)[number]["key"];

function PlaceholderPage({ pageKey }: { pageKey: NavigationKey }) {
  const { t } = useTranslation();

  return (
    <section className="placeholder" aria-labelledby="page-title">
      <p className="eyebrow">{t("app.tagline")}</p>
      <h1 id="page-title">{t(`nav.${pageKey}`)}</h1>
      <p>{t("shell.comingSoon")}</p>
    </section>
  );
}

function AppShell() {
  const { i18n, t } = useTranslation();
  const [captureOpen, setCaptureOpen] = useState(false);

  useEffect(() => {
    const stopSync = startAutomaticSync();
    void loadPreferences().then((preferences) => {
      document.documentElement.dataset.theme = preferences.theme.toLowerCase();
    });
    return stopSync;
  }, []);

  const changeLocale = async (locale: SupportedLocale) => {
    await i18n.changeLanguage(locale);
    localStorage.setItem(localeStorageKey, locale);
    const preferences = await loadPreferences();
    await savePreferences({
      ...preferences,
      locale,
      updatedAt: new Date().toISOString(),
    });
    document.documentElement.lang = locale;
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand" aria-label={t("app.name")}>
          <span className="brand-mark" aria-hidden="true">
            ✓
          </span>
          <span>{t("app.name")}</span>
        </div>

        <nav className="primary-nav" aria-label={t("shell.primaryNavigation")}>
          {navigation.map((item) => (
            <NavLink
              className={({ isActive }) => (isActive ? "nav-link nav-link-active" : "nav-link")}
              key={item.path}
              to={item.path}
            >
              {t(`nav.${item.key}`)}
            </NavLink>
          ))}
        </nav>

        <label className="locale-field">
          <span>{t("shell.locale")}</span>
          <select
            onChange={(event) => void changeLocale(event.target.value as SupportedLocale)}
            value={i18n.resolvedLanguage ?? i18n.language}
          >
            {supportedLocales.map((locale) => (
              <option key={locale} value={locale}>
                {locale}
              </option>
            ))}
          </select>
        </label>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <SyncIndicator />
          <button className="capture-button" onClick={() => setCaptureOpen(true)} type="button">
            <span aria-hidden="true">＋</span>
            {t("shell.quickCapture")}
          </button>
        </header>

        <Routes>
          <Route element={<Navigate replace to="/today" />} path="/" />
          <Route element={<InboxPage onOpenCapture={() => setCaptureOpen(true)} />} path="/inbox" />
          <Route element={<TodayPage />} path="/today" />
          <Route element={<BoardPage />} path="/board" />
          <Route element={<ProjectsPage />} path="/projects" />
          <Route element={<ProjectDetailPage />} path="/projects/:projectId" />
          <Route element={<ReviewCenterPage />} path="/review" />
          <Route element={<DailyClosePage />} path="/review/daily" />
          <Route element={<SyncStatusPage />} path="/settings/sync" />
          <Route element={<SettingsPage />} path="/settings/general" />
          <Route element={<DataManagementPage />} path="/settings/data" />
          {navigation
            .filter(
              (item) =>
                !["today", "inbox", "board", "projects", "review", "settings"].includes(item.key),
            )
            .map((item) => (
              <Route
                element={<PlaceholderPage pageKey={item.key} />}
                key={item.path}
                path={item.path}
              />
            ))}
          <Route element={<Navigate replace to="/today" />} path="*" />
        </Routes>
      </main>

      <CaptureDialog onClose={() => setCaptureOpen(false)} open={captureOpen} />
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}
