
import { useEffect, useRef } from "react";
import { Blob as ShuriBlobRenderer } from "./blob/blob.js";
import "./ShuriBlob.css";

export default function ShuriBlob() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let rendererBlob;
    let animationId;
    let stopped = false;
    let rendererInitialized = false;

    async function startBlob() {
      try {
        // Use a square canvas so the orb stays round in its panel.
        canvas.width = 512;
        canvas.height = 512;

        rendererBlob = new ShuriBlobRenderer(canvas);

        // Initialise WebGPU before starting the animation.
        await rendererBlob.renderer.init();

        if (stopped) {
          rendererBlob.renderer.dispose();
          rendererInitialized = false;
          return;
        }

        function animate(timestamp) {
          if (stopped) return;

          rendererBlob.animate(timestamp, {
            detail: 32,
            blobSize: 1.3,
            spikeRatio: 0.3,
            spikes: 0.2,
            speed: 0.02,
            gammaFactor: 1.1,
            shadows: false,

            blobMaterial: {
              color: "#ffd09c",
              emissive: "#000000",
              specular: "#ffffff",
              shininess: 70,
              wireframe: false,
            },

            ambientLight: {
              color: "#ffffff",
              intensity: 1,
            },

            directionalLight1: {
              color: "#a98bff",
              intensity: 0.8,
              positionX: -2,
              positionY: 2,
              positionZ: 3,
              bias: 0,
              normalBias: 0.015,
              helper: false,
            },

            directionalLight2: {
              color: "#70cfff",
              intensity: 0.5,
              positionX: 2,
              positionY: -1,
              positionZ: 2,
              bias: 0.015,
              normalBias: 0,
              helper: false,
            },
          });

          animationId = requestAnimationFrame(animate);
        }

        animationId = requestAnimationFrame(animate);
      } catch (error) {
        console.error("SHURI blob failed to start:", error);
      }
    }

    startBlob();

    return () => {
      stopped = true;
      cancelAnimationFrame(animationId);

      if (rendererBlob && rendererInitialized) {
        rendererBlob.renderer.dispose();
        rendererInitialized = false;
    }
    };
  }, []);

  return (
    <div className="shuri-blob-container">
      <canvas ref={canvasRef} className="shuri-blob-canvas" />
    </div>
  );
}
