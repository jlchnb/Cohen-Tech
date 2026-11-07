import { animate, hover, inView, press, stagger } from "motion";

/** Si la persona pidió menos movimiento, no animamos nada. */
export const reducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
).matches;

const bounce = {
  type: "spring",
  stiffness: 420,
  damping: 13,
  mass: 0.7,
} as const;

/**
 * Momento principal de la página: las palabras del título caen con squash & stretch
 * (anticipación, aplastamiento al aterrizar, rebote) y el ventilador aparece con rebote.
 * Después el ventilador gira y reacciona al cursor o al toque.
 */
export function initHero(): void {
  if (reducedMotion) {
    document.documentElement.classList.remove("motion-ok");
    return;
  }

  const title = document.querySelector<HTMLElement>("[data-hero-title]");
  const fan = document.querySelector<HTMLElement>("#fan");
  const rotor = document.querySelector<SVGElement>("#fan-rotor");
  const glowHot = document.querySelector<HTMLElement>("#fan-glow-hot");
  const glowCool = document.querySelector<HTMLElement>("#fan-glow-cool");
  const tempEl = document.querySelector<HTMLElement>("#fan-temp");
  const stateEl = document.querySelector<HTMLElement>("#fan-state");
  if (!title || !fan || !rotor || !glowHot || !glowCool || !tempEl || !stateEl)
    return;

  // Título: una pieza por palabra, para que cada una caiga y rebote por separado.
  const text = (title.textContent ?? "").trim();
  title.setAttribute("aria-label", text);
  title.textContent = "";
  const words = text.split(/\s+/).map((word) => {
    const span = document.createElement("span");
    span.textContent = word;
    span.setAttribute("aria-hidden", "true");
    span.style.display = "inline-block";
    span.style.transformOrigin = "50% 100%";
    span.style.opacity = "0";
    title.append(span, document.createTextNode(" "));
    return span;
  });
  title.style.visibility = "visible";

  animate(
    words,
    {
      y: [-90, 0, -10, 0],
      scaleX: [0.8, 1.14, 0.97, 1],
      scaleY: [1.3, 0.78, 1.06, 1],
      opacity: [0, 1, 1, 1],
    },
    { duration: 0.95, times: [0, 0.5, 0.75, 1], delay: stagger(0.09) },
  );

  animate(
    fan,
    {
      scale: [0.5, 1.08, 0.97, 1],
      rotate: [-14, 5, -1, 0],
      opacity: [0, 1, 1, 1],
    },
    { duration: 0.95, delay: 0.3, times: [0, 0.55, 0.8, 1] },
  );

  animate(
    "[data-intro]",
    { opacity: [0, 1], y: [14, 0] },
    { duration: 0.5, delay: stagger(0.12, { startDelay: 0.9 }) },
  );

  // Ventilador: gira siempre; al acelerar, pasa de caliente (naranja) a fresco (celeste).
  const spin = animate(
    rotor,
    { rotate: 360 },
    { duration: 7, ease: "linear", repeat: Infinity },
  );

  const paintHeat = (speed: number): void => {
    const t = Math.min(1, Math.max(0, (speed - 1) / 6));
    glowHot.style.opacity = String(1 - t);
    glowCool.style.opacity = String(t);
    tempEl.textContent = String(Math.round(87 - t * 46));
    stateEl.textContent =
      t < 0.3 ? "Caliente" : t < 0.85 ? "Enfriando" : "Fresco";
  };
  paintHeat(1);

  let tween: { stop: () => void } | undefined;
  const setSpeed = (target: number): void => {
    tween?.stop();
    tween = animate(spin.speed, target, {
      type: "spring",
      stiffness: 45,
      damping: 8,
      onUpdate: (value: number) => {
        spin.speed = Math.max(0.2, value);
        paintHeat(value);
      },
    });
  };

  let hovering = false;
  hover(fan, () => {
    hovering = true;
    setSpeed(7);
    return () => {
      hovering = false;
      setSpeed(1);
    };
  });

  press(fan, () => {
    animate(fan, { scale: 0.93 }, bounce);
    return () => {
      animate(fan, { scale: [0.93, 1.05, 1] }, { duration: 0.5 });
      setSpeed(14);
      window.setTimeout(() => setSpeed(hovering ? 7 : 1), 1600);
    };
  });
}

/** Entradas con rebote al hacer scroll (servicios y pasos). */
export function initReveals(): void {
  if (reducedMotion) {
    document.documentElement.classList.remove("motion-ok");
    return;
  }

  inView(
    "[data-pop]",
    (element) => {
      animate(
        element,
        { opacity: [0, 1, 1], x: [-28, 6, 0] },
        { duration: 0.6, times: [0, 0.7, 1] },
      );
    },
    { amount: 0.4 },
  );

  hover(".svc-row", (row) => {
    const icon = row.querySelector(".svc-icon");
    if (icon) {
      animate(
        icon,
        { rotate: [0, -14, 10, -5, 0], scale: [1, 1.15, 1.15, 1.08, 1] },
        { duration: 0.6 },
      );
    }
  });
}

/** Botón que se aplasta al presionar y rebota al soltar. */
export function bindPress(element: Element): void {
  if (reducedMotion) return;
  press(element, () => {
    if (element.getAttribute("aria-disabled") === "true") return;
    animate(element, { scaleX: 1.07, scaleY: 0.88 }, { duration: 0.1 });
    return () => {
      animate(
        element,
        { scaleX: [1.07, 0.96, 1], scaleY: [0.88, 1.08, 1] },
        { duration: 0.45 },
      );
    };
  });
}

export function initPressFeel(): void {
  document.querySelectorAll(".btn").forEach(bindPress);
}

/** Sacudida corta para campos con error. */
export function shake(element: Element): void {
  if (reducedMotion) return;
  animate(element, { x: [0, -8, 7, -5, 3, 0] }, { duration: 0.4 });
}

/** Rebote pequeño al elegir un día o una hora. */
export function popIn(element: Element): void {
  if (reducedMotion) return;
  animate(element, { scale: [0.88, 1.1, 1] }, { duration: 0.35 });
}

/** Aparición escalonada de los botones de hora. */
export function popInMany(elements: Element[]): void {
  if (reducedMotion || elements.length === 0) return;
  animate(
    elements,
    { opacity: [0, 1], scale: [0.8, 1] },
    { duration: 0.3, delay: stagger(0.025) },
  );
}

/** Confirmación: el círculo rebota, el visto se dibuja y salen chispas de colores. */
export function celebrate(): void {
  if (reducedMotion) return;
  const burst = document.querySelector<HTMLElement>("#success-burst");
  const circle = document.querySelector<SVGElement>("#success-circle");
  const check = document.querySelector<SVGElement>("#success-check");
  if (!burst || !circle || !check) return;

  animate(
    circle,
    { scale: [0, 1.18, 0.95, 1] },
    { duration: 0.6, times: [0, 0.5, 0.8, 1] },
  );
  check.style.strokeDasharray = "1";
  animate(check, { strokeDashoffset: [1, 0] }, { duration: 0.45, delay: 0.3 });

  const colors = ["#2563EB", "#0EA5E9", "#38BDF8", "#0F172A"];
  for (let i = 0; i < 16; i += 1) {
    const dot = document.createElement("span");
    dot.className = "success-dot";
    dot.style.background = colors[i % colors.length];
    burst.append(dot);
    const angle = (Math.PI * 2 * i) / 16 + Math.random() * 0.3;
    const distance = 70 + Math.random() * 40;
    animate(
      dot,
      {
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance,
        scale: [0, 1, 0],
        opacity: [1, 1, 0],
      },
      { duration: 0.9, delay: 0.25, ease: "easeOut" },
    ).finished.then(() => dot.remove());
  }
}
