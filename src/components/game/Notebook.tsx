import { useState, useEffect } from "react";
import { NotePencil, Trash } from "@phosphor-icons/react";

export function Notebook() {
  const [content, setContent] = useState("");

  // Load from local storage on mount
  useEffect(() => {
    const saved = localStorage.getItem("wolfcha-notebook");
    if (saved) setContent(saved);
  }, []);

  // Save to local storage on change
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setContent(newValue);
    localStorage.setItem("wolfcha-notebook", newValue);
  };

  const clearNotes = () => {
    if (confirm("确定要清空笔记吗？")) {
      setContent("");
      localStorage.removeItem("wolfcha-notebook");
    }
  };

  return (
    <div className="flex flex-col h-full bg-[var(--bg-card)] rounded-lg border border-[var(--border-color)] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-color)] bg-[var(--bg-secondary)]">
        <div className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
          <NotePencil size={16} />
          <span>笔记本</span>
        </div>
        <button 
          onClick={clearNotes}
          className="p-1 cursor-pointer hover:bg-[var(--bg-hover)] rounded text-[var(--text-muted)] hover:text-[var(--color-danger)] transition-colors"
          title="清空笔记"
        >
          <Trash size={14} />
        </button>
      </div>
      <textarea
        className="flex-1 w-full p-3 resize-none bg-transparent border-none outline-none text-sm leading-relaxed text-[var(--text-primary)] placeholder-[var(--text-muted)]"
        placeholder="在这里记录游戏线索..."
        value={content}
        onChange={handleChange}
        spellCheck={false}
      />
    </div>
  );
}
