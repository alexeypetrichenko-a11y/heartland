import { browserBenchmarkStrategicLand } from './bench_mil00.ts';

const results = document.querySelector('output')!;
const buttons = [...document.querySelectorAll<HTMLButtonElement>('button[data-mode]')];
const metrics = {
  startMs: 'Initialization', medianWeekMs: 'Median turn', p95WeekMs: 'P95 turn',
  slowestWeekMs: 'Slowest turn', saveRestoreMs: 'Save and restore',
} as const;
function row(label: string, value: string) {
  const element = document.createElement('div');
  element.textContent = `${label} · ${value}`;
  results.append(element);
}
for (const button of buttons) {
  button.onclick = async () => {
    for (const control of buttons) control.disabled = true;
    results.dataset.state = 'running';
    results.textContent = 'Running 156 weeks… Keep Safari in front and the screen on.';
    await new Promise(resolve => setTimeout(resolve, 50));
    try {
      const [result] = await browserBenchmarkStrategicLand(button.dataset.mode === 'heavy');
      results.textContent = '';
      row(result.mode === 'calm' ? 'Calm' : 'Heavy orders', result.passed ? 'All thresholds met' : 'Threshold exceeded');
      for (const key of Object.keys(metrics) as (keyof typeof metrics)[]) {
        const value = result.milliseconds[key], limit = result.limits[key];
        row(metrics[key], `${value.toFixed(1)} ms / ${limit} ms limit${value > limit ? ' · exceeded' : ''}`);
      }
      row('Engagement weeks', String(result.engagementWeeks));
      row('Maximum concurrent fronts', String(result.maxFronts));
      row('Save checkpoint', `${result.bytes.toLocaleString()} bytes`);
      for (const [week, counts] of Object.entries(result.exhaustion)) {
        row(`Week ${week}`, `${counts.depleted} depleted, ${counts.surrendered} surrendered`);
      }
      results.dataset.state = 'complete';
    } catch (error) {
      results.textContent = error instanceof Error ? error.message : String(error);
      results.dataset.state = 'error';
    } finally {
      for (const control of buttons) control.disabled = false;
    }
  };
}
