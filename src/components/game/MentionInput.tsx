"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Mention from "@tiptap/extension-mention";
import { type SuggestionKeyDownProps, type SuggestionProps } from "@tiptap/suggestion";
import type { Player } from "@/types/game";

type MentionCandidate = {
  id: string;
  label: string;
  seat: number;
  displayName: string;
  playerId: string;
};

type SuggestionLike = {
  items?: MentionCandidate[];
  command: (item: MentionCandidate) => void;
  clientRect?: () => DOMRect | null;
  event?: KeyboardEvent;
};

interface MentionInputProps {
  value: string;
  onChange: (next: string) => void;
  onSend: () => void;
  onFinishSpeaking?: () => void;
  placeholder?: string;
  isNight?: boolean;
  players: Player[];
}

function createSuggestionItems(players: Player[]) {
  return ({ query }: { query: string }) => {
    const q = query.trim().toLowerCase();
    const candidates = players;
    return candidates
      .map((p): MentionCandidate => ({
        id: String(p.seat + 1),
        label: `${p.seat + 1}号 ${p.displayName}`,
        seat: p.seat,
        displayName: p.displayName,
        playerId: p.playerId,
      }))
      .filter((item) => {
        if (!q) return true;
        return item.label.toLowerCase().includes(q) || String(item.seat + 1).includes(q);
      })
      .slice(0, 8);
  };
}

function renderSuggestionList(onOpenChange?: (open: boolean) => void) {
  let el: HTMLDivElement | null = null;
  let selectedIndex = 0;
  let lastItems: MentionCandidate[] = [];
  let lastCommand: ((item: MentionCandidate) => void) | null = null;
  let updateRef: (() => void) | null = null;

  const getItems = (props: SuggestionLike) => (Array.isArray(props.items) ? props.items : []);

  const clampIndex = (idx: number, len: number) => {
    if (len <= 0) return 0;
    if (idx < 0) return len - 1;
    if (idx >= len) return 0;
    return idx;
  };

  return {
    onStart: (props: SuggestionProps) => {
      el = document.createElement("div");
      el.className =
        "z-[80] rounded-lg border border-[var(--glass-border)] bg-[var(--glass-panel)] backdrop-blur-xl px-1 py-1 shadow-xl max-h-[160px] overflow-y-auto";
      onOpenChange?.(true);
      el.style.minWidth = "180px";
      el.style.width = "auto";
      document.body.appendChild(el);

      const update = () => {
        if (!el) return;
        const p = props as unknown as SuggestionLike;
        const { command, clientRect } = p;
        const items = getItems(p);
        lastItems = items;
        lastCommand = command;
        if (!clientRect) return;

        const rect = clientRect();
        if (!rect) return;

        el.style.position = "absolute";
        el.style.left = `${rect.left + window.scrollX}px`;
        // Expand upwards: anchor to caret top and translate menu height
        el.style.top = `${rect.top + window.scrollY - 6}px`;
        el.style.transform = "translateY(-100%)";

        el.innerHTML = "";

        if (items.length === 0) {
          selectedIndex = 0;
          const empty = document.createElement("div");
          empty.className = "px-3 py-2 text-xs text-slate-500";
          empty.textContent = "没有匹配的玩家";
          el.appendChild(empty);
          return;
        }

        selectedIndex = clampIndex(selectedIndex, items.length);

        items.forEach((item, idx: number) => {
          const row = document.createElement("button");
          row.type = "button";
          row.className =
            "w-full text-left px-3 py-2 rounded-md text-sm text-[var(--text-primary)] hover:bg-[var(--color-gold)]/15 transition-colors flex items-center gap-2 whitespace-nowrap " +
            (idx === selectedIndex ? "bg-[var(--color-gold)]/20" : "");
          
          // Avatar
          const avatarBgColors = ['e8d5c4', 'd4e5d7', 'd5dce8', 'e8d4d9', 'ddd4e8', 'd4e8e5', 'e8e4d4', 'd4d8e8', 'e5d4d4', 'dae8d4'];
          let hash = 0;
          for (let i = 0; i < item.playerId.length; i++) {
            hash = item.playerId.charCodeAt(i) + ((hash << 5) - hash);
          }
          const bgColor = avatarBgColors[Math.abs(hash) % avatarBgColors.length];
          const avatarUrl = `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(item.playerId)}&backgroundColor=${bgColor}`;
          
          const avatar = document.createElement("img");
          avatar.src = avatarUrl;
          avatar.alt = item.displayName;
          avatar.className = "w-6 h-6 rounded-full shrink-0";
          row.appendChild(avatar);
          
          const labelSpan = document.createElement("span");
          labelSpan.textContent = item.label;
          row.appendChild(labelSpan);
          
          row.addEventListener("click", () => command(item));
          el!.appendChild(row);
        });
      };

      // first render
      update();

      updateRef = update;
    },
    onUpdate: (props: SuggestionProps) => {
      if (!el) return;
      const p = props as unknown as SuggestionLike;
      lastItems = getItems(p);
      lastCommand = p.command;
      updateRef?.();
    },
    onKeyDown: (props: SuggestionKeyDownProps) => {
      if (!el) return false;
      const items = lastItems;

      if (props.event.key === "Escape") {
        el.remove();
        el = null;
        return true;
      }

      if (items.length > 0) {
        if (props.event.key === "ArrowDown") {
          selectedIndex = clampIndex(selectedIndex + 1, items.length);
          updateRef?.();
          return true;
        }
        if (props.event.key === "ArrowUp") {
          selectedIndex = clampIndex(selectedIndex - 1, items.length);
          updateRef?.();
          return true;
        }
        if (props.event.key === "Enter") {
          lastCommand?.(items[selectedIndex]);
          return true;
        }
      }
      return false;
    },
    onExit: () => {
      if (el) {
        el.remove();
        el = null;
      }
      updateRef = null;
      onOpenChange?.(false);
    },
  };
}

export function MentionInput({ value, onChange, onSend, onFinishSpeaking, placeholder, isNight, players }: MentionInputProps) {
  const items = useMemo(() => createSuggestionItems(players), [players]);
  const [isSuggestionOpen, setIsSuggestionOpen] = useState(false);
  
  const suggestionRenderer = useMemo(() => {
    return () => renderSuggestionList((open) => {
      setIsSuggestionOpen(open);
    });
  }, []);

  const editor = useEditor({
    immediatelyRender: false,
    autofocus: "end",
    extensions: [
      StarterKit,
      Mention.configure({
        HTMLAttributes: {
          class: "mention",
        },
        suggestion: {
          char: "@",
          items,
          render: suggestionRenderer,
        },
        renderText({ node }) {
          // Store as plain text: "@3号小明"
          const seat = node.attrs.id;
          const label = node.attrs.label;
          if (typeof label === "string" && label.length > 0) return `@${label}`;
          return `@${seat}号`;
        },
      }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class:
          "wc-input-field w-full min-h-[44px] max-h-[120px] text-base focus:outline-none transition-all cursor-text",
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getText({ blockSeparator: "\n" }));
    },
  });

  useEffect(() => {
    if (!editor) return;
    const currentText = editor.getText({ blockSeparator: "\n" });
    if (currentText === value) return;
    editor.commands.setContent(value || "", { emitUpdate: false });
  }, [value, editor]);

  if (!editor) return null;

  return (
    <div className="w-full flex-1 relative">
      {(!value || value.trim().length === 0) && placeholder ? (
        <div
          className={
            "pointer-events-none absolute left-0 top-0 text-base " +
            (isNight ? "text-white/35" : "text-[var(--text-secondary)]")
          }
        >
          {placeholder}
        </div>
      ) : null}

      <EditorContent
        editor={editor}
        className="w-full"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            // Don't send if suggestion popup is open
            if (isSuggestionOpen) return;
            e.preventDefault();
            onSend();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            onFinishSpeaking?.();
          }
        }}
      />
    </div>
  );
}
