"use client";

import { Eye, EyeOff, FileUp, ImagePlus, Redo2, Save, Shapes, Type, Undo2, X } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import {
  addRect,
  addText,
  moveElement,
  placeArtwork,
  placeImage,
  removeElement,
  updateElement,
} from "@/domain/design/document";
import { constrainGeometry } from "@/domain/design/constraints";
import { layoutDocument } from "@/domain/design/layout";
import { designDocumentSchema, type DesignDocument } from "@/domain/design/schema";
import { validateDocument } from "@/domain/design/validate";
import { formatMinor } from "@/domain/money";
import { acceptAttribute, type AssetInfo } from "@/domain/uploads";
import { calculatePrice, type PricingRules } from "@/domain/pricing";
import { formatMm } from "@/lib/format";
import { cn } from "@/lib/utils";
import { saveDesignAction } from "@/server/actions/designs";
import type { ClientAsset } from "@/server/assets";

import type { ElementChange } from "./design-canvas";
import { ElementPanel } from "./element-panel";
import { historyReducer, initialHistory } from "./history";
import { usePrintFonts } from "./use-print-fonts";
import { useUploads } from "./use-uploads";

// Konva needs the browser; never render it on the server.
const DesignCanvas = dynamic(() => import("./design-canvas").then((m) => m.DesignCanvas), {
  ssr: false,
  loading: () => <div className="bg-muted aspect-[3/4] w-full animate-pulse rounded-md" />,
});

export type DesignerProps = {
  product: { slug: string; name: string };
  rules: PricingRules;
  config: {
    widthMm: number;
    heightMm: number;
    materialSlug: string;
    quantity: number;
    options: Record<string, string>;
    variableData: boolean;
  };
  templateId: string | null;
  initialDocument: DesignDocument;
  design: { id: string; name: string; isLocked: boolean } | null;
  /** Signed-in customer, or null for visitors (who are asked to log in to save or upload). */
  userId: string | null;
  /** Uploads the design already uses, with preview URLs. */
  initialAssets: ClientAsset[];
};

const DRAFT_KEY = "dh-design-draft";
type SaveState =
  | { kind: "idle" }
  | { kind: "dirty" }
  | { kind: "saving" }
  | { kind: "saved"; at: string }
  | { kind: "error"; message: string };

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable);

/**
 * The web-to-print designer (PRD p5 §06): template-driven editing in millimetres, with live
 * print checks. Saves to the customer's account; visitors are asked to log in on first save
 * and their draft is carried through.
 */
export function Designer({
  product,
  rules,
  config,
  templateId,
  initialDocument,
  design,
  userId,
  initialAssets,
}: DesignerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { fonts, error: fontError } = usePrintFonts();

  const [history, dispatch] = useReducer(historyReducer, initialDocument, initialHistory);
  const doc = history.present;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [designId, setDesignId] = useState(design?.id ?? null);
  const [name, setName] = useState(
    design?.name ?? `${product.name} ${formatMm(config.widthMm)}×${formatMm(config.heightMm)} mm`,
  );
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  const locked = design?.isLocked ?? false;
  const [assets, setAssets] = useState(() => new Map(initialAssets.map((a) => [a.id, a])));
  const assetInfos = new Map<string, AssetInfo>(assets);
  const uploads = useUploads(userId);
  const logoInput = useRef<HTMLInputElement>(null);
  const artworkInput = useRef<HTMLInputElement>(null);
  const [notices, setNotices] = useState<string[]>([]);

  const commit = useCallback(
    (next: DesignDocument, key?: string) => {
      dispatch({ type: "commit", doc: next, key, at: Date.now() });
      setSaveState({ kind: "dirty" });
    },
    [dispatch],
  );

  // Live layout and print checks, from the same code the server uses.
  const layout = fonts ? layoutDocument(doc, {}, (id) => fonts.get(id)?.metrics) : null;
  const issues = layout ? validateDocument(doc, layout, assetInfos) : [];
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  const issueIds = new Set(issues.map((i) => i.elementId));
  const selected = doc.elements.find((e) => e.id === selectedId) ?? null;
  const priced = calculatePrice(rules, { productSlug: product.slug, ...config });

  // ---------------------------------------------------------------------------
  // Saving
  // ---------------------------------------------------------------------------
  /** Keep the draft in this browser and send the visitor to log in; it is saved on return. */
  const stashDraftAndLogin = useCallback(
    (documentToSave: DesignDocument, nameToSave: string) => {
      try {
        localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({
            productSlug: product.slug,
            templateId,
            config,
            name: nameToSave,
            document: documentToSave,
          }),
        );
      } catch {
        /* storage unavailable: the user can still save after logging in, from scratch */
      }
      const url = new URL(window.location.href);
      url.searchParams.set("restore", "1");
      router.push(`/login?next=${encodeURIComponent(url.pathname + url.search)}`);
    },
    [product.slug, templateId, config, router],
  );

  const save = useCallback(
    async (documentToSave: DesignDocument, nameToSave: string) => {
      setSaveState({ kind: "saving" });
      const result = await saveDesignAction({
        designId,
        productSlug: product.slug,
        templateId,
        name: nameToSave.trim() || product.name,
        config,
        document: documentToSave,
      });
      if (result.status === "login-required") {
        stashDraftAndLogin(documentToSave, nameToSave);
        return;
      }
      if (result.status === "error") {
        setSaveState({ kind: "error", message: result.message });
        return;
      }
      if (!designId) {
        setDesignId(result.id);
        // Give the design its own address without reloading the editor.
        window.history.replaceState(null, "", `/design/${result.id}`);
      }
      setSaveState({ kind: "saved", at: result.savedAt });
    },
    [designId, product.slug, product.name, templateId, config, stashDraftAndLogin],
  );

  // Restore a draft carried through login (?restore=1), then save it to the account.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || searchParams.get("restore") !== "1") return;
    // Read the draft from browser storage (an external store) in a callback, then save it.
    const timer = setTimeout(() => {
      restored.current = true;
      try {
        const raw = localStorage.getItem(DRAFT_KEY);
        if (!raw) return;
        const draft = JSON.parse(raw) as { productSlug: string; name: string; document: unknown };
        const parsed = designDocumentSchema.safeParse(draft.document);
        if (draft.productSlug !== product.slug || !parsed.success) return;
        localStorage.removeItem(DRAFT_KEY);
        dispatch({ type: "reset", doc: parsed.data });
        setName(draft.name);
        void save(parsed.data, draft.name);
      } catch {
        /* ignore unreadable drafts */
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [searchParams, product.slug, save]);

  // Autosave saved designs a moment after the last change.
  useEffect(() => {
    if (!designId || locked || saveState.kind !== "dirty") return;
    const timer = setTimeout(() => void save(doc, name), 2000);
    return () => clearTimeout(timer);
  }, [designId, locked, saveState.kind, doc, name, save]);

  // ---------------------------------------------------------------------------
  // Editing
  // ---------------------------------------------------------------------------
  /**
   * Apply a change to one element. Position, size and rotation changes are kept inside the
   * element's print area (constrainGeometry); a change that cannot fit at all is ignored.
   * `key` merges rapid edits to one field into a single undo step.
   */
  const change = useCallback(
    (id: string, patch: ElementChange | Record<string, unknown>, key?: string) => {
      const el = doc.elements.find((e) => e.id === id);
      if (!el) return;
      const geometryKeys = ["x", "y", "w", "h", "rotation"] as const;
      let next = patch as Record<string, unknown>;
      if (geometryKeys.some((k) => k in patch)) {
        const geometry = constrainGeometry(doc, el, patch as ElementChange);
        if (!geometry) return;
        next = { ...patch, ...geometry };
      }
      commit(updateElement(doc, id, next), key);
    },
    [doc, commit],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === "z") {
        event.preventDefault();
        dispatch({ type: event.shiftKey ? "redo" : "undo" });
        setSaveState({ kind: "dirty" });
      } else if (mod && event.key.toLowerCase() === "y") {
        event.preventDefault();
        dispatch({ type: "redo" });
        setSaveState({ kind: "dirty" });
      } else if (
        selected &&
        !selected.locked &&
        (event.key === "Delete" || event.key === "Backspace")
      ) {
        event.preventDefault();
        commit(removeElement(doc, selected.id));
        setSelectedId(null);
      } else if (selected && !selected.locked && event.key.startsWith("Arrow")) {
        event.preventDefault();
        const step = event.shiftKey ? 5 : 1;
        const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
        const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
        // Nudges stop at the edge of the print area like dragging does.
        change(selected.id, { x: selected.x + dx, y: selected.y + dy }, `${selected.id}:nudge`);
      } else if (event.key === "Escape") {
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doc, selected, commit, change]);

  // ---------------------------------------------------------------------------
  // Uploads
  // ---------------------------------------------------------------------------
  const rememberAsset = (asset: ClientAsset) =>
    setAssets((current) => new Map(current).set(asset.id, asset));

  const chooseFile = (input: React.RefObject<HTMLInputElement | null>) => {
    if (!userId) {
      stashDraftAndLogin(doc, name); // uploads belong to an account
      return;
    }
    uploads.clear();
    input.current?.click();
  };

  const onLogoChosen = async (file: File | undefined) => {
    if (!file) return;
    const slotId = selected?.type === "image" && selected.role !== "artwork" ? selected.id : null;
    const asset = await uploads.upload(file, "logo");
    if (!asset) return;
    rememberAsset(asset);
    const placed = placeImage(doc, asset, slotId);
    commit(placed.doc);
    setSelectedId(placed.id);
    setNotices(asset.warnings);
  };

  const onArtworkChosen = async (file: File | undefined) => {
    if (!file) return;
    const asset = await uploads.upload(file, "artwork");
    if (!asset) return;
    rememberAsset(asset);
    const placed = placeArtwork(doc, asset);
    commit(placed.doc);
    setSelectedId(placed.id);
    setNotices([...placed.notes, ...asset.warnings]);
  };

  const statusText =
    saveState.kind === "saving"
      ? "Saving…"
      : saveState.kind === "saved"
        ? `Saved ${new Date(saveState.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
        : saveState.kind === "dirty"
          ? designId
            ? "Unsaved changes"
            : "Not saved yet"
          : saveState.kind === "error"
            ? saveState.message
            : designId
              ? "All changes saved"
              : "Not saved yet";

  return (
    <div className="grid gap-4">
      {/* Toolbar ------------------------------------------------------------- */}
      <div className="bg-card flex flex-wrap items-center gap-2 rounded-xl border p-2">
        <label htmlFor="design-name" className="sr-only">
          Design name
        </label>
        <input
          id="design-name"
          value={name}
          maxLength={120}
          onChange={(e) => {
            setName(e.target.value);
            setSaveState({ kind: "dirty" });
          }}
          className="hover:border-border focus-visible:border-ring focus-visible:ring-ring/50 h-9 min-w-0 flex-1 basis-48 rounded-md border-transparent bg-transparent px-2 font-medium outline-none focus-visible:ring-3"
        />
        <div className="flex flex-wrap items-center gap-1">
          <ToolButton
            label="Add text"
            disabled={locked || previewMode}
            onClick={() => {
              const result = addText(doc);
              commit(result.doc);
              setSelectedId(result.id);
            }}
          >
            <Type className="size-4" /> <span className="max-sm:sr-only">Text</span>
          </ToolButton>
          <ToolButton
            label="Add shape"
            disabled={locked || previewMode}
            onClick={() => {
              const result = addRect(doc);
              commit(result.doc);
              setSelectedId(result.id);
            }}
          >
            <Shapes className="size-4" /> <span className="max-sm:sr-only">Shape</span>
          </ToolButton>
          <ToolButton
            label={
              selected?.type === "image" && selected.role !== "artwork"
                ? "Replace image"
                : "Add image"
            }
            disabled={locked || previewMode || uploads.state.kind === "busy"}
            onClick={() => chooseFile(logoInput)}
          >
            <ImagePlus className="size-4" /> <span className="max-sm:sr-only">Image</span>
          </ToolButton>
          <ToolButton
            label="Upload finished artwork"
            disabled={locked || previewMode || uploads.state.kind === "busy"}
            onClick={() => chooseFile(artworkInput)}
          >
            <FileUp className="size-4" /> <span className="max-sm:sr-only">Artwork</span>
          </ToolButton>
          <input
            ref={logoInput}
            type="file"
            accept={acceptAttribute("logo")}
            className="sr-only"
            tabIndex={-1}
            aria-label="Choose an image file"
            data-testid="logo-input"
            onChange={(e) => {
              void onLogoChosen(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <input
            ref={artworkInput}
            type="file"
            accept={acceptAttribute("artwork")}
            className="sr-only"
            tabIndex={-1}
            aria-label="Choose an artwork file"
            data-testid="artwork-input"
            onChange={(e) => {
              void onArtworkChosen(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <ToolButton
            label="Undo"
            disabled={history.past.length === 0}
            onClick={() => dispatch({ type: "undo" })}
          >
            <Undo2 className="size-4" />
          </ToolButton>
          <ToolButton
            label="Redo"
            disabled={history.future.length === 0}
            onClick={() => dispatch({ type: "redo" })}
          >
            <Redo2 className="size-4" />
          </ToolButton>
          <ToolButton
            label={previewMode ? "Show guides" : "Preview as printed"}
            pressed={previewMode}
            onClick={() => {
              setPreviewMode((v) => !v);
              setSelectedId(null);
            }}
          >
            {previewMode ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            <span className="max-sm:sr-only">{previewMode ? "Guides" : "Preview"}</span>
          </ToolButton>
          <button
            type="button"
            onClick={() => void save(doc, name)}
            disabled={locked || saveState.kind === "saving"}
            className="bg-primary text-primary-foreground inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium disabled:opacity-50"
          >
            <Save className="size-4" aria-hidden="true" /> Save
          </button>
        </div>
        <p
          className={cn(
            "w-full px-2 text-xs sm:w-auto",
            saveState.kind === "error" ? "text-destructive" : "text-muted-foreground",
          )}
          role="status"
          data-testid="save-status"
        >
          {statusText}
        </p>
      </div>

      {uploads.state.kind !== "idle" || notices.length > 0 ? (
        <div
          role={uploads.state.kind === "error" ? "alert" : "status"}
          data-testid="upload-status"
          className={cn(
            "flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm",
            uploads.state.kind === "error"
              ? "border-destructive/40 bg-destructive/5 text-destructive"
              : "bg-card",
          )}
        >
          <div className="grid gap-1">
            {uploads.state.kind !== "idle" ? <p>{uploads.state.message}</p> : null}
            {notices.map((notice) => (
              <p key={notice}>{notice}</p>
            ))}
          </div>
          {uploads.state.kind !== "busy" ? (
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => {
                uploads.clear();
                setNotices([]);
              }}
              className="hover:bg-muted rounded p-0.5"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ) : null}

      {locked ? (
        <p className="bg-muted rounded-lg px-4 py-3 text-sm">
          This design is locked because a proof of it was approved. It can be reordered as it is.
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        {/* Canvas --------------------------------------------------------------- */}
        <div className="bg-mm-grid grid min-w-0 gap-3 rounded-xl border p-4">
          {fontError ? (
            <p className="text-destructive text-sm">
              The design fonts could not load. Please reload the page.
            </p>
          ) : fonts && layout ? (
            <DesignCanvas
              doc={doc}
              layout={layout}
              fonts={fonts}
              selectedId={selectedId}
              issueIds={issueIds}
              previewMode={previewMode || locked}
              onSelect={setSelectedId}
              onChange={change}
              imageUrls={new Map([...assets].map(([id, a]) => [id, a.url]))}
            />
          ) : (
            <div
              className="bg-muted aspect-[3/4] w-full animate-pulse rounded-md"
              aria-label="Loading fonts"
            />
          )}
          {!previewMode ? (
            <p className="spec-label text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
              <span>
                <span className="bg-signal/30 mr-1.5 inline-block size-2.5 align-middle" /> Bleed
                (trimmed off)
              </span>
              <span>
                <span className="border-ink mr-1.5 inline-block size-2.5 border align-middle" />{" "}
                Trim {formatMm(doc.trim.w)} × {formatMm(doc.trim.h)} mm
              </span>
              <span>
                <span className="border-signal mr-1.5 inline-block size-2.5 border border-dashed align-middle" />{" "}
                Safe area
              </span>
            </p>
          ) : null}
        </div>

        {/* Phones: room to scroll the canvas up above the bottom sheet while it is open. */}
        {selected ? <div aria-hidden="true" className="h-[45vh] lg:hidden" /> : null}

        {/* Side panel ------------------------------------------------------------ */}
        <aside className="grid content-start gap-4">
          <section
            aria-label="Selected element"
            data-testid="selected-panel"
            className={cn(
              "bg-card rounded-xl border p-4",
              // Phones: the panel becomes a bottom sheet so the canvas stays visible above it.
              selected &&
                "max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-40 max-lg:max-h-[45vh] max-lg:overflow-y-auto max-lg:rounded-b-none max-lg:pb-[max(1rem,env(safe-area-inset-bottom))] max-lg:shadow-[0_-16px_40px_-20px_rgb(18_18_18/0.45)]",
            )}
          >
            {selected ? (
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="bg-ink text-paper mb-3 w-full rounded-md py-2 text-sm font-medium lg:hidden"
              >
                Done
              </button>
            ) : null}
            {selected ? (
              <ElementPanel
                element={selected}
                laidOut={layout?.items.find((i) => i.id === selected.id)}
                asset={
                  selected.type === "image" && selected.assetId
                    ? assets.get(selected.assetId)
                    : undefined
                }
                onReplaceImage={() =>
                  chooseFile(
                    selected.type === "image" && selected.role === "artwork"
                      ? artworkInput
                      : logoInput,
                  )
                }
                onChange={(patch) =>
                  change(
                    selected.id,
                    patch,
                    `${selected.id}:${Object.keys(patch).sort().join(",")}`,
                  )
                }
                onDelete={() => {
                  commit(removeElement(doc, selected.id));
                  setSelectedId(null);
                }}
                onMove={(direction) => commit(moveElement(doc, selected.id, direction))}
              />
            ) : (
              <p className="text-muted-foreground text-sm">
                Tap or click something on the page to edit it, or add text or a shape. Drag to move;
                use the handles to resize and rotate. Everything stops at the edge of the print area
                (text at the safe line). Arrow keys nudge by 1 mm (Shift: 5 mm).
              </p>
            )}
          </section>

          <section
            className={cn(
              "rounded-xl border p-4",
              errors.length
                ? "border-destructive/40 bg-destructive/5"
                : warnings.length
                  ? "border-warning/40 bg-warning/5"
                  : "bg-card",
            )}
            aria-label="Print check"
            data-testid="print-check"
          >
            <p className="spec-label text-muted-foreground mb-2">Print check</p>
            {!layout ? (
              <p className="text-muted-foreground text-sm">Checking…</p>
            ) : errors.length === 0 && warnings.length === 0 ? (
              <p className="text-success text-sm font-medium">
                Ready to print: everything is inside the print area.
              </p>
            ) : (
              <ul className="grid gap-2 text-sm">
                {errors.length === 0 ? (
                  <li className="text-success font-medium">Ready to print, with a note:</li>
                ) : null}
                {issues.map((issue, index) => (
                  <li key={`${issue.elementId}-${issue.code}-${index}`}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(issue.elementId)}
                      className={cn(
                        "text-left underline-offset-4 hover:underline",
                        issue.severity === "error" ? "text-destructive" : "text-warning",
                      )}
                    >
                      {issue.message}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section
            className="bg-card grid gap-2 rounded-xl border p-4 text-sm"
            aria-label="Order summary"
          >
            <p className="spec-label text-muted-foreground">Your order</p>
            <p>
              {product.name} · {formatMm(config.widthMm)} × {formatMm(config.heightMm)} mm ·{" "}
              {rules.materials.find((m) => m.slug === config.materialSlug)?.name}
            </p>
            {priced.ok ? (
              <p className="num font-mono">
                {config.quantity.toLocaleString("en-GB")} items ·{" "}
                {formatMinor(priced.quote.totalGrossMinor, priced.quote.currency)} incl.{" "}
                {priced.quote.taxLabel}
              </p>
            ) : null}
            <Link
              href={`/p/${product.slug}?${new URLSearchParams({
                w: String(config.widthMm),
                h: String(config.heightMm),
                m: config.materialSlug,
                q: String(config.quantity),
              })}`}
              className="underline underline-offset-4"
            >
              Change size, material or quantity
            </Link>
            <p className="text-muted-foreground text-xs">
              Ordering opens with checkout; for now your design is saved to your account.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}

function ToolButton({
  label,
  onClick,
  disabled,
  pressed,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-md border px-2.5 text-sm disabled:opacity-40",
        pressed ? "border-ink bg-ink text-paper" : "bg-background hover:border-ink",
      )}
    >
      {children}
    </button>
  );
}
