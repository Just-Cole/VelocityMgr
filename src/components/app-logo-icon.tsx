
// src/components/app-logo-icon.tsx
import type React from 'react';

const AppLogoIcon = ({ className }: { className?: string }) => {
  const H = { // Outer Hexagon points
    top: { x: 45, y: 2 },
    topRight: { x: 85, y: 26 },
    bottomRight: { x: 85, y: 74 },
    bottom: { x: 45, y: 98 },
    bottomLeft: { x: 5, y: 74 },
    topLeft: { x: 5, y: 26 },
  };
  const I = { // Inner "void" points (approximate)
    p1: { x: 40, y: 35 }, 
    p2: { x: 50, y: 35 }, 
    p3: { x: 60, y: 50 }, 
    p4: { x: 50, y: 65 }, 
    p5: { x: 40, y: 65 }, 
    p6: { x: 30, y: 50 }, 
  };

  return (
    <svg
      viewBox="0 0 90 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d={`M${H.top.x} ${H.top.y} L${H.topRight.x} ${H.topRight.y} L${H.bottomRight.x} ${H.bottomRight.y} L${H.bottom.x} ${H.bottom.y} L${H.bottomLeft.x} ${H.bottomLeft.y} L${H.topLeft.x} ${H.topLeft.y} Z`}
        fill="#2D3748" 
      />
      <path d={`M${H.topLeft.x} ${H.topLeft.y} L${H.top.x} ${H.top.y} L${I.p1.x} ${I.p1.y} L${I.p6.x} ${I.p6.y} Z`} fill="#38B2AC" />
      <path d={`M${H.top.x} ${H.top.y} L${H.topRight.x} ${H.topRight.y} L${I.p2.x} ${I.p2.y} L${I.p3.x} ${I.p3.y} Z`} fill="#319795" />
      <path d={`M${H.topRight.x} ${H.topRight.y} L${H.bottomRight.x} ${H.bottomRight.y} L${I.p4.x} ${I.p4.y} L${I.p3.x} ${I.p3.y} Z`} fill="#3182CE" />
      <path d={`M${H.bottomRight.x} ${H.bottomRight.y} L${H.bottom.x} ${H.bottom.y} L${I.p5.x} ${I.p5.y} L${I.p4.x} ${I.p4.y} Z`} fill="#5A67D8" />
      <path d={`M${H.bottom.x} ${H.bottom.y} L${H.bottomLeft.x} ${H.bottomLeft.y} L${I.p6.x} ${I.p6.y} L${I.p5.x} ${I.p5.y} Z`} fill="#4C51BF" />
      <path d={`M${H.bottomLeft.x} ${H.bottomLeft.y} L${H.topLeft.x} ${H.topLeft.y} L${I.p1.x} ${I.p1.y} L${I.p6.x} ${I.p6.y} Z`} fill="#4299E1" />
      <path
        d={`M${H.top.x} ${H.top.y} L${H.topRight.x} ${H.topRight.y} L${H.bottomRight.x} ${H.bottomRight.y} L${H.bottom.x} ${H.bottom.y} L${H.bottomLeft.x} ${H.bottomLeft.y} L${H.topLeft.x} ${H.topLeft.y} Z`}
        stroke="#1A202C"
        strokeWidth="3"
      />
    </svg>
  );
};

export default AppLogoIcon;
