import type { EconomySnapshot } from '../game/economyBridge';
import { economyNews, readEconomyDashboard, type DashboardRow } from './economyDashboard';

/**
 * Read-only economy panel (INT-01): every figure comes from the economic engine's session.
 * The seven tax and spending controls arrive in a follow-up task (INT-02).
 */
type Props = {
  week: number;
  economy: EconomySnapshot | null;
  status: 'loading' | 'ready' | 'failed';
  error: string | null;
  onRetry: () => void;
};

function Rows({ rows, empty }: { rows: readonly DashboardRow[]; empty: string }) {
  return <dl className="card economy-rows economy-values">
    {rows.length === 0 ? <div><dt>{empty}</dt><dd>—</dd></div> : rows.map(({ label, value, note }) => <div key={label}>
      <dt>{label}{note && <span className="economy-row-note">{note}</span>}</dt><dd>{value}</dd>
    </div>)}
  </dl>;
}

export function EconomyPanel({ week, economy, status, error, onRetry }: Props) {
  if (!economy) {
    return <section className="compact-section" aria-labelledby="economy-title">
      <h2 id="economy-title" className="sr-only">Country economy</h2>
      <div className="overview economy-dashboard">
        {status === 'failed'
          ? <div className="card economy-week" role="alert">
            <p>The economy could not be loaded{error ? `: ${error}` : '.'} Check your connection and try again.</p>
            <button type="button" onClick={onRetry}>Try again</button>
          </div>
          : <p className="card economy-week" role="status">Preparing the economy…</p>}
      </div>
    </section>;
  }

  const { budget, indicators, fiscal, sectors, shortages, latestWeek } = readEconomyDashboard(economy.player, economy.previous, week);
  const news = economyNews(economy.notices);
  return (
    <section className="compact-section" aria-labelledby="economy-title">
      <h2 id="economy-title" className="sr-only">Country economy</h2>
      <div className="overview economy-dashboard" tabIndex={0} role="region" aria-label="Economic dashboard">
        <section className="group economy-budget" aria-labelledby="economy-budget">
          <h3 id="economy-budget">Government budget</h3>
          <dl className="metrics economy-metrics">
            {budget.map(({ label, value }) => <div className="tile" key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
          </dl>
          <p className="economy-note">Illustrative units · Week {economy.session.week} · Economic engine</p>
        </section>

        <section className="group economy-indicators" aria-labelledby="economy-indicators">
          <h3 id="economy-indicators">Economic indicators</h3>
          <Rows rows={indicators} empty="No indicators" />
        </section>

        <section className="group economy-latest-week" aria-labelledby="economy-latest-week">
          <h3 id="economy-latest-week">Latest week</h3>
          <div className="card economy-week">
            {latestWeek ? <>
              <p>Week {latestWeek.week} settled</p>
              <dl className="economy-treasury-change">
                <div><dt>Opening treasury</dt><dd>{latestWeek.openingTreasury}</dd></div>
                <div><dt>Closing treasury</dt><dd>{latestWeek.closingTreasury}</dd></div>
              </dl>
            </> : <p>No week has settled yet. Use <b>Next week</b> to resolve the first one.</p>}
            {news.length > 0 && <ul className="economy-news" aria-label="Economic events">
              {news.map((notice, index) => <li key={index} className={`economy-news-${notice.severity}`}>
                <b>{notice.title}</b> {notice.message}
              </li>)}
            </ul>}
          </div>
        </section>

        <section className="group economy-activity" aria-labelledby="economy-activity">
          <h3 id="economy-activity">Economic activity</h3>
          <Rows rows={sectors} empty="Key economic sectors" />
          <h4 className="economy-subheading">Significant shortages</h4>
          <Rows rows={shortages} empty="No significant shortages" />
        </section>

        <section className="group economy-policy" aria-labelledby="economy-policy">
          <h3 id="economy-policy">Fiscal policy</h3>
          <Rows rows={fiscal} empty="No policy" />
          <p className="economy-note">Current rates, read only. Tax and spending controls arrive in a later update.</p>
        </section>
      </div>
    </section>
  );
}
