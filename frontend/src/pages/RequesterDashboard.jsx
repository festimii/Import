import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Container,
  Grid,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import API from "../api";
import formatArticleCode from "../utils/formatArticle";
import CalendarOverview from "../components/CalendarOverview";
import WorkspaceHeader from "../components/WorkspaceHeader";

const today = () => new Date().toISOString().split("T")[0];

export default function RequesterDashboard() {
  const currentDate = today();
  const [importer, setImporter] = useState("");
  const [article, setArticle] = useState("");
  const [arrivalDate, setArrivalDate] = useState("");
  const [palletCount, setPalletCount] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [notificationsFeedback, setNotificationsFeedback] = useState(null);
  const [notificationsLoading, setNotificationsLoading] = useState(true);

  const loadNotifications = async () => {
    setNotificationsLoading(true);
    setNotificationsFeedback(null);
    try {
      const res = await API.get("/notifications");
      const unread = res.data.filter((notification) => !notification.ReadAt);
      setNotifications(unread);
    } catch (error) {
      setNotificationsFeedback({
        severity: "error",
        message: "We couldn't load your notifications. Please try again.",
      });
    } finally {
      setNotificationsLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  const handleNotificationDismiss = async (id) => {
    try {
      await API.patch(`/notifications/${id}/read`);
      setNotifications((prev) => prev.filter((notification) => notification.ID !== id));
    } catch (error) {
      setNotificationsFeedback({
        severity: "error",
        message: "We couldn't update that notification. Please try again.",
      });
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFeedback(null);

    if (!arrivalDate) {
      setFeedback({
        severity: "error",
        message: "Please provide an arrival date for the import.",
      });
      return;
    }

    try {
      await API.post("/imports", {
        requestDate: currentDate,
        arrivalDate,
        importer,
        article: formatArticleCode(article),
        palletCount: Number(palletCount),
      });
      setFeedback({
        severity: "success",
        message: "Import request submitted successfully.",
      });
      setImporter("");
      setArticle("");
      setArrivalDate("");
      setPalletCount("");
    } catch (error) {
      setFeedback({
        severity: "error",
        message: "Something went wrong while creating the request.",
      });
    }
  };

  const logout = () => {
    localStorage.clear();
    window.location.reload();
  };

  const pendingNotifications = notifications.length;

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column", gap: 4, py: { xs: 3, md: 4 } }}>
      <WorkspaceHeader
        title="Requester workspace"
        subtitle="Submit detailed import requests and stay aligned with confirmation updates."
        onLogout={logout}
      />

      <Container sx={{ flexGrow: 1 }} maxWidth="lg">
        <Stack spacing={3}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={4}>
              <Paper
                elevation={0}
                sx={{
                  p: 3,
                  height: "100%",
                  borderRadius: 4,
                  background: "linear-gradient(140deg, rgba(27,75,145,0.08), rgba(46,184,138,0.12))",
                  border: (theme) => `1px solid ${theme.palette.primary.main}1f`,
                }}
              >
                <Stack spacing={2}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Today's status
                  </Typography>
                  <Typography variant="h4" component="p">
                    {pendingNotifications}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {pendingNotifications === 0
                      ? "You're all caught up with the latest confirmations."
                      : "Pending notifications awaiting your review."}
                  </Typography>
                  <Chip
                    label={`Requests sent ${currentDate}`}
                    sx={{
                      alignSelf: "flex-start",
                      backgroundColor: "rgba(27,75,145,0.1)",
                      color: "primary.main",
                      fontWeight: 600,
                    }}
                  />
                </Stack>
              </Paper>
            </Grid>
            <Grid item xs={12} md={8}>
              <Paper elevation={0} sx={{ p: 3, borderRadius: 4 }}>
                <Stack spacing={2}>
                  <Typography variant="subtitle1" fontWeight={600}>
                    Notifications
                  </Typography>
                  {notificationsFeedback && (
                    <Alert severity={notificationsFeedback.severity}>
                      {notificationsFeedback.message}
                    </Alert>
                  )}
                  {notificationsLoading ? (
                    <Alert severity="info">Checking for updates…</Alert>
                  ) : notifications.length === 0 ? (
                    <Alert severity="success">
                      You're up to date with the latest changes.
                    </Alert>
                  ) : (
                    <Stack spacing={2}>
                      {notifications.map((notification) => (
                        <Alert
                          key={notification.ID}
                          severity="info"
                          onClose={() => handleNotificationDismiss(notification.ID)}
                        >
                          {notification.Message}
                        </Alert>
                      ))}
                    </Stack>
                  )}
                </Stack>
              </Paper>
            </Grid>
          </Grid>

          <Grid container spacing={3}>
            <Grid item xs={12} md={5}>
              <Paper elevation={8} sx={{ p: { xs: 4, md: 5 }, borderRadius: 4 }}>
                <Stack spacing={4}>
                  <Stack spacing={1}>
                    <Typography variant="h5">Create a new import request</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Provide the importer, article and arrival details to notify the confirmation team.
                    </Typography>
                  </Stack>

                  {feedback && <Alert severity={feedback.severity}>{feedback.message}</Alert>}

                  <Stack component="form" onSubmit={handleSubmit} noValidate spacing={3}>
                    <TextField
                      label="Request date"
                      type="date"
                      value={currentDate}
                      disabled
                      InputLabelProps={{ shrink: true }}
                      helperText="Automatically set to today's date"
                      required
                      fullWidth
                    />
                    <TextField
                      label="Importer"
                      value={importer}
                      onChange={(event) => setImporter(event.target.value)}
                      placeholder="Importer name"
                      required
                      fullWidth
                    />
                    <TextField
                      label="Article"
                      value={article}
                      onChange={(event) => setArticle(event.target.value)}
                      placeholder="Describe the article"
                      helperText="Article codes shorter than 6 digits are padded automatically"
                      required
                      fullWidth
                    />
                    <TextField
                      label="Arrival date (Data Arritjes)"
                      type="date"
                      value={arrivalDate}
                      onChange={(event) => setArrivalDate(event.target.value)}
                      InputLabelProps={{ shrink: true }}
                      helperText="Choose when the import is expected to arrive"
                      required
                      fullWidth
                    />
                    <TextField
                      label="Number of pallets"
                      type="number"
                      value={palletCount}
                      onChange={(event) => setPalletCount(event.target.value)}
                      inputProps={{ min: 0 }}
                      required
                      fullWidth
                    />

                    <Button type="submit" variant="contained" size="large">
                      Submit request
                    </Button>
                  </Stack>
                </Stack>
              </Paper>
            </Grid>
            <Grid item xs={12} md={7}>
              <CalendarOverview
                title="Arrival schedule"
                description="Browse the confirmed arrival calendar to align logistics and storage planning."
                sx={{ height: "100%" }}
              />
            </Grid>
          </Grid>
        </Stack>
      </Container>
    </Box>
  );
}
