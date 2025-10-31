import { useEffect, useState } from "react";
import {
  Alert,
  AppBar,
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
  Toolbar,
  Typography,
} from "@mui/material";
import API from "../api";
import RequestCard from "../components/RequestCard";
import CalendarOverview from "../components/CalendarOverview";

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
        message: `Arrival date updated. ${
          proposingRequest.Requester ?? "The requester"
        } has been notified.`,
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

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <AppBar position="static" color="transparent" elevation={0} sx={{ py: 1 }}>
        <Toolbar sx={{ display: "flex", justifyContent: "space-between" }}>
          <Box>
            <Typography variant="h5" fontWeight={600} color="text.primary">
              Confirmer workspace
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Review pending import requests and keep the process moving.
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
        <DialogActions>
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
