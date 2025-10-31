import { useEffect, useState } from "react";
import {
  Alert,
  AppBar,
  Box,
  Button,
  Container,
  Paper,
  Stack,
  TextField,
  Toolbar,
  Typography,
} from "@mui/material";
import API from "../api";
import formatArticleCode from "../utils/formatArticle";
import CalendarOverview from "../components/CalendarOverview";

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

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <AppBar position="static" color="transparent" elevation={0} sx={{ py: 1 }}>
        <Toolbar sx={{ display: "flex", justifyContent: "space-between" }}>
          <Box>
            <Typography variant="h5" fontWeight={600} color="text.primary">
              Requester workspace
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Register a new import request with all mandatory details.
            </Typography>
          </Box>
          <Button variant="contained" color="primary" onClick={logout}>
            Logout
          </Button>
        </Toolbar>
      </AppBar>

      <Container sx={{ flexGrow: 1, py: { xs: 4, md: 6 } }} maxWidth="md">
        <Stack spacing={3}>
          <Stack spacing={2}>
            {notificationsFeedback && (
              <Alert severity={notificationsFeedback.severity}>
                {notificationsFeedback.message}
              </Alert>
            )}
            {notificationsLoading ? (
              <Alert severity="info">Checking for updates…</Alert>
            ) : notifications.length === 0 ? (
              <Alert severity="success">You're up to date with the latest changes.</Alert>
            ) : (
              notifications.map((notification) => (
                <Alert
                  key={notification.ID}
                  severity="info"
                  onClose={() => handleNotificationDismiss(notification.ID)}
                >
                  {notification.Message}
                </Alert>
              ))
            )}
          </Stack>

          <Paper elevation={8} sx={{ p: { xs: 4, md: 6 } }}>
            <Stack spacing={4}>
              <Stack spacing={1}>
                <Typography variant="h5">Create a new import request</Typography>
                <Typography variant="body2" color="text.secondary">
                  Provide the request date, importer, article and pallet count to
                  submit a complete record.
                </Typography>
              </Stack>

              {feedback && <Alert severity={feedback.severity}>{feedback.message}</Alert>}

              <Box component="form" onSubmit={handleSubmit} noValidate>
                <Stack spacing={3}>
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

                  <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                    <Button type="submit" variant="contained" size="large">
                      Submit request
                    </Button>
                  </Box>
                </Stack>
              </Box>
            </Stack>
          </Paper>

          <CalendarOverview
            title="Arrival schedule"
            description="Browse the shared calendar of confirmed arrivals to stay informed about planned deliveries."
          />
        </Stack>
      </Container>
    </Box>
  );
}
