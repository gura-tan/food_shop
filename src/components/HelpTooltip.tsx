import { useState, useRef, useEffect } from 'react';

interface Props {
  /** ツールチップに表示するテキスト（改行は \n で） */
  text: string;
}

/**
 * ヘルプアイコン（ℹ）を表示し、ホバーまたはタップで
 * テキストのツールチップを表示するコンポーネント。
 */
export function HelpTooltip({ text }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // タップ時: 外側をタップしたら閉じる
  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent | TouchEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [open]);

  // テキストを段落に分割して表示
  const paragraphs = text.split('\n').filter(l => l.trim() !== '');

  return (
    <div
      ref={wrapRef}
      className="help-tooltip-wrap"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="help-tooltip-btn"
        aria-label="ヘルプ"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
      >
        ℹ
      </button>

      {open && (
        <div className="help-tooltip-box" role="tooltip">
          {paragraphs.map((p, i) => (
            <p key={i} className="help-tooltip-para">{p}</p>
          ))}
        </div>
      )}
    </div>
  );
}
