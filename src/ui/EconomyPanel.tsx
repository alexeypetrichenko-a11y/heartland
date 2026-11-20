import { ECONOMIC_POLICIES, isEconomicPolicy } from '../game/economy';
import type { Country, EconomicPolicy } from '../game/models';
import { readEconomyDashboard, type EconomyWeekStart } from './economyDashboard';

type Props = {
  country: Country;
  week: number;
  weekStart: EconomyWeekStart | null;
  nextPolicy: EconomicPolicy;
  onChangePolicy: (policy: EconomicPolicy) => void;
};

const unavailableIndicators = ['GDP', 'Economic growth', 'Inflation', 'Unemployment', 'Public debt', 'Political stability'];
const unavailableActivity = ['Key economic sectors', 'Significant shortages', 'Economic events'];
const unavailableControls = [
  ['income-tax', 'Income tax'],
  ['consumption-tax', 'Consumption tax'],
  ['corporate-tax', 'Corporate profit tax'],
  ['spending-priorities', 'Public spending priorities'],
] as const;
const formatAmount = new Intl.NumberFormat('en');

function UnavailableRows({ labels }: { labels: readonly string[] }) {
  return <dl className="card economy-rows">
    {labels.map(label => <div key={label}><dt>{label}</dt><dd>Unavailable</dd></div>)}
  </dl>;
}

export function EconomyPanel({ country, week, weekStart, nextPolicy, onChangePolicy }: Props) {
  const { treasury, weeklyBudget, lastWeek } = readEconomyDashboard(country, week, weekStart);
  const policyPending = nextPolicy !== country.economicPolicy;
  const metrics = [
    { label: 'Treasury', amount: treasury },
    { label: 'Weekly income', amount: weeklyBudget.income },
    { label: 'Weekly expenses', amount: weeklyBudget.expenses },
    { label: 'Weekly balance', amount: weeklyBudget.balance, signed: true },
  ];

  return (
    <section className="compact-section" aria-labelledby="economy-title">
      <h2 id="economy-title" className="sr-only">Country economy</h2>
      <div className="overview economy-dashboard" tabIndex={0} role="region" aria-label="Economic dashboard">
        <section className="group economy-budget" aria-labelledby="economy-budget">
          <h3 id="economy-budget">Government budget</h3>
          <dl className="metrics economy-metrics">
            {metrics.map(({ label, amount, signed }) => <div className="tile" key={label}>
              <dt>{label}</dt>
              <dd>{signed && amount > 0 ? '+' : ''}{formatAmount.format(amount)}</dd>
            </div>)}
          </dl>
          <p className="economy-note">Fictional scenario units. Weekly budget at the current tax policy.</p>
        </section>

        <section className="group economy-policy" aria-labelledby="economy-policy">
          <h3 id="economy-policy">Fiscal policy</h3>
          <div className="card economy-policy-card">
            <dl className="economy-current-policy">
              <div><dt>Current tax policy</dt><dd>{ECONOMIC_POLICIES[country.economicPolicy].label}</dd></div>
            </dl>
            <label htmlFor="economic-policy">Tax policy for next week</label>
            <select id="economic-policy" value={nextPolicy} aria-describedby="policy-help" onChange={event => {
              if (isEconomicPolicy(event.target.value)) onChangePolicy(event.target.value);
            }}>
              {Object.entries(ECONOMIC_POLICIES).map(([policy, { label }]) => <option key={policy} value={policy}>{label}</option>)}
            </select>
            <p id="policy-help">Use <b>Next week</b> to apply your choice and settle the budget.</p>
            <p className="economy-draft" role="status">{policyPending ? `Draft · ${ECONOMIC_POLICIES[nextPolicy].label}` : ''}</p>
          </div>
          <details className="card economy-locked-controls">
            <summary>Tax rates and spending priorities</summary>
            <p id="economy-controls-status">Unavailable until the economic engine is connected.</p>
            <fieldset disabled aria-describedby="economy-controls-status">
              <legend className="sr-only">Additional fiscal controls</legend>
              {unavailableControls.map(([id, label]) => <div key={id}>
                <label htmlFor={id}>{label}</label>
                <select id={id} defaultValue="unavailable"><option value="unavailable">Unavailable</option></select>
              </div>)}
            </fieldset>
          </details>
        </section>

        <section className="group economy-latest-week" aria-labelledby="economy-latest-week">
          <h3 id="economy-latest-week">Latest week</h3>
          <div className="card economy-week">
            {lastWeek ? <>
              <p>Week {lastWeek.week} settled</p>
              <dl className="economy-treasury-change">
                <div><dt>Opening treasury</dt><dd>{formatAmount.format(lastWeek.openingTreasury)}</dd></div>
                <div><dt>Closing treasury</dt><dd>{formatAmount.format(lastWeek.closingTreasury)}</dd></div>
              </dl>
            </> : <p>No week has settled yet.</p>}
          </div>
        </section>

        <section className="group economy-indicators" aria-labelledby="economy-indicators">
          <h3 id="economy-indicators">Economic indicators</h3>
          <UnavailableRows labels={unavailableIndicators} />
        </section>

        <section className="group economy-activity" aria-labelledby="economy-activity">
          <h3 id="economy-activity">Economic activity</h3>
          <UnavailableRows labels={unavailableActivity} />
        </section>
      </div>
    </section>
  );
}
