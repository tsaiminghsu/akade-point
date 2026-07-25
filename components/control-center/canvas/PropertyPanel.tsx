"use client";

import { useShallow } from "zustand/react/shallow";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/control-center/shared/EmptyState";
import { LAYER_GROUP_LABEL } from "@/lib/control-center/constants";
import { useControlCenterStore } from "@/store/useControlCenterStore";
import { useMachinesStore } from "@/store/useMachinesStore";
import type { Widget } from "@/lib/control-center/types";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function NumberField({ value, onChange, min, max, step = 1 }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <Input
      type="number"
      value={Math.round(value * 100) / 100}
      min={min}
      max={max}
      step={step}
      onChange={(e) => {
        const n = Number(e.target.value);
        if (!Number.isNaN(n)) onChange(n);
      }}
      className="h-8"
    />
  );
}

export function PropertyPanel() {
  const selection = useControlCenterStore(useShallow((s) => s.selection));
  const widgets = useControlCenterStore((s) => s.widgets);
  const updateWidget = useControlCenterStore((s) => s.updateWidget);
  const updateWidgets = useControlCenterStore((s) => s.updateWidgets);
  const commit = useControlCenterStore((s) => s.commit);
  const machines = useMachinesStore((s) => s.machines);
  const stores = useMachinesStore((s) => s.stores);
  const groups = useMachinesStore((s) => s.groups);

  const selected = widgets.filter((w) => selection.includes(w.id));

  function patch(id: string, p: Partial<Widget>) {
    updateWidget(id, p);
  }
  function patchAndCommit(id: string, p: Partial<Widget>) {
    updateWidget(id, p);
    commit();
  }

  return (
    <div className="flex h-full w-72 shrink-0 flex-col border-l border-border bg-card/40">
      <div className="border-b border-border px-3 py-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Properties</p>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-4 p-3">
          {selected.length === 0 && (
            <EmptyState title="Nothing selected" description="Select a widget on the canvas to edit its properties." />
          )}

          {selected.length > 1 && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">{selected.length} widgets selected</p>
              <Field label="Opacity">
                <Slider
                  value={[selected[0].opacity * 100]}
                  min={0}
                  max={100}
                  step={5}
                  onValueChange={([v]) => updateWidgets(selection, { opacity: v / 100 })}
                  onValueCommit={() => commit()}
                />
              </Field>
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Lock all</Label>
                <Switch checked={selected.every((w) => w.locked)} onCheckedChange={(v) => { updateWidgets(selection, { locked: v }); commit(); }} />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Visible</Label>
                <Switch checked={selected.every((w) => !w.hidden)} onCheckedChange={(v) => { updateWidgets(selection, { hidden: !v }); commit(); }} />
              </div>
            </div>
          )}

          {selected.length === 1 && (() => {
            const w = selected[0];
            const machine = w.type === "machine" ? machines.find((m) => m.id === w.machineId) : undefined;
            const store = machine ? stores.find((s) => s.id === machine.storeId) : undefined;
            const group = machine ? groups.find((g) => g.id === machine.groupId) : undefined;

            return (
              <div className="space-y-4">
                <Field label="Name">
                  <Input className="h-8" value={w.name} onChange={(e) => patch(w.id, { name: e.target.value })} onBlur={() => commit()} />
                </Field>

                {w.type === "machine" && (
                  <>
                    <Field label="Bound Machine">
                      <Select value={w.machineId || undefined} onValueChange={(v) => patchAndCommit(w.id, { machineId: v })}>
                        <SelectTrigger className="h-8">
                          <SelectValue placeholder="Unbound" />
                        </SelectTrigger>
                        <SelectContent>
                          {machines.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Device ID">
                      <Input className="h-8" value={machine?.deviceId ?? "—"} readOnly disabled />
                    </Field>
                    <Field label="Store">
                      <Input className="h-8" value={store?.name ?? "—"} readOnly disabled />
                    </Field>
                    <Field label="Group">
                      <Input className="h-8" value={group?.name ?? "—"} readOnly disabled />
                    </Field>
                    <Field label="Widget Size">
                      <Select value={w.size} onValueChange={(v) => patchAndCommit(w.id, { size: v as typeof w.size })}>
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="small">Small</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="large">Large</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  </>
                )}

                {w.type === "text" && (
                  <>
                    <Field label="Text">
                      <Input className="h-8" value={w.text} onChange={(e) => patch(w.id, { text: e.target.value })} onBlur={() => commit()} />
                    </Field>
                    <Field label="Font Size">
                      <NumberField value={w.fontSize} min={8} max={72} onChange={(v) => patchAndCommit(w.id, { fontSize: v })} />
                    </Field>
                    <Field label="Color">
                      <Input type="color" className="h-8 w-full" value={w.color} onChange={(e) => patchAndCommit(w.id, { color: e.target.value })} />
                    </Field>
                  </>
                )}

                {(w.type === "rectangle" || w.type === "circle") && (
                  <>
                    <Field label="Background">
                      <Input className="h-8" value={w.fill} onChange={(e) => patch(w.id, { fill: e.target.value })} onBlur={() => commit()} />
                    </Field>
                    <Field label="Border Color">
                      <Input type="color" className="h-8 w-full" value={w.stroke} onChange={(e) => patchAndCommit(w.id, { stroke: e.target.value })} />
                    </Field>
                    <Field label="Border Width">
                      <NumberField value={w.strokeWidth} min={0} max={12} onChange={(v) => patchAndCommit(w.id, { strokeWidth: v })} />
                    </Field>
                  </>
                )}

                {w.type === "zone" && (
                  <>
                    <Field label="Label">
                      <Input className="h-8" value={w.label} onChange={(e) => patch(w.id, { label: e.target.value })} onBlur={() => commit()} />
                    </Field>
                    <Field label="Background">
                      <Input className="h-8" value={w.fill} onChange={(e) => patch(w.id, { fill: e.target.value })} onBlur={() => commit()} />
                    </Field>
                  </>
                )}

                {(w.type === "camera" || w.type === "map") && (
                  <Field label="Label">
                    <Input className="h-8" value={w.label} onChange={(e) => patch(w.id, { label: e.target.value })} onBlur={() => commit()} />
                  </Field>
                )}

                {w.type === "counter" && (
                  <>
                    <Field label="Label">
                      <Input className="h-8" value={w.label} onChange={(e) => patch(w.id, { label: e.target.value })} onBlur={() => commit()} />
                    </Field>
                    <Field label="Value">
                      <NumberField value={w.value} onChange={(v) => patchAndCommit(w.id, { value: v })} />
                    </Field>
                  </>
                )}

                {(w.type === "arrow" || w.type === "line") && (
                  <>
                    <Field label="Color">
                      <Input type="color" className="h-8 w-full" value={w.stroke} onChange={(e) => patchAndCommit(w.id, { stroke: e.target.value })} />
                    </Field>
                    <Field label="Thickness">
                      <NumberField value={w.strokeWidth} min={1} max={12} onChange={(v) => patchAndCommit(w.id, { strokeWidth: v })} />
                    </Field>
                  </>
                )}

                {w.type === "divider" && (
                  <Field label="Orientation">
                    <Select value={w.orientation} onValueChange={(v) => patchAndCommit(w.id, { orientation: v as typeof w.orientation })}>
                      <SelectTrigger className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="horizontal">Horizontal</SelectItem>
                        <SelectItem value="vertical">Vertical</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                )}

                <Separator />

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Width">
                    <NumberField value={w.width} min={8} onChange={(v) => patchAndCommit(w.id, { width: v })} />
                  </Field>
                  <Field label="Height">
                    <NumberField value={w.height} min={8} onChange={(v) => patchAndCommit(w.id, { height: v })} />
                  </Field>
                  <Field label="Rotation">
                    <NumberField value={w.rotation} onChange={(v) => patchAndCommit(w.id, { rotation: v })} />
                  </Field>
                  <Field label="Z-Index">
                    <Input className="h-8" value={w.zIndex} readOnly disabled />
                  </Field>
                </div>

                <Field label={`Opacity — ${Math.round(w.opacity * 100)}%`}>
                  <Slider
                    value={[w.opacity * 100]}
                    min={0}
                    max={100}
                    step={5}
                    onValueChange={([v]) => patch(w.id, { opacity: v / 100 })}
                    onValueCommit={() => commit()}
                  />
                </Field>

                <Field label="Layer">
                  <Input className="h-8" value={LAYER_GROUP_LABEL[w.layerGroup]} readOnly disabled />
                </Field>

                <Separator />

                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Locked</Label>
                  <Switch checked={w.locked} onCheckedChange={(v) => patchAndCommit(w.id, { locked: v })} />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Visible</Label>
                  <Switch checked={!w.hidden} onCheckedChange={(v) => patchAndCommit(w.id, { hidden: !v })} />
                </div>
              </div>
            );
          })()}
        </div>
      </ScrollArea>
    </div>
  );
}
