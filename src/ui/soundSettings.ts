import type { CustomSounds, UploadReport } from '../audio/customSounds';
import { SAMPLE_KINDS, type SampleKind } from '../audio/localSamples';
import { MAX_FILE_BYTES, MAX_FILES_PER_SLOT, MAX_PACKAGE_BYTES, UPLOAD_EXTENSIONS } from '../audio/soundFiles';
import { t } from '../i18n';

const MB = 1024 * 1024;
const ACCEPT_FILES = UPLOAD_EXTENSIONS.map((e) => `.${e}`).join(',') + ',audio/mpeg,audio/ogg,audio/wav';

/**
 * "Own sounds" dialog of the start screen: per sound slot choose files, listen
 * to the current sound and go back to the default – or load a whole .zip sound
 * package. Lives outside the overlay, so re-rendering the start screen does
 * not close it. Esc does not close it (Esc only leaves fullscreen).
 */
export class SoundSettings {
  private readonly el = document.createElement('div');
  private busy = false;

  constructor(
    private readonly sounds: CustomSounds,
    private readonly preview: (slot: SampleKind) => void,
  ) {
    this.el.className = 'sound-settings hidden';
    this.el.addEventListener('click', (e) => void this.onClick(e));
    this.el.addEventListener('change', (e) => void this.onChange(e));
    document.body.appendChild(this.el);
  }

  get isOpen(): boolean {
    return !this.el.classList.contains('hidden');
  }

  open(): void {
    this.render();
    this.el.classList.remove('hidden');
  }

  close(): void {
    this.el.classList.add('hidden');
    this.el.replaceChildren();
  }

  private render(message = ''): void {
    const rows = SAMPLE_KINDS.map((slot) => {
      const status = this.sounds.status(slot);
      const source =
        status.source === 'synth' ? t('sounds.source.synth') : t(`sounds.source.${status.source}`, { count: status.count });
      return `<div class="sound-slot" data-slot="${slot}" data-source="${status.source}">
          <div class="sound-name">${t(`sounds.slot.${slot}`)}</div>
          <div class="sound-source">${source}</div>
          <div class="sound-actions">
            <button type="button" data-do="choose">${t('sounds.choose')}</button>
            <button type="button" data-do="play">${t('sounds.play')}</button>
            <button type="button" data-do="reset"${status.source === 'upload' ? '' : ' disabled'}>${t('sounds.reset')}</button>
            <input type="file" accept="${ACCEPT_FILES}" multiple hidden data-input="files">
          </div>
        </div>`;
    }).join('');
    this.el.innerHTML = `
      <div class="sound-panel" role="dialog" aria-modal="true" aria-label="${t('sounds.title')}">
        <h2>${t('sounds.title')}</h2>
        <p class="sound-intro">${t('sounds.intro')}</p>
        <div class="sound-slots">${rows}</div>
        <div class="sound-package">
          <button type="button" data-do="package">${t('sounds.package')}</button>
          <input type="file" accept=".zip,application/zip" hidden data-input="package">
          <button type="button" data-do="resetAll">${t('sounds.resetAll')}</button>
        </div>
        <p class="sound-rules">${t('sounds.rules', { mb: MAX_FILE_BYTES / MB })}</p>
        <div class="sound-message" role="status">${message}</div>
        <button type="button" class="sound-close" data-do="close">${t('sounds.close')}</button>
      </div>`;
  }

  private async onClick(e: Event): Promise<void> {
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-do]');
    if (!button || this.busy) return;
    button.blur();
    const slot = button.closest<HTMLElement>('[data-slot]')?.dataset.slot as SampleKind | undefined;
    switch (button.dataset.do) {
      case 'choose':
        button.parentElement?.querySelector<HTMLInputElement>('input[data-input="files"]')?.click();
        break;
      case 'package':
        this.el.querySelector<HTMLInputElement>('input[data-input="package"]')?.click();
        break;
      case 'play':
        if (slot) this.preview(slot);
        break;
      case 'reset':
        if (slot) await this.run(async () => (await this.sounds.reset(slot), t('sounds.resetDone')));
        break;
      case 'resetAll':
        await this.run(async () => (await this.sounds.resetAll(), t('sounds.resetDone')));
        break;
      case 'close':
        this.close();
        break;
    }
  }

  private async onChange(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    if (files.length === 0) return;
    if (input.dataset.input === 'package') {
      await this.run(async () => reportText(await this.sounds.addPackage(files[0])));
    } else {
      const slot = input.closest<HTMLElement>('[data-slot]')?.dataset.slot as SampleKind | undefined;
      if (slot) await this.run(async () => reportText(await this.sounds.addFiles(slot, files)));
    }
  }

  /** Runs a change, then shows the new state and its message. */
  private async run(action: () => Promise<string>): Promise<void> {
    this.busy = true;
    this.el.querySelector('.sound-message')!.textContent = t('sounds.busy');
    let message: string;
    try {
      message = await action();
    } catch (err) {
      console.error(err);
      message = `<span class="err">${escapeHtml(t('sounds.storageError', { message: err instanceof Error ? err.message : String(err) }))}</span>`;
    }
    this.busy = false;
    if (this.isOpen) this.render(message);
  }
}

/** Human-readable summary of an upload: what was taken, what not and why. */
export function reportText(report: UploadReport): string {
  const mb = MAX_FILE_BYTES / MB;
  if (report.packageProblem === 'notZip') return `<span class="err">${t('sounds.notZip')}</span>`;
  if (report.packageProblem === 'size') return `<span class="err">${t('sounds.packageSize', { mb: MAX_PACKAGE_BYTES / MB })}</span>`;
  const lines: string[] = [];
  if (report.accepted.length > 0) lines.push(t('sounds.saved', { count: report.accepted.length }));
  for (const r of report.rejected) {
    lines.push(`<span class="err">${escapeHtml(t(`sounds.problem.${r.problem}`, { name: r.name, mb, max: MAX_FILES_PER_SLOT }))}</span>`);
  }
  if (report.ignored.length > 0) lines.push(t('sounds.ignored', { count: report.ignored.length }));
  if (lines.length === 0) lines.push(`<span class="err">${t('sounds.nothing')}</span>`);
  return lines.join('<br>');
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
