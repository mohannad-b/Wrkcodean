import React from "react";
import svgPaths from "./wrkLogoPaths";

export const WrkLogo: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <div className={className} style={{ width: 118, height: 76 }}>
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 118 76">
        <g id="Wrk_Logo_Primary 1">
          <path d={svgPaths.p126e5080} fill="#FF2450" id="Vector" />
          <path d={svgPaths.p3dbd580} fill="#FF2450" id="Vector_2" />
          <path d={svgPaths.p2d1dd600} fill="#E62048" id="Vector_3" />
          <path d={svgPaths.p3567f640} fill="#FF2450" id="Vector_4" />
          <path d={svgPaths.p30595200} fill="#E62048" id="Vector_5" />
        </g>
      </svg>
    </div>
  );
};
