"use client";
import { useAuthActions } from "@convex-dev/auth/react";
import React, { useState } from "react";

export function UseGoogleSignIn() {
  const { signIn } = useAuthActions();
  const [isHovering, setIsHovering] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  const handleSignIn = async () => {
    try {
      await signIn("google");
    } catch (error) {
      console.error("Sign in failed:", error);
    }
  };

  return (
    <button
      onClick={handleSignIn}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => {
        setIsHovering(false);
        setIsPressed(false);
      }}
      onMouseDown={() => setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
      className={`relative flex items-center justify-center w-full py-3.5 px-4 gap-3 
        ${isPressed ? "bg-gray-100" : isHovering ? "bg-gray-50" : "bg-white"} 
        text-slate-800 font-medium rounded-lg 
        border border-slate-200 
        shadow-sm transition-all duration-200 
        overflow-hidden group`}
    >
      {/* Subtle background highlight effect */}
      <div
        className={`absolute inset-0 bg-gradient-to-r from-blue-50 to-amber-50 opacity-0 
          ${isHovering ? "opacity-40" : ""} 
          transition-opacity duration-300`}
      />

      {/* Google logo */}
      <div className="relative flex-shrink-0 w-5 h-5">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          className="w-5 h-5"
        >
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
      </div>

      {/* Divider line */}
      <div className="h-5 w-px bg-slate-200 mx-1"></div>

      {/* Button text */}
      <span className="relative text-sm">Continue with Google</span>

      {/* Subtle arrow indicator */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className={`relative w-4 h-4 ml-auto text-slate-400 transition-transform duration-200 
          ${isHovering ? "translate-x-0.5" : ""}`}
      >
        <path
          fillRule="evenodd"
          d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
          clipRule="evenodd"
        />
      </svg>
    </button>
  );
}
