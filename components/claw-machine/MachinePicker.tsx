'use client';
import { useEffect, useRef, useState } from 'react';
import { buildClawSpec } from './claws';
import {
  MAX_MACHINES, NAME_MAX, activeMachine, addMachine, removeMachine, renameMachine, selectMachine,
  type Fleet, type MachineConfig,
} from './fleet';
import { CATEGORY_INFO } from './items';

/** One line about how a machine is set up, so the operator can tell them apart. */
function summary(m: MachineConfig) {
  const claw = buildClawSpec(m.rig.claw, m.rig.fit).label;
  const items = m.rig.stock.categories.map((c) => CATEGORY_INFO[c].icon).join('');
  const count = m.rig.stock.random ? `${m.rig.stock.countMin}–${m.rig.stock.count}` : `${m.rig.stock.count}`;
  const payout = m.settings.guaranteeN === 0 ? '無保夾' : m.settings.payoutMode === 0 ? `保夾 ${m.settings.guaranteeN}` : `機率 1/${m.settings.guaranteeN}`;
  return `${claw} · ${items} ${count}個 · ${payout}`;
}

/**
 * Header switcher for the operator's machines. Each machine keeps its own
 * board settings, claw, stock, chute and books; picking one loads it.
 */
export default function MachinePicker({ fleet, onFleet }: { fleet: Fleet; onFleet: (f: Fleet) => void }) {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const active = activeMachine(fleet);

  // Close on a click outside or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) { setRenaming(null); setConfirmDelete(null); }
  }, [open]);

  const pick = (id: string) => {
    if (id !== active.id) onFleet(selectMachine(fleet, id));
    setOpen(false);
  };
  const startRename = (m: MachineConfig) => {
    setConfirmDelete(null);
    setRenaming(m.id);
    setDraft(m.name);
  };
  const commitRename = () => {
    if (renaming) onFleet(renameMachine(fleet, renaming, draft));
    setRenaming(null);
  };
  const full = fleet.machines.length >= MAX_MACHINES;

  return (
    <div ref={box} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`機台：${active.name}`}
        onClick={() => setOpen((o) => !o)}
        className="flex max-w-[9rem] items-center gap-1 rounded-md border border-fuchsia-400/50 bg-black/30 px-2 py-1 text-xs font-bold text-fuchsia-100 hover:bg-fuchsia-500/20"
      >
        <span aria-hidden>🕹</span>
        <span className="truncate">{active.name}</span>
        <span aria-hidden className="text-fuchsia-300/70">▾</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="機台列表"
          className="fixed inset-x-3 top-12 z-30 rounded-lg border border-fuchsia-500/40 bg-slate-900 p-2 text-slate-100 shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-1 sm:w-80"
        >
          <p className="px-1 pb-1.5 text-[11px] text-slate-400">每台機台各自保存主機板設定、爪子、擺場、出貨口和帳目。</p>
          <ul className="flex max-h-[55vh] flex-col gap-1 overflow-y-auto" role="radiogroup" aria-label="選擇機台">
            {fleet.machines.map((m) => {
              const isActive = m.id === active.id;
              return (
                <li key={m.id} className={`rounded-md border ${isActive ? 'border-amber-400/80 bg-amber-500/10' : 'border-slate-700'}`}>
                  {renaming === m.id ? (
                    <form
                      className="flex items-center gap-1.5 p-1.5"
                      onSubmit={(e) => { e.preventDefault(); commitRename(); }}
                    >
                      <input
                        autoFocus
                        value={draft}
                        maxLength={NAME_MAX}
                        onChange={(e) => setDraft(e.target.value)}
                        aria-label="機台名稱"
                        className="min-w-0 flex-1 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-sm"
                      />
                      <button type="submit" className="rounded bg-amber-500 px-2 py-1 text-xs font-bold text-slate-950">確定</button>
                      <button type="button" onClick={() => setRenaming(null)} className="rounded px-1.5 py-1 text-xs text-slate-400">取消</button>
                    </form>
                  ) : (
                    <div className="flex items-center gap-1 p-1">
                      <button
                        type="button"
                        role="radio"
                        aria-checked={isActive}
                        onClick={() => pick(m.id)}
                        className="min-w-0 flex-1 rounded px-1.5 py-1 text-left hover:bg-slate-800"
                      >
                        <span className={`block truncate text-sm font-semibold ${isActive ? 'text-amber-200' : ''}`}>{m.name}</span>
                        <span className="block truncate text-[10px] text-slate-400">{summary(m)}</span>
                      </button>
                      {confirmDelete === m.id ? (
                        <>
                          <button
                            type="button"
                            onClick={() => { onFleet(removeMachine(fleet, m.id)); setConfirmDelete(null); }}
                            className="rounded bg-rose-600 px-2 py-1 text-xs font-bold text-white"
                          >
                            確定刪除
                          </button>
                          <button type="button" onClick={() => setConfirmDelete(null)} className="rounded px-1.5 py-1 text-xs text-slate-400">取消</button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            aria-label={`重新命名 ${m.name}`}
                            title="重新命名"
                            onClick={() => startRename(m)}
                            className="rounded px-1.5 py-1 text-sm text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                          >
                            ✎
                          </button>
                          <button
                            type="button"
                            aria-label={`刪除 ${m.name}`}
                            title={fleet.machines.length <= 1 ? '至少要留一台' : '刪除'}
                            disabled={fleet.machines.length <= 1}
                            onClick={() => { setRenaming(null); setConfirmDelete(m.id); }}
                            className="rounded px-1.5 py-1 text-sm text-slate-400 hover:bg-rose-950 hover:text-rose-300 disabled:opacity-30 disabled:hover:bg-transparent"
                          >
                            🗑
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="mt-2 flex gap-1.5">
            <button
              type="button"
              disabled={full}
              onClick={() => { onFleet(addMachine(fleet)); setOpen(false); }}
              className="flex-1 rounded-md bg-amber-500 px-2 py-1.5 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-40"
            >
              ＋ 新增機台
            </button>
            <button
              type="button"
              disabled={full}
              onClick={() => { onFleet(addMachine(fleet, active.id)); setOpen(false); }}
              className="flex-1 rounded-md border border-amber-400/70 px-2 py-1.5 text-xs font-bold text-amber-300 hover:bg-amber-500/10 disabled:opacity-40"
            >
              複製這台設定
            </button>
          </div>
          {full && <p className="mt-1 px-1 text-[11px] text-slate-500">最多 {MAX_MACHINES} 台。</p>}
        </div>
      )}
    </div>
  );
}
