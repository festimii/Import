import { alpha, useTheme } from "@mui/material/styles";
import { Box, Container, Stack, Typography } from "@mui/material";

const DecorativeCircle = ({ size, top, left, right, bottom, color, blur = 0 }) => (
  <Box
    sx={{
      position: "absolute",
      width: size,
      height: size,
      borderRadius: "50%",
      top,
      left,
      right,
      bottom,
      background: color,
      filter: blur ? `blur(${blur}px)` : "none",
      opacity: 0.35,
      pointerEvents: "none",
    }}
  />
);

const PageHero = ({
  title,
  subtitle,
  actions,
  children,
  maxWidth = "lg",
  sx,
}) => {
  const theme = useTheme();
  const gradient = `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.9)}, ${alpha(
    theme.palette.secondary.main,
    0.9
  )})`;

  return (
    <Box
      sx={{
        position: "relative",
        overflow: "hidden",
        color: theme.palette.common.white,
        background: gradient,
        py: { xs: 6, md: 8 },
        ...sx,
      }}
    >
      <DecorativeCircle
        size={{ xs: 180, md: 260 }}
        top={{ xs: "-12%", md: "-20%" }}
        right={{ xs: "-18%", md: "-10%" }}
        color={alpha(theme.palette.common.white, 0.35)}
        blur={0}
      />
      <DecorativeCircle
        size={{ xs: 140, md: 210 }}
        bottom={{ xs: "-10%", md: "-15%" }}
        left={{ xs: "-18%", md: "-10%" }}
        color={alpha(theme.palette.common.white, 0.25)}
        blur={0}
      />
      <DecorativeCircle
        size={320}
        top={{ xs: "40%", md: "35%" }}
        right={{ xs: "-65%", md: "-40%" }}
        color={alpha(theme.palette.common.white, 0.3)}
        blur={60}
      />

      <Container maxWidth={maxWidth}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={{ xs: 4, md: 6 }}
          justifyContent="space-between"
          alignItems="center"
        >
          <Stack spacing={2} sx={{ maxWidth: { md: "65%" } }}>
            <Typography variant="overline" sx={{ letterSpacing: 2, opacity: 0.9 }}>
              Import Flow
            </Typography>
            <Typography variant="h3" component="h1" sx={{ fontWeight: 600 }}>
              {title}
            </Typography>
            {subtitle && (
              <Typography
                variant="h6"
                sx={{
                  opacity: 0.85,
                  fontWeight: 400,
                  maxWidth: { md: "80%" },
                }}
              >
                {subtitle}
              </Typography>
            )}
            {actions && (
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                {actions}
              </Stack>
            )}
          </Stack>

          {children && <Box sx={{ width: "100%", maxWidth: 320 }}>{children}</Box>}
        </Stack>
      </Container>
    </Box>
  );
};

export default PageHero;
