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
  Grid,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AssignmentTurnedInRoundedIcon from "@mui/icons-material/AssignmentTurnedInRounded";
import Inventory2RoundedIcon from "@mui/icons-material/Inventory2Rounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import API from "../api";
import RequestCard from "../components/RequestCard";
import CalendarOverview from "../components/CalendarOverview";
import PageHero from "../components/PageHero";
import StatCard from "../components/StatCard";

export default function ConfirmerDashboard() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState(null);
  const [proposalFeedback, setProposalFeedback] = useState(null);
  const [proposingRequest, setProposingRequest] = useState(null);
  const [proposalDate, setProposalDate] = useState("");
  const [proposalSubmitting, setProposalSubmitting] = useState(false);

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

  const handleDecision = async (id, status) => {
    setFeedback(null);
    try {
      await API.patch(`/imports/${id}`, { status });
      setFeedback({
        severity: "success",
        message: `Request ${status === "approved" ? "approved" : "rejected"}.`,
      });
    } catch (error) {
      setFeedback({
        severity: "error",
        message: "Updating the request failed. Please try again.",
      });
    } finally {
      loadRequests();
    }
  };

  const handleOpenProposal = (request) => {
    const defaultDate = (() => {
      if (!request.ArrivalDate) return "";
      const parsed = new Date(request.ArrivalDate);
      if (Number.isNaN(parsed.getTime())) {
        return "";
      }
      return parsed.toISOString().split("T")[0];
    })();

    setProposalFeedback(null);
    setProposingRequest(request);
    setProposalDate(defaultDate);
  };

  const handleCloseProposal = () => {
    setProposingRequest(null);
    setProposalDate("");
    setProposalFeedback(null);
  };

  const handleSubmitProposal = async () => {
    if (!proposingRequest) return;
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
      await API.patch(`/imports/${proposingRequest.ID}`, {
        arrivalDate: proposalDate,
      });
      setFeedback({
        severity: "success",
        message: `${proposingRequest.Requester ?? "The requester"} has been notified about the new arrival date.`,
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

  const pendingCount = requests.length;
  const averagePallets = useMemo(() => {
    if (pendingCount === 0) return "—";
    const total = requests.reduce((sum, request) => {
      const count = Number(request.PalletCount);
      return sum + (Number.isFinite(count) ? count : 0);
    }, 0);
    const average = total / pendingCount;
    if (!Number.isFinite(average) || average === 0) {
      return "—";
    }
    return `${Math.round(average)} pallets`;
  }, [pendingCount, requests]);

  const awaitingSchedule = useMemo(
    () => requests.filter((request) => !request.ArrivalDate).length,
    [requests]
  );

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
              Prioritize requests with upcoming arrivals and communicate any schedule
              changes promptly.
            </Typography>
          </Stack>
        </Paper>
      </PageHero>

      <Container sx={{ flexGrow: 1, py: { xs: 4, md: 6 } }} maxWidth="lg">
        <Stack spacing={4}>
          {feedback && <Alert severity={feedback.severity}>{feedback.message}</Alert>}

          <Grid container spacing={3}>
            <Grid item xs={12} md={4}>
              <StatCard
                icon={<AssignmentTurnedInRoundedIcon />}
                label="Pending decisions"
                value={loading ? "…" : pendingCount}
                trend="Approve or reject requests to keep freight moving"
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <StatCard
                icon={<Inventory2RoundedIcon />}
                label="Average load"
                value={loading ? "…" : averagePallets}
                trend="Helps plan capacity with logistics"
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
          ) : requests.length === 0 ? (
            <Paper elevation={4} sx={{ p: { xs: 4, md: 6 }, textAlign: "center" }}>
              <Typography variant="h6" gutterBottom>
                You're all caught up
              </Typography>
              <Typography variant="body2" color="text.secondary">
                There are no pending requests right now. You'll be notified when new
                submissions arrive.
              </Typography>
            </Paper>
          ) : (
            <Grid container spacing={3}>
              {requests.map((request) => (
                <Grid item xs={12} md={6} key={request.ID}>
                  <RequestCard
                    req={request}
                    onDecision={handleDecision}
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
        open={Boolean(proposingRequest)}
        onClose={proposalSubmitting ? undefined : handleCloseProposal}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Propose a new arrival date</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            {proposingRequest && (
              <Typography variant="body2" color="text.secondary">
                Update the arrival date for request #{proposingRequest.ID} from {" "}
                <Typography component="span" fontWeight={600} color="text.primary">
                  {proposingRequest.Importer}
                </Typography>
                . The requester will be notified once you confirm the change.
              </Typography>
            )}
            {proposalFeedback && (
              <Alert severity={proposalFeedback.severity}>{proposalFeedback.message}</Alert>
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
            disabled={proposalSubmitting}
          >
            {proposalSubmitting ? "Updating..." : "Confirm change"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
