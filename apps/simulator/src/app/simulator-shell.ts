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
import { FeatureRecord } from 'feature-record';
import { ReplayDriver, SensorSim } from 'dev-sim';
import { RecordingService } from 'recording';
import { ConfigService } from 'api-client';

type SimMode = 'synthetic' | 'replay';

/**
 * Desktop-sized wrapper around the FeatureRecord component. Left sidebar
 * carries the dev controls; the right pane embeds the actual mobile record
 * screen at phone-width so you see exactly what the rider sees.
 */
@Component({
  selector: 'app-simulator-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, FormsModule, FeatureRecord],
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

            @if (replayProgress() > 0) {
              <div>
                <div class="flex items-baseline justify-between text-xs text-slate-500 mb-1">
                  <span>Playhead</span>
                  <span class="font-mono">{{ replayProgress() * 100 | number: '1.0-0' }}%</span>
                </div>
                <div class="h-1.5 bg-slate-200 rounded">
                  <div
                    class="h-full rounded bg-emerald-500"
                    [style.width.%]="replayProgress() * 100"
                  ></div>
                </div>
              </div>
            }

            @if (replayError(); as e) {
              <p class="text-xs text-rose-500">{{ e }}</p>
            }
          </section>
        }

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
        <div class="w-[390px] max-w-full shadow-2xl rounded-[40px] overflow-hidden border border-slate-300">
          <lib-feature-record />
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
  protected readonly selectedId = computed(() => this.replay.selected()?.id ?? '');
  protected readonly replaySpeed = this.replay.speedMultiplier;
  protected readonly replayProgress = this.replay.progress;
  protected readonly replayError = this.replay.lastError;

  protected readonly running = computed(
    () => this.sim.running() || this.replay.running(),
  );

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
}
