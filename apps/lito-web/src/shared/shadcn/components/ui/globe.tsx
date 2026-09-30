/* eslint-disable */

import { useEffect, useRef } from "react";
import createGlobe, { type COBEOptions } from "cobe";
import { useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { CircleAlert, LoaderCircle } from "lucide-react";
import {
  useWeather,
  getWeatherEmoji,
  getUVDescription,
} from "@/shared/hooks/useWeather";
import { cn } from "../../lib/utils";

const MOVEMENT_DAMPING = 1400;

const WEATHER_LOCATION: [number, number] = [43.5853, 39.7203];

const GLOBE_CONFIG: COBEOptions = {
  width: 800,
  height: 800,
  devicePixelRatio: 2,
  phi: 3.83,
  theta: 0.5,
  dark: 0,
  diffuse: 0.4,
  mapSamples: 16000,
  mapBrightness: 1.2,
  baseColor: [1, 1, 1],
  markerColor: [59 / 255, 130 / 255, 246 / 255],
  glowColor: [1, 1, 1],
  markers: [
    {
      location: WEATHER_LOCATION,
      size: 0.05,
    },
  ],
  scale: 1.0,
};

function projectLocation(lat: number, lng: number, phi: number, width: number) {
  const latRad = (lat * Math.PI) / 180;
  const lngRad = (lng * Math.PI) / 180;

  const x = Math.cos(latRad) * Math.sin(lngRad);
  const y = Math.sin(latRad);
  const z = Math.cos(latRad) * Math.cos(lngRad);

  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  const rx = x * cosPhi - z * sinPhi;
  const rz = x * sinPhi + z * cosPhi;

  const visible = rz > 0;

  const radius = width / 2;

  return {
    x: radius + rx * radius,
    y: radius - y * radius,
    visible,
  };
}

export function Globe({
  className,
  config = GLOBE_CONFIG,
}: {
  className?: string;
  config?: COBEOptions;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const weatherRef = useRef<HTMLDivElement>(null);

  const phiRef = useRef(0);
  const reduceMotion = useReducedMotion();
  const reduceMotionRef = useRef(reduceMotion);

  useEffect(() => {
    reduceMotionRef.current = reduceMotion;
  }, [reduceMotion]);

  const { weather, loading, error } = useWeather(
    WEATHER_LOCATION[0],
    WEATHER_LOCATION[1]
  );

  const pointerInteracting = useRef<number | null>(null);
  const pointerInteractionMovement = useRef(0);

  const r = useMotionValue(0);

  const rs = useSpring(r, {
    mass: 1,
    damping: 30,
    stiffness: 100,
  });

  const updatePointerInteraction = (value: number | null) => {
    pointerInteracting.current = value;

    if (canvasRef.current) {
      canvasRef.current.style.cursor = value !== null ? "grabbing" : "grab";
    }
  };

  const updateMovement = (clientX: number) => {
    if (pointerInteracting.current !== null) {
      const delta = clientX - pointerInteracting.current;

      pointerInteractionMovement.current = delta;

      r.set(r.get() + delta / MOVEMENT_DAMPING);
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let globe: ReturnType<typeof createGlobe> | null = null;
    let frameId = 0;
    let width = 0;

    const initGlobe = (nextWidth: number) => {
      if (nextWidth <= 0) return;

      width = nextWidth;

      globe?.destroy();
      globe = createGlobe(canvas, {
        ...config,
        width: nextWidth * 2,
        height: nextWidth * 2,
      });

      canvas.style.opacity = "1";
    };

    const resizeObserver = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width ?? 0;
      if (nextWidth <= 0) return;

      if (!globe) {
        initGlobe(nextWidth);
        return;
      }

      width = nextWidth;
    });

    resizeObserver.observe(canvas);

    const animate = () => {
      if (globe && width > 0) {
        if (pointerInteracting.current === null && !reduceMotionRef.current) {
          phiRef.current += 0.005;
        }

        const phi = phiRef.current + rs.get();

        globe.update({
          phi,
          width: width * 2,
          height: width * 2,
        });

        const projected = projectLocation(
          WEATHER_LOCATION[0],
          WEATHER_LOCATION[1],
          phi,
          width
        );

        if (weatherRef.current) {
          weatherRef.current.style.left = `${projected.x}px`;
          weatherRef.current.style.top = `${projected.y}px`;
          weatherRef.current.style.opacity = projected.visible ? "1" : "0";
        }
      }

      frameId = requestAnimationFrame(animate);
    };

    frameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      globe?.destroy();
    };
  }, [config]);

  return (
    <div
      className={cn(
        "absolute inset-0 mx-auto aspect-square w-full max-w-100",
        className
      )}
    >
      <canvas
        ref={canvasRef}
        className={cn(
          "size-full opacity-0 transition-opacity duration-500 contain-[layout_paint_size]"
        )}
        onPointerDown={(e) => {
          pointerInteracting.current = e.clientX;
          updatePointerInteraction(e.clientX);
        }}
        onPointerUp={() => updatePointerInteraction(null)}
        onPointerOut={() => updatePointerInteraction(null)}
        onMouseMove={(e) => updateMovement(e.clientX)}
        onTouchMove={(e) =>
          e.touches[0] && updateMovement(e.touches[0].clientX)
        }
      />

      <div
        ref={weatherRef}
        className="pointer-events-none absolute transition-opacity duration-300"
        style={{
          left: 0,
          top: 0,
          opacity: 0,
          transform: "translate(-50%, 120%)",
        }}
      >
        <div className="relative w-48 overflow-hidden rounded-xl border border-border bg-card px-3 py-2 text-card-foreground shadow-lg">
          {loading ? (
            <div className="relative flex items-center justify-center gap-1.5">
              <LoaderCircle
                aria-hidden="true"
                className="size-4 text-primary motion-safe:animate-spin"
              />
              <div className="text-xs font-medium text-muted-foreground">
                Загрузка…
              </div>
            </div>
          ) : error ? (
            <div className="relative flex items-center justify-center gap-1.5">
              <CircleAlert
                aria-hidden="true"
                className="size-4 text-destructive"
              />
              <div className="text-xs font-medium text-destructive">Ошибка</div>
            </div>
          ) : weather ? (
            <>
              <div className="relative flex items-center justify-between gap-2">
                <div className="flex flex-col items-center">
                  <div className="text-2xl drop-shadow-md">
                    {getWeatherEmoji(weather.weatherCode)}
                  </div>
                </div>
                <div className="flex flex-1 flex-col">
                  <div className="text-xl font-bold">
                    {weather.temperature}°C
                  </div>
                  <div className="text-xs font-medium text-muted-foreground">
                    {weather.location}
                  </div>
                </div>
              </div>
              <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-1 border-t border-border pt-1.5">
                <div className="flex flex-col">
                  <div className="text-xs leading-tight text-muted-foreground">
                    Ощущается
                  </div>
                  <div className="text-xs leading-tight font-semibold">
                    {weather.apparentTemperature}°C
                  </div>
                </div>
                <div className="flex flex-col">
                  <div className="text-xs leading-tight text-muted-foreground">
                    Влажность
                  </div>
                  <div className="text-xs leading-tight font-semibold">
                    {weather.humidity}%
                  </div>
                </div>
                <div className="flex flex-col">
                  <div className="text-xs leading-tight text-muted-foreground">
                    Ветер
                  </div>
                  <div className="text-xs leading-tight font-semibold">
                    {weather.windSpeed} км/ч
                  </div>
                </div>
                <div className="flex flex-col">
                  <div className="text-xs leading-tight text-muted-foreground">
                    Давление
                  </div>
                  <div className="text-xs leading-tight font-semibold">
                    {weather.pressure} гПа
                  </div>
                </div>
                <div className="col-span-2 flex flex-col">
                  <div className="text-xs leading-tight text-muted-foreground">
                    UV-индекс
                  </div>
                  <div className="text-xs leading-tight font-semibold">
                    {weather.uvIndex} {getUVDescription(weather.uvIndex)}
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
