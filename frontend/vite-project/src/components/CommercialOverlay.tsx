import { useEffect } from "react";

interface CommercialOverlayProps {
  onFinish: () => void;
}

const CommercialOverlay = ({ onFinish }: CommercialOverlayProps) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onFinish();
    }, 20500);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onFinish();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onFinish]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 999999,
        background: "#05080f",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <button
        onClick={onFinish}
        style={{
          position: "absolute",
          top: 25,
          right: 40,
          zIndex: 1000000,
          background: "#e5202e",
          color: "#fff",
          border: "none",
          padding: "12px 24px",
          borderRadius: "30px",
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        Skip Commercial ✕
      </button>

      <iframe
        src="/commercial.html"
        title="RESQ Commercial"
        style={{
          width: "100%",
          height: "100%",
          border: "none",
        }}
        allow="autoplay; fullscreen"
        allowFullScreen
      />
    </div>
  );
};

export default CommercialOverlay;