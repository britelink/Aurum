"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Menu, Wallet, Trophy, LogOut } from "lucide-react";
import { useState } from "react";
import { useQuery, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

function SignOutButton({
  onSignOut,
  className,
}: {
  onSignOut: () => void;
  className?: string;
}) {
  const { signOut } = useAuthActions();
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    onSignOut();
    router.push("/");
  };

  return (
    <button onClick={handleSignOut} className={className}>
      <LogOut className="h-4 w-4" />
      Sign Out
    </button>
  );
}

export default function Header() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const { isAuthenticated } = useConvexAuth();
  const user = useQuery(api.aurum.getCurrentUser);

  return (
    <header className="bg-blue-800/95 z-50 dark:bg-slate-900/95 border-b border-blue-700/50 dark:border-blue-800/50 backdrop-blur-md py-4 px-6 fixed w-full z-10 shadow-md">
      <div className="max-w-7xl mx-auto flex justify-between items-center">
        <Link href="/" className="flex items-center">
          <span className="font-serif font-bold text-2xl">
            <span className="text-white dark:text-blue-100">Penny</span>
            <span className="text-amber-400 dark:text-amber-300">Game</span>
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
            Contact
          </a>
        </nav>

        <div className="flex items-center space-x-4">
          <ThemeToggle />

          {isAuthenticated && user ? (
            <>
              <span className="hidden md:block text-sm text-blue-100 dark:text-blue-200">
                {getGreeting()}, {user.name || "Trader"}
              </span>
              <button
                onClick={() => setUserMenuOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5"
              >
                <Avatar className="h-8 w-8">
                  <AvatarImage src={user.image || ""} />
                  <AvatarFallback className="bg-blue-200 text-blue-900">
                    {(user.name?.charAt(0) || "T").toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </button>
            </>
          ) : (
            <>
              <Link
                href="/signin"
                className="hidden md:flex items-center gap-2 px-3 py-1.5 text-sm text-blue-900 dark:text-blue-950 font-medium bg-blue-100 dark:bg-blue-200 rounded hover:bg-white dark:hover:bg-white transition-colors"
              >
                Log in
              </Link>
              <Link
                href="/signin"
                className="hidden md:flex items-center gap-2 px-4 py-1.5 text-sm bg-gradient-to-r from-amber-400 to-amber-500 text-blue-900 font-medium rounded hover:from-amber-500 hover:to-amber-600 transition-all"
              >
                Start Playing
              </Link>
            </>
          )}

          <button
            className="md:hidden text-blue-100 dark:text-blue-200"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <Menu size={24} />
          </button>
        </div>
      </div>

      {/* User Profile Dialog */}
      <Dialog open={userMenuOpen} onOpenChange={setUserMenuOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Profile Overview</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarImage src={user?.image || ""} />
                <AvatarFallback className="bg-blue-200 text-blue-900 text-xl">
                  {(user?.name?.charAt(0) || "T").toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <h3 className="font-medium text-lg">
                  {user?.name || "Trader"}
                </h3>
                <p className="text-sm text-muted-foreground">{user?.email}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-muted/50 p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Wallet className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Balance</span>
                </div>
                <p className="text-2xl font-bold">
                  ${user?.balance?.toFixed(2)}
                </p>
              </div>

              <div className="bg-muted/50 p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Trophy className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Win Rate</span>
                </div>
                <p className="text-2xl font-bold">85%</p>
              </div>
            </div>

            <Link
              href="/trade"
              className="w-full bg-gradient-to-r from-amber-400 to-amber-500 text-blue-900 font-medium rounded-md py-2 px-4 text-center hover:from-amber-500 hover:to-amber-600 transition-all"
            >
              Start Playing
            </Link>

            <SignOutButton
              onSignOut={() => setUserMenuOpen(false)}
              className="flex items-center justify-center gap-2 w-full text-red-500 hover:text-red-600 font-medium py-2"
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-x-0 top-[73px] bg-blue-800/95 dark:bg-slate-900/95 border-b border-blue-700/50 dark:border-blue-800/50 backdrop-blur-md">
          <div className="p-4 space-y-3">
            {isAuthenticated && user ? (
              <>
                {/* Authenticated Mobile Menu */}
                <div className="flex items-center gap-3 p-3 bg-blue-700/50 dark:bg-slate-800/50 rounded-lg">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={user.image || ""} />
                    <AvatarFallback className="bg-blue-200 text-blue-900">
                      {(user.name?.charAt(0) || "T").toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium text-white">
                      {user.name}
                    </p>
                    <p className="text-xs text-blue-200">{user.email}</p>
                  </div>
                </div>
                <Link
                  href="/play"
                  className="flex items-center justify-center gap-2 w-full px-3 py-2 text-sm bg-gradient-to-r from-amber-400 to-amber-500 text-blue-900 font-medium rounded hover:from-amber-500 hover:to-amber-600 transition-all"
                >
                  PlayNow
                </Link>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-blue-700/50 dark:bg-slate-800/50 p-3 rounded-lg">
                    <p className="text-xs text-blue-200">Balance</p>
                    <p className="text-sm font-medium text-white">
                      ${user.balance?.toFixed(2)}
                    </p>
                  </div>
                  <div className="bg-blue-700/50 dark:bg-slate-800/50 p-3 rounded-lg">
                    <p className="text-xs text-blue-200">Win Rate</p>
                    <p className="text-sm font-medium text-white">85%</p>
                  </div>
                </div>
                <SignOutButton
                  onSignOut={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-center gap-2 w-full px-3 py-2 text-sm text-red-400 hover:text-red-300 font-medium rounded border border-red-400 hover:border-red-300"
                />
              </>
            ) : (
              <>
                {/* Unauthenticated Mobile Menu */}
                <div className="grid grid-cols-2 gap-3">
                  <Link
                    href="/signin"
                    className="flex-1 px-3 py-1.5 text-sm text-blue-900 dark:text-blue-950 font-medium bg-blue-100 dark:bg-blue-200 rounded text-center"
                  >
                    Log in
                  </Link>
                  <Link
                    href="/signin"
                    className="flex-1 px-3 py-1.5 text-sm bg-gradient-to-r from-amber-400 to-amber-500 text-blue-900 font-medium rounded text-center"
                  >
                    Sign Up
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
