"use client";

interface ResourceCardProps {
  id: string;
  name: string;
  subtitle?: string;
  selected: boolean;
  onToggle: (id: string) => void;
}

export function ResourceCard({
  id,
  name,
  subtitle,
  selected,
  onToggle,
}: ResourceCardProps) {
  return (
    <label className="flex items-start gap-3 p-3 rounded-md border border-nb-gray-800 hover:border-netbird-400/50 cursor-pointer transition-colors">
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggle(id)}
        className="mt-0.5 h-4 w-4 rounded border-nb-gray-700 text-netbird-400 accent-netbird-400 focus:ring-netbird-400"
      />
      <div className="min-w-0">
        <p className="text-sm font-medium text-nb-gray-100 truncate">{name}</p>
        {subtitle && (
          <p className="text-xs text-nb-gray-300 truncate">{subtitle}</p>
        )}
      </div>
    </label>
  );
}
