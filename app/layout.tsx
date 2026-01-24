import type { Metadata } from "next";
import { MigrationStateProvider } from "@/hooks/use-migration-state";
import "./globals.css";

export const metadata: Metadata = {
  title: "NetBird Migration",
  description: "Migrate NetBird configurations between instances",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-nb-gray-950 min-h-screen">
        <MigrationStateProvider>
          <main className="max-w-4xl mx-auto px-4 py-8">
            <h1 className="text-2xl font-bold text-nb-gray-100 text-center mb-2">
              NetBird Migration
            </h1>
            <p className="text-sm text-nb-gray-300 text-center mb-8">
              Export and import configurations between NetBird instances
            </p>
            {children}
          </main>
        </MigrationStateProvider>
      </body>
    </html>
  );
}
