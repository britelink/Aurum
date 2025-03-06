import Link from "next/link";
import {
  Facebook,
  Twitter,
  Instagram,
  Linkedin,
  Mail,
  Phone,
  MapPin,
} from "lucide-react";

export default function Footer() {
  return (
    <footer className="bg-blue-900 dark:bg-slate-900 text-blue-100 dark:text-blue-200">
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <Link href="/" className="flex items-center mb-4">
              <span className="font-serif font-bold text-2xl">
                <span className="text-white dark:text-blue-100">Aurum</span>
                <span className="text-amber-400 dark:text-amber-300">
                  Capital
                </span>
              </span>
            </Link>
            <p className="text-blue-200 dark:text-blue-300 mb-4">
              Next generation betting platform with high returns and fast-paced
              sessions.
            </p>
            <div className="flex space-x-3">
              <a
                href="#"
                className="text-blue-300 hover:text-amber-400 dark:text-blue-300 dark:hover:text-amber-300 transition-colors"
              >
                <Facebook size={20} />
              </a>
              <a
                href="#"
                className="text-blue-300 hover:text-amber-400 dark:text-blue-300 dark:hover:text-amber-300 transition-colors"
              >
                <Twitter size={20} />
              </a>
              <a
                href="#"
                className="text-blue-300 hover:text-amber-400 dark:text-blue-300 dark:hover:text-amber-300 transition-colors"
              >
                <Instagram size={20} />
              </a>
              <a
                href="#"
                className="text-blue-300 hover:text-amber-400 dark:text-blue-300 dark:hover:text-amber-300 transition-colors"
              >
                <Linkedin size={20} />
              </a>
            </div>
          </div>

          <div>
            <h3 className="font-medium text-white text-lg mb-4">Quick Links</h3>
            <ul className="space-y-2">
              <li>
                <Link
                  href="/"
                  className="text-blue-300 hover:text-amber-400 dark:text-blue-300 dark:hover:text-amber-300 transition-colors"
                >
                  Home
                </Link>
              </li>
              <li>
                <Link
                  href="/about"
                  className="text-blue-300 hover:text-amber-400 dark:text-blue-300 dark:hover:text-amber-300 transition-colors"
                >
                  About Us
                </Link>
              </li>
              <li>
                <a
                  href="#"
                  className="text-blue-300 hover:text-amber-400 dark:text-blue-300 dark:hover:text-amber-300 transition-colors"
                >
                  How It Works
                </a>
              </li>
              <li>
                <a
                  href="#"
                  className="text-blue-300 hover:text-amber-400 dark:text-blue-300 dark:hover:text-amber-300 transition-colors"
                >
                  FAQ
                </a>
              </li>
              <li>
                <a
                  href="#"
                  className="text-blue-300 hover:text-amber-400 dark:text-blue-300 dark:hover:text-amber-300 transition-colors"
                >
                  Contact
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-medium text-white text-lg mb-4">Legal</h3>
            <ul className="space-y-2">
              <li>
                <a
                  href="#"
                  className="text-blue-300 hover:text-amber-400 dark:text-blue-300 dark:hover:text-amber-300 transition-colors"
                >
                  Terms of Service
                </a>
              </li>
              <li>
                <a
                  href="#"
                  className="text-blue-300 hover:text-amber-400 dark:text-blue-300 dark:hover:text-amber-300 transition-colors"
                >
                  Privacy Policy
                </a>
              </li>
              <li>
                <a
                  href="#"
                  className="text-blue-300 hover:text-amber-400 dark:text-blue-300 dark:hover:text-amber-300 transition-colors"
                >
                  Responsible Gaming
                </a>
              </li>
              <li>
                <a
                  href="#"
                  className="text-blue-300 hover:text-amber-400 dark:text-blue-300 dark:hover:text-amber-300 transition-colors"
                >
                  Anti-Money Laundering
                </a>
              </li>
              <li>
                <a
                  href="#"
                  className="text-blue-300 hover:text-amber-400 dark:text-blue-300 dark:hover:text-amber-300 transition-colors"
                >
                  Licensing Information
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-medium text-white text-lg mb-4">Contact Us</h3>
            <ul className="space-y-3">
              <li className="flex items-start">
                <MapPin
                  size={18}
                  className="text-amber-400 dark:text-amber-300 mt-0.5 mr-2 flex-shrink-0"
                />
                <span className="text-blue-300 dark:text-blue-300">
                  123 Finance Street, Trading District, NY 10001
                </span>
              </li>
              <li className="flex items-center">
                <Phone
                  size={18}
                  className="text-amber-400 dark:text-amber-300 mr-2 flex-shrink-0"
                />
                <span className="text-blue-300 dark:text-blue-300">
                  +1 (555) 123-4567
                </span>
              </li>
              <li className="flex items-center">
                <Mail
                  size={18}
                  className="text-amber-400 dark:text-amber-300 mr-2 flex-shrink-0"
                />
                <span className="text-blue-300 dark:text-blue-300">
                  support@aurumcapital.com
                </span>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-blue-800 dark:border-slate-800 text-center text-blue-400 dark:text-blue-400 text-sm">
          <p>
            © {new Date().getFullYear()} Aurum Capital. All rights reserved.
          </p>
          <p className="mt-2">
            Trading involves risk. Past performance is not indicative of future
            results.
          </p>
        </div>
      </div>
    </footer>
  );
}
