import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Web Reader",
  description: "Read web articles in a clean, distraction-free format",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
