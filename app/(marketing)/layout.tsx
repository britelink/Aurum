import type { Metadata } from "next";

import "../globals.css";
import Header from "./components/Header";
import Footer from "./components/Footer";

export const metadata: Metadata = {
  title: "Aurum Capital | Next Generation Betting Platform",
  description:
    "Aurum Capital is an online betting platform that allows users to predict price index movements with high returns on investment.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Header />
        <main className="min-h-screen pt-16">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
