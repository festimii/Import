import { useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Container,
  Link,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import API from "../api";

export default function Register() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [feedback, setFeedback] = useState(null);

  const handleRegister = async (event) => {
    event.preventDefault();

    if (password !== confirm) {
      setFeedback({
        severity: "error",
        message: "Passwords do not match. Please try again.",
      });
      return;
    }

    try {
      await API.post("/auth/register", { username, password });
      setFeedback({
        severity: "success",
        message: "Account created! Redirecting you to sign in...",
      });
      setTimeout(() => (window.location.href = "/"), 1500);
    } catch (error) {
      setFeedback({
        severity: "error",
        message: "Registration failed. That username may already be taken.",
      });
    }
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        py: { xs: 6, md: 10 },
        px: 2,
      }}
    >
      <Container maxWidth="sm">
        <Paper
          elevation={10}
          sx={{
            p: { xs: 4, md: 6 },
            backdropFilter: "blur(18px)",
            backgroundColor: (theme) => theme.palette.background.paper,
          }}
        >
          <Stack spacing={4}>
            <Stack spacing={1}>
              <Typography variant="h4" component="h1">
                Create your account
              </Typography>
              <Typography variant="body1" color="text.secondary">
                Set up access for managing and confirming import requests.
              </Typography>
            </Stack>

            {feedback && (
              <Alert severity={feedback.severity}>{feedback.message}</Alert>
            )}

            <Box component="form" onSubmit={handleRegister} noValidate>
              <Stack spacing={3}>
                <TextField
                  label="Username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoComplete="username"
                  required
                  fullWidth
                />
                <TextField
                  label="Password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  required
                  fullWidth
                />
                <TextField
                  label="Confirm password"
                  type="password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  autoComplete="new-password"
                  required
                  fullWidth
                />
                <Button type="submit" variant="contained" size="large">
                  Register
                </Button>
              </Stack>
            </Box>

            <Typography variant="body2" textAlign="center">
              Already have an account?{" "}
              <Link component={RouterLink} to="/" underline="hover">
                Sign in here
              </Link>
            </Typography>
          </Stack>
        </Paper>
      </Container>
    </Box>
  );
}
