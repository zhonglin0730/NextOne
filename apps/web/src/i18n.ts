import { defaultLocale, resources, supportedLocales, type SupportedLocale } from "@nextone/i18n";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const storedLocale = localStorage.getItem("nextone.preferences.locale");
const initialLocale = supportedLocales.includes(storedLocale as SupportedLocale)
  ? (storedLocale as SupportedLocale)
  : defaultLocale;

void i18n.use(initReactI18next).init({
  fallbackLng: defaultLocale,
  interpolation: {
    escapeValue: false,
  },
  lng: initialLocale,
  resources,
});

export { i18n };
