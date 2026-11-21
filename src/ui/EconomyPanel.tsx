import { useState } from 'react';
import type { EconomySnapshot } from '../game/economyBridge';
import { economyNews, readEconomyDashboard, type DashboardRow } from './economyDashboard';
import { DetailPanel } from './DetailPanel';
import { FiscalPolicyEditor } from './FiscalPolicyEditor';
import type { FiscalField, FiscalReview } from './fiscalDraft';

type Props = {
  week: number;
  economy: EconomySnapshot;
  fiscal: FiscalReview;
  onFiscalChange: (field: FiscalField, value: string) => void;
};

function Rows({ rows, empty }: { rows: readonly DashboardRow[]; empty: string }) {
  return <dl className="card economy-rows economy-values">
    {rows.length === 0 ? <div><dt>{empty}</dt><dd>—</dd></div> : rows.map(({ label, value, note }) => <div key={label}>
      <dt>{label}{note && <span className="economy-row-note">{note}</span>}</dt><dd>{value}</dd>
    </div>)}
  </dl>;
}

export function EconomyPanel({ week, economy, fiscal, onFiscalChange }: Props) {
  const [editingFiscal, setEditingFiscal] = useState(false);
  const { budget, indicators, sectors, shortages, latestWeek } = readEconomyDashboard(economy.player, economy.previous, week);
  const news = economyNews(economy.notices);
  const showFiscal = editingFiscal;
  return (
    <section className="compact-section" aria-labelledby="economy-title">
      <h2 id="economy-title" className="sr-only">Country economy</h2>
      <div className="overview economy-dashboard" tabIndex={0} role="region" aria-label="Economic dashboard" hidden={showFiscal}>
        <div className="card economy-policy">
          <button type="button" className="row" aria-controls="fiscal-policy-details" aria-expanded={showFiscal}
            onClick={() => setEditingFiscal(true)}>
            <span className="row-text">
              <b>Fiscal policy</b>
              <span>{fiscal.commands.length ? `${fiscal.commands.length} pending · ${fiscal.error ? 'Review inputs' : 'Next week'}` :
                economy.defeated ? 'View final rates' : 'Edit taxes and spending'}</span>
            </span>
            <span className="chevron" aria-hidden="true">›</span>
          </button>
        </div>
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

      </div>
      <DetailPanel id="fiscal-policy-details" title="Fiscal policy" open={showFiscal} onClose={() => setEditingFiscal(false)}>
        <FiscalPolicyEditor fiscal={fiscal} disabled={economy.defeated} onChange={onFiscalChange} />
      </DetailPanel>
    </section>
  );
}
