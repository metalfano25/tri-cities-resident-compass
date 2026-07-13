import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const forwardedHost = requestHeaders.get("x-forwarded-host");
  const requestHost = forwardedHost?.split(",")[0]?.trim() || requestHeaders.get("host");
  const safeHost = requestHost?.match(/^[a-z0-9.-]+(?::\d+)?$/i)?.[0] || "localhost:3000";
  const forwardedProto = requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProto === "https" || forwardedProto === "http"
    ? forwardedProto
    : safeHost.startsWith("localhost")
      ? "http"
      : "https";
  const origin = `${protocol}://${safeHost}`;
  const title = "Tri-Cities Resident Compass";
  const description =
    "A source-first resident dashboard for Geneva, Batavia, and St. Charles, Illinois.";

  return {
    title,
    description,
    applicationName: title,
    openGraph: {
      title,
      description,
      type: "website",
      images: [{ url: `${origin}/og-v2.png`, width: 1731, height: 908, alt: `${title} — Your cities. In signal.` }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${origin}/og-v2.png`],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
