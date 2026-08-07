const statusConfig: Record<string, { bg: string; color: string; label: string }> = {
  Pending: {
    bg: "var(--accent-orange-bg)",
    color: "var(--accent-orange)",
    label: "Pending",
  },
  Confirmed: {
    bg: "var(--accent-green-bg)",
    color: "var(--accent-green)",
    label: "Confirmed",
  },
  Disbursed: {
    bg: "var(--accent-green-bg)",
    color: "var(--accent-green)",
    label: "Disbursed",
  },
  Rejected: {
    bg: "var(--accent-red-bg)",
    color: "var(--accent-red)",
    label: "Rejected",
  },
  Flagged: {
    bg: "var(--accent-red-bg)",
    color: "var(--accent-red)",
    label: "Flagged",
  },
  Review: {
    bg: "var(--accent-blue-bg)",
    color: "var(--accent-blue)",
    label: "Review",
  },
};

interface StatusBadgeProps {
  status: string;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status] ?? {
    bg: "#F1F5F9",
    color: "#64748B",
    label: status,
  };

  return (
    <span
      className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap"
      style={{
        backgroundColor: config.bg,
        color: config.color,
      }}
    >
      {config.label}
    </span>
  );
}
