import { Link as RouterLink, useNavigate } from "react-router-dom";
import { alpha } from "@mui/material/styles";
import {
  Box,
  Button,
  Chip,
  Container,
  Divider,
  Grid,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import HelpOutlineRoundedIcon from "@mui/icons-material/HelpOutlineRounded";
import ColorLensRoundedIcon from "@mui/icons-material/ColorLensRounded";
import SchoolRoundedIcon from "@mui/icons-material/SchoolRounded";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import NotificationsActiveRoundedIcon from "@mui/icons-material/NotificationsActiveRounded";
import InfoRoundedIcon from "@mui/icons-material/InfoRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import PageHero from "../components/PageHero";
import SectionCard from "../components/SectionCard";

const legendItems = [
  {
    title: "Actual arrival recorded",
    color: "info",
    description:
      "Cards and chips turn blue when an actual arrival date has been saved.",
    icon: <InfoRoundedIcon fontSize="small" />,
  },
  {
    title: "Past arrival or action needed",
    color: "warning",
    description:
      "Orange means the planned arrival date has passed or is due today. Reschedules may be needed.",
    icon: <WarningAmberRoundedIcon fontSize="small" />,
  },
  {
    title: "On track / approved",
    color: "success",
    description:
      "Green highlights approved requests, upcoming arrivals, and healthy metrics.",
    icon: <CheckCircleRoundedIcon fontSize="small" />,
  },
  {
    title: "Rejected or blocked",
    color: "error",
    description:
      "Red marks rejected requests, validation errors, or anything that needs fixing before proceeding.",
    icon: <ErrorOutlineRoundedIcon fontSize="small" />,
  },
  {
    title: "Neutral or mixed",
    color: "default",
    description:
      "Grey/outlined chips call out drafts, placeholders, or mixed statuses (for example, when a batch contains multiple outcomes).",
    icon: <HelpOutlineRoundedIcon fontSize="small" />,
  },
];

const roleGuides = [
  {
    title: "Requesters",
    points: [
      "Create import requests, upload article details, and choose the planned arrival date.",
      "You can reschedule while the planned date is in the future; past-due arrivals lock rescheduling.",
      "Use History to review or export what you've submitted.",
    ],
  },
  {
    title: "Confirmers",
    points: [
      "Review grouped submissions, approve or reject, and propose new arrival dates when needed.",
      "Set the actual arrival date once the shipment is confirmed on-site.",
      "Monitor the shared arrival calendar to spot conflicts early.",
    ],
  },
  {
    title: "Admins",
    points: [
      "Oversee metrics, arrivals, and volumes across teams.",
      "Manage who can request, confirm, or administer access.",
      "Use the calendar for a single source of truth on upcoming and completed arrivals.",
    ],
  },
];

export default function Help() {
  const navigate = useNavigate();

  return (
    <Box
      sx={{
        minHeight: "100vh",
        background: (theme) =>
          `radial-gradient(circle at 20% 20%, ${alpha(
            theme.palette.primary.light,
            0.15
          )} 0%, transparent 32%), radial-gradient(circle at 80% 10%, ${alpha(
            theme.palette.secondary.light,
            0.18
          )} 0%, transparent 32%), ${theme.palette.background.default}`,
      }}
    >
      <PageHero
        title="Help & color legend"
        subtitle="A quick reference on how the import tracker works and what the colors mean across every page."
        actions={[
          <Button
            key="back"
            variant="outlined"
            color="inherit"
            startIcon={<HelpOutlineRoundedIcon />}
            onClick={() => navigate(-1)}
          >
            Go back
          </Button>,
          <Button
            key="dashboard"
            variant="contained"
            component={RouterLink}
            to="/"
            startIcon={<CalendarMonthRoundedIcon />}
          >
            Go to app
          </Button>,
        ]}
      >
        <Stack spacing={1} sx={{ maxWidth: 760 }}>
          <Typography variant="body1">
            This guide is available to every role. It summarizes the shared
            workflows, how to read the arrival calendar, and the meaning behind
            each status color.
          </Typography>
        </Stack>
      </PageHero>

      <Container maxWidth="lg" sx={{ py: { xs: 4, md: 6 } }}>
        <Stack spacing={3.5}>
          <SectionCard
            title="How everything fits together"
            description="Keep every handoff consistent: submit requests with dates, confirm and schedule, then record the actual arrival."
            action={
              <Button
                variant="outlined"
                startIcon={<NotificationsActiveRoundedIcon />}
                component={RouterLink}
                to="/"
              >
                Check notifications
              </Button>
            }
          >
            <Grid container spacing={3}>
              {roleGuides.map((role) => (
                <Grid item xs={12} md={4} key={role.title}>
                  <Paper
                    variant="outlined"
                    sx={{
                      p: 2.5,
                      borderRadius: 3,
                      height: "100%",
                      display: "flex",
                      flexDirection: "column",
                      gap: 1.5,
                    }}
                  >
                    <Stack direction="row" spacing={1} alignItems="center">
                      <SchoolRoundedIcon color="primary" fontSize="small" />
                      <Typography variant="subtitle1" fontWeight={600}>
                        {role.title}
                      </Typography>
                    </Stack>
                    <Stack spacing={1}>
                      {role.points.map((point) => (
                        <Typography
                          key={point}
                          variant="body2"
                          color="text.secondary"
                        >
                          • {point}
                        </Typography>
                      ))}
                    </Stack>
                  </Paper>
                </Grid>
              ))}
            </Grid>
          </SectionCard>

          <SectionCard
            title="Color legend (universal)"
            description="These colors stay consistent across cards, chips, alerts, and the arrival calendar."
            action={
              <Stack direction="row" spacing={1} alignItems="center">
                <ColorLensRoundedIcon color="primary" />
                <Typography variant="body2" color="text.secondary">
                  Green = on track, Blue = actual, Orange = needs attention
                </Typography>
              </Stack>
            }
          >
            <Grid container spacing={2}>
              {legendItems.map((item) => (
                <Grid item xs={12} sm={6} md={4} key={item.title}>
                  <Paper
                    variant="outlined"
                    sx={{
                      p: 2,
                      borderRadius: 3,
                      height: "100%",
                      display: "flex",
                      flexDirection: "column",
                      gap: 1,
                    }}
                  >
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Chip
                        icon={item.icon}
                        label={item.title}
                        color={item.color}
                        variant={item.color === "default" ? "outlined" : "filled"}
                        size="small"
                        sx={{ fontWeight: 600 }}
                      />
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      {item.description}
                    </Typography>
                  </Paper>
                </Grid>
              ))}
            </Grid>

            <Divider sx={{ my: 3 }} />

            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <Paper
                  variant="outlined"
                  sx={{ p: 2.5, borderRadius: 3, height: "100%" }}
                >
                  <Stack spacing={1}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <CalendarMonthRoundedIcon color="primary" fontSize="small" />
                      <Typography variant="subtitle1" fontWeight={600}>
                        Arrival calendar and cards
                      </Typography>
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      Color signals what stage each import is in:
                    </Typography>
                    <Stack spacing={0.75} sx={{ pl: 1 }}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Chip label="Blue" color="info" size="small" />
                        <Typography variant="body2" color="text.secondary">
                          Actual arrival date captured.
                        </Typography>
                      </Stack>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Chip label="Orange" color="warning" size="small" />
                        <Typography variant="body2" color="text.secondary">
                          Planned arrival date is in the past or due today.
                        </Typography>
                      </Stack>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Chip label="Green" color="success" size="small" />
                        <Typography variant="body2" color="text.secondary">
                          Confirmed and upcoming (no issues detected).
                        </Typography>
                      </Stack>
                    </Stack>
                    <Typography variant="caption" color="text.secondary">
                      Requests lock rescheduling after the planned date passes,
                      so capture actual arrivals promptly.
                    </Typography>
                  </Stack>
                </Paper>
              </Grid>

              <Grid item xs={12} md={6}>
                <Paper
                  variant="outlined"
                  sx={{ p: 2.5, borderRadius: 3, height: "100%" }}
                >
                  <Stack spacing={1}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <NotificationsActiveRoundedIcon
                        color="secondary"
                        fontSize="small"
                      />
                      <Typography variant="subtitle1" fontWeight={600}>
                        Alerts, statuses, and chips
                      </Typography>
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      Status chips and alerts follow the same palette:
                    </Typography>
                    <Stack spacing={0.75} sx={{ pl: 1 }}>
                      <Typography variant="body2" color="text.secondary">
                        • Green: approved/completed items and healthy metrics.
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        • Orange: pending review, day-of arrivals, or proposed reschedules.
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        • Red: rejections and blocking validation errors.
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        • Blue/grey: informational states or mixed results.
                      </Typography>
                    </Stack>
                    <Typography variant="caption" color="text.secondary">
                      Look for the notification bell to review unread updates at
                      any time.
                    </Typography>
                  </Stack>
                </Paper>
              </Grid>
            </Grid>
          </SectionCard>

          <SectionCard
            title="Quick actions"
            description="Jump to the most common places to keep work moving."
          >
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1.5}
              flexWrap="wrap"
              useFlexGap
            >
              <Button
                variant="contained"
                color="primary"
                component={RouterLink}
                to="/"
                startIcon={<CalendarMonthRoundedIcon />}
              >
                Open the arrival calendar
              </Button>
              <Button
                variant="outlined"
                component={RouterLink}
                to="/history"
                startIcon={<SchoolRoundedIcon />}
              >
                View submission history
              </Button>
              <Button
                variant="outlined"
                component={RouterLink}
                to="/"
                startIcon={<HelpOutlineRoundedIcon />}
              >
                Back to dashboard
              </Button>
            </Stack>
          </SectionCard>
        </Stack>
      </Container>
    </Box>
  );
}
