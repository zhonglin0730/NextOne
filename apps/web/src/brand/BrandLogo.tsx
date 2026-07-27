import { useId } from "react";

interface BrandLogoProps {
  name: string;
}

export function BrandLogo({ name }: BrandLogoProps) {
  const gradientId = `nextone-blue-${useId().replaceAll(":", "")}`;

  return (
    <span className="brand-logo" role="img" aria-label={name}>
      <svg
        aria-hidden="true"
        className="brand-logo-mark"
        viewBox="0 0 64 64"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id={gradientId} x1="39" x2="57" y1="8" y2="52">
            <stop offset="0" stopColor="#3578ff" />
            <stop offset="1" stopColor="#1553e8" />
          </linearGradient>
        </defs>
        <path
          d="m39 17 13-9v44"
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="10"
        />
        <path
          d="M12 52V12l33 38"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="10"
        />
      </svg>
      <span className="brand-logo-wordmark" aria-hidden="true">
        {name}
      </span>
    </span>
  );
}
