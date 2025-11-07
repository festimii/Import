import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Container,
  Divider,
  Grid,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import VerifiedUserRoundedIcon from "@mui/icons-material/VerifiedUserRounded";
import EventBusyRoundedIcon from "@mui/icons-material/EventBusyRounded";
import ChecklistRoundedIcon from "@mui/icons-material/ChecklistRounded";
import EventAvailableRoundedIcon from "@mui/icons-material/EventAvailableRounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import NotificationsActiveRoundedIcon from "@mui/icons-material/NotificationsActiveRounded";
import Inventory2RoundedIcon from "@mui/icons-material/Inventory2Rounded";
import AssessmentRoundedIcon from "@mui/icons-material/AssessmentRounded";
import TrendingUpRoundedIcon from "@mui/icons-material/TrendingUpRounded";
import AllInboxRoundedIcon from "@mui/icons-material/AllInboxRounded";
import WarehouseRoundedIcon from "@mui/icons-material/WarehouseRounded";
import API from "../api";
import UserManagementDialog from "../components/UserManagementDialog";
import CalendarOverview from "../components/CalendarOverview";
import PageHero from "../components/PageHero";
import StatCard from "../components/StatCard";
import NotificationPermissionBanner from "../components/NotificationPermissionBanner";
import formatArticleCode from "../utils/formatArticle";

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
  const [expandedGroups, setExpandedGroups] = useState({});

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
    if (!value) return "—";
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString();
    }
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
    return "—";
  };

  const formatQuantity = (value, fractionDigits = 0) => {
    if (value === null || value === undefined) return "—";
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return "—";
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

  const toggleGroup = (groupId) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
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
    if (value === null || value === undefined) return "—";
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return "—";
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

  const isGroupExpanded = (groupId) => Boolean(expandedGroups[groupId]);

  const MetricGrid = ({ metrics }) => {
    const visibleMetrics = metrics.filter((metric) => metric.value !== "—");

    if (visibleMetrics.length === 0) {
      return (
        <Typography variant="body2" color="text.secondary">
          —
        </Typography>
      );
    }

    return (
      <Grid container spacing={1.5} columns={12}>
        {visibleMetrics.map((metric) => (
          <Grid item xs={12} sm={6} key={metric.label}>
            <Stack spacing={0.5}>
              <Typography variant="caption" color="text.secondary">
                {metric.label}
              </Typography>
              <Typography variant="body1" fontWeight={600}>
                {metric.value}
              </Typography>
              {metric.secondary && (
                <Typography variant="caption" color="text.secondary">
                  {metric.secondary}
                </Typography>
              )}
            </Stack>
          </Grid>
        ))}
      </Grid>
    );
  };

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
          <NotificationPermissionBanner />
          <Grid container spacing={3}>
            <Grid item xs={12} md={4}>
              <StatCard
                icon={<GroupsRoundedIcon />}
                label="Active users"
                value={usersLoading ? "…" : totalUsers}
                trend="Invite colleagues to streamline handoffs"
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <StatCard
                icon={<VerifiedUserRoundedIcon />}
                label="Confirmers"
                value={usersLoading ? "…" : confirmerCount}
                trend="Ensure every lane has an approval owner"
                color="secondary"
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <StatCard
                icon={<EventBusyRoundedIcon />}
                label="Requesters"
                value={usersLoading ? "…" : requesterCount}
                trend="Balance intake across teams"
                color="info"
              />
            </Grid>
          </Grid>

          <Stack spacing={1}>
            <Typography variant="h6">Import operations snapshot</Typography>
            <Typography variant="body2" color="text.secondary">
              Track request volume, approvals and near-term arrivals at a
              glance.
            </Typography>
          </Stack>

          {importMetricsFeedback && (
            <Alert severity={importMetricsFeedback.severity}>
              {importMetricsFeedback.message}
            </Alert>
          )}

          <Grid container spacing={3}>
            <Grid item xs={12} md={3}>
              <StatCard
                icon={<ChecklistRoundedIcon />}
                label="Total requests"
                value={
                  importMetricsLoading ? "…" : importMetrics?.totalRequests ?? 0
                }
                trend="All submissions recorded in the system"
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <StatCard
                icon={<EventAvailableRoundedIcon />}
                label="Approved"
                value={
                  importMetricsLoading ? "…" : importMetrics?.approvedCount ?? 0
                }
                trend="Confirmed arrivals awaiting execution"
                color="secondary"
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <StatCard
                icon={<ScheduleRoundedIcon />}
                label="Pending"
                value={
                  importMetricsLoading ? "…" : importMetrics?.pendingCount ?? 0
                }
                trend="Requests still waiting on a decision"
                color="info"
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <StatCard
                icon={<NotificationsActiveRoundedIcon />}
                label="Arrivals this week"
                value={
                  importMetricsLoading ? "…" : importMetrics?.upcomingWeek ?? 0
                }
                trend="Approved deliveries in the next seven days"
                color="warning"
              />
            </Grid>
          </Grid>

          <Grid container spacing={3}>
            <Grid item xs={12} md={3}>
              <StatCard
                icon={<AllInboxRoundedIcon />}
                label="Total boxes"
                value={
                  importMetricsLoading ? "…" : importMetrics?.totalBoxes ?? 0
                }
                trend="Aggregate box volume across all requests"
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <StatCard
                icon={<Inventory2RoundedIcon />}
                label="Total pallets"
                value={
                  importMetricsLoading ? "…" : importMetrics?.totalPallets ?? 0
                }
                trend="Calculated pallet positions for every request"
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <StatCard
                icon={<AssessmentRoundedIcon />}
                label="Avg. boxes / request"
                value={(() => {
                  if (importMetricsLoading) return "…";
                  const average = importMetrics?.averageBoxes ?? 0;
                  if (!average) return "—";
                  return `${average} boxes`;
                })()}
                trend="Typical order size submitted by requesters"
                color="secondary"
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <StatCard
                icon={<WarehouseRoundedIcon />}
                label="Avg. pallets / request"
                value={(() => {
                  if (importMetricsLoading) return "…";
                  const average = importMetrics?.averagePallets ?? 0;
                  if (!average) return "—";
                  return `${average} pallets`;
                })()}
                trend="Helps plan warehouse capacity"
                color="info"
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <StatCard
                icon={<TrendingUpRoundedIcon />}
                label="Approval ratio"
                value={(() => {
                  if (importMetricsLoading) return "…";
                  const total = importMetrics?.totalRequests ?? 0;
                  const approved = importMetrics?.approvedCount ?? 0;
                  if (!total) return "—";
                  return `${Math.round((approved / total) * 100)}%`;
                })()}
                trend="Share of requests that receive a green light"
                color="success"
              />
            </Grid>
          </Grid>

          <Paper
            elevation={12}
            sx={{
              p: { xs: 3, md: 5 },
              borderRadius: 4,
              background: (theme) =>
                `linear-gradient(160deg, ${theme.palette.background.paper} 0%, ${theme.palette.action.hover} 100%)`,
            }}
          >
            <Stack spacing={3}>
              <Stack spacing={0.5}>
                <Typography variant="h6">Monthly request trend</Typography>
                <Typography variant="body2" color="text.secondary">
                  Compare intake volume, box totals and pallet totals month over
                  month.
                </Typography>
              </Stack>

              {importMetricsLoading ? (
                <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
                  <CircularProgress color="primary" />
                </Box>
              ) : importMetrics?.monthlyRequests?.length ? (
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
                    {importMetrics.monthlyRequests.map((entry) => (
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
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No historical data available yet. New submissions will
                  populate this view automatically.
                </Typography>
              )}
            </Stack>
          </Paper>

          <Paper
            elevation={10}
            sx={{
              p: { xs: 3, md: 5 },
              borderRadius: 4,
              display: "flex",
              flexDirection: "column",
              gap: 3,
            }}
          >
            <Stack spacing={0.5}>
              <Typography variant="h6">Confirmed import registry</Typography>
              <Typography variant="body2" color="text.secondary">
                Review approved requests in detail and reopen the record when
                you need the underlying article breakdown.
              </Typography>
            </Stack>

            {approvedFeedback && (
              <Alert severity={approvedFeedback.severity}>
                {approvedFeedback.message}
              </Alert>
            )}

            {approvedLoading ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
                <CircularProgress color="primary" />
              </Box>
            ) : approvedGroups.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No confirmed imports are available yet. As confirmers approve
                requests, they will appear in this registry automatically.
              </Typography>
            ) : (
              <Stack spacing={2.5}>
                {approvedGroups.map((group) => {
                  const sharedArrivalDate = group.sharedArrivalDate
                    ? formatDate(group.sharedArrivalDate)
                    : group.arrivalDateConflict
                    ? "Multiple dates"
                    : "—";

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
                      <Stack spacing={2.5}>
                        <Stack
                          direction={{ xs: "column", md: "row" }}
                          spacing={1.5}
                          alignItems={{ md: "center" }}
                        >
                          <Stack spacing={0.5}>
                            <Typography
                              variant="overline"
                              color="primary"
                              sx={{ letterSpacing: 1 }}
                            >
                              Request bill #{group.reference}
                            </Typography>
                            <Typography variant="h6">{group.importer}</Typography>
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

                        <Grid container spacing={3}>
                          <Grid item xs={12} md={6}>
                            <Stack spacing={0.5}>
                              <Typography variant="caption" color="text.secondary">
                                Request date
                              </Typography>
                              <Typography variant="body1">
                                {formatDate(group.requestDate)}
                              </Typography>
                            </Stack>
                          </Grid>
                          <Grid item xs={12} md={6}>
                            <Stack spacing={0.5}>
                              <Typography variant="caption" color="text.secondary">
                                Arrival date
                              </Typography>
                              <Stack direction="row" spacing={1} alignItems="center">
                                <Typography variant="body1">
                                  {sharedArrivalDate}
                                </Typography>
                                {group.arrivalDateConflict && (
                                  <Chip
                                    label="Multiple dates"
                                    color="warning"
                                    size="small"
                                    variant="outlined"
                                  />
                                )}
                              </Stack>
                            </Stack>
                          </Grid>
                        </Grid>

                        <MetricGrid
                          metrics={[
                            {
                              label: "Total boxes",
                              value: formatQuantity(group.totalBoxes),
                              secondary: [
                                group.totalFullPallets
                                  ? `${formatQuantity(group.totalFullPallets, 2)} full pallets`
                                  : null,
                                group.totalRemainingBoxes
                                  ? `${formatQuantity(group.totalRemainingBoxes)} loose boxes`
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(" • ") || null,
                            },
                            {
                              label: "Total pallets",
                              value: formatQuantity(group.totalPallets),
                            },
                            {
                              label: "Total shipment weight (kg)",
                              value: formatQuantity(group.totalShipmentWeightKg, 2),
                              secondary:
                                group.totalWeightFullPalletsKg || group.totalWeightRemainingKg
                                  ? [
                                      group.totalWeightFullPalletsKg
                                        ? `${formatQuantity(
                                            group.totalWeightFullPalletsKg,
                                            2
                                          )} on full pallets`
                                        : null,
                                      group.totalWeightRemainingKg
                                        ? `${formatQuantity(
                                            group.totalWeightRemainingKg,
                                            2
                                          )} remaining`
                                        : null,
                                    ]
                                      .filter(Boolean)
                                      .join(" • ") || null
                                  : null,
                            },
                            {
                              label: "Total shipment volume (m³)",
                              value: formatQuantity(group.totalShipmentVolumeM3, 3),
                              secondary:
                                group.totalVolumeFullPalletsM3 || group.totalVolumeRemainingM3
                                  ? [
                                      group.totalVolumeFullPalletsM3
                                        ? `${formatQuantity(
                                            group.totalVolumeFullPalletsM3,
                                            3
                                          )} on full pallets`
                                        : null,
                                      group.totalVolumeRemainingM3
                                        ? `${formatQuantity(
                                            group.totalVolumeRemainingM3,
                                            3
                                          )} remaining`
                                        : null,
                                    ]
                                      .filter(Boolean)
                                      .join(" • ") || null
                                  : null,
                            },
                          ]}
                        />

                        {group.comments.length > 0 && (
                          <Stack spacing={0.5}>
                            <Typography variant="caption" color="text.secondary">
                              Requester notes
                            </Typography>
                            {group.comments.map((comment, index) => (
                              <Typography
                                key={`${group.id}-comment-${index}`}
                                variant="body2"
                                sx={{ whiteSpace: "pre-wrap" }}
                              >
                                {comment}
                              </Typography>
                            ))}
                          </Stack>
                        )}

                        <Collapse in={isGroupExpanded(group.id)} timeout="auto" unmountOnExit>
                          <Stack spacing={1.5} mt={1.5}>
                            {group.items.map((item) => (
                              <Box
                                key={item.ID}
                                sx={{
                                  p: 2.5,
                                  borderRadius: 2,
                                  border: (theme) =>
                                    `1px solid ${theme.palette.action.focus}`,
                                  backgroundColor: (theme) =>
                                    theme.palette.action.hover,
                                }}
                              >
                                <Stack spacing={1.5}>
                                  <Stack
                                    direction={{ xs: "column", sm: "row" }}
                                    spacing={1}
                                    justifyContent="space-between"
                                    alignItems={{ sm: "center" }}
                                  >
                                    <Box>
                                      <Typography variant="body1" fontWeight={600}>
                                        {formatArticleCode(item.Article)}
                                      </Typography>
                                      {item.Comment && (
                                        <Typography
                                          variant="caption"
                                          color="text.secondary"
                                          sx={{ whiteSpace: "pre-wrap" }}
                                        >
                                          {item.Comment}
                                        </Typography>
                                      )}
                                    </Box>
                                    <Chip
                                      label={`Boxes ${formatQuantity(item.BoxCount)} • Pallets ${formatQuantity(
                                        item.PalletCount
                                      )}`}
                                      size="small"
                                      variant="outlined"
                                    />
                                  </Stack>

                                  <Grid container spacing={3}>
                                    <Grid item xs={12} md={6}>
                                      <Stack spacing={0.75}>
                                        <Typography variant="caption" color="text.secondary">
                                          Load plan
                                        </Typography>
                                        <MetricGrid
                                          metrics={[
                                            {
                                              label: "Boxes",
                                              value: formatQuantity(item.BoxCount),
                                            },
                                            {
                                              label: "Pallets",
                                              value: formatQuantity(item.PalletCount),
                                            },
                                            {
                                              label: "Full pallets",
                                              value: formatQuantity(item.FullPallets, 2),
                                            },
                                            {
                                              label: "Remaining boxes",
                                              value: formatQuantity(item.RemainingBoxes),
                                            },
                                          ]}
                                        />
                                      </Stack>
                                    </Grid>
                                    <Grid item xs={12} md={6}>
                                      <Stack spacing={0.75}>
                                        <Typography variant="caption" color="text.secondary">
                                          Weight &amp; volume
                                        </Typography>
                                        <MetricGrid
                                          metrics={[
                                            {
                                              label: "Total shipment weight (kg)",
                                              value: formatQuantity(
                                                item.TotalShipmentWeightKg,
                                                2
                                              ),
                                            },
                                            {
                                              label: "Total shipment volume (m³)",
                                              value: formatQuantity(
                                                item.TotalShipmentVolumeM3,
                                                3
                                              ),
                                            },
                                            {
                                              label: "Pallet weight (kg)",
                                              value: formatQuantity(item.PalletWeightKg, 2),
                                            },
                                            {
                                              label: "Box weight (kg)",
                                              value: formatQuantity(item.BoxWeightKg, 2),
                                            },
                                          ]}
                                        />
                                      </Stack>
                                    </Grid>
                                  </Grid>
                                </Stack>
                              </Box>
                            ))}
                          </Stack>
                        </Collapse>

                        <Box
                          sx={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: 1,
                            flexWrap: "wrap",
                          }}
                        >
                          <Typography variant="caption" color="text.secondary">
                            {isGroupExpanded(group.id)
                              ? "Hide the detailed article breakdown"
                              : "Show the detailed article breakdown"}
                          </Typography>
                          <Button
                            size="small"
                            variant="text"
                            color="secondary"
                            onClick={() => toggleGroup(group.id)}
                          >
                            {isGroupExpanded(group.id) ? "Hide articles" : "View articles"}
                          </Button>
                        </Box>
                      </Stack>
                    </Box>
                  );
                })}
              </Stack>
            )}
          </Paper>

          <CalendarOverview description="Review confirmed import requests and prepare for upcoming arrivals." />
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
