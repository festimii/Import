import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import AssignmentTurnedInRoundedIcon from "@mui/icons-material/AssignmentTurnedInRounded";
import AutorenewRoundedIcon from "@mui/icons-material/AutorenewRounded";
import Inventory2RoundedIcon from "@mui/icons-material/Inventory2Rounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import ViewInArRoundedIcon from "@mui/icons-material/ViewInArRounded";
import API from "../api";
import RequestGroupCard from "../components/RequestGroupCard";
import CalendarOverview from "../components/CalendarOverview";
import PageHero from "../components/PageHero";
import StatCard from "../components/StatCard";
import SectionCard from "../components/SectionCard";
import NotificationMenu from "../components/NotificationMenu";

const formatNumeric = (value, fractionDigits = 0) => {
  if (value === null || value === undefined) {
    return "0";
  }
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return "0";
  }
  return numericValue.toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
};

export default function ConfirmerDashboard() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState(null);
  const [proposalFeedback, setProposalFeedback] = useState(null);
  const [proposingGroup, setProposingGroup] = useState(null);
  const [proposalDate, setProposalDate] = useState("");
  const [proposalSubmitting, setProposalSubmitting] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState(null);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);

  const loadRequests = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await API.get("/imports");
      setRequests(res.data);
      setLastSyncedAt(new Date());
    } catch (error) {
      setFeedback({
        severity: "error",
        message: "We couldn't load the latest requests. Please refresh.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const groupedRequests = useMemo(() => {
    const map = new Map();

    const normalizeDate = (value) => {
      if (!value) return "";
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString().split("T")[0];
      }
      return String(value);
    };

    for (const request of requests) {
      const key = [
        request.Requester ?? "",
        request.Importer ?? "",
        normalizeDate(request.RequestDate),
        request.Comment ?? "",
      ].join("|#|");

      if (!map.has(key)) {
        map.set(key, {
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

    return Array.from(map.values()).sort((a, b) => {
      const dateA = a.requestDate ? new Date(a.requestDate).getTime() : 0;
      const dateB = b.requestDate ? new Date(b.requestDate).getTime() : 0;
      return dateB - dateA;
    });
  }, [requests]);

  const requestMetrics = useMemo(() => {
    if (requests.length === 0) {
      return {
        groupCount: 0,
        articleCount: 0,
        totalBoxes: 0,
        totalPallets: 0,
      };
    }
    const totals = requests.reduce(
      (acc, request) => {
        const boxes = Number(request.BoxCount);
        if (Number.isFinite(boxes)) {
          acc.totalBoxes += boxes;
        }
        const pallets = Number(request.PalletCount);
        if (Number.isFinite(pallets)) {
          acc.totalPallets += pallets;
        }
        return acc;
      },
      { totalBoxes: 0, totalPallets: 0 }
    );
    return {
      groupCount: groupedRequests.length,
      articleCount: requests.length,
      totalBoxes: totals.totalBoxes,
      totalPallets: totals.totalPallets,
    };
  }, [groupedRequests, requests]);

  const lastSyncLabel = useMemo(() => {
    if (!lastSyncedAt) {
      return "Not synced yet";
    }
    return `Updated ${lastSyncedAt.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  }, [lastSyncedAt]);

  const handleGroupDecision = async (group, status) => {
    setFeedback(null);
    try {
      await Promise.all(
        group.items.map((item) => API.patch(`/imports/${item.ID}`, { status }))
      );
      const action = status === "approved" ? "Approved" : "Rejected";
      setFeedback({
        severity: "success",
        message: `${action} ${group.items.length} article${
          group.items.length === 1 ? "" : "s"
        } for ${group.importer}.`,
      });
    } catch (error) {
      setFeedback({
        severity: "error",
        message: "Updating the request group failed. Please try again.",
      });
    } finally {
      loadRequests();
    }
  };

  const handleOpenProposal = (group) => {
    const defaultDate = (() => {
      if (group.sharedArrivalDate) {
        const parsed = new Date(group.sharedArrivalDate);
        if (!Number.isNaN(parsed.getTime())) {
          return parsed.toISOString().split("T")[0];
        }
      }
      return "";
    })();

    setProposalFeedback(null);
    setProposingGroup(group);
    setProposalDate(defaultDate);
  };

  const handleCloseProposal = () => {
    setProposingGroup(null);
    setProposalDate("");
    setProposalFeedback(null);
  };

  const handleSubmitProposal = async () => {
    if (!proposingGroup) return;
    if (!proposalDate) {
      setProposalFeedback({
        severity: "error",
        message: "Please choose a new arrival date before continuing.",
      });
      return;
    }

    setProposalSubmitting(true);
    setProposalFeedback(null);
    let shouldClose = false;
    try {
      await Promise.all(
        proposingGroup.items.map((item) =>
          API.patch(`/imports/${item.ID}`, { arrivalDate: proposalDate })
        )
      );
      setFeedback({
        severity: "success",
        message: `Notified requester${
          proposingGroup.items.length > 1 ? "s" : ""
        } about the new arrival date.`,
      });
      shouldClose = true;
    } catch (error) {
      setProposalFeedback({
        severity: "error",
        message: "We couldn't update the arrival date. Please try again.",
      });
    } finally {
      setProposalSubmitting(false);
      if (shouldClose) {
        handleCloseProposal();
      }
      loadRequests();
    }
  };

  const logout = () => {
    localStorage.clear();
    window.location.reload();
  };

  const awaitingSchedule = useMemo(() => {
    if (groupedRequests.length === 0) return 0;
    return groupedRequests.filter((group) => {
      if (group.arrivalDateConflict) {
        return true;
      }
      if (!group.sharedArrivalDate) {
        return true;
      }
      return false;
    }).length;
  }, [groupedRequests]);

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background: (theme) =>
          `linear-gradient(180deg, ${alpha(theme.palette.primary.light, 0.12)} 0%, ${
            theme.palette.background.default
          } 35%, ${theme.palette.background.paper} 100%)`,
      }}
    >
      <PageHero
        title="VIVA Fresh Imports Tracker"
        subtitle=""
        actions={[
          <NotificationMenu key="notifications" />,
          <Button
            key="logout"
            variant="contained"
            color="secondary"
            onClick={logout}
          >
            Logout
          </Button>,
        ]}
      ></PageHero>

      <Container sx={{ flexGrow: 1, py: { xs: 4, md: 6 } }} maxWidth="lg">
        <Stack spacing={4}>

          {requestMetrics.articleCount > 0 && (
            <Grid container spacing={3}>
              <Grid item xs={12} sm={6} md={3}>
                <StatCard
                  icon={<AssignmentTurnedInRoundedIcon />}
                  label="Pending groups"
                  value={formatNumeric(requestMetrics.groupCount)}
                  trend={
                    awaitingSchedule > 0
                      ? `${awaitingSchedule} awaiting schedule`
                      : "All have proposed dates"
                  }
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <StatCard
                  icon={<ScheduleRoundedIcon />}
                  label="Articles awaiting"
                  value={formatNumeric(requestMetrics.articleCount)}
                  trend="Line items queued for review"
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <StatCard
                  icon={<Inventory2RoundedIcon />}
                  label="Boxes queued"
                  value={formatNumeric(requestMetrics.totalBoxes)}
                  trend="Across all pending groups"
                  color="secondary"
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <StatCard
                  icon={<ViewInArRoundedIcon />}
                  label="Projected pallets"
                  value={formatNumeric(requestMetrics.totalPallets)}
                  trend="Estimated pallet usage"
                  color="success"
                />
              </Grid>
            </Grid>
          )}

          <CalendarOverview
            title="Calendar overview"
            description=""
            allowArrivalUpdates
          />

          <SectionCard
            title="Pending confirmations"
            description="Review grouped submissions and approve, reject, or propose new arrival dates."
            action={
              <Button
                type="button"
                variant="contained"
                startIcon={<AutorenewRoundedIcon />}
                onClick={loadRequests}
                disabled={loading}
              >
                {loading ? "Refreshing..." : "Refresh list"}
              </Button>
            }
            secondaryAction={
              <Chip
                label={
                  requestMetrics.groupCount > 0
                    ? `${requestMetrics.groupCount} group${
                        requestMetrics.groupCount === 1 ? "" : "s"
                      } pending`
                    : "No pending groups"
                }
                color={requestMetrics.groupCount > 0 ? "warning" : "success"}
                variant="outlined"
              />
            }
          >
            <Stack spacing={3}>
              <Typography variant="body2" color="text.secondary">
                {lastSyncLabel}
              </Typography>
              {feedback && (
                <Alert severity={feedback.severity}>{feedback.message}</Alert>
              )}
              {loading ? (
                <Box
                  sx={{
                    py: 6,
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <CircularProgress color="primary" />
                </Box>
              ) : groupedRequests.length === 0 ? (
                <Stack spacing={1} textAlign="center">
                  <Typography variant="h6">You're all caught up</Typography>
                  <Typography variant="body2" color="text.secondary">
                    There are no pending request groups right now. New
                    submissions will appear here automatically.
                  </Typography>
                </Stack>
              ) : (
                <Grid container spacing={3}>
                  {groupedRequests.map((group) => (
                    <Grid
                      item
                      xs={12}
                      key={`${group.reference}-${group.items.length}`}
                    >
                      <RequestGroupCard
                        group={group}
                        onApprove={(selectedGroup) =>
                          handleGroupDecision(selectedGroup, "approved")
                        }
                        onReject={(selectedGroup) =>
                          handleGroupDecision(selectedGroup, "rejected")
                        }
                        onProposeDate={handleOpenProposal}
                      />
                    </Grid>
                  ))}
                </Grid>
              )}
            </Stack>
          </SectionCard>
        </Stack>
      </Container>

      <Dialog
        open={Boolean(proposingGroup)}
        onClose={proposalSubmitting ? undefined : handleCloseProposal}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Propose a new arrival date</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            {proposingGroup && (
              <Typography variant="body2" color="text.secondary">
                Update the arrival date for {proposingGroup.items.length}{" "}
                article
                {proposingGroup.items.length === 1 ? "" : "s"} requested by{" "}
                <Typography
                  component="span"
                  fontWeight={600}
                  color="text.primary"
                >
                  {proposingGroup.importer}
                </Typography>
                . The requester will be notified once you confirm the change.
              </Typography>
            )}
            {proposalFeedback && (
              <Alert severity={proposalFeedback.severity}>
                {proposalFeedback.message}
              </Alert>
            )}
            <TextField
              label="New arrival date"
              type="date"
              value={proposalDate}
              onChange={(event) => setProposalDate(event.target.value)}
              InputLabelProps={{ shrink: true }}
              required
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2.5 }}>
          <Button onClick={handleCloseProposal} disabled={proposalSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmitProposal}
            variant="contained"
            color="secondary"
            disabled={proposalSubmitting}
          >
            {proposalSubmitting ? "Saving…" : "Save"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

