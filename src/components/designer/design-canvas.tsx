"use client";

import type Konva from "konva";
import { useEffect, useMemo, useRef, useState } from "react";
import { Group, Layer, Path, Rect, Stage, Transformer } from "react-konva";

import type { DesignLayout } from "@/domain/design/layout";
import type { DesignDocument, DesignElement } from "@/domain/design/schema";
import { textToPathData, type LoadedFont } from "@/lib/print/fonts";

export type ElementChange = Partial<Pick<DesignElement, "x" | "y" | "w" | "h" | "rotation">>;

type Props = {
  doc: DesignDocument;
  layout: DesignLayout;
  fonts: Map<string, LoadedFont>;
  selectedId: string | null;
  issueIds: Set<string>;
  previewMode: boolean;
  onSelect: (id: string | null) => void;
  onChange: (id: string, change: ElementChange) => void;
};

const MIN_SIZE_MM = 2;
const round = (n: number) => Math.round(n * 100) / 100;

/**
 * The design canvas. The Konva stage is scaled so one unit = one millimetre of the output
 * page (trim + bleed), and every element is drawn from the same layout the PDF/PNG renderers
 * use. Text is drawn as glyph outlines from the print fonts, so it matches the proof exactly.
 */
export function DesignCanvas({
  doc,
  layout,
  fonts,
  selectedId,
  issueIds,
  previewMode,
  onSelect,
  onChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const nodeRefs = useRef(new Map<string, Konva.Group>());
  const [box, setBox] = useState({ width: 0, height: 0 });

  // Fit the page into the available space (width, and at most ~70% of the viewport height).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() =>
      setBox({ width: el.clientWidth, height: Math.max(240, window.innerHeight * 0.7) }),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const W = layout.pageWidthMm;
  const H = layout.pageHeightMm;
  const scale = box.width > 0 ? Math.min(box.width / W, box.height / H) : 0;
  const elements = useMemo(() => new Map(doc.elements.map((e) => [e.id, e])), [doc.elements]);

  // Attach the transformer to the selected element.
  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;
    const node = selectedId && !previewMode ? nodeRefs.current.get(selectedId) : undefined;
    transformer.nodes(node ? [node] : []);
    transformer.getLayer()?.batchDraw();
  }, [selectedId, previewMode, layout]);

  const b = layout.bleedMm;
  const t = layout.trim;
  const safe = doc.safeMargin;

  return (
    <div ref={containerRef} className="w-full" data-testid="design-canvas">
      {scale > 0 ? (
        <Stage
          width={W * scale}
          height={H * scale}
          scaleX={scale}
          scaleY={scale}
          className="mx-auto w-fit shadow-[0_24px_60px_-28px_rgb(18_18_18/0.45)]"
          onMouseDown={(e) => {
            if (e.target === e.target.getStage() || e.target.name() === "page") onSelect(null);
          }}
          onTouchStart={(e) => {
            if (e.target === e.target.getStage() || e.target.name() === "page") onSelect(null);
          }}
        >
          <Layer>
            <Rect name="page" x={0} y={0} width={W} height={H} fill={layout.background} />

            {layout.items.map((item) => {
              const el = elements.get(item.id);
              if (!el) return null;
              const locked = !!el.locked || previewMode;
              const cx = el.x + b + el.w / 2;
              const cy = el.y + b + el.h / 2;

              let content: React.ReactNode = null;
              if (item.kind === "rect") {
                content = (
                  <Rect x={item.x} y={item.y} width={item.w} height={item.h} fill={item.fill} />
                );
              } else if (item.kind === "text") {
                const font = fonts.get(item.fontId);
                const data = font
                  ? textToPathData(
                      font,
                      item.text,
                      item.originX,
                      item.originY,
                      item.fontSizePt,
                      item.trackingPerMille,
                    )
                  : "";
                content = (
                  <>
                    {/* Invisible hit area so the whole box is draggable, not just the glyphs. */}
                    <Rect
                      x={item.box.x}
                      y={item.box.y}
                      width={item.box.w}
                      height={item.box.h}
                      fill="transparent"
                    />
                    {data ? <Path data={data} fill={item.color} listening={false} /> : null}
                  </>
                );
              } else if (item.kind === "image") {
                content = (
                  <Rect
                    x={item.x}
                    y={item.y}
                    width={item.w}
                    height={item.h}
                    fill="#e9e6df"
                    stroke="#8a8780"
                    strokeWidth={0.3}
                    dash={[1.5, 1]}
                  />
                );
              }

              return (
                <Group
                  key={item.id}
                  ref={(node) => {
                    if (node) nodeRefs.current.set(item.id, node);
                    else nodeRefs.current.delete(item.id);
                  }}
                  name={`element ${item.id}`}
                  x={cx}
                  y={cy}
                  offsetX={cx}
                  offsetY={cy}
                  rotation={el.rotation ?? 0}
                  draggable={!locked}
                  listening={!locked}
                  onMouseDown={() => onSelect(item.id)}
                  onTap={() => onSelect(item.id)}
                  onDragStart={() => onSelect(item.id)}
                  onDragEnd={(e) => {
                    const node = e.target;
                    onChange(item.id, {
                      x: round(el.x + (node.x() - cx)),
                      y: round(el.y + (node.y() - cy)),
                    });
                  }}
                  onTransformEnd={(e) => {
                    const node = e.target;
                    const w = Math.max(MIN_SIZE_MM, el.w * node.scaleX());
                    const h = Math.max(MIN_SIZE_MM, el.h * node.scaleY());
                    node.scaleX(1);
                    node.scaleY(1);
                    onChange(item.id, {
                      x: round(node.x() - w / 2 - b),
                      y: round(node.y() - h / 2 - b),
                      w: round(w),
                      h: round(h),
                      rotation: round(node.rotation()),
                    });
                  }}
                >
                  {content}
                </Group>
              );
            })}
          </Layer>

          {!previewMode ? (
            <Layer listening={false}>
              {/* Bleed: tinted area outside the trim, cut off in production. */}
              <Path
                data={`M0 0H${W}V${H}H0Z M${t.x} ${t.y}V${t.y + t.h}H${t.x + t.w}V${t.y}Z`}
                fill="#ff4d00"
                opacity={0.14}
                fillRule="evenodd"
              />
              <Rect x={t.x} y={t.y} width={t.w} height={t.h} stroke="#121212" strokeWidth={0.35} />
              <Rect
                x={t.x + safe}
                y={t.y + safe}
                width={t.w - 2 * safe}
                height={t.h - 2 * safe}
                stroke="#ff4d00"
                strokeWidth={0.3}
                dash={[1.2, 1]}
              />
              {/* Elements with print problems are outlined in red. */}
              {layout.items
                .filter((item) => issueIds.has(item.id))
                .map((item) => {
                  const el = elements.get(item.id);
                  if (!el) return null;
                  const cx = el.x + b + el.w / 2;
                  const cy = el.y + b + el.h / 2;
                  return (
                    <Rect
                      key={`issue-${item.id}`}
                      x={cx}
                      y={cy}
                      offsetX={el.w / 2}
                      offsetY={el.h / 2}
                      width={el.w}
                      height={el.h}
                      rotation={el.rotation ?? 0}
                      stroke="#c62828"
                      strokeWidth={0.5}
                      dash={[1.5, 1]}
                    />
                  );
                })}
            </Layer>
          ) : null}

          {/* Handles get their own interactive layer above the guides. */}
          <Layer visible={!previewMode}>
            <Transformer
              ref={transformerRef}
              rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
              rotationSnapTolerance={4}
              anchorSize={10}
              anchorCornerRadius={2}
              borderStroke="#ff4d00"
              anchorStroke="#ff4d00"
              keepRatio={false}
              ignoreStroke
              boundBoxFunc={(oldBox, newBox) =>
                Math.abs(newBox.width) < MIN_SIZE_MM * scale ||
                Math.abs(newBox.height) < MIN_SIZE_MM * scale
                  ? oldBox
                  : newBox
              }
            />
          </Layer>
        </Stage>
      ) : (
        <div
          className="bg-muted aspect-[3/4] w-full animate-pulse rounded-md"
          aria-label="Loading canvas"
        />
      )}
    </div>
  );
}
