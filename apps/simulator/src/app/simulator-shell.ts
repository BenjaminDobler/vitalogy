import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterOutlet } from '@angular/router';
import { ReplayDriver, SensorSim } from 'dev-sim';
import { RecordingService } from 'recording';
import {
  ALL_RECORD_TILES,
  ConfigService,
  type RecordLayout,
  type RecordTile,
} from 'api-client';

type SimMode = 'synthetic' | 'replay';

/**
 * Desktop-sized wrapper around the FeatureRecord component. Left sidebar
 * carries the dev controls; the right pane embeds the actual mobile record
 * screen at phone-width so you see exactly what the rider sees.
 */
@Component({
  selector: 'app-simulator-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, FormsModule, RouterOutlet],
  template: `
    <div class="min-h-screen bg-slate-100 text-slate-900 flex">
      <aside class="w-[360px] border-r border-slate-300 bg-white p-5 flex flex-col gap-5 overflow-y-auto">
        <div>
          <h1 class="text-lg font-semibold">Vitalogy Simulator</h1>
          <p class="text-xs text-slate-500 mt-1">
            Replay recorded rides or drive synthetic numbers through the live
            record UI. No data is uploaded.
          </p>
        </div>

        <section class="border border-slate-200 rounded-lg p-3">
          <label class="block text-xs uppercase tracking-wider text-slate-500 mb-2">
            Data source
          </label>
          <div class="flex gap-2">
            <button
              type="button"
              (click)="setMode('synthetic')"
              class="flex-1 px-3 py-1.5 rounded-md border text-sm"
              [class.bg-slate-900]="mode() === 'synthetic'"
              [class.text-white]="mode() === 'synthetic'"
              [class.border-slate-900]="mode() === 'synthetic'"
              [class.border-slate-300]="mode() !== 'synthetic'"
            >Synthetic</button>
            <button
              type="button"
              (click)="setMode('replay')"
              class="flex-1 px-3 py-1.5 rounded-md border text-sm"
              [class.bg-slate-900]="mode() === 'replay'"
              [class.text-white]="mode() === 'replay'"
              [class.border-slate-900]="mode() === 'replay'"
              [class.border-slate-300]="mode() !== 'replay'"
            >Replay</button>
          </div>
        </section>

        @if (mode() === 'synthetic') {
          <section class="border border-slate-200 rounded-lg p-3 space-y-3">
            <div>
              <div class="flex items-baseline justify-between text-xs text-slate-500">
                <span>Speed</span>
                <span class="font-mono">{{ simSpeed() | number: '1.0-0' }} km/h</span>
              </div>
              <input
                type="range"
                min="0"
                max="60"
                step="1"
                [value]="simSpeed()"
                (input)="setSimSpeed(toNum($event))"
                class="w-full"
              />
            </div>
            <div>
              <div class="flex items-baseline justify-between text-xs text-slate-500">
                <span>Heart rate</span>
                <span class="font-mono">{{ simHr() }} bpm</span>
              </div>
              <input
                type="range"
                min="50"
                max="200"
                step="1"
                [value]="simHr()"
                (input)="setSimHr(toNum($event))"
                class="w-full"
              />
            </div>
            <div>
              <div class="flex items-baseline justify-between text-xs text-slate-500">
                <span>Cadence</span>
                <span class="font-mono">{{ simCadence() }} rpm</span>
              </div>
              <input
                type="range"
                min="0"
                max="120"
                step="1"
                [value]="simCadence()"
                (input)="setSimCadence(toNum($event))"
                class="w-full"
              />
            </div>
            <p class="text-[11px] text-slate-500">
              Slide Speed to 0 for a few seconds to verify auto-pause once it lands.
            </p>
          </section>
        } @else {
          <section class="border border-slate-200 rounded-lg p-3 space-y-3">
            <div>
              <label class="block text-xs uppercase tracking-wider text-slate-500 mb-1">
                Activity
              </label>
              <select
                [value]="selectedId()"
                (change)="selectActivity(toString($event))"
                class="w-full text-sm rounded-md border border-slate-300 px-2 py-1.5 bg-white"
              >
                <option value="" disabled>— pick a ride —</option>
                @for (a of activities(); track a.id) {
                  <option [value]="a.id">
                    {{ a.name }} · {{ (a.distanceM / 1000) | number: '1.1-1' }} km · {{ formatDur(a.durationSec) }}
                  </option>
                }
              </select>
            </div>
            <button
              type="button"
              (click)="reloadActivities()"
              class="text-xs text-slate-500 hover:underline"
            >Reload list</button>

            <div>
              <label class="block text-xs uppercase tracking-wider text-slate-500 mb-1">
                Playback speed
              </label>
              <div class="flex gap-1">
                @for (s of speeds; track s) {
                  <button
                    type="button"
                    (click)="setReplaySpeed(s)"
                    class="flex-1 px-2 py-1 rounded-md border text-sm"
                    [class.bg-slate-900]="replaySpeed() === s"
                    [class.text-white]="replaySpeed() === s"
                    [class.border-slate-900]="replaySpeed() === s"
                    [class.border-slate-300]="replaySpeed() !== s"
                  >{{ s }}×</button>
                }
              </div>
            </div>

            @if (selectedActivity(); as a) {
              <div class="space-y-1.5">
                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    (click)="togglePlayPause()"
                    [disabled]="!running()"
                    class="w-8 h-8 rounded-md border border-slate-300 hover:bg-slate-50 disabled:opacity-50 flex items-center justify-center text-sm"
                    [attr.aria-label]="replayPaused() ? 'Resume' : 'Pause'"
                  >{{ replayPaused() ? '▶' : '⏸' }}</button>
                  <input
                    type="range"
                    min="0"
                    max="1000"
                    step="1"
                    [value]="replayProgress() * 1000"
                    (input)="scrubReplay(toNum($event) / 1000)"
                    class="flex-1 accent-emerald-500"
                  />
                </div>
                <div class="flex justify-between text-[11px] text-slate-500 font-mono pl-10">
                  <span>{{ formatDurLong(replayPlayheadSec()) }}</span>
                  <span>{{ formatDurLong(a.durationSec) }}</span>
                </div>
              </div>
            }

            @if (replayError(); as e) {
              <p class="text-xs text-rose-500">{{ e }}</p>
            }
          </section>
        }

        <section class="border border-slate-200 rounded-lg p-3 space-y-3">
          <div class="text-xs uppercase tracking-wider text-slate-500">Display</div>

          <div>
            <div class="text-xs text-slate-500 mb-1">Layout</div>
            <div class="flex gap-2">
              <button
                type="button"
                (click)="setRecordLayout('two-col')"
                class="flex-1 px-2 py-1 rounded-md border text-xs"
                [class.bg-slate-900]="layout() === 'two-col'"
                [class.text-white]="layout() === 'two-col'"
                [class.border-slate-900]="layout() === 'two-col'"
                [class.border-slate-300]="layout() !== 'two-col'"
              >2 columns</button>
              <button
                type="button"
                (click)="setRecordLayout('one-col')"
                class="flex-1 px-2 py-1 rounded-md border text-xs"
                [class.bg-slate-900]="layout() === 'one-col'"
                [class.text-white]="layout() === 'one-col'"
                [class.border-slate-900]="layout() === 'one-col'"
                [class.border-slate-300]="layout() !== 'one-col'"
              >1 col · big</button>
            </div>
          </div>

          <div>
            <div class="text-xs text-slate-500 mb-1">Tiles</div>
            <div class="space-y-1">
              @for (t of allTiles; track t.id) {
                <label class="flex items-center justify-between gap-2 px-2 py-1 rounded hover:bg-slate-100 cursor-pointer">
                  <span class="text-xs">{{ t.label }}</span>
                  <input
                    type="checkbox"
                    [checked]="isTileEnabled(t.id)"
                    (change)="toggleTile(t.id, toBool($event))"
                    class="w-4 h-4 accent-sky-500"
                  />
                </label>
              }
            </div>
          </div>
        </section>

        <section class="border border-slate-200 rounded-lg p-3 space-y-3">
          <div class="text-xs uppercase tracking-wider text-slate-500">Auto-pause</div>
          <label class="flex items-center justify-between gap-2">
            <span class="text-xs">Pause when speed &lt; threshold</span>
            <input
              type="checkbox"
              [checked]="autoPauseEnabled()"
              (change)="setAutoPauseEnabled(toBool($event))"
              class="w-4 h-4 accent-sky-500"
            />
          </label>
          <div class="grid grid-cols-2 gap-2">
            <label class="block">
              <span class="block text-[10px] text-slate-500">Threshold km/h</span>
              <input
                type="number"
                min="0"
                max="50"
                step="0.5"
                [value]="autoPauseThresholdKmh()"
                (change)="setAutoPauseThresholdKmh(toNum($event))"
                [disabled]="!autoPauseEnabled()"
                class="w-full rounded-md border border-slate-300 px-2 py-1 text-xs tabular-nums disabled:opacity-50"
              />
            </label>
            <label class="block">
              <span class="block text-[10px] text-slate-500">Delay sec</span>
              <input
                type="number"
                min="1"
                max="60"
                step="1"
                [value]="autoPauseDelaySec()"
                (change)="setAutoPauseDelaySec(toNum($event))"
                [disabled]="!autoPauseEnabled()"
                class="w-full rounded-md border border-slate-300 px-2 py-1 text-xs tabular-nums disabled:opacity-50"
              />
            </label>
          </div>
        </section>

        <section class="mt-auto">
          @if (!running()) {
            <button
              type="button"
              (click)="start()"
              [disabled]="mode() === 'replay' && !selectedId()"
              class="w-full py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-50"
            >Start simulation</button>
          } @else {
            <button
              type="button"
              (click)="stop()"
              class="w-full py-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold"
            >Stop simulation</button>
          }
          <p class="text-[11px] text-slate-500 text-center mt-2">
            Then tap <em>Start recording</em> in the device preview.
          </p>
        </section>
      </aside>

      <main class="flex-1 flex items-center justify-center p-8 overflow-y-auto">
        <div
          class="phone-frame w-[390px] h-[844px] max-w-full shadow-2xl rounded-[40px] overflow-hidden border border-slate-300 relative"
          style="transform: translateZ(0)"
        >
          <div class="absolute inset-0 overflow-y-auto">
            <router-outlet />
          </div>
        </div>
      </main>
    </div>
  `,
})
export class SimulatorShell implements OnInit, OnDestroy {
  private readonly sim = inject(SensorSim);
  private readonly replay = inject(ReplayDriver);
  private readonly recording = inject(RecordingService);
  private readonly config = inject(ConfigService);

  protected readonly mode = signal<SimMode>('synthetic');
  protected readonly speeds = [1, 2, 4, 8] as const;

  // Synthetic sliders mirror the SensorSim signals.
  protected readonly simSpeed = this.sim.simSpeedKmh;
  protected readonly simHr = this.sim.simHr;
  protected readonly simCadence = this.sim.simCadenceRpm;

  // Replay state
  protected readonly activities = this.replay.activities;
  protected readonly selectedActivity = this.replay.selected;
  protected readonly selectedId = computed(() => this.replay.selected()?.id ?? '');
  protected readonly replaySpeed = this.replay.speedMultiplier;
  protected readonly replayProgress = this.replay.progress;
  protected readonly replayPlayheadSec = this.replay.playheadSec;
  protected readonly replayPaused = this.replay.paused;
  protected readonly replayError = this.replay.lastError;

  protected readonly running = computed(
    () => this.sim.running() || this.replay.running(),
  );

  // Display config — live-bound to ConfigService so toggles flow straight
  // into the embedded FeatureRecord.
  protected readonly allTiles = ALL_RECORD_TILES;
  protected readonly layout = this.config.recordLayout;
  protected readonly autoPauseEnabled = this.config.autoPauseEnabled;
  protected readonly autoPauseThresholdKmh = this.config.autoPauseThresholdKmh;
  protected readonly autoPauseDelaySec = this.config.autoPauseDelaySec;

  protected isTileEnabled(id: RecordTile): boolean {
    return this.config.recordTiles().includes(id);
  }

  protected async toggleTile(id: RecordTile, on: boolean): Promise<void> {
    const current = this.config.recordTiles();
    if (on) {
      if (current.includes(id)) return;
      const order = ALL_RECORD_TILES.map((t) => t.id);
      const next = order.filter((t) => current.includes(t) || t === id);
      await this.config.setRecordTiles(next);
    } else {
      const next = current.filter((t) => t !== id);
      if (next.length === 0) return;
      await this.config.setRecordTiles(next);
    }
  }

  protected async setRecordLayout(l: RecordLayout): Promise<void> {
    await this.config.setRecordLayout(l);
  }

  protected async setAutoPauseEnabled(on: boolean): Promise<void> {
    await this.config.setAutoPauseEnabled(on);
  }
  protected async setAutoPauseThresholdKmh(v: number): Promise<void> {
    await this.config.setAutoPauseThresholdKmh(v);
  }
  protected async setAutoPauseDelaySec(v: number): Promise<void> {
    await this.config.setAutoPauseDelaySec(v);
  }

  protected toBool(ev: Event): boolean {
    return (ev.target as HTMLInputElement).checked;
  }

  async ngOnInit(): Promise<void> {
    await this.reloadActivities();
  }

  ngOnDestroy(): void {
    this.sim.stop();
    this.replay.stop();
  }

  protected setMode(m: SimMode): void {
    if (this.running()) {
      this.sim.stop();
      this.replay.stop();
    }
    this.mode.set(m);
  }

  protected setSimSpeed(v: number): void {
    this.sim.simSpeedKmh.set(v);
  }
  protected setSimHr(v: number): void {
    this.sim.simHr.set(v);
  }
  protected setSimCadence(v: number): void {
    this.sim.simCadenceRpm.set(v);
  }
  protected setReplaySpeed(s: 1 | 2 | 4 | 8): void {
    this.replay.speedMultiplier.set(s);
  }

  protected async reloadActivities(): Promise<void> {
    await this.replay.loadList();
  }

  protected async selectActivity(id: string): Promise<void> {
    await this.replay.selectActivity(id);
  }

  protected scrubReplay(fraction: number): void {
    this.replay.scrubTo(fraction);
  }

  protected togglePlayPause(): void {
    if (this.replayPaused()) this.replay.resume();
    else this.replay.pause();
  }

  protected start(): void {
    if (this.mode() === 'synthetic') {
      this.sim.start();
    } else {
      this.replay.start();
    }
  }

  protected stop(): void {
    this.sim.stop();
    this.replay.stop();
    // Also stop any in-flight recording so the UI resets.
    if (this.recording.session()) {
      this.recording.stop();
    }
    // Reset the user-set API base URL note — the simulator doesn't use it.
    void this.config;
  }

  protected toNum(ev: Event): number {
    return Number((ev.target as HTMLInputElement).value);
  }
  protected toString(ev: Event): string {
    return (ev.target as HTMLSelectElement).value;
  }
  protected formatDur(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}`;
    return `${m} min`;
  }

  /** "1:23:45" or "23:45" for timeline labels. */
  protected formatDurLong(seconds: number): string {
    const s = Math.max(0, Math.floor(seconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
    if (h > 0) return `${h}:${pad(m)}:${pad(sec)}`;
    return `${m}:${pad(sec)}`;
  }
}
