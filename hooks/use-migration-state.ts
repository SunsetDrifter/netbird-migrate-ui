"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import React from "react";
import type {
  ConnectionConfig,
  SourceResources,
  ResourceSelection,
  Conflict,
  ConflictResolution,
  MigrationEvent,
  MigrationResult,
  ResourceType,
} from "@/lib/types";

export interface ExportedConfig {
  version: 1;
  sourceUrl: string;
  destinationUrl: string;
  selection: ResourceSelection;
  conflicts: { resourceType: ResourceType; sourceId: string; sourceName: string; destinationId: string; resolution: ConflictResolution }[];
  resources?: SourceResources;
}

interface MigrationState {
  source: ConnectionConfig | null;
  destination: ConnectionConfig | null;
  sourceConnected: boolean;
  destConnected: boolean;
  resources: SourceResources | null;
  selection: ResourceSelection;
  conflicts: Conflict[];
  events: MigrationEvent[];
  result: MigrationResult | null;
  migrating: boolean;
  importedSourceUrl: string;
  importedDestUrl: string;
}

interface MigrationActions {
  setSource: (config: ConnectionConfig) => void;
  setDestination: (config: ConnectionConfig) => void;
  setSourceConnected: (connected: boolean) => void;
  setDestConnected: (connected: boolean) => void;
  setResources: (resources: SourceResources) => void;
  setSelection: (selection: ResourceSelection) => void;
  setConflicts: (conflicts: Conflict[]) => void;
  addEvent: (event: MigrationEvent) => void;
  setResult: (result: MigrationResult) => void;
  setMigrating: (migrating: boolean) => void;
  reset: () => void;
  exportConfig: () => ExportedConfig | null;
  importConfig: (data: ExportedConfig) => void;
}

const defaultSelection: ResourceSelection = {
  groups: [],
  posture_checks: [],
  policies: [],
  routes: [],
  dns: [],
  dns_zones: [],
  dns_settings: [],
  networks: [],
  setup_keys: [],
  account_settings: [],
};

const MigrationContext = createContext<
  (MigrationState & MigrationActions) | null
>(null);

export function MigrationStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<MigrationState>({
    source: null,
    destination: null,
    sourceConnected: false,
    destConnected: false,
    resources: null,
    selection: defaultSelection,
    conflicts: [],
    events: [],
    result: null,
    migrating: false,
    importedSourceUrl: "",
    importedDestUrl: "",
  });

  const setSource = useCallback(
    (config: ConnectionConfig) =>
      setState((s) => ({ ...s, source: config })),
    []
  );
  const setDestination = useCallback(
    (config: ConnectionConfig) =>
      setState((s) => ({ ...s, destination: config })),
    []
  );
  const setSourceConnected = useCallback(
    (connected: boolean) =>
      setState((s) => ({ ...s, sourceConnected: connected })),
    []
  );
  const setDestConnected = useCallback(
    (connected: boolean) =>
      setState((s) => ({ ...s, destConnected: connected })),
    []
  );
  const setResources = useCallback(
    (resources: SourceResources) =>
      setState((s) => ({ ...s, resources })),
    []
  );
  const setSelection = useCallback(
    (selection: ResourceSelection) =>
      setState((s) => ({ ...s, selection })),
    []
  );
  const setConflicts = useCallback(
    (conflicts: Conflict[]) =>
      setState((s) => ({ ...s, conflicts })),
    []
  );
  const addEvent = useCallback(
    (event: MigrationEvent) =>
      setState((s) => ({ ...s, events: [...s.events, event] })),
    []
  );
  const setResult = useCallback(
    (result: MigrationResult) =>
      setState((s) => ({ ...s, result })),
    []
  );
  const setMigrating = useCallback(
    (migrating: boolean) =>
      setState((s) => ({ ...s, migrating })),
    []
  );
  const reset = useCallback(
    () =>
      setState({
        source: null,
        destination: null,
        sourceConnected: false,
        destConnected: false,
        resources: null,
        selection: defaultSelection,
        conflicts: [],
        events: [],
        result: null,
        migrating: false,
        importedSourceUrl: "",
        importedDestUrl: "",
      }),
    []
  );

  const exportConfig = useCallback((): ExportedConfig | null => {
    if (!state.source && !state.destination) return null;
    return {
      version: 1,
      sourceUrl: state.source?.url || state.importedSourceUrl || "",
      destinationUrl: state.destination?.url || state.importedDestUrl || "",
      selection: state.selection,
      conflicts: state.conflicts.map((c) => ({
        resourceType: c.resourceType,
        sourceId: c.sourceId,
        sourceName: c.sourceName,
        destinationId: c.destinationId,
        resolution: c.resolution,
      })),
    };
  }, [state.source, state.destination, state.importedSourceUrl, state.importedDestUrl, state.selection, state.conflicts]);

  const importConfig = useCallback((data: ExportedConfig) => {
    setState((s) => ({
      ...s,
      importedSourceUrl: data.sourceUrl,
      importedDestUrl: data.destinationUrl,
      selection: data.selection,
      conflicts: data.conflicts.map((c) => ({
        resourceType: c.resourceType,
        sourceId: c.sourceId,
        sourceName: c.sourceName,
        destinationId: c.destinationId,
        resolution: c.resolution,
      })),
      ...(data.resources ? { resources: data.resources } : {}),
    }));
  }, []);

  const value = {
    ...state,
    setSource,
    setDestination,
    setSourceConnected,
    setDestConnected,
    setResources,
    setSelection,
    setConflicts,
    addEvent,
    setResult,
    setMigrating,
    reset,
    exportConfig,
    importConfig,
  };

  return React.createElement(
    MigrationContext.Provider,
    { value },
    children
  );
}

export function useMigrationState() {
  const ctx = useContext(MigrationContext);
  if (!ctx) {
    throw new Error(
      "useMigrationState must be used within MigrationStateProvider"
    );
  }
  return ctx;
}
