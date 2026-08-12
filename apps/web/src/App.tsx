import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BrowserRouter,
  Link,
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
  useParams,
} from "react-router";

import { BoardPage } from "./board/BoardPage";
import { BrandLogo } from "./brand/BrandLogo";
import { ProjectStructurePage } from "./projects/ProjectStructurePage";
import { ProjectsPage } from "./projects/ProjectsPage";
import { DailyClosePage } from "./review/DailyClosePage";
import { ReviewCenterPage } from "./review/ReviewCenterPage";
import { DataManagementPage } from "./settings/DataManagementPage";
import { loadPreferences } from "./settings/preferences";
import { SettingsPage } from "./settings/SettingsPage";
import { SyncIndicator } from "./sync/SyncIndicator";
import { startAutomaticSync } from "./sync/syncService";
import { SyncStatusPage } from "./sync/SyncStatusPage";
import { CaptureDialog } from "./tasks/CaptureDialog";
import { getCaptureContext } from "./tasks/captureContext";
import { InboxPage } from "./tasks/InboxPage";
import { TodayPage } from "./today/TodayPage";

type NavigationKey = "projects" | "today" | "inbox" | "review" | "board" | "settings";

const navigation = [
  { key: "projects", path: "/projects" },
  { key: "today", path: "/today" },
  { key: "inbox", path: "/inbox" },
  { key: "review", path: "/review" },
] as const satisfies readonly { key: NavigationKey; path: string }[];

function NavigationIcon({ name }: { name: NavigationKey }) {
  const paths: Record<NavigationKey, ReactNode> = {
    today: (
      <>
        <path d="M7 3v3m10-3v3M5 8h14M6 5h12a1 1 0 0 1 1 1v13H5V6a1 1 0 0 1 1-1Z" />
        <path d="m9 14 2 2 4-5" />
      </>
    ),
    inbox: (
      <>
        <path d="M5 5h14l2 9v5H3v-5l2-9Z" />
        <path d="M3 14h5l1.5 2h5L16 14h5" />
      </>
    ),
    board: (
      <>
        <rect height="14" rx="1.5" width="5" x="3" y="5" />
        <rect height="9" rx="1.5" width="5" x="10" y="5" />
        <rect height="12" rx="1.5" width="5" x="17" y="5" />
      </>
    ),
    projects: (
      <>
        <path d="M3 7h7l2 2h9v10H3V7Z" />
        <path d="M3 7V5h7l2 2" />
      </>
    ),
    review: (
      <>
        <path d="M20 8a8 8 0 1 0 1 6" />
        <path d="M20 3v5h-5" />
        <path d="m9 12 2 2 4-5" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19 13.5v-3l-2-.7-.5-1.2.9-1.9-2.1-2.1-1.9.9-1.2-.5-.7-2h-3l-.7 2-1.2.5-1.9-.9-2.1 2.1.9 1.9-.5 1.2-2 .7v3l2 .7.5 1.2-.9 1.9 2.1 2.1 1.9-.9 1.2.5.7 2h3l.7-2 1.2-.5 1.9.9 2.1-2.1-.9-1.9.5-1.2 2-.7Z" />
      </>
    ),
  };

  return (
    <svg
      aria-hidden="true"
      className="nav-icon"
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7">
        {paths[name]}
      </g>
    </svg>
  );
}

function NavigationLinks() {
  const { t } = useTranslation();

  return (
    <>
      {navigation.map((item) => (
        <NavLink
          className={({ isActive }) => (isActive ? "nav-link nav-link-active" : "nav-link")}
          key={item.path}
          to={item.path}
        >
          <NavigationIcon name={item.key} />
          <span className="nav-label">{t(`nav.${item.key}`)}</span>
        </NavLink>
      ))}
    </>
  );
}

function SettingsLink() {
  const { t } = useTranslation();

  return (
    <NavLink
      aria-label={t("nav.settings")}
      className={({ isActive }) =>
        isActive ? "nav-link settings-link nav-link-active" : "nav-link settings-link"
      }
      to="/settings/general"
    >
      <NavigationIcon name="settings" />
      <span className="nav-label">{t("nav.settings")}</span>
    </NavLink>
  );
}

function AppShell() {
  const { t } = useTranslation();
  const location = useLocation();
  const [captureOpen, setCaptureOpen] = useState(false);
  const captureContext = getCaptureContext(location.pathname);
  const captureLabelKey =
    captureContext.defaultDestination === "TODAY"
      ? "shell.addToday"
      : captureContext.defaultDestination === "PROJECT"
        ? "shell.addProjectTask"
        : "shell.quickCapture";

  useEffect(() => {
    const stopSync = startAutomaticSync();
    void loadPreferences().then((preferences) => {
      document.documentElement.dataset.theme = preferences.theme.toLowerCase();
    });
    return stopSync;
  }, []);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        {t("shell.skipToContent")}
      </a>

      <header className="app-header">
        <div className="app-header-inner">
          <Link aria-label={t("app.name")} className="app-brand-link" to="/projects">
            <BrandLogo name={t("app.name")} />
          </Link>

          <nav className="primary-nav" aria-label={t("shell.primaryNavigation")}>
            <NavigationLinks />
          </nav>

          <div className="app-actions">
            <SyncIndicator />
            {location.pathname === "/inbox" ? null : (
              <button
                aria-label={t(captureLabelKey)}
                className="capture-button"
                onClick={() => setCaptureOpen(true)}
                type="button"
              >
                <span aria-hidden="true" className="capture-icon">
                  ＋
                </span>
                <span className="capture-label">{t(captureLabelKey)}</span>
              </button>
            )}
            <SettingsLink />
          </div>
        </div>
      </header>

      <main className="main-content" id="main-content" tabIndex={-1}>
        <Routes>
          <Route element={<Navigate replace to="/projects" />} path="/" />
          <Route element={<InboxPage onOpenCapture={() => setCaptureOpen(true)} />} path="/inbox" />
          <Route element={<TodayPage />} path="/today" />
          <Route element={<BoardPage />} path="/board" />
          <Route element={<ProjectsPage />} path="/projects" />
          <Route element={<BoardPage />} path="/projects/:projectId" />
          <Route element={<ProjectStructurePage />} path="/projects/:projectId/structure" />
          <Route element={<ProjectBoardRedirect />} path="/projects/:projectId/board" />
          <Route element={<ReviewCenterPage />} path="/review" />
          <Route element={<DailyClosePage />} path="/review/daily" />
          <Route element={<SyncStatusPage />} path="/settings/sync" />
          <Route element={<SettingsPage />} path="/settings/general" />
          <Route element={<DataManagementPage />} path="/settings/data" />
          <Route element={<Navigate replace to="/projects" />} path="*" />
        </Routes>
      </main>

      <nav className="mobile-nav" aria-label={t("shell.primaryNavigation")}>
        <NavigationLinks />
        <SettingsLink />
      </nav>

      <CaptureDialog
        defaultDestination={captureContext.defaultDestination}
        {...(captureContext.projectId === undefined
          ? {}
          : { defaultProjectId: captureContext.projectId })}
        onClose={() => setCaptureOpen(false)}
        open={captureOpen}
      />
    </div>
  );
}

function ProjectBoardRedirect() {
  const { projectId } = useParams();
  return <Navigate replace to={projectId === undefined ? "/projects" : `/projects/${projectId}`} />;
}

export function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}
