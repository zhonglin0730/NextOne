import type { UserPreferences } from "@nextone/storage-contracts";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { createDefaultPreferences, loadPreferences, savePreferences } from "./preferences";
import { SettingsNav } from "./SettingsNav";

const timeZones = [
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Europe/London",
  "America/New_York",
  "America/Los_Angeles",
  "UTC",
] as const;

export function SettingsPage() {
  const { i18n, t } = useTranslation();
  const [preferences, setPreferences] = useState<UserPreferences>();
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void loadPreferences().then(setPreferences);
  }, []);

  if (preferences === undefined) {
    return <section className="page">{t("settings.loading")}</section>;
  }

  const update = <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => {
    setSaved(false);
    setPreferences((current) => (current === undefined ? current : { ...current, [key]: value }));
  };

  const save = async () => {
    const next = { ...preferences, updatedAt: new Date().toISOString() };
    await savePreferences(next);
    await i18n.changeLanguage(next.locale);
    document.documentElement.lang = next.locale;
    setPreferences(next);
    setSaved(true);
  };

  const reset = () => {
    setPreferences(createDefaultPreferences());
    setSaved(false);
  };

  return (
    <section className="page settings-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">{t("settings.eyebrow")}</p>
          <h1>{t("settings.title")}</h1>
          <p>{t("settings.description")}</p>
        </div>
      </header>
      <SettingsNav />

      <div className="settings-layout">
        <section className="panel settings-section">
          <div className="settings-section-heading">
            <span className="settings-section-icon" aria-hidden="true">
              ◎
            </span>
            <div>
              <h2>{t("settings.region.title")}</h2>
              <p>{t("settings.region.description")}</p>
            </div>
          </div>
          <label className="settings-row">
            <span>
              <strong>{t("settings.region.locale")}</strong>
              <small>{t("settings.region.localeHint")}</small>
            </span>
            <select
              onChange={(event) =>
                update("locale", event.target.value as UserPreferences["locale"])
              }
              value={preferences.locale}
            >
              <option value="zh-CN">{t("settings.region.zhCN")}</option>
              <option value="en-XA">{t("settings.region.pseudo")}</option>
            </select>
          </label>
          <label className="settings-row">
            <span>
              <strong>{t("settings.region.timeZone")}</strong>
              <small>{t("settings.region.timeZoneHint")}</small>
            </span>
            <select
              onChange={(event) => update("timeZone", event.target.value)}
              value={preferences.timeZone}
            >
              {!timeZones.includes(preferences.timeZone as (typeof timeZones)[number]) && (
                <option value={preferences.timeZone}>{preferences.timeZone}</option>
              )}
              {timeZones.map((timeZone) => (
                <option key={timeZone} value={timeZone}>
                  {timeZone}
                </option>
              ))}
            </select>
          </label>
          <label className="settings-row">
            <span>
              <strong>{t("settings.region.dateFormat")}</strong>
              <small>{t("settings.region.dateFormatHint")}</small>
            </span>
            <select
              onChange={(event) =>
                update("dateFormat", event.target.value as UserPreferences["dateFormat"])
              }
              value={preferences.dateFormat}
            >
              <option value="LOCALE">{t("settings.region.dateLocale")}</option>
              <option value="ISO">YYYY-MM-DD</option>
            </select>
          </label>
          <label className="settings-row">
            <span>
              <strong>{t("settings.region.weekStartsOn")}</strong>
            </span>
            <select
              onChange={(event) =>
                update("weekStartsOn", event.target.value as UserPreferences["weekStartsOn"])
              }
              value={preferences.weekStartsOn}
            >
              <option value="MONDAY">{t("settings.region.monday")}</option>
              <option value="SUNDAY">{t("settings.region.sunday")}</option>
            </select>
          </label>
          <label className="settings-row">
            <span>
              <strong>{t("settings.region.timeFormat")}</strong>
            </span>
            <select
              onChange={(event) =>
                update("timeFormat", event.target.value as UserPreferences["timeFormat"])
              }
              value={preferences.timeFormat}
            >
              <option value="24H">{t("settings.region.hour24")}</option>
              <option value="12H">{t("settings.region.hour12")}</option>
            </select>
          </label>
          <label className="settings-row">
            <span>
              <strong>{t("settings.region.theme")}</strong>
            </span>
            <select
              onChange={(event) => update("theme", event.target.value as UserPreferences["theme"])}
              value={preferences.theme}
            >
              <option value="SYSTEM">{t("settings.region.themeSystem")}</option>
              <option value="LIGHT">{t("settings.region.themeLight")}</option>
              <option value="DARK">{t("settings.region.themeDark")}</option>
            </select>
          </label>
        </section>

        <section className="panel settings-section">
          <div className="settings-section-heading">
            <span className="settings-section-icon" aria-hidden="true">
              ◇
            </span>
            <div>
              <h2>{t("settings.rules.title")}</h2>
              <p>{t("settings.rules.description")}</p>
            </div>
          </div>
          {(
            [
              ["focusLimit", "focusLimit", 1, 3],
              ["wipLimit", "wipLimit", 1, 3],
              ["dailyCapacityMinutes", "dailyCapacityMinutes", 60, 720],
              ["staleDays", "staleDays", 1, 90],
              ["waitingDays", "waitingDays", 1, 90],
            ] as const
          ).map(([key, label, minimum, maximum]) => (
            <label className="settings-row" key={key}>
              <span>
                <strong>{t(`settings.rules.${label}`)}</strong>
                <small>{t(`settings.rules.${label}Hint`)}</small>
              </span>
              <input
                max={maximum}
                min={minimum}
                onChange={(event) =>
                  update(key, Math.max(minimum, Math.min(maximum, Number(event.target.value))))
                }
                type="number"
                value={preferences[key]}
              />
            </label>
          ))}
          <label className="settings-row">
            <span>
              <strong>{t("settings.rules.defaultSort")}</strong>
            </span>
            <select
              onChange={(event) =>
                update("defaultSort", event.target.value as UserPreferences["defaultSort"])
              }
              value={preferences.defaultSort}
            >
              <option value="MANUAL">{t("settings.rules.sortManual")}</option>
              <option value="CREATED_AT">{t("settings.rules.sortCreated")}</option>
              <option value="DEADLINE">{t("settings.rules.sortDeadline")}</option>
            </select>
          </label>
        </section>
      </div>

      <footer className="settings-actions">
        <button className="button button-quiet" onClick={reset} type="button">
          {t("settings.reset")}
        </button>
        <button className="button button-primary" onClick={() => void save()} type="button">
          {saved ? t("settings.saved") : t("settings.save")}
        </button>
      </footer>
    </section>
  );
}
