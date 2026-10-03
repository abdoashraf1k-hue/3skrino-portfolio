"use client";

import { useState, type KeyboardEvent, type ReactNode } from "react";

type Props<T> = {
  items: T[];
  getId: (item: T) => string;
  onChange: (items: T[]) => void;
  /** `move(-1)` / `move(1)` for explicit buttons. */
  render: (item: T, index: number, move: (delta: number) => void) => ReactNode;
  direction?: "row" | "column";
  className?: string;
  itemClassName?: string;
  label: string;
  /** Only start drags from a [data-drag-handle] element (rows with text inputs). */
  handle?: boolean;
};

function moved<T>(list: T[], from: number, to: number): T[] {
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(next.length, to)), 0, item);
  return next;
}

/**
 * Small native drag-and-drop list for the hero settings (poses, logos,
 * roles). Keyboard: focus an item, Alt+←/→ (rows) or Alt+↑/↓ (columns).
 */
export default function ReorderList<T>({
  items,
  getId,
  onChange,
  render,
  direction = "column",
  className,
  itemClassName,
  label,
  handle = false,
}: Props<T>) {
  const [dragging, setDragging] = useState<number | null>(null);
  const [armed, setArmed] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  const move = (from: number, delta: number) => {
    const to = from + delta;
    if (to < 0 || to >= items.length) return;
    onChange(moved(items, from, to));
  };

  const onKey = (e: KeyboardEvent<HTMLLIElement>, i: number) => {
    if (!e.altKey || e.target !== e.currentTarget) return;
    const back = direction === "row" ? "ArrowLeft" : "ArrowUp";
    const fwd = direction === "row" ? "ArrowRight" : "ArrowDown";
    if (e.key !== back && e.key !== fwd) return;
    e.preventDefault();
    move(i, e.key === fwd ? 1 : -1);
    const list = e.currentTarget.parentElement;
    const to = i + (e.key === fwd ? 1 : -1);
    requestAnimationFrame(() => (list?.children[to] as HTMLElement | undefined)?.focus());
  };

  return (
    <ul aria-label={label} className={className}>
      {items.map((item, i) => (
        <li
          key={getId(item)}
          tabIndex={0}
          draggable={!handle || armed === i}
          onPointerDown={(e) => {
            if (handle) setArmed(e.target instanceof Element && e.target.closest("[data-drag-handle]") ? i : null);
          }}
          aria-roledescription="sortable item"
          onDragStart={(e) => {
            setDragging(i);
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", getId(item));
          }}
          onDragOver={(e) => {
            if (dragging === null) return;
            e.preventDefault();
            if (over !== i) setOver(i);
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (dragging !== null && dragging !== i) onChange(moved(items, dragging, i));
            setDragging(null);
            setOver(null);
          }}
          onDragEnd={() => {
            setDragging(null);
            setOver(null);
            setArmed(null);
          }}
          onKeyDown={(e) => onKey(e, i)}
          className={`${itemClassName ?? ""} outline-none transition-[opacity,box-shadow] focus-visible:ring-1 focus-visible:ring-[#e7fe55] ${
            dragging === i ? "opacity-40" : ""
          } ${over === i && dragging !== null && dragging !== i ? "ring-1 ring-[#e7fe55]/70" : ""}`}
        >
          {render(item, i, (delta) => move(i, delta))}
        </li>
      ))}
    </ul>
  );
}
