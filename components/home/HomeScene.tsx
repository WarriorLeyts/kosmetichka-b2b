"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

/*
 * Сцена главной страницы — перенос HomeScene из приложения: одна и та же коробка
 * (плоская → открытая → закрытая, наш белый логотип-сердце) и четыре товара. Товары стоят над
 * плоской коробкой, зависают над открытой, по одному падают за её переднюю стенку, коробка закрывается.
 * Сцена проигрывается сама, как видео, и останавливается на закрытой коробке; снова — при каждом
 * заходе на главную и при возврате во вкладку.
 */

// координаты — в пикселях макета (ширина 853); кадр — y 630…1395
const FW = 853;
const FY = 630;
const FH = 765;
const CLIP = 1335;

type Box = { src: string; x: number; y: number; w: number; h: number };
const BOX: Record<"flat" | "open" | "front" | "closed", Box> = {
  flat: { src: "/app/home2/box-flat.png", x: 0, y: 1056, w: 853, h: 306 },
  open: { src: "/app/home2/box-open.png", x: 0, y: 845, w: 853, h: 541 },
  front: { src: "/app/home2/box-open-front.png", x: 0, y: 845, w: 853, h: 541 },
  closed: { src: "/app/home2/box-closed.png", x: -79, y: 924, w: 981, h: 446 },
};

type Pose = { cx: number; cy: number; r: number; k: number };
const PRODUCTS: { src: string; w: number; h: number; a: Pose; b: Pose; c: Pose; drop: [number, number] }[] = [
  { src: "/app/home/tube.png", w: 175, h: 366, a: { cx: 514, cy: 865, r: 0, k: 1 }, b: { cx: 478, cy: 930, r: 14, k: 0.85 }, c: { cx: 455, cy: 1270, r: 6, k: 0.8 }, drop: [0.36, 0.44] },
  { src: "/app/home/perfume.png", w: 222, h: 331, a: { cx: 208, cy: 875, r: 0, k: 1 }, b: { cx: 290, cy: 800, r: -12, k: 0.85 }, c: { cx: 330, cy: 1260, r: -4, k: 0.8 }, drop: [0.42, 0.5] },
  { src: "/app/home/jar.png", w: 285, h: 267, a: { cx: 689, cy: 928, r: 0, k: 1 }, b: { cx: 640, cy: 815, r: 12, k: 0.8 }, c: { cx: 560, cy: 1250, r: 4, k: 0.72 }, drop: [0.48, 0.56] },
  { src: "/app/home/lipstick.png", w: 93, h: 285, a: { cx: 368, cy: 910, r: 0, k: 1 }, b: { cx: 515, cy: 790, r: 24, k: 0.8 }, c: { cx: 500, cy: 1250, r: 10, k: 0.8 }, drop: [0.54, 0.62] },
];

const TEXTS = [
  { a: "Всё для вашей", b: "красоты", grad: "linear-gradient(90deg,#6a2bf0,#b62ee6,#f0388f)", sub: "Косметика и парфюмерия для себя и бизнеса" },
  { a: "Собираем", b: "ваш заказ", grad: "linear-gradient(90deg,#d81fa8,#f0388f)", sub: "Любимые средства — вместе. Каждая деталь с заботой" },
  { a: "Выбирайте", b: "любимое", grad: "linear-gradient(90deg,#6a2bf0,#b62ee6,#f0388f)", sub: "Для себя, в подарок и для вашего бизнеса" },
];

// «видео»: 0 — плоская коробка, ~0.5 — товары падают, 0.74 — коробка закрыта
const linear = (t: number) => t;
const inOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const TIMELINE: [number, number, number, (t: number) => number][] = [
  [0, 0.24, 1600, linear],
  [0.24, 0.36, 1500, inOutCubic],
  [0.36, 0.62, 2800, linear],
  [0.62, 0.74, 1500, inOutCubic],
];
const TOTAL = TIMELINE.reduce((s, x) => s + x[2], 0);
const END = 0.74;

function progressAt(ms: number) {
  let t = ms;
  for (const [from, to, dur, ease] of TIMELINE) {
    if (t <= dur) return from + (to - from) * ease(t / dur);
    t -= dur;
  }
  return END;
}

function num(p: number, input: number[], out: number[]) {
  if (p <= input[0]) return out[0];
  for (let i = 1; i < input.length; i++) {
    if (p <= input[i]) {
      const f = (p - input[i - 1]) / (input[i] - input[i - 1] || 1);
      return out[i - 1] + (out[i] - out[i - 1]) * f;
    }
  }
  return out[out.length - 1];
}

export function HomeScene() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [p, setP] = useState(0);
  const [size, setSize] = useState({ w: 0, artH: 380 });
  const raf = useRef<number | null>(null);

  const play = useCallback(() => {
    if (raf.current) cancelAnimationFrame(raf.current);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setP(END);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const ms = now - start;
      setP(progressAt(ms));
      if (ms < TOTAL) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    play();
    let hiddenAt = 0;
    const onVis = () => {
      if (document.visibilityState === "hidden") hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > 30000) play(); // вернулись во вкладку — новый «визит»
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [play]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const mobile = window.innerWidth <= 900;
      // на телефоне сцена (заголовки + коробка + кнопка) помещается между шапкой и нижним меню
      const artH = mobile ? Math.max(220, Math.min(w * 0.95, window.innerHeight - 190 - 120 - 104 - 96)) : 400;
      setSize({ w, artH });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const W = size.w;
  const k = W ? Math.min((W - 24) / FW, size.artH / FH) : 0;

  const vis = [num(p, [0, 0.24, 0.36], [1, 1, 0]), num(p, [0.24, 0.36, 0.62, 0.74], [0, 1, 1, 0]), num(p, [0.62, 0.74], [0, 1])];
  const openScale = num(p, [0.24, 0.36, 0.62, 0.74], [0.55, 1, 1, 0.86]);
  const textShift = [num(p, [0.24, 0.36], [0, -12]), num(p, [0.24, 0.36, 0.62, 0.74], [12, 0, 0, -12]), num(p, [0.62, 0.74], [12, 0])];
  const dot = (i: number) =>
    num(p, i === 0 ? [0, 0.3, 0.36] : i === 1 ? [0.3, 0.36, 0.68, 0.74] : [0.68, 0.74, 1], i === 0 ? [1, 1, 0.3] : i === 1 ? [0.3, 1, 1, 0.3] : [0.3, 1, 1]);
  const titleSize = (t: { a: string; b: string }) => Math.min(W > 900 ? 54 : 40, (W - 36) / ((t.a.length + 1 + t.b.length) * 0.6));

  const layer = (box: Box, opacity: number, scaleY = 1) => (
    <img
      src={box.src}
      alt=""
      draggable={false}
      style={{
        position: "absolute", left: box.x * k, top: (box.y - FY) * k, width: box.w * k, height: box.h * k,
        opacity, transformOrigin: "bottom", transform: `scaleY(${scaleY})`, objectFit: "fill",
      }}
    />
  );

  return (
    <section className="home-scene" ref={wrapRef} aria-label="Косметичка — всё для вашей красоты">
      <div className="home-scene__texts">
        {TEXTS.map((t, i) => (
          <div key={i} className="home-scene__text" style={{ opacity: vis[i], transform: `translateY(${textShift[i]}px)` }} aria-hidden={vis[i] < 0.5}>
            <h1 className="home-scene__title" style={{ fontSize: W ? titleSize(t) : 36 }}>
              <span>{t.a} </span>
              <span className="home-scene__accent" style={{ backgroundImage: t.grad }}>{t.b}</span>
            </h1>
            <p className="home-scene__sub">{t.sub}</p>
          </div>
        ))}
      </div>

      <div className="home-scene__art" style={{ height: size.artH }} aria-hidden>
        {k > 0 && (
          <div style={{ position: "relative", width: FW * k, height: FH * k }}>
            {layer(BOX.flat, vis[0], num(p, [0.24, 0.36], [1, 1.12]))}
            {layer(BOX.open, vis[1], openScale)}
            <div style={{ position: "absolute", left: -40 * k, right: -40 * k, top: -200 * k, height: (CLIP - FY + 200) * k, overflow: "hidden" }}>
              {PRODUCTS.map((it, i) => {
                const [d0, d1] = it.drop;
                const at = (f: (q: Pose) => number) => num(p, [0.24, 0.36, d0, d1], [f(it.a), f(it.b), f(it.b), f(it.c)]);
                const tx = at((q) => (q.cx - it.a.cx) * k);
                const ty = at((q) => (q.cy - it.a.cy) * k);
                const rot = num(p, [0.24, 0.36, d0, d1], [it.a.r, it.b.r, it.b.r, it.c.r]);
                const sc = at((q) => q.k);
                return (
                  <img
                    key={i}
                    src={it.src}
                    alt=""
                    draggable={false}
                    style={{
                      position: "absolute",
                      left: (it.a.cx - it.w / 2 + 40) * k,
                      top: (it.a.cy - it.h / 2 - FY + 200) * k,
                      width: it.w * k,
                      height: it.h * k,
                      objectFit: "contain",
                      opacity: num(p, [d1 - 0.01, d1], [1, 0]),
                      transform: `translate(${tx}px, ${ty}px) rotate(${rot}deg) scale(${sc})`,
                    }}
                  />
                );
              })}
            </div>
            {layer(BOX.front, vis[1], openScale)}
            {layer(BOX.closed, vis[2], num(p, [0.62, 0.74], [0.82, 1]))}
          </div>
        )}
      </div>

      <div className="home-scene__bottom">
        <Link href="/catalog" className="home-scene__cta">
          Перейти в каталог
          <ArrowRight size={24} />
        </Link>
        <div className="home-scene__dots" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span key={i} style={{ opacity: dot(i) }} />
          ))}
        </div>
      </div>
    </section>
  );
}
