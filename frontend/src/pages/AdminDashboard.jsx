import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  AppBar,
  Badge,
  Box,
  Button,
  CircularProgress,
  Container,
  Divider,
  FormControl,
  InputLabel,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Toolbar,
  Typography,
} from "@mui/material";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { DateCalendar } from "@mui/x-date-pickers/DateCalendar";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { PickersDay } from "@mui/x-date-pickers/PickersDay";
import { format } from "date-fns";
import API from "../api";

const formatKey = (date) => format(date, "yyyy-MM-dd");

export default function AdminDashboard() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState(null);
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [userFeedback, setUserFeedback] = useState(null);
  const [updatingUser, setUpdatingUser] = useState(null);

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

  const loadUsers = async () => {
    setUsersLoading(true);
    setUserFeedback(null);
    try {
      const res = await API.get("/auth/users");
      setUsers(res.data);
    } catch (error) {
      setUserFeedback({
        severity: "error",
        message: "Unable to load the user directory right now.",
      });
    } finally {
      setUsersLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
    loadUsers();
  }, []);

  const handleRoleChange = async (username, newRole) => {
    const currentUser = users.find((user) => user.Username === username);
    if (!currentUser || currentUser.Role === newRole) {
      return;
    }

    setUserFeedback(null);
    setUpdatingUser(username);
    setUsers((prev) =>
      prev.map((user) =>
        user.Username === username ? { ...user, Role: newRole } : user
      )
    );

    try {
      await API.patch(`/auth/users/${encodeURIComponent(username)}`, {
        role: newRole,
      });
      setUserFeedback({
        severity: "success",
        message: `Updated ${username}'s role to ${newRole}.`,
      });
    } catch (error) {
      setUsers((prev) =>
        prev.map((user) =>
          user.Username === username ? { ...user, Role: currentUser.Role } : user
        )
      );
      setUserFeedback({
        severity: "error",
        message: "We couldn't update that role. Please try again.",
      });
    } finally {
      setUpdatingUser(null);
    }
  };

  const eventsByDate = useMemo(() => {
    const grouped = new Map();
    requests.forEach((request) => {
      if (!request.RequestDate) return;
      const date = new Date(request.RequestDate);
      if (Number.isNaN(date.getTime())) return;
      const key = formatKey(date);
      const existing = grouped.get(key) ?? [];
      existing.push(request);
      grouped.set(key, existing);
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
              Admin workspace
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Track approved import requests and anticipate upcoming arrivals.
            </Typography>
          </Box>
          <Button variant="contained" color="primary" onClick={logout}>
            Logout
          </Button>
        </Toolbar>
      </AppBar>

      <Container sx={{ flexGrow: 1, py: { xs: 4, md: 6 } }} maxWidth="lg">
        <Stack spacing={3}>
          {feedback && <Alert severity={feedback.severity}>{feedback.message}</Alert>}

          <Paper elevation={4} sx={{ p: { xs: 3, md: 5 } }}>
            <Stack spacing={4}>
              <Typography variant="h6">
                Confirmed arrivals overview
              </Typography>
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
                      <Typography variant="body2" color="text.secondary">
                        No confirmed arrivals scheduled for this day.
                      </Typography>
                    ) : (
                      <List dense>
                        {eventsForSelectedDate.map((request) => (
                          <ListItem key={request.ID} alignItems="flex-start">
                            <ListItemText
                              primary={`${request.Importer} · ${request.Article}`}
                              secondary={`Pallets: ${request.PalletCount ?? "N/A"} • Confirmed by ${request.ConfirmedBy ?? "Unknown"}`}
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
        </Stack>
      </Container>
      <Container sx={{ pb: { xs: 4, md: 6 } }} maxWidth="lg">
        <Paper elevation={4} sx={{ p: { xs: 3, md: 5 } }}>
          <Stack spacing={3}>
            <Box>
              <Typography variant="h6">User management</Typography>
              <Typography variant="body2" color="text.secondary">
                Adjust workspace permissions. Only administrators can change
                team member roles.
              </Typography>
            </Box>
            {userFeedback && (
              <Alert severity={userFeedback.severity}>{userFeedback.message}</Alert>
            )}
            {usersLoading ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                <CircularProgress color="primary" />
              </Box>
            ) : users.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No users found.
              </Typography>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>Username</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Role</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {users.map((user) => {
                      const labelId = `role-select-${encodeURIComponent(
                        user.Username
                      )}`;
                      return (
                        <TableRow key={user.Username}>
                          <TableCell>{user.Username}</TableCell>
                          <TableCell>
                            <FormControl size="small" fullWidth>
                              <InputLabel id={labelId}>Role</InputLabel>
                              <Select
                                labelId={labelId}
                                label="Role"
                                value={user.Role}
                                onChange={(event) =>
                                  handleRoleChange(
                                    user.Username,
                                    event.target.value
                                  )
                                }
                                disabled={updatingUser === user.Username}
                              >
                                <MenuItem value="requester">Requester</MenuItem>
                                <MenuItem value="confirmer">Confirmer</MenuItem>
                                <MenuItem value="admin">Admin</MenuItem>
                              </Select>
                            </FormControl>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Stack>
        </Paper>
      </Container>
    </Box>
  );
}
