import { useState, useEffect, useRef } from "react";

interface Props {
  apiBase: string;
  token: string;
  onConversationReady: (conversationId: string, peerPublicKey: string) => void;
}

export function SoundPairing({ apiBase, token, onConversationReady }: Props) {
  const [mode, setMode] = useState<"transmit" | "listen">("transmit");
  const [pairingCode, setPairingCode] = useState<string>("");
  const [transmitting, setTransmitting] = useState(false);
  const [listening, setListening] = useState(false);
  const [detectedCode, setDetectedCode] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setPairingCode(code);
    initHostPairingSession(code);
  }, []);

  async function initHostPairingSession(code: string) {
    try {
      const res = await fetch(`${apiBase}/api/pairing/host`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ deviceId: `sound_dev_${code}` }),
      });
      const data = await res.json();
      if (res.ok && data.sessionId) {
        pollPairingSession(data.sessionId);
      }
    } catch {
      // ignore
    }
  }

  async function pollPairingSession(sessionId: string) {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${apiBase}/api/pairing/status/${sessionId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok && data.status === "completed" && data.conversationId) {
          clearInterval(interval);
          setStatusMessage("Sound-Wave pairing complete!");
          onConversationReady(data.conversationId, data.peerPublicKey || "");
        }
      } catch {
        // ignore
      }
    }, 2000);

    return () => clearInterval(interval);
  }

  function startUltrasonicTransmit() {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;

      setTransmitting(true);
      setStatusMessage("Broadcasting ultrasonic sound chirp...");

      const digits = pairingCode.split("").map((d) => parseInt(d, 10));
      let currentIdx = 0;

      const interval = setInterval(() => {
        if (!ctx || ctx.state !== "running") return;
        const digit = digits[currentIdx % digits.length];
        const freq = 17000 + digit * 300;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.25);

        currentIdx++;
      }, 350);

      setTimeout(() => {
        clearInterval(interval);
        setTransmitting(false);
        setStatusMessage("Ultrasonic broadcast finished.");
      }, 10000);
    } catch {
      setStatusMessage("Audio Context not supported on this browser.");
    }
  }

  async function startMicrophoneListener() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);

      setListening(true);
      setStatusMessage("Listening for nearby ultrasonic chirp...");

      const buffer = new Float32Array(analyser.frequencyBinCount);
      let detectedDigits: number[] = [];

      const checkFreq = () => {
        analyser.getFloatFrequencyData(buffer);
        let maxVal = -Infinity;
        let maxIndex = 0;

        for (let i = 0; i < buffer.length; i++) {
          if (buffer[i] > maxVal) {
            maxVal = buffer[i];
            maxIndex = i;
          }
        }

        const nyquist = ctx.sampleRate / 2;
        const peakFreq = (maxIndex * nyquist) / buffer.length;

        if (peakFreq >= 17000 && peakFreq <= 20000 && maxVal > -60) {
          const digit = Math.round((peakFreq - 17000) / 300);
          if (digit >= 0 && digit <= 9) {
            detectedDigits.push(digit);
            if (detectedDigits.length >= 6) {
              const codeStr = detectedDigits.slice(0, 6).join("");
              setDetectedCode(codeStr);
              setStatusMessage(`Sound wave decoded! Pairing code: ${codeStr}`);
              joinViaDecodedCode(codeStr);
              stream.getTracks().forEach((t) => t.stop());
              return;
            }
          }
        }

        animFrameRef.current = requestAnimationFrame(checkFreq);
      };

      animFrameRef.current = requestAnimationFrame(checkFreq);

      setTimeout(() => {
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        stream.getTracks().forEach((t) => t.stop());
        setListening(false);
      }, 15000);
    } catch {
      setStatusMessage("Microphone permission required for sound wave pairing.");
    }
  }

  async function joinViaDecodedCode(code: string) {
    try {
      const res = await fetch(`${apiBase}/api/pairing/join`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          pairingLink: `aethersync://pair?session=sound_${code}`,
          identityPublicKey: "sound_e2ee_key",
        }),
      });
      const data = await res.json();
      if (res.ok && data.conversationId) {
        onConversationReady(data.conversationId, data.peerPublicKey || "");
      }
    } catch {
      // ignore
    }
  }

  return (
    <div className="pairing-host">
      <div style={{ display: "flex", justifyContent: "center", gap: "8px", marginBottom: "16px" }}>
        <button
          className={`auth-tab ${mode === "transmit" ? "active" : ""}`}
          onClick={() => setMode("transmit")}
        >
          🔊 Transmit Chirp
        </button>
        <button
          className={`auth-tab ${mode === "listen" ? "active" : ""}`}
          onClick={() => setMode("listen")}
        >
          🎙️ Listen &amp; Decode
        </button>
      </div>

      <div style={{ fontSize: "3rem", margin: "10px 0" }}>
        {mode === "transmit" ? "🔊" : "🎙️"}
      </div>

      <h3>{mode === "transmit" ? "Ultrasonic Sound Wave Transmitter" : "Ultrasonic Microphone Listener"}</h3>
      <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", maxWidth: "380px", margin: "0 auto 16px auto" }}>
        {mode === "transmit"
          ? "Emits high-frequency ultrasonic audio tones carrying your encrypted pairing code to nearby devices."
          : "Uses microphone frequency spectral analysis to decode pairing audio tones emitted by a friend's phone."}
      </p>

      {mode === "transmit" ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "14px" }}>
          <div style={{ background: "rgba(6,182,212,0.12)", border: "1px solid var(--accent-cyan)", padding: "12px 24px", borderRadius: "16px", fontSize: "1.8rem", fontWeight: 700, letterSpacing: "4px", color: "white", fontFamily: "monospace" }}>
            {pairingCode}
          </div>

          <button
            className="submit-auth-btn"
            style={{ maxWidth: "260px" }}
            onClick={startUltrasonicTransmit}
            disabled={transmitting}
          >
            {transmitting ? "🔊 Chirping Audio Waves..." : "Play Sound Chirp"}
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "14px" }}>
          {detectedCode && (
            <div style={{ background: "rgba(16,185,129,0.15)", border: "1px solid var(--accent-emerald)", padding: "10px 16px", borderRadius: "12px", color: "var(--accent-emerald)", fontWeight: 700 }}>
              Decoded Chirp Code: {detectedCode}
            </div>
          )}

          <button
            className="submit-auth-btn"
            style={{ maxWidth: "260px" }}
            onClick={startMicrophoneListener}
            disabled={listening}
          >
            {listening ? "🎙️ Listening Frequencies..." : "Start Mic Listener"}
          </button>
        </div>
      )}

      {statusMessage && (
        <div style={{ marginTop: "16px", fontSize: "0.85rem", color: "var(--accent-cyan)", fontWeight: 500 }}>
          {statusMessage}
        </div>
      )}
    </div>
  );
}
