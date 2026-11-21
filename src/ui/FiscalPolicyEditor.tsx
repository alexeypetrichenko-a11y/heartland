import { formatFiscalPercent, type FiscalField, type FiscalReview } from './fiscalDraft';

type Props = {
  fiscal: FiscalReview;
  disabled: boolean;
  onChange: (field: FiscalField, value: string) => void;
};

export function FiscalPolicyEditor({ fiscal, disabled, onChange }: Props) {
  return <>
    <p>{disabled ? 'Final fiscal policy.' : <>Apply proposals with <b>Next week</b>. Leave unchanged rates blank.</>}</p>
    {fiscal.error && !Object.keys(fiscal.fieldErrors).length && <p className="fiscal-field-error" role="alert">{fiscal.error}</p>}
    <div className="fiscal-groups">
      {fiscal.groups.map(group => {
        const rangeId = `fiscal-${group.id}-range`;
        return <fieldset className="fiscal-group" key={group.id} disabled={disabled}>
          <legend>{group.label}</legend>
          <p className="fiscal-range" id={rangeId}>0%–{formatFiscalPercent(group.maximum)}{group.id === 'spending' && ' of GDP'}</p>
          <div className="card">
            <div className="fiscal-row fiscal-columns" aria-hidden="true"><span /><span>Current</span><span>Proposed</span></div>
            {group.fields.map(field => {
              const id = `fiscal-${field.key}`;
              const error = fiscal.fieldErrors[field.key];
              return <div className="fiscal-row" key={field.key}>
                <label htmlFor={id}>{field.label}<span className="sr-only"> proposed percentage</span></label>
                <span className="fiscal-current" id={`${id}-current`}><span className="sr-only">Current </span>{formatFiscalPercent(field.current)}</span>
                <span className="fiscal-input">
                  <input id={id} type="text" inputMode="decimal" autoComplete="off" spellCheck={false}
                    value={field.proposed} placeholder="—" data-pending={field.pending || undefined}
                    aria-invalid={Boolean(error) || undefined}
                    aria-describedby={`${id}-current ${rangeId}${error ? ` ${id}-error` : ''}`}
                    onChange={event => onChange(field.key, event.currentTarget.value)} />
                  <span aria-hidden="true">%</span>
                </span>
                {error && <p className="fiscal-field-error" id={`${id}-error`} role="alert">{error}</p>}
              </div>;
            })}
          </div>
        </fieldset>;
      })}
    </div>
  </>;
}
