import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "react-qr-code";

type Variant = {
  id: string;
  name: string;
  price: number;
};

type MenuItem = {
  id: string;
  name: string;
  isVeg: boolean;
  variants: Variant[];
};

type MenuSection = {
  id: string;
  title: string;
  subtitle?: string;
  items: MenuItem[];
};

type FoodFilter = "ALL" | "VEG" | "NONVEG";

type AvailabilityMap = Record<string, false>; // only store unavailable overrides

const OWNER_MOBILES = ["9110162059", "9170820279", "8298357035"] as const;
const OWNER_SESSION_KEY = "lollyzz_owner_session_v1";
const AVAILABILITY_KEY = "lollyzz_availability_v1";

const formatINR = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);

function normalizeVariantName(name: string) {
  const n = name.trim();

  // Pizza sizes like 7", 8", 10" -> 7 inches, 8 inches, 10 inches
  const inches = n.match(/^\s*(\d+)\s*"\s*$/);
  if (inches) return `${inches[1]} inches`;

  // Fries sizes: Reg/Med/Large -> Regular/Medium/Large
  if (/^reg$/i.test(n)) return "Regular";
  if (/^med$/i.test(n)) return "Medium";
  if (/^large$/i.test(n)) return "Large";

  return n;
}

function categoryNavLabel(section: MenuSection) {
  // Short labels for compact category buttons (content headings remain unchanged)
  switch (section.id) {
    case "veg-main-gravy":
      return "Main Course (Veg)";
    case "nonveg-main-gravy":
      return "Main Course (Non-Veg)";
    case "rice-noodles-thali":
      return "Rice & Noodles";
    case "fried-chicken-wings":
      return "Fried Chicken";
    case "chinese-starters":
      return "Chinese & Starters";
    case "beverages-desserts":
      return "Beverages";
    default:
      return section.title;
  }
}

function normalizeIndianMobile(input: string): string | null {
  const digits = input.replace(/\D+/g, "");
  if (digits.length === 10) return digits;
  // allow +91 / 91 prefix
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return null;
}

function maskMobile(m: string) {
  if (m.length !== 10) return m;
  return `${m.slice(0, 2)}••••••${m.slice(8)}`;
}

function Icon({
  name,
  className,
}: {
  name: "qr" | "search" | "copy" | "download" | "spark" | "lock";
  className?: string;
}) {
  const common = `h-5 w-5 ${className ?? ""}`;
  switch (name) {
    case "qr":
      return (
        <svg
          className={common}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 3h7v7H3z" />
          <path d="M14 3h7v7h-7z" />
          <path d="M3 14h7v7H3z" />
          <path d="M14 14h3v3h-3z" />
          <path d="M17 17h4" />
          <path d="M17 14h4" />
          <path d="M14 17v4" />
        </svg>
      );
    case "search":
      return (
        <svg
          className={common}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
      );
    case "copy":
      return (
        <svg
          className={common}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 9h10v10H9z" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      );
    case "download":
      return (
        <svg
          className={common}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <path d="M7 10l5 5 5-5" />
          <path d="M12 15V3" />
        </svg>
      );
    case "spark":
      return (
        <svg
          className={common}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 2l1.5 5L19 8.5l-5.5 1.5L12 16l-1.5-6L5 8.5 10.5 7z" />
          <path d="M5 14l.8 2.4L8 17l-2.2.6L5 20l-.8-2.4L2 17l2.2-.6z" />
        </svg>
      );
    case "lock":
      return (
        <svg
          className={common}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M7 11V8a5 5 0 0 1 10 0v3" />
          <path d="M5 11h14v10H5z" />
        </svg>
      );
  }
}

function FoodMark({
  kind,
  className,
}: {
  kind: "VEG" | "NONVEG";
  className?: string;
}) {
  const color = kind === "VEG" ? "#16a34a" : "#dc2626";
  return (
    <svg
      className={className ?? "h-4 w-4"}
      viewBox="0 0 24 24"
      aria-label={kind === "VEG" ? "Veg" : "Non-Veg"}
      role="img"
      style={{ color }}
    >
      <rect
        x="4.25"
        y="4.25"
        width="15.5"
        height="15.5"
        rx="2.5"
        fill="#ffffff"
        stroke="currentColor"
        strokeWidth="2"
      />
      <circle cx="12" cy="12" r="4.2" fill="currentColor" />
    </svg>
  );
}

function pillClasses(active: boolean) {
  // Used for top filter pills (All / Veg / Non-Veg)
  // Slightly darker + slightly thicker stroke for better visibility.
  return [
    "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full px-3 py-2 text-sm leading-none border-[1.5px] transition",
    active
      ? "bg-[var(--primary)] text-white border-[var(--primary)]"
      : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50",
  ].join(" ");
}

function categoryGridBtnClasses(opts: {
  selected: boolean;
  inView: boolean;
  dimmed: boolean;
}) {
  const { selected, inView, dimmed } = opts;

  return [
    "w-full rounded-2xl px-3 py-3 text-left text-xs font-semibold border-[1.5px] transition",
    selected
      ? "bg-[var(--primary)] text-white border-[var(--primary)]"
      : dimmed
        ? "bg-white text-slate-400 border-slate-200"
        : "bg-white text-slate-800 border-slate-300 hover:bg-slate-50",
    !selected && inView ? "border-[var(--primary)]" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function useMenuUrl() {
  const [url, setUrl] = useState<string>("");
  useEffect(() => {
    setUrl(window.location.href);
  }, []);
  return url;
}

function sanitizeFilename(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function isIOSLike() {
  // iPadOS may report as MacIntel with touch points.
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua);
  const iPadOS13Plus =
    navigator.platform === "MacIntel" && (navigator as unknown as { maxTouchPoints?: number }).maxTouchPoints;
  return iOS || Boolean(iPadOS13Plus);
}

function serializeSvg(svgEl: SVGSVGElement) {
  // Ensure xmlns exists so the SVG can be rendered when converted to an image.
  if (!svgEl.getAttribute("xmlns")) {
    svgEl.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  }
  return new XMLSerializer().serializeToString(svgEl);
}

async function renderSvgToPngBlob(svgEl: SVGSVGElement, opts?: { size?: number; padding?: number }) {
  const size = opts?.size ?? 1024;
  const padding = opts?.padding ?? 64;

  const svgData = serializeSvg(svgEl);
  const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Could not load SVG as image"));
      image.src = svgUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No canvas context");

    // White background for printing.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);

    const drawSize = size - padding * 2;
    ctx.drawImage(img, padding, padding, drawSize, drawSize);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => {
          if (b) resolve(b);
          else reject(new Error("Canvas export failed"));
        },
        "image/png",
        1
      );
    });

    return blob;
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

function saveBlob(blob: Blob, filename: string, preOpenedWindow?: Window | null) {
  const url = URL.createObjectURL(blob);

  // iOS Safari often ignores the download attribute; opening in a tab is the most reliable fallback.
  if (preOpenedWindow) {
    try {
      preOpenedWindow.location.href = url;
    } catch {
      // ignore
    }
  } else {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // Give the browser time to start the download/open.
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function downloadSvg(svgEl: SVGSVGElement, filename: string, preOpenedWindow?: Window | null) {
  const svgData = serializeSvg(svgEl);
  const blob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
  saveBlob(blob, filename, preOpenedWindow);
}

function OwnerLoginModal({
  open,
  onClose,
  onLogin,
}: {
  open: boolean;
  onClose: () => void;
  onLogin: (mobile: string) => void;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setValue("");
    setError(null);
  }, [open]);

  if (!open) return null;

  const submit = () => {
    const normalized = normalizeIndianMobile(value);
    if (!normalized) {
      setError("Enter a valid Indian mobile number");
      return;
    }

    if (!OWNER_MOBILES.includes(normalized as (typeof OWNER_MOBILES)[number])) {
      setError("Not authorized");
      return;
    }

    onLogin(normalized);
  };

  return (
    <div className="fixed inset-0 z-[60]">
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
        aria-label="Close owner login"
      />

      <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-3xl px-4 pb-[max(16px,env(safe-area-inset-bottom))]">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[var(--primary)] text-white">
                  <Icon name="lock" />
                </div>
                <div>
                  <div className="text-base font-semibold text-slate-900">Owner Login</div>
                  <div className="text-xs text-slate-500">Availability settings</div>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
            >
              Close
            </button>
          </div>

          <div className="mt-4">
            <label className="block text-xs font-semibold text-slate-700">
              Mobile number
            </label>
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              inputMode="numeric"
              autoComplete="tel"
              placeholder="e.g. 9XXXXXXXXX"
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none placeholder:text-slate-400 focus:border-slate-300"
            />

            {error ? <div className="mt-2 text-xs font-semibold text-red-600">{error}</div> : null}

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={submit}
                className="inline-flex flex-1 items-center justify-center rounded-2xl bg-[var(--primary)] px-4 py-3 text-sm font-semibold text-white hover:bg-[var(--primary-dark)]"
              >
                Login
              </button>
            </div>

            <div className="mt-3 text-xs text-slate-500">
              Note: This is a client-side login (no OTP). Keep access private.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const MENU: MenuSection[] = [
  {
    id: "beverages-desserts",
    title: "Beverages & Desserts",
    items: [
      {
        id: "vanilla-ice-cream",
        name: "Vanilla Ice-Cream",
        isVeg: true,
        variants: [{ id: "reg", name: "Regular", price: 50 }],
      },
      {
        id: "chocolate-ice-cream",
        name: "Chocolate Ice-Cream",
        isVeg: true,
        variants: [{ id: "reg", name: "Regular", price: 60 }],
      },
      {
        id: "cold-coffee",
        name: "Cold Coffee",
        isVeg: true,
        variants: [{ id: "reg", name: "Regular", price: 90 }],
      },
      {
        id: "ice-cream-with-cold-coffee",
        name: "Ice-Cream with Cold Coffee",
        isVeg: true,
        variants: [{ id: "reg", name: "Regular", price: 120 }],
      },
      {
        id: "mojito-blast",
        name: "Mojito Blast",
        isVeg: true,
        variants: [{ id: "reg", name: "Regular", price: 100 }],
      },
      {
        id: "green-apple-mojito",
        name: "Green Apple Mojito",
        isVeg: true,
        variants: [{ id: "reg", name: "Regular", price: 100 }],
      },
      {
        id: "masala-lemonade",
        name: "Masala Lemonade",
        isVeg: true,
        variants: [{ id: "reg", name: "Regular", price: 70 }],
      },
      {
        id: "soft-drink-300",
        name: "Soft Drink (300ml)",
        isVeg: true,
        variants: [{ id: "reg", name: "300ml", price: 27 }],
      },
      {
        id: "hot-coffee",
        name: "Hot Coffee",
        isVeg: true,
        variants: [{ id: "reg", name: "Regular", price: 35 }],
      },
    ],
  },
  {
    id: "veg-main-gravy",
    title: "Main Course (Veg)",
    items: [
      {
        id: "paneer-punjabi",
        name: "Paneer Punjabi",
        isVeg: true,
        variants: [{ id: "full", name: "Full", price: 220 }],
      },
      {
        id: "paneer-chatpata",
        name: "Paneer Chatpata",
        isVeg: true,
        variants: [{ id: "full", name: "Full", price: 230 }],
      },
      {
        id: "paneer-handi",
        name: "Paneer Handi",
        isVeg: true,
        variants: [{ id: "full", name: "Full", price: 230 }],
      },
      {
        id: "paneer-kadhai",
        name: "Paneer Kadhai",
        isVeg: true,
        variants: [{ id: "full", name: "Full", price: 220 }],
      },
      {
        id: "paneer-masala",
        name: "Paneer Masala",
        isVeg: true,
        variants: [{ id: "full", name: "Full", price: 200 }],
      },
      {
        id: "paneer-butter-masala",
        name: "Paneer Butter Masala",
        isVeg: true,
        variants: [{ id: "full", name: "Full", price: 240 }],
      },
      {
        id: "shahi-paneer-sweet",
        name: "Shahi Paneer Sweet",
        isVeg: true,
        variants: [{ id: "full", name: "Full", price: 260 }],
      },
      {
        id: "shahi-paneer-namkin",
        name: "Shahi Paneer Namkin",
        isVeg: true,
        variants: [{ id: "full", name: "Full", price: 220 }],
      },
      {
        id: "paneer-mirch-masala",
        name: "Paneer Mirch Masala",
        isVeg: true,
        variants: [{ id: "full", name: "Full", price: 220 }],
      },
      {
        id: "mix-veg",
        name: "Mix Veg",
        isVeg: true,
        variants: [{ id: "full", name: "Full", price: 200 }],
      },
      {
        id: "paneer-tikka-butter-masala",
        name: "Paneer Tikka Butter Masala",
        isVeg: true,
        variants: [{ id: "full", name: "Full", price: 260 }],
      },
      {
        id: "mutter-paneer-masala",
        name: "Mutter Paneer Masala",
        isVeg: true,
        variants: [{ id: "full", name: "Full", price: 220 }],
      },
      {
        id: "paneer-do-pyaza",
        name: "Paneer Do Pyaza",
        isVeg: true,
        variants: [{ id: "full", name: "Full", price: 220 }],
      },
      {
        id: "paneer-dehati",
        name: "Paneer Dehati",
        isVeg: true,
        variants: [{ id: "full", name: "Full", price: 230 }],
      },
      {
        id: "mushroom-punjabi-masala",
        name: "Mushroom Punjabi Masala",
        isVeg: true,
        variants: [{ id: "full", name: "Full", price: 220 }],
      },
      {
        id: "mushroom-masala",
        name: "Mushroom Masala",
        isVeg: true,
        variants: [{ id: "full", name: "Full", price: 190 }],
      },
      {
        id: "mushroom-dopyaza",
        name: "Mushroom Dopyaza",
        isVeg: true,
        variants: [{ id: "full", name: "Full", price: 190 }],
      },
      {
        id: "mushroom-kadhai",
        name: "Mushroom Kadhai",
        isVeg: true,
        variants: [{ id: "full", name: "Full", price: 190 }],
      },
      {
        id: "mushroom-butter",
        name: "Mushroom Butter",
        isVeg: true,
        variants: [{ id: "full", name: "Full", price: 200 }],
      },
      {
        id: "daal-fry",
        name: "Daal Fry",
        isVeg: true,
        variants: [{ id: "full", name: "Full", price: 90 }],
      },
      {
        id: "daal-tadka",
        name: "Daal Tadka",
        isVeg: true,
        variants: [{ id: "full", name: "Full", price: 90 }],
      },
    ],
  },
  {
    id: "nonveg-main-gravy",
    title: "Main Course (Non-Veg)",
    items: [
      {
        id: "chicken-punjabi",
        name: "Chicken Punjabi",
        isVeg: false,
        variants: [{ id: "full", name: "Full", price: 270 }],
      },
      {
        id: "chicken-chatpata",
        name: "Chicken Chatpata",
        isVeg: false,
        variants: [{ id: "full", name: "Full", price: 290 }],
      },
      {
        id: "chicken-handi",
        name: "Chicken Handi",
        isVeg: false,
        variants: [{ id: "full", name: "Full", price: 280 }],
      },
      {
        id: "chicken-kadhai",
        name: "Chicken Kadhai",
        isVeg: false,
        variants: [{ id: "full", name: "Full", price: 260 }],
      },
      {
        id: "chicken-masala",
        name: "Chicken Masala",
        isVeg: false,
        variants: [{ id: "full", name: "Full", price: 280 }],
      },
      {
        id: "chicken-butter-masala",
        name: "Chicken Butter Masala",
        isVeg: false,
        variants: [{ id: "full", name: "Full", price: 290 }],
      },
      {
        id: "chicken-curry",
        name: "Chicken Curry",
        isVeg: false,
        variants: [{ id: "full", name: "Full", price: 260 }],
      },
      {
        id: "chicken-mirch-masala",
        name: "Chicken Mirch Masala",
        isVeg: false,
        variants: [{ id: "full", name: "Full", price: 280 }],
      },
      {
        id: "chicken-do-pyaza",
        name: "Chicken Do Pyaza",
        isVeg: false,
        variants: [{ id: "full", name: "Full", price: 290 }],
      },
      {
        id: "chicken-dehati",
        name: "Chicken Dehati",
        isVeg: false,
        variants: [{ id: "full", name: "Full", price: 280 }],
      },
      {
        id: "chicken-bhuna-masala",
        name: "Chicken Bhuna Masala",
        isVeg: false,
        variants: [{ id: "full", name: "Full", price: 350 }],
      },
      {
        id: "egg-masala",
        name: "Egg Masala",
        isVeg: false,
        variants: [{ id: "full", name: "Full", price: 120 }],
      },
      {
        id: "mutton-curry",
        name: "Mutton Curry",
        isVeg: false,
        variants: [
          { id: "half", name: "Half", price: 220 },
          { id: "full", name: "Full", price: 410 },
        ],
      },
      {
        id: "mutton-masala",
        name: "Mutton Masala",
        isVeg: false,
        variants: [
          { id: "half", name: "Half", price: 220 },
          { id: "full", name: "Full", price: 410 },
        ],
      },
      {
        id: "mutton-handi",
        name: "Mutton Handi",
        isVeg: false,
        variants: [
          { id: "half", name: "Half", price: 240 },
          { id: "full", name: "Full", price: 430 },
        ],
      },
      {
        id: "mutton-kadhai",
        name: "Mutton Kadhai",
        isVeg: false,
        variants: [
          { id: "half", name: "Half", price: 220 },
          { id: "full", name: "Full", price: 430 },
        ],
      },
      {
        id: "mutton-dehati",
        name: "Mutton Dehati",
        isVeg: false,
        variants: [
          { id: "half", name: "Half", price: 240 },
          { id: "full", name: "Full", price: 400 },
        ],
      },
      {
        id: "mutton-bhuna",
        name: "Mutton Bhuna",
        isVeg: false,
        variants: [
          { id: "half", name: "Half", price: 240 },
          { id: "full", name: "Full", price: 450 },
        ],
      },
    ],
  },
  {
    id: "fried-chicken-wings",
    title: "Fried Chicken & Wings",
    items: [
      {
        id: "crispy-juicy",
        name: "Crispy & Juicy",
        isVeg: false,
        variants: [
          { id: "1pc", name: "1 Pc", price: 99 },
          { id: "2pc", name: "2 Pc", price: 189 },
          { id: "4pc", name: "4 Pc", price: 369 },
          { id: "8pc-bucket", name: "8 Pc (Bucket)", price: 689 },
        ],
      },
      {
        id: "boneless-strips",
        name: "Boneless Strips",
        isVeg: false,
        variants: [
          { id: "3pc", name: "3 Pc", price: 149 },
          { id: "5pc", name: "5 Pc", price: 239 },
          { id: "15pc-bucket", name: "15 Pc (Bucket)", price: 719 },
        ],
      },
      {
        id: "chicken-popcorn",
        name: "Chicken Popcorn",
        isVeg: false,
        variants: [
          { id: "5pc", name: "5 Pc", price: 55 },
          { id: "10pc", name: "10 Pc", price: 110 },
          { id: "20pc-bucket", name: "20 Pc (Bucket)", price: 215 },
        ],
      },
      {
        id: "hot-wings",
        name: "Hot Wings",
        isVeg: false,
        variants: [
          { id: "2pc", name: "2 Pc", price: 71 },
          { id: "5pc", name: "5 Pc", price: 155 },
          { id: "20pc-bucket", name: "20 Pc (Bucket)", price: 589 },
        ],
      },
    ],
  },
  {
    id: "chinese-starters",
    title: "Chinese & Starters",
    items: [
      {
        id: "chicken-chilli-bone-8",
        name: "Chicken Chilli Bone (8pc)",
        isVeg: false,
        variants: [{ id: "reg", name: "Regular", price: 160 }],
      },
      {
        id: "chicken-chilli-boneless-8",
        name: "Chicken Chilli Boneless (8pc)",
        isVeg: false,
        variants: [{ id: "reg", name: "Regular", price: 170 }],
      },
      {
        id: "chicken-lolipop-6",
        name: "Chicken Lolipop (6pc)",
        isVeg: false,
        variants: [{ id: "reg", name: "Regular", price: 180 }],
      },
      {
        id: "paneer-pakora",
        name: "Paneer Pakora",
        isVeg: true,
        variants: [{ id: "reg", name: "Regular", price: 120 }],
      },
      {
        id: "paneer-chilli-dry",
        name: "Paneer Chilli Dry",
        isVeg: true,
        variants: [{ id: "reg", name: "Regular", price: 160 }],
      },
      {
        id: "mushroom-chilli-dry",
        name: "Mushroom Chilli Dry",
        isVeg: true,
        variants: [{ id: "reg", name: "Regular", price: 180 }],
      },
      {
        id: "babycorn-chilli-dry",
        name: "Babycorn Chilli Dry",
        isVeg: true,
        variants: [{ id: "reg", name: "Regular", price: 180 }],
      },
      {
        id: "veg-manchurian",
        name: "Veg Manchurian",
        isVeg: true,
        variants: [{ id: "reg", name: "Regular", price: 150 }],
      },
      {
        id: "paneer-manchurian",
        name: "Paneer Manchurian",
        isVeg: true,
        variants: [{ id: "reg", name: "Regular", price: 180 }],
      },
      {
        id: "veg-kurkure-momos",
        name: "Veg Kurkure Momos",
        isVeg: true,
        variants: [{ id: "reg", name: "Regular", price: 70 }],
      },
      {
        id: "paneer-kurkure-momos",
        name: "Paneer Kurkure Momos",
        isVeg: true,
        variants: [{ id: "reg", name: "Regular", price: 80 }],
      },
      {
        id: "chicken-kurkure-momos",
        name: "Chicken Kurkure Momos",
        isVeg: false,
        variants: [{ id: "reg", name: "Regular", price: 110 }],
      },
    ],
  },
  {
    id: "rice-noodles-thali",
    title: "Rice, Noodles & Thali",
    items: [
      {
        id: "stream-rice",
        name: "Stream Rice",
        isVeg: true,
        variants: [{ id: "reg", name: "Regular", price: 70 }],
      },
      {
        id: "jeera-rice",
        name: "Jeera Rice",
        isVeg: true,
        variants: [{ id: "reg", name: "Regular", price: 80 }],
      },
      {
        id: "mutter-pulao",
        name: "Mutter Pulao",
        isVeg: true,
        variants: [{ id: "reg", name: "Regular", price: 160 }],
      },
      {
        id: "paneer-pulao",
        name: "Paneer Pulao",
        isVeg: true,
        variants: [{ id: "reg", name: "Regular", price: 160 }],
      },
      {
        id: "chicken-fried-rice",
        name: "Chicken Fried Rice",
        isVeg: false,
        variants: [{ id: "reg", name: "Regular", price: 160 }],
      },
      {
        id: "egg-fried-rice",
        name: "Egg Fried Rice",
        isVeg: false,
        variants: [{ id: "reg", name: "Regular", price: 160 }],
      },
      {
        id: "veg-biryani",
        name: "Veg Biryani",
        isVeg: true,
        variants: [{ id: "reg", name: "Regular", price: 160 }],
      },
      {
        id: "chicken-biryani",
        name: "Chicken Biryani",
        isVeg: false,
        variants: [{ id: "reg", name: "Regular", price: 200 }],
      },
      {
        id: "veg-noodles",
        name: "Veg Noodles",
        isVeg: true,
        variants: [{ id: "reg", name: "Regular", price: 80 }],
      },
      {
        id: "paneer-noodles",
        name: "Paneer Noodles",
        isVeg: true,
        variants: [{ id: "reg", name: "Regular", price: 110 }],
      },
      {
        id: "mushroom-noodles",
        name: "Mushroom Noodles",
        isVeg: true,
        variants: [{ id: "reg", name: "Regular", price: 110 }],
      },
      {
        id: "veg-shezwan-noodles",
        name: "Veg Shezwan Noodles",
        isVeg: true,
        variants: [{ id: "reg", name: "Regular", price: 90 }],
      },
      {
        id: "veg-garlic-noodles",
        name: "Veg Garlic Noodles",
        isVeg: true,
        variants: [{ id: "reg", name: "Regular", price: 90 }],
      },
      {
        id: "chicken-noodles",
        name: "Chicken Noodles",
        isVeg: false,
        variants: [{ id: "reg", name: "Regular", price: 110 }],
      },
      {
        id: "chicken-garlic-noodles",
        name: "Chicken Garlic Noodles",
        isVeg: false,
        variants: [{ id: "reg", name: "Regular", price: 120 }],
      },
      {
        id: "egg-noodles",
        name: "Egg Noodles",
        isVeg: false,
        variants: [{ id: "reg", name: "Regular", price: 100 }],
      },
      {
        id: "egg-chicken-noodles",
        name: "Egg Chicken Noodles",
        isVeg: false,
        variants: [{ id: "reg", name: "Regular", price: 140 }],
      },
      {
        id: "veg-thali",
        name: "Veg Thali",
        isVeg: true,
        variants: [{ id: "reg", name: "Regular", price: 90 }],
      },
      {
        id: "non-veg-thali",
        name: "Non Veg Thali",
        isVeg: false,
        variants: [{ id: "reg", name: "Regular", price: 110 }],
      },
      {
        id: "egg-thali",
        name: "Egg Thali",
        isVeg: false,
        variants: [{ id: "reg", name: "Regular", price: 100 }],
      },
    ],
  },
  {
    id: "veg-burgers",
    title: "Veg Burgers",
    items: [
      {
        id: "veg-burger",
        name: "Veg Burger",
        isVeg: true,
        variants: [{ id: "reg", name: "Regular", price: 55 }],
      },
      {
        id: "cheese-veg-burger",
        name: "Cheese Veg Burger",
        isVeg: true,
        variants: [{ id: "reg", name: "Regular", price: 70 }],
      },
      {
        id: "veg-shezwan-burger",
        name: "Veg Shezwan Burger",
        isVeg: true,
        variants: [{ id: "reg", name: "Regular", price: 60 }],
      },
      {
        id: "paneer-burger",
        name: "Paneer Burger",
        isVeg: true,
        variants: [{ id: "reg", name: "Regular", price: 120 }],
      },
      {
        id: "crispy-veg-burger",
        name: "Crispy Veg Burger",
        isVeg: true,
        variants: [{ id: "reg", name: "Regular", price: 70 }],
      },
      {
        id: "veg-double-patty-burger",
        name: "Veg Double Patty Burger",
        isVeg: true,
        variants: [{ id: "reg", name: "Regular", price: 70 }],
      },
      {
        id: "crispy-veg-cheese-burger",
        name: "Crispy Veg Cheese Burger",
        isVeg: true,
        variants: [{ id: "reg", name: "Regular", price: 100 }],
      },
    ],
  },
  {
    id: "chicken-burgers",
    title: "Chicken Burgers",
    items: [
      {
        id: "chicken-burger",
        name: "Chicken Burger",
        isVeg: false,
        variants: [{ id: "reg", name: "Regular", price: 80 }],
      },
      {
        id: "cheese-chicken-burger",
        name: "Cheese Chicken Burger",
        isVeg: false,
        variants: [{ id: "reg", name: "Regular", price: 100 }],
      },
      {
        id: "chicken-shezwan-burger",
        name: "Chicken Shezwan Burger",
        isVeg: false,
        variants: [{ id: "reg", name: "Regular", price: 85 }],
      },
      {
        id: "crispy-chicken-burger",
        name: "Crispy Chicken Burger",
        isVeg: false,
        variants: [{ id: "reg", name: "Regular", price: 120 }],
      },
      {
        id: "crispy-cheese-chicken-burger",
        name: "Crispy Cheese Chicken Burger",
        isVeg: false,
        variants: [{ id: "reg", name: "Regular", price: 140 }],
      },
    ],
  },
  {
    id: "veg-pizzas",
    title: "Veg Pizzas",
    items: [
      {
        id: "margherita-pizza",
        name: "Margherita Pizza",
        isVeg: true,
        variants: [
          { id: "7", name: '7"', price: 130 },
          { id: "8", name: '8"', price: 160 },
          { id: "10", name: '10"', price: 260 },
        ],
      },
      {
        id: "cheese-corn-pizza",
        name: "Cheese Corn Pizza",
        isVeg: true,
        variants: [
          { id: "7", name: '7"', price: 140 },
          { id: "8", name: '8"', price: 180 },
          { id: "10", name: '10"', price: 280 },
        ],
      },
      {
        id: "classic-margherita-pizza",
        name: "Classic Margherita Pizza",
        isVeg: true,
        variants: [
          { id: "7", name: '7"', price: 150 },
          { id: "8", name: '8"', price: 200 },
          { id: "10", name: '10"', price: 310 },
        ],
      },
      {
        id: "classic-paneer-pizza",
        name: "Classic Paneer Pizza",
        isVeg: true,
        variants: [
          { id: "7", name: '7"', price: 170 },
          { id: "8", name: '8"', price: 235 },
          { id: "10", name: '10"', price: 345 },
        ],
      },
      {
        id: "tandoori-paneer-pizza",
        name: "Tandoori Paneer Pizza",
        isVeg: true,
        variants: [
          { id: "7", name: '7"', price: 190 },
          { id: "8", name: '8"', price: 265 },
          { id: "10", name: '10"', price: 400 },
        ],
      },
      {
        id: "butter-paneer-pizza",
        name: "Butter Paneer Pizza",
        isVeg: true,
        variants: [
          { id: "7", name: '7"', price: 190 },
          { id: "8", name: '8"', price: 265 },
          { id: "10", name: '10"', price: 400 },
        ],
      },
      {
        id: "peri-peri-paneer-pizza",
        name: "Peri-Peri Paneer Pizza",
        isVeg: true,
        variants: [
          { id: "7", name: '7"', price: 190 },
          { id: "8", name: '8"', price: 265 },
          { id: "10", name: '10"', price: 400 },
        ],
      },
      {
        id: "veg-overloaded-pizza",
        name: "Veg Overloaded Pizza",
        isVeg: true,
        variants: [
          { id: "7", name: '7"', price: 200 },
          { id: "8", name: '8"', price: 285 },
          { id: "10", name: '10"', price: 430 },
        ],
      },
      {
        id: "double-cheese-veg-overload-pizza",
        name: "Double Cheese Veg Overload Pizza",
        isVeg: true,
        variants: [
          { id: "7", name: '7"', price: 230 },
          { id: "8", name: '8"', price: 300 },
          { id: "10", name: '10"', price: 450 },
        ],
      },
    ],
  },
  {
    id: "nonveg-pizzas",
    title: "Non-Veg Pizzas",
    items: [
      {
        id: "margherita-pizza-chicken",
        name: "Margherita Pizza (Chicken)",
        isVeg: false,
        variants: [
          { id: "7", name: '7"', price: 150 },
          { id: "8", name: '8"', price: 210 },
          { id: "10", name: '10"', price: 310 },
        ],
      },
      {
        id: "crunchy-chicken-classic",
        name: "Crunchy Chicken Classic",
        isVeg: false,
        variants: [
          { id: "7", name: '7"', price: 190 },
          { id: "8", name: '8"', price: 280 },
          { id: "10", name: '10"', price: 440 },
        ],
      },
      {
        id: "chicken-shezwan-pizza",
        name: "Chicken Shezwan Pizza",
        isVeg: false,
        variants: [
          { id: "7", name: '7"', price: 190 },
          { id: "8", name: '8"', price: 280 },
          { id: "10", name: '10"', price: 440 },
        ],
      },
      {
        id: "tandoori-chicken-pizza",
        name: "Tandoori Chicken Pizza",
        isVeg: false,
        variants: [
          { id: "7", name: '7"', price: 190 },
          { id: "8", name: '8"', price: 280 },
          { id: "10", name: '10"', price: 440 },
        ],
      },
      {
        id: "butter-chicken-pizza",
        name: "Butter Chicken Pizza",
        isVeg: false,
        variants: [
          { id: "7", name: '7"', price: 200 },
          { id: "8", name: '8"', price: 290 },
          { id: "10", name: '10"', price: 440 },
        ],
      },
      {
        id: "peri-peri-chicken-pizza",
        name: "Peri-Peri Chicken Pizza",
        isVeg: false,
        variants: [
          { id: "7", name: '7"', price: 200 },
          { id: "8", name: '8"', price: 290 },
          { id: "10", name: '10"', price: 440 },
        ],
      },
      {
        id: "chicken-overloaded-pizza",
        name: "Chicken Overloaded Pizza",
        isVeg: false,
        variants: [
          { id: "7", name: '7"', price: 220 },
          { id: "8", name: '8"', price: 300 },
          { id: "10", name: '10"', price: 450 },
        ],
      },
      {
        id: "double-cheese-chicken-overload-pizza",
        name: "Double Cheese Chicken Overload Pizza",
        isVeg: false,
        variants: [
          { id: "7", name: '7"', price: 250 },
          { id: "8", name: '8"', price: 330 },
          { id: "10", name: '10"', price: 470 },
        ],
      },
    ],
  },
  {
    id: "sandwich",
    title: "Sandwich",
    items: [
      {
        id: "veg-grill-sandwich",
        name: "Veg Grill Sandwich",
        isVeg: true,
        variants: [{ id: "reg", name: "Regular", price: 80 }],
      },
      {
        id: "cheese-corn-sandwich",
        name: "Cheese & Corn Sandwich",
        isVeg: true,
        variants: [{ id: "reg", name: "Regular", price: 110 }],
      },
      {
        id: "veg-mozzarella-sandwich",
        name: "Veg Mozzarella Sandwich",
        isVeg: true,
        variants: [{ id: "reg", name: "Regular", price: 100 }],
      },
      {
        id: "chicken-sandwich",
        name: "Chicken Sandwich",
        isVeg: false,
        variants: [{ id: "reg", name: "Regular", price: 100 }],
      },
      {
        id: "chicken-mozzarella-sandwich",
        name: "Chicken Mozzarella Sandwich",
        isVeg: false,
        variants: [{ id: "reg", name: "Regular", price: 130 }],
      },
    ],
  },
  {
    id: "wraps-rolls",
    title: "Wraps & Rolls",
    items: [
      {
        id: "veg-wrap",
        name: "Veg Wrap",
        isVeg: true,
        variants: [{ id: "reg", name: "Regular", price: 100 }],
      },
      {
        id: "paneer-wrap",
        name: "Paneer Wrap",
        isVeg: true,
        variants: [{ id: "reg", name: "Regular", price: 120 }],
      },
      {
        id: "veg-shezwan-wrap",
        name: "Veg Shezwan Wrap",
        isVeg: true,
        variants: [{ id: "reg", name: "Regular", price: 110 }],
      },
      {
        id: "cheese-veg-wrap",
        name: "Cheese Veg Wrap",
        isVeg: true,
        variants: [{ id: "reg", name: "Regular", price: 140 }],
      },
      {
        id: "chicken-wrap",
        name: "Chicken Wrap",
        isVeg: false,
        variants: [{ id: "reg", name: "Regular", price: 140 }],
      },
      {
        id: "chicken-shezwan-wrap",
        name: "Chicken Shezwan Wrap",
        isVeg: false,
        variants: [{ id: "reg", name: "Regular", price: 150 }],
      },
      {
        id: "cheese-chicken-wrap",
        name: "Cheese Chicken Wrap",
        isVeg: false,
        variants: [{ id: "reg", name: "Regular", price: 170 }],
      },
      {
        id: "chicken-roll",
        name: "Chicken Roll",
        isVeg: false,
        variants: [{ id: "reg", name: "Regular", price: 90 }],
      },
      {
        id: "double-chicken-roll",
        name: "Double Chicken Roll",
        isVeg: false,
        variants: [{ id: "reg", name: "Regular", price: 110 }],
      },
      {
        id: "egg-chicken-roll",
        name: "Egg Chicken Roll",
        isVeg: false,
        variants: [{ id: "reg", name: "Regular", price: 130 }],
      },
      {
        id: "egg-roll",
        name: "Egg Roll",
        isVeg: false,
        variants: [{ id: "reg", name: "Regular", price: 60 }],
      },
      {
        id: "veg-roll",
        name: "Veg Roll",
        isVeg: true,
        variants: [{ id: "reg", name: "Regular", price: 60 }],
      },
      {
        id: "paneer-roll",
        name: "Paneer Roll",
        isVeg: true,
        variants: [{ id: "reg", name: "Regular", price: 90 }],
      },
      {
        id: "paneer-chilli-roll",
        name: "Paneer Chilli Roll",
        isVeg: true,
        variants: [{ id: "reg", name: "Regular", price: 100 }],
      },
    ],
  },
  {
    id: "fries",
    title: "Fries",
    items: [
      {
        id: "french-fries",
        name: "French Fries",
        isVeg: true,
        variants: [
          { id: "reg", name: "Reg", price: 55 },
          { id: "med", name: "Med", price: 90 },
          { id: "large", name: "Large", price: 120 },
        ],
      },
      {
        id: "veg-cheese-popcorn",
        name: "Veg Cheese Popcorn",
        isVeg: true,
        variants: [
          { id: "reg", name: "Reg", price: 45 },
          { id: "med", name: "Med", price: 90 },
          { id: "large", name: "Large", price: 160 },
        ],
      },
    ],
  },
  {
    id: "breads",
    title: "Breads",
    items: [
      {
        id: "butter-naan",
        name: "Butter Naan",
        isVeg: true,
        variants: [{ id: "reg", name: "Regular", price: 30 }],
      },
      {
        id: "tawa-roti",
        name: "Tawa Roti",
        isVeg: true,
        variants: [{ id: "reg", name: "Regular", price: 10 }],
      },
      {
        id: "tawa-butter-roti",
        name: "Tawa Butter Roti",
        isVeg: true,
        variants: [{ id: "reg", name: "Regular", price: 15 }],
      },
      {
        id: "lachha-paratha",
        name: "Lachha Paratha",
        isVeg: true,
        variants: [{ id: "reg", name: "Regular", price: 30 }],
      },
      {
        id: "paneer-paratha",
        name: "Paneer Paratha",
        isVeg: true,
        variants: [{ id: "reg", name: "Regular", price: 30 }],
      },
    ],
  },
];

function MenuItemCompact({
  item,
  available,
  ownerMode,
  onSetAvailable,
}: {
  item: MenuItem;
  available: boolean;
  ownerMode: boolean;
  onSetAvailable: (nextAvailable: boolean) => void;
}) {
  const hasMany = item.variants.length > 1;
  const only = item.variants[0];
  const showSingleVariantRow =
    !!only &&
    (!/^(regular|reg)$/i.test(only.name.trim()) || item.variants.length !== 1);

  return (
    <div
      className={[
        "rounded-2xl border bg-white p-4 shadow-sm",
        available ? "border-slate-200" : "border-slate-200 opacity-60",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <FoodMark kind={item.isVeg ? "VEG" : "NONVEG"} className="h-4 w-4 shrink-0" />
            <div className="truncate text-base font-semibold text-slate-900">
              {item.name}
            </div>
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {item.isVeg ? "Veg" : "Non-Veg"}
          </div>

          {!available ? (
            <div className="mt-2 inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700">
              Unavailable
            </div>
          ) : null}
        </div>

        {/* Owner availability toggle */}
        {ownerMode ? (
          <button
            type="button"
            onClick={() => onSetAvailable(!available)}
            className={[
              "shrink-0 rounded-xl border px-3 py-2 text-xs font-semibold transition",
              available
                ? "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                : "border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
            ].join(" ")}
            aria-pressed={available}
            title={available ? "Mark unavailable" : "Mark available"}
          >
            {available ? "Available" : "Unavailable"}
          </button>
        ) : !hasMany && only && !showSingleVariantRow ? (
          // If there is only one price and it’s basically “Regular”, keep it as a clean price pill
          <div className="shrink-0 rounded-xl bg-[var(--primary)] px-3 py-2 text-sm font-semibold text-white">
            {formatINR(only.price)}
          </div>
        ) : null}
      </div>

      {/* Always show variations (Half/Full, Reg/Med/Large, sizes, buckets) — no “View options” */}
      {hasMany ? (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {item.variants.map((v) => (
            <div
              key={v.id}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2"
            >
              <div className="text-xs font-semibold text-slate-900">
                {normalizeVariantName(v.name)}
              </div>
              <div className="mt-0.5 text-sm font-semibold text-slate-900">
                {formatINR(v.price)}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* Single-variant items that are not “Regular” still show the variant label (e.g., 300ml) */}
      {!hasMany && only && showSingleVariantRow ? (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold text-slate-900">
              {normalizeVariantName(only.name)}
            </div>
          </div>
          <div className="shrink-0 text-sm font-semibold text-slate-900">
            {formatINR(only.price)}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function App() {
  const menuUrl = useMenuUrl();

  const [activeSectionId, setActiveSectionId] = useState(MENU[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [foodFilter, setFoodFilter] = useState<FoodFilter>("ALL");
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);

  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  const headerRef = useRef<HTMLDivElement | null>(null);
  const [headerHeight, setHeaderHeight] = useState<number>(140);

  const qrWrapRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const [ownerMobile, setOwnerMobile] = useState<string | null>(null);
  const ownerMode = ownerMobile !== null;
  const [ownerLoginOpen, setOwnerLoginOpen] = useState(false);
  const [showUnavailableForOwner, setShowUnavailableForOwner] = useState(true);

  const [availability, setAvailability] = useState<AvailabilityMap>(() => {
    try {
      const raw = localStorage.getItem(AVAILABILITY_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object") return parsed as AvailabilityMap;
      return {};
    } catch {
      return {};
    }
  });

  const isAvailable = (itemId: string) => availability[itemId] !== false;

  useEffect(() => {
    try {
      localStorage.setItem(AVAILABILITY_KEY, JSON.stringify(availability));
    } catch {
      // ignore
    }
  }, [availability]);

  useEffect(() => {
    // Restore owner session if present.
    try {
      const raw = localStorage.getItem(OWNER_SESSION_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object") return;
      const { mobile } = parsed as { mobile?: unknown };
      if (typeof mobile !== "string") return;
      if (OWNER_MOBILES.includes(mobile as (typeof OWNER_MOBILES)[number])) {
        setOwnerMobile(mobile);
      } else {
        localStorage.removeItem(OWNER_SESSION_KEY);
      }
    } catch {
      // ignore
    }
  }, []);

  // Whether to include unavailable items in filtering/rendering.
  const includeUnavailable = ownerMode && showUnavailableForOwner;

  // Apply availability (for customers hide unavailable; for owner optionally show them)
  const menuByAvailability = useMemo(() => {
    if (includeUnavailable) return MENU;
    return MENU.map((s) => ({
      ...s,
      items: s.items.filter((it) => isAvailable(it.id)),
    })).filter((s) => s.items.length > 0);
  }, [includeUnavailable, availability]);

  // Base filter: search + veg/non-veg
  const baseFilteredMenu = useMemo(() => {
    const q = query.trim().toLowerCase();

    return menuByAvailability
      .map((section) => {
        const items = section.items.filter((it) => {
          const matchesQuery = !q
            ? true
            : [it.name, ...it.variants.map((v) => normalizeVariantName(v.name))]
                .join(" ")
                .toLowerCase()
                .includes(q);

          const matchesFood =
            foodFilter === "ALL"
              ? true
              : foodFilter === "VEG"
                ? it.isVeg
                : !it.isVeg;

          return matchesQuery && matchesFood;
        });

        return { ...section, items };
      })
      .filter((s) => s.items.length > 0);
  }, [query, foodFilter, menuByAvailability]);

  // Category filter: allow selecting multiple categories at once.
  const filteredMenu = useMemo(() => {
    if (selectedCategoryIds.length === 0) return baseFilteredMenu;
    const selected = new Set(selectedCategoryIds);
    return baseFilteredMenu.filter((s) => selected.has(s.id));
  }, [baseFilteredMenu, selectedCategoryIds]);

  // Used to dim/disable category buttons that currently have no results under the base filters.
  const availableSectionIds = useMemo(
    () => new Set(baseFilteredMenu.map((s) => s.id)),
    [baseFilteredMenu]
  );

  // For the Categories grid: when Veg/Non-Veg is selected, hide categories that don't contain
  // that type at all. Also hides categories that became empty due to availability.
  const foodTypeSectionIds = useMemo(() => {
    if (foodFilter === "ALL") {
      return new Set(menuByAvailability.map((s) => s.id));
    }
    if (foodFilter === "VEG") {
      return new Set(
        menuByAvailability.filter((s) => s.items.some((i) => i.isVeg)).map((s) => s.id)
      );
    }
    return new Set(
      menuByAvailability.filter((s) => s.items.some((i) => !i.isVeg)).map((s) => s.id)
    );
  }, [foodFilter, menuByAvailability]);

  const visibleSectionIds = useMemo(() => new Set(filteredMenu.map((s) => s.id)), [filteredMenu]);

  // If search/veg filters change, drop any selected categories that no longer have results
  // OR are no longer applicable for the current Veg/Non-Veg filter.
  useEffect(() => {
    if (selectedCategoryIds.length === 0) return;
    setSelectedCategoryIds((prev) => prev.filter((id) => availableSectionIds.has(id) && foodTypeSectionIds.has(id)));
  }, [availableSectionIds, foodTypeSectionIds, selectedCategoryIds.length]);

  const categoryNavSections = useMemo(() => {
    // Order the categories so the first row starts with:
    // Veg Pizzas, Veg Burgers, Main Course (Veg)
    const preferredOrder: string[] = [
      "veg-pizzas",
      "veg-burgers",
      "veg-main-gravy",
      "nonveg-pizzas",
      "chicken-burgers",
      "nonveg-main-gravy",
      "fried-chicken-wings",
      "chinese-starters",
      "rice-noodles-thali",
      "wraps-rolls",
      "sandwich",
      "fries",
      "beverages-desserts",
      "breads",
    ];

    const rank = new Map(preferredOrder.map((id, i) => [id, i] as const));
    return [...MENU].sort((a, b) => {
      const ra = rank.get(a.id) ?? 999;
      const rb = rank.get(b.id) ?? 999;
      if (ra !== rb) return ra - rb;
      return a.title.localeCompare(b.title);
    });
  }, []);

  const categoryGridSections = useMemo(
    () => categoryNavSections.filter((s) => foodTypeSectionIds.has(s.id)),
    [categoryNavSections, foodTypeSectionIds]
  );

  useEffect(() => {
    // If current active section is no longer visible because of filters/search,
    // set it to the first visible section.
    if (filteredMenu.length > 0 && !visibleSectionIds.has(activeSectionId)) {
      setActiveSectionId(filteredMenu[0]!.id);
    }
  }, [filteredMenu, activeSectionId, visibleSectionIds]);

  useEffect(() => {
    const onScroll = () => {
      if (filteredMenu.length === 0) return;

      const entries = filteredMenu.map((s) => {
        const el = sectionRefs.current[s.id];
        if (!el) return { id: s.id, top: Number.POSITIVE_INFINITY };
        const rect = el.getBoundingClientRect();
        return { id: s.id, top: rect.top };
      });

      const threshold = 160;
      let best = entries[0]?.id ?? activeSectionId;
      let bestTop = -Infinity;
      for (const e of entries) {
        if (e.top <= threshold && e.top > bestTop) {
          bestTop = e.top;
          best = e.id;
        }
      }
      setActiveSectionId(best);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [filteredMenu, activeSectionId]);

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;

    const update = () => {
      const h = Math.ceil(el.getBoundingClientRect().height);
      if (h > 0) setHeaderHeight(h);
    };

    update();

    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    window.addEventListener("resize", update);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  useEffect(() => {
    // Ensure hash navigation (e.g. #qr) accounts for the fixed header height.
    const v = `${headerHeight + 16}px`;
    document.documentElement.style.scrollPaddingTop = v;
    document.body.style.scrollPaddingTop = v;
  }, [headerHeight]);

  useEffect(() => {
    // Add center branding inside the QR SVG so it shows in downloads too.
    const svg = qrWrapRef.current?.querySelector("svg");
    if (!svg) return;

    const ns = "http://www.w3.org/2000/svg";
    const existing = svg.querySelector("[data-center-brand='1']");
    existing?.remove();

    const vb = (svg.getAttribute("viewBox") ?? "0 0 256 256")
      .split(/\s+/)
      .map((v) => Number(v));
    if (vb.length !== 4 || vb.some((n) => Number.isNaN(n))) return;

    const [x, y, w, h] = vb;
    const cx = x + w / 2;
    const cy = y + h / 2;

    const g = document.createElementNS(ns, "g");
    g.setAttribute("data-center-brand", "1");

    const rect = document.createElementNS(ns, "rect");
    rect.setAttribute("fill", "#ffffff");
    rect.setAttribute("rx", String(h * 0.05));
    rect.setAttribute("ry", String(h * 0.05));

    const text = document.createElementNS(ns, "text");
    text.setAttribute("x", String(cx));
    text.setAttribute("y", String(cy));
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("dominant-baseline", "central");
    text.setAttribute("fill", "#F34D13");
    text.setAttribute("font-size", String(h * 0.12));
    text.setAttribute("font-weight", "800");
    text.setAttribute(
      "font-family",
      "Qasira, 'Berkshire Swash', Lobster, Pacifico, 'Brush Script MT', 'Segoe Script', ui-rounded, ui-sans-serif, system-ui"
    );
    text.setAttribute("letter-spacing", "0.5");
    text.textContent = "Lollyzz";

    g.append(rect);
    g.append(text);
    svg.appendChild(g);

    const padX = w * 0.05;
    const padY = h * 0.025;
    const updateRect = () => {
      try {
        const bb = text.getBBox();
        rect.setAttribute("x", String(bb.x - padX));
        rect.setAttribute("y", String(bb.y - padY));
        rect.setAttribute("width", String(bb.width + padX * 2));
        rect.setAttribute("height", String(bb.height + padY * 2));
      } catch {
        // ignore measurement errors
      }
    };

    requestAnimationFrame(() => {
      updateRect();
      window.setTimeout(updateRect, 120);
    });
  }, [menuUrl]);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2200);
  }

  function toggleCategory(id: string) {
    setSelectedCategoryIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      return [...prev, id];
    });
  }

  function applyFoodFilter(next: FoodFilter) {
    setFoodFilter(next);
    // Bring the user back to the top so they can immediately see the updated options/categories.
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function setItemAvailable(itemId: string, nextAvailable: boolean) {
    setAvailability((prev) => {
      const next: AvailabilityMap = { ...prev };
      if (nextAvailable) {
        delete next[itemId];
      } else {
        next[itemId] = false;
      }
      return next;
    });
  }

  function ownerLogin(mobile: string) {
    setOwnerMobile(mobile);
    try {
      localStorage.setItem(OWNER_SESSION_KEY, JSON.stringify({ mobile }));
    } catch {
      // ignore
    }
    setOwnerLoginOpen(false);
    showToast("Owner mode enabled");
  }

  function ownerLogout() {
    setOwnerMobile(null);
    try {
      localStorage.removeItem(OWNER_SESSION_KEY);
    } catch {
      // ignore
    }
    showToast("Logged out");
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(menuUrl);
      showToast("Menu link copied");
    } catch {
      showToast("Could not copy link");
    }
  }

  async function downloadQr() {
    const svg = qrWrapRef.current?.querySelector("svg") as SVGSVGElement | null;
    if (!svg) {
      showToast("QR not ready yet");
      return;
    }

    // Open a tab immediately on iOS-like browsers so the gesture is not lost to async work.
    const preOpened = isIOSLike() ? window.open("about:blank", "_blank") : null;

    try {
      const pngBlob = await renderSvgToPngBlob(svg, { size: 1200, padding: 96 });
      saveBlob(pngBlob, `${sanitizeFilename("lollyzz")}-qr-menu.png`, preOpened);
      showToast(isIOSLike() ? "QR opened (save from your browser)" : "QR downloaded");
    } catch {
      // Fallback to SVG download/open.
      try {
        downloadSvg(svg, `${sanitizeFilename("lollyzz")}-qr-menu.svg`, preOpened);
        showToast(isIOSLike() ? "QR opened (SVG)" : "QR downloaded (SVG)");
      } catch {
        if (preOpened) preOpened.close();
        showToast("Could not download QR");
      }
    }
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 via-white to-zinc-50 text-slate-900">
      {/* Fixed header: stays with the user while scrolling */}
      <div
        ref={headerRef}
        className="fixed inset-x-0 top-0 z-50 border-b border-white/40 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/70"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="mx-auto w-full max-w-3xl px-4 pt-3">
          {/* Top actions (always visible). Brand stays hidden on mobile, but QR + Owner Login stays on top. */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-2">
            <div className="hidden items-center gap-2 sm:flex">
              <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[var(--primary)] text-white">
                <Icon name="spark" />
              </div>
              <div className="leading-tight">
                <div className="text-sm font-semibold text-slate-900">Lollyzz</div>
                <div className="text-xs text-slate-500">E QR Code Menu • ₹</div>
              </div>
            </div>

            <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2">
              <a
                href="#qr"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 sm:text-sm"
              >
                <Icon name="qr" className="h-4 w-4" />
                QR
              </a>

              {ownerMode ? (
                <button
                  type="button"
                  onClick={ownerLogout}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 sm:text-sm"
                  title={ownerMobile ? `Logged in: ${ownerMobile}` : "Owner logged in"}
                >
                  <Icon name="lock" className="h-4 w-4" />
                  Logout
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setOwnerLoginOpen(true)}
                  className="inline-flex items-center gap-2 rounded-xl border border-black bg-black px-3 py-2 text-xs font-semibold text-white hover:bg-slate-900 hover:border-slate-900 sm:text-sm"
                >
                  <Icon name="lock" className="h-4 w-4" />
                  Login
                </button>
              )}
            </div>
          </div>

          {/* Search + filters */}
          <div className="mt-2 grid grid-cols-1 gap-2 pb-3 sm:mt-3 md:grid-cols-[1fr_auto] md:items-center">
            <label className="relative">
              <span className="sr-only">Search</span>
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                <Icon name="search" />
              </span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder='Search “paneer”, “pizza”, “biryani”…'
                className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-3 text-sm outline-none placeholder:text-slate-400 focus:border-slate-300"
              />
            </label>

            <div className="no-scrollbar momentum-scroll flex items-center gap-2 overflow-x-auto overscroll-x-contain py-1 md:overflow-visible">
              <button
                type="button"
                className={pillClasses(foodFilter === "ALL")}
                onClick={() => applyFoodFilter("ALL")}
              >
                All
              </button>
              <button
                type="button"
                className={pillClasses(foodFilter === "VEG")}
                onClick={() => applyFoodFilter("VEG")}
              >
                <FoodMark kind="VEG" className="h-4 w-4" />
                Veg
              </button>
              <button
                type="button"
                className={pillClasses(foodFilter === "NONVEG")}
                onClick={() => applyFoodFilter("NONVEG")}
              >
                <FoodMark kind="NONVEG" className="h-4 w-4" />
                Non-Veg
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="mx-auto w-full max-w-3xl px-4 pb-5" style={{ paddingTop: headerHeight + 16 }}>
        <section className="space-y-6">
          {/* Categories grid (multi-select filter) */}
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-sm font-semibold text-slate-900">Categories</div>
                  {selectedCategoryIds.length > 0 ? (
                    <div className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700">
                      {selectedCategoryIds.length} selected
                    </div>
                  ) : null}
                  {ownerMode ? (
                    <div className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800">
                      Owner
                    </div>
                  ) : null}
                </div>

                <div className="mt-0.5 text-xs text-slate-500">
                  Tap to filter. Select multiple categories.
                </div>

                {selectedCategoryIds.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setSelectedCategoryIds([])}
                    className="mt-2 inline-flex items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                  >
                    Clear
                  </button>
                ) : null}

                {ownerMode ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800">
                      <input
                        type="checkbox"
                        checked={showUnavailableForOwner}
                        onChange={(e) => setShowUnavailableForOwner(e.target.checked)}
                        className="h-4 w-4"
                      />
                      Show unavailable
                    </label>

                    <button
                      type="button"
                      onClick={() => {
                        setAvailability({});
                        showToast("Availability reset (all available)");
                      }}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                    >
                      Reset availability
                    </button>

                    <button
                      type="button"
                      onClick={ownerLogout}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                    >
                      Logout
                    </button>

                    <div className="text-[11px] font-semibold text-slate-500">
                      {maskMobile(ownerMobile!)}
                    </div>
                  </div>
                ) : null}
              </div>

              <a
                href="#qr"
                className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
              >
                QR
              </a>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {categoryGridSections.map((s) => {
                const selected = selectedCategoryIds.includes(s.id);
                const inView = activeSectionId === s.id;
                const availableSec = availableSectionIds.has(s.id);
                const dimmed = !availableSec;

                return (
                  <button
                    key={s.id}
                    type="button"
                    disabled={!availableSec}
                    className={categoryGridBtnClasses({ selected, inView, dimmed })}
                    onClick={() => toggleCategory(s.id)}
                    aria-pressed={selected}
                    aria-current={inView ? "true" : undefined}
                    title={!availableSec ? "No items under current filters" : undefined}
                  >
                    <div className="line-clamp-2 leading-snug">{categoryNavLabel(s)}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-10">
            {filteredMenu.map((section) => (
              <div
                key={section.id}
                ref={(el) => {
                  sectionRefs.current[section.id] = el;
                }}
                style={{ scrollMarginTop: headerHeight + 24 }}
              >
                <div className="mb-3">
                  <h2 className="text-lg font-semibold">{section.title}</h2>
                  {section.subtitle ? <p className="text-sm text-slate-600">{section.subtitle}</p> : null}
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {section.items.map((item) => (
                    <MenuItemCompact
                      key={item.id}
                      item={item}
                      available={isAvailable(item.id)}
                      ownerMode={ownerMode}
                      onSetAvailable={(next) => setItemAvailable(item.id, next)}
                    />
                  ))}
                </div>
              </div>
            ))}

            {filteredMenu.length === 0 ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-6 text-center text-slate-600">
                No items match your search/filters.
              </div>
            ) : null}
          </div>

          <section
            id="qr"
            className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
            style={{ scrollMarginTop: headerHeight + 24 }}
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">QR Code</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Print this QR and place it on tables. It opens this exact menu page.
                </p>

                <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                  <div className="font-semibold text-slate-900">Link</div>
                  <div className="mt-1 break-all">{menuUrl || "Loading…"}</div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={copyLink}
                    className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--primary-dark)]"
                  >
                    <Icon name="copy" className="h-4 w-4" />
                    Copy link
                  </button>
                  <button
                    type="button"
                    onClick={downloadQr}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                  >
                    <Icon name="download" className="h-4 w-4" />
                    Download QR
                  </button>
                </div>
              </div>

              <div className="flex shrink-0 items-center justify-center">
                <div className="rounded-3xl border border-slate-200 bg-white p-4">
                  <div
                    ref={qrWrapRef}
                    className="grid place-items-center rounded-2xl bg-white p-3"
                    aria-label="Menu QR code"
                  >
                    <QRCode
                      value={menuUrl || "https://example.com"}
                      size={190}
                      bgColor="#ffffff"
                      fgColor="#0f172a"
                      level="H"
                    />
                  </div>
                  <div className="mt-2 text-center">
                    <div className="text-sm font-semibold">Lollyzz</div>
                    <div className="text-xs text-slate-500">Scan to view menu</div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <footer className="pb-10 text-center text-xs text-slate-500">
            <div>Lollyzz — Digital QR Menu.</div>
            <div className="mt-2">
              {ownerMode ? (
                <button
                  type="button"
                  onClick={ownerLogout}
                  className="text-[11px] font-semibold text-slate-500 underline underline-offset-2"
                >
                  Owner logout
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setOwnerLoginOpen(true)}
                  className="text-[11px] font-semibold text-slate-400 underline underline-offset-2"
                >
                  Owner login
                </button>
              )}
            </div>
          </footer>
        </section>
      </main>

      <OwnerLoginModal open={ownerLoginOpen} onClose={() => setOwnerLoginOpen(false)} onLogin={ownerLogin} />

      {toast ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
          <div className="pointer-events-auto rounded-2xl bg-[var(--primary)] px-4 py-3 text-sm font-medium text-white shadow-lg">
            {toast}
          </div>
        </div>
      ) : null}
    </div>
  );
}
