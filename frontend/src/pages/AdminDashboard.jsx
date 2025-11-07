import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
import formatArticleCode from "../utils/formatArticle";
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
  const [selectedImport, setSelectedImport] = useState(null);

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
            ) : approvedRequests.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No confirmed imports are available yet. As confirmers approve
                requests, they will appear in this registry automatically.
              </Typography>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Request</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Importer</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Article</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      Boxes
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      Pallets
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      Arrival date
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      Details
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {approvedRequests.map((request) => (
                    <TableRow key={request.ID} hover>
                      <TableCell>#{request.ID}</TableCell>
                      <TableCell>{request.Importer}</TableCell>
                      <TableCell>
                        {formatArticleCode(request.Article)}
                      </TableCell>
                      <TableCell align="right">
                        {formatQuantity(request.BoxCount)}
                      </TableCell>
                      <TableCell align="right">
                        {formatQuantity(request.PalletCount)}
                      </TableCell>
                      <TableCell align="right">
                        {formatDate(request.ArrivalDate)}
                      </TableCell>
                      <TableCell align="right">
                        <Button
                          size="small"
                          onClick={() => setSelectedImport(request)}
                        >
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Paper>

          <CalendarOverview description="Review confirmed import requests and prepare for upcoming arrivals." />
        </Stack>
      </Container>
      <Dialog
        open={Boolean(selectedImport)}
        onClose={() => setSelectedImport(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>
          {selectedImport
            ? `Import request #${selectedImport.ID}`
            : "Import details"}
        </DialogTitle>
        <DialogContent dividers>
          {selectedImport ? (
            <Stack spacing={2}>
              <Stack spacing={0.5}>
                <Typography variant="subtitle2" color="text.secondary">
                  Importer
                </Typography>
                <Typography variant="body1">
                  {selectedImport.Importer}
                </Typography>
              </Stack>
              <Divider />
              <Stack
                spacing={0.5}
                direction={{ xs: "column", sm: "row" }}
                gap={{ sm: 6 }}
              >
                <Box>
                  <Typography variant="subtitle2" color="text.secondary">
                    Article
                  </Typography>
                  <Typography variant="body1">
                    {formatArticleCode(selectedImport.Article)}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="subtitle2" color="text.secondary">
                    Status
                  </Typography>
                  <Typography variant="body1" fontWeight={600}>
                    {selectedImport.Status ?? "approved"}
                  </Typography>
                </Box>
              </Stack>
              <Divider />
              <Stack
                spacing={0.5}
                direction={{ xs: "column", sm: "row" }}
                gap={{ sm: 6 }}
              >
                <Box>
                  <Typography variant="subtitle2" color="text.secondary">
                    Request date
                  </Typography>
                  <Typography variant="body1">
                    {formatDate(selectedImport.RequestDate)}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="subtitle2" color="text.secondary">
                    Arrival date
                  </Typography>
                  <Typography variant="body1">
                    {formatDate(selectedImport.ArrivalDate)}
                  </Typography>
                </Box>
              </Stack>
              <Divider />
              <Stack
                spacing={0.5}
                direction={{ xs: "column", sm: "row" }}
                gap={{ sm: 6 }}
              >
                <Box>
                  <Typography variant="subtitle2" color="text.secondary">
                    Box quantity
                  </Typography>
                  <Typography variant="body1">
                    {formatQuantity(selectedImport.BoxCount)}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="subtitle2" color="text.secondary">
                    Pallet positions
                  </Typography>
                  <Typography variant="body1">
                    {formatQuantity(selectedImport.PalletCount)}
                  </Typography>
                </Box>
              </Stack>
              {(selectedImport.Comment || "").trim() && (
                <>
                  <Divider />
                  <Stack spacing={0.5}>
                    <Typography variant="subtitle2" color="text.secondary">
                      Requester note
                    </Typography>
                    <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                      {selectedImport.Comment}
                    </Typography>
                  </Stack>
                </>
              )}
              <Divider />
              <Stack
                spacing={0.5}
                direction={{ xs: "column", sm: "row" }}
                gap={{ sm: 6 }}
              >
                <Box>
                  <Typography variant="subtitle2" color="text.secondary">
                    Requested by
                  </Typography>
                  <Typography variant="body1" fontWeight={600}>
                    {selectedImport.Requester ?? "—"}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="subtitle2" color="text.secondary">
                    Confirmed by
                  </Typography>
                  <Typography variant="body1" fontWeight={600}>
                    {selectedImport.ConfirmedBy ?? "—"}
                  </Typography>
                </Box>
              </Stack>
            </Stack>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectedImport(null)}>Close</Button>
        </DialogActions>
      </Dialog>
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
