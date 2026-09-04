import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./interface-theme.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://pi-research-agent.qiudao-pika.chatgpt.site"),
  title: "Pi Research — Your AI Research Agent",
  description:
    "A quiet, context-aware research agent that tracks important work and builds personalized learning paths.",
  icons: {
    icon: "/pi-research-mark.png",
    shortcut: "/pi-research-mark.png",
    apple: "/pi-research-mark.png",
  },
  openGraph: {
    title: "Pi Research — Your AI Research Agent",
    description:
      "Private research spaces, focused reading paths, and an AI research partner that remembers the right context.",
    images: [{ url: "/pi-research-social.png", width: 1536, height: 913 }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/pi-research-social.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
