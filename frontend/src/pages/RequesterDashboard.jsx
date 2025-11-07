import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Container,
  Grid,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import NotificationsActiveRoundedIcon from "@mui/icons-material/NotificationsActiveRounded";
import EventAvailableRoundedIcon from "@mui/icons-material/EventAvailableRounded";
import ChecklistRoundedIcon from "@mui/icons-material/ChecklistRounded";
import API from "../api";
import formatArticleCode from "../utils/formatArticle";
import CalendarOverview from "../components/CalendarOverview";
import PageHero from "../components/PageHero";
import StatCard from "../components/StatCard";
import NotificationPermissionBanner from "../components/NotificationPermissionBanner";

const today = () => new Date().toISOString().split("T")[0];

export default function RequesterDashboard() {
  const currentDate = today();
  const [importer, setImporter] = useState("");
  const [items, setItems] = useState([{ article: "", boxCount: "" }]);
  const [arrivalDate, setArrivalDate] = useState("");
  const [comment, setComment] = useState("");
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

  const handleItemChange = (index, field, value) => {
    setItems((previous) =>
      previous.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      )
    );
  };

  const handleAddItem = () => {
    setItems((previous) => [...previous, { article: "", boxCount: "" }]);
  };

  const handleRemoveItem = (index) => {
    setItems((previous) => previous.filter((_, itemIndex) => itemIndex !== index));
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

    const importerValue = importer.trim();

    if (!importerValue) {
      setFeedback({
        severity: "error",
        message: "Please provide the importer name for this order.",
      });
      return;
    }

    const preparedItems = [];

    for (let index = 0; index < items.length; index += 1) {
      const current = items[index];
      const trimmedArticle = (current.article ?? "").trim();

      if (!trimmedArticle) {
        setFeedback({
          severity: "error",
          message: `Please provide an article code for item ${index + 1}.`,
        });
        return;
      }

      const parsedBoxCount = Number(current.boxCount);

      if (!Number.isFinite(parsedBoxCount) || parsedBoxCount <= 0) {
        setFeedback({
          severity: "error",
          message: `Please provide a positive box quantity for item ${index + 1}.`,
        });
        return;
      }

      preparedItems.push({
        article: formatArticleCode(trimmedArticle),
        boxCount: parsedBoxCount,
      });
    }

    try {
      await API.post("/imports", {
        requestDate: currentDate,
        arrivalDate,
        importer: importerValue,
        comment,
        items: preparedItems,
      });
      setFeedback({
        severity: "success",
        message: "Import order submitted successfully.",
      });
      setImporter("");
      setArrivalDate("");
      setItems([{ article: "", boxCount: "" }]);
      setComment("");
    } catch (error) {
      setFeedback({
        severity: "error",
        message: "Something went wrong while creating the order.",
      });
    }
  };

  const logout = () => {
    localStorage.clear();
    window.location.reload();
  };

  const upcomingArrival = useMemo(() => {
    if (!arrivalDate) return "Select a date";
    return new Date(arrivalDate).toLocaleDateString();
  }, [arrivalDate]);

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <PageHero
        title="Requester workspace"
        subtitle="Register new import requests with every required detail and keep tabs on confirmations in real time."
        actions={
          <Button variant="contained" color="secondary" onClick={logout}>
            Logout
          </Button>
        }
      >
        <Paper
          elevation={0}
          sx={{
            p: 3,
            color: "inherit",
            backgroundColor: "rgba(255,255,255,0.14)",
            borderRadius: 3,
            border: "1px solid rgba(255,255,255,0.25)",
          }}
        >
          <Stack spacing={1}>
            <Typography variant="subtitle2" sx={{ opacity: 0.8 }}>
              Today's focus
            </Typography>
            <Typography variant="body1">
              Submit the latest import details, then monitor responses from approvers in
              your notifications feed below.
            </Typography>
          </Stack>
        </Paper>
      </PageHero>

      <Container sx={{ flexGrow: 1, py: { xs: 4, md: 6 } }} maxWidth="lg">
        <Stack spacing={4}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={4}>
              <StatCard
                icon={<NotificationsActiveRoundedIcon />}
                label="Unread updates"
                value={notificationsLoading ? "…" : notifications.length}
                trend="Dismiss updates as you review them"
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <StatCard
                icon={<EventAvailableRoundedIcon />}
                label="Planned arrival"
                value={upcomingArrival}
                trend="Pick your best estimate to help confirmers plan"
                color="secondary"
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <StatCard
                icon={<ChecklistRoundedIcon />}
                label="Today’s date"
                value={new Date(currentDate).toLocaleDateString()}
                trend="Request date is set automatically"
                color="info"
              />
            </Grid>
          </Grid>

          <Stack spacing={2}>
            <NotificationPermissionBanner onEnabled={loadNotifications} />
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

          <Paper
            elevation={12}
            sx={{
              p: { xs: 4, md: 6 },
              background: (theme) =>
                `linear-gradient(160deg, ${theme.palette.common.white} 0%, ${theme.palette.background.default} 100%)`,
            }}
          >
            <Stack spacing={4}>
              <Stack spacing={1}>
                <Typography variant="h5">Create a new import order</Typography>
                <Typography variant="body2" color="text.secondary">
                  Provide the request date, importer and the list of article/box
                  combinations (Sasia - Pako) to submit a complete record.
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
                    label="Arrival date (Data Arritjes)"
                    type="date"
                    value={arrivalDate}
                    onChange={(event) => setArrivalDate(event.target.value)}
                    InputLabelProps={{ shrink: true }}
                    helperText="Choose when the import is expected to arrive"
                    required
                    fullWidth
                  />
                  <Stack spacing={2}>
                    <Typography variant="subtitle1">
                      Articles in this order
                    </Typography>
                    {items.map((item, index) => (
                      <Stack
                        key={`order-item-${index}`}
                        spacing={2}
                        sx={{
                          p: 2,
                          borderRadius: 2,
                          border: "1px solid",
                          borderColor: "divider",
                          backgroundColor: "background.paper",
                        }}
                      >
                        <Stack
                          direction="row"
                          alignItems="center"
                          justifyContent="space-between"
                        >
                          <Typography variant="subtitle2">
                            Article {index + 1}
                          </Typography>
                          {items.length > 1 && (
                            <Button
                              type="button"
                              color="error"
                              onClick={() => handleRemoveItem(index)}
                              size="small"
                            >
                              Remove
                            </Button>
                          )}
                        </Stack>
                        <TextField
                          label="Article"
                          value={item.article}
                          onChange={(event) =>
                            handleItemChange(index, "article", event.target.value)
                          }
                          placeholder="Describe the article"
                          helperText="Article codes shorter than 6 digits are padded automatically"
                          required
                          fullWidth
                        />
                        <TextField
                          label="Box quantity (Sasia - Pako)"
                          type="number"
                          value={item.boxCount}
                          onChange={(event) =>
                            handleItemChange(index, "boxCount", event.target.value)
                          }
                          inputProps={{ min: 1 }}
                          helperText="We calculate palletization automatically based on the box count"
                          required
                          fullWidth
                        />
                      </Stack>
                    ))}
                    <Button
                      type="button"
                      variant="outlined"
                      onClick={handleAddItem}
                      sx={{ alignSelf: "flex-start" }}
                    >
                      Add another article
                    </Button>
                  </Stack>
                  <TextField
                    label="Additional context"
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    placeholder="Share helpful notes for confirmers and admins"
                    helperText="Optional. Visible to everyone reviewing the request."
                    multiline
                    minRows={3}
                    fullWidth
                  />

                  <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                    <Button type="submit" variant="contained" size="large">
                      Submit order
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
