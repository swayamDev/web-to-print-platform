"use client";

import { AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowUp, Trash2 } from "lucide-react";

import type { LaidOutItem } from "@/domain/design/layout";
import type { DesignElement, TextElement } from "@/domain/design/schema";
import { FONT_IDS, FONT_LABELS } from "@/lib/print/fonts";
import { cn } from "@/lib/utils";

const SWATCHES = [
  "#121212",
  "#FFFFFF",
  "#FF4D00",
  "#1F8A4C",
  "#3B5BDB",
  "#C62828",
  "#D4B26A",
  "#FFDD00",
];

type Props = {
  element: DesignElement;
  laidOut: LaidOutItem | undefined;
  onChange: (patch: Partial<TextElement> & { fill?: string }) => void;
  onDelete: () => void;
  onMove: (direction: "up" | "down") => void;
};

/** Properties of the selected element. Every change goes through the design history. */
export function ElementPanel({ element, laidOut, onChange, onDelete, onMove }: Props) {
  const fitted = laidOut?.kind === "text" ? laidOut : null;

  return (
    <div className="grid gap-4" data-testid="element-panel">
      <div className="flex items-center justify-between">
        <p className="spec-label text-muted-foreground">
          {element.type === "text" ? "Text" : element.type === "rect" ? "Shape" : "Image"}
          {element.type === "text" && element.placeholderKey
            ? ` · {${element.placeholderKey}}`
            : ""}
        </p>
        <div className="flex gap-1">
          <IconButton label="Bring forward" onClick={() => onMove("up")}>
            <ArrowUp className="size-4" />
          </IconButton>
          <IconButton label="Send backward" onClick={() => onMove("down")}>
            <ArrowDown className="size-4" />
          </IconButton>
          <IconButton label="Delete element" onClick={onDelete} danger>
            <Trash2 className="size-4" />
          </IconButton>
        </div>
      </div>

      {element.type === "text" ? (
        <>
          <Field label="Text" htmlFor="el-text">
            <input
              id="el-text"
              value={element.text}
              maxLength={500}
              onChange={(e) => onChange({ text: e.target.value })}
              className="bg-background focus-visible:ring-ring/50 h-10 w-full rounded-md border px-3 outline-none focus-visible:ring-3"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Font" htmlFor="el-font">
              <select
                id="el-font"
                value={element.fontId}
                onChange={(e) => onChange({ fontId: e.target.value })}
                className="bg-background focus-visible:ring-ring/50 h-10 w-full min-w-0 rounded-md border px-2 outline-none focus-visible:ring-3"
              >
                {FONT_IDS.map((id) => (
                  <option key={id} value={id}>
                    {FONT_LABELS[id]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Size (pt)" htmlFor="el-size">
              <input
                id="el-size"
                type="number"
                min={4}
                max={400}
                step={1}
                value={element.maxFontSize}
                onChange={(e) => {
                  const size = Number(e.target.value);
                  if (!Number.isFinite(size) || size < 4 || size > 400) return;
                  onChange({
                    maxFontSize: size,
                    fontSize: size,
                    minFontSize: Math.min(element.minFontSize, size),
                  });
                }}
                className="num bg-background focus-visible:ring-ring/50 h-10 w-full rounded-md border px-3 font-mono outline-none focus-visible:ring-3"
              />
            </Field>
          </div>
          {fitted ? (
            <p className="text-muted-foreground text-xs" data-testid="fit-status">
              {fitted.fits
                ? fitted.adjusted
                  ? `Shrunk to fit: ${fitted.fontSizePt} pt`
                  : `Printed at ${fitted.fontSizePt} pt`
                : `Too long: does not fit even at ${element.minFontSize} pt`}
            </p>
          ) : null}
          <div className="grid gap-1.5">
            <span className="text-sm font-medium" id="align-label">
              Alignment
            </span>
            <div className="flex gap-1" role="group" aria-labelledby="align-label">
              {(
                [
                  ["left", AlignLeft],
                  ["center", AlignCenter],
                  ["right", AlignRight],
                ] as const
              ).map(([value, Icon]) => (
                <button
                  key={value}
                  type="button"
                  aria-label={`Align ${value}`}
                  aria-pressed={element.align === value}
                  onClick={() => onChange({ align: value })}
                  className={cn(
                    "grid size-9 place-items-center rounded-md border",
                    element.align === value
                      ? "border-ink bg-ink text-paper"
                      : "bg-background hover:border-ink",
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
          <ColourField value={element.color} onChange={(color) => onChange({ color })} />
        </>
      ) : null}

      {element.type === "rect" ? (
        <ColourField
          value={element.fill}
          onChange={(fill) => onChange({ fill })}
          label="Fill colour"
        />
      ) : null}

      {element.type === "image" ? (
        <p className="text-muted-foreground text-sm">
          Logo slot. Uploading your own logo arrives with the artwork upload step.
        </p>
      ) : null}

      <Field label="Rotation (°)" htmlFor="el-rotation">
        <input
          id="el-rotation"
          type="number"
          min={-180}
          max={180}
          step={1}
          value={Math.round(element.rotation ?? 0)}
          onChange={(e) => {
            const rotation = Number(e.target.value);
            if (Number.isFinite(rotation) && rotation >= -360 && rotation <= 360)
              onChange({ rotation });
          }}
          className="num bg-background focus-visible:ring-ring/50 h-10 w-24 rounded-md border px-3 font-mono outline-none focus-visible:ring-3"
        />
      </Field>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}

function ColourField({
  value,
  onChange,
  label = "Colour",
}: {
  value: string;
  onChange: (color: string) => void;
  label?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {SWATCHES.map((swatch) => (
          <button
            key={swatch}
            type="button"
            aria-label={`${label} ${swatch}`}
            aria-pressed={value.toUpperCase() === swatch}
            onClick={() => onChange(swatch)}
            className={cn(
              "size-7 rounded-full border",
              value.toUpperCase() === swatch && "ring-ink ring-2 ring-offset-2",
            )}
            style={{ background: swatch }}
          />
        ))}
        <input
          type="color"
          aria-label={`Custom ${label.toLowerCase()}`}
          value={value.toLowerCase()}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="h-7 w-10 cursor-pointer rounded border bg-transparent"
        />
      </div>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "grid size-8 place-items-center rounded-md border",
        danger ? "text-destructive hover:bg-destructive/10" : "hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}
