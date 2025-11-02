import {
  Box,
  Chip,
  Container,
  Divider,
  Grid,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import TaskAltRoundedIcon from "@mui/icons-material/TaskAltRounded";
import SecurityRoundedIcon from "@mui/icons-material/SecurityRounded";
import EventAvailableRoundedIcon from "@mui/icons-material/EventAvailableRounded";

const highlights = [
  {
    icon: <TaskAltRoundedIcon fontSize="small" />,
    title: "Streamlined workflows",
    description: "Submit, review and confirm imports without leaving the dashboard.",
  },
  {
    icon: <SecurityRoundedIcon fontSize="small" />,
    title: "Role-based access",
    description: "Keep every approval step secure with tailored permissions.",
  },
  {
    icon: <EventAvailableRoundedIcon fontSize="small" />,
    title: "Arrival calendar",
    description: "A shared view of confirmed deliveries keeps teams aligned.",
  },
];

const AuthLayout = ({ title, subtitle, children, footer, accent }) => {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        py: { xs: 6, md: 10 },
        px: 2,
        background: (theme) =>
          `linear-gradient(120deg, ${theme.palette.background.default} 0%, ${theme.palette.common.white} 60%, ${theme.palette.primary.light}20 100%)`,
      }}
    >
      <Container maxWidth="lg">
        <Paper
          elevation={16}
          sx={{
            overflow: "hidden",
            position: "relative",
          }}
        >
          <Grid container>
            <Grid
              item
              xs={12}
              md={5}
              sx={{
                background: (theme) =>
                  `linear-gradient(160deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
                color: "common.white",
                position: "relative",
              }}
            >
              <Box
                sx={{
                  position: "absolute",
                  inset: 0,
                  opacity: 0.1,
                  background:
                    "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.8) 0%, transparent 55%), radial-gradient(circle at 80% 80%, rgba(255,255,255,0.6) 0%, transparent 45%)",
                }}
              />
              <Stack
                spacing={4}
                sx={{
                  position: "relative",
                  zIndex: 1,
                  p: { xs: 5, md: 6 },
                  height: "100%",
                }}
              >
                <Stack spacing={1.5}>
                  <Chip
                    label={accent ?? "Import Operations"}
                    color="default"
                    sx={{
                      width: "fit-content",
                      backgroundColor: "rgba(255,255,255,0.18)",
                      color: "inherit",
                      fontWeight: 600,
                    }}
                  />
                  <Typography variant="h4" component="h2" sx={{ fontWeight: 600 }}>
                    Built for cross-team collaboration
                  </Typography>
                  <Typography variant="body1" sx={{ opacity: 0.9 }}>
                    Coordinate requests, approvals and arrivals on a single, shared
                    platform designed for import-focused teams.
                  </Typography>
                </Stack>

                <Divider sx={{ borderColor: "rgba(255,255,255,0.3)" }} />

                <Stack spacing={3}>
                  {highlights.map((highlight) => (
                    <Stack key={highlight.title} spacing={1}>
                      <Stack direction="row" spacing={1.5} alignItems="center">
                        <Box
                          sx={{
                            width: 36,
                            height: 36,
                            borderRadius: "50%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: "rgba(255,255,255,0.15)",
                          }}
                        >
                          {highlight.icon}
                        </Box>
                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                          {highlight.title}
                        </Typography>
                      </Stack>
                      <Typography variant="body2" sx={{ opacity: 0.85 }}>
                        {highlight.description}
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              </Stack>
            </Grid>

            <Grid item xs={12} md={7}>
              <Box
                sx={{
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  p: { xs: 4, md: 6 },
                }}
              >
                <Stack spacing={4} sx={{ width: "100%", maxWidth: 460 }}>
                  <Stack spacing={1.5}>
                    <Typography variant="h4" component="h1">
                      {title}
                    </Typography>
                    {subtitle && (
                      <Typography variant="body1" color="text.secondary">
                        {subtitle}
                      </Typography>
                    )}
                  </Stack>
                  {children}
                  {footer && <Box>{footer}</Box>}
                </Stack>
              </Box>
            </Grid>
          </Grid>
        </Paper>
      </Container>
    </Box>
  );
};

export default AuthLayout;
