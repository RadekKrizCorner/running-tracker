type EmptyStateProps = {
  title: string;
  detail: string;
  action?: React.ReactNode;
  visual?: React.ReactNode;
};

export function EmptyState({ title, detail, action, visual }: EmptyStateProps) {
  return (
    <div className="empty-state">
      {visual ? <div className="empty-state-visual">{visual}</div> : null}
      <div>
        <h2>{title}</h2>
        <p>{detail}</p>
      </div>
      {action ? <div className="empty-state-action">{action}</div> : null}
    </div>
  );
}
