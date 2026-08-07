import { type LucideIcon } from "lucide-react";

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  change?: string;
  changeType?: "positive" | "negative";
  borderColor: string;
  iconBg: string;
  iconColor: string;
}

export default function StatCard({
  icon: Icon,
  label,
  value,
  change,
  changeType = "positive",
  borderColor,
  iconBg,
  iconColor,
}: StatCardProps) {
  return (
    <div
      className="rounded-xl p-5 transition-all duration-300 hover:scale-[1.02] hover:shadow-md animate-fade-in"
      style={{
        backgroundColor: "var(--card-bg)",
        boxShadow: "var(--card-shadow)",
        borderLeft: `4px solid ${borderColor}`,
      }}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p
            className="text-[10px] font-semibold tracking-widest uppercase mb-2"
            style={{ color: "var(--text-muted)" }}
          >
            {label}
          </p>
          <p
            className="text-2xl font-bold tracking-tight"
            style={{ color: "var(--text-primary)" }}
          >
            {value}
          </p>
        </div>
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: iconBg }}
        >
          <Icon size={20} style={{ color: iconColor }} />
        </div>
      </div>

      {change && (
        <div className="mt-3 flex items-center gap-1.5">
          <span
            className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
            style={{
              backgroundColor:
                changeType === "positive"
                  ? "var(--accent-green-bg)"
                  : "var(--accent-red-bg)",
              color:
                changeType === "positive"
                  ? "var(--accent-green)"
                  : "var(--accent-red)",
            }}
          >
            {changeType === "positive" ? "↗" : "↘"} {change}
          </span>
        </div>
      )}
    </div>
  );
}
