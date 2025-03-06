import React from "react";

interface InfoCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  className?: string;
}

export default function InfoCard({
  title,
  description,
  icon,
  className = "",
}: InfoCardProps) {
  return (
    <div
      className={`bg-card text-card-foreground p-6 rounded-xl shadow-md hover:shadow-lg transition-shadow duration-300 ${className}`}
    >
      <div className="text-gold-500 mb-4">{icon}</div>
      <h3 className="text-xl font-medium mb-2">{title}</h3>
      <p className="text-muted-foreground">{description}</p>
    </div>
  );
}
