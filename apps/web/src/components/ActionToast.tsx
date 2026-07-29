import { useEffect } from "react";
import { useTranslation } from "react-i18next";

interface ActionToastProps {
  message: string;
  onDismiss: () => void;
}

export function ActionToast({ message, onDismiss }: ActionToastProps) {
  const { t } = useTranslation();

  useEffect(() => {
    if (message.length === 0) {
      return;
    }

    const timeout = window.setTimeout(onDismiss, 4200);
    return () => window.clearTimeout(timeout);
  }, [message, onDismiss]);

  if (message.length === 0) {
    return null;
  }

  return (
    <div aria-live="polite" className="action-toast" role="status">
      <span aria-hidden="true" className="action-toast-icon">
        ✓
      </span>
      <p>{message}</p>
      <button
        aria-label={t("common.close")}
        className="action-toast-close"
        onClick={onDismiss}
        type="button"
      >
        ×
      </button>
    </div>
  );
}
