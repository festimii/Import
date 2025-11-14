import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
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
  TextField,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { BarChart, LineChart } from "@mui/x-charts";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import VerifiedUserRoundedIcon from "@mui/icons-material/VerifiedUserRounded";
import EventBusyRoundedIcon from "@mui/icons-material/EventBusyRounded";
import ChecklistRoundedIcon from "@mui/icons-material/ChecklistRounded";
import EventAvailableRoundedIcon from "@mui/icons-material/EventAvailableRounded";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import NotificationsActiveRoundedIcon from "@mui/icons-material/NotificationsActiveRounded";
import AutorenewRoundedIcon from "@mui/icons-material/AutorenewRounded";
import API from "../api";
import UserManagementDialog from "../components/UserManagementDialog";
import CalendarOverview from "../components/CalendarOverview";
import PageHero from "../components/PageHero";
import StatCard from "../components/StatCard";
import SectionCard from "../components/SectionCard";
import NotificationMenu from "../components/NotificationMenu";
import { formatArticleLabel } from "../utils/formatArticle";

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
  const [wmsOrders, setWmsOrders] = useState([]);
  const [wmsLoading, setWmsLoading] = useState(true);
  const [wmsFeedback, setWmsFeedback] = useState(null);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [arrivalFilter, setArrivalFilter] = useState("");
  const [showMonthlyTable, setShowMonthlyTable] = useState(false);
  const theme = useTheme();

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

  const loadWmsOrders = async () => {
    setWmsLoading(true);
    setWmsFeedback(null);
    try {
      const res = await API.get("/imports/wms-orders");
      const sorted = Array.isArray(res.data)
        ? [...res.data].sort((a, b) => {
            const dateA = a.ArrivalDate
              ? new Date(a.ArrivalDate).getTime()
              : a.ExpectedDate
              ? new Date(a.ExpectedDate).getTime()
              : 0;
            const dateB = b.ArrivalDate
              ? new Date(b.ArrivalDate).getTime()
              : b.ExpectedDate
              ? new Date(b.ExpectedDate).getTime()
              : 0;
            return dateA - dateB;
          })
        : [];
      setWmsOrders(sorted);
    } catch (error) {
      setWmsFeedback({
        severity: "error",
        message: "Unable to load the WMS queue right now.",
      });
    } finally {
      setWmsLoading(false);
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
    loadWmsOrders();
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
    if (!value) return "";
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString();
    }
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
    return "";
  };

  const formatQuantity = (value, fractionDigits = 0) => {
    if (value === null || value === undefined) return "";
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return "";
    return numericValue.toLocaleString(undefined, {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
  };

  const parseDateValue = (value) => {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    return parsed;
  };

  const formatLeadTime = (value) => {
    if (!Number.isFinite(value)) {
      return "??";
    }
    return `${value.toFixed(1)} days`;
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
    if (value === null || value === undefined) return "";
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return "";
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

  const next30DayArrivals = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endExclusive = new Date(today);
    endExclusive.setDate(endExclusive.getDate() + 30);

    const normalizeImporter = (value) => {
      if (value === null || value === undefined) {
        return "Unknown importer";
      }
      const trimmed = String(value).trim();
      return trimmed.length > 0 ? trimmed : "Unknown importer";
    };

    const importerSet = new Set();
    const bucketMap = new Map();
    const totalsBySource = {
      imports: { arrivals: 0, pallets: 0 },
      wms: { arrivals: 0, pallets: 0 },
    };

    const sources = [
      {
        key: "imports",
        records: approvedRequests,
        getArrival: (record) => parseDateValue(record.ArrivalDate),
        getPallets: (record) =>
          Number(record.PalletCount ?? record.NumriPaletave ?? 0),
        getImporter: (record) => normalizeImporter(record.Importer),
      },
      {
        key: "wms",
        records: wmsOrders,
        getArrival: (record) =>
          parseDateValue(record.ArrivalDate ?? record.ExpectedDate),
        getPallets: (record) => Number(record.PalletCount ?? 0),
        getImporter: (record) =>
          normalizeImporter(record.Importer ?? record.CustomerName),
      },
    ];

    for (const source of sources) {
      for (const record of source.records) {
        const arrivalDateRaw = source.getArrival(record);
        if (!arrivalDateRaw) continue;

        const arrivalDate = new Date(arrivalDateRaw);
        arrivalDate.setHours(0, 0, 0, 0);

        if (arrivalDate < today || arrivalDate >= endExclusive) {
          continue;
        }

        const pallets = source.getPallets(record);
        const importer = source.getImporter(record);
        importerSet.add(importer);

        const key = arrivalDate.toISOString().split("T")[0];
        if (!bucketMap.has(key)) {
          bucketMap.set(key, {
            date: arrivalDate,
            arrivals: { imports: 0, wms: 0, total: 0 },
            pallets: { imports: 0, wms: 0, total: 0 },
            importers: new Set(),
          });
        }

        const bucket = bucketMap.get(key);
        bucket.arrivals[source.key] += 1;
        bucket.arrivals.total += 1;
        bucket.importers.add(importer);
        totalsBySource[source.key].arrivals += 1;

        if (Number.isFinite(pallets) && pallets > 0) {
          bucket.pallets[source.key] += pallets;
          bucket.pallets.total += pallets;
          totalsBySource[source.key].pallets += pallets;
        }
      }
    }

    const dailyBuckets = Array.from(bucketMap.values())
      .sort((a, b) => a.date - b.date)
      .map((bucket) => ({
        ...bucket,
        label: bucket.date.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        }),
        importerCount: bucket.importers.size,
      }));

    const busiestDay = dailyBuckets.reduce((acc, current) => {
      if (!acc || current.arrivals.total > acc.arrivals.total) {
        return current;
      }
      return acc;
    }, null);

    const windowEndDisplay = new Date(endExclusive);
    windowEndDisplay.setDate(windowEndDisplay.getDate() - 1);

    const totalArrivals =
      totalsBySource.imports.arrivals + totalsBySource.wms.arrivals;
    const totalPallets =
      totalsBySource.imports.pallets + totalsBySource.wms.pallets;

    return {
      start: today,
      end: windowEndDisplay,
      totalArrivals,
      totalPallets,
      uniqueImporters: importerSet.size,
      dailyBuckets,
      busiestDay,
      totalsBySource,
    };
  }, [approvedRequests, wmsOrders]);

  const leadTimeStats = useMemo(() => {
    if (!approvedRequests.length) {
      return null;
    }

    let total = 0;
    let count = 0;
    let min = Infinity;
    let max = -Infinity;

    approvedRequests.forEach((request) => {
      const requestDate = parseDateValue(request.RequestDate);
      const arrivalDate = parseDateValue(request.ArrivalDate);
      if (!requestDate || !arrivalDate) {
        return;
      }
      const diffDays =
        (arrivalDate.getTime() - requestDate.getTime()) / (1000 * 60 * 60 * 24);
      if (!Number.isFinite(diffDays)) {
        return;
      }
      total += diffDays;
      count += 1;
      min = Math.min(min, diffDays);
      max = Math.max(max, diffDays);
    });

    if (count === 0) {
      return null;
    }

    return {
      average: total / count,
      min,
      max,
    };
  }, [approvedRequests]);

  const importerInsights = useMemo(() => {
    if (!approvedRequests.length) {
      return [];
    }

    const map = new Map();

    approvedRequests.forEach((request) => {
      const importerKey = (request.Importer || "Unknown importer").trim();
      const boxes = Number(request.BoxCount ?? request.NumriPakove ?? 0);
      const pallets = Number(request.PalletCount ?? request.NumriPaletave ?? 0);
      const arrivalDate = parseDateValue(request.ArrivalDate);
      const requestDate = parseDateValue(request.RequestDate);

      const current = map.get(importerKey) || {
        importer: importerKey,
        requests: 0,
        boxes: 0,
        pallets: 0,
        nextArrival: null,
        leadTotal: 0,
        leadCount: 0,
      };

      current.requests += 1;
      if (Number.isFinite(boxes)) {
        current.boxes += boxes;
      }
      if (Number.isFinite(pallets)) {
        current.pallets += pallets;
      }

      if (arrivalDate) {
        if (
          !current.nextArrival ||
          arrivalDate.getTime() < current.nextArrival.getTime()
        ) {
          current.nextArrival = arrivalDate;
        }
      }

      if (arrivalDate && requestDate) {
        const diffDays =
          (arrivalDate.getTime() - requestDate.getTime()) /
          (1000 * 60 * 60 * 24);
        if (Number.isFinite(diffDays)) {
          current.leadTotal += diffDays;
          current.leadCount += 1;
        }
      }

      map.set(importerKey, current);
    });

    return Array.from(map.values())
      .map((entry) => ({
        importer: entry.importer,
        requests: entry.requests,
        boxes: entry.boxes,
        pallets: entry.pallets,
        avgLead: entry.leadCount ? entry.leadTotal / entry.leadCount : null,
        nextArrival: entry.nextArrival,
      }))
      .sort((a, b) => b.pallets - a.pallets)
      .slice(0, 6);
  }, [approvedRequests]);

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

    pushNumberChip("Total pallets", importMetrics?.totalPallets);

    const avgBoxes = formatQuantity(importMetrics?.averageBoxes, 2);
    if (avgBoxes !== "?") {
      chips.push({ label: "Avg. boxes / request", value: `${avgBoxes} boxes` });
    }

    const avgPallets = formatQuantity(importMetrics?.averagePallets, 2);
    if (avgPallets !== "?") {
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

  const performanceChips = useMemo(() => {
    const chips = [...capacityChips];
    if (leadTimeStats) {
      chips.push({
        label: "Avg. lead time",
        value: formatLeadTime(leadTimeStats.average),
      });
      chips.push({
        label: "Fastest lead time",
        value: formatLeadTime(leadTimeStats.min),
      });
      chips.push({
        label: "Slowest lead time",
        value: formatLeadTime(leadTimeStats.max),
      });
    }
    return chips;
  }, [capacityChips, leadTimeStats]);

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background: (theme) =>
          `linear-gradient(180deg, ${alpha(
            theme.palette.primary.light,
            0.12
          )} 0%, ${theme.palette.background.default} 40%, ${
            theme.palette.background.paper
          } 100%)`,
      }}
    >
      <PageHero
        title="Admin workspace"
        subtitle="Track approved import requests, anticipate arrivals and curate role-based access for every collaborator."
        actions={[
          <NotificationMenu
            key="notifications"
            onUnreadChange={setUnreadNotifications}
            onLoadingChange={setNotificationsLoading}
          />,
          <Button
            key="manage-users"
            variant="outlined"
            color="inherit"
            onClick={handleOpenUserDialog}
          >
            Manage users
          </Button>,
          <Button
            key="logout"
            variant="contained"
            color="secondary"
            onClick={logout}
          >
            Logout
          </Button>,
        ]}
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
            title="Organization health"
            description="Monitor how many users can submit, confirm or administer requests."
            action={
              <Button variant="outlined" onClick={handleOpenUserDialog}>
                Manage users
              </Button>
            }
          >
            {userFeedback && (
              <Alert severity={userFeedback.severity}>
                {userFeedback.message}
              </Alert>
            )}
            <Grid container spacing={3}>
              <Grid item xs={12} md={4}>
                <StatCard
                  icon={<GroupsRoundedIcon />}
                  label="Active users"
                  value={usersLoading ? "" : totalUsers}
                  trend="Invite colleagues to streamline handoffs"
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <StatCard
                  icon={<VerifiedUserRoundedIcon />}
                  label="Confirmers"
                  value={usersLoading ? "" : confirmerCount}
                  trend="Ensure every lane has an approval owner"
                  color="secondary"
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <StatCard
                  icon={<EventBusyRoundedIcon />}
                  label="Requesters"
                  value={usersLoading ? "" : requesterCount}
                  trend="Balance intake across teams"
                  color="info"
                />
              </Grid>
            </Grid>
          </SectionCard>

          <SectionCard
            title="Import operations snapshot"
            description="Track request volume, approvals and near-term arrivals at a glance."
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
                    importMetricsLoading
                      ? "..."
                      : importMetrics?.totalRequests ?? 0
                  }
                  trend="All submissions recorded in the system"
                />
              </Grid>
              <Grid item xs={12} sm={6} lg={3}>
                <StatCard
                  icon={<EventAvailableRoundedIcon />}
                  label="Approved"
                  value={
                    importMetricsLoading
                      ? "..."
                      : importMetrics?.approvedCount ?? 0
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
                    importMetricsLoading
                      ? "..."
                      : importMetrics?.upcomingWeek ?? 0
                  }
                  trend="Approved deliveries in the next seven days"
                  color="warning"
                />
              </Grid>
            </Grid>
            {performanceChips.length > 0 && (
              <Stack
                direction={{ xs: "column", md: "row" }}
                spacing={1}
                useFlexGap
                flexWrap="wrap"
                sx={{ mt: 2 }}
              >
                {performanceChips.map((chip) => (
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
            title="Next 30-day arrivals"
            description="Preview confirmed deliveries scheduled for the next 30 days and align resources ahead of time."
          >
            {(approvedLoading || wmsLoading) ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
                <CircularProgress color="primary" />
              </Box>
            ) : next30DayArrivals.dailyBuckets.length ? (
              <Stack spacing={3}>
                {(approvedFeedback || wmsFeedback) && (
                  <Alert
                    severity={(approvedFeedback ?? wmsFeedback)?.severity || "warning"}
                  >
                    {approvedFeedback?.message ||
                      wmsFeedback?.message ||
                      "Latest arrival data may be incomplete."}
                  </Alert>
                )}
                <LineChart
                  height={360}
                  xAxis={[
                    {
                      data: next30DayArrivals.dailyBuckets.map(
                        (bucket) => bucket.label
                      ),
                      scaleType: "point",
                    },
                  ]}
                  yAxis={[
                    { id: "arrivals", label: "Arrivals" },
                    {
                      id: "capacity",
                      label: "Pallets",
                      position: "right",
                    },
                  ]}
                  series={[
                    {
                      id: "arrivals",
                      label: "Arrivals",
                      data: next30DayArrivals.dailyBuckets.map(
                        (bucket) => bucket.arrivals.total
                      ),
                      color: theme.palette.primary.main,
                      yAxisKey: "arrivals",
                      area: true,
                      curve: "catmullRom",
                      showMark: false,
                    },
                    {
                      id: "importPallets",
                      label: "Import pallets",
                      data: next30DayArrivals.dailyBuckets.map(
                        (bucket) => bucket.pallets.imports
                      ),
                      color: theme.palette.secondary.main,
                      yAxisKey: "capacity",
                      curve: "catmullRom",
                      showMark: true,
                    },
                    {
                      id: "wmsPallets",
                      label: "WMS pallets",
                      data: next30DayArrivals.dailyBuckets.map((bucket) =>
                        wmsFeedback ? null : bucket.pallets.wms
                      ),
                      color: theme.palette.success.dark,
                      yAxisKey: "capacity",
                      curve: "catmullRom",
                      showMark: true,
                      lineStyle: wmsFeedback
                        ? { strokeDasharray: "6 6" }
                        : undefined,
                    },
                  ]}
                  margin={{ top: 40, left: 60, right: 50, bottom: 40 }}
                  slotProps={{
                    legend: {
                      position: { vertical: "top", horizontal: "right" },
                      direction: "row",
                    },
                  }}
                />
                <Grid container spacing={3}>
                  <Grid item xs={12} md={4}>
                    <StatCard
                      icon={<CalendarMonthRoundedIcon />}
                      label="Arrivals scheduled"
                      value={formatNumber(next30DayArrivals.totalArrivals)}
                      trend={`${next30DayArrivals.start.toLocaleDateString()} - ${next30DayArrivals.end.toLocaleDateString()}`}
                    />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <StatCard
                      icon={<LocalShippingIcon />}
                      label="Capacity inbound"
                      value={`${formatQuantity(
                        next30DayArrivals.totalPallets
                      )} pallets`}
                      trend={`Imports ${formatQuantity(
                        next30DayArrivals.totalsBySource.imports.pallets
                      )} | WMS ${formatQuantity(
                        next30DayArrivals.totalsBySource.wms.pallets
                      )}`}
                      color="secondary"
                    />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <StatCard
                      icon={<EventAvailableRoundedIcon />}
                      label="Busiest day"
                      value={
                        next30DayArrivals.busiestDay
                          ? next30DayArrivals.busiestDay.label
                          : "No congestion"
                      }
                      trend={
                        next30DayArrivals.busiestDay
                          ? `${formatNumber(
                              next30DayArrivals.busiestDay.arrivals.total
                            )} arrivals | ${formatQuantity(
                              next30DayArrivals.busiestDay.pallets.total
                            )} pallets`
                          : "Evenly distributed"
                      }
                      color="warning"
                    />
                  </Grid>
                </Grid>
                <Stack
                  direction={{ xs: "column", md: "row" }}
                  spacing={1}
                  useFlexGap
                  flexWrap="wrap"
                >
                  <Chip
                    label={`Unique importers: ${formatNumber(
                      next30DayArrivals.uniqueImporters
                    )}`}
                    size="small"
                    variant="outlined"
                  />
                  <Chip
                    label={`Avg. arrivals/day: ${formatQuantity(
                      next30DayArrivals.totalArrivals /
                        Math.max(next30DayArrivals.dailyBuckets.length, 1),
                      1
                    )}`}
                    size="small"
                    variant="outlined"
                  />
                  <Chip
                    label={`Avg. pallets/day: ${formatQuantity(
                      next30DayArrivals.totalPallets /
                        Math.max(next30DayArrivals.dailyBuckets.length, 1),
                      1
                    )}`}
                    size="small"
                    variant="outlined"
                  />
                  <Chip
                    label={`Import pallets: ${formatQuantity(
                      next30DayArrivals.totalsBySource.imports.pallets
                    )}`}
                    size="small"
                    variant="outlined"
                  />
                  <Chip
                    label={`WMS pallets: ${formatQuantity(
                      next30DayArrivals.totalsBySource.wms.pallets
                    )}`}
                    size="small"
                    variant="outlined"
                  />
                </Stack>
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No confirmed arrivals are scheduled in the next 30 days.
                Approved or WMS requests will appear here once they fall within
                the rolling window.
              </Typography>
            )}
          </SectionCard>

          <SectionCard
            title="Top articles by volume"
            description="Understand which articles dominate requests to align warehouse capacity and approvals."
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
                      data: topArticleGroups.map((entry) =>
                        formatArticleLabel(entry.article, entry.articleName)
                      ),
                    },
                  ]}
                  series={[
                    {
                      id: "boxes",
                      label: "Boxes",
                      data: topArticleGroups.map(
                        (entry) => entry.boxTotal ?? 0
                      ),
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
                        <TableCell>
                          {formatArticleLabel(entry.article, entry.articleName)}
                        </TableCell>
                        <TableCell align="right">
                          {entry.requestCount}
                        </TableCell>
                        <TableCell align="right">
                          {entry.approvedCount}
                        </TableCell>
                        <TableCell align="right">{entry.boxTotal}</TableCell>
                        <TableCell align="right">{entry.palletTotal}</TableCell>
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
            title="Importer workload leaderboard"
            description="Spot which importers drive the largest confirmed volume and when their next pallets arrive."
          >
            {approvedLoading ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
                <CircularProgress color="primary" />
              </Box>
            ) : importerInsights.length ? (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Importer</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      Requests
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      Boxes
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      Pallets
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      Avg. lead time
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      Next arrival
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {importerInsights.map((entry) => (
                    <TableRow key={entry.importer} hover>
                      <TableCell>{entry.importer}</TableCell>
                      <TableCell align="right">
                        {formatNumber(entry.requests)}
                      </TableCell>
                      <TableCell align="right">
                        {formatNumber(entry.boxes)}
                      </TableCell>
                      <TableCell align="right">
                        {formatNumber(entry.pallets)}
                      </TableCell>
                      <TableCell align="right">
                        {entry.avgLead !== null
                          ? formatLeadTime(entry.avgLead)
                          : "-"}
                      </TableCell>
                      <TableCell align="right">
                        {entry.nextArrival
                          ? entry.nextArrival.toLocaleDateString()
                          : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No confirmed importer data is available yet. Once requests are
                approved this leaderboard will rank the busiest partners.
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
                        backgroundColor: (theme) =>
                          theme.palette.background.paper,
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
                              <Typography
                                variant="caption"
                                color="text.secondary"
                              >
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
                              <Typography
                                variant="caption"
                                color="text.secondary"
                              >
                                Arrival
                              </Typography>
                              <Typography variant="body1">
                                {arrivalLabel}
                              </Typography>
                            </Stack>
                          </Grid>
                          <Grid item xs={12} sm={4}>
                            <Stack spacing={0.25}>
                              <Typography
                                variant="caption"
                                color="text.secondary"
                              >
                                Request date
                              </Typography>
                              <Typography variant="body1">
                                {formatDate(group.requestDate)}
                              </Typography>
                            </Stack>
                          </Grid>
                          <Grid item xs={12} sm={4}>
                            <Stack spacing={0.25}>
                              <Typography
                                variant="caption"
                                color="text.secondary"
                              >
                                Boxes / pallets
                              </Typography>
                              <Typography variant="body1">
                                {`${formatQuantity(
                                  group.totalBoxes
                                )} boxes ? ${formatQuantity(
                                  group.totalPallets
                                )} pallets`}
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
                {filteredApprovedGroups.length >
                  displayedApprovedGroups.length && (
                  <Typography variant="caption" color="text.secondary">
                    Showing {displayedApprovedGroups.length} of{" "}
                    {filteredApprovedGroups.length} matching groups.
                  </Typography>
                )}
              </Stack>
            )}
          </SectionCard>

          <CalendarOverview
            title="Arrival calendar"
            description="Review confirmed import requests and prepare for upcoming arrivals."
          />
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



