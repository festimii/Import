import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Divider,
  Grid,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { BarChart, LineChart } from "@mui/x-charts";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import VerifiedUserRoundedIcon from "@mui/icons-material/VerifiedUserRounded";
import EventBusyRoundedIcon from "@mui/icons-material/EventBusyRounded";
import ChecklistRoundedIcon from "@mui/icons-material/ChecklistRounded";
import EventAvailableRoundedIcon from "@mui/icons-material/EventAvailableRounded";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import NotificationsActiveRoundedIcon from "@mui/icons-material/NotificationsActiveRounded";
import API from "../api";
import UserManagementDialog from "../components/UserManagementDialog";
import CalendarOverview from "../components/CalendarOverview";
import PageHero from "../components/PageHero";
import StatCard from "../components/StatCard";
import NotificationPermissionBanner from "../components/NotificationPermissionBanner";
import NotificationCenter from "../components/NotificationCenter";
import SectionCard from "../components/SectionCard";

export default function AdminDashboard() {
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [userFeedback, setUserFeedback] = useState(null);
  const [updatingUser, setUpdatingUser] = useState(null);
  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
  const [importMetrics, setImportMetrics] = useState(null);
  const [importMetricsLoading, setImportMetricsLoading] = useState(true);
  const [importMetricsFeedback, setImportMetricsFeedback] = useState(null);
  const [approvedRequests, setApprovedRequests] = useState([]);
  const [approvedLoading, setApprovedLoading] = useState(true);
  const [approvedFeedback, setApprovedFeedback] = useState(null);
  const notificationCenterRef = useRef(null);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [arrivalFilter, setArrivalFilter] = useState("");
  const [showMonthlyTable, setShowMonthlyTable] = useState(false);
  const theme = useTheme();

  const monthlyRequests = useMemo(
    () => importMetrics?.monthlyRequests ?? [],
    [importMetrics]
  );

  const topArticleGroups = useMemo(() => {
    const groups = importMetrics?.articleGroups ?? [];
    return groups.slice(0, 8);
  }, [importMetrics]);

  const loadImportMetrics = async () => {
    setImportMetricsLoading(true);
    setImportMetricsFeedback(null);
    try {
      const res = await API.get("/imports/metrics");
      setImportMetrics(res.data);
    } catch (error) {
      setImportMetricsFeedback({
        severity: "error",
        message: "Unable to load import metrics right now.",
      });
    } finally {
      setImportMetricsLoading(false);
    }
  };

  const loadApprovedRequests = async () => {
    setApprovedLoading(true);
    setApprovedFeedback(null);
    try {
      const res = await API.get("/imports/confirmed");
      const sorted = [...res.data].sort((a, b) => {
        const dateA = a.ArrivalDate ? new Date(a.ArrivalDate).getTime() : 0;
        const dateB = b.ArrivalDate ? new Date(b.ArrivalDate).getTime() : 0;
        return dateB - dateA;
      });
      setApprovedRequests(sorted);
    } catch (error) {
      setApprovedFeedback({
        severity: "error",
        message: "Unable to load confirmed import details right now.",
      });
    } finally {
      setApprovedLoading(false);
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
    loadUsers();
    loadImportMetrics();
    loadApprovedRequests();
  }, []);

  useEffect(() => {
    if (isUserDialogOpen) {
      loadUsers();
    }
  }, [isUserDialogOpen]);

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
          user.Username === username
            ? { ...user, Role: currentUser.Role }
            : user
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

  const logout = () => {
    localStorage.clear();
    window.location.reload();
  };

  const formatDate = (value) => {
    if (!value) return "â€”";
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString();
    }
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
    return "â€”";
  };

  const formatQuantity = (value, fractionDigits = 0) => {
    if (value === null || value === undefined) return "â€”";
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return "â€”";
    return numericValue.toLocaleString(undefined, {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
  };

  const handleOpenUserDialog = () => {
    setUserFeedback(null);
    setIsUserDialogOpen(true);
  };

  const handleCloseUserDialog = () => {
    setIsUserDialogOpen(false);
    setUserFeedback(null);
  };

  const { totalUsers, confirmerCount, requesterCount } = useMemo(() => {
    const total = users.length;
    const counts = users.reduce(
      (acc, user) => {
        if (user.Role === "confirmer") acc.confirmer += 1;
        if (user.Role === "requester") acc.requester += 1;
        return acc;
      },
      { confirmer: 0, requester: 0 }
    );

    return {
      totalUsers: total,
      confirmerCount: counts.confirmer,
      requesterCount: counts.requester,
    };
  }, [users]);

  const formatNumber = (value) => {
    if (value === null || value === undefined) return "â€”";
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return "â€”";
    return numeric.toLocaleString();
  };

  const approvedGroups = useMemo(() => {
    if (!approvedRequests.length) return [];

    const map = new Map();

    const normalizeDate = (value) => {
      if (!value) return "";
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString().split("T")[0];
      }
      return String(value);
    };

    for (const request of approvedRequests) {
      const key = [
        request.Requester ?? "",
        request.Importer ?? "",
        normalizeDate(request.RequestDate),
        (request.Comment ?? "").trim(),
      ].join("|#|");

      if (!map.has(key)) {
        map.set(key, {
          id: key,
          reference: request.ID,
          importer: request.Importer,
          requester: request.Requester,
          requestDate: request.RequestDate,
          items: [],
          totalBoxes: 0,
          totalPallets: 0,
          totalFullPallets: 0,
          totalRemainingBoxes: 0,
          totalShipmentWeightKg: 0,
          totalShipmentVolumeM3: 0,
          totalWeightFullPalletsKg: 0,
          totalVolumeFullPalletsM3: 0,
          totalWeightRemainingKg: 0,
          totalVolumeRemainingM3: 0,
          comments: [],
          sharedArrivalDate: null,
          arrivalDateConflict: false,
        });
      }

      const group = map.get(key);
      group.items.push(request);

      const boxes = Number(request.BoxCount);
      if (Number.isFinite(boxes)) {
        group.totalBoxes += boxes;
      }

      const pallets = Number(request.PalletCount);
      if (Number.isFinite(pallets)) {
        group.totalPallets += pallets;
      }

      const fullPallets = Number(request.FullPallets);
      if (Number.isFinite(fullPallets)) {
        group.totalFullPallets += fullPallets;
      }

      const remainingBoxes = Number(request.RemainingBoxes);
      if (Number.isFinite(remainingBoxes)) {
        group.totalRemainingBoxes += remainingBoxes;
      }

      const totalShipmentWeight = Number(request.TotalShipmentWeightKg);
      if (Number.isFinite(totalShipmentWeight)) {
        group.totalShipmentWeightKg += totalShipmentWeight;
      }

      const totalShipmentVolume = Number(request.TotalShipmentVolumeM3);
      if (Number.isFinite(totalShipmentVolume)) {
        group.totalShipmentVolumeM3 += totalShipmentVolume;
      }

      const weightFullPallets = Number(request.WeightFullPalletsKg);
      if (Number.isFinite(weightFullPallets)) {
        group.totalWeightFullPalletsKg += weightFullPallets;
      }

      const volumeFullPallets = Number(request.VolumeFullPalletsM3);
      if (Number.isFinite(volumeFullPallets)) {
        group.totalVolumeFullPalletsM3 += volumeFullPallets;
      }

      const weightRemaining = Number(request.WeightRemainingKg);
      if (Number.isFinite(weightRemaining)) {
        group.totalWeightRemainingKg += weightRemaining;
      }

      const volumeRemaining = Number(request.VolumeRemainingM3);
      if (Number.isFinite(volumeRemaining)) {
        group.totalVolumeRemainingM3 += volumeRemaining;
      }

      const trimmedComment = (request.Comment || "").trim();
      if (trimmedComment && !group.comments.includes(trimmedComment)) {
        group.comments.push(trimmedComment);
      }

      if (!group.sharedArrivalDate && request.ArrivalDate) {
        group.sharedArrivalDate = request.ArrivalDate;
      } else if (
        group.sharedArrivalDate &&
        request.ArrivalDate &&
        new Date(group.sharedArrivalDate).getTime() !==
          new Date(request.ArrivalDate).getTime()
      ) {
        group.sharedArrivalDate = null;
        group.arrivalDateConflict = true;
      }
    }

    const toDate = (value) => {
      if (!value) return 0;
      const parsed = new Date(value);
      const timestamp = parsed.getTime();
      return Number.isNaN(timestamp) ? 0 : timestamp;
    };

    return Array.from(map.values()).sort((a, b) => {
      const dateA = a.sharedArrivalDate
        ? toDate(a.sharedArrivalDate)
        : toDate(a.requestDate);
      const dateB = b.sharedArrivalDate
        ? toDate(b.sharedArrivalDate)
        : toDate(b.requestDate);
      return dateB - dateA;
    });
  }, [approvedRequests]);

  const filteredApprovedGroups = useMemo(() => {
    if (!arrivalFilter) {
      return approvedGroups;
    }

    return approvedGroups.filter((group) => {
      const dateValue = group.sharedArrivalDate ?? group.requestDate ?? "";
      if (typeof dateValue !== "string") {
        return false;
      }
      return dateValue.startsWith(arrivalFilter);
    });
  }, [arrivalFilter, approvedGroups]);

  const displayedApprovedGroups = filteredApprovedGroups.slice(0, 5);

  const capacityChips = useMemo(() => {
    if (importMetricsLoading) {
      return [];
    }

    const chips = [];

    const pushNumberChip = (label, rawValue) => {
      const numeric = Number(rawValue);
      if (!Number.isFinite(numeric) || numeric === 0) {
        return;
      }
      chips.push({ label, value: formatNumber(numeric) });
    };

    pushNumberChip("Total boxes", importMetrics?.totalBoxes);
    pushNumberChip("Total pallets", importMetrics?.totalPallets);

    const avgBoxes = formatQuantity(importMetrics?.averageBoxes, 2);
    if (avgBoxes !== "—") {
      chips.push({ label: "Avg. boxes / request", value: `${avgBoxes} boxes` });
    }

    const avgPallets = formatQuantity(importMetrics?.averagePallets, 2);
    if (avgPallets !== "—") {
      chips.push({
        label: "Avg. pallets / request",
        value: `${avgPallets} pallets`,
      });
    }

    const total = Number(importMetrics?.totalRequests ?? 0);
    const approved = Number(importMetrics?.approvedCount ?? 0);
    if (total > 0 && Number.isFinite(approved)) {
      chips.push({
        label: "Approval ratio",
        value: `${Math.round((approved / total) * 100)}%`,
      });
    }

    return chips;
  }, [importMetrics, importMetricsLoading]);

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <PageHero
        title="Admin workspace"
        subtitle="Track approved import requests, anticipate arrivals and curate role-based access for every collaborator."
        actions={
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <Button
              variant="outlined"
              color="inherit"
              onClick={handleOpenUserDialog}
            >
              Manage users
            </Button>
            <Button variant="contained" color="secondary" onClick={logout}>
              Logout
            </Button>
          </Stack>
        }
      >
        <Stack spacing={1.5} sx={{ color: "inherit" }}>
          <Typography variant="subtitle2" sx={{ opacity: 0.8 }}>
            Governance snapshot
          </Typography>
          <Typography variant="body1">
            Keep access aligned with responsibilities and consult the shared
            arrival calendar to inform stakeholders.
          </Typography>
        </Stack>
      </PageHero>

      <Container sx={{ flexGrow: 1, py: { xs: 4, md: 6 } }} maxWidth="lg">
        <Stack spacing={4}>
          <SectionCard
            title="Live notifications"
            description="Receive instant alerts when approvers update requests or propose new arrival dates."
            variant="minimal"
          >
            <Stack spacing={2}>
              <NotificationPermissionBanner
                onEnabled={() => notificationCenterRef.current?.reload()}
              />
              <NotificationCenter
                ref={notificationCenterRef}
                onUnreadCountChange={setUnreadNotifications}
                onLoadingChange={setNotificationsLoading}
                description="Receive instant alerts when approvers update requests or propose new arrival dates."
                emptyMessage="No unread updates at the moment."
              />
            </Stack>
          </SectionCard>
          <SectionCard
            title="Organization health"
            description="Monitor how many users can submit, confirm or administer requests."
            action={
              <Button variant="outlined" onClick={handleOpenUserDialog}>
                Manage users
              </Button>
            }
            variant="minimal"
          >
            {userFeedback && (
              <Alert severity={userFeedback.severity}>{userFeedback.message}</Alert>
            )}
            <Grid container spacing={3}>
              <Grid item xs={12} md={4}>
                <StatCard
                  icon={<GroupsRoundedIcon />}
                  label="Active users"
                  value={usersLoading ? "â€¦" : totalUsers}
                  trend="Invite colleagues to streamline handoffs"
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <StatCard
                  icon={<VerifiedUserRoundedIcon />}
                  label="Confirmers"
                  value={usersLoading ? "â€¦" : confirmerCount}
                  trend="Ensure every lane has an approval owner"
                  color="secondary"
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <StatCard
                  icon={<EventBusyRoundedIcon />}
                  label="Requesters"
                  value={usersLoading ? "â€¦" : requesterCount}
                  trend="Balance intake across teams"
                  color="info"
                />
              </Grid>
            </Grid>
          </SectionCard>

          <SectionCard
            title="Import operations snapshot"
            description="Track request volume, approvals and near-term arrivals at a glance."
            variant="minimal"
          >
            {importMetricsFeedback && (
              <Alert severity={importMetricsFeedback.severity}>
                {importMetricsFeedback.message}
              </Alert>
            )}
            <Grid container spacing={3}>
              <Grid item xs={12} sm={6} lg={3}>
                <StatCard
                  icon={<NotificationsActiveRoundedIcon />}
                  label="Unread updates"
                  value={notificationsLoading ? "..." : unreadNotifications}
                  trend="Review new approvals and changes from your team"
                />
              </Grid>
              <Grid item xs={12} sm={6} lg={3}>
                <StatCard
                  icon={<ChecklistRoundedIcon />}
                  label="Total requests"
                  value={
                    importMetricsLoading ? "..." : importMetrics?.totalRequests ?? 0
                  }
                  trend="All submissions recorded in the system"
                />
              </Grid>
              <Grid item xs={12} sm={6} lg={3}>
                <StatCard
                  icon={<EventAvailableRoundedIcon />}
                  label="Approved"
                  value={
                    importMetricsLoading ? "..." : importMetrics?.approvedCount ?? 0
                  }
                  trend="Confirmed arrivals awaiting execution"
                  color="secondary"
                />
              </Grid>
              <Grid item xs={12} sm={6} lg={3}>
                <StatCard
                  icon={<CalendarMonthRoundedIcon />}
                  label="Arrivals this week"
                  value={
                    importMetricsLoading ? "..." : importMetrics?.upcomingWeek ?? 0
                  }
                  trend="Approved deliveries in the next seven days"
                  color="warning"
                />
              </Grid>
            </Grid>
            {capacityChips.length > 0 && (
              <Stack
                direction={{ xs: "column", md: "row" }}
                spacing={1}
                useFlexGap
                flexWrap="wrap"
                sx={{ mt: 2 }}
              >
                {capacityChips.map((chip) => (
                  <Chip
                    key={chip.label}
                    label={`${chip.label}: ${chip.value}`}
                    size="small"
                    variant="outlined"
                  />
                ))}
              </Stack>
            )}
          </SectionCard>


          <SectionCard
            title="Monthly request trend"
            description="Compare intake volume, box totals and pallet totals month over month."
            variant="minimal"
            action={
              monthlyRequests.length > 0 && (
                <Button
                  size="small"
                  onClick={() => setShowMonthlyTable((previous) => !previous)}
                >
                  {showMonthlyTable ? "Hide data table" : "Show data table"}
                </Button>
              )
            }
          >
            {importMetricsLoading ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
                <CircularProgress color="primary" />
              </Box>
            ) : monthlyRequests.length ? (
              <Stack spacing={3}>
                <LineChart
                  height={320}
                  series={[
                    {
                      id: "requests",
                      label: "Requests",
                      data: monthlyRequests.map(
                        (entry) => entry.requestCount ?? 0
                      ),
                      color: theme.palette.primary.main,
                      curve: "monotoneX",
                    },
                    {
                      id: "boxes",
                      label: "Boxes",
                      data: monthlyRequests.map((entry) => entry.boxTotal ?? 0),
                      color: theme.palette.secondary.main,
                      curve: "monotoneX",
                    },
                    {
                      id: "pallets",
                      label: "Pallets",
                      data: monthlyRequests.map(
                        (entry) => entry.palletTotal ?? 0
                      ),
                      color: theme.palette.info.main,
                      curve: "monotoneX",
                    },
                  ]}
                  xAxis={[
                    {
                      scaleType: "band",
                      data: monthlyRequests.map((entry) => entry.month),
                    },
                  ]}
                  margin={{ top: 40, left: 60, right: 20, bottom: 40 }}
                  slotProps={{
                    legend: {
                      direction: "row",
                      position: { vertical: "top", horizontal: "right" },
                    },
                  }}
                />
                {showMonthlyTable && (
                  <>
                    <Divider />
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 600 }}>Month</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 600 }}>
                            Requests
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 600 }}>
                            Boxes
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 600 }}>
                            Pallets
                          </TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {monthlyRequests.map((entry) => (
                          <TableRow key={entry.month} hover>
                            <TableCell>{entry.month}</TableCell>
                            <TableCell align="right">
                              {entry.requestCount}
                            </TableCell>
                            <TableCell align="right">{entry.boxTotal}</TableCell>
                            <TableCell align="right">{entry.palletTotal}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </>
                )}
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No historical data available yet. New submissions will populate
                this view automatically.
              </Typography>
            )}
          </SectionCard>

          <SectionCard
            title="Top articles by volume"
            description="Understand which articles dominate requests to align warehouse capacity and approvals."
            variant="minimal"
          >
            {importMetricsLoading ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
                <CircularProgress color="primary" />
              </Box>
            ) : topArticleGroups.length ? (
              <Stack spacing={3}>
                <BarChart
                  height={360}
                  xAxis={[
                    {
                      scaleType: "band",
                      data: topArticleGroups.map((entry) => entry.article),
                    },
                  ]}
                  series={[
                    {
                      id: "boxes",
                      label: "Boxes",
                      data: topArticleGroups.map((entry) => entry.boxTotal ?? 0),
                      color: theme.palette.primary.main,
                    },
                    {
                      id: "pallets",
                      label: "Pallets",
                      data: topArticleGroups.map(
                        (entry) => entry.palletTotal ?? 0
                      ),
                      color: theme.palette.secondary.main,
                    },
                  ]}
                  margin={{ top: 40, left: 60, right: 20, bottom: 80 }}
                  slotProps={{
                    legend: {
                      direction: "row",
                      position: { vertical: "top", horizontal: "right" },
                    },
                  }}
                />
                <Divider />
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>Article</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>
                        Requests
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>
                        Approved
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>
                        Boxes
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>
                        Pallets
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {topArticleGroups.map((entry) => (
                      <TableRow key={entry.article} hover>
                        <TableCell>{entry.article}</TableCell>
                        <TableCell align="right">
                          {entry.requestCount}
                        </TableCell>
                        <TableCell align="right">
                          {entry.approvedCount}
                        </TableCell>
                        <TableCell align="right">{entry.boxTotal}</TableCell>
                        <TableCell align="right">
                          {entry.palletTotal}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No aggregated article insights are available yet. Once multiple
                requests are submitted this section will highlight trends
                automatically.
              </Typography>
            )}
          </SectionCard>

          <SectionCard
            title="Confirmed import registry"
            description="Review approved requests in detail and reopen the record when you need the underlying article breakdown."
            action={
              <TextField
                label="Filter by arrival date"
                type="date"
                size="small"
                value={arrivalFilter}
                onChange={(event) => setArrivalFilter(event.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            }
            secondaryAction={
              arrivalFilter ? (
                <Button size="small" onClick={() => setArrivalFilter("")}>
                  Clear
                </Button>
              ) : null
            }
            variant="minimal"
          >
            {approvedFeedback && (
              <Alert severity={approvedFeedback.severity}>
                {approvedFeedback.message}
              </Alert>
            )}
            {approvedLoading ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
                <CircularProgress color="primary" />
              </Box>
            ) : displayedApprovedGroups.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                {arrivalFilter
                  ? "No confirmed imports match this date."
                  : "No confirmed imports are available yet."}
              </Typography>
            ) : (
              <Stack spacing={2.5}>
                {displayedApprovedGroups.map((group) => {
                  const arrivalLabel = group.arrivalDateConflict
                    ? "Multiple dates"
                    : formatDate(group.sharedArrivalDate ?? group.requestDate);
                  return (
                    <Box
                      key={group.id}
                      sx={{
                        p: { xs: 2.5, md: 3 },
                        borderRadius: 3,
                        border: (theme) => `1px solid ${theme.palette.divider}`,
                        backgroundColor: (theme) => theme.palette.background.paper,
                      }}
                    >
                      <Stack spacing={1.5}>
                        <Stack
                          direction={{ xs: "column", md: "row" }}
                          spacing={1.5}
                          alignItems={{ md: "center" }}
                        >
                          <Stack spacing={0.25}>
                            <Typography variant="subtitle1">
                              {group.importer ?? "Unknown importer"}
                            </Typography>
                            {group.requester && (
                              <Typography variant="caption" color="text.secondary">
                                Requested by {group.requester}
                              </Typography>
                            )}
                          </Stack>
                          <Chip
                            label={`${group.items.length} article${
                              group.items.length === 1 ? "" : "s"
                            }`}
                            size="small"
                            sx={{ ml: { md: "auto" } }}
                          />
                        </Stack>
                        <Grid container spacing={2} columns={12}>
                          <Grid item xs={12} sm={4}>
                            <Stack spacing={0.25}>
                              <Typography variant="caption" color="text.secondary">
                                Arrival
                              </Typography>
                              <Typography variant="body1">{arrivalLabel}</Typography>
                            </Stack>
                          </Grid>
                          <Grid item xs={12} sm={4}>
                            <Stack spacing={0.25}>
                              <Typography variant="caption" color="text.secondary">
                                Request date
                              </Typography>
                              <Typography variant="body1">
                                {formatDate(group.requestDate)}
                              </Typography>
                            </Stack>
                          </Grid>
                          <Grid item xs={12} sm={4}>
                            <Stack spacing={0.25}>
                              <Typography variant="caption" color="text.secondary">
                                Boxes / pallets
                              </Typography>
                              <Typography variant="body1">
                                {`${formatQuantity(group.totalBoxes)} boxes · ${formatQuantity(group.totalPallets)} pallets`}
                              </Typography>
                            </Stack>
                          </Grid>
                        </Grid>
                        {group.comments.length > 0 && (
                          <Typography variant="body2" color="text.secondary">
                            {group.comments[0]}
                            {group.comments.length > 1
                              ? ` (+${group.comments.length - 1} more)`
                              : ""}
                          </Typography>
                        )}
                      </Stack>
                    </Box>
                  );
                })}
                {filteredApprovedGroups.length > displayedApprovedGroups.length && (
                  <Typography variant="caption" color="text.secondary">
                    Showing {displayedApprovedGroups.length} of {filteredApprovedGroups.length} matching groups.
                  </Typography>
                )}
              </Stack>
            )}
          </SectionCard>

          <SectionCard
            title="Arrival calendar"
            description="Review confirmed import requests and prepare for upcoming arrivals."
            variant="minimal"
          >
            <CalendarOverview
              description={null}
              sx={{
                boxShadow: "none",
                background: "transparent",
                border: "none",
                p: 0,
              }}
            />
          </SectionCard>
        </Stack>
      </Container>
      <UserManagementDialog
        open={isUserDialogOpen}
        onClose={handleCloseUserDialog}
        users={users}
        loading={usersLoading}
        feedback={userFeedback}
        onReload={loadUsers}
        onRoleChange={handleRoleChange}
        updatingUser={updatingUser}
      />
    </Box>
  );
}
