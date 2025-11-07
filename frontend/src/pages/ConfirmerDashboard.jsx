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
  Divider,
  Grid,
  List,
  ListItemButton,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import AssignmentTurnedInRoundedIcon from "@mui/icons-material/AssignmentTurnedInRounded";
import Inventory2RoundedIcon from "@mui/icons-material/Inventory2Rounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import API from "../api";
import RequestGroupCard from "../components/RequestGroupCard";
import CalendarOverview from "../components/CalendarOverview";
import PageHero from "../components/PageHero";
import StatCard from "../components/StatCard";
import NotificationPermissionBanner from "../components/NotificationPermissionBanner";
import formatArticleCode from "../utils/formatArticle";

export default function ConfirmerDashboard() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState(null);
  const [proposalFeedback, setProposalFeedback] = useState(null);
  const [proposingGroup, setProposingGroup] = useState(null);
  const [proposalDate, setProposalDate] = useState("");
  const [proposalSubmitting, setProposalSubmitting] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState(null);

  const loadRequests = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await API.get("/imports");
      setRequests(res.data);
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

  const pendingCount = groupedRequests.length;
  const averageLoad = useMemo(() => {
    if (pendingCount === 0) return "—";

    const totals = requests.reduce(
      (acc, request) => {
        const palletValue = Number(request.PalletCount);
        if (Number.isFinite(palletValue)) {
          acc.pallets += palletValue;
        }

        const boxValue = Number(request.BoxCount);
        if (Number.isFinite(boxValue)) {
          acc.boxes += boxValue;
        }

        return acc;
      },
      { pallets: 0, boxes: 0 }
    );

    const formatAverage = (value, unit) => {
      if (!Number.isFinite(value) || value <= 0) {
        return null;
      }
      const normalized = Math.round(value * 10) / 10;
      return `${normalized} ${unit}`;
    };

    const averages = [];
    const boxAverage = formatAverage(totals.boxes / pendingCount, "boxes");
    if (boxAverage) {
      averages.push(boxAverage);
    }

    const palletAverage = formatAverage(
      totals.pallets / pendingCount,
      "pallets"
    );
    if (palletAverage) {
      averages.push(palletAverage);
    }

    if (averages.length === 0) {
      return "—";
    }

    return averages.join(" • ");
  }, [pendingCount, requests]);

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
    <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <PageHero
        title="Confirmer workspace"
        subtitle="Review pending import requests, confirm arrivals and keep the calendar accurate for every stakeholder."
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
              Daily reminder
            </Typography>
            <Typography variant="body1">
              Prioritize requests with upcoming arrivals and communicate any
              schedule changes promptly.
            </Typography>
          </Stack>
        </Paper>
      </PageHero>

      <Container sx={{ flexGrow: 1, py: { xs: 4, md: 6 } }} maxWidth="lg">
        <Stack spacing={4}>
          <NotificationPermissionBanner />
          {feedback && (
            <Alert severity={feedback.severity}>{feedback.message}</Alert>
          )}

          <Grid container spacing={3}>
            <Grid item xs={12} md={4}>
              <StatCard
                icon={<AssignmentTurnedInRoundedIcon />}
                label="Pending decisions"
                value={loading ? "…" : pendingCount}
                trend="Approve or reject grouped requests to keep freight moving"
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <StatCard
                icon={<Inventory2RoundedIcon />}
                label="Average load"
                value={loading ? "…" : averageLoad}
                trend="Average boxes and pallets per pending bill"
                color="secondary"
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <StatCard
                icon={<ScheduleRoundedIcon />}
                label="Awaiting schedule"
                value={loading ? "…" : awaitingSchedule}
                trend="Propose a new arrival date when necessary"
                color="info"
              />
            </Grid>
          </Grid>

          {loading ? (
            <Paper
              elevation={0}
              sx={{
                p: 6,
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                backgroundColor: "transparent",
              }}
            >
              <CircularProgress color="primary" />
            </Paper>
          ) : groupedRequests.length === 0 ? (
            <Paper
              elevation={4}
              sx={{ p: { xs: 4, md: 6 }, textAlign: "center" }}
            >
              <Typography variant="h6" gutterBottom>
                You're all caught up
              </Typography>
              <Typography variant="body2" color="text.secondary">
                There are no pending request bills right now. You'll be notified
                when new submissions arrive.
              </Typography>
            </Paper>
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

          <CalendarOverview
            title="Confirmed arrivals calendar"
            description="Reference the shared calendar of approved arrivals before confirming new proposals."
          />
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
