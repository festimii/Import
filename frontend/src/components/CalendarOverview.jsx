import { useEffect, useMemo, useState } from "react";
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
import { format } from "date-fns";
import API from "../api";
import formatArticleCode from "../utils/formatArticle";

const formatKey = (date) => format(date, "yyyy-MM-dd");

const CalendarOverview = ({
  title = "Confirmed arrivals overview",
  description,
  sx,
}) => {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState(null);

  const loadRequests = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await API.get("/imports/confirmed");
      setRequests(res.data);
    } catch (error) {
      setFeedback({
        severity: "error",
        message: "We couldn't load confirmed arrivals. Please retry shortly.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const eventsByDate = useMemo(() => {
    const grouped = new Map();
    requests.forEach((request) => {
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
  }, [requests]);

  const eventsForSelectedDate = useMemo(() => {
    if (!(selectedDate instanceof Date) || Number.isNaN(selectedDate.getTime())) {
      return [];
    }

    const key = formatKey(selectedDate);
    return eventsByDate.get(key) ?? [];
  }, [eventsByDate, selectedDate]);

  const formattedSelectedDate = useMemo(() => {
    if (!(selectedDate instanceof Date) || Number.isNaN(selectedDate.getTime())) {
      return "Select a date";
    }

    return format(selectedDate, "MMMM d, yyyy");
  }, [selectedDate]);

  const renderDay = (dayProps) => {
    const { day } = dayProps;
    if (!(day instanceof Date) || Number.isNaN(day.getTime())) {
      return <PickersDay {...dayProps} />;
    }

    const key = formatKey(day);
    const events = eventsByDate.get(key) ?? [];
    const showBadge = events.length > 0;

    return (
      <Badge
        overlap="circular"
        color="secondary"
        badgeContent={showBadge ? events.length : undefined}
      >
        <PickersDay {...dayProps} />
      </Badge>
    );
  };

  return (
    <Paper
      elevation={6}
      sx={{
        p: { xs: 3, md: 5 },
        borderRadius: 4,
        background: (theme) =>
          `linear-gradient(140deg, ${theme.palette.background.paper} 60%, ${theme.palette.primary.light}0f 100%)`,
        border: (theme) => `1px solid ${theme.palette.primary.main}14`,
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
          <Stack direction={{ xs: "column", md: "row" }} spacing={4}>
            <LocalizationProvider dateAdapter={AdapterDateFns}>
              <DateCalendar
                value={selectedDate}
                onChange={(value) => value && setSelectedDate(value)}
                slots={{ day: renderDay }}
              />
            </LocalizationProvider>

            <Box sx={{ flexGrow: 1 }}>
              <Typography variant="subtitle1" gutterBottom>
                {formattedSelectedDate}
              </Typography>
              <Divider sx={{ mb: 2 }} />
              {eventsForSelectedDate.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 420 }}>
                  No confirmed arrivals scheduled for this day.
                </Typography>
              ) : (
                <List dense sx={{ borderRadius: 3, backgroundColor: "rgba(27,75,145,0.04)" }}>
                  {eventsForSelectedDate.map((request) => (
                    <ListItem key={request.ID} alignItems="flex-start">
                      <ListItemText
                        primary={`${request.Importer} · ${formatArticleCode(request.Article)}`}
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

                          return `Arrival: ${arrivalDate} • Pallets: ${
                            request.PalletCount ?? "N/A"
                          } • Request date: ${requestDate} • Confirmed by ${
                            request.ConfirmedBy ?? "Unknown"
                          }`;
                        })()}
                      />
                    </ListItem>
                  ))}
                </List>
              )}
            </Box>
          </Stack>
        )}
      </Stack>
    </Paper>
  );
};

export default CalendarOverview;
