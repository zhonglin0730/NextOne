import { defaultLocale, resources } from "@nextone/i18n";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

void i18n.use(initReactI18next).init({
  fallbackLng: defaultLocale,
  interpolation: {
    escapeValue: false,
  },
  lng: defaultLocale,
  resources,
});

export { i18n };
