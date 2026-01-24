"use client";

import { useRouter } from "next/navigation";
import { StepIndicator } from "@/components/step-indicator";
import { ConnectionForm } from "@/components/connection-form";
import { useMigrationState } from "@/hooks/use-migration-state";

export default function ConnectPage() {
  const router = useRouter();
  const {
    sourceConnected,
    destConnected,
    setSource,
    setDestination,
    setSourceConnected,
    setDestConnected,
    setResources,
    setSelection,
  } = useMigrationState();

  const handleSourceConnect = async (token: string, url: string) => {
    const res = await fetch("/api/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, url }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Connection failed");
    }

    setSource({ token, url });
    setSourceConnected(true);
  };

  const handleSourceDisconnect = () => {
    setSourceConnected(false);
    setSource({ token: "", url: "" });
    setResources(null as never);
    setSelection({
      groups: [],
      posture_checks: [],
      policies: [],
      routes: [],
      dns: [],
      networks: [],
      setup_keys: [],
      dns_zones: [],
    });
  };

  const handleDestDisconnect = () => {
    setDestConnected(false);
    setDestination({ token: "", url: "" });
  };

  const handleDestConnect = async (token: string, url: string) => {
    const res = await fetch("/api/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, url }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Connection failed");
    }

    setDestination({ token, url });
    setDestConnected(true);
  };

  const canProceed = sourceConnected && destConnected;

  return (
    <div>
      <StepIndicator currentStep={1} />

      <div className="grid gap-6 md:grid-cols-2">
        <ConnectionForm
          label="Source Instance"
          defaultUrl="https://api.netbird.io/api"
          connected={sourceConnected}
          onConnect={handleSourceConnect}
          onDisconnect={handleSourceDisconnect}
        />
        <ConnectionForm
          label="Destination Instance"
          defaultUrl="https://api.netbird.io/api"
          connected={destConnected}
          onConnect={handleDestConnect}
          onDisconnect={handleDestDisconnect}
        />
      </div>

      {canProceed && (
        <div className="mt-6 flex justify-end">
          <button
            onClick={() => router.push("/migrate")}
            className="px-6 py-2 bg-netbird-400 text-white text-sm font-medium rounded-md hover:bg-netbird-500"
          >
            Next: Select Resources
          </button>
        </div>
      )}
    </div>
  );
}
