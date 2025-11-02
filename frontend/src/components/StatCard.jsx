import { alpha, useTheme } from "@mui/material/styles";
import { Box, Paper, Stack, Typography } from "@mui/material";

const StatCard = ({ icon, label, value, trend, color = "primary" }) => {
  const theme = useTheme();
  const palette = theme.palette[color] ?? theme.palette.primary;

  return (
    <Paper
      elevation={10}
      sx={{
        p: 3,
        height: "100%",
        display: "flex",
        alignItems: "center",
        borderRadius: 4,
        background: `linear-gradient(140deg, ${alpha(palette.light ?? palette.main, 0.18)} 0%, ${alpha(
          palette.main,
          0.05
        )} 100%)`,
        border: `1px solid ${alpha(palette.main, 0.12)}`,
      }}
    >
      <Stack direction="row" spacing={2} alignItems="center">
        {icon && (
          <Box
            sx={{
              width: 52,
              height: 52,
              borderRadius: "24px",
              backgroundColor: alpha(palette.main, 0.14),
              color: palette.main,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 26,
            }}
          >
            {icon}
          </Box>
        )}
        <Stack spacing={0.5}>
          <Typography variant="overline" sx={{ letterSpacing: 1.2, color: alpha(palette.main, 0.9) }}>
            {label}
          </Typography>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>
            {value}
          </Typography>
          {trend && (
            <Typography variant="body2" color="text.secondary">
              {trend}
            </Typography>
          )}
        </Stack>
      </Stack>
    </Paper>
  );
};

export default StatCard;
