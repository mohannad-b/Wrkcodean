import React from "react";
import { ImageWithFallback } from "./figma/ImageWithFallback";

const wrkLogo = "/assets/a0968c5f71f70a5633ec5916ffedf6facb1cb1d4.png";

export const WrkLogo: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <div className={className} style={{ width: 118, height: 76 }}>
      <ImageWithFallback 
        src={wrkLogo} 
        alt="WRK Logo" 
        className="w-full h-full object-contain"
      />
    </div>
  );
};
