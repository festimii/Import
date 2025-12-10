import { Box, Stack, Typography } from "@mui/material";

const toNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const projectIso = (x, y, z, origin, scale) => {
  // Isometric projection keeps the relative orientation of the axes.
  const isoX = (x - y) * 0.86602540378; // cos(30deg)
  const isoY = (x + y) * 0.5 - z; // sin(30deg) for x/y, minus z for height
  return {
    x: origin.x + isoX * scale,
    y: origin.y + isoY * scale,
  };
};

const isValid = (value) => value !== null && value >= 0;

export default function OrientationPreview({
  x,
  y,
  z,
  size = 180,
  showLegend = true,
}) {
  const dims = {
    x: toNumber(x),
    y: toNumber(y),
    z: toNumber(z),
  };

  const hasAll = isValid(dims.x) && isValid(dims.y) && isValid(dims.z);

  if (!hasAll) {
    return (
      <Box
        sx={{
          width: size,
          height: size,
          borderRadius: 2,
          border: (theme) => `1px dashed ${theme.palette.divider}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: (theme) => theme.palette.action.hover,
        }}
      >
        <Typography variant="body2" color="text.secondary" align="center">
          XYZ not provided
        </Typography>
      </Box>
    );
  }

  const maxDim = Math.max(dims.x, dims.y, dims.z);
  const scale = maxDim > 0 ? (size - 80) / maxDim : 1;
  const origin = { x: size / 2, y: size * 0.72 };

  const points = {
    a: projectIso(0, 0, 0, origin, scale),
    b: projectIso(dims.x, 0, 0, origin, scale),
    c: projectIso(dims.x, dims.y, 0, origin, scale),
    d: projectIso(0, dims.y, 0, origin, scale),
    e: projectIso(0, 0, dims.z, origin, scale),
    f: projectIso(dims.x, 0, dims.z, origin, scale),
    g: projectIso(dims.x, dims.y, dims.z, origin, scale),
    h: projectIso(0, dims.y, dims.z, origin, scale),
  };

  const face = (keys) => keys.map((key) => `${points[key].x},${points[key].y}`).join(" ");

  return (
    <Stack spacing={0.5} alignItems="center">
      <Box sx={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label="XYZ orientation preview"
        >
          <defs>
            <linearGradient id="faceTop" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#90caf9" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#42a5f5" stopOpacity="0.6" />
            </linearGradient>
            <linearGradient id="faceLeft" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="#64b5f6" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#2196f3" stopOpacity="0.25" />
            </linearGradient>
            <linearGradient id="faceRight" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="#42a5f5" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#1e88e5" stopOpacity="0.25" />
            </linearGradient>
          </defs>

          <polygon points={face(["a", "b", "f", "e"])} fill="url(#faceRight)" stroke="#1e88e5" strokeWidth="1" />
          <polygon points={face(["a", "d", "h", "e"])} fill="url(#faceLeft)" stroke="#1976d2" strokeWidth="1" />
          <polygon points={face(["e", "f", "g", "h"])} fill="url(#faceTop)" stroke="#0d47a1" strokeWidth="1" />

          <polyline
            points={face(["a", "b", "c", "d", "a"])}
            fill="none"
            stroke="#0d47a1"
            strokeWidth="1"
            strokeDasharray="4 3"
          />

          <line
            x1={points.a.x}
            y1={points.a.y}
            x2={points.b.x}
            y2={points.b.y}
            stroke="#ef5350"
            strokeWidth="2"
          />
          <line
            x1={points.a.x}
            y1={points.a.y}
            x2={points.d.x}
            y2={points.d.y}
            stroke="#66bb6a"
            strokeWidth="2"
          />
          <line
            x1={points.a.x}
            y1={points.a.y}
            x2={points.e.x}
            y2={points.e.y}
            stroke="#ffa726"
            strokeWidth="2"
          />

          <text x={points.b.x + 4} y={points.b.y} fill="#ef5350" fontSize="12" fontWeight="600">
            X
          </text>
          <text x={points.d.x - 10} y={points.d.y + 14} fill="#66bb6a" fontSize="12" fontWeight="600">
            Y
          </text>
          <text x={points.e.x + 4} y={points.e.y - 6} fill="#ffa726" fontSize="12" fontWeight="600">
            Z
          </text>
        </svg>
      </Box>

      {showLegend && (
        <Typography variant="caption" color="text.secondary" align="center">
          X (width): {dims.x.toFixed(2)} | Y (depth): {dims.y.toFixed(2)} | Z (height):{" "}
          {dims.z.toFixed(2)}
        </Typography>
      )}
    </Stack>
  );
}
