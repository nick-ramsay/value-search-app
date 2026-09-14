"use client";

type MultiSelectDropdownProps = {
  id: string;
  label: string;
  placeholderAll: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  disabled?: boolean;
  emptyMessage?: string;
};

/**
 * Checkbox-list dropdown for picking zero or more values from a fixed
 * option set. Styled to match the single-select .glass-select it replaces.
 * Opening/closing and outside-click dismissal are handled entirely by
 * Bootstrap's dropdown JS (data-bs-toggle) — auto-close is set to
 * "outside" so checking multiple options in a row doesn't close the menu
 * after each click, the way a real multi-select needs to behave.
 */
export default function MultiSelectDropdown({
  id,
  label,
  placeholderAll,
  options,
  selected,
  onToggle,
  disabled = false,
  emptyMessage = "No options available",
}: MultiSelectDropdownProps) {
  const triggerLabel =
    selected.length === 0
      ? placeholderAll
      : selected.length === 1
        ? selected[0]
        : `${selected.length} selected`;

  return (
    <div className="dropdown multi-select-dropdown">
      <button
        type="button"
        id={id}
        className="form-select glass-select dropdown-toggle multi-select-dropdown__trigger"
        data-bs-toggle="dropdown"
        data-bs-auto-close="outside"
        aria-expanded="false"
        aria-label={label}
        disabled={disabled}
      >
        <span className="multi-select-dropdown__trigger-label">{triggerLabel}</span>
      </button>
      <div
        className="dropdown-menu multi-select-dropdown__menu"
        aria-labelledby={id}
      >
        {options.length === 0 ? (
          <p className="multi-select-dropdown__empty px-3 py-2 mb-0 text-muted small">
            {emptyMessage}
          </p>
        ) : (
          options.map((option) => {
            const optionId = `${id}-option-${option}`;
            const checked = selected.includes(option);
            return (
              <label
                key={option}
                htmlFor={optionId}
                className="multi-select-dropdown__option dropdown-item"
              >
                <input
                  type="checkbox"
                  id={optionId}
                  className="multi-select-dropdown__checkbox"
                  checked={checked}
                  onChange={() => onToggle(option)}
                  disabled={disabled}
                />
                <span className="multi-select-dropdown__option-text">{option}</span>
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}
