 "use client";

type Props = {
  className?: string;
};

export default function FilterClearButton({ className }: Props) {
  const handleClick = () => {
    const { pathname } = window.location;
    // Remove all query parameters and reload the page
    window.location.href = pathname;
  };

  return (
    <button
      type="button"
      className={className}
      onClick={handleClick}
    >
      Clear filters
    </button>
  );
}

