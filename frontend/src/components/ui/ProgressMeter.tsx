type ProgressMeterProps = {
  label: string;
  value: number;
  detail?: string;
  showHeading?: boolean;
  showSummary?: boolean;
};

export function ProgressMeter({ label, value, detail, showHeading = true, showSummary = true }: ProgressMeterProps) {
  const safeValue = Math.max(0, Math.min(value, 160));
  return (
    <div className="progress-meter" aria-label={`${Math.round(value)}% ${label}`}>
      {showHeading ? (
        <div className="progress-meter-heading">
          <strong>{label}</strong>
          <span>{Math.round(value)}%</span>
        </div>
      ) : null}
      <div className="progress-meter-track" aria-hidden="true">
        <span style={{ width: `${Math.min(safeValue, 100)}%` }} />
      </div>
      {showSummary ? <span className="progress-meter-summary">{Math.round(value)}% {label.toLowerCase()}</span> : null}
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}
