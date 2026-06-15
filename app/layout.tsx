import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cubit — The labor cost intelligence layer for construction",
  description:
    "Cubit tells contractors what a job will actually cost in labor before they bid — powered by cross-contractor payroll data only a system-of-record could have.",
  metadataBase: new URL("https://cubit.example.com"),
  openGraph: {
    title: "Cubit — The labor cost intelligence layer for construction",
    description:
      "Validate your labor estimate against AI-reasoned, cross-contractor benchmarks before you bid.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ink-950 font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
