import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Container,
  Divider,
  Grid,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
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

const SUMMARY_METRICS = [
  { key: "totalBoxes", field: "BoxCount", label: "Total boxes", fractionDigits: 0 },
  {
    key: "totalPallets",
    field: "PalletCount",
    label: "Total pallets required",
    fractionDigits: 0,
  },
  {
    key: "totalFullPallets",
    field: "FullPallets",
    label: "Full pallets",
    fractionDigits: 2,
  },
  {
    key: "totalRemainingBoxes",
    field: "RemainingBoxes",
    label: "Remaining boxes",
    fractionDigits: 0,
  },
  {
    key: "totalWeightFull",
    field: "WeightFullPalletsKg",
    label: "Weight of full pallets (kg)",
    fractionDigits: 2,
  },
  {
    key: "totalVolumeFull",
    field: "VolumeFullPalletsM3",
    label: "Volume of full pallets (m³)",
    fractionDigits: 3,
  },
  {
    key: "totalWeightRemaining",
    field: "WeightRemainingKg",
    label: "Weight of remaining boxes (kg)",
    fractionDigits: 2,
  },
  {
    key: "totalVolumeRemaining",
    field: "VolumeRemainingM3",
    label: "Volume of remaining boxes (m³)",
    fractionDigits: 3,
  },
  {
    key: "totalShipmentWeight",
    field: "TotalShipmentWeightKg",
    label: "Total shipment weight (kg)",
    fractionDigits: 2,
  },
  {
    key: "totalShipmentVolume",
    field: "TotalShipmentVolumeM3",
    label: "Total shipment volume (m³)",
    fractionDigits: 3,
  },
];

const ITEM_COLUMNS = [
  {
    field: "Article",
    label: "Article",
    format: (value) => formatArticleCode(value),
  },
  { field: "BoxCount", label: "Boxes", fractionDigits: 0 },
  { field: "PalletCount", label: "Pallets", fractionDigits: 0 },
  { field: "BoxesPerPallet", label: "Boxes / pallet", fractionDigits: 2 },
  { field: "BoxesPerLayer", label: "Boxes / layer", fractionDigits: 2 },
  { field: "LayersPerPallet", label: "Layers / pallet", fractionDigits: 2 },
  { field: "FullPallets", label: "Full pallets", fractionDigits: 2 },
  { field: "RemainingBoxes", label: "Remaining boxes", fractionDigits: 0 },
  { field: "PalletWeightKg", label: "Pallet weight (kg)", fractionDigits: 2 },
  { field: "PalletVolumeM3", label: "Pallet volume (m³)", fractionDigits: 3 },
  { field: "BoxWeightKg", label: "Box weight (kg)", fractionDigits: 2 },
  { field: "BoxVolumeM3", label: "Box volume (m³)", fractionDigits: 3 },
  {
    field: "PalletVolumeUtilization",
    label: "Pallet volume utilization",
    fractionDigits: 2,
  },
  {
    field: "WeightFullPalletsKg",
    label: "Weight of full pallets (kg)",
    fractionDigits: 2,
  },
  {
    field: "VolumeFullPalletsM3",
    label: "Volume of full pallets (m³)",
    fractionDigits: 3,
  },
  {
    field: "WeightRemainingKg",
    label: "Weight of remaining boxes (kg)",
    fractionDigits: 2,
  },
  {
    field: "VolumeRemainingM3",
    label: "Volume of remaining boxes (m³)",
    fractionDigits: 3,
  },
  {
    field: "TotalShipmentWeightKg",
    label: "Total shipment weight (kg)",
    fractionDigits: 2,
  },
  {
    field: "TotalShipmentVolumeM3",
    label: "Total shipment volume (m³)",
    fractionDigits: 3,
  },
];

export default function RequesterDashboard() {
  const currentDate = today();
  const [importer, setImporter] = useState("");
  const [items, setItems] = useState([{ article: "", boxCount: "" }]);
  const [arrivalDate, setArrivalDate] = useState("");
  const [comment, setComment] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [submissionDetails, setSubmissionDetails] = useState(null);
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
      const response = await API.post("/imports", {
        requestDate: currentDate,
        arrivalDate,
        importer: importerValue,
        comment,
        items: preparedItems,
      });
      const payload = response.data;
      const normalizedPayload = Array.isArray(payload)
        ? payload
        : payload
        ? [payload]
        : [];
      setFeedback({
        severity: "success",
        message: "Import order submitted successfully.",
      });
      setImporter("");
      setArrivalDate("");
      setItems([{ article: "", boxCount: "" }]);
      setComment("");
      setSubmissionDetails(
        normalizedPayload.length > 0 ? { items: normalizedPayload } : null
      );
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

  const latestItems = submissionDetails?.items ?? [];
  const firstSubmittedItem = latestItems[0] ?? {};

  const summaryTotals = useMemo(() => {
    if (latestItems.length === 0) {
      return null;
    }

    const totals = SUMMARY_METRICS.reduce((acc, metric) => {
      acc[metric.key] = { value: 0, hasValue: false };
      return acc;
    }, {});

    for (const item of latestItems) {
      for (const metric of SUMMARY_METRICS) {
        const rawValue = item[metric.field];
        if (rawValue === null || rawValue === undefined) {
          continue;
        }
        const numeric = Number(rawValue);
        if (Number.isFinite(numeric)) {
          totals[metric.key].value += numeric;
          totals[metric.key].hasValue = true;
        }
      }
    }

    return {
      totals,
      itemCount: latestItems.length,
    };
  }, [latestItems]);

  const formatQuantity = (value, fractionDigits = 0) => {
    if (value === null || value === undefined) {
      return "—";
    }
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return "—";
    }
    return numericValue.toLocaleString(undefined, {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
  };

  const formatDateValue = (value) => {
    if (!value) return "—";
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString();
    }
    if (typeof value === "string") {
      return value;
    }
    return "—";
  };

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

          {latestItems.length > 0 && (
            <Paper
              elevation={8}
              sx={{
                p: { xs: 3, md: 4 },
                borderRadius: 4,
                display: "flex",
                flexDirection: "column",
                gap: 3,
              }}
            >
              <Stack spacing={1}>
                <Typography variant="h5">Latest palletization summary</Typography>
                <Typography variant="body2" color="text.secondary">
                  Review the calculated pallet, weight and volume metrics returned by
                  the warehouse system for your submitted request.
                </Typography>
              </Stack>

              <Stack
                direction={{ xs: "column", md: "row" }}
                spacing={{ xs: 2, md: 6 }}
                flexWrap="wrap"
              >
                <Box>
                  <Typography variant="subtitle2" color="text.secondary">
                    Importer
                  </Typography>
                  <Typography variant="body1" fontWeight={600}>
                    {firstSubmittedItem.Importer ?? "—"}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="subtitle2" color="text.secondary">
                    Request date
                  </Typography>
                  <Typography variant="body1" fontWeight={600}>
                    {formatDateValue(firstSubmittedItem.RequestDate)}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="subtitle2" color="text.secondary">
                    Arrival date (Data Arritjes)
                  </Typography>
                  <Typography variant="body1" fontWeight={600}>
                    {formatDateValue(firstSubmittedItem.ArrivalDate)}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="subtitle2" color="text.secondary">
                    Articles included
                  </Typography>
                  <Typography variant="body1" fontWeight={600}>
                    {summaryTotals?.itemCount ?? 0}
                  </Typography>
                </Box>
              </Stack>

              {firstSubmittedItem.Comment && (
                <Stack spacing={0.5}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Shared note
                  </Typography>
                  <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                    {firstSubmittedItem.Comment}
                  </Typography>
                </Stack>
              )}

              {summaryTotals && (
                <Stack spacing={2}>
                  <Stack spacing={0.5}>
                    <Typography variant="subtitle1">Aggregated totals</Typography>
                    {summaryTotals.itemCount > 1 ? (
                      <Typography variant="body2" color="text.secondary">
                        Values below include every article submitted in the most
                        recent order.
                      </Typography>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        Values below describe the submitted article.
                      </Typography>
                    )}
                  </Stack>
                  <Grid container spacing={2}>
                    {SUMMARY_METRICS.filter(
                      (metric) => summaryTotals.totals[metric.key].hasValue
                    ).map((metric) => (
                      <Grid item xs={12} sm={6} md={4} key={metric.key}>
                        <Box
                          sx={{
                            p: 2,
                            borderRadius: 2,
                            border: "1px solid",
                            borderColor: "divider",
                            backgroundColor: "background.paper",
                          }}
                        >
                          <Typography variant="subtitle2" color="text.secondary">
                            {metric.label}
                          </Typography>
                          <Typography variant="h6">
                            {formatQuantity(
                              summaryTotals.totals[metric.key].value,
                              metric.fractionDigits
                            )}
                          </Typography>
                        </Box>
                      </Grid>
                    ))}
                  </Grid>
                </Stack>
              )}

              <Divider />

              <Stack spacing={1}>
                <Typography variant="subtitle1">Per-article breakdown</Typography>
                <TableContainer
                  component="div"
                  sx={{
                    overflowX: "auto",
                    borderRadius: 2,
                    border: "1px solid",
                    borderColor: "divider",
                  }}
                >
                  <Table size="small" stickyHeader aria-label="Palletization details">
                    <TableHead>
                      <TableRow>
                        {ITEM_COLUMNS.map((column) => (
                          <TableCell key={column.field} sx={{ whiteSpace: "nowrap" }}>
                            {column.label}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {latestItems.map((item) => (
                        <TableRow
                          key={item.ID ?? `${item.Article}-${item.BoxCount}`}
                          hover
                        >
                          {ITEM_COLUMNS.map((column) => {
                            const rawValue = item[column.field];
                            const content = column.format
                              ? column.format(rawValue, item)
                              : formatQuantity(rawValue, column.fractionDigits ?? 0);
                            return (
                              <TableCell key={column.field} sx={{ whiteSpace: "nowrap" }}>
                                {content}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Stack>
            </Paper>
          )}
        </Stack>
      </Container>
    </Box>
  );
}
