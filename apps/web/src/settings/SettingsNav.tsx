import { useTranslation } from "react-i18next";
import { NavLink } from "react-router";

export function SettingsNav() {
  const { t } = useTranslation();
  const items = [
    { path: "/settings/general", key: "general" },
    { path: "/settings/data", key: "data" },
    { path: "/settings/sync", key: "sync" },
  ] as const;

  return (
    <nav className="settings-nav" aria-label={t("settings.navigation")}>
      {items.map((item) => (
        <NavLink
          className={({ isActive }) =>
            isActive ? "settings-nav-link settings-nav-link-active" : "settings-nav-link"
          }
          key={item.path}
          to={item.path}
        >
          {t(`settings.tabs.${item.key}`)}
        </NavLink>
      ))}
    </nav>
  );
}
