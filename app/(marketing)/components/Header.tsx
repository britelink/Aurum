"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Header() {
  const pathname = usePathname();

  return (
    <header className="bg-white/90 dark:bg-navy-900/90 backdrop-blur-md py-4 px-6 fixed w-full z-10">
      <div className="max-w-7xl mx-auto flex justify-between items-center">
        <Link href="/" className="flex items-center">
          <span className="font-serif font-bold text-2xl">
            <span className="text-navy-900 dark:text-white">Aurum</span>
            <span className="text-gold-500">Capital</span>
          </span>
        </Link>

        <nav className="hidden md:flex space-x-10">
          <Link
            href="/"
            className={`transition-colors duration-200 ${
              pathname === "/"
                ? "text-gold-500 font-medium"
                : "text-gray-600 dark:text-gray-300 hover:text-gold-500 dark:hover:text-gold-500"
            }`}
          >
            Home
          </Link>
          <Link
            href="/about"
            className={`transition-colors duration-200 ${
              pathname === "/about"
                ? "text-gold-500 font-medium"
                : "text-gray-600 dark:text-gray-300 hover:text-gold-500 dark:hover:text-gold-500"
            }`}
          >
            About
          </Link>
          <a
            href="#"
            className="text-gray-600 dark:text-gray-300 hover:text-gold-500 dark:hover:text-gold-500 transition-colors duration-200"
          >
            How It Works
          </a>
          <a
            href="#"
            className="text-gray-600 dark:text-gray-300 hover:text-gold-500 dark:hover:text-gold-500 transition-colors duration-200"
          >
            Contact
          </a>
        </nav>

        <div className="flex items-center space-x-4">
          <button className="hidden md:block px-5 py-2 bg-navy-800 hover:bg-navy-700 text-white rounded-md transition-colors duration-200">
            Log in
          </button>
          <button className="px-5 py-2 gold-gradient text-navy-900 font-medium rounded-md hover:opacity-90 transition-opacity duration-200">
            Start Trading
          </button>
        </div>
      </div>
    </header>
  );
}
