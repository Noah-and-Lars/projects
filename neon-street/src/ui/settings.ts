// Settings panel: preset buttons plus individual sliders.

import { PRESETS, PRESET_ORDER, type PresetName, type RenderSettings, SETTING_RANGES } from '../renderer/presets';

export class SettingsMenu {
  private root: HTMLElement;
  private presetButtons = new Map<PresetName, HTMLButtonElement>();
  private sliderInputs = new Map<keyof RenderSettings, { input: HTMLInputElement; val: HTMLElement }>();
  presetName: string;
  isOpen = false;

  constructor(
    root: HTMLElement,
    public settings: RenderSettings,
    initialPreset: PresetName,
    private onChange: (s: RenderSettings, structural: boolean) => void,
  ) {
    this.root = root;
    this.presetName = initialPreset;
    const presetsEl = root.querySelector<HTMLElement>('#presets')!;
    for (const name of PRESET_ORDER) {
      const btn = document.createElement('button');
      btn.textContent = name;
      if (name === 'Melt') btn.classList.add('melt');
      btn.addEventListener('click', () => this.applyPreset(name));
      presetsEl.appendChild(btn);
      this.presetButtons.set(name, btn);
    }
    const slidersEl = root.querySelector<HTMLElement>('#sliders')!;
    for (const def of SETTING_RANGES) {
      const label = document.createElement('label');
      const val = document.createElement('span');
      val.className = 'val';
      label.textContent = def.label + ' ';
      label.appendChild(val);
      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(def.min);
      input.max = String(def.max);
      input.step = String(def.step);
      input.addEventListener('input', () => {
        const v = parseFloat(input.value);
        (this.settings as unknown as Record<string, number>)[def.key] = v;
        this.presetName = 'Custom';
        this.refresh();
        this.onChange(this.settings, def.key === 'renderScale');
      });
      slidersEl.appendChild(label);
      slidersEl.appendChild(input);
      this.sliderInputs.set(def.key, { input, val });
    }
    this.refresh();
  }

  applyPreset(name: PresetName): void {
    Object.assign(this.settings, PRESETS[name]);
    this.presetName = name;
    this.refresh();
    this.onChange(this.settings, true);
  }

  private refresh(): void {
    for (const [name, btn] of this.presetButtons) btn.classList.toggle('active', name === this.presetName);
    for (const [key, { input, val }] of this.sliderInputs) {
      const v = this.settings[key];
      input.value = String(v);
      val.textContent = Number.isInteger(v) ? String(v) : v.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
    }
    this.root.querySelector('#meltWarn')?.classList.toggle('show', this.presetName === 'Melt');
  }

  open(): void {
    this.isOpen = true;
    this.root.classList.add('open');
  }

  close(): void {
    this.isOpen = false;
    this.root.classList.remove('open');
  }
}
