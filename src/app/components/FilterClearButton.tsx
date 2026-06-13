import Link from "next/link";

type Props = {
  className?: string;
};

export default function FilterClearButton({ className }: Props) {
  return (
    <Link href="/" className={className}>
      Clear filters
    </Link>
  );
}
