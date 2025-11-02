import TaskAltRoundedIcon from "@mui/icons-material/TaskAltRounded";
import EventAvailableRoundedIcon from "@mui/icons-material/EventAvailableRounded";
import SecurityRoundedIcon from "@mui/icons-material/SecurityRounded";
import {
  Box,
  Chip,
  Container,
  Grid,
  Paper,
  Stack,
  Typography,
} from "@mui/material";

const defaultHighlights = [
  {
    icon: <TaskAltRoundedIcon fontSize="small" />,
    label: "Track approvals with clarity",
  },
  {
    icon: <EventAvailableRoundedIcon fontSize="small" />,
    label: "Share arrival schedules effortlessly",
  },
  {
    icon: <SecurityRoundedIcon fontSize="small" />,
    label: "Secure workspaces for every role",
  },
];

const AuthLayout = ({
  title,
  subtitle,
  children,
  highlights = defaultHighlights,
}) => (
  <Box
    sx={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      py: { xs: 6, md: 10 },
      px: 2,
      position: "relative",
      overflow: "hidden",
    }}
  >
    <Box
      sx={{
        position: "absolute",
        inset: 0,
        background:
          "radial-gradient(circle at 20% 20%, rgba(30, 80, 180, 0.1), transparent 55%), radial-gradient(circle at 80% 30%, rgba(46, 184, 138, 0.12), transparent 60%)",
        pointerEvents: "none",
      }}
    />
    <Container maxWidth="lg" sx={{ position: "relative" }}>
      <Paper
        elevation={16}
        sx={{
          overflow: "hidden",
          position: "relative",
          background: "linear-gradient(140deg, #ffffff 30%, #f5f9ff 100%)",
        }}
      >
        <Grid container>
          <Grid
            item
            xs={12}
            md={6}
            sx={{
              display: "flex",
              alignItems: "stretch",
              background:
                "linear-gradient(160deg, rgba(27, 75, 145, 0.95), rgba(46, 184, 138, 0.8))",
              color: "common.white",
            }}
          >
            <Stack spacing={4} sx={{ p: { xs: 5, md: 7 }, width: "100%" }}>
              <Stack spacing={1.5}>
                <Chip
                  label="Import Management Hub"
                  color="default"
                  sx={{
                    alignSelf: "flex-start",
                    backgroundColor: "rgba(255, 255, 255, 0.18)",
                    color: "common.white",
                    fontWeight: 600,
                  }}
                />
                <Typography variant="h4" component="h1" fontWeight={600}>
                  {title}
                </Typography>
                <Typography variant="body1" sx={{ opacity: 0.88 }}>
                  {subtitle}
                </Typography>
              </Stack>
              <Stack spacing={2.5}>
                {highlights.map((highlight) => (
                  <Stack
                    key={highlight.label}
                    direction="row"
                    spacing={2}
                    alignItems="center"
                    sx={{
                      backgroundColor: "rgba(255, 255, 255, 0.1)",
                      borderRadius: 4,
                      px: 2.5,
                      py: 1.5,
                    }}
                  >
                    <Box
                      sx={{
                        width: 36,
                        height: 36,
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: "rgba(255, 255, 255, 0.16)",
                      }}
                    >
                      {highlight.icon}
                    </Box>
                    <Typography variant="body1" sx={{ fontWeight: 500 }}>
                      {highlight.label}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            </Stack>
          </Grid>
          <Grid
            item
            xs={12}
            md={6}
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              py: { xs: 5, md: 7 },
              px: { xs: 4, sm: 6, md: 7 },
            }}
          >
            <Box sx={{ width: "100%", maxWidth: 420 }}>{children}</Box>
          </Grid>
        </Grid>
      </Paper>
    </Container>
  </Box>
);

export default AuthLayout;
