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
    "Clear local information, useful next steps, and community improvement for Geneva, Batavia, and St. Charles, Illinois.";

  return {
    title,
    description,
    applicationName: title,
    openGraph: {
      title,
      description,
      type: "website",
      images: [{ url: `${origin}/og-simple.png`, width: 1731, height: 908, alt: `${title} — Better local information. Better local lives.` }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${origin}/og-simple.png`],
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
