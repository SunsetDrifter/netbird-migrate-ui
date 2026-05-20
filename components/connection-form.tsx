"use client";

import { useState } from "react";

interface ConnectionFormProps {
  label: string;
  defaultUrl: string;
  connected: boolean;
  onConnect: (token: string, url: string) => Promise<void>;
  onDisconnect?: () => void;
  testId?: string;
}

export function ConnectionForm({
  label,
  defaultUrl,
  connected,
  onConnect,
  onDisconnect,
  testId,
}: ConnectionFormProps) {
  const [token, setToken] = useState("");
  const [url, setUrl] = useState(defaultUrl);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await onConnect(token, url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      data-testid={testId}
      className="border border-nb-gray-800 rounded-lg p-6 bg-nb-gray-920"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-nb-gray-100">{label}</h3>
        {connected && (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-sm text-green-400 bg-green-900/20 px-2 py-1 rounded">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Connected
            </span>
            {onDisconnect && (
              <button
                type="button"
                onClick={() => {
                  setToken("");
                  setUrl(defaultUrl);
                  setError("");
                  onDisconnect();
                }}
                className="text-sm text-nb-gray-300 hover:text-red-400 px-2 py-1 rounded hover:bg-red-900/20"
              >
                Disconnect
              </button>
            )}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-nb-gray-200 mb-1">
            API Token
          </label>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Enter API token"
            className="w-full px-3 py-2 border border-nb-gray-700 rounded-md text-sm bg-nb-gray-900 text-nb-gray-100 placeholder-nb-gray-500 focus:outline-none focus:ring-2 focus:ring-netbird-400 focus:border-netbird-400"
            disabled={connected}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-nb-gray-200 mb-1">
            Management URL
          </label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://api.netbird.io/api"
            className="w-full px-3 py-2 border border-nb-gray-700 rounded-md text-sm bg-nb-gray-900 text-nb-gray-100 placeholder-nb-gray-500 focus:outline-none focus:ring-2 focus:ring-netbird-400 focus:border-netbird-400"
            disabled={connected}
            required
          />
        </div>

        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}

        {!connected && (
          <button
            type="submit"
            disabled={loading || !token || !url}
            className="w-full px-4 py-2 bg-netbird-400 text-white text-sm font-medium rounded-md hover:bg-netbird-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Connecting..." : "Connect"}
          </button>
        )}
      </form>

    </div>
  );
}
