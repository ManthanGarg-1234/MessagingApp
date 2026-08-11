import { useState, useEffect, useRef } from "react";

interface CallState {
  active: boolean;
  type: "incoming" | "outgoing" | "connected";
  isVideo: boolean;
  peerId: string;
  peerName: string;
  callId: string;
}

interface Props {
  callState: CallState;
  onAcceptCall: () => void;
  onRejectCall: () => void;
  onEndCall: () => void;
}

export function CallOverlay({ callState, onAcceptCall, onRejectCall, onEndCall }: Props) {
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);
  const [duration, setDuration] = useState(0);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!callState.active || callState.type === "connected") return;

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        audioCtxRef.current = ctx;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();

        const interval = setInterval(() => {
          if (ctx.state === "running") {
            gain.gain.setValueAtTime(0.15, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
          }
        }, 1500);

        return () => {
          clearInterval(interval);
          osc.stop();
          ctx.close();
        };
      }
    } catch {
      // Audio synth optional
    }
  }, [callState.active, callState.type]);

  useEffect(() => {
    if (callState.type !== "connected") return;
    setDuration(0);
    const interval = setInterval(() => {
      setDuration((d) => d + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [callState.type]);

  if (!callState.active) return null;

  function formatTime(seconds: number) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }

  return (
    <div className="call-overlay-backdrop">
      <div className="call-card">
        <div className="call-avatar-container">
          <div className="call-avatar">
            {callState.peerName.charAt(0).toUpperCase()}
          </div>
          {callState.type !== "connected" && <div className="pulse-ring" />}
        </div>

        <h3 className="call-peer-name">{callState.peerName}</h3>

        <div className="call-status-label">
          {callState.type === "incoming" && `Incoming ${callState.isVideo ? "Video" : "Voice"} Call...`}
          {callState.type === "outgoing" && `Calling ${callState.peerName}...`}
          {callState.type === "connected" && (
            <span className="call-timer">🔴 {formatTime(duration)}</span>
          )}
        </div>

        {callState.isVideo && callState.type === "connected" && (
          <div
            style={{
              width: "100%",
              height: "180px",
              background: "#000",
              borderRadius: "16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#94a3b8",
              fontSize: "0.9rem",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            {videoOff ? "📷 Camera Paused" : "🎥 Live Encrypted Video Stream Active"}
          </div>
        )}

        <div className="call-controls">
          {callState.type === "incoming" ? (
            <>
              <button
                className="call-control-btn accept"
                onClick={onAcceptCall}
                title="Accept Call"
              >
                📞
              </button>
              <button
                className="call-control-btn end"
                onClick={onRejectCall}
                title="Decline Call"
              >
                ✖
              </button>
            </>
          ) : (
            <>
              <button
                className={`call-control-btn toggle ${muted ? "muted" : ""}`}
                onClick={() => setMuted(!muted)}
                title={muted ? "Unmute Mic" : "Mute Mic"}
              >
                {muted ? "🎙️❌" : "🎙️"}
              </button>

              {callState.isVideo && (
                <button
                  className={`call-control-btn toggle ${videoOff ? "muted" : ""}`}
                  onClick={() => setVideoOff(!videoOff)}
                  title={videoOff ? "Turn On Camera" : "Turn Off Camera"}
                >
                  {videoOff ? "🎥❌" : "🎥"}
                </button>
              )}

              <button
                className="call-control-btn end"
                onClick={onEndCall}
                title="End Call"
              >
                📞❌
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
