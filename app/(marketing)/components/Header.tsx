"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ChevronDown, Menu } from "lucide-react";
import { useState } from "react";

export default function Header() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="bg-blue-800/95 z-50 dark:bg-slate-900/95 border-b border-blue-700/50 dark:border-blue-800/50 backdrop-blur-md py-4 px-6 fixed w-full z-10 shadow-md">
      <div className="max-w-7xl mx-auto flex justify-between items-center">
        <Link href="/" className="flex items-center">
          <span className="font-serif font-bold text-2xl">
            <span className="text-white dark:text-blue-100">Aurum</span>
            <span className="text-amber-400 dark:text-amber-300">Capital</span>
          </span>
        </Link>

        <nav className="hidden md:flex space-x-10">
          <Link
            href="/"
            className={`transition-colors duration-200 ${
              pathname === "/"
                ? "text-amber-400 dark:text-amber-300 font-medium"
                : "text-blue-100 hover:text-amber-400 dark:text-blue-200 dark:hover:text-amber-300"
            }`}
          >
            Home
          </Link>
          <Link
            href="/about"
            className={`transition-colors duration-200 ${
              pathname === "/about"
                ? "text-amber-400 dark:text-amber-300 font-medium"
                : "text-blue-100 hover:text-amber-400 dark:text-blue-200 dark:hover:text-amber-300"
            }`}
          >
            About
          </Link>
          <a
            href="#"
            className="text-blue-100 hover:text-amber-400 dark:text-blue-200 dark:hover:text-amber-300 transition-colors duration-200"
          >
            How It Works
          </a>
          <a
            href="#"
            className="text-blue-100 hover:text-amber-400 dark:text-blue-200 dark:hover:text-amber-300 transition-colors duration-200"
          >
            Contact
          </a>
        </nav>

        <div className="flex items-center space-x-4">
          <ThemeToggle />
          <button className="hidden md:flex items-center gap-2 px-3 py-1.5 text-sm text-blue-900 dark:text-blue-950 font-medium bg-blue-100 dark:bg-blue-200 rounded hover:bg-white dark:hover:bg-white transition-colors">
            Log in
          </button>
          <button className="hidden md:flex items-center gap-2 px-4 py-1.5 text-sm bg-gradient-to-r from-amber-400 to-amber-500 text-blue-900 font-medium rounded hover:from-amber-500 hover:to-amber-600 transition-all">
            Start Trading
          </button>
          <button
            className="md:hidden text-blue-100 dark:text-blue-200"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <Menu size={24} />
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden mt-4 py-4 px-4 bg-blue-900 dark:bg-slate-800 rounded-lg">
          <nav className="flex flex-col space-y-3">
            <Link
              href="/"
              className={`transition-colors duration-200 ${
                pathname === "/"
                  ? "text-amber-400 dark:text-amber-300 font-medium"
                  : "text-blue-100 hover:text-amber-400 dark:text-blue-200 dark:hover:text-amber-300"
              }`}
            >
              Home
            </Link>
            <Link
              href="/about"
              className={`transition-colors duration-200 ${
                pathname === "/about"
                  ? "text-amber-400 dark:text-amber-300 font-medium"
                  : "text-blue-100 hover:text-amber-400 dark:text-blue-200 dark:hover:text-amber-300"
              }`}
            >
              About
            </Link>
            <a
              href="#"
              className="text-blue-100 hover:text-amber-400 dark:text-blue-200 dark:hover:text-amber-300"
            >
              How It Works
            </a>
            <a
              href="#"
              className="text-blue-100 hover:text-amber-400 dark:text-blue-200 dark:hover:text-amber-300"
            >
              Contact
            </a>
            <div className="flex space-x-3 pt-3 border-t border-blue-800 dark:border-slate-700">
              <button className="flex-1 px-3 py-1.5 text-sm text-blue-900 dark:text-blue-950 font-medium bg-blue-100 dark:bg-blue-200 rounded">
                Log in
              </button>
              <button className="flex-1 px-3 py-1.5 text-sm bg-gradient-to-r from-amber-400 to-amber-500 text-blue-900 font-medium rounded">
                Sign Up
              </button>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
