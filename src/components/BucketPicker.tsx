type BucketPickerItem = {
  id: string;
  name: string;
  amount: number;
  detail: string;
};

type BucketPickerProps = {
  items: BucketPickerItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  formatAmount: (amount: number) => string;
};

export default function BucketPicker({ items, selectedId, onSelect, formatAmount }: BucketPickerProps) {
  const selected = items.find((item) => item.id === selectedId) ?? items[0] ?? null;

  if (!selected) {
    return <div className="bucket-picker-empty">No slices yet.</div>;
  }

  return (
    <details className="bucket-picker">
      <summary className="bucket-picker-summary">
        <span>
          <small>Selected bucket</small>
          <strong>{selected.name}</strong>
        </span>
        <span className="bucket-picker-summary-meta">
          <strong>{formatAmount(selected.amount)}</strong>
          <small>{selected.detail}</small>
        </span>
      </summary>

      <div className="bucket-picker-menu" role="listbox" aria-label="Choose bucket">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`bucket-picker-option ${item.id === selected.id ? "selected" : ""}`}
            onClick={(event) => {
              onSelect(item.id);
              event.currentTarget.closest("details")?.removeAttribute("open");
            }}
          >
            <span>
              <strong>{item.name}</strong>
              <small>{item.detail}</small>
            </span>
            <strong>{formatAmount(item.amount)}</strong>
          </button>
        ))}
      </div>
    </details>
  );
}
