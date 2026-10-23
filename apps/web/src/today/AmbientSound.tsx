import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AmbientAudio, type AmbientScene } from "./ambientAudio";

const scenes = ["off", "rain", "ocean", "forest"] as const;

function SoundIcon({ scene }: { scene: AmbientScene }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      {scene === "off" ? (
        <>
          <path d="m4 9 4 0 5-4v14l-5-4H4Z" />
          <path d="m17 9 5 6m0-6-5 6" />
        </>
      ) : scene === "rain" ? (
        <>
          <path d="M7 13a5 5 0 1 1 9-6 4 4 0 0 1 1 8H7" />
          <path d="m8 17-1 3m6-3-1 3m6-3-1 3" />
        </>
      ) : scene === "ocean" ? (
        <>
          <path d="M2 9c3-4 5 4 9 0s6 4 11 0M2 15c3-4 5 4 9 0s6 4 11 0" />
        </>
      ) : (
        <>
          <path d="m12 3-6 8h3l-5 6h16l-5-6h3ZM12 17v5" />
        </>
      )}
    </svg>
  );
}

export function AmbientSound({ allowed }: { allowed: boolean }) {
  const { t } = useTranslation();
  const engine = useRef<AmbientAudio | null>(null);
  const [scene, setScene] = useState<AmbientScene>("off");
  const sceneRef = useRef<AmbientScene>("off");
  const [volume, setVolume] = useState(0.35);
  const volumeRef = useRef(0.35);
  const allowedRef = useRef(allowed);
  allowedRef.current = allowed;
  const requestRef = useRef(0);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [supported] = useState(() => "AudioContext" in window);
  useEffect(() => {
    engine.current = new AmbientAudio();
    return () => {
      ++requestRef.current;
      engine.current?.dispose();
      engine.current = null;
    };
  }, []);
  const playScene = (choice: AmbientScene) => {
    const request = ++requestRef.current;
    const audio = engine.current;
    if (!audio) return;
    setBusy(allowedRef.current && choice !== "off");
    void audio
      .play(allowedRef.current ? choice : "off", volumeRef.current)
      .then(() => {
        if (request === requestRef.current) setBusy(false);
      })
      .catch(() => {
        if (request === requestRef.current) {
          setFailed(true);
          setBusy(false);
          sceneRef.current = "off";
          setScene("off");
          void audio.play("off", volumeRef.current).catch(() => {});
        }
      });
  };
  useEffect(() => {
    playScene(sceneRef.current);
  }, [allowed]);
  return (
    <section className="zen-sound" aria-label={t("zen.soundTitle")}>
      <div
        className="zen-sound-options"
        role="group"
        aria-busy={busy}
        aria-label={t("zen.soundTitle")}
      >
        {scenes.map((item) => (
          <button
            type="button"
            key={item}
            aria-pressed={scene === item}
            disabled={!supported && item !== "off"}
            onClick={() => {
              if (sceneRef.current === item && !failed) return;
              setFailed(false);
              sceneRef.current = item;
              setScene(item);
              playScene(item);
            }}
          >
            <SoundIcon scene={item} />
            <span>{t(`zen.sound.${item}`)}</span>
          </button>
        ))}
      </div>
      <div className="zen-volume-slot">
        {scene !== "off" ? (
          <label className="zen-volume">
            <span>{t(volume === 0 ? "zen.muted" : "zen.volume")}</span>
            <input
              aria-label={t("zen.volume")}
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={(event) => {
                const next = Number(event.target.value);
                setVolume(next);
                volumeRef.current = next;
                engine.current?.setVolume(next);
              }}
            />
          </label>
        ) : null}
      </div>
      <div className="zen-sound-message" aria-live="polite">
        {failed ? (
          <p role="alert">{t("zen.soundFailed")}</p>
        ) : !supported ? (
          <p>{t("zen.soundUnsupported")}</p>
        ) : !allowed && scene !== "off" ? (
          <p>{t("zen.soundPaused")}</p>
        ) : null}
      </div>
    </section>
  );
}
