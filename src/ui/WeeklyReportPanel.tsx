import { DetailPanel } from './DetailPanel';
import { formatFiscalPercent } from './fiscalDraft';
import type { RegionId } from '../game/models';
import type { ReportMetric, WeeklyReport } from './weeklyReport';

type Props = {
  active: boolean;
  report: WeeklyReport;
  availableWeeks: readonly number[];
  onSelectWeek: (week: number) => void;
  onOpenRegion: (id: RegionId) => void;
  onClose: () => void;
};

function Metric({ row }: { row: ReportMetric }) {
  return <div>
    <dt>{row.label}{row.note && <span className="report-note">{row.note}</span>}</dt>
    <dd>
      {row.value}
      {row.change && <span className={`report-change ${row.change.tone}`}>
        <span className="sr-only">Change from prior week </span>{row.change.text}
      </span>}
    </dd>
  </div>;
}

function Events({ entries, label, onOpenRegion, priority = false }: {
  entries: WeeklyReport['alerts']; label: string; onOpenRegion: Props['onOpenRegion']; priority?: boolean;
}) {
  if (!entries.length) return null;
  return <ul className="report-events" aria-label={label}>
    {entries.map(({ title, message, severity, region }, i) => <li className={`report-event ${severity ?? 'info'}`} key={i}>
      <strong>{title}</strong>
      <p role={priority && severity === 'defeat' ? 'alert' : undefined}>{message}</p>
      {region && <button type="button" className="report-region" onClick={() => onOpenRegion(region.id)}>View {region.name}</button>}
    </li>)}
  </ul>;
}

function FiscalRates({ entries, changes = false }: { entries: WeeklyReport['applied']; changes?: boolean }) {
  if (!entries.length) return null;
  return <dl className="report-rows">
    {entries.map(({ label, rate, before }) => <div key={label}>
      <dt>{label}</dt>
      <dd>{changes && before !== undefined && <>
        <span className="report-old-rate">{formatFiscalPercent(before)}</span>
        <span aria-hidden="true"> → </span><span className="sr-only"> to </span>
      </>}<span className="report-current-rate">{formatFiscalPercent(rate)}</span></dd>
    </div>)}
  </dl>;
}

export function WeeklyReportPanel({ active, report, availableWeeks, onSelectWeek, onOpenRegion, onClose }: Props) {
  const { applied, alerts, indicators, shortages, economyEvents, militaryEvents, politicalEvents, fiscal } = report;
  const activeRates = [...fiscal.taxes, ...fiscal.spending];
  return <DetailPanel id="weekly-report" title={`Week ${report.week} report`} open={active} onClose={onClose} dismissOnEscape>
    <div className="report-layout">
      <div className="report-overview">
        <dl className="report-summary">{report.overview.map(row => <Metric key={row.label} row={row} />)}</dl>
        <p className="report-note">Illustrative units · Changes from prior week</p>
        {report.territoryChanged && <p className="report-note">Territorial control changed this week. GDP covers the regions you control.</p>}
        {report.defeated && !alerts.some(event => event.severity === 'defeat') &&
          <p role="alert">Your regime has been overthrown. The game is over.</p>}
        <Events entries={alerts} label="Priority alerts" onOpenRegion={onOpenRegion} priority />
        {!alerts.length && !shortages.length && !militaryEvents.length && !report.defeated &&
          <p className="report-note">No major alerts this week.</p>}
      </div>

      <div>
        {applied.length > 0 && <section className="report-applied" aria-labelledby="report-applied-title">
          <h3 id="report-applied-title">Fiscal changes applied</h3>
          <FiscalRates entries={applied} changes />
          <p className="report-note">The new rates stay in effect until changed.</p>
        </section>}
        {(indicators.length > 0 || shortages.length > 0 || economyEvents.length > 0) && <details className="report-detail">
          <summary>Economy{shortages.length > 0 && <span className="report-detail-note">
            Shortages in {shortages.length} {shortages.length === 1 ? 'sector' : 'sectors'}
          </span>}</summary>
          {indicators.length > 0 && <dl className="report-rows">{indicators.map(row => <Metric key={row.label} row={row} />)}</dl>}
          {shortages.length > 0 && <section aria-label="Significant shortages">
            <h3>Significant shortages</h3>
            <dl className="report-rows">{shortages.map(row => <Metric key={row.label} row={row} />)}</dl>
          </section>}
          {economyEvents.length > 0 && <section>
            <h3>Economic events</h3>
            <Events entries={economyEvents} label="Economic events" onOpenRegion={onOpenRegion} />
          </section>}
        </details>}
        {politicalEvents.length > 0 && <details className="report-detail">
          <summary>Politics and diplomacy</summary>
          <Events entries={politicalEvents} label="Political and diplomatic events" onOpenRegion={onOpenRegion} />
        </details>}
        {militaryEvents.length > 0 && <details className="report-detail">
          <summary>Military and territorial control<span className="report-detail-note">{militaryEvents[0].title}</span></summary>
          <Events entries={militaryEvents} label="Military and territorial events" onOpenRegion={onOpenRegion} />
        </details>}
        {activeRates.length > 0 && <details className="report-detail">
          <summary>Fiscal policy after this week</summary>
          {activeRates.every(rate => rate.before === undefined) &&
            <p className="report-note">Earlier rates are unavailable for this report.</p>}
          {fiscal.taxes.length > 0 && <section>
            <h3>Tax rates</h3>
            <FiscalRates entries={fiscal.taxes} />
          </section>}
          {fiscal.spending.length > 0 && <section>
            <h3>Spending shares of GDP</h3>
            <FiscalRates entries={fiscal.spending} />
          </section>}
        </details>}
        {availableWeeks.length > 1 && <details className="report-detail">
          <summary>Recent reports</summary>
          <div className="report-history">
            {availableWeeks.map((week, i) => <button key={week} type="button" disabled={week === report.week}
              onClick={() => onSelectWeek(week)}>Week {week}{i === 0 ? ' · latest' : ''}</button>)}
          </div>
        </details>}
      </div>
    </div>
  </DetailPanel>;
}
