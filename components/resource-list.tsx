"use client";

import { ResourceCard } from "./resource-card";

interface ResourceItem {
  id: string;
  name: string;
  subtitle?: string;
}

interface ResourceListProps {
  title: string;
  items: ResourceItem[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
}

export function ResourceList({
  title,
  items,
  selectedIds,
  onSelectionChange,
}: ResourceListProps) {
  const allSelected = items.length > 0 && items.every((item) => selectedIds.includes(item.id));

  const handleToggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter((s) => s !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  };

  const handleToggleAll = () => {
    if (allSelected) {
      onSelectionChange([]);
    } else {
      onSelectionChange(items.map((item) => item.id));
    }
  };

  if (items.length === 0) return null;

  return (
    <div className="border border-nb-gray-800 rounded-lg p-4 bg-nb-gray-920">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-nb-gray-100">
          {title} ({items.length})
        </h3>
        <button
          onClick={handleToggleAll}
          className="text-xs text-netbird-400 hover:text-netbird-300"
        >
          {allSelected ? "Deselect all" : "Select all"}
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <ResourceCard
            key={item.id}
            id={item.id}
            name={item.name}
            subtitle={item.subtitle}
            selected={selectedIds.includes(item.id)}
            onToggle={handleToggle}
          />
        ))}
      </div>
    </div>
  );
}
