import { useState } from "react";
import {
  Alert,
  AppBar,
  Box,
  Button,
  Container,
  Paper,
  Stack,
  TextField,
  Toolbar,
  Typography,
} from "@mui/material";
import API from "../api";

const today = () => new Date().toISOString().split("T")[0];

export default function RequesterDashboard() {
  const currentDate = today();
  const [importer, setImporter] = useState("");
  const [article, setArticle] = useState("");
  const [palletCount, setPalletCount] = useState("");
  const [feedback, setFeedback] = useState(null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFeedback(null);

    try {
      await API.post("/imports", {
        requestDate: currentDate,
        importer,
        article,
        palletCount: Number(palletCount),
      });
      setFeedback({
        severity: "success",
        message: "Import request submitted successfully.",
      });
      setImporter("");
      setArticle("");
      setPalletCount("");
    } catch (error) {
      setFeedback({
        severity: "error",
        message: "Something went wrong while creating the request.",
      });
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
              Requester workspace
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Register a new import request with all mandatory details.
            </Typography>
          </Box>
          <Button variant="contained" color="primary" onClick={logout}>
            Logout
          </Button>
        </Toolbar>
      </AppBar>

      <Container sx={{ flexGrow: 1, py: { xs: 4, md: 6 } }} maxWidth="md">
        <Paper elevation={8} sx={{ p: { xs: 4, md: 6 } }}>
          <Stack spacing={4}>
            <Stack spacing={1}>
              <Typography variant="h5">Create a new import request</Typography>
              <Typography variant="body2" color="text.secondary">
                Provide the request date, importer, article and pallet count to
                submit a complete record.
              </Typography>
            </Stack>

            {feedback && (
              <Alert severity={feedback.severity}>{feedback.message}</Alert>
            )}

            <Box component="form" onSubmit={handleSubmit} noValidate>
              <Stack spacing={3}>
                <TextField
                  label="Request date"
                  type="date"
                  value={currentDate}
                  disabled
                  InputLabelProps={{ shrink: true }}
                  helperText="Automatically set to today's date"
                  required
                  fullWidth
                />
                <TextField
                  label="Importer"
                  value={importer}
                  onChange={(event) => setImporter(event.target.value)}
                  placeholder="Importer name"
                  required
                  fullWidth
                />
                <TextField
                  label="Article"
                  value={article}
                  onChange={(event) => setArticle(event.target.value)}
                  placeholder="Describe the article"
                  required
                  fullWidth
                />
                <TextField
                  label="Number of pallets"
                  type="number"
                  value={palletCount}
                  onChange={(event) => setPalletCount(event.target.value)}
                  inputProps={{ min: 0 }}
                  required
                  fullWidth
                />

                <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                  <Button type="submit" variant="contained" size="large">
                    Submit request
                  </Button>
                </Box>
              </Stack>
            </Box>
          </Stack>
        </Paper>
      </Container>
    </Box>
  );
}
