import React from "react";

interface ButtonProps {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "outline";
  size?: "sm" | "md" | "lg";
  className?: string;
  onClick?: () => void;
}

export default function AurumButton({
  children,
  variant = "primary",
  size = "md",
  className = "",
  onClick,
}: ButtonProps) {
  const baseClasses =
    "inline-flex items-center justify-center font-medium rounded-md transition-all duration-200 focus:outline-none";

  const variantClasses = {
    primary: "gold-gradient text-navy-900 hover:opacity-90",
    secondary: "bg-navy-800 hover:bg-navy-700 text-white",
    outline: "border border-gold-500 text-gold-500 hover:bg-gold-500/10",
  };

  const sizeClasses = {
    sm: "text-sm px-3 py-1.5",
    md: "px-5 py-2",
    lg: "text-lg px-6 py-3",
  };

  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
