import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Box,
  CircularProgress,
  Divider,
  List,
  ListItem,
  ListItemText,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { DateCalendar } from "@mui/x-date-pickers/DateCalendar";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { PickersDay } from "@mui/x-date-pickers/PickersDay";
import { alpha } from "@mui/material/styles";
import { format } from "date-fns";
import API from "../api";
import formatArticleCode from "../utils/formatArticle";

const formatKey = (date) => format(date, "yyyy-MM-dd");

const formatNumeric = (value, fractionDigits = 0) => {
  if (value === null || value === undefined) return "N/A";
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return "N/A";
  return numericValue.toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
};

const formatPercent = (value, fractionDigits = 1) => {
  if (value === null || value === undefined) return "N/A";
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return "N/A";
  return `${numericValue.toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })}%`;
};

const CalendarOverview = ({
  title = "Confirmed arrivals overview",
  description,
  sx,
}) => {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [confirmedRequests, setConfirmedRequests] = useState([]);
  const [wmsOrders, setWmsOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState(null);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await API.get("/imports/calendar");
      const confirmed = Array.isArray(res.data?.confirmedImports)
        ? res.data.confirmedImports
        : [];
      const wms = Array.isArray(res.data?.wmsOrders) ? res.data.wmsOrders : [];
      setConfirmedRequests(confirmed);
      setWmsOrders(wms);
    } catch (error) {
      setFeedback({
        severity: "error",
        message: "We couldn't load calendar data. Please retry shortly.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRequests();
    const refreshHandle = setInterval(() => {
      loadRequests();
    }, 5 * 60 * 1000);

    return () => {
      clearInterval(refreshHandle);
    };
  }, [loadRequests]);

  const confirmedByDate = useMemo(() => {
    const grouped = new Map();
    confirmedRequests.forEach((request) => {
      if (!request.ArrivalDate) return;

      const parsed = new Date(request.ArrivalDate);
      if (Number.isNaN(parsed.getTime())) {
        return;
      }

      const key = formatKey(parsed);
      const events = grouped.get(key) ?? [];
      events.push(request);
      grouped.set(key, events);
    });

    return grouped;
  }, [confirmedRequests]);

  const wmsByDate = useMemo(() => {
    const grouped = new Map();
    wmsOrders.forEach((order) => {
      if (!order.ArrivalDate) return;

      const parsed = new Date(order.ArrivalDate);
      if (Number.isNaN(parsed.getTime())) {
        return;
      }

      const key = formatKey(parsed);
      const events = grouped.get(key) ?? [];
      events.push(order);
      grouped.set(key, events);
    });

    return grouped;
  }, [wmsOrders]);

  const eventsForSelectedDate = useMemo(() => {
    if (!(selectedDate instanceof Date) || Number.isNaN(selectedDate.getTime())) {
      return { confirmed: [], wms: [] };
    }

    const key = formatKey(selectedDate);
    return {
      confirmed: confirmedByDate.get(key) ?? [],
      wms: wmsByDate.get(key) ?? [],
    };
  }, [confirmedByDate, selectedDate, wmsByDate]);

  const hasEventsForSelectedDate = useMemo(() => {
    return (
      eventsForSelectedDate.confirmed.length > 0 ||
      eventsForSelectedDate.wms.length > 0
    );
  }, [eventsForSelectedDate]);

  const formattedSelectedDate = useMemo(() => {
    if (!(selectedDate instanceof Date) || Number.isNaN(selectedDate.getTime())) {
      return "Select a date";
    }

    return format(selectedDate, "MMMM d, yyyy");
  }, [selectedDate]);

  const renderDay = (dayProps) => {
    const { day, selectedDay, outsideCurrentMonth } = dayProps;
    if (!(day instanceof Date) || Number.isNaN(day.getTime())) {
      return <PickersDay {...dayProps} />;
    }

    const key = formatKey(day);
    const confirmedEvents = confirmedByDate.get(key) ?? [];
    const wmsEvents = wmsByDate.get(key) ?? [];
    const confirmedCount = confirmedEvents.length;
    const wmsCount = wmsEvents.length;
    const hasConfirmed = confirmedCount > 0;
    const hasWms = wmsCount > 0;

    let dayNode = (
      <PickersDay
        {...dayProps}
        selected={selectedDay}
        outsideCurrentMonth={outsideCurrentMonth}
        sx={{
          borderRadius: "14px",
          border: (theme) => {
            if (hasWms) {
              return `1px solid ${alpha(theme.palette.error.main, 0.6)}`;
            }
            if (hasConfirmed) {
              return `1px solid ${alpha(theme.palette.success.main, 0.5)}`;
            }
            return undefined;
          },
          backgroundColor: (theme) => {
            if (hasWms && hasConfirmed) {
              return alpha(theme.palette.warning.main, 0.15);
            }
            if (hasWms) {
              return alpha(theme.palette.error.main, 0.1);
            }
            if (hasConfirmed) {
              return alpha(theme.palette.success.main, 0.12);
            }
            return undefined;
          },
        }}
      />
    );

    if (hasWms) {
      dayNode = (
        <Badge
          overlap="circular"
          color="error"
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          badgeContent={wmsCount}
          sx={{
            "& .MuiBadge-badge": {
              fontSize: 11,
              height: 20,
              minWidth: 20,
            },
          }}
        >
          {dayNode}
        </Badge>
      );
    }

    if (hasConfirmed) {
      dayNode = (
        <Badge
          overlap="circular"
          color="success"
          anchorOrigin={{ vertical: "top", horizontal: "right" }}
          badgeContent={confirmedCount}
          sx={{
            "& .MuiBadge-badge": {
              fontSize: 11,
              height: 20,
              minWidth: 20,
            },
          }}
        >
          {dayNode}
        </Badge>
      );
    }

    return dayNode;
  };

  return (
    <Paper
      elevation={12}
      sx={{
        p: { xs: 3, md: 5 },
        borderRadius: 4,
        background: (theme) =>
          `linear-gradient(160deg, ${theme.palette.background.paper} 0%, ${alpha(theme.palette.primary.main, 0.06)} 100%)`,
        border: (theme) => `1px solid ${alpha(theme.palette.primary.main, 0.08)}`,
        ...(sx ?? {}),
      }}
    >
      <Stack spacing={4}>
        <Box>
          <Typography variant="h6">{title}</Typography>
          {description && (
            <Typography variant="body2" color="text.secondary">
              {description}
            </Typography>
          )}
        </Box>

        {feedback && <Alert severity={feedback.severity}>{feedback.message}</Alert>}

        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress color="primary" />
          </Box>
        ) : (
          <Stack direction={{ xs: "column", md: "row" }} spacing={4} alignItems="stretch">
            <LocalizationProvider dateAdapter={AdapterDateFns}>
              <DateCalendar
                value={selectedDate}
                onChange={(value) => value && setSelectedDate(value)}
                slots={{ day: renderDay }}
                sx={{
                  borderRadius: 4,
                  p: 2,
                  "& .MuiPickersCalendarHeader-label": {
                    fontWeight: 600,
                  },
                  "& .MuiDayCalendar-weekDayLabel": {
                    fontWeight: 500,
                  },
                }}
              />
            </LocalizationProvider>

            <Box sx={{ flexGrow: 1 }}>
              <Typography variant="subtitle1" gutterBottom>
                {formattedSelectedDate}
              </Typography>
              <Divider sx={{ mb: 2 }} />
              {!hasEventsForSelectedDate ? (
                <Typography variant="body2" color="text.secondary">
                  No arrivals scheduled for this day.
                </Typography>
              ) : (
                <Stack spacing={3}>
                  {eventsForSelectedDate.wms.length > 0 && (
                    <Box>
                      <Typography
                        variant="subtitle2"
                        color="error.main"
                        sx={{ mb: 1 }}
                      >
                        WMS arrivals ({eventsForSelectedDate.wms.length})
                      </Typography>
                      <List dense sx={{ p: 0 }}>
                        {eventsForSelectedDate.wms.map((order, index) => (
                          <ListItem
                            key={`wms-${
                              order.NarID ??
                              order.OrderNumber ??
                              `${index}-${order.Article ?? "order"}`
                            }`}
                            alignItems="flex-start"
                            sx={{
                              borderRadius: 3,
                              mb: 1.5,
                              backgroundColor: (theme) =>
                                alpha(theme.palette.error.main, 0.08),
                              border: (theme) =>
                                `1px solid ${alpha(theme.palette.error.main, 0.25)}`,
                            }}
                          >
                            <ListItemText
                              primary={`${
                                order.Importer ?? "Unknown importer"
                              } · ${
                                order.OrderNumber
                                  ? `Order ${order.OrderNumber}`
                                  : `NarID ${order.NarID ?? "N/A"}`
                              }`}
                              secondary={(() => {
                                const arrivalDate = (() => {
                                  if (!order.ArrivalDate) return "N/A";
                                  const parsed = new Date(order.ArrivalDate);
                                  if (Number.isNaN(parsed.getTime())) {
                                    return order.ArrivalDate;
                                  }
                                  return format(parsed, "MMMM d, yyyy");
                                })();

                                const sourceUpdated = (() => {
                                  if (!order.SourceUpdatedAt) return null;
                                  const parsed = new Date(order.SourceUpdatedAt);
                                  if (Number.isNaN(parsed.getTime())) {
                                    return order.SourceUpdatedAt;
                                  }
                                  return format(parsed, "MMMM d, yyyy HH:mm");
                                })();

                                const details = [
                                  `Arrival: ${arrivalDate}`,
                                  order.Article
                                    ? `Article: ${formatArticleCode(order.Article)}`
                                    : null,
                                  order.ArticleDescription
                                    ? `Description: ${order.ArticleDescription}`
                                    : null,
                                  `Boxes: ${formatNumeric(order.BoxCount)}`,
                                  `Pallets: ${formatNumeric(order.PalletCount)}`,
                                  sourceUpdated
                                    ? `Source updated: ${sourceUpdated}`
                                    : null,
                                ].filter(Boolean);

                                if (!order.Comment) {
                                  return details.join(" • ");
                                }

                                return (
                                  <span>
                                    {details.join(" • ")}
                                    <br />
                                    <span style={{ whiteSpace: "pre-wrap" }}>
                                      Note: {order.Comment}
                                    </span>
                                  </span>
                                );
                              })()}
                            />
                          </ListItem>
                        ))}
                      </List>
                    </Box>
                  )}

                  {eventsForSelectedDate.confirmed.length > 0 && (
                    <Box>
                      <Typography
                        variant="subtitle2"
                        color="success.main"
                        sx={{ mb: 1 }}
                      >
                        Confirmed import requests (
                        {eventsForSelectedDate.confirmed.length})
                      </Typography>
                      <List dense sx={{ p: 0 }}>
                        {eventsForSelectedDate.confirmed.map((request) => (
                          <ListItem
                            key={request.ID}
                            alignItems="flex-start"
                            sx={{
                              borderRadius: 3,
                              mb: 1.5,
                              backgroundColor: (theme) =>
                                alpha(theme.palette.success.main, 0.08),
                              border: (theme) =>
                                `1px solid ${alpha(theme.palette.success.main, 0.2)}`,
                            }}
                          >
                            <ListItemText
                              primary={`${request.Importer} · ${formatArticleCode(
                                request.Article
                              )}`}
                              secondary={(() => {
                                const requestDate = (() => {
                                  if (!request.RequestDate) return "N/A";
                                  const parsed = new Date(request.RequestDate);
                                  if (Number.isNaN(parsed.getTime())) {
                                    return request.RequestDate;
                                  }
                                  return format(parsed, "MMMM d, yyyy");
                                })();

                                const arrivalDate = (() => {
                                  if (!request.ArrivalDate) return "N/A";
                                  const parsed = new Date(request.ArrivalDate);
                                  if (Number.isNaN(parsed.getTime())) {
                                    return request.ArrivalDate;
                                  }
                                  return format(parsed, "MMMM d, yyyy");
                                })();

                                const details = [
                                  `Arrival: ${arrivalDate}`,
                                  `Boxes: ${formatNumeric(request.BoxCount)}`,
                                  `Pallets: ${formatNumeric(request.PalletCount)}`,
                                  `Full pallets: ${formatNumeric(request.FullPallets, 2)}`,
                                  `Remaining boxes: ${formatNumeric(request.RemainingBoxes)}`,
                                  `Total weight (kg): ${formatNumeric(
                                    request.TotalShipmentWeightKg,
                                    2
                                  )}`,
                                  `Total volume (m³): ${formatNumeric(
                                    request.TotalShipmentVolumeM3,
                                    3
                                  )}`,
                                  `Utilization: ${formatPercent(
                                    request.PalletVolumeUtilization
                                  )}`,
                                  `Request date: ${requestDate}`,
                                  `Confirmed by ${request.ConfirmedBy ?? "Unknown"}`,
                                ].join(" • ");

                                if (!request.Comment) {
                                  return details;
                                }

                                return (
                                  <span>
                                    {details}
                                    <br />
                                    <span style={{ whiteSpace: "pre-wrap" }}>
                                      Note: {request.Comment}
                                    </span>
                                  </span>
                                );
                              })()}
                            />
                          </ListItem>
                        ))}
                      </List>
                    </Box>
                  )}
                </Stack>
              )}
            </Box>
          </Stack>
        )}
      </Stack>
    </Paper>
  );
};

export default CalendarOverview;
