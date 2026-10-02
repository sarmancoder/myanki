"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { pickVoiceForLang, toSpeakableText, toSpeechLang } from "@/lib/study/speech";
import type { StudyCardView } from "@/types/study";

interface StudyCardAudioProps {
  card: StudyCardView;
  /** `false` silencia la pronunciación sin dejar de pintar el reproductor. */
  enabled: boolean;
  /**
   * Id de la tarjeta que hay que pronunciar ahora mismo, o `null` cuando no toca
   * hablar (pausa, espera entre pasos de aprendizaje o revisión de una tarjeta ya
   * respondida). Al cambiar de valor se dispara la reproducción.
   */
  autoPlayKey: string | null;
}

/** Icono de altavoz del botón de reproducción. */
function SpeakerIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
      <path d="M11 4.7v14.6a1 1 0 0 1-1.53.85l-3.9-2.48H4a1 1 0 0 1-1-1V7.28a1 1 0 0 1 1-1h1.57l3.9-2.48A1 1 0 0 1 11 4.7Z" />
      <path d="M16.3 8.3a1 1 0 0 1 1.4.06 5.5 5.5 0 0 1 0 7.28 1 1 0 1 1-1.46-1.36 3.5 3.5 0 0 0 0-4.56 1 1 0 0 1 .06-1.42Zm3.05-3.05a1 1 0 0 1 1.4.07 9.5 9.5 0 0 1 0 13.36 1 1 0 0 1-1.47-1.35 7.5 7.5 0 0 0 0-10.66 1 1 0 0 1 .07-1.42Z" />
    </svg>
  );
}

/** El motor de voz del navegador puede no existir (SSR, navegadores antiguos). */
function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/**
 * Pronunciación del anverso.
 *
 * Si la tarjeta tiene un audio subido manda ese archivo; si no, se recurre a la
 * Web Speech API con la voz del idioma del mazo. Suena sola al presentar la tarjeta,
 * que es justo cuando el usuario la está leyendo, y el botón permite repetirla.
 *
 * Los navegadores no dejan sonar nada sin una interacción previa del usuario, así
 * que la primera pulsación en la página "abre" el canal de audio; a partir de ahí la
 * reproducción automática de las siguientes tarjetas sí funciona.
 */
export default function StudyCardAudio({ card, enabled, autoPlayKey }: StudyCardAudioProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const speechText = toSpeakableText(card.front);
  const lang = toSpeechLang(card.languageCode);
  const hasUploadedAudio = card.audioUrl !== null;

  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);
  /** Id de la tarjeta que se está oyendo ahora, o `null` si no suena nada. */
  const [playingCardId, setPlayingCardId] = useState<string | null>(null);
  const isPlaying = playingCardId === card.id;

  // Las voces del sistema se publican de forma asíncrona: hay que leerlas otra
  // vez cuando llega el evento, no solo al montar.
  useEffect(() => {
    if (!canSpeak()) {
      return;
    }

    function syncVoices() {
      setVoice(pickVoiceForLang(window.speechSynthesis.getVoices(), lang));
    }

    syncVoices();
    window.speechSynthesis.addEventListener("voiceschanged", syncVoices);

    return () => window.speechSynthesis.removeEventListener("voiceschanged", syncVoices);
  }, [lang]);

  /**
   * Lanza la locución. No toca estado: lo actualizan los eventos de la locución, que
   * llegan de forma asíncrona.
   */
  const speak = useCallback(() => {
    if (!canSpeak() || speechText.length === 0) {
      return;
    }

    // Se cancela lo que estuviera sonando: al repetir hay que empezar de cero.
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(speechText);

    if (voice) {
      utterance.voice = voice;
    }

    if (lang) {
      utterance.lang = lang;
    }

    utterance.onstart = () => setPlayingCardId(card.id);
    utterance.onend = () => setPlayingCardId(null);
    utterance.onerror = () => setPlayingCardId(null);

    window.speechSynthesis.speak(utterance);
  }, [speechText, voice, lang, card.id]);

  // Al cambiar de tarjeta se calla lo anterior: si no, el usuario sigue oyendo la
  // tarjeta anterior mientras lee la siguiente. El estado no hay que tocarlo, al
  // cambiar de tarjeta `playingCardId` deja de coincidir y el botón se apaga solo.
  useEffect(() => {
    if (canSpeak()) {
      window.speechSynthesis.cancel();
    }
  }, [card.id]);

  useEffect(
    () => () => {
      if (canSpeak()) {
        window.speechSynthesis.cancel();
      }
    },
    []
  );

  // Primera interacción de la página: desbloquea el audio del navegador para que
  // las siguientes tarjetas suenen solas.
  useEffect(() => {
    function unlock() {
      if (hasUploadedAudio) {
        const audio = audioRef.current;

        if (audio) {
          // Un volumen cero no oye nadie pero deja el elemento "calentado".
          const previousMuted = audio.muted;
          audio.muted = true;
          void audio.play().then(
            () => {
              audio.pause();
              audio.muted = previousMuted;
            },
            () => {
              audio.muted = previousMuted;
            }
          );
        }

        return;
      }

      if (canSpeak()) {
        // Una locución vacía es la forma canónica de desbloquear la síntesis.
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(""));
      }
    }

    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });

    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [hasUploadedAudio]);

  // Reproducción automática al presentar la tarjeta.
  useEffect(() => {
    if (!enabled || autoPlayKey !== card.id) {
      return;
    }

    if (hasUploadedAudio) {
      const audio = audioRef.current;

      if (audio) {
        audio.currentTime = 0;
        void audio.play().catch(() => setPlayingCardId(null));
      }

      return;
    }

    speak();
  }, [enabled, autoPlayKey, card.id, hasUploadedAudio, speak]);

  if (!hasUploadedAudio && speechText.length === 0) {
    return null;
  }

  // El reproductor nativo solo aparece cuando hay archivo: el motor de voz no da
  // barra de progreso, así que se sustituye por el botón de escucha.
  if (hasUploadedAudio) {
    return (
      <audio
        ref={audioRef}
        controls
        src={card.audioUrl ?? undefined}
        className="w-full max-w-sm"
        aria-label="Audio de la tarjeta"
      >
        Tu navegador no admite la reproducción de audio.
      </audio>
    );
  }

  return (
    <button
      type="button"
      onClick={enabled ? speak : undefined}
      disabled={!enabled}
      aria-label="Escuchar el anverso"
      title={
        enabled
          ? "Escuchar el anverso"
          : "Sonido desactivado: actívalo con el botón 🔊 de la cabecera"
      }
      className="flex w-fit items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-secondary disabled:opacity-50"
    >
      <SpeakerIcon />
      <span>{isPlaying ? "Sonando…" : "Escuchar"}</span>
    </button>
  );
}