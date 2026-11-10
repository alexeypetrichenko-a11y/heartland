import { useState } from 'react';
import type { Country, EconomicPolicy } from '../game/models';
import { calculateWeeklyBudget, ECONOMIC_POLICIES, isEconomicPolicy } from '../game/economy';
import { DetailPanel } from './DetailPanel';

type Props = { country: Country; nextPolicy: EconomicPolicy; onChangePolicy: (policy: EconomicPolicy) => void };

export function EconomyPanel({ country, nextPolicy, onChangePolicy }: Props) {
  const [showPolicy, setShowPolicy] = useState(false);
  const budget = calculateWeeklyBudget(country.economy, country.economicPolicy);
  const policyPending = nextPolicy !== country.economicPolicy;
  return (
    <section className="compact-section" aria-labelledby="economy-title">
      <h2 id="economy-title" className="sr-only">Economy</h2>
      <div className="overview economy-overview" hidden={showPolicy}>
        <dl className="metrics">
          <div className="tile"><dt>Treasury</dt><dd>{country.economy.treasury}</dd></div>
          <div className="tile"><dt>Weekly income</dt><dd>{budget.income}</dd></div>
          <div className="tile"><dt>Weekly expenses</dt><dd>{budget.expenses}</dd></div>
          <div className="tile"><dt>Weekly balance</dt><dd>{budget.balance > 0 ? '+' : ''}{budget.balance}</dd></div>
        </dl>
        <div className="group">
          <h3>Fiscal policy</h3>
          <div className="card">
            <button className="row" type="button" onClick={() => setShowPolicy(true)} aria-controls="tax-details" aria-expanded={showPolicy}>
              <span className="row-text"><b>Tax policy</b><span>{ECONOMIC_POLICIES[country.economicPolicy].label}{policyPending && ` · Draft: ${ECONOMIC_POLICIES[nextPolicy].label}`}</span></span>
              <span className="chevron" aria-hidden="true">›</span>
            </button>
          </div>
        </div>
        <p className="caption">Illustrative units · Provisional weekly budget</p>
      </div>
      <DetailPanel id="tax-details" title="Tax policy" open={showPolicy} onClose={() => setShowPolicy(false)}>
        <dl className="data-list">
          <div><dt>Active policy</dt><dd>{ECONOMIC_POLICIES[country.economicPolicy].label}</dd></div>
          <div><dt>Weekly policy effect on income</dt><dd>{budget.income - country.economy.weeklyIncome}</dd></div>
        </dl>
        <form onSubmit={event => event.preventDefault()}>
          <label htmlFor="economic-policy">Tax policy for next week</label>
          <select id="economic-policy" value={nextPolicy} aria-describedby="policy-help" onChange={event => {
            if (isEconomicPolicy(event.target.value)) onChangePolicy(event.target.value);
          }}>
            <option value="standard">Standard taxation</option>
            <option value="tax-relief">Tax relief</option>
          </select>
          {policyPending && <p role="status">Pending policy: {ECONOMIC_POLICIES[nextPolicy].label}. Press Next week to apply.</p>}
          <details>
            <summary>Policy rules and figures</summary>
            <p id="policy-help">Standard taxation uses base income ({country.economy.weeklyIncome}). Tax relief reduces income by up to {ECONOMIC_POLICIES['tax-relief'].incomeReduction} each week, with a floor of zero. Expenses stay fixed. Your choice takes effect with Next week and stays active until changed.</p>
          </details>
        </form>
      </DetailPanel>
    </section>
  );
}
