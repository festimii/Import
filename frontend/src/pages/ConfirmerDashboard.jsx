import { useEffect, useState } from "react";
import {
  Alert,
  AppBar,
  Box,
  Button,
  CircularProgress,
  Container,
  Grid,
  Paper,
  Stack,
  Toolbar,
  Typography,
} from "@mui/material";
import API from "../api";
import RequestCard from "../components/RequestCard";

export default function ConfirmerDashboard() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState(null);

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
                  <RequestCard req={request} onDecision={handleDecision} />
                </Grid>
              ))}
            </Grid>
          )}
        </Stack>
      </Container>
    </Box>
  );
}
