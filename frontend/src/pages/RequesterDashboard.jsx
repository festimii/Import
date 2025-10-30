import { useMemo, useState } from "react";
import {
  Alert,
  AppBar,
  Box,
  Button,
  Chip,
  Container,
  Paper,
  Stack,
  TextField,
  Toolbar,
  Typography,
} from "@mui/material";
import API from "../api";

export default function RequesterDashboard() {
  const [description, setDescription] = useState("");
  const [items, setItems] = useState("");
  const [feedback, setFeedback] = useState(null);

  const selectedItems = useMemo(
    () =>
      items
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    [items]
  );

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFeedback(null);

    try {
      await API.post("/imports", { description, items: selectedItems });
      setFeedback({
        severity: "success",
        message: "Import request submitted successfully.",
      });
      setDescription("");
      setItems("");
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
              Create and track import requests for your team.
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
                Provide a short description and list the items you need imported.
              </Typography>
            </Stack>

            {feedback && (
              <Alert severity={feedback.severity}>{feedback.message}</Alert>
            )}

            <Box component="form" onSubmit={handleSubmit} noValidate>
              <Stack spacing={3}>
                <TextField
                  label="Description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="e.g. Electronics for Q2 rollout"
                  required
                  fullWidth
                />
                <TextField
                  label="Items"
                  value={items}
                  onChange={(event) => setItems(event.target.value)}
                  placeholder="Separate items with commas"
                  helperText="Example: monitors, docking stations, travel adapters"
                  required
                  fullWidth
                />

                {selectedItems.length > 0 && (
                  <Stack direction="row" flexWrap="wrap" gap={1}>
                    {selectedItems.map((item) => (
                      <Chip
                        key={item}
                        label={item}
                        color="secondary"
                        variant="outlined"
                      />
                    ))}
                  </Stack>
                )}

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
