import { useTranslation } from "react-i18next";

export function ScenicNote() {
  const { t } = useTranslation();
  return (
    <aside className="scenic-note">
      <p>
        {t("shell.sceneryLine")}
        <br />
        {t("shell.scenerySecond")}
      </p>
      <small>{t("shell.sceneryNote")}</small>
    </aside>
  );
}
